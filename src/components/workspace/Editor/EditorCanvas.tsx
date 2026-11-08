/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { FileText, Search, X } from 'lucide-react';
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import type { ChangeEvent, KeyboardEvent } from 'react';
import { DEFAULT_PAGE_VIEW } from '../../../types/project';
import { useEditorStore } from '../../../store/useEditorStore';
import type { WorkspaceWidthOption } from '../../../store/useEditorStore';
import { useProjectStore } from '../../../store/useProjectStore';
import { DraftView } from './DraftView';
import { TipTapEditor } from '../../../editor/TipTapEditor';
import { EditorBubbleMenu } from '../../../editor/EditorBubbleMenu';
import { replaceTextInEditor } from '../../../utils/prosemirror';
import { countMatches } from '../../../utils/text';
import { useUIStore } from '../../../store/useUIStore';
import { IconSm, IconXl } from '../../../design/components';

const PagedPreview = lazy(() =>
  import('../../../editor/PagedPreview').then((module) => ({ default: module.PagedPreview }))
);

const COLUMN_WIDTH: Record<WorkspaceWidthOption, string> = {
  narrow: 'max-w-[560px]',
  medium: 'max-w-[720px]',
  wide: 'max-w-[880px]',
  full: 'max-w-none',
};

export function EditorCanvas() {
  const isFocusMode = useUIStore((state) => !state.isBinderVisible && !state.isInspectorVisible);
  const { activeDocument, activeProject, projectReadOnly, updateActiveDocumentContent, renameDocument } = useProjectStore();
  const {
    editor,
    viewMode,
    setPageCount,
    fontFamily,
    fontSizePx,
    lineHeight,
    typography,
    language,
    zoomLevel,
    workspaceWidth,
    isSearchOpen,
    toggleSearch,
    searchQuery,
    setSearchQuery,
    replaceQuery,
    setReplaceQuery,
    toolbar,
    draftMode,
  } = useEditorStore();

  const [replaceMessage, setReplaceMessage] = useState<string | null>(null);
  const [titleDraft, setTitleDraft] = useState(activeDocument?.title ?? '');
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTitleDraft(activeDocument?.title ?? '');
  }, [activeDocument?.id, activeDocument?.title]);

  useEffect(() => {
    if (!replaceMessage) return;
    const timer = setTimeout(() => setReplaceMessage(null), 2500);
    return () => clearTimeout(timer);
  }, [replaceMessage]);

  useEffect(() => {
    if (!isSearchOpen) return;
    searchInputRef.current?.focus();
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      toggleSearch();
      requestAnimationFrame(() => editor?.commands.focus());
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [editor, isSearchOpen, toggleSearch]);

  if (draftMode) {
    return (
      <div className="relative h-full min-w-0 flex-1 overflow-hidden bg-canvas">
        <DraftView />
        {toolbar.bubble && editor && <EditorBubbleMenu editor={editor} />}
      </div>
    );
  }

  if (!activeDocument) {
    return (
      <div className="flex h-full min-w-0 flex-1 flex-col items-center justify-center gap-2 bg-canvas text-center">
        <IconXl as={FileText} />
        <p className="text-[13px] text-ink-muted">Nothing open</p>
        <p className="max-w-[280px] text-[12px] leading-relaxed text-ink-faint">
          Choose a page in the binder, or create one to start writing.
        </p>
      </div>
    );
  }

  const pageView = activeProject?.settings.pageView ?? DEFAULT_PAGE_VIEW;
  const matchCount = countMatches(activeDocument.plainText, searchQuery);

  const commitTitle = () => {
    const trimmed = titleDraft.trim();
    if (!trimmed) {
      setTitleDraft(activeDocument.title);
      return;
    }
    if (trimmed !== activeDocument.title) void renameDocument(activeDocument.id, trimmed);
  };

  const handleTitleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      event.currentTarget.blur();
    } else if (event.key === 'Escape') {
      setTitleDraft(activeDocument.title);
      event.currentTarget.blur();
    }
  };

  const handleReplace = (replaceAll: boolean) => {
    if (!editor || !searchQuery.trim()) return;
    const replaced = replaceTextInEditor(editor, searchQuery, replaceQuery, replaceAll);
    setReplaceMessage(
      replaced === 0 ? 'No matches' : `${replaced} ${replaced === 1 ? 'replacement' : 'replacements'}`
    );
  };

  const closeSearch = () => {
    toggleSearch();
    requestAnimationFrame(() => editor?.commands.focus());
  };
  const handlePageCount = useCallback((count: number | null) => setPageCount(count), [setPageCount]);

  const titleInput = (
    <input
      type="text"
      value={titleDraft}
      onChange={(event) => setTitleDraft(event.target.value)}
      onBlur={commitTitle}
      onKeyDown={handleTitleKeyDown}
      placeholder="Untitled"
      aria-label="Document title"
      className="w-full bg-transparent text-[28px] font-semibold leading-tight tracking-[-0.02em] text-ink placeholder:text-ink-faint focus:outline-none"
    />
  );

  return (
    <div className={`editor-canvas relative h-full min-w-0 flex-1 overflow-hidden bg-canvas ${isFocusMode ? 'is-focus-mode' : ''}`}>
      <div className="h-full overflow-hidden">
        <div
          className={`editor-focus-surface ${
            viewMode === 'page'
              ? 'h-full w-full'
              : `mx-auto w-full px-4 pb-40 pt-8 sm:px-8 sm:pt-12 ${
                  isFocusMode ? 'max-w-[760px]' : COLUMN_WIDTH[workspaceWidth]
                }`
          }`}
          style={{ transform: `scale(${zoomLevel / 100})`, transformOrigin: 'top center' }}
        >
          {viewMode === 'page' ? (
            <Suspense
              fallback={
                <p className="p-6 text-center text-[12px] text-ink-muted" role="status">
                  Loading page preview…
                </p>
              }
            >
              <PagedPreview
                title={activeDocument.title}
                content={activeDocument.content}
                pageView={pageView}
                fontFamily={fontFamily}
                fontSizePx={fontSizePx}
                lineHeight={lineHeight}
                typography={typography}
                language={language}
                onPageCount={handlePageCount}
              />
            </Suspense>
          ) : (
            <>
              <div className="mb-6">{titleInput}</div>
              <TipTapEditor
                key={activeDocument.id}
                projectId={activeProject?.id}
                documentId={activeDocument.id}
                projectReadOnly={projectReadOnly}
                initialContent={activeDocument.content}
                initialPlainText={activeDocument.plainText}
                onUpdate={updateActiveDocumentContent}
              />
            </>
          )}
        </div>
      </div>

      {toolbar.bubble && editor && <EditorBubbleMenu editor={editor} />}

      {isSearchOpen && viewMode === 'continuous' && (
        <div
          className="search-panel popover-in absolute right-2 top-2 z-20 w-[min(420px,calc(100%-1rem))] rounded-lg border border-line bg-surface p-2 shadow-[var(--shadow-popover)] sm:right-4 sm:top-3"
          role="search"
          aria-label="Find and replace in document"
        >
          <div className="flex items-center gap-1.5">
            <div className="relative flex-1">
              <IconSm as={Search} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-ink-faint" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(event: ChangeEvent<HTMLInputElement>) => setSearchQuery(event.target.value)}
                placeholder="Find"
                aria-label="Find text"
                className="min-h-11 w-full rounded-md border border-line bg-canvas pl-7 pr-2 text-[12px] text-ink focus:border-accent focus:outline-none"
              />
            </div>
            <span
              className="w-14 text-right text-[11px] tabular-nums text-ink-faint"
              aria-live="polite"
              aria-label={searchQuery ? `${matchCount} matches` : undefined}
            >
              {searchQuery ? `${matchCount}` : ''}
            </span>
            <button
              type="button"
              onClick={closeSearch}
              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md text-ink-faint transition-colors hover:bg-hover hover:text-ink"
              aria-label="Close find"
            >
              <IconSm as={X} />
            </button>
          </div>

          <div className="search-panel__replace mt-1.5 flex items-center gap-1.5">
            <input
              type="text"
              value={replaceQuery}
              onChange={(event: ChangeEvent<HTMLInputElement>) => setReplaceQuery(event.target.value)}
              placeholder="Replace with"
              aria-label="Replace with"
              className="min-h-11 min-w-0 flex-1 rounded-md border border-line bg-canvas px-2 text-[12px] text-ink focus:border-accent focus:outline-none"
            />
            <button
              type="button"
              onClick={() => handleReplace(false)}
              disabled={!editor}
              className="min-h-11 rounded-md px-3 text-[12px] text-ink-muted transition-colors hover:bg-hover hover:text-ink disabled:opacity-40"
            >
              Replace
            </button>
            <button
              type="button"
              onClick={() => handleReplace(true)}
              disabled={!editor}
              className="min-h-11 rounded-md bg-accent-solid px-3 text-[12px] font-medium text-on-accent transition-colors hover:bg-accent-solid-hover disabled:opacity-40"
            >
              All
            </button>
          </div>

          {replaceMessage && (
            <p className="mt-1.5 px-1 text-[11px] text-ink-muted" role="status" aria-live="polite">
              {replaceMessage}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
