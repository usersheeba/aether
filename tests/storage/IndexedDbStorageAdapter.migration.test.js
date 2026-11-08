import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { test } from 'node:test';
import * as Y from 'yjs';
import { prosemirrorJSONToYXmlFragment, yXmlFragmentToProseMirrorRootNode } from 'y-prosemirror';
import { getSchema } from '@tiptap/core';
import { IndexedDbStorageAdapter } from '../../src/storage/IndexedDbStorageAdapter.ts';
import { createEditorExtensions } from '../../src/editor/editorExtensions.ts';
import { LocalStorageAdapter } from '../../src/storage/LocalStorageAdapter.ts';
import { confirmMigrationBackupSavedOutsideBrowser } from '../../src/storage/MigrationBackupConfirmation.ts';
import { StorageBootstrapper } from '../../src/storage/StorageBootstrapper.ts';
import { compareBinderOrder, normalizeBinderOrder, orderKeyAt } from '../../src/utils/binderOrder.ts';
import { createProjectFromTemplate } from '../../src/utils/templates.ts';

const timestamp = '2026-01-02T03:04:05.000Z';

function createBackup() {
  const projectId = 'migration-test-project';
  const documentId = 'migration-test-document';
  const manifest = {
    id: projectId,
    title: 'Migration test',
    author: 'Test author',
    version: '1.0.0',
    createdAt: timestamp,
    updatedAt: timestamp,
    settings: {
      targetWordCount: 1000,
      pageView: { widthPx: 816, minHeightPx: 1056, paddingPx: 64 },
    },
    tree: [
      {
        id: documentId,
        parentId: null,
        type: 'document',
        title: 'Chapter one',
        sortOrder: 0,
        wordCount: 2,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ],
  };
  const document = {
    id: documentId,
    projectId,
    title: 'Chapter one',
    updatedAt: timestamp,
    wordCount: 2,
    charCount: 11,
    content: {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hello world' }] }],
    },
    plainText: 'hello world',
    notes: '',
    bookmarks: [],
    comments: [],
  };

  return {
    format: 'aether_full_backup',
    schemaVersion: 1,
    exportedAt: timestamp,
    recentProjects: [
      {
        id: projectId,
        title: manifest.title,
        author: manifest.author,
        updatedAt: timestamp,
        lastOpenedAt: timestamp,
        pinned: false,
        totalWords: 2,
        documentCount: 1,
        storageKey: projectId,
      },
    ],
    projects: [{ manifest, documents: { [documentId]: document }, snapshots: [] }],
  };
}

class MemoryStorage {
  values = new Map();

  get length() {
    return this.values.size;
  }

  clear() {
    this.values.clear();
  }

  getItem(key) {
    return this.values.get(String(key)) ?? null;
  }

  key(index) {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key) {
    this.values.delete(String(key));
  }

  setItem(key, value) {
    this.values.set(String(key), String(value));
  }
}

globalThis.localStorage = new MemoryStorage();

test('assigns fractional binder keys and deterministically orders concurrent inserts', () => {
  const legacyTree = [
    { id: 'later', parentId: null, sortOrder: 2 },
    { id: 'first', parentId: null, sortOrder: 0 },
    { id: 'middle', parentId: null, sortOrder: 1 },
  ];
  const normalized = normalizeBinderOrder(legacyTree);
  const ordered = [...normalized].sort(compareBinderOrder);
  assert.deepEqual(ordered.map((node) => node.id), ['first', 'middle', 'later']);
  assert.ok(ordered.every((node) => typeof node.orderKey === 'string'));

  const concurrentKey = orderKeyAt(normalized, null, 1);
  const concurrentInsertions = [
    { ...normalized[0], id: 'insert-b', orderKey: concurrentKey, sortOrder: 1 },
    { ...normalized[0], id: 'insert-a', orderKey: concurrentKey, sortOrder: 1 },
  ];
  const mergedOrder = [...normalized, ...concurrentInsertions].sort(compareBinderOrder);
  assert.deepEqual(mergedOrder.map((node) => node.id), [
    'first',
    'insert-a',
    'insert-b',
    'middle',
    'later',
  ]);
  assert.doesNotThrow(() => orderKeyAt(mergedOrder, null, 2));
});

test('gates migration on a backup, migrates Yjs data, and retries without duplicates', async () => {
  globalThis.localStorage.clear();
  for (const name of [
    'aether-writer',
    'aether-project:migration-test-project',
    'aether-doc:migration-test-document',
  ]) {
    await new Promise((resolve, reject) => {
      const request = indexedDB.deleteDatabase(name);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error(`Could not reset ${name}.`));
    });
  }

  const project = createBackup().projects[0];
  await new LocalStorageAdapter().createProject(project.manifest, project.documents);
  await new LocalStorageAdapter().createSnapshot(project.manifest.id, 'Before migration');
  const portableBackup = JSON.parse(await new LocalStorageAdapter().exportAllProjects());
  const snapshotSchema = getSchema(createEditorExtensions());
  const portableSnapshotDoc = new Y.Doc();
  prosemirrorJSONToYXmlFragment(
    snapshotSchema,
    project.documents['migration-test-document'].content,
    portableSnapshotDoc.getXmlFragment('default')
  );
  const serializedYjsState = JSON.parse(JSON.stringify(Y.encodeStateAsUpdate(portableSnapshotDoc)));
  portableSnapshotDoc.destroy();
  portableBackup.projects[0].snapshots[0].documents['migration-test-document'].yjsState = serializedYjsState;
  const legacyBackup = JSON.stringify(portableBackup);

  const beforeConfirmation = new StorageBootstrapper();
  assert.equal((await beforeConfirmation.getRecentProjects()).length, 1);
  assert.match(beforeConfirmation.getStartupWarning(), /Export a full backup/);
  assert.equal(await new IndexedDbStorageAdapter().isMigrated(), false);

  confirmMigrationBackupSavedOutsideBrowser();
  const afterConfirmation = new StorageBootstrapper();
  assert.equal((await afterConfirmation.getRecentProjects()).length, 1);
  assert.equal(afterConfirmation.getStartupWarning(), null);
  const adapter = new IndexedDbStorageAdapter();
  assert.equal(await adapter.isMigrated(), true);
  assert.equal((await adapter.loadProjectManifest('migration-test-project')).title, 'Migration test');
  assert.equal(
    (await adapter.loadDocument('migration-test-project', 'migration-test-document')).plainText,
    'hello world'
  );

  await adapter.migrateFromLegacy(JSON.parse(legacyBackup));
  const importedSnapshot = (await adapter.listSnapshots('migration-test-project'))[0];
  assert.ok(importedSnapshot.documents['migration-test-document'].yjsState instanceof Uint8Array);
  const importedSnapshotDoc = new Y.Doc();
  Y.applyUpdate(importedSnapshotDoc, importedSnapshot.documents['migration-test-document'].yjsState);
  assert.equal(
    yXmlFragmentToProseMirrorRootNode(importedSnapshotDoc.getXmlFragment('default'), snapshotSchema).textContent,
    'hello world'
  );
  importedSnapshotDoc.destroy();
  const restored = JSON.parse(await adapter.exportAllProjects());
  assert.equal(restored.projects.length, 1);
  assert.equal(restored.projects[0].snapshots.length, 1);
  assert.equal(Object.keys(restored.projects[0].documents).length, 1);
  assert.equal(restored.projects[0].documents['migration-test-document'].plainText, 'hello world');

  const createdProject = createBackup().projects[0];
  createdProject.manifest.id = 'created-after-migration-project';
  createdProject.manifest.tree = createdProject.manifest.tree.map((node) => ({
    ...node,
    id: 'created-after-migration-document',
  }));
  const createdDocument = Object.values(createdProject.documents)[0];
  createdDocument.id = 'created-after-migration-document';
  createdDocument.projectId = createdProject.manifest.id;
  await adapter.createProject(createdProject.manifest, {
    [createdDocument.id]: createdDocument,
  });
  const liveDocument = await adapter.openCollaborativeDocument(
    createdProject.manifest.id,
    createdDocument.id
  );
  const replacementContent = {
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text: 'updated manuscript now' }] }],
  };
  const schema = getSchema(createEditorExtensions());
  const yDocument = new Y.Doc();
  const collaborativeExtensions = createEditorExtensions({ collaborationDocument: yDocument });
  const starterKit = collaborativeExtensions.find((extension) => extension.name === 'starterKit');
  const collaboration = collaborativeExtensions.find((extension) => extension.name === 'collaboration');
  assert.equal(starterKit.options.undoRedo, false);
  assert.equal(collaboration.options.document, yDocument);
  assert.equal(collaboration.options.field, 'default');
  yDocument.destroy();
  const fragment = liveDocument.document.getXmlFragment('default');
  liveDocument.document.transact(() => {
    if (fragment.length > 0) fragment.delete(0, fragment.length);
    prosemirrorJSONToYXmlFragment(schema, replacementContent, fragment);
  });
  await liveDocument.release();
  await adapter.saveDocument(createdProject.manifest.id, {
    ...createdDocument,
    content: replacementContent,
    plainText: 'updated manuscript now',
    wordCount: 3,
    charCount: 'updated manuscript now'.length,
  });
  assert.equal(
    (await adapter.loadDocument(createdProject.manifest.id, createdDocument.id)).plainText,
    'updated manuscript now'
  );
  const liveSnapshot = await adapter.createSnapshot(
    createdProject.manifest.id,
    'Before restoring into an open editor'
  );
  const savedYjsState = liveSnapshot.documents[createdDocument.id].yjsState;
  assert.ok(savedYjsState instanceof Uint8Array);
  const snapshotYDoc = new Y.Doc();
  Y.applyUpdate(snapshotYDoc, savedYjsState);
  assert.equal(
    yXmlFragmentToProseMirrorRootNode(snapshotYDoc.getXmlFragment('default'), schema).textContent,
    'updated manuscript now'
  );
  snapshotYDoc.destroy();

  const openForRestore = await adapter.openCollaborativeDocument(
    createdProject.manifest.id,
    createdDocument.id
  );
  openForRestore.document.transact(() => {
    const activeFragment = openForRestore.document.getXmlFragment('default');
    activeFragment.delete(0, activeFragment.length);
    prosemirrorJSONToYXmlFragment(
      schema,
      {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'temporary edit' }] }],
      },
      activeFragment
    );
  });
  await adapter.restoreSnapshot(createdProject.manifest.id, liveSnapshot.id);
  assert.equal(
    yXmlFragmentToProseMirrorRootNode(openForRestore.document.getXmlFragment('default'), schema).textContent,
    'updated manuscript now'
  );
  await openForRestore.release();
  const database = await new Promise((resolve, reject) => {
    const request = indexedDB.open('aether-writer', 1);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  const persistedYjsDatabase = await new Promise((resolve, reject) => {
    const request = indexedDB.open(
      `aether-doc:${createdProject.manifest.id}:${createdDocument.id}`
    );
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  assert.ok(persistedYjsDatabase.objectStoreNames.contains('updates'));
  const projectRecord = await new Promise((resolve, reject) => {
    const request = database
      .transaction('yjsProjects', 'readonly')
      .objectStore('yjsProjects')
      .get(`project:${createdProject.manifest.id}`);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  const projectDoc = new Y.Doc();
  Y.applyUpdate(projectDoc, projectRecord.value.value);
  assert.equal(
    JSON.parse(projectDoc.getMap('tree').get('created-after-migration-document')).wordCount,
    3
  );
  projectDoc.destroy();
  database.close();
  persistedYjsDatabase.close();

  assert.equal(typeof BroadcastChannel, 'function');
  const secondAdapter = new IndexedDbStorageAdapter();
  const firstTab = await adapter.openCollaborativeDocument(
    createdProject.manifest.id,
    createdDocument.id
  );
  const secondTab = await secondAdapter.openCollaborativeDocument(
    createdProject.manifest.id,
    createdDocument.id
  );
  await new Promise((resolve) => setTimeout(resolve, 25));
  firstTab.document.transact(() => {
    const sharedFragment = firstTab.document.getXmlFragment('default');
    if (sharedFragment.length > 0) sharedFragment.delete(0, sharedFragment.length);
    prosemirrorJSONToYXmlFragment(
      schema,
      {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'synced between tabs' }] }],
      },
      sharedFragment
    );
  });
  const crossTabText = await Promise.race([
    new Promise((resolve) => {
      const interval = setInterval(() => {
        const content = yXmlFragmentToProseMirrorRootNode(
          secondTab.document.getXmlFragment('default'),
          schema
        ).textContent;
        if (content === 'synced between tabs') {
          clearInterval(interval);
          resolve(content);
        }
      }, 10);
    }),
    new Promise((_, reject) => setTimeout(() => reject(new Error('Yjs update did not reach the other tab.')), 1000)),
  ]);
  assert.equal(crossTabText, 'synced between tabs');
  await Promise.all([firstTab.release(), secondTab.release()]);

  const projectChannel = new BroadcastChannel(
    `aether-project:${encodeURIComponent(createdProject.manifest.id)}`
  );
  const projectUpdateReceived = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Project structure update did not reach the other tab.')), 1000);
    projectChannel.onmessage = (event) => {
      if (event.data !== 'project-update') return;
      clearTimeout(timer);
      resolve();
    };
  });
  const projectManifest = await adapter.loadProjectManifest(createdProject.manifest.id);
  assert.ok(projectManifest);
  await adapter.saveProjectManifest({ ...projectManifest, title: 'Updated from another tab' });
  await projectUpdateReceived;
  projectChannel.close();
  assert.equal(
    (await secondAdapter.loadProjectManifest(createdProject.manifest.id))?.title,
    'Updated from another tab'
  );

  const settingsBase = await adapter.loadProjectManifest(createdProject.manifest.id);
  const sharedPageView = {
    format: 'a4',
    orientation: 'landscape',
    margins: { topMm: 15, rightMm: 18, bottomMm: 15, leftMm: 18 },
    header: 'Shared header',
    footer: 'Page {page} of {pages}',
  };
  await adapter.saveProjectSettings(
    createdProject.manifest.id,
    { ...settingsBase.settings, pageView: sharedPageView },
    '2026-01-02T03:04:06.500Z'
  );
  const settingsAfterUpdate = await adapter.loadProjectManifest(createdProject.manifest.id);
  assert.equal(settingsAfterUpdate.settings.pageView.format, 'a4');
  assert.equal(settingsAfterUpdate.settings.pageView.orientation, 'landscape');
  assert.equal(settingsAfterUpdate.settings.pageView.header, 'Shared header');
  assert.equal(settingsAfterUpdate.settings.pageView.margins.rightMm, 18);
  assert.equal(settingsAfterUpdate.tree.length, settingsBase.tree.length);

  const projectAfterRename = await adapter.loadProjectManifest(createdProject.manifest.id);
  const concurrentBase = normalizeBinderOrder([
    ...projectAfterRename.tree,
    ...['order-a', 'order-b', 'order-c'].map((id, index) => ({
        id,
        parentId: null,
        type: 'folder',
        title: id,
        sortOrder: index + 1,
        createdAt: timestamp,
        updatedAt: timestamp,
      })),
  ]);
  const concurrentManifest = { ...projectAfterRename, tree: concurrentBase };
  await adapter.saveProjectManifest(concurrentManifest);
  const staleFirstTab = await adapter.loadProjectManifest(createdProject.manifest.id);
  const staleSecondTab = await secondAdapter.loadProjectManifest(createdProject.manifest.id);
  const movedFirstTree = normalizeBinderOrder(staleFirstTab.tree);
  const movedSecondTree = normalizeBinderOrder(staleSecondTab.tree);
  const firstConcurrentKey = orderKeyAt(movedFirstTree, null, 1);
  const secondConcurrentKey = orderKeyAt(movedSecondTree, null, 1);
  assert.equal(firstConcurrentKey, secondConcurrentKey);
  const moveChannel = new BroadcastChannel(
    `aether-project:${encodeURIComponent(createdProject.manifest.id)}`
  );
  const moveNotificationsReceived = new Promise((resolve, reject) => {
    let received = 0;
    const timer = setTimeout(() => reject(new Error('Concurrent moves did not notify both open tabs.')), 1000);
    moveChannel.onmessage = (event) => {
      if (event.data !== 'project-update') return;
      received += 1;
      if (received === 2) {
        clearTimeout(timer);
        resolve();
      }
    };
  });
  await Promise.all([
    adapter.moveBinderNode(
      createdProject.manifest.id,
      'order-b',
      null,
      firstConcurrentKey,
      1,
      '2026-01-02T03:04:06.000Z'
    ),
    secondAdapter.moveBinderNode(
      createdProject.manifest.id,
      'order-c',
      null,
      secondConcurrentKey,
      1,
      '2026-01-02T03:04:07.000Z'
    ),
  ]);
  await moveNotificationsReceived;
  moveChannel.close();
  const mergedManifest = await adapter.loadProjectManifest(createdProject.manifest.id);
  const mergedOrder = mergedManifest.tree
    .filter((node) => node.parentId === null)
    .sort(compareBinderOrder)
    .map((node) => node.id);
  assert.deepEqual(mergedOrder, [
    'created-after-migration-document',
    ...['order-b', 'order-c'].sort(),
    'order-a',
  ]);
  assert.deepEqual(
    (await secondAdapter.loadProjectManifest(createdProject.manifest.id))
      .tree.filter((node) => node.parentId === null)
      .sort(compareBinderOrder)
      .map((node) => node.id),
    mergedOrder
  );
  await Promise.all([
    adapter.saveBinderChanges(
      createdProject.manifest.id,
      [],
      [{ id: 'order-b', changes: { title: 'Renamed in first tab' } }],
      [],
      '2026-01-02T03:04:08.000Z'
    ),
    secondAdapter.saveBinderChanges(
      createdProject.manifest.id,
      [],
      [{ id: 'order-c', changes: { synopsis: 'Updated in second tab' } }],
      [],
      '2026-01-02T03:04:09.000Z'
    ),
  ]);
  const mergedUpdates = await adapter.loadProjectManifest(createdProject.manifest.id);
  assert.equal(mergedUpdates.tree.find((node) => node.id === 'order-b').title, 'Renamed in first tab');
  assert.equal(mergedUpdates.tree.find((node) => node.id === 'order-c').synopsis, 'Updated in second tab');

  const deletingTab = await adapter.openCollaborativeDocument(
    createdProject.manifest.id,
    createdDocument.id
  );
  await adapter.deleteDocument(createdProject.manifest.id, createdDocument.id);
  await assert.rejects(
    adapter.openCollaborativeDocument(createdProject.manifest.id, createdDocument.id),
    /it has been deleted/
  );
  deletingTab.document.transact(() => {
    const deletedFragment = deletingTab.document.getXmlFragment('default');
    deletedFragment.delete(0, deletedFragment.length);
    prosemirrorJSONToYXmlFragment(
      schema,
      {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'deleted content' }] }],
      },
      deletedFragment
    );
  });
  await deletingTab.release();
  assert.equal(await adapter.loadDocument(createdProject.manifest.id, createdDocument.id), null);
  const deletedDatabase = await new Promise((resolve, reject) => {
    const request = indexedDB.open(
      `aether-doc:${createdProject.manifest.id}:${createdDocument.id}`
    );
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  const remainingUpdates = deletedDatabase.objectStoreNames.contains('updates')
    ? await new Promise((resolve, reject) => {
        const request = deletedDatabase.transaction('updates', 'readonly').objectStore('updates').count();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      })
    : 0;
  assert.equal(remainingUpdates, 0);
  deletedDatabase.close();

  const schemaDatabase = await new Promise((resolve, reject) => {
    const request = indexedDB.open('aether-writer', 1);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  const projectState = await new Promise((resolve, reject) => {
    const request = schemaDatabase
      .transaction('yjsProjects', 'readonly')
      .objectStore('yjsProjects')
      .get(`project:${createdProject.manifest.id}`);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  const futureProject = new Y.Doc();
  Y.applyUpdate(futureProject, projectState.value.value);
  futureProject.getMap('project').set('schemaVersion', 2);
  const futureUpdate = Y.encodeStateAsUpdate(futureProject);
  futureProject.destroy();
  await new Promise((resolve, reject) => {
    const transaction = schemaDatabase.transaction('yjsProjects', 'readwrite');
    transaction.objectStore('yjsProjects').put({
      key: `project:${createdProject.manifest.id}`,
      value: { projectId: createdProject.manifest.id, value: futureUpdate },
    });
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
  schemaDatabase.close();
  assert.equal(await adapter.isProjectReadOnly(createdProject.manifest.id), true);
  const futureManifest = await adapter.loadProjectManifest(createdProject.manifest.id);
  assert.equal(futureManifest.title, 'Updated from another tab');
  assert.equal(
    JSON.parse(await adapter.exportProjectBundle(createdProject.manifest.id)).manifest.title,
    'Updated from another tab'
  );
  await assert.rejects(
    adapter.openCollaborativeDocument(createdProject.manifest.id, createdDocument.id),
    /newer schema and is read-only/
  );
  await assert.rejects(adapter.saveProjectManifest(futureManifest), /newer schema and is read-only/);
  await assert.rejects(
    adapter.saveDocument(createdProject.manifest.id, createdDocument),
    /newer schema and is read-only/
  );
});

test('isolates same-ID documents across different projects', async () => {
  const adapter = new IndexedDbStorageAdapter();
  const documentId = 'shared-template-document';
  const projects = [
    { id: 'same-document-project-a', text: 'first project text' },
    { id: 'same-document-project-b', text: 'second project text' },
  ];

  for (const project of projects) {
    const source = createBackup().projects[0];
    const document = {
      ...Object.values(source.documents)[0],
      id: documentId,
      projectId: project.id,
      title: 'Chapter 1',
      plainText: project.text,
      content: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: project.text }] }],
      },
    };
    const manifest = {
      ...source.manifest,
      id: project.id,
      title: project.id,
      tree: source.manifest.tree.map((node) => ({ ...node, id: documentId, title: document.title })),
    };
    await adapter.createProject(manifest, { [documentId]: document });
  }

  const first = await adapter.openCollaborativeDocument(projects[0].id, documentId);
  const second = await adapter.openCollaborativeDocument(projects[1].id, documentId);
  const schema = getSchema(createEditorExtensions());
  const readText = (document) =>
    yXmlFragmentToProseMirrorRootNode(document.getXmlFragment('default'), schema).textContent;
  assert.equal(readText(first.document), projects[0].text);
  assert.equal(readText(second.document), projects[1].text);

  first.document.transact(() => {
    const fragment = first.document.getXmlFragment('default');
    fragment.delete(0, fragment.length);
    prosemirrorJSONToYXmlFragment(
      schema,
      {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'updated first project' }] }],
      },
      fragment
    );
  });
  await new Promise((resolve) => setTimeout(resolve, 25));
  assert.equal(readText(second.document), projects[1].text);
  await first.release();
  await second.release();

  const firstTemplate = createProjectFromTemplate('blank_novel', 'First blank', 'Test author', 1000);
  const secondTemplate = createProjectFromTemplate('blank_novel', 'Second blank', 'Test author', 1000);
  assert.notEqual(
    Object.values(firstTemplate.documents)[0].id,
    Object.values(secondTemplate.documents)[0].id
  );
});
