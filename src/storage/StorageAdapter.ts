/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  BinderNode,
  DocumentData,
  ProjectManifest,
  ProjectSettings,
  ProjectSnapshot,
  RecentProjectRecord,
} from '../types/project';
import type { CollaborativeDocumentHandle } from './CollaborativeDocument';

/**
 * Persistence contract for the whole application.
 * The UI depends on this asynchronous contract, not on a specific persistence
 * backend. Implementations may use browser storage or a local database.
 */
export interface StorageAdapter {
  getRecentProjects(): Promise<RecentProjectRecord[]>;
  saveRecentProjects(records: RecentProjectRecord[]): Promise<void>;

  createProject(manifest: ProjectManifest, initialDocuments: Record<string, DocumentData>): Promise<void>;
  loadProjectManifest(projectId: string): Promise<ProjectManifest | null>;
  isProjectReadOnly(projectId: string): Promise<boolean>;
  saveProjectManifest(manifest: ProjectManifest): Promise<void>;
  /** Updates only the shared settings map, leaving binder nodes untouched. */
  saveProjectSettings(projectId: string, settings: ProjectSettings, updatedAt: string): Promise<void>;
  moveBinderNode(
    projectId: string,
    nodeId: string,
    parentId: string | null,
    orderKey: string,
    sortOrder: number,
    updatedAt: string
  ): Promise<void>;
  saveBinderChanges(
    projectId: string,
    additions: BinderNode[],
    updates: Array<{ id: string; changes: Partial<BinderNode> }>,
    deletes: string[],
    updatedAt: string
  ): Promise<void>;
  deleteProject(projectId: string): Promise<void>;

  loadDocument(projectId: string, documentId: string): Promise<DocumentData | null>;
  openCollaborativeDocument?(
    projectId: string,
    documentId: string
  ): Promise<CollaborativeDocumentHandle | null>;
  saveDocument(projectId: string, documentData: DocumentData): Promise<void>;
  deleteDocument(projectId: string, documentId: string): Promise<void>;

  createSnapshot(projectId: string, label: string): Promise<ProjectSnapshot>;
  listSnapshots(projectId: string): Promise<ProjectSnapshot[]>;
  deleteSnapshot(projectId: string, snapshotId: string): Promise<void>;
  restoreSnapshot(projectId: string, snapshotId: string): Promise<ProjectManifest>;

  exportProjectBundle(projectId: string): Promise<string>;
  importProjectBundle(jsonContent: string): Promise<ProjectManifest>;
  exportAllProjects(): Promise<string>;
  importAllProjects(jsonContent: string): Promise<number>;
  estimateLocalStorageUsage(): Promise<number>;
}
