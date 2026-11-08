/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { JSONContent } from '@tiptap/core';

export type NodeType = 'folder' | 'document' | 'note' | 'character_card';

export type DocumentStatus = 'draft' | 'first_draft' | 'revised' | 'final' | 'in_progress' | 'to_do';

/** Every status the UI is allowed to offer, in display order. */
export const DOCUMENT_STATUSES: readonly DocumentStatus[] = [
  'draft',
  'in_progress',
  'first_draft',
  'revised',
  'final',
  'to_do',
];

export const DOCUMENT_STATUS_LABELS: Record<DocumentStatus, string> = {
  draft: 'Draft',
  in_progress: 'In progress',
  first_draft: 'First draft',
  revised: 'Revised',
  final: 'Final',
  to_do: 'To do',
};

export interface Bookmark {
  id: string;
  title: string;
  position: number;
  createdAt: string;
}

export interface CommentItem {
  id: string;
  author: string;
  text: string;
  createdAt: string;
  resolved: boolean;
}

export interface BinderNode {
  id: string;
  parentId: string | null;
  type: NodeType;
  title: string;
  expanded?: boolean;
  sortOrder: number;
  orderKey?: string;
  synopsis?: string;
  status?: DocumentStatus;
  colorLabel?: string;
  customAttributes?: Record<string, string>;
  /** Cached word count, kept in sync by the storage layer. */
  wordCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentData {
  id: string;
  projectId: string;
  title: string;
  updatedAt: string;
  wordCount: number;
  charCount: number;
  /** TipTap / ProseMirror JSON structure. */
  content: JSONContent | null;
  plainText: string;
  notes: string;
  bookmarks: Bookmark[];
  comments: CommentItem[];
}

export type PageFormat = 'a4' | 'a5' | 'letter' | 'custom';
export type PageOrientation = 'portrait' | 'landscape';

export interface PageMargins {
  topMm: number;
  rightMm: number;
  bottomMm: number;
  leftMm: number;
}

/**
 * Page set-up shared by every collaborator. Page breaks themselves are never
 * stored here: each client lays the document out locally.
 */
export interface PageViewSettings {
  format: PageFormat;
  orientation: PageOrientation;
  margins: PageMargins;
  /** Running header text. Supports `{page}` and `{pages}`. */
  header: string;
  /** Running footer text. Supports `{page}` and `{pages}`. */
  footer: string;
  /** Used only when `format` is `custom`; portrait dimensions in millimetres. */
  customWidthMm?: number;
  customHeightMm?: number;
}

export const DEFAULT_PAGE_VIEW: PageViewSettings = {
  format: 'a4',
  orientation: 'portrait',
  margins: { topMm: 20, rightMm: 20, bottomMm: 20, leftMm: 20 },
  header: '',
  footer: '',
};

export interface ProjectSettings {
  targetWordCount: number;
  pageView: PageViewSettings;
}

export interface ProjectManifest {
  id: string;
  title: string;
  author: string;
  description?: string;
  version: string;
  createdAt: string;
  updatedAt: string;
  settings: ProjectSettings;
  tree: BinderNode[];
}

export interface RecentProjectRecord {
  id: string;
  title: string;
  author: string;
  updatedAt: string;
  lastOpenedAt: string;
  pinned: boolean;
  totalWords: number;
  documentCount: number;
  storageKey: string;
}

export interface DocumentSnapshot {
  id: string;
  title: string;
  content: JSONContent | null;
  plainText: string;
  wordCount: number;
  yjsState?: Uint8Array;
}

export interface ProjectSnapshot {
  id: string;
  projectId: string;
  timestamp: string;
  label: string;
  manifest: ProjectManifest;
  documents: Record<string, DocumentSnapshot>;
}
