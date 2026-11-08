/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  BinderNode,
  DocumentData,
  DocumentSnapshot,
  ProjectManifest,
  ProjectSettings,
  ProjectSnapshot,
  RecentProjectRecord,
} from '../types/project.ts';
import { normalizeProjectSettings } from '../utils/pageLayout.ts';
import type { StorageAdapter } from './StorageAdapter';

const RECENT_PROJECTS_KEY = 'aether_recent_projects_v1';
const MANIFEST_PREFIX = 'aether_manifest_';
const DOCUMENT_PREFIX = 'aether_doc_';
const SNAPSHOT_PREFIX = 'aether_snapshot_';

/** Older snapshots beyond this limit are pruned to protect the storage quota. */
const MAX_SNAPSHOTS_PER_PROJECT = 20;

interface ProjectBundle {
  format: string;
  schemaVersion?: number;
  exportedAt: string;
  manifest: ProjectManifest;
  documents: Record<string, DocumentData>;
}

export interface BackupProject {
  manifest: ProjectManifest;
  documents: Record<string, DocumentData>;
  snapshots: ProjectSnapshot[];
}

export interface ApplicationBackup {
  format: 'aether_full_backup';
  schemaVersion: 1;
  exportedAt: string;
  recentProjects: RecentProjectRecord[];
  projects: BackupProject[];
}

function isProjectBundle(value: unknown): value is ProjectBundle {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<ProjectBundle>;
  return (
    typeof candidate.manifest === 'object' &&
    candidate.manifest !== null &&
    typeof (candidate.manifest as ProjectManifest).id === 'string' &&
    typeof candidate.documents === 'object' &&
    candidate.documents !== null &&
    (candidate.schemaVersion === undefined || candidate.schemaVersion === 1)
  );
}

export function isApplicationBackup(value: unknown): value is ApplicationBackup {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<ApplicationBackup>;
  if (
    candidate.format !== 'aether_full_backup' ||
    candidate.schemaVersion !== 1 ||
    !Array.isArray(candidate.recentProjects) ||
    !Array.isArray(candidate.projects)
  ) {
    return false;
  }

  const projectIds = new Set<string>();
  for (const project of candidate.projects) {
    if (
      typeof project !== 'object' ||
      project === null ||
      typeof project.manifest !== 'object' ||
      project.manifest === null ||
      typeof project.manifest.id !== 'string' ||
      !Array.isArray(project.manifest.tree) ||
      typeof project.documents !== 'object' ||
      project.documents === null ||
      !Array.isArray(project.snapshots) ||
      projectIds.has(project.manifest.id)
    ) {
      return false;
    }
    projectIds.add(project.manifest.id);
  }

  return candidate.recentProjects.every(
    (record) =>
      typeof record === 'object' &&
      record !== null &&
      typeof record.id === 'string' &&
      typeof record.pinned === 'boolean' &&
      projectIds.has(record.id)
  );
}

function sumWords(tree: BinderNode[]): number {
  return tree.reduce((total, node) => total + (node.wordCount ?? 0), 0);
}

function countDocuments(tree: BinderNode[]): number {
  return tree.filter((node) => node.type !== 'folder').length;
}

export class LocalStorageAdapter implements StorageAdapter {
  private manifestKey(projectId: string): string {
    return `${MANIFEST_PREFIX}${projectId}`;
  }

  private documentKey(projectId: string, documentId: string): string {
    return `${DOCUMENT_PREFIX}${projectId}_${documentId}`;
  }

  private documentKeyPrefix(projectId: string): string {
    return `${DOCUMENT_PREFIX}${projectId}_`;
  }

  private snapshotKey(projectId: string, snapshotId: string): string {
    return `${SNAPSHOT_PREFIX}${projectId}_${snapshotId}`;
  }

  private snapshotKeyPrefix(projectId: string): string {
    return `${SNAPSHOT_PREFIX}${projectId}_`;
  }

  private readJson<T>(key: string): T | null {
    const raw = localStorage.getItem(key);
    if (raw === null) return null;
    try {
      return JSON.parse(raw) as T;
    } catch (error) {
      console.error(`Stored value for "${key}" is not valid JSON`, error);
      return null;
    }
  }

  private keysWithPrefix(prefix: string): string[] {
    const keys: string[] = [];
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (key !== null && key.startsWith(prefix)) keys.push(key);
    }
    return keys;
  }

  private recordFor(manifest: ProjectManifest, previous: RecentProjectRecord | undefined): RecentProjectRecord {
    return {
      id: manifest.id,
      title: manifest.title,
      author: manifest.author,
      updatedAt: manifest.updatedAt,
      lastOpenedAt: new Date().toISOString(),
      pinned: previous?.pinned ?? false,
      totalWords: sumWords(manifest.tree),
      documentCount: countDocuments(manifest.tree),
      storageKey: manifest.id,
    };
  }

  async getRecentProjects(): Promise<RecentProjectRecord[]> {
    const stored = this.readJson<RecentProjectRecord[]>(RECENT_PROJECTS_KEY);
    return Array.isArray(stored) ? stored : [];
  }

  async saveRecentProjects(records: RecentProjectRecord[]): Promise<void> {
    localStorage.setItem(RECENT_PROJECTS_KEY, JSON.stringify(records));
  }

  async createProject(manifest: ProjectManifest, initialDocuments: Record<string, DocumentData>): Promise<void> {
    localStorage.setItem(this.manifestKey(manifest.id), JSON.stringify(manifest));

    for (const document of Object.values(initialDocuments)) {
      localStorage.setItem(this.documentKey(manifest.id, document.id), JSON.stringify(document));
    }

    const recents = await this.getRecentProjects();
    const previous = recents.find((record) => record.id === manifest.id);
    const record = this.recordFor(manifest, previous);
    await this.saveRecentProjects([record, ...recents.filter((entry) => entry.id !== manifest.id)]);
  }

  async loadProjectManifest(projectId: string): Promise<ProjectManifest | null> {
    const manifest = this.readJson<ProjectManifest>(this.manifestKey(projectId));
    if (!manifest) return null;
    return { ...manifest, settings: normalizeProjectSettings(manifest.settings ?? {}) };
  }

  async isProjectReadOnly(_projectId: string): Promise<boolean> {
    return false;
  }

  async saveProjectManifest(manifest: ProjectManifest): Promise<void> {
    const stamped: ProjectManifest = {
      ...manifest,
      settings: normalizeProjectSettings(manifest.settings ?? {}),
      updatedAt: new Date().toISOString(),
    };
    localStorage.setItem(this.manifestKey(stamped.id), JSON.stringify(stamped));

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
    const manifest = await this.loadProjectManifest(projectId);
    if (!manifest) throw new Error(`Project ${projectId} not found.`);
    await this.saveProjectManifest({
      ...manifest,
      settings: normalizeProjectSettings(settings),
      updatedAt,
    });
  }

  async moveBinderNode(
    projectId: string,
    nodeId: string,
    parentId: string | null,
    orderKey: string,
    sortOrder: number,
    updatedAt: string
  ): Promise<void> {
    const manifest = await this.loadProjectManifest(projectId);
    if (!manifest) throw new Error(`Project ${projectId} not found.`);
    const node = manifest.tree.find((entry) => entry.id === nodeId);
    if (!node) throw new Error(`Binder item ${nodeId} not found.`);
    const tree = manifest.tree.map((entry) =>
      entry.id === nodeId
        ? { ...entry, parentId, orderKey, sortOrder, updatedAt }
        : entry.id === parentId
          ? { ...entry, expanded: true }
          : entry
    );
    await this.saveProjectManifest({ ...manifest, tree, updatedAt });
  }

  async saveBinderChanges(
    projectId: string,
    additions: BinderNode[],
    updates: Array<{ id: string; changes: Partial<BinderNode> }>,
    deletes: string[],
    updatedAt: string
  ): Promise<void> {
    const manifest = await this.loadProjectManifest(projectId);
    if (!manifest) throw new Error(`Project ${projectId} not found.`);
    const deletedIds = new Set(deletes);
    const changedById = new Map(updates.map(({ id, changes }) => [id, changes]));
    const tree = manifest.tree
      .filter((node) => !deletedIds.has(node.id))
      .map((node) => ({ ...node, ...changedById.get(node.id) }));
    const existingIds = new Set(tree.map((node) => node.id));
    for (const node of additions) {
      if (!existingIds.has(node.id)) tree.push(node);
    }
    await this.saveProjectManifest({ ...manifest, tree, updatedAt });
  }

  async loadDocument(projectId: string, documentId: string): Promise<DocumentData | null> {
    return this.readJson<DocumentData>(this.documentKey(projectId, documentId));
  }

  async saveDocument(projectId: string, documentData: DocumentData): Promise<void> {
    const stamped: DocumentData = { ...documentData, updatedAt: new Date().toISOString() };
    localStorage.setItem(this.documentKey(projectId, stamped.id), JSON.stringify(stamped));

    const manifest = await this.loadProjectManifest(projectId);
    if (!manifest) return;

    const index = manifest.tree.findIndex((node) => node.id === stamped.id);
    if (index === -1) return;

    const node = manifest.tree.find((entry) => entry.id === stamped.id);
    if (!node) return;
    await this.saveBinderChanges(
      projectId,
      [],
      [{ id: stamped.id, changes: { wordCount: stamped.wordCount, updatedAt: stamped.updatedAt } }],
      [],
      stamped.updatedAt
    );
  }

  async deleteDocument(projectId: string, documentId: string): Promise<void> {
    localStorage.removeItem(this.documentKey(projectId, documentId));
  }

  async deleteProject(projectId: string): Promise<void> {
    localStorage.removeItem(this.manifestKey(projectId));

    for (const key of [
      ...this.keysWithPrefix(this.documentKeyPrefix(projectId)),
      ...this.keysWithPrefix(this.snapshotKeyPrefix(projectId)),
    ]) {
      localStorage.removeItem(key);
    }

    const recents = await this.getRecentProjects();
    await this.saveRecentProjects(recents.filter((record) => record.id !== projectId));
  }

  async createSnapshot(projectId: string, label: string): Promise<ProjectSnapshot> {
    const manifest = await this.loadProjectManifest(projectId);
    if (!manifest) throw new Error(`Project ${projectId} not found for snapshot creation`);

    const documents: Record<string, DocumentSnapshot> = {};
    for (const node of manifest.tree) {
      if (node.type === 'folder') continue;
      const document = await this.loadDocument(projectId, node.id);
      if (!document) continue;
      documents[node.id] = {
        id: document.id,
        title: document.title,
        content: document.content,
        plainText: document.plainText,
        wordCount: document.wordCount,
      };
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

    localStorage.setItem(this.snapshotKey(projectId, snapshot.id), JSON.stringify(snapshot));
    await this.pruneSnapshots(projectId);
    return snapshot;
  }

  async listSnapshots(projectId: string): Promise<ProjectSnapshot[]> {
    const snapshots: ProjectSnapshot[] = [];
    for (const key of this.keysWithPrefix(this.snapshotKeyPrefix(projectId))) {
      const snapshot = this.readJson<ProjectSnapshot>(key);
      if (snapshot && snapshot.projectId === projectId) snapshots.push(snapshot);
    }
    return snapshots.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }

  async deleteSnapshot(projectId: string, snapshotId: string): Promise<void> {
    localStorage.removeItem(this.snapshotKey(projectId, snapshotId));
  }

  async restoreSnapshot(projectId: string, snapshotId: string): Promise<ProjectManifest> {
    const snapshot = this.readJson<ProjectSnapshot>(this.snapshotKey(projectId, snapshotId));
    if (!snapshot) throw new Error(`Snapshot ${snapshotId} not found`);

    // Drop documents that were created after the snapshot was taken.
    for (const key of this.keysWithPrefix(this.documentKeyPrefix(projectId))) {
      const documentId = key.slice(this.documentKeyPrefix(projectId).length);
      if (!(documentId in snapshot.documents)) localStorage.removeItem(key);
    }

    for (const [documentId, snapshotDocument] of Object.entries(snapshot.documents)) {
      const existing = await this.loadDocument(projectId, documentId);
      const restored: DocumentData = {
        id: documentId,
        projectId,
        title: snapshotDocument.title,
        updatedAt: new Date().toISOString(),
        wordCount: snapshotDocument.wordCount,
        charCount: snapshotDocument.plainText.length,
        content: snapshotDocument.content,
        plainText: snapshotDocument.plainText,
        notes: existing?.notes ?? '',
        bookmarks: existing?.bookmarks ?? [],
        comments: existing?.comments ?? [],
      };
      localStorage.setItem(this.documentKey(projectId, documentId), JSON.stringify(restored));
    }

    const manifest: ProjectManifest = { ...snapshot.manifest, updatedAt: new Date().toISOString() };
    await this.saveProjectManifest(manifest);
    return manifest;
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

    const bundle: ProjectBundle = {
      format: 'aether_project_v1',
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      manifest,
      documents,
    };

    return JSON.stringify(bundle, null, 2);
  }

  async importProjectBundle(jsonContent: string): Promise<ProjectManifest> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonContent);
    } catch {
      throw new Error('The selected file is not valid JSON.');
    }

    if (!isProjectBundle(parsed)) {
      throw new Error('The selected file is not an .aether project bundle.');
    }

    // Never overwrite an existing project: give the import a fresh identity.
    const existing = await this.loadProjectManifest(parsed.manifest.id);
    const projectId = existing ? `proj_import_${Date.now()}` : parsed.manifest.id;
    const manifest: ProjectManifest = { ...parsed.manifest, id: projectId, updatedAt: new Date().toISOString() };
    const documents: Record<string, DocumentData> = {};
    for (const [documentId, document] of Object.entries(parsed.documents)) {
      documents[documentId] = { ...document, projectId };
    }

    await this.createProject(manifest, documents);
    return manifest;
  }

  async exportAllProjects(): Promise<string> {
    const projects: BackupProject[] = [];
    const recentProjects = await this.getRecentProjects();
    const recentIds = new Set(recentProjects.map((record) => record.id));
    for (const key of this.keysWithPrefix(MANIFEST_PREFIX)) {
      const manifest = this.readJson<ProjectManifest>(key);
      if (!manifest || typeof manifest.id !== 'string' || !Array.isArray(manifest.tree)) {
        throw new Error(`Could not export project data stored at "${key}".`);
      }

      const documents: Record<string, DocumentData> = {};
      for (const node of manifest.tree) {
        if (node.type === 'folder') continue;
        const document = await this.loadDocument(manifest.id, node.id);
        if (!document) {
          throw new Error(`Could not export "${node.title}": its document data is missing.`);
        }
        documents[node.id] = document;
      }

      const snapshots: ProjectSnapshot[] = [];
      for (const key of this.keysWithPrefix(this.snapshotKeyPrefix(manifest.id))) {
        const snapshot = this.readJson<ProjectSnapshot>(key);
        if (!snapshot) throw new Error(`Could not export the history item stored at "${key}".`);
        snapshots.push(snapshot);
      }

      projects.push({ manifest, documents, snapshots });
      if (!recentIds.has(manifest.id)) {
        recentProjects.push(this.recordFor(manifest, undefined));
        recentIds.add(manifest.id);
      }
    }

    const backup: ApplicationBackup = {
      format: 'aether_full_backup',
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      recentProjects,
      projects,
    };
    return JSON.stringify(backup, null, 2);
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
    const importedKeys: string[] = [];
    const sourceToImportedId = new Map<string, string>();

    try {
      for (const entry of parsed.projects) {
        const sourceId = entry.manifest.id;
        let projectId = sourceId;
        if (localStorage.getItem(this.manifestKey(projectId)) !== null) {
          do {
            projectId = `proj_import_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
          } while (localStorage.getItem(this.manifestKey(projectId)) !== null);
        }

        const manifest: ProjectManifest = {
          ...entry.manifest,
          id: projectId,
        };
        const documents: Record<string, DocumentData> = {};
        for (const [documentId, document] of Object.entries(entry.documents)) {
          if (document.id !== documentId || document.projectId !== sourceId) {
            throw new Error(`The backup contains invalid document data for project "${entry.manifest.title}".`);
          }
          documents[documentId] = { ...document, projectId };
        }
        for (const node of manifest.tree) {
          if (node.type !== 'folder' && !documents[node.id]) {
            throw new Error(`The backup is missing "${node.title}" in project "${manifest.title}".`);
          }
        }

        const manifestKey = this.manifestKey(projectId);
        localStorage.setItem(manifestKey, JSON.stringify(manifest));
        importedKeys.push(manifestKey);
        for (const document of Object.values(documents)) {
          const key = this.documentKey(projectId, document.id);
          localStorage.setItem(key, JSON.stringify(document));
          importedKeys.push(key);
        }
        for (const snapshot of entry.snapshots) {
          if (snapshot.projectId !== sourceId || !snapshot.id) {
            throw new Error(`The backup contains invalid history data for project "${manifest.title}".`);
          }
          const restoredSnapshot: ProjectSnapshot = {
            ...snapshot,
            projectId,
            manifest: { ...snapshot.manifest, id: projectId },
          };
          const key = this.snapshotKey(projectId, restoredSnapshot.id);
          localStorage.setItem(key, JSON.stringify(restoredSnapshot));
          importedKeys.push(key);
        }

        sourceToImportedId.set(sourceId, projectId);
      }

      const importedRecords: RecentProjectRecord[] = parsed.recentProjects.map((record) => {
        const projectId = sourceToImportedId.get(record.id);
        if (!projectId) throw new Error(`The backup references a missing project "${record.id}".`);
        return { ...record, id: projectId, storageKey: projectId };
      });
      const importedIds = new Set(importedRecords.map((record) => record.id));
      await this.saveRecentProjects([
        ...importedRecords,
        ...originalRecents.filter((record) => !importedIds.has(record.id)),
      ]);
    } catch (error) {
      for (const key of importedKeys) localStorage.removeItem(key);
      await this.saveRecentProjects(originalRecents);
      throw error;
    }

    return sourceToImportedId.size;
  }

  async estimateLocalStorageUsage(): Promise<number> {
    let characterCount = 0;
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (key === null) continue;
      const value = localStorage.getItem(key);
      characterCount += key.length + (value?.length ?? 0);
    }
    return characterCount * 2;
  }

  private async pruneSnapshots(projectId: string): Promise<void> {
    const snapshots = await this.listSnapshots(projectId);
    for (const stale of snapshots.slice(MAX_SNAPSHOTS_PER_PROJECT)) {
      await this.deleteSnapshot(projectId, stale.id);
    }
  }
}
