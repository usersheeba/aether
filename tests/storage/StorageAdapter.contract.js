import assert from 'node:assert/strict';

/**
 * Register the persistence behavior that every storage adapter must preserve.
 * A future IndexedDB adapter can run this same suite by passing its factory.
 */
export function registerStorageAdapterContract(test, createAdapter, resetStorage) {
  const timestamp = '2026-01-02T03:04:05.000Z';
  const manifest = {
    id: 'project-1',
    title: 'Contract project',
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
        id: 'document-1',
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
    id: 'document-1',
    projectId: manifest.id,
    title: 'Chapter one',
    updatedAt: timestamp,
    wordCount: 2,
    charCount: 11,
    content: {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hello world' }] }],
    },
    plainText: 'hello world',
    notes: 'Keep this note',
    bookmarks: [],
    comments: [],
  };

  test('creates, reads, updates and removes projects and documents', async () => {
    resetStorage();
    const adapter = createAdapter();

    await adapter.createProject(manifest, { [document.id]: document });
    assertRecentProject(await adapter.getRecentProjects(), manifest.id);
    assert.equal((await adapter.loadProjectManifest(manifest.id)).title, manifest.title);
    assert.equal((await adapter.loadDocument(manifest.id, document.id)).plainText, 'hello world');

    const updated = { ...document, notes: 'Updated note' };
    await adapter.saveDocument(manifest.id, updated);
    assert.equal((await adapter.loadDocument(manifest.id, document.id)).notes, 'Updated note');

    await adapter.deleteDocument(manifest.id, document.id);
    assert.equal(await adapter.loadDocument(manifest.id, document.id), null);
    await adapter.deleteProject(manifest.id);
    assert.equal(await adapter.loadProjectManifest(manifest.id), null);
    assert.deepEqual(await adapter.getRecentProjects(), []);
  });

  test('updates shared page settings without touching binder nodes', async () => {
    resetStorage();
    const adapter = createAdapter();
    await adapter.createProject(manifest, { [document.id]: document });

    const pageView = {
      format: 'a4',
      orientation: 'landscape',
      margins: { topMm: 15, rightMm: 18, bottomMm: 15, leftMm: 18 },
      header: 'Aether',
      footer: 'Page {page} of {pages}',
    };
    await adapter.saveProjectSettings(
      manifest.id,
      { ...manifest.settings, pageView },
      timestamp
    );

    const loaded = await adapter.loadProjectManifest(manifest.id);
    assert.equal(loaded.settings.pageView.format, 'a4');
    assert.equal(loaded.settings.pageView.orientation, 'landscape');
    assert.equal(loaded.settings.pageView.header, 'Aether');
    assert.equal(loaded.settings.pageView.margins.rightMm, 18);
    assert.equal(loaded.tree.length, manifest.tree.length);
    assert.equal(loaded.tree[0].title, manifest.tree[0].title);
  });

  test('creates and restores snapshots without losing document metadata', async () => {
    resetStorage();
    const adapter = createAdapter();
    await adapter.createProject(manifest, { [document.id]: document });

    const snapshot = await adapter.createSnapshot(manifest.id, 'Before edits');
    await adapter.saveDocument(manifest.id, { ...document, plainText: 'changed text', notes: 'Changed note' });
    await adapter.restoreSnapshot(manifest.id, snapshot.id);

    const restored = await adapter.loadDocument(manifest.id, document.id);
    assert.equal(restored.plainText, 'hello world');
    assert.equal(restored.notes, 'Changed note');
    assert.equal((await adapter.listSnapshots(manifest.id))[0].id, snapshot.id);
  });

  test('exports only the requested project and its documents', async () => {
    resetStorage();
    const adapter = createAdapter();
    await adapter.createProject(manifest, { [document.id]: document });

    const otherManifest = { ...manifest, id: 'project-2', title: 'Another project' };
    const otherDocument = {
      ...document,
      id: 'document-2',
      projectId: otherManifest.id,
      title: 'Another chapter',
    };
    otherManifest.tree = [{ ...manifest.tree[0], id: otherDocument.id, title: otherDocument.title }];
    await adapter.createProject(otherManifest, { [otherDocument.id]: otherDocument });

    const bundle = JSON.parse(await adapter.exportProjectBundle(manifest.id));
    assert.equal(bundle.manifest.id, manifest.id);
    assert.deepEqual(Object.keys(bundle.documents), [document.id]);
  });

  test('exports and restores full backups without overwriting existing projects', async () => {
    resetStorage();
    const adapter = createAdapter();
    await adapter.createProject(manifest, { [document.id]: document });
    const snapshot = await adapter.createSnapshot(manifest.id, 'Backup snapshot');
    const backup = JSON.parse(await adapter.exportAllProjects());

    assert.equal(backup.format, 'aether_full_backup');
    assert.equal(backup.schemaVersion, 1);
    assert.equal(backup.projects.length, 1);
    assert.equal(backup.projects[0].snapshots[0].id, snapshot.id);

    const importedCount = await adapter.importAllProjects(JSON.stringify(backup));
    assert.equal(importedCount, 1);
    const recents = await adapter.getRecentProjects();
    assert.equal(recents.length, 2);
    const imported = recents.find((record) => record.id !== manifest.id);
    assert.ok(imported);
    assert.notEqual(imported.id, manifest.id);
    assert.equal((await adapter.loadDocument(imported.id, document.id)).plainText, document.plainText);
    assert.equal((await adapter.listSnapshots(imported.id))[0].label, 'Backup snapshot');
    assert.equal((await adapter.loadProjectManifest(manifest.id)).title, manifest.title);
  });

  test('estimates local key and value storage in UTF-16 bytes', async () => {
    resetStorage();
    const adapter = createAdapter();
    localStorage.setItem('test-key', 'abc');
    assert.equal(await adapter.estimateLocalStorageUsage(), ('test-key'.length + 'abc'.length) * 2);
  });
}

function assertRecentProject(records, projectId) {
  if (!records.some((record) => record.id === projectId)) {
    throw new Error(`Expected project ${projectId} to appear in recent projects.`);
  }
}
