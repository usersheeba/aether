/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  Bookmark as BookmarkIcon,
  Check,
  FileText,
  History,
  MessageSquare,
  PanelRightClose,
  Plus,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { useEditorStore } from '../../../store/useEditorStore';
import { useProjectStore } from '../../../store/useProjectStore';
import { useUIStore } from '../../../store/useUIStore';
import { DOCUMENT_STATUS_LABELS, DOCUMENT_STATUSES } from '../../../types/project';
import type { DocumentStatus } from '../../../types/project';
import { formatDate, formatDateTime } from '../../../utils/text';
import { IconButton, IconSm, SelectField, TextareaField, TextField, Button } from '../../../design/components';

type InspectorTab = 'notes' | 'bookmarks' | 'comments' | 'history';

const PANEL_WIDTH = 288;

const TABS: { id: InspectorTab; icon: typeof FileText; title: string }[] = [
  { id: 'notes', icon: FileText, title: 'Synopsis and notes' },
  { id: 'bookmarks', icon: BookmarkIcon, title: 'Bookmarks' },
  { id: 'comments', icon: MessageSquare, title: 'Comments' },
  { id: 'history', icon: History, title: 'Snapshots' },
];

export function InspectorPanel() {
  const { isInspectorVisible, toggleInspector } = useUIStore();
  const {
    activeDocument,
    activeProject,
    updateActiveDocumentMeta,
    updateNode,
    snapshots,
    createSnapshot,
    restoreSnapshot,
    deleteSnapshot,
  } = useProjectStore();
  const editor = useEditorStore((state) => state.editor);

  const [activeTab, setActiveTab] = useState<InspectorTab>('notes');
  const [newCommentText, setNewCommentText] = useState('');
  const [snapshotLabel, setSnapshotLabel] = useState('');

  if (!activeDocument || !activeProject) return null;

  const node = activeProject.tree.find((entry) => entry.id === activeDocument.id);
  const bookmarks = activeDocument.bookmarks ?? [];
  const comments = activeDocument.comments ?? [];

  const handleAddComment = (event: FormEvent) => {
    event.preventDefault();
    const text = newCommentText.trim();
    if (!text) return;

    updateActiveDocumentMeta({
      comments: [
        ...comments,
        {
          id: `cm_${Date.now()}`,
          author: activeProject.author || 'Author',
          text,
          createdAt: new Date().toISOString(),
          resolved: false,
        },
      ],
    });
    setNewCommentText('');
  };

  const handleToggleComment = (commentId: string) => {
    updateActiveDocumentMeta({
      comments: comments.map((comment) =>
        comment.id === commentId ? { ...comment, resolved: !comment.resolved } : comment
      ),
    });
  };

  const handleDeleteComment = (commentId: string) => {
    updateActiveDocumentMeta({ comments: comments.filter((comment) => comment.id !== commentId) });
  };

  const handleAddBookmark = () => {
    const position = editor?.state.selection.from ?? 0;
    updateActiveDocumentMeta({
      bookmarks: [
        ...bookmarks,
        {
          id: `bm_${Date.now()}`,
          title: `Bookmark ${bookmarks.length + 1}`,
          position,
          createdAt: new Date().toISOString(),
        },
      ],
    });
  };

  const handleDeleteBookmark = (bookmarkId: string) => {
    updateActiveDocumentMeta({ bookmarks: bookmarks.filter((bookmark) => bookmark.id !== bookmarkId) });
  };

  const handleSaveSnapshot = () => {
    void createSnapshot(snapshotLabel);
    setSnapshotLabel('');
  };

  const handleRestoreSnapshot = (snapshotId: string) => {
    if (!window.confirm('Restore this snapshot? Changes made after it will be lost.')) return;
    void restoreSnapshot(snapshotId);
  };

  return (
    <aside
      aria-hidden={!isInspectorVisible}
      aria-label="Document inspector"
      inert={!isInspectorVisible}
      data-visible={isInspectorVisible}
      className={`workspace-drawer workspace-drawer-right relative h-full shrink-0 overflow-hidden border-l bg-sidebar transition-[width] duration-200 ease-out ${
        isInspectorVisible ? 'w-[288px] border-line' : 'w-0 border-transparent'
      }`}
    >
      <div className="workspace-drawer-content flex h-full flex-col" style={{ width: PANEL_WIDTH }}>
        <div className="flex h-9 shrink-0 items-center justify-between px-3">
          <span className="text-[12px] font-medium text-ink">Inspector</span>
          <div className="flex items-center gap-0.5">
            <IconButton
              label="Hide inspector"
              onClick={toggleInspector}
              aria-label="Hide inspector"
            >
              <IconSm as={PanelRightClose} />
            </IconButton>
          </div>
        </div>

        <div className="flex shrink-0 items-center border-b border-line px-2" role="tablist" aria-label="Inspector sections">
          {TABS.map((tab, index) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                onKeyDown={(event) => {
                  let nextIndex: number | null = null;
                  if (event.key === 'ArrowRight') nextIndex = (index + 1) % TABS.length;
                  if (event.key === 'ArrowLeft') nextIndex = (index - 1 + TABS.length) % TABS.length;
                  if (event.key === 'Home') nextIndex = 0;
                  if (event.key === 'End') nextIndex = TABS.length - 1;
                  if (nextIndex === null) return;
                  event.preventDefault();
                  const nextTab = TABS[nextIndex];
                  setActiveTab(nextTab.id);
                  document.getElementById(`inspector-tab-${nextTab.id}`)?.focus();
                }}
                id={`inspector-tab-${tab.id}`}
                role="tab"
                title={tab.title}
                aria-label={tab.title}
                aria-controls="inspector-tab-panel"
                aria-selected={isActive}
                tabIndex={isActive ? 0 : -1}
                className={`inspector-tab relative flex min-h-11 min-w-11 flex-1 items-center justify-center transition-colors ${
                  isActive ? 'text-ink' : 'text-ink-faint hover:text-ink'
                }`}
              >
                <IconSm as={Icon} />
                <span className="inspector-tab-indicator absolute inset-x-3 bottom-0 h-px bg-ink" data-active={isActive} />
              </button>
            );
          })}
        </div>

        <div
          id="inspector-tab-panel"
          className="min-h-0 flex-1 overflow-y-auto p-3"
          role="tabpanel"
          aria-labelledby={`inspector-tab-${activeTab}`}
          tabIndex={0}
        >
          {activeTab === 'notes' && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-[11px] font-medium text-ink-faint" htmlFor="document-status">
                  Status
                </label>
                <SelectField
                  id="document-status"
                  value={node?.status ?? 'draft'}
                  onChange={(event) => void updateNode(activeDocument.id, { status: event.target.value as DocumentStatus })}
                >
                  {DOCUMENT_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {DOCUMENT_STATUS_LABELS[status]}
                    </option>
                  ))}
                </SelectField>
              </div>

              <div className="space-y-1.5">
                <label className="block text-[11px] font-medium text-ink-faint" htmlFor="document-synopsis">
                  Synopsis
                </label>
                <TextareaField
                  id="document-synopsis"
                  value={node?.synopsis ?? ''}
                  onChange={(event) => void updateNode(activeDocument.id, { synopsis: event.target.value })}
                  placeholder="What happens here?"
                  rows={4}
                  className="resize-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-[11px] font-medium text-ink-faint" htmlFor="document-notes">
                  Notes
                </label>
                <TextareaField
                  id="document-notes"
                  value={activeDocument.notes ?? ''}
                  onChange={(event) => updateActiveDocumentMeta({ notes: event.target.value })}
                  placeholder="Ideas, details, loose threads"
                  rows={6}
                  className="resize-none"
                />
              </div>
            </div>
          )}

          {activeTab === 'bookmarks' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="block text-[11px] font-medium text-ink-faint">Bookmarks</span>
                <IconButton
                  label="Add bookmark"
                  onClick={handleAddBookmark}
                  aria-label="Add bookmark"
                  size="sm"
                >
                  <IconSm as={Plus} />
                </IconButton>
              </div>

              {bookmarks.length === 0 ? (
                <p className="py-6 text-center text-[12px] leading-relaxed text-ink-faint">
                  Place the caret and add a bookmark.
                </p>
              ) : (
                <div className="space-y-0.5">
                  {bookmarks.map((bookmark) => (
                    <div
                      key={bookmark.id}
                      className="group flex items-center justify-between gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-hover"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-[12.5px] text-ink">{bookmark.title}</p>
                        <p className="text-[11px] tabular-nums text-ink-faint">
                          {bookmark.position} · {formatDate(bookmark.createdAt)}
                        </p>
                      </div>
                      <IconButton
                        label={`Delete ${bookmark.title}`}
                        onClick={() => handleDeleteBookmark(bookmark.id)}
                        aria-label={`Delete ${bookmark.title}`}
                        size="sm"
                        className="text-ink-faint hover:text-danger"
                      >
                        <IconSm as={Trash2} />
                      </IconButton>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'comments' && (
            <div className="space-y-3">
              <form onSubmit={handleAddComment} className="space-y-1.5">
                <TextareaField
                  value={newCommentText}
                  onChange={(event) => setNewCommentText(event.target.value)}
                  placeholder="Add a comment"
                  rows={2}
                  className="resize-none"
                />
                <Button variant="primary" type="submit" className="w-full">
                  Comment
                </Button>
              </form>

              {comments.length === 0 ? (
                <p className="py-6 text-center text-[12px] text-ink-faint">No comments yet.</p>
              ) : (
                <div className="space-y-1.5">
                  {comments.map((comment) => (
                    <div
                      key={comment.id}
                      className={`group rounded-md border border-line bg-surface p-2 transition-opacity ${
                        comment.resolved ? 'opacity-60' : ''
                      }`}
                    >
                      <div className="flex items-center justify-between text-[11px] text-ink-faint">
                        <span className="font-medium text-ink-muted">{comment.author}</span>
                        <span>{formatDate(comment.createdAt)}</span>
                      </div>
                      <p className={`mt-1 text-[12.5px] leading-relaxed text-ink ${comment.resolved ? 'line-through' : ''}`}>
                        {comment.text}
                      </p>
                      <div className="mt-1 flex items-center justify-end gap-1">
                        <IconButton
                          label={comment.resolved ? 'Reopen' : 'Resolve'}
                          onClick={() => handleToggleComment(comment.id)}
                          aria-label={comment.resolved ? 'Reopen comment' : 'Resolve comment'}
                          size="sm"
                        >
                          <IconSm as={Check} />
                        </IconButton>
                        <IconButton
                          label="Delete comment"
                          onClick={() => handleDeleteComment(comment.id)}
                          aria-label="Delete comment"
                          size="sm"
                          className="hover:text-danger"
                        >
                          <IconSm as={Trash2} />
                        </IconButton>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'history' && (
            <div className="space-y-3">
              <span className="block text-[11px] font-medium text-ink-faint">Snapshots</span>
              <div className="flex items-center gap-1.5">
                <TextField
                  value={snapshotLabel}
                  onChange={(event) => setSnapshotLabel(event.target.value)}
                  placeholder="Label"
                  className="min-w-0 flex-1"
                />
                <Button variant="primary" onClick={handleSaveSnapshot}>
                  Save
                </Button>
              </div>

              {snapshots.length === 0 ? (
                <p className="py-6 text-center text-[12px] leading-relaxed text-ink-faint">
                  Save one before a risky rewrite.
                </p>
              ) : (
                <div className="space-y-1">
                  {snapshots.map((snapshot) => (
                    <div
                      key={snapshot.id}
                      className="group flex items-center justify-between gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-hover"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-[12.5px] text-ink">{snapshot.label}</p>
                        <p className="text-[11px] text-ink-faint">{formatDateTime(snapshot.timestamp)}</p>
                      </div>
                      <div className="inspector-actions flex shrink-0 items-center gap-1">
                        <IconButton
                          label={`Restore ${snapshot.label}`}
                          onClick={() => handleRestoreSnapshot(snapshot.id)}
                          aria-label={`Restore ${snapshot.label}`}
                          size="sm"
                        >
                          <IconSm as={RotateCcw} />
                        </IconButton>
                        <IconButton
                          label={`Delete ${snapshot.label}`}
                          onClick={() => void deleteSnapshot(snapshot.id)}
                          aria-label={`Delete ${snapshot.label}`}
                          size="sm"
                          className="hover:text-danger"
                        >
                          <IconSm as={Trash2} />
                        </IconButton>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-line px-3 py-1.5 text-[11px] text-ink-faint">
          <span className="tabular-nums">
            {activeDocument.wordCount.toLocaleString()} words
          </span>
          <span className="truncate">{formatDate(activeDocument.updatedAt)}</span>
        </div>
      </div>
    </aside>
  );
}
