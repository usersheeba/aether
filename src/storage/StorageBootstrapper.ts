/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { LocalStorageAdapter } from './LocalStorageAdapter.ts';
import { hasConfirmedMigrationBackup } from './MigrationBackupConfirmation.ts';
import type { CollaborativeDocumentHandle } from './CollaborativeDocument';
import type { ApplicationBackup } from './LocalStorageAdapter';
import type { StorageAdapter } from './StorageAdapter';
import type {
  BinderNode,
  DocumentData,
  ProjectManifest,
  ProjectSettings,
  ProjectSnapshot,
  RecentProjectRecord,
} from '../types/project';

const MIGRATION_FAILURE_MESSAGE =
  'Could not verify the IndexedDB migration. Your original browser data is unchanged; the app is using it for now.';
const BACKUP_REQUIRED_MESSAGE =
  'Migration is paused. Export a full backup, save it outside this browser, then confirm below to continue.';

export class StorageBootstrapper implements StorageAdapter {
  private readonly legacy = new LocalStorageAdapter();
  private active: StorageAdapter = this.legacy;
  private initialization: Promise<void> | null = null;
  private startupWarning: string | null = null;

  private async initialize(): Promise<void> {
    if (this.initialization) return this.initialization;
    this.initialization = (async () => {
      try {
        if (typeof indexedDB === 'undefined') throw new Error('This browser does not support IndexedDB.');
        const { IndexedDbStorageAdapter } = await import('./IndexedDbStorageAdapter.ts');
        const indexedDb = new IndexedDbStorageAdapter();
        if (!(await indexedDb.isMigrated())) {
          if (!hasConfirmedMigrationBackup()) {
            this.startupWarning = BACKUP_REQUIRED_MESSAGE;
            this.active = this.legacy;
            return;
          }
          const legacyBackup = JSON.parse(await this.legacy.exportAllProjects()) as ApplicationBackup;
          await indexedDb.migrateFromLegacy(legacyBackup);
        }
        this.active = indexedDb;
      } catch (error) {
        console.error(MIGRATION_FAILURE_MESSAGE, error);
        this.startupWarning = MIGRATION_FAILURE_MESSAGE;
        this.active = this.legacy;
      }
    })();
    return this.initialization;
  }

  getStartupWarning(): string | null {
    return this.startupWarning;
  }

  private async adapter(): Promise<StorageAdapter> {
    await this.initialize();
    return this.active;
  }

  async getRecentProjects(): Promise<RecentProjectRecord[]> {
    return (await this.adapter()).getRecentProjects();
  }

  async saveRecentProjects(records: RecentProjectRecord[]): Promise<void> {
    return (await this.adapter()).saveRecentProjects(records);
  }

  async createProject(
    manifest: ProjectManifest,
    initialDocuments: Record<string, DocumentData>
  ): Promise<void> {
    return (await this.adapter()).createProject(manifest, initialDocuments);
  }

  async loadProjectManifest(projectId: string): Promise<ProjectManifest | null> {
    return (await this.adapter()).loadProjectManifest(projectId);
  }

  async isProjectReadOnly(projectId: string): Promise<boolean> {
    return (await this.adapter()).isProjectReadOnly(projectId);
  }

  async saveProjectManifest(manifest: ProjectManifest): Promise<void> {
    return (await this.adapter()).saveProjectManifest(manifest);
  }

  async saveProjectSettings(
    projectId: string,
    settings: ProjectSettings,
    updatedAt: string
  ): Promise<void> {
    return (await this.adapter()).saveProjectSettings(projectId, settings, updatedAt);
  }

  async moveBinderNode(
    projectId: string,
    nodeId: string,
    parentId: string | null,
    orderKey: string,
    sortOrder: number,
    updatedAt: string
  ): Promise<void> {
    return (await this.adapter()).moveBinderNode(projectId, nodeId, parentId, orderKey, sortOrder, updatedAt);
  }

  async saveBinderChanges(
    projectId: string,
    additions: BinderNode[],
    updates: Array<{ id: string; changes: Partial<BinderNode> }>,
    deletes: string[],
    updatedAt: string
  ): Promise<void> {
    return (await this.adapter()).saveBinderChanges(projectId, additions, updates, deletes, updatedAt);
  }

  async deleteProject(projectId: string): Promise<void> {
    return (await this.adapter()).deleteProject(projectId);
  }

  async loadDocument(projectId: string, documentId: string): Promise<DocumentData | null> {
    return (await this.adapter()).loadDocument(projectId, documentId);
  }

  async openCollaborativeDocument(
    projectId: string,
    documentId: string
  ): Promise<CollaborativeDocumentHandle | null> {
    const adapter = await this.adapter();
    if (adapter.openCollaborativeDocument) {
      return adapter.openCollaborativeDocument(projectId, documentId);
    }
    return null;
  }

  async saveDocument(projectId: string, documentData: DocumentData): Promise<void> {
    return (await this.adapter()).saveDocument(projectId, documentData);
  }

  async deleteDocument(projectId: string, documentId: string): Promise<void> {
    return (await this.adapter()).deleteDocument(projectId, documentId);
  }

  async createSnapshot(projectId: string, label: string): Promise<ProjectSnapshot> {
    return (await this.adapter()).createSnapshot(projectId, label);
  }

  async listSnapshots(projectId: string): Promise<ProjectSnapshot[]> {
    return (await this.adapter()).listSnapshots(projectId);
  }

  async deleteSnapshot(projectId: string, snapshotId: string): Promise<void> {
    return (await this.adapter()).deleteSnapshot(projectId, snapshotId);
  }

  async restoreSnapshot(projectId: string, snapshotId: string): Promise<ProjectManifest> {
    return (await this.adapter()).restoreSnapshot(projectId, snapshotId);
  }

  async exportProjectBundle(projectId: string): Promise<string> {
    return (await this.adapter()).exportProjectBundle(projectId);
  }

  async importProjectBundle(jsonContent: string): Promise<ProjectManifest> {
    return (await this.adapter()).importProjectBundle(jsonContent);
  }

  async exportAllProjects(): Promise<string> {
    return (await this.adapter()).exportAllProjects();
  }

  async importAllProjects(jsonContent: string): Promise<number> {
    return (await this.adapter()).importAllProjects(jsonContent);
  }

  async estimateLocalStorageUsage(): Promise<number> {
    return this.legacy.estimateLocalStorageUsage();
  }
}
