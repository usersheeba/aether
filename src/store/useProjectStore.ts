/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { JSONContent } from '@tiptap/core';
import { create } from 'zustand';
import { StorageBootstrapper } from '../storage/StorageBootstrapper';
import type { CollaborativeDocumentHandle } from '../storage/CollaborativeDocument';
import type {
  BinderNode,
  DocumentData,
  NodeType,
  ProjectManifest,
  ProjectSettings,
  ProjectSnapshot,
  RecentProjectRecord,
} from '../types/project.ts';
import { collectManuscriptNodes, resolveManuscriptFolder } from '../utils/manuscript';
import { compareBinderOrder, normalizeBinderOrder, orderKeyAt } from '../utils/binderOrder';
import { normalizePageView } from '../utils/pageLayout.ts';
import { createProjectFromTemplate } from '../utils/templates';
import { getAutomaticBackupFolder, writeAutomaticBackup } from '../storage/BackupManager';
import { markFullBackupCreated } from '../storage/BackupReminder';

const storage = new StorageBootstrapper();

const AUTOSAVE_DELAY_MS = 2000;
const META_SAVE_DELAY_MS = 400;
const AUTO_SNAPSHOT_INTERVAL_MS = 5 * 60 * 1000;
const SAVE_ERROR_MESSAGE = 'Could not save your changes to the local container. It may be full.';

const DEFAULT_TITLES: Record<NodeType, string> = {
  folder: 'New Folder',
  document: 'New Document',
  note: 'New Note',
  character_card: 'New Character',
};

export type AutoSaveStatus = 'saved' | 'saving' | 'dirty' | 'error';

let saveTimer: ReturnType<typeof setTimeout> | null = null;
const manuscriptSaveTimers = new Map<string, ReturnType<typeof setTimeout>>();
let projectSyncChannel: BroadcastChannel | null = null;
let automaticSnapshotTimer: ReturnType<typeof setInterval> | null = null;
let lastDocumentActivityAt = 0;
let automaticSnapshotInProgress = false;

function clearManuscriptTimers(): void {
  for (const timer of manuscriptSaveTimers.values()) clearTimeout(timer);
  manuscriptSaveTimers.clear();
}

function nowIso(): string {
  return new Date().toISOString();
}

function createId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function clearSaveTimer(): void {
  if (saveTimer !== null) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
}

function bySortOrder(a: BinderNode, b: BinderNode): number {
  return compareBinderOrder(a, b);
}

function firstDocumentNode(tree: BinderNode[]): BinderNode | null {
  return [...tree].filter((node) => node.type !== 'folder').sort(bySortOrder)[0] ?? null;
}

/** Returns the node id together with every descendant id. */
function collectSubtreeIds(tree: BinderNode[], rootId: string): string[] {
  const ids: string[] = [rootId];
  for (let index = 0; index < ids.length; index += 1) {
    const parentId = ids[index];
    for (const node of tree) {
      if (node.parentId === parentId) ids.push(node.id);
    }
  }
  return ids;
}

/** True when `candidateId` sits below `ancestorId` in the tree. */
function isDescendant(tree: BinderNode[], ancestorId: string, candidateId: string): boolean {
  let current = tree.find((node) => node.id === candidateId);
  while (current && current.parentId !== null) {
    if (current.parentId === ancestorId) return true;
    const parentId = current.parentId;
    current = tree.find((node) => node.id === parentId);
  }
  return false;
}

function createEmptyDocument(projectId: string, id: string, title: string, timestamp: string): DocumentData {
  return {
    id,
    projectId,
    title,
    updatedAt: timestamp,
    wordCount: 0,
    charCount: 0,
    content: { type: 'doc', content: [{ type: 'paragraph' }] },
    plainText: '',
    notes: '',
    bookmarks: [],
    comments: [],
  };
}

interface ProjectState {
  recentProjects: RecentProjectRecord[];
  activeProject: ProjectManifest | null;
  projectReadOnly: boolean;
  activeDocumentId: string | null;
  activeDocument: DocumentData | null;
  autoSaveStatus: AutoSaveStatus;
  errorMessage: string | null;
  snapshots: ProjectSnapshot[];
  /** Documents of the Draft folder, loaded for the compiled manuscript view. */
  manuscriptDocuments: Record<string, DocumentData>;
  manuscriptLoading: boolean;

  clearError: () => void;
  loadRecentProjects: () => Promise<void>;
  createProject: (templateId: string, title: string, author: string, targetWordCount: number) => Promise<boolean>;
  openProject: (projectId: string) => Promise<boolean>;
  closeProject: () => Promise<void>;
  deleteProject: (projectId: string) => Promise<void>;
  togglePinRecent: (projectId: string) => Promise<void>;
  removeFromRecentList: (projectId: string) => Promise<void>;

  selectNode: (nodeId: string) => Promise<void>;
  createNode: (parentId: string | null, type: NodeType, title?: string) => Promise<string | null>;
  duplicateNode: (nodeId: string) => Promise<void>;
  updateNode: (nodeId: string, updates: Partial<BinderNode>) => Promise<void>;
  deleteNode: (nodeId: string) => Promise<void>;
  moveNode: (nodeId: string, targetParentId: string | null, targetIndex: number) => Promise<void>;
  setFoldersExpanded: (expanded: boolean) => Promise<void>;
  updateProjectSettings: (settings: Partial<ProjectSettings>) => Promise<void>;

  updateActiveDocumentContent: (content: JSONContent, plainText: string, wordCount: number, charCount: number) => void;
  openCollaborativeDocument: (projectId: string, documentId: string) => Promise<CollaborativeDocumentHandle | null>;
  updateActiveDocumentMeta: (updates: Partial<DocumentData>) => void;
  renameDocument: (documentId: string, title: string) => Promise<void>;
  saveActiveDocumentNow: () => Promise<void>;
  loadManuscriptDocuments: () => Promise<void>;
  updateManuscriptDocument: (
    documentId: string,
    content: JSONContent,
    plainText: string,
    wordCount: number,
    charCount: number
  ) => void;
  focusManuscriptDocument: (documentId: string) => void;
  flushManuscriptDocuments: () => Promise<void>;
  resetManuscript: () => void;

  exportCurrentProject: () => Promise<string>;
  exportProject: (projectId: string) => Promise<string>;
  exportAllProjects: () => Promise<string>;
  importAllProjects: (jsonContent: string) => Promise<number>;
  estimateLocalStorageUsage: () => Promise<number>;
  importProjectBundle: (jsonContent: string) => Promise<boolean>;
  saveAutomaticBackup: () => Promise<string | null>;

  refreshSnapshots: () => Promise<void>;
  createSnapshot: (label: string) => Promise<void>;
  createSafetySnapshot: (label: string) => Promise<ProjectSnapshot | null>;
  restoreSnapshot: (snapshotId: string) => Promise<void>;
  deleteSnapshot: (snapshotId: string) => Promise<void>;
}

export const useProjectStore = create<ProjectState>((set, get) => {
  const fail = (message: string, error: unknown): void => {
    console.error(message, error);
    set({ errorMessage: message });
  };

  const blockReadOnlyWrite = (): boolean => {
    if (!get().projectReadOnly) return false;
    set({ errorMessage: 'This project was created with a newer version and is open read-only.' });
    return true;
  };

  const watchProjectUpdates = (projectId: string | null): void => {
    projectSyncChannel?.close();
    projectSyncChannel = null;
    if (!projectId || typeof BroadcastChannel === 'undefined') return;

    projectSyncChannel = new BroadcastChannel(`aether-project:${encodeURIComponent(projectId)}`);
    projectSyncChannel.onmessage = (event: MessageEvent<unknown>) => {
      if (event.data !== 'project-update') return;
      void (async () => {
        const manifest = await storage.loadProjectManifest(projectId);
        if (!manifest || get().activeProject?.id !== projectId) return;
        const projectReadOnly = await storage.isProjectReadOnly(projectId);
        const current = get();
        const activeDocumentStillExists =
          current.activeDocumentId === null ||
          manifest.tree.some((node) => node.id === current.activeDocumentId && node.type !== 'folder');
        set({
          activeProject: manifest,
          projectReadOnly,
          ...(activeDocumentStillExists
            ? {}
            : { activeDocumentId: null, activeDocument: null, manuscriptDocuments: {} }),
        });
      })().catch((error: unknown) => {
        fail('Could not synchronize the project structure from another tab.', error);
      });
    };
  };

  const persistActiveDocument = async (): Promise<void> => {
    const { activeDocument, activeProject } = get();
    if (!activeDocument || !activeProject || get().projectReadOnly) return;

    set({ autoSaveStatus: 'saving' });
    try {
      await storage.saveDocument(activeProject.id, activeDocument);

      // Mirror the cached counters into the in-memory tree so the binder and
      // the status bar stay accurate without reloading the project.
      const project = get().activeProject;
      if (!project) {
        set({ autoSaveStatus: 'saved' });
        return;
      }
      set((state) => ({
        autoSaveStatus: 'saved',
        // A successful save invalidates an earlier save failure.
        errorMessage: state.errorMessage === SAVE_ERROR_MESSAGE ? null : state.errorMessage,
        activeProject: {
          ...project,
          tree: project.tree.map((node) =>
            node.id === activeDocument.id
              ? { ...node, wordCount: activeDocument.wordCount, updatedAt: activeDocument.updatedAt }
              : node
          ),
        },
      }));
    } catch (error) {
      console.error(SAVE_ERROR_MESSAGE, error);
      set({ autoSaveStatus: 'error', errorMessage: SAVE_ERROR_MESSAGE });
    }
  };

  const scheduleSave = (delay: number): void => {
    clearSaveTimer();
    saveTimer = setTimeout(() => {
      saveTimer = null;
      void persistActiveDocument();
    }, delay);
  };

  const scheduleManuscriptSave = (documentId: string): void => {
    const existing = manuscriptSaveTimers.get(documentId);
    if (existing) clearTimeout(existing);

    manuscriptSaveTimers.set(
      documentId,
      setTimeout(() => {
        manuscriptSaveTimers.delete(documentId);
        void (async () => {
          const { activeProject, manuscriptDocuments } = get();
          const document = manuscriptDocuments[documentId];
          if (!activeProject || !document) return;

          try {
            await storage.saveDocument(activeProject.id, document);
            const project = get().activeProject;
            if (!project) {
              set({ autoSaveStatus: 'saved' });
              return;
            }
            set({
              autoSaveStatus: 'saved',
              activeProject: {
                ...project,
                tree: project.tree.map((node) =>
                  node.id === documentId
                    ? { ...node, wordCount: document.wordCount, updatedAt: document.updatedAt }
                    : node
                ),
              },
            });
          } catch (error) {
            console.error(SAVE_ERROR_MESSAGE, error);
            set({ autoSaveStatus: 'error', errorMessage: SAVE_ERROR_MESSAGE });
          }
        })();
      }, AUTOSAVE_DELAY_MS)
    );
  };

  const stopAutomaticSnapshots = (): void => {
    if (automaticSnapshotTimer !== null) clearInterval(automaticSnapshotTimer);
    automaticSnapshotTimer = null;
    lastDocumentActivityAt = 0;
    automaticSnapshotInProgress = false;
  };

  const noteDocumentActivity = (): void => {
    lastDocumentActivityAt = Date.now();
    if (automaticSnapshotTimer !== null) return;
    automaticSnapshotTimer = setInterval(() => {
      const { activeProject, projectReadOnly } = get();
      if (
        !activeProject ||
        projectReadOnly ||
        Date.now() - lastDocumentActivityAt > AUTO_SNAPSHOT_INTERVAL_MS ||
        automaticSnapshotInProgress
      ) {
        return;
      }

      automaticSnapshotInProgress = true;
      void createSafetySnapshot('Automatic writing checkpoint')
        .catch((error: unknown) => {
          fail('Could not create an automatic writing checkpoint.', error);
        })
        .finally(() => {
          automaticSnapshotInProgress = false;
        });
    }, AUTO_SNAPSHOT_INTERVAL_MS);
  };

  const flushCurrentProject = async (): Promise<void> => {
    const { activeProject, projectReadOnly, autoSaveStatus } = get();
    if (!activeProject || projectReadOnly) return;
    if (saveTimer !== null || autoSaveStatus === 'dirty' || autoSaveStatus === 'saving') {
      await get().saveActiveDocumentNow();
    }
    if (get().autoSaveStatus === 'error') {
      throw new Error('Could not save the latest document changes before creating a safety snapshot.');
    }
    await get().flushManuscriptDocuments();
    if (get().autoSaveStatus === 'error') {
      throw new Error('Could not save the latest manuscript changes before creating a safety snapshot.');
    }
  };

  const createSafetySnapshot = async (label: string): Promise<ProjectSnapshot | null> => {
    const { activeProject, projectReadOnly } = get();
    if (!activeProject || projectReadOnly) return null;
    await flushCurrentProject();
    const snapshot = await storage.createSnapshot(activeProject.id, label);
    if (get().activeProject?.id === activeProject.id) await get().refreshSnapshots();
    return snapshot;
  };

  return {
    recentProjects: [],
    activeProject: null,
    projectReadOnly: false,
    activeDocumentId: null,
    activeDocument: null,
    autoSaveStatus: 'saved',
    errorMessage: null,
    snapshots: [],
    manuscriptDocuments: {},
    manuscriptLoading: false,

    clearError: () => set({ errorMessage: null }),

    loadRecentProjects: async () => {
      try {
        set({
          recentProjects: await storage.getRecentProjects(),
          errorMessage: storage.getStartupWarning(),
        });
      } catch (error) {
        fail('Could not read the local project library.', error);
      }
    },

    createProject: async (templateId, title, author, targetWordCount) => {
      set({ autoSaveStatus: 'saving', errorMessage: null });
      try {
        const { manifest, documents } = createProjectFromTemplate(templateId, title, author, targetWordCount);
        const orderedManifest = { ...manifest, tree: normalizeBinderOrder(manifest.tree) };
        await storage.createProject(orderedManifest, documents);

        const first = firstDocumentNode(orderedManifest.tree);
        const document = first ? await storage.loadDocument(orderedManifest.id, first.id) : null;

        clearManuscriptTimers();
        set({
          activeProject: orderedManifest,
          projectReadOnly: false,
          activeDocumentId: first?.id ?? null,
          activeDocument: document,
          autoSaveStatus: 'saved',
          snapshots: [],
          manuscriptDocuments: {},
          manuscriptLoading: false,
        });
        watchProjectUpdates(orderedManifest.id);
        await get().loadRecentProjects();
        return true;
      } catch (error) {
        fail('Could not create the project in the local container.', error);
        return false;
      }
    },

    openProject: async (projectId) => {
      set({ autoSaveStatus: 'saving', errorMessage: null });
      try {
        stopAutomaticSnapshots();
        const manifest = await storage.loadProjectManifest(projectId);
        if (!manifest) {
          fail('That project is no longer present in the local container.', new Error(`Missing manifest ${projectId}`));
          return false;
        }
        const projectReadOnly = await storage.isProjectReadOnly(projectId);

        // Mark the project as recently opened.
        const recents = await storage.getRecentProjects();
        const index = recents.findIndex((record) => record.id === projectId);
        if (index !== -1) {
          recents[index] = { ...recents[index], lastOpenedAt: nowIso() };
          await storage.saveRecentProjects(recents);
        }

        const first = firstDocumentNode(manifest.tree);
        const document = first ? await storage.loadDocument(manifest.id, first.id) : null;

        clearManuscriptTimers();
        set({
          activeProject: manifest,
          projectReadOnly,
          activeDocumentId: first?.id ?? null,
          activeDocument: document,
          autoSaveStatus: 'saved',
          recentProjects: recents,
          manuscriptDocuments: {},
          manuscriptLoading: false,
        });
        watchProjectUpdates(manifest.id);
        await get().refreshSnapshots();
        return true;
      } catch (error) {
        fail('Could not open that project.', error);
        return false;
      }
    },

    closeProject: async () => {
      clearSaveTimer();
      try {
        await createSafetySnapshot('Automatic session checkpoint');
      } catch (error) {
        fail('Could not finish saving the project before closing it.', error);
        return;
      } finally {
        stopAutomaticSnapshots();
      }
      watchProjectUpdates(null);
      set({
        activeProject: null,
        projectReadOnly: false,
        activeDocumentId: null,
        activeDocument: null,
        snapshots: [],
        manuscriptDocuments: {},
        manuscriptLoading: false,
        autoSaveStatus: 'saved',
        errorMessage: null,
      });
      void get().saveAutomaticBackup().catch((error: unknown) => {
        fail('The project closed, but its automatic backup could not be written.', error);
      });
    },

    deleteProject: async (projectId) => {
      try {
        clearSaveTimer();
        await storage.deleteProject(projectId);
        if (get().activeProject?.id === projectId) {
          // Do not flush the document: the project no longer exists.
          watchProjectUpdates(null);
          clearManuscriptTimers();
          set({
            activeProject: null,
            projectReadOnly: false,
            activeDocumentId: null,
            activeDocument: null,
            snapshots: [],
            manuscriptDocuments: {},
            manuscriptLoading: false,
            autoSaveStatus: 'saved',
          });
        }
        await get().loadRecentProjects();
      } catch (error) {
        fail('Could not delete the project.', error);
      }
    },

    togglePinRecent: async (projectId) => {
      try {
        const recents = await storage.getRecentProjects();
        const updated = recents.map((record) =>
          record.id === projectId ? { ...record, pinned: !record.pinned } : record
        );
        await storage.saveRecentProjects(updated);
        set({ recentProjects: updated });
      } catch (error) {
        fail('Could not update the project library.', error);
      }
    },

    removeFromRecentList: async (projectId) => {
      try {
        const recents = await storage.getRecentProjects();
        const updated = recents.filter((record) => record.id !== projectId);
        await storage.saveRecentProjects(updated);
        set({ recentProjects: updated });
      } catch (error) {
        fail('Could not update the project library.', error);
      }
    },

    selectNode: async (nodeId) => {
      const { activeProject, activeDocument } = get();
      if (!activeProject) return;

      const node = activeProject.tree.find((entry) => entry.id === nodeId);
      if (!node || node.type === 'folder') return;

      if (activeDocument && activeDocument.id !== nodeId) {
        clearSaveTimer();
        try {
          await storage.saveDocument(activeProject.id, activeDocument);
        } catch (error) {
          fail(SAVE_ERROR_MESSAGE, error);
        }
      }

      try {
        const document = await storage.loadDocument(activeProject.id, nodeId);
        if (!document) {
          fail('The content of that document is missing from the local container.', new Error(`Missing document ${nodeId}`));
          return;
        }
        set({ activeDocumentId: nodeId, activeDocument: document, autoSaveStatus: 'saved', errorMessage: null });
      } catch (error) {
        fail('Could not open that document.', error);
      }
    },

    createNode: async (parentId, type, title) => {
      if (blockReadOnlyWrite()) return null;
      const { activeProject } = get();
      if (!activeProject) return null;

      const timestamp = nowIso();
      const id = createId('node');
      const baseTree = normalizeBinderOrder(activeProject.tree);
      const siblings = baseTree
        .filter((node) => node.parentId === parentId)
        .sort(bySortOrder);
      const nodeTitle = title?.trim() || DEFAULT_TITLES[type];

      const newNode: BinderNode = {
        id,
        parentId,
        type,
        title: nodeTitle,
        expanded: type === 'folder' ? true : undefined,
        sortOrder: siblings.length,
        orderKey: orderKeyAt(baseTree, parentId, siblings.length),
        wordCount: type === 'folder' ? undefined : 0,
        createdAt: timestamp,
        updatedAt: timestamp,
      };

      try {
        await storage.saveBinderChanges(
          activeProject.id,
          [newNode],
          parentId === null ? [] : [{ id: parentId, changes: { expanded: true } }],
          [],
          timestamp
        );
        const manifest = await storage.loadProjectManifest(activeProject.id);
        if (!manifest) throw new Error(`Project ${activeProject.id} disappeared after creating an item.`);
        if (type !== 'folder') {
          await storage.saveDocument(manifest.id, createEmptyDocument(manifest.id, id, nodeTitle, timestamp));
        }
        set({ activeProject: manifest });
        if (type !== 'folder') await get().selectNode(id);
        return id;
      } catch (error) {
        fail('Could not create the new item.', error);
        return null;
      }
    },

    duplicateNode: async (nodeId) => {
      if (blockReadOnlyWrite()) return;
      const { activeProject } = get();
      if (!activeProject) return;

      const baseTree = normalizeBinderOrder(activeProject.tree);
      const source = baseTree.find((node) => node.id === nodeId);
      if (!source) return;

      const timestamp = nowIso();
      const subtreeIds = collectSubtreeIds(baseTree, nodeId);
      const idMap = new Map(subtreeIds.map((id) => [id, createId('node')]));
      const rootCopyId = idMap.get(nodeId);
      if (!rootCopyId) return;

      const nextSortOrder = baseTree.filter((node) => node.parentId === source.parentId).length;
      const nextOrderKey = orderKeyAt(baseTree, source.parentId, nextSortOrder);

      const copies: BinderNode[] = [];
      for (const originalId of subtreeIds) {
        const original = activeProject.tree.find((node) => node.id === originalId);
        const copyId = idMap.get(originalId);
        if (!original || !copyId) continue;

        const isRoot = originalId === nodeId;
        copies.push({
          ...original,
          id: copyId,
          parentId: isRoot ? original.parentId : idMap.get(original.parentId ?? '') ?? null,
          title: isRoot ? `${original.title} (Copy)` : original.title,
          sortOrder: isRoot ? nextSortOrder : original.sortOrder,
          orderKey: isRoot ? nextOrderKey : original.orderKey,
          createdAt: timestamp,
          updatedAt: timestamp,
        });
      }

      try {
        await storage.saveBinderChanges(
          activeProject.id,
          copies,
          source.parentId === null ? [] : [{ id: source.parentId, changes: { expanded: true } }],
          [],
          timestamp
        );
        const manifest = await storage.loadProjectManifest(activeProject.id);
        if (!manifest) throw new Error(`Project ${activeProject.id} disappeared after duplicating an item.`);

        for (const originalId of subtreeIds) {
          const original = activeProject.tree.find((node) => node.id === originalId);
          const copyId = idMap.get(originalId);
          if (!original || !copyId || original.type === 'folder') continue;

          const document = await storage.loadDocument(manifest.id, originalId);
          const copy: DocumentData = document
            ? {
                ...document,
                id: copyId,
                projectId: manifest.id,
                title: originalId === nodeId ? `${document.title} (Copy)` : document.title,
              }
            : createEmptyDocument(manifest.id, copyId, original.title, timestamp);
          await storage.saveDocument(manifest.id, copy);
        }

        set({ activeProject: manifest });
        await get().selectNode(rootCopyId);
      } catch (error) {
        fail('Could not duplicate that item.', error);
      }
    },

    updateNode: async (nodeId, updates) => {
      if (blockReadOnlyWrite()) return;
      const { activeProject, activeDocument } = get();
      if (!activeProject) return;

      const timestamp = nowIso();
      try {
        await storage.saveBinderChanges(
          activeProject.id,
          [],
          [{ id: nodeId, changes: { ...updates, updatedAt: timestamp } }],
          [],
          timestamp
        );
        const manifest = await storage.loadProjectManifest(activeProject.id);
        if (!manifest) throw new Error(`Project ${activeProject.id} disappeared after updating an item.`);
        set({ activeProject: manifest });

        const node = manifest.tree.find((entry) => entry.id === nodeId);
        if (!node || node.type === 'folder' || updates.title === undefined) return;

        // Keep the document record in sync so renamed items survive a reopen.
        const document =
          activeDocument?.id === nodeId ? activeDocument : await storage.loadDocument(manifest.id, nodeId);
        if (!document || document.title === updates.title) return;

        const renamed: DocumentData = { ...document, title: updates.title };
        await storage.saveDocument(manifest.id, renamed);
        if (activeDocument?.id === nodeId) set({ activeDocument: renamed });
      } catch (error) {
        fail('Could not update that item.', error);
      }
    },

    deleteNode: async (nodeId) => {
      if (blockReadOnlyWrite()) return;
      const { activeProject, activeDocument, activeDocumentId } = get();
      if (!activeProject) return;

      const baseTree = normalizeBinderOrder(activeProject.tree);
      const removedIds = collectSubtreeIds(baseTree, nodeId);
      const removedIdSet = new Set(removedIds);
      const removedNodes = baseTree.filter((node) => removedIdSet.has(node.id));
      const timestamp = nowIso();

      try {
        if (removedNodes.some((node) => node.type !== 'folder')) {
          await createSafetySnapshot(`Before deleting ${removedNodes.find((node) => node.id === nodeId)?.title ?? 'documents'}`);
        }
        clearSaveTimer();
        await storage.saveBinderChanges(activeProject.id, [], [], removedIds, timestamp);
        const manifest = await storage.loadProjectManifest(activeProject.id);
        if (!manifest) throw new Error(`Project ${activeProject.id} disappeared after deleting an item.`);

        // Remove the stored content of every deleted document, otherwise the
        // payload would stay in the container forever.
        for (const removed of removedNodes) {
          if (removed.type !== 'folder') await storage.deleteDocument(manifest.id, removed.id);
        }

        let nextDocumentId = activeDocumentId;
        let nextDocument = activeDocument;
        if (nextDocumentId !== null && removedIdSet.has(nextDocumentId)) {
          const next = firstDocumentNode(manifest.tree);
          nextDocumentId = next?.id ?? null;
          nextDocument = next ? await storage.loadDocument(manifest.id, next.id) : null;
        }

        set({
          activeProject: manifest,
          activeDocumentId: nextDocumentId,
          activeDocument: nextDocument,
          autoSaveStatus: 'saved',
        });
      } catch (error) {
        fail('Could not delete that item.', error);
      }
    },

    moveNode: async (nodeId, targetParentId, targetIndex) => {
      if (blockReadOnlyWrite()) return;
      const { activeProject } = get();
      if (!activeProject) return;

      const tree = normalizeBinderOrder(activeProject.tree);
      const node = tree.find((entry) => entry.id === nodeId);
      if (!node) return;
      if (targetParentId !== null) {
        const parent = tree.find((entry) => entry.id === targetParentId && entry.type === 'folder');
        if (!parent) return;
        // Moving a folder into itself (or into its own child) would detach the
        // whole branch from the tree, so it is rejected.
        if (targetParentId === nodeId || isDescendant(tree, nodeId, targetParentId)) return;
      }

      const siblings = tree.filter((entry) => entry.parentId === targetParentId && entry.id !== nodeId).sort(bySortOrder);
      const insertAt = Math.max(0, Math.min(targetIndex, siblings.length));

      const nextOrderKey = orderKeyAt(
        tree.filter((entry) => entry.id !== nodeId),
        targetParentId,
        insertAt
      );
      const timestamp = nowIso();
      try {
        await storage.moveBinderNode(activeProject.id, nodeId, targetParentId, nextOrderKey, insertAt, timestamp);
        const manifest = await storage.loadProjectManifest(activeProject.id);
        if (!manifest) throw new Error(`Project ${activeProject.id} disappeared after moving an item.`);
        set({ activeProject: manifest });
      } catch (error) {
        fail('Could not move that item.', error);
      }
    },

    setFoldersExpanded: async (expanded) => {
      if (blockReadOnlyWrite()) return;
      const { activeProject } = get();
      if (!activeProject) return;

      const timestamp = nowIso();
      const updates = normalizeBinderOrder(activeProject.tree)
        .filter((node) => node.type === 'folder')
        .map((node) => ({ id: node.id, changes: { expanded, updatedAt: timestamp } }));
      try {
        await storage.saveBinderChanges(activeProject.id, [], updates, [], timestamp);
        const manifest = await storage.loadProjectManifest(activeProject.id);
        if (!manifest) throw new Error(`Project ${activeProject.id} disappeared while updating the binder.`);
        set({ activeProject: manifest });
      } catch (error) {
        fail('Could not update the binder.', error);
      }
    },

    updateProjectSettings: async (settings) => {
      if (blockReadOnlyWrite()) return;
      const { activeProject } = get();
      if (!activeProject) return;

      const timestamp = nowIso();
      const nextSettings: ProjectSettings = {
        ...activeProject.settings,
        ...settings,
        pageView: normalizePageView(settings.pageView ?? activeProject.settings.pageView),
      };

      try {
        await storage.saveProjectSettings(activeProject.id, nextSettings, timestamp);
        const manifest = await storage.loadProjectManifest(activeProject.id);
        if (!manifest) throw new Error(`Project ${activeProject.id} disappeared while updating its settings.`);
        set({ activeProject: manifest });
      } catch (error) {
        fail('Could not save the shared project settings.', error);
        throw error;
      }
    },

    updateActiveDocumentContent: (content, plainText, wordCount, charCount) => {
      if (blockReadOnlyWrite()) return;
      const { activeDocument } = get();
      if (!activeDocument) return;
      noteDocumentActivity();

      set({
        activeDocument: { ...activeDocument, content, plainText, wordCount, charCount, updatedAt: nowIso() },
        autoSaveStatus: 'dirty',
      });
      scheduleSave(AUTOSAVE_DELAY_MS);
    },

    openCollaborativeDocument: (projectId, documentId) =>
      storage.openCollaborativeDocument(projectId, documentId),

    updateActiveDocumentMeta: (updates) => {
      if (blockReadOnlyWrite()) return;
      const { activeDocument } = get();
      if (!activeDocument) return;

      set({
        activeDocument: { ...activeDocument, ...updates, updatedAt: nowIso() },
        autoSaveStatus: 'dirty',
      });
      scheduleSave(META_SAVE_DELAY_MS);
    },

    renameDocument: async (documentId, title) => {
      if (blockReadOnlyWrite()) return;
      const trimmed = title.trim();
      if (!trimmed) return;
      await get().updateNode(documentId, { title: trimmed });
    },

    saveActiveDocumentNow: async () => {
      if (blockReadOnlyWrite()) return;
      clearSaveTimer();
      await persistActiveDocument();
    },

    loadManuscriptDocuments: async () => {
      const { activeProject } = get();
      if (!activeProject) {
        set({ manuscriptDocuments: {}, manuscriptLoading: false });
        return;
      }

      const root = resolveManuscriptFolder(activeProject.tree);
      if (!root) {
        set({ manuscriptDocuments: {}, manuscriptLoading: false });
        return;
      }

      set({ manuscriptLoading: true });
      try {
        const nodes = collectManuscriptNodes(activeProject.tree, root.id);
        // Keep documents already in memory: they may hold edits whose debounced
        // save has not fired yet, and reloading would resurrect the older copy.
        const existing = get().manuscriptDocuments;
        const entries: Record<string, DocumentData> = {};
        for (const node of nodes) {
          const inMemory = existing[node.id];
          if (inMemory) {
            entries[node.id] = inMemory;
            continue;
          }
          const document = await storage.loadDocument(activeProject.id, node.id);
          if (document) entries[node.id] = document;
        }
        set({ manuscriptDocuments: entries, manuscriptLoading: false });
      } catch (error) {
        fail('Could not open the manuscript.', error);
        set({ manuscriptLoading: false });
      }
    },

    updateManuscriptDocument: (documentId, content, plainText, wordCount, charCount) => {
      if (blockReadOnlyWrite()) return;
      const existing = get().manuscriptDocuments[documentId];
      if (!existing) return;
      noteDocumentActivity();

      const updated: DocumentData = {
        ...existing,
        content,
        plainText,
        wordCount,
        charCount,
        updatedAt: nowIso(),
      };

      set((state) => ({
        manuscriptDocuments: { ...state.manuscriptDocuments, [documentId]: updated },
        activeDocument: state.activeDocumentId === documentId ? updated : state.activeDocument,
        autoSaveStatus: 'dirty',
      }));
      scheduleManuscriptSave(documentId);
    },

    focusManuscriptDocument: (documentId) => {
      const document = get().manuscriptDocuments[documentId];
      if (!document) return;
      set({ activeDocumentId: documentId, activeDocument: document });
    },

    flushManuscriptDocuments: async () => {
      if (blockReadOnlyWrite()) return;
      const pending = [...manuscriptSaveTimers.keys()];
      clearManuscriptTimers();

      const { activeProject, manuscriptDocuments } = get();
      if (!activeProject || pending.length === 0) return;

      for (const documentId of pending) {
        const document = manuscriptDocuments[documentId];
        if (!document) continue;
        try {
          await storage.saveDocument(activeProject.id, document);
        } catch (error) {
          console.error(SAVE_ERROR_MESSAGE, error);
          set({ autoSaveStatus: 'error', errorMessage: SAVE_ERROR_MESSAGE });
          return;
        }
      }
      set({ autoSaveStatus: 'saved' });
    },

    resetManuscript: () => {
      clearManuscriptTimers();
      set({ manuscriptDocuments: {}, manuscriptLoading: false });
    },

    exportCurrentProject: async () => {
      const { activeProject } = get();
      if (!activeProject) throw new Error('There is no open project to export.');
      return get().exportProject(activeProject.id);
    },

    exportProject: async (projectId) => {
      try {
        const state = get();
        if (state.activeProject?.id === projectId) {
          const pendingManuscriptIds = [...manuscriptSaveTimers.keys()];
          const hasPendingActiveSave =
            saveTimer !== null || (state.autoSaveStatus === 'saving' && pendingManuscriptIds.length === 0);
          clearSaveTimer();
          if (hasPendingActiveSave) await persistActiveDocument();
          if (get().autoSaveStatus === 'error') {
            scheduleSave(AUTOSAVE_DELAY_MS);
            throw new Error('Could not save the latest document changes. The project export was not created.');
          }

          clearManuscriptTimers();
          const { manuscriptDocuments } = get();
          try {
            for (const documentId of pendingManuscriptIds) {
              const document = manuscriptDocuments[documentId];
              if (document) await storage.saveDocument(projectId, document);
            }
          } catch (error) {
            for (const documentId of pendingManuscriptIds) scheduleManuscriptSave(documentId);
            throw error;
          }
        }

        return await storage.exportProjectBundle(projectId);
      } catch (error) {
        fail(error instanceof Error ? error.message : 'Could not export that project.', error);
        throw error;
      }
    },

    exportAllProjects: async () => {
      const { autoSaveStatus } = get();
      const pendingManuscriptIds = [...manuscriptSaveTimers.keys()];
      const hasPendingActiveSave =
        saveTimer !== null || (autoSaveStatus === 'saving' && pendingManuscriptIds.length === 0);
      clearSaveTimer();
      if (hasPendingActiveSave) await persistActiveDocument();
      if (get().autoSaveStatus === 'error') {
        throw new Error('Could not save the latest document changes. The backup was not created.');
      }

      clearManuscriptTimers();
      const { activeProject, manuscriptDocuments } = get();
      if (activeProject) {
        try {
          for (const documentId of pendingManuscriptIds) {
            const document = manuscriptDocuments[documentId];
            if (!document) continue;
            await storage.saveDocument(activeProject.id, document);
          }
          if (pendingManuscriptIds.length > 0) set({ autoSaveStatus: 'saved' });
        } catch (error) {
          fail('Could not save the latest manuscript changes. The backup was not created.', error);
          throw error;
        }
      }

      try {
        return await storage.exportAllProjects();
      } catch (error) {
        fail('Could not export the full backup.', error);
        throw error;
      }
    },

    saveAutomaticBackup: async () => {
      try {
        const folder = await getAutomaticBackupFolder();
        if (!folder) return null;
        if (folder.permission !== 'granted') {
          throw new Error('Automatic backup folder access expired. Choose the folder again in Preferences.');
        }
        const content = await get().exportAllProjects();
        const filename = await writeAutomaticBackup(content);
        try {
          markFullBackupCreated();
        } catch (error) {
          console.error('The automatic backup was saved, but its reminder status could not be updated.', error);
        }
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('aether:automatic-backup', { detail: { filename } }));
        }
        return filename;
      } catch (error) {
        fail('Could not write the automatic backup.', error);
        if (typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent('aether:automatic-backup-error', {
              detail: { message: error instanceof Error ? error.message : 'Could not write the automatic backup.' },
            })
          );
        }
        throw error;
      }
    },

    importAllProjects: async (jsonContent) => {
      try {
        if (get().activeProject && !get().projectReadOnly) {
          await createSafetySnapshot('Before importing a full library backup');
        }
        const importedCount = await storage.importAllProjects(jsonContent);
        await get().loadRecentProjects();
        return importedCount;
      } catch (error) {
        fail(error instanceof Error ? error.message : 'Could not import the full backup.', error);
        throw error;
      }
    },

    estimateLocalStorageUsage: () => storage.estimateLocalStorageUsage(),

    importProjectBundle: async (jsonContent) => {
      try {
        if (get().activeProject && !get().projectReadOnly) {
          await createSafetySnapshot('Before importing a project');
        }
        const manifest = await storage.importProjectBundle(jsonContent);
        await get().loadRecentProjects();
        return await get().openProject(manifest.id);
      } catch (error) {
        fail(error instanceof Error ? error.message : 'Could not import the selected file.', error);
        return false;
      }
    },

    refreshSnapshots: async () => {
      const { activeProject } = get();
      if (!activeProject) {
        set({ snapshots: [] });
        return;
      }
      try {
        set({ snapshots: await storage.listSnapshots(activeProject.id) });
      } catch (error) {
        fail('Could not read the project history.', error);
      }
    },

    createSnapshot: async (label) => {
      if (blockReadOnlyWrite()) return;
      const { activeProject } = get();
      if (!activeProject) return;
      try {
        await storage.createSnapshot(activeProject.id, label.trim() || `Snapshot ${new Date().toLocaleString()}`);
        await get().refreshSnapshots();
      } catch (error) {
        fail('Could not create a snapshot. The local container may be full.', error);
      }
    },

    createSafetySnapshot: (label) => createSafetySnapshot(label),

    restoreSnapshot: async (snapshotId) => {
      if (blockReadOnlyWrite()) return;
      const { activeProject } = get();
      if (!activeProject) return;
      try {
        await createSafetySnapshot('Before restoring a snapshot');
        clearSaveTimer();
        const manifest = await storage.restoreSnapshot(activeProject.id, snapshotId);
        const first = firstDocumentNode(manifest.tree);
        const document = first ? await storage.loadDocument(manifest.id, first.id) : null;
        set({
          activeProject: manifest,
          activeDocumentId: first?.id ?? null,
          activeDocument: document,
          autoSaveStatus: 'saved',
          errorMessage: null,
        });
        await get().refreshSnapshots();
      } catch (error) {
        fail('Could not restore that snapshot.', error);
      }
    },

    deleteSnapshot: async (snapshotId) => {
      if (blockReadOnlyWrite()) return;
      const { activeProject } = get();
      if (!activeProject) return;
      try {
        await storage.deleteSnapshot(activeProject.id, snapshotId);
        await get().refreshSnapshots();
      } catch (error) {
        fail('Could not delete that snapshot.', error);
      }
    },
  };
});
