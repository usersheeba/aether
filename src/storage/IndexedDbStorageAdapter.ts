/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { getSchema } from '@tiptap/core';
import type { Schema } from '@tiptap/pm/model';
import * as Y from 'yjs';
import { clearDocument, IndexeddbPersistence, storeState } from 'y-indexeddb';
import {
  prosemirrorJSONToYXmlFragment,
  yXmlFragmentToProseMirrorRootNode,
} from 'y-prosemirror';
import type { ApplicationBackup } from './LocalStorageAdapter.ts';
import { isApplicationBackup, LocalStorageAdapter } from './LocalStorageAdapter.ts';
import type { StorageAdapter } from './StorageAdapter.ts';
import type { CollaborativeDocumentHandle } from './CollaborativeDocument';
import type {
  BinderNode,
  DocumentData,
  DocumentSnapshot,
  ProjectManifest,
  ProjectSettings,
  ProjectSnapshot,
  RecentProjectRecord,
} from '../types/project';
import { countWords } from '../utils/text.ts';
import { normalizeBinderOrder } from '../utils/binderOrder.ts';
import { normalizeProjectSettings } from '../utils/pageLayout.ts';

const DATABASE_NAME = 'aether-writer';
const DATABASE_VERSION = 1;
const MIGRATION_KEY = 'migratedFromLocalStorage:v1';
const PROJECT_SCHEMA_VERSION = 1;
const DATA_STORES = ['meta', 'projects', 'documents', 'snapshots', 'recents', 'yjsDocuments', 'yjsProjects'];
const MAX_SNAPSHOTS_PER_PROJECT = 20;

interface StoredRecord<T> {
  key: string;
  value: T;
}

interface StoredDocument {
  projectId: string;
  value: DocumentData;
}

interface StoredSnapshot {
  projectId: string;
  value: ProjectSnapshot;
}

interface StoredYjsState {
  projectId: string;
  value: Uint8Array;
}

type StoredYjsProject = StoredYjsState;

interface OpenYDocument {
  document: Y.Doc;
  persistence: IndexeddbPersistence;
  channel: BroadcastChannel | null;
  refs: number;
  deleted: boolean;
  ready: Promise<void>;
  handle: (update: Uint8Array, origin: unknown) => void;
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed.'));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed.'));
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction was aborted.'));
  });
}

function sumWords(tree: BinderNode[]): number {
  return tree.reduce((total, node) => total + (node.wordCount ?? 0), 0);
}

function countDocuments(tree: BinderNode[]): number {
  return tree.filter((node) => node.type !== 'folder').length;
}

function yjsDocumentKey(projectId: string, documentId: string): string {
  return `doc:${projectId}:${documentId}`;
}

function yjsDocumentDatabaseName(projectId: string, documentId: string): string {
  return `aether-doc:${projectId}:${documentId}`;
}

function recordFor(manifest: ProjectManifest, previous?: RecentProjectRecord): RecentProjectRecord {
  return {
    id: manifest.id,
    title: manifest.title,
    author: manifest.author,
    updatedAt: manifest.updatedAt,
    lastOpenedAt: previous?.lastOpenedAt ?? new Date().toISOString(),
    pinned: previous?.pinned ?? false,
    totalWords: sumWords(manifest.tree),
    documentCount: countDocuments(manifest.tree),
    storageKey: manifest.id,
  };
}

function getDocumentContent(document: Pick<DocumentData, 'content' | 'plainText'>): Record<string, unknown> {
  if (document.content) return document.content as Record<string, unknown>;
  return {
    type: 'doc',
    content: document.plainText.split(/\n{2,}/).map((text) =>
      text
        ? { type: 'paragraph', content: [{ type: 'text', text }] }
        : { type: 'paragraph' }
    ),
  };
}

function decodeYjsState(value: unknown): Uint8Array {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (Array.isArray(value) && value.every((byte) => Number.isInteger(byte) && byte >= 0 && byte <= 255)) {
    return Uint8Array.from(value);
  }
  if (typeof value === 'object' && value !== null) {
    const entries = Object.entries(value).sort(([a], [b]) => Number(a) - Number(b));
    if (
      entries.length > 0 &&
      entries.every(
        ([key, byte], index) =>
          /^\d+$/.test(key) &&
          Number(key) === index &&
          Number.isInteger(byte) &&
          Number(byte) >= 0 &&
          Number(byte) <= 255
      )
    ) {
      return Uint8Array.from(entries.map(([, byte]) => Number(byte)));
    }
  }
  throw new Error('The snapshot contains an invalid Yjs document state.');
}

function normalizeSnapshot(snapshot: ProjectSnapshot): ProjectSnapshot {
  return {
    ...snapshot,
    documents: Object.fromEntries(
      Object.entries(snapshot.documents).map(([id, document]) => [
        id,
        document.yjsState === undefined ? document : { ...document, yjsState: decodeYjsState(document.yjsState) },
      ])
    ),
  };
}

function countProseMirrorNodes(node: ReturnType<Schema['nodeFromJSON']>): number {
  let count = 0;
  node.descendants(() => {
    count += 1;
  });
  return count;
}

function verifyYDocument(
  yDoc: Y.Doc,
  schema: Schema,
  content: Record<string, unknown>,
  projectTitle: string,
  documentTitle: string
): void {
  const expected = schema.nodeFromJSON(content);
  const actual = yXmlFragmentToProseMirrorRootNode(yDoc.getXmlFragment('default'), schema);
  const expectedNodeCount = countProseMirrorNodes(expected);
  const actualNodeCount = countProseMirrorNodes(actual);
  if (actual.textContent !== expected.textContent || actualNodeCount !== expectedNodeCount) {
    throw new Error(
      `Migration verification failed for "${projectTitle}" / "${documentTitle}": ` +
        `text or node count differs (expected ${expectedNodeCount}, got ${actualNodeCount}).`
    );
  }
}

export class IndexedDbStorageAdapter implements StorageAdapter {
  private databasePromise: Promise<IDBDatabase> | null = null;
  private readonly legacyStorage = new LocalStorageAdapter();
  private readonly yjsQueues = new Map<string, Promise<void>>();
  private readonly openYDocuments = new Map<string, OpenYDocument>();

  private enqueueYjsOperation<T>(key: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.yjsQueues.get(key) ?? Promise.resolve();
    const result = previous.then(operation);
    this.yjsQueues.set(key, result.then(() => undefined, () => undefined));
    return result;
  }

  private openDatabase(): Promise<IDBDatabase> {
    if (this.databasePromise) return this.databasePromise;
    this.databasePromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
      request.onupgradeneeded = () => {
        const database = request.result;
        for (const store of DATA_STORES) {
          if (!database.objectStoreNames.contains(store)) {
            database.createObjectStore(store, { keyPath: 'key' });
          }
        }
      };
      request.onsuccess = () => {
        request.result.onversionchange = () => request.result.close();
        resolve(request.result);
      };
      request.onerror = () => {
        this.databasePromise = null;
        reject(request.error ?? new Error('Could not open the Aether IndexedDB database.'));
      };
      request.onblocked = () => {
        this.databasePromise = null;
        reject(new Error('Opening the Aether IndexedDB database was blocked by another tab.'));
      };
    });
    return this.databasePromise;
  }

  private async getRecord<T>(storeName: string, key: string): Promise<T | null> {
    const database = await this.openDatabase();
    const transaction = database.transaction(storeName, 'readonly');
    const done = transactionDone(transaction);
    const stored = await requestResult(transaction.objectStore(storeName).get(key) as IDBRequest<StoredRecord<T> | undefined>);
    await done;
    return stored?.value ?? null;
  }

  private async getAllRecords<T>(storeName: string): Promise<Array<{ key: string; value: T }>> {
    const database = await this.openDatabase();
    const transaction = database.transaction(storeName, 'readonly');
    const done = transactionDone(transaction);
    const stored = await requestResult(
      transaction.objectStore(storeName).getAll() as IDBRequest<Array<StoredRecord<T>>>
    );
    await done;
    return stored;
  }

  private async putRecord<T>(storeName: string, key: string, value: T): Promise<void> {
    const database = await this.openDatabase();
    const transaction = database.transaction(storeName, 'readwrite');
    const done = transactionDone(transaction);
    transaction.objectStore(storeName).put({ key, value } satisfies StoredRecord<T>);
    await done;
  }

  private async deleteRecord(storeName: string, key: string): Promise<void> {
    const database = await this.openDatabase();
    const transaction = database.transaction(storeName, 'readwrite');
    const done = transactionDone(transaction);
    transaction.objectStore(storeName).delete(key);
    await done;
  }

  private async getManifest(projectId: string): Promise<ProjectManifest | null> {
    const manifest = await this.getRecord<ProjectManifest>('projects', `project:${projectId}`);
    if (!manifest) return null;
    return { ...manifest, settings: normalizeProjectSettings(manifest.settings ?? {}) };
  }

  private async getDocument(projectId: string, documentId: string): Promise<DocumentData | null> {
    const stored = await this.getRecord<StoredDocument>('documents', `document:${projectId}:${documentId}`);
    return stored?.value ?? null;
  }

  private async assertProjectWritable(projectId: string): Promise<void> {
    if (await this.isProjectReadOnly(projectId)) {
      throw new Error(`Project ${projectId} uses a newer schema and is read-only in this version.`);
    }
  }

  async openCollaborativeDocument(
    projectId: string,
    documentId: string
  ): Promise<CollaborativeDocumentHandle> {
    await this.assertProjectWritable(projectId);
    const resourceKey = `${projectId}:${documentId}`;
    let resource = this.openYDocuments.get(resourceKey);
    if (resource?.deleted) {
      throw new Error(`Could not open document ${documentId}: it has been deleted.`);
    }
    if (!resource) {
      const document = new Y.Doc();
      const persistence = new IndexeddbPersistence(yjsDocumentDatabaseName(projectId, documentId), document);
      const channel =
        typeof BroadcastChannel === 'undefined'
          ? null
          : new BroadcastChannel(`aether-yjs:${encodeURIComponent(resourceKey)}`);
      const created: OpenYDocument = {
        document,
        persistence,
        channel,
        refs: 0,
        deleted: false,
        ready: Promise.resolve(),
        handle: () => undefined,
      };
      created.handle = (update, origin) => {
        if (origin !== channel) channel?.postMessage({ type: 'update', update });
      };
      created.ready = (async () => {
        await persistence.whenSynced;
        const stored = await this.getDocument(projectId, documentId);
        if (!stored) throw new Error(`Could not open document ${documentId}: its content is missing.`);
        const fragment = document.getXmlFragment('default');
        if (fragment.length === 0) {
          const scopedState = await this.getRecord<StoredYjsState>(
            'yjsDocuments',
            yjsDocumentKey(projectId, documentId)
          );
          const legacyState = scopedState
            ? null
            : await this.getRecord<StoredYjsState>('yjsDocuments', `doc:${documentId}`);
          const stateToRestore =
            scopedState?.projectId === projectId
              ? scopedState
              : legacyState?.projectId === projectId
                ? legacyState
                : null;
          let restoredState = false;
          if (stateToRestore) {
            const { createEditorExtensions } = await import('../editor/editorExtensions.ts');
            const schema = getSchema(createEditorExtensions());
            const verificationDoc = new Y.Doc();
            try {
              Y.applyUpdate(verificationDoc, stateToRestore.value);
              verifyYDocument(
                verificationDoc,
                schema,
                getDocumentContent(stored),
                (await this.getManifest(projectId))?.title ?? projectId,
                stored.title
              );
              Y.applyUpdate(document, stateToRestore.value);
              restoredState = true;
            } catch (error) {
              console.warn(
                `Ignoring an incompatible legacy Yjs state for "${stored.title}" and restoring its saved document content.`,
                error
              );
            } finally {
              verificationDoc.destroy();
            }
          }
          if (!restoredState) {
            const { createEditorExtensions } = await import('../editor/editorExtensions.ts');
            const schema = getSchema(createEditorExtensions());
            prosemirrorJSONToYXmlFragment(schema, getDocumentContent(stored), fragment);
          }
          await storeState(persistence);
        }
        await this.putRecord<StoredYjsState>('yjsDocuments', yjsDocumentKey(projectId, documentId), {
          projectId,
          value: Y.encodeStateAsUpdate(document),
        });

        if (channel) {
          channel.onmessage = (event: MessageEvent<unknown>) => {
            const message = event.data as { type?: unknown; update?: unknown };
            if (message?.type === 'sync-request') {
              channel.postMessage({ type: 'update', update: Y.encodeStateAsUpdate(document) });
            } else if (message?.type === 'update' && message.update instanceof Uint8Array) {
              Y.applyUpdate(document, message.update, channel);
            }
          };
          document.on('update', created.handle);
          channel.postMessage({ type: 'sync-request' });
          channel.postMessage({ type: 'update', update: Y.encodeStateAsUpdate(document) });
        }
      })();
      this.openYDocuments.set(resourceKey, created);
      resource = created;
    }

    resource.refs += 1;
    try {
      await resource.ready;
      if (resource.deleted) {
        throw new Error(`Could not open document ${documentId}: it has been deleted.`);
      }
    } catch (error) {
      resource.refs -= 1;
      if (resource.refs === 0) {
        this.openYDocuments.delete(resourceKey);
        resource.channel?.close();
        try {
          await resource.persistence.destroy();
          if (resource.deleted) await clearDocument(yjsDocumentDatabaseName(projectId, documentId));
        } finally {
          resource.document.destroy();
        }
      }
      throw error;
    }

    let released = false;
    return {
      document: resource.document,
      readOnly: resource.channel === null,
      release: async () => {
        if (released) return;
        released = true;
        resource!.refs -= 1;
        if (resource!.refs > 0) return;
        this.openYDocuments.delete(resourceKey);
        resource!.document.off('update', resource!.handle);
        resource!.channel?.close();
        try {
          if (!resource!.deleted) await storeState(resource!.persistence);
        } finally {
          try {
            await resource!.persistence.destroy();
            if (resource!.deleted) await clearDocument(yjsDocumentDatabaseName(projectId, documentId));
          } finally {
            resource!.document.destroy();
          }
        }
      },
    };
  }

  async getRecentProjects(): Promise<RecentProjectRecord[]> {
    return (await this.getRecord<RecentProjectRecord[]>('recents', 'all')) ?? [];
  }

  async saveRecentProjects(records: RecentProjectRecord[]): Promise<void> {
    await this.putRecord('recents', 'all', records);
  }

  async createProject(
    manifest: ProjectManifest,
    initialDocuments: Record<string, DocumentData>
  ): Promise<void> {
    const normalizedManifest = {
      ...manifest,
      settings: normalizeProjectSettings(manifest.settings ?? {}),
      tree: normalizeBinderOrder(manifest.tree),
    };
    try {
      await this.putRecord('projects', `project:${manifest.id}`, normalizedManifest);
      for (const document of Object.values(initialDocuments)) {
        await this.putRecord<StoredDocument>('documents', `document:${manifest.id}:${document.id}`, {
          projectId: manifest.id,
          value: document,
        });
      }

      const { createEditorExtensions } = await import('../editor/editorExtensions.ts');
      const schema = getSchema(createEditorExtensions());
      await this.migrateProjectDocument(normalizedManifest);
      for (const document of Object.values(initialDocuments)) {
        await this.migrateYDocument(manifest.id, manifest.title, document, schema);
      }

      const recents = await this.getRecentProjects();
      const previous = recents.find((record) => record.id === manifest.id);
      const record = recordFor(manifest, previous);
      await this.saveRecentProjects([record, ...recents.filter((entry) => entry.id !== manifest.id)]);
    } catch (error) {
      await this.deleteProject(manifest.id);
      throw error;
    }
  }

  async loadProjectManifest(projectId: string): Promise<ProjectManifest | null> {
    const stored = await this.getRecord<StoredYjsProject>('yjsProjects', `project:${projectId}`);
    if (!stored) return this.getManifest(projectId);

    const projectDoc = new Y.Doc();
    try {
      Y.applyUpdate(projectDoc, stored.value);
      const project = projectDoc.getMap('project');
      const base = await this.getManifest(projectId);
      if (!base) return null;
      const tree = [...projectDoc.getMap('tree').values()].map((value) => {
        if (typeof value !== 'string') throw new Error(`Project ${projectId} contains an invalid binder node.`);
        return JSON.parse(value) as BinderNode;
      });
      return {
        ...base,
        id: String(project.get('id') ?? base.id),
        title: String(project.get('title') ?? base.title),
        author: String(project.get('author') ?? base.author),
        description: String(project.get('description') ?? base.description ?? ''),
        version: String(project.get('version') ?? base.version),
        createdAt: String(project.get('createdAt') ?? base.createdAt),
        updatedAt: String(project.get('updatedAt') ?? base.updatedAt),
        settings: normalizeProjectSettings(
          JSON.parse(String(project.get('settings') ?? JSON.stringify(base.settings)))
        ),
        tree: normalizeBinderOrder(tree),
      };
    } finally {
      projectDoc.destroy();
    }
  }

  async isProjectReadOnly(projectId: string): Promise<boolean> {
    const stored = await this.getRecord<StoredYjsProject>('yjsProjects', `project:${projectId}`);
    if (!stored) return false;
    const projectDoc = new Y.Doc();
    try {
      Y.applyUpdate(projectDoc, stored.value);
      const schemaVersion = projectDoc.getMap('project').get('schemaVersion');
      if (typeof schemaVersion !== 'number' || !Number.isInteger(schemaVersion) || schemaVersion < 1) {
        throw new Error(`Project ${projectId} has an invalid schema version.`);
      }
      return schemaVersion > PROJECT_SCHEMA_VERSION;
    } finally {
      projectDoc.destroy();
    }
  }

  async saveProjectManifest(manifest: ProjectManifest): Promise<void> {
    if (await this.isProjectReadOnly(manifest.id)) {
      throw new Error(`Project "${manifest.title}" uses a newer schema and is read-only in this version.`);
    }
    const stamped = {
      ...manifest,
      settings: normalizeProjectSettings(manifest.settings ?? {}),
      tree: normalizeBinderOrder(manifest.tree),
      updatedAt: new Date().toISOString(),
    };
    await this.putRecord('projects', `project:${stamped.id}`, stamped);

    await this.replaceYjsProjectDocument(stamped);
    if (typeof BroadcastChannel !== 'undefined') {
      const channel = new BroadcastChannel(`aether-project:${encodeURIComponent(stamped.id)}`);
      channel.postMessage('project-update');
      channel.close();
    }

    const recents = await this.getRecentProjects();
    const index = recents.findIndex((record) => record.id === stamped.id);
    if (index === -1) return;
    recents[index] = {
      ...recents[index],
      title: stamped.title,
      author: stamped.author,
      updatedAt: stamped.updatedAt,
      documentCount: countDocuments(stamped.tree),
      totalWords: sumWords(stamped.tree),
    };
    await this.saveRecentProjects(recents);
  }

  async saveProjectSettings(projectId: string, settings: ProjectSettings, updatedAt: string): Promise<void> {
    await this.assertProjectWritable(projectId);
    const database = await this.openDatabase();
    const transaction = database.transaction(['projects', 'yjsProjects'], 'readwrite');
    const done = transactionDone(transaction);
    const projectStore = transaction.objectStore('projects');
    const yjsProjectStore = transaction.objectStore('yjsProjects');
    const projectRequest = projectStore.get(`project:${projectId}`) as IDBRequest<
      StoredRecord<ProjectManifest> | undefined
    >;
    const yjsRequest = yjsProjectStore.get(`project:${projectId}`) as IDBRequest<
      StoredRecord<StoredYjsProject> | undefined
    >;
    let projectRecord: StoredRecord<ProjectManifest> | undefined;
    let yjsRecord: StoredRecord<StoredYjsProject> | undefined;
    let loadedRecords = 0;
    let updateError: unknown = null;

    const applySettings = (): void => {
      loadedRecords += 1;
      if (loadedRecords !== 2) return;
      if (!projectRecord || !yjsRecord) {
        updateError = new Error(`Project ${projectId} is missing shared settings storage data.`);
        transaction.abort();
        return;
      }

      const projectDoc = new Y.Doc();
      try {
        Y.applyUpdate(projectDoc, yjsRecord.value.value);
        const projectMap = projectDoc.getMap('project');
        const schemaVersion = projectMap.get('schemaVersion');
        if (typeof schemaVersion !== 'number' || schemaVersion > PROJECT_SCHEMA_VERSION) {
          throw new Error(`Project ${projectId} uses a newer schema and is read-only in this version.`);
        }

        const normalizedSettings = normalizeProjectSettings(settings);
        projectDoc.transact(() => {
          projectMap.set('settings', JSON.stringify(normalizedSettings));
          projectMap.set('updatedAt', updatedAt);
        });

        projectStore.put({
          ...projectRecord,
          value: { ...projectRecord.value, settings: normalizedSettings, updatedAt },
        });
        yjsProjectStore.put({
          ...yjsRecord,
          value: { projectId, value: Y.encodeStateAsUpdate(projectDoc) },
        });
      } catch (error) {
        updateError = error;
        transaction.abort();
      } finally {
        projectDoc.destroy();
      }
    };

    projectRequest.onsuccess = () => {
      projectRecord = projectRequest.result;
      applySettings();
    };
    yjsRequest.onsuccess = () => {
      yjsRecord = yjsRequest.result;
      applySettings();
    };

    try {
      await done;
    } catch (error) {
      if (updateError) throw updateError;
      throw error;
    }

    if (typeof BroadcastChannel !== 'undefined') {
      const channel = new BroadcastChannel(`aether-project:${encodeURIComponent(projectId)}`);
      channel.postMessage('project-update');
      channel.close();
    }

    const recents = await this.getRecentProjects();
    const index = recents.findIndex((record) => record.id === projectId);
    if (index === -1) return;
    recents[index] = { ...recents[index], updatedAt };
    await this.saveRecentProjects(recents);
  }

  async moveBinderNode(
    projectId: string,
    nodeId: string,
    parentId: string | null,
    orderKey: string,
    sortOrder: number,
    updatedAt: string
  ): Promise<void> {
    await this.saveBinderChanges(
      projectId,
      [],
      [
        { id: nodeId, changes: { parentId, orderKey, sortOrder, updatedAt } },
        ...(parentId === null ? [] : [{ id: parentId, changes: { expanded: true } }]),
      ],
      [],
      updatedAt
    );
  }

  async saveBinderChanges(
    projectId: string,
    additions: BinderNode[],
    updates: Array<{ id: string; changes: Partial<BinderNode> }>,
    deletes: string[],
    updatedAt: string
  ): Promise<void> {
    await this.assertProjectWritable(projectId);
    const database = await this.openDatabase();
    const transaction = database.transaction(['projects', 'yjsProjects'], 'readwrite');
    const done = transactionDone(transaction);
    const projectStore = transaction.objectStore('projects');
    const yjsProjectStore = transaction.objectStore('yjsProjects');
    const projectRequest = projectStore.get(`project:${projectId}`) as IDBRequest<
      StoredRecord<ProjectManifest> | undefined
    >;
    const yjsRequest = yjsProjectStore.get(`project:${projectId}`) as IDBRequest<
      StoredRecord<StoredYjsProject> | undefined
    >;
    let projectRecord: StoredRecord<ProjectManifest> | undefined;
    let yjsRecord: StoredRecord<StoredYjsProject> | undefined;
    let loadedRecords = 0;
    let updateError: unknown = null;
    const applyChanges = (): void => {
      loadedRecords += 1;
      if (loadedRecords !== 2) return;
      if (!projectRecord || !yjsRecord) {
        updateError = new Error(`Project ${projectId} is missing binder storage data.`);
        transaction.abort();
        return;
      }

      const projectDoc = new Y.Doc();
      try {
        Y.applyUpdate(projectDoc, yjsRecord.value.value);
        const projectMap = projectDoc.getMap('project');
        const schemaVersion = projectMap.get('schemaVersion');
        if (typeof schemaVersion !== 'number' || schemaVersion > PROJECT_SCHEMA_VERSION) {
          throw new Error(`Project ${projectId} uses a newer schema and is read-only in this version.`);
        }
        const nodes = projectDoc.getMap('tree');
        const currentNodes = new Map<string, BinderNode>();
        for (const [id, value] of nodes.entries()) {
          if (typeof value !== 'string') throw new Error(`Project ${projectId} contains an invalid binder node.`);
          currentNodes.set(id, JSON.parse(value) as BinderNode);
        }

        projectDoc.transact(() => {
          for (const id of deletes) {
            nodes.delete(id);
            currentNodes.delete(id);
          }
          for (const node of additions) {
            if (currentNodes.has(node.id)) continue;
            nodes.set(node.id, JSON.stringify(node));
            currentNodes.set(node.id, node);
          }
          for (const { id, changes } of updates) {
            const current = currentNodes.get(id);
            if (!current) throw new Error(`Binder item ${id} is missing from project ${projectId}.`);
            const updated = { ...current, ...changes, id };
            nodes.set(id, JSON.stringify(updated));
            currentNodes.set(id, updated);
          }
        });

        const manifest: ProjectManifest = {
          ...projectRecord.value,
          updatedAt,
          tree: normalizeBinderOrder([...currentNodes.values()]),
        };
        projectStore.put({ ...projectRecord, value: manifest });
        yjsProjectStore.put({
          ...yjsRecord,
          value: { projectId, value: Y.encodeStateAsUpdate(projectDoc) },
        });
      } catch (error) {
        updateError = error;
        transaction.abort();
      } finally {
        projectDoc.destroy();
      }
    };
    projectRequest.onsuccess = () => {
      projectRecord = projectRequest.result;
      applyChanges();
    };
    yjsRequest.onsuccess = () => {
      yjsRecord = yjsRequest.result;
      applyChanges();
    };
    try {
      await done;
    } catch (error) {
      if (updateError) throw updateError;
      throw error;
    }

    if (typeof BroadcastChannel !== 'undefined') {
      const channel = new BroadcastChannel(`aether-project:${encodeURIComponent(projectId)}`);
      channel.postMessage('project-update');
      channel.close();
    }
    const manifest = await this.loadProjectManifest(projectId);
    if (!manifest) return;
    const recents = await this.getRecentProjects();
    const index = recents.findIndex((record) => record.id === projectId);
    if (index === -1) return;
    recents[index] = {
      ...recents[index],
      updatedAt: manifest.updatedAt,
      totalWords: sumWords(manifest.tree),
      documentCount: countDocuments(manifest.tree),
    };
    await this.saveRecentProjects(recents);
  }

  async deleteProject(projectId: string): Promise<void> {
    await this.assertProjectWritable(projectId);
    await this.deleteRecord('projects', `project:${projectId}`);
    const [documents, snapshots, yjsProjects] = await Promise.all([
      this.getAllRecords<StoredDocument>('documents'),
      this.getAllRecords<StoredSnapshot>('snapshots'),
      this.getAllRecords<StoredYjsProject>('yjsProjects'),
    ]);
    for (const project of yjsProjects.filter((entry) => entry.value.projectId === projectId)) {
      await this.enqueueYjsOperation(project.key, async () => {
        await this.deleteRecord('yjsProjects', project.key);
        await clearDocument(`aether-${project.key}`);
      });
    }
    for (const document of documents.filter((entry) => entry.value.projectId === projectId)) {
      await this.deleteDocument(projectId, document.value.value.id);
    }
    for (const snapshot of snapshots.filter((entry) => entry.value.projectId === projectId)) {
      await this.deleteRecord('snapshots', snapshot.key);
    }

    const recents = await this.getRecentProjects();
    await this.saveRecentProjects(recents.filter((record) => record.id !== projectId));
  }

  async loadDocument(projectId: string, documentId: string): Promise<DocumentData | null> {
    const stored = await this.getDocument(projectId, documentId);
    if (!stored) return null;
    if (await this.isProjectReadOnly(projectId)) return stored;
    const handle = await this.openCollaborativeDocument(projectId, documentId);
    try {
      const { createEditorExtensions } = await import('../editor/editorExtensions.ts');
      const schema = getSchema(createEditorExtensions());
      const content = yXmlFragmentToProseMirrorRootNode(
        handle.document.getXmlFragment('default'),
        schema
      );
      const plainText = content.textBetween(0, content.content.size, '\n');
      return {
        ...stored,
        content: content.toJSON(),
        plainText,
        wordCount: countWords(plainText),
        charCount: plainText.length,
      };
    } finally {
      await handle.release();
    }
  }

  async saveDocument(projectId: string, documentData: DocumentData): Promise<void> {
    await this.assertProjectWritable(projectId);
    const stamped = { ...documentData, updatedAt: new Date().toISOString() };
    await this.putRecord<StoredDocument>('documents', `document:${projectId}:${stamped.id}`, {
      projectId,
      value: stamped,
    });
    const handle = await this.openCollaborativeDocument(projectId, stamped.id);
    await handle.release();
    await this.saveBinderChanges(
      projectId,
      [],
      [{ id: stamped.id, changes: { wordCount: stamped.wordCount, updatedAt: stamped.updatedAt } }],
      [],
      stamped.updatedAt
    );
  }

  async deleteDocument(projectId: string, documentId: string): Promise<void> {
    await this.assertProjectWritable(projectId);
    await this.deleteRecord('documents', `document:${projectId}:${documentId}`);
    const key = yjsDocumentKey(projectId, documentId);
    await this.enqueueYjsOperation(key, async () => {
      const resource = this.openYDocuments.get(`${projectId}:${documentId}`);
      if (resource) resource.deleted = true;
      const state = await this.getRecord<StoredYjsState>('yjsDocuments', key);
      if (state?.projectId === projectId) {
        await this.deleteRecord('yjsDocuments', key);
        if (!resource) await clearDocument(yjsDocumentDatabaseName(projectId, documentId));
      }
    });
  }

  async createSnapshot(projectId: string, label: string): Promise<ProjectSnapshot> {
    await this.assertProjectWritable(projectId);
    const manifest = await this.loadProjectManifest(projectId);
    if (!manifest) throw new Error(`Project ${projectId} not found for snapshot creation`);

    const { createEditorExtensions } = await import('../editor/editorExtensions.ts');
    const schema = getSchema(createEditorExtensions());
    const documents: Record<string, DocumentSnapshot> = {};
    for (const node of manifest.tree) {
      if (node.type === 'folder') continue;
      const stored = await this.getDocument(projectId, node.id);
      if (!stored) continue;
      const handle = await this.openCollaborativeDocument(projectId, node.id);
      try {
        const content = yXmlFragmentToProseMirrorRootNode(handle.document.getXmlFragment('default'), schema);
        const plainText = content.textBetween(0, content.content.size, '\n');
        documents[node.id] = {
          id: stored.id,
          title: stored.title,
          content: content.toJSON(),
          plainText,
          wordCount: countWords(plainText),
          yjsState: Y.encodeStateAsUpdate(handle.document),
        };
      } finally {
        await handle.release();
      }
    }

    const timestamp = Date.now();
    const snapshot: ProjectSnapshot = {
      id: `snap_${timestamp}`,
      projectId,
      timestamp: new Date(timestamp).toISOString(),
      label,
      manifest,
      documents,
    };
    await this.putRecord<StoredSnapshot>('snapshots', `snapshot:${projectId}:${snapshot.id}`, {
      projectId,
      value: snapshot,
    });
    const snapshots = await this.listSnapshots(projectId);
    for (const stale of snapshots.slice(MAX_SNAPSHOTS_PER_PROJECT)) {
      await this.deleteSnapshot(projectId, stale.id);
    }
    return snapshot;
  }

  async listSnapshots(projectId: string): Promise<ProjectSnapshot[]> {
    const records = await this.getAllRecords<StoredSnapshot>('snapshots');
    return records
      .filter((record) => record.value.projectId === projectId)
      .map((record) => normalizeSnapshot(record.value.value))
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }

  async deleteSnapshot(projectId: string, snapshotId: string): Promise<void> {
    await this.assertProjectWritable(projectId);
    await this.deleteRecord('snapshots', `snapshot:${projectId}:${snapshotId}`);
  }

  async restoreSnapshot(projectId: string, snapshotId: string): Promise<ProjectManifest> {
    await this.assertProjectWritable(projectId);
    const stored = await this.getRecord<StoredSnapshot>('snapshots', `snapshot:${projectId}:${snapshotId}`);
    const snapshot = stored?.value;
    if (!snapshot) throw new Error(`Snapshot ${snapshotId} not found`);
    const normalizedSnapshot = normalizeSnapshot(snapshot);
    const { createEditorExtensions } = await import('../editor/editorExtensions.ts');
    const schema = getSchema(createEditorExtensions());

    const records = await this.getAllRecords<StoredDocument>('documents');
    for (const record of records.filter((entry) => entry.value.projectId === projectId)) {
      if (!(record.value.value.id in normalizedSnapshot.documents)) {
        await this.deleteDocument(projectId, record.value.value.id);
      }
    }

    for (const [documentId, snapshotDocument] of Object.entries(normalizedSnapshot.documents)) {
      const existing = await this.getDocument(projectId, documentId);
      let content = getDocumentContent(snapshotDocument);
      let plainText = snapshotDocument.plainText;
      let wordCount = snapshotDocument.wordCount;
      if (snapshotDocument.yjsState) {
        const snapshotYDoc = new Y.Doc();
        try {
          Y.applyUpdate(snapshotYDoc, snapshotDocument.yjsState);
          const snapshotContent = yXmlFragmentToProseMirrorRootNode(
            snapshotYDoc.getXmlFragment('default'),
            schema
          );
          const previewContent = schema.nodeFromJSON(content);
          if (
            snapshotContent.textContent !== previewContent.textContent ||
            countProseMirrorNodes(snapshotContent) !== countProseMirrorNodes(previewContent)
          ) {
            throw new Error(`Snapshot verification failed for document "${snapshotDocument.title}".`);
          }
          content = snapshotContent.toJSON();
          plainText = snapshotContent.textBetween(0, snapshotContent.content.size, '\n');
          wordCount = countWords(plainText);
        } finally {
          snapshotYDoc.destroy();
        }
      }
      const restored: DocumentData = {
        id: documentId,
        projectId,
        title: snapshotDocument.title,
        updatedAt: new Date().toISOString(),
        wordCount,
        charCount: plainText.length,
        content,
        plainText,
        notes: existing?.notes ?? '',
        bookmarks: existing?.bookmarks ?? [],
        comments: existing?.comments ?? [],
      };
      await this.putRecord<StoredDocument>('documents', `document:${projectId}:${documentId}`, {
        projectId,
        value: restored,
      });
      await this.replaceYjsDocument(projectId, restored, schema);
    }

    const manifest = {
      ...normalizedSnapshot.manifest,
      tree: normalizeBinderOrder(normalizedSnapshot.manifest.tree),
      updatedAt: new Date().toISOString(),
    };
    await this.saveProjectManifest(manifest);
    return (await this.loadProjectManifest(projectId)) ?? manifest;
  }

  async exportProjectBundle(projectId: string): Promise<string> {
    const manifest = await this.loadProjectManifest(projectId);
    if (!manifest) throw new Error(`Project ${projectId} not found for export`);
    const documents: Record<string, DocumentData> = {};
    for (const node of manifest.tree) {
      if (node.type === 'folder') continue;
      const document = await this.loadDocument(projectId, node.id);
      if (document) documents[node.id] = document;
    }
    return JSON.stringify(
      {
        format: 'aether_project_v1',
        schemaVersion: 1,
        exportedAt: new Date().toISOString(),
        manifest,
        documents,
      },
      null,
      2
    );
  }

  async importProjectBundle(jsonContent: string): Promise<ProjectManifest> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonContent);
    } catch {
      throw new Error('The selected file is not valid JSON.');
    }
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      typeof (parsed as { manifest?: unknown }).manifest !== 'object' ||
      (parsed as { manifest?: unknown }).manifest === null ||
      typeof (parsed as { documents?: unknown }).documents !== 'object' ||
      (parsed as { documents?: unknown }).documents === null
    ) {
      throw new Error('The selected file is not an .aether project bundle.');
    }
    const bundle = parsed as { manifest: ProjectManifest; documents: Record<string, DocumentData> };
    const existing = await this.getManifest(bundle.manifest.id);
    const projectId = existing ? `proj_import_${crypto.randomUUID()}` : bundle.manifest.id;
    const manifest = { ...bundle.manifest, id: projectId, updatedAt: new Date().toISOString() };
    const documents = Object.fromEntries(
      Object.entries(bundle.documents).map(([id, document]) => [id, { ...document, projectId }])
    );
    await this.createProject(manifest, documents);
    return manifest;
  }

  async exportAllProjects(): Promise<string> {
    const projectRecords = await this.getAllRecords<ProjectManifest>('projects');
    const recentProjects = await this.getRecentProjects();
    const recentById = new Map(recentProjects.map((record) => [record.id, record]));
    const storedSnapshots = await this.getAllRecords<StoredSnapshot>('snapshots');
    const projects: ApplicationBackup['projects'] = [];

    for (const { value: cachedManifest } of projectRecords) {
      const manifest = await this.loadProjectManifest(cachedManifest.id);
      if (!manifest) throw new Error(`Project ${cachedManifest.id} disappeared during export.`);
      const documents: Record<string, DocumentData> = {};
      for (const node of manifest.tree) {
        if (node.type === 'folder') continue;
        const document = await this.loadDocument(manifest.id, node.id);
        if (!document) throw new Error(`Could not export "${node.title}": its document data is missing.`);
        documents[node.id] = document;
      }
      const snapshots = storedSnapshots
        .filter((record) => record.value.projectId === manifest.id)
        .map((record) => normalizeSnapshot(record.value.value));
      projects.push({ manifest, documents, snapshots });
      if (!recentById.has(manifest.id)) {
        const record = recordFor(manifest);
        recentProjects.push(record);
        recentById.set(manifest.id, record);
      }
    }

    return JSON.stringify(
      {
        format: 'aether_full_backup',
        schemaVersion: 1,
        exportedAt: new Date().toISOString(),
        recentProjects,
        projects,
      },
      null,
      2
    );
  }

  async importAllProjects(jsonContent: string): Promise<number> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonContent);
    } catch {
      throw new Error('The selected file is not valid JSON.');
    }
    if (!isApplicationBackup(parsed)) {
      throw new Error('The selected file is not a supported Aether full backup (schema version 1).');
    }

    const originalRecents = await this.getRecentProjects();
    const importedIds = new Map<string, string>();
    const imported: ProjectManifest[] = [];
    try {
      for (const entry of parsed.projects) {
        const sourceId = entry.manifest.id;
        let projectId = sourceId;
        if (await this.getManifest(projectId)) projectId = `proj_import_${crypto.randomUUID()}`;
        const manifest = { ...entry.manifest, id: projectId };
        imported.push(manifest);
        const documents: Record<string, DocumentData> = {};
        for (const [documentId, document] of Object.entries(entry.documents)) {
          if (document.id !== documentId || document.projectId !== sourceId) {
            throw new Error(`The backup contains invalid document data for project "${manifest.title}".`);
          }
          documents[documentId] = { ...document, projectId };
        }
        for (const node of manifest.tree) {
          if (node.type !== 'folder' && !documents[node.id]) {
            throw new Error(`The backup is missing "${node.title}" in project "${manifest.title}".`);
          }
        }
        await this.createProject(manifest, documents);
        for (const snapshot of entry.snapshots) {
          const restoredSnapshot: ProjectSnapshot = {
            ...normalizeSnapshot(snapshot),
            projectId,
            manifest: { ...snapshot.manifest, id: projectId },
          };
          await this.putRecord<StoredSnapshot>('snapshots', `snapshot:${projectId}:${snapshot.id}`, {
            projectId,
            value: restoredSnapshot,
          });
        }
        importedIds.set(sourceId, projectId);
      }

      const importedRecords = parsed.recentProjects.map((record) => {
        const projectId = importedIds.get(record.id);
        if (!projectId) throw new Error(`The backup references a missing project "${record.id}".`);
        return { ...record, id: projectId, storageKey: projectId };
      });
      const importedRecentIds = new Set(importedRecords.map((record) => record.id));
      await this.saveRecentProjects([
        ...importedRecords,
        ...originalRecents.filter((record) => !importedRecentIds.has(record.id)),
      ]);
    } catch (error) {
      for (const manifest of imported) await this.deleteProject(manifest.id);
      await this.saveRecentProjects(originalRecents);
      throw error;
    }
    return imported.length;
  }

  async estimateLocalStorageUsage(): Promise<number> {
    return this.legacyStorage.estimateLocalStorageUsage();
  }

  async isMigrated(): Promise<boolean> {
    return (await this.getRecord<boolean>('meta', MIGRATION_KEY)) === true;
  }

  async migrateFromLegacy(backup: ApplicationBackup): Promise<void> {
    if (!isApplicationBackup(backup)) throw new Error('The legacy storage backup is invalid.');
    const { createEditorExtensions } = await import('../editor/editorExtensions.ts');
    const schema = getSchema(createEditorExtensions());

    for (const project of backup.projects) {
      const manifest = {
        ...project.manifest,
        settings: normalizeProjectSettings(project.manifest.settings ?? {}),
        tree: normalizeBinderOrder(project.manifest.tree),
      };
      const currentManifest = await this.getManifest(manifest.id);
      if (currentManifest && JSON.stringify(currentManifest) !== JSON.stringify(manifest)) {
        throw new Error(`IndexedDB already contains a different project "${manifest.title}".`);
      }
      await this.putRecord('projects', `project:${manifest.id}`, manifest);

      for (const document of Object.values(project.documents)) {
        const currentDocument = await this.getDocument(manifest.id, document.id);
        if (currentDocument && JSON.stringify(currentDocument) !== JSON.stringify(document)) {
          throw new Error(`IndexedDB already contains a different copy of "${document.title}".`);
        }
        await this.putRecord<StoredDocument>('documents', `document:${manifest.id}:${document.id}`, {
          projectId: manifest.id,
          value: document,
        });
        await this.migrateYDocument(manifest.id, manifest.title, document, schema);
      }

      for (const snapshot of project.snapshots) {
        const normalizedSnapshot = normalizeSnapshot(snapshot);
        await this.putRecord<StoredSnapshot>('snapshots', `snapshot:${manifest.id}:${snapshot.id}`, {
          projectId: manifest.id,
          value: normalizedSnapshot,
        });
      }
      await this.migrateProjectDocument(manifest);
    }

    const sourceProjectIds = new Set(backup.projects.map((project) => project.manifest.id));
    const existingRecents = await this.getRecentProjects();
    const importedRecentIds = new Set(backup.recentProjects.map((record) => record.id));
    const legacyRecents = backup.recentProjects.filter((record) => sourceProjectIds.has(record.id));
    const recents = [
      ...legacyRecents,
      ...existingRecents.filter((record) => !importedRecentIds.has(record.id)),
    ];
    await this.saveRecentProjects(recents);

    const documents = await this.getAllRecords<StoredDocument>('documents');
    const snapshots = await this.getAllRecords<StoredSnapshot>('snapshots');
    const manifests = await this.getAllRecords<ProjectManifest>('projects');
    if (manifests.length !== backup.projects.length) {
      throw new Error('Migration verification failed: project count does not match localStorage.');
    }
    for (const project of backup.projects) {
      const manifest = await this.getManifest(project.manifest.id);
      const expectedManifest = {
        ...project.manifest,
        settings: normalizeProjectSettings(project.manifest.settings ?? {}),
        tree: normalizeBinderOrder(project.manifest.tree),
      };
      if (JSON.stringify(manifest) !== JSON.stringify(expectedManifest)) {
        throw new Error(`Migration verification failed for project "${project.manifest.title}".`);
      }
      const projectDocuments = documents.filter((entry) => entry.value.projectId === project.manifest.id);
      if (projectDocuments.length !== Object.keys(project.documents).length) {
        throw new Error(`Migration verification failed: document count differs for "${project.manifest.title}".`);
      }
      for (const [documentId, expectedDocument] of Object.entries(project.documents)) {
        const actualDocument = await this.getDocument(project.manifest.id, documentId);
        if (JSON.stringify(actualDocument) !== JSON.stringify(expectedDocument)) {
          throw new Error(`Migration verification failed for document "${expectedDocument.title}".`);
        }
      }
      const projectSnapshots = snapshots.filter((entry) => entry.value.projectId === project.manifest.id);
      if (projectSnapshots.length !== project.snapshots.length) {
        throw new Error(`Migration verification failed: snapshot count differs for "${project.manifest.title}".`);
      }
      for (const expectedSnapshot of project.snapshots) {
        const actualSnapshot = await this.getRecord<StoredSnapshot>(
          'snapshots',
          `snapshot:${project.manifest.id}:${expectedSnapshot.id}`
        );
        if (
          JSON.stringify(actualSnapshot?.value) !==
          JSON.stringify(normalizeSnapshot(expectedSnapshot))
        ) {
          throw new Error(`Migration verification failed for snapshot "${expectedSnapshot.label}".`);
        }
      }
      for (const document of Object.values(project.documents)) {
        const state = await this.getRecord<StoredYjsState>(
          'yjsDocuments',
          yjsDocumentKey(project.manifest.id, document.id)
        );
        if (!state || state.projectId !== project.manifest.id) {
          throw new Error(`Migration verification failed: Yjs data is missing for "${document.title}".`);
        }
        const yDoc = new Y.Doc();
        try {
          Y.applyUpdate(yDoc, state.value);
          verifyYDocument(
            yDoc,
            schema,
            getDocumentContent(document),
            project.manifest.title,
            document.title
          );
        } finally {
          yDoc.destroy();
        }
      }
      const projectState = await this.getRecord<StoredYjsProject>(
        'yjsProjects',
        `project:${project.manifest.id}`
      );
      if (!projectState || projectState.projectId !== project.manifest.id) {
        throw new Error(`Migration verification failed: Yjs structure is missing for "${project.manifest.title}".`);
      }
    }
    for (const record of backup.recentProjects) {
      const actualRecord = recents.find((recent) => recent.id === record.id);
      if (JSON.stringify(actualRecord) !== JSON.stringify(record)) {
        throw new Error(`Migration verification failed: recent project "${record.title}" is missing.`);
      }
    }
    await this.putRecord('meta', MIGRATION_KEY, true);
  }

  private async migrateYDocument(
    projectId: string,
    projectTitle: string,
    document: DocumentData,
    schema: Schema
  ): Promise<void> {
    const key = yjsDocumentKey(projectId, document.id);
    const databaseName = yjsDocumentDatabaseName(projectId, document.id);
    const scopedState = await this.getRecord<StoredYjsState>('yjsDocuments', key);
    const legacyState = scopedState
      ? null
      : await this.getRecord<StoredYjsState>('yjsDocuments', `doc:${document.id}`);
    const state =
      scopedState?.projectId === projectId
        ? scopedState
        : legacyState?.projectId === projectId
          ? legacyState
          : null;
    const content = getDocumentContent(document);
    let yDoc = new Y.Doc();
    if (state) {
      try {
        Y.applyUpdate(yDoc, state.value);
        verifyYDocument(yDoc, schema, content, projectTitle, document.title);
      } catch (error) {
        if (state === scopedState) {
          yDoc.destroy();
          throw error;
        }
        console.warn(
          `Ignoring an incompatible legacy Yjs state for "${projectTitle}" / "${document.title}".`,
          error
        );
        yDoc.destroy();
        yDoc = new Y.Doc();
        prosemirrorJSONToYXmlFragment(schema, content, yDoc.getXmlFragment('default'));
      }
    } else {
      prosemirrorJSONToYXmlFragment(schema, content, yDoc.getXmlFragment('default'));
    }

    verifyYDocument(yDoc, schema, content, projectTitle, document.title);
    const persistence = new IndexeddbPersistence(databaseName, yDoc);
    await persistence.whenSynced;
    verifyYDocument(yDoc, schema, content, projectTitle, document.title);
    await this.waitForYjsPersistence(persistence);
    const encodedState = Y.encodeStateAsUpdate(yDoc);
    await persistence.destroy();
    yDoc.destroy();
    await this.putRecord<StoredYjsState>('yjsDocuments', key, {
      projectId,
      value: encodedState,
    });
  }

  private async replaceYjsDocument(
    projectId: string,
    document: DocumentData,
    schema: Schema
  ): Promise<void> {
    const handle = await this.openCollaborativeDocument(projectId, document.id);
    try {
      const fragment = handle.document.getXmlFragment('default');
      handle.document.transact(() => {
        if (fragment.length > 0) fragment.delete(0, fragment.length);
        prosemirrorJSONToYXmlFragment(schema, getDocumentContent(document), fragment);
      });
      await storeState(this.openYDocuments.get(`${projectId}:${document.id}`)!.persistence);
    } finally {
      await handle.release();
    }
  }

  private async replaceYjsProjectDocument(manifest: ProjectManifest): Promise<void> {
    const key = `project:${manifest.id}`;
    await this.enqueueYjsOperation(key, async () => {
      const projectDoc = new Y.Doc();
      const persistence = new IndexeddbPersistence(`aether-${key}`, projectDoc);
      try {
        await persistence.whenSynced;
        const latest = await this.getRecord<StoredYjsProject>('yjsProjects', key);
        if (latest) Y.applyUpdate(projectDoc, latest.value);
        const project = projectDoc.getMap('project');
        const nodes = projectDoc.getMap('tree');
        projectDoc.transact(() => {
          project.set('schemaVersion', PROJECT_SCHEMA_VERSION);
          project.set('id', manifest.id);
          project.set('title', manifest.title);
          project.set('author', manifest.author);
          project.set('description', manifest.description ?? '');
          project.set('version', manifest.version);
          project.set('createdAt', manifest.createdAt);
          project.set('updatedAt', manifest.updatedAt);
          project.set('settings', JSON.stringify(manifest.settings));
          const currentIds = new Set(manifest.tree.map((node) => node.id));
          for (const id of nodes.keys()) {
            if (!currentIds.has(id)) nodes.delete(id);
          }
          for (const node of manifest.tree) nodes.set(node.id, JSON.stringify(node));
        });
        await storeState(persistence);
        await this.putRecord<StoredYjsProject>( 'yjsProjects', key, {
          projectId: manifest.id,
          value: Y.encodeStateAsUpdate(projectDoc),
        });
      } finally {
        await persistence.destroy();
        projectDoc.destroy();
      }
    });
  }

  private async migrateProjectDocument(manifest: ProjectManifest): Promise<void> {
    const key = `project:${manifest.id}`;
    const existing = await this.getRecord<StoredYjsProject>('yjsProjects', key);
    const projectDoc = new Y.Doc();
    if (existing) {
      Y.applyUpdate(projectDoc, existing.value);
    } else {
      const project = projectDoc.getMap('project');
      const nodes = projectDoc.getMap('tree');
      project.set('schemaVersion', PROJECT_SCHEMA_VERSION);
      project.set('id', manifest.id);
      project.set('title', manifest.title);
      project.set('author', manifest.author);
      project.set('description', manifest.description ?? '');
      project.set('version', manifest.version);
      project.set('createdAt', manifest.createdAt);
      project.set('updatedAt', manifest.updatedAt);
      project.set('settings', JSON.stringify(manifest.settings));
      for (const node of manifest.tree) nodes.set(node.id, JSON.stringify(node));
    }

    const project = projectDoc.getMap('project');
    const nodes = projectDoc.getMap('tree');
    if (
      project.get('schemaVersion') !== PROJECT_SCHEMA_VERSION ||
      project.get('id') !== manifest.id ||
      project.get('title') !== manifest.title ||
      project.get('settings') !== JSON.stringify(manifest.settings) ||
      nodes.size !== manifest.tree.length ||
      manifest.tree.some((node) => nodes.get(node.id) !== JSON.stringify(node))
    ) {
      projectDoc.destroy();
      throw new Error(`Migration verification failed for project structure "${manifest.title}".`);
    }

    if (!existing) {
      const persistence = new IndexeddbPersistence(`aether-${key}`, projectDoc);
      await persistence.whenSynced;
      await this.waitForYjsPersistence(persistence);
      await persistence.destroy();
      const verifyDoc = new Y.Doc();
      const verifyPersistence = new IndexeddbPersistence(`aether-${key}`, verifyDoc);
      await verifyPersistence.whenSynced;
      const encodedState = Y.encodeStateAsUpdate(verifyDoc);
      const verifyProject = verifyDoc.getMap('project');
      const verifyNodes = verifyDoc.getMap('tree');
      const valid =
        verifyProject.get('schemaVersion') === PROJECT_SCHEMA_VERSION &&
        verifyProject.get('id') === manifest.id &&
        verifyNodes.size === manifest.tree.length &&
        manifest.tree.every((node) => verifyNodes.get(node.id) === JSON.stringify(node));
      await verifyPersistence.destroy();
      verifyDoc.destroy();
      projectDoc.destroy();
      if (!valid) throw new Error(`Could not verify persisted project structure "${manifest.title}".`);
      await this.putRecord<StoredYjsProject>('yjsProjects', key, { projectId: manifest.id, value: encodedState });
      return;
    }

    const encodedState = Y.encodeStateAsUpdate(projectDoc);
    projectDoc.destroy();
    await this.putRecord<StoredYjsProject>('yjsProjects', key, {
      projectId: manifest.id,
      value: encodedState,
    });
  }

  private async waitForYjsPersistence(persistence: IndexeddbPersistence): Promise<void> {
    const database = await persistence._db;
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction('updates', 'readonly');
      transaction.objectStore('updates').getAll();
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error('Could not flush a Yjs document.'));
      transaction.onabort = () => reject(transaction.error ?? new Error('Yjs persistence flush was aborted.'));
    });
  }
}
