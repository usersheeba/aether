/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  BookOpen,
  Check,
  Code,
  Focus,
  File,
  Italic,
  List,
  ListOrdered,
  PanelLeft,
  PanelRight,
  Rows3,
  Search,
  Settings,
  SlidersHorizontal,
  Strikethrough,
  Underline as UnderlineIcon,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { Fragment, useEffect, useReducer, useRef, useState } from 'react';
import type { ComponentType, ReactNode } from 'react';
import { useEditorStore } from '../../store/useEditorStore';
import type { ToolbarItem } from '../../store/useEditorStore';
import { useUIStore } from '../../store/useUIStore';
import { IconButton, IconSm } from '../../design/components';

function ToolButton({ icon: Icon, label, active = false, disabled = false, onClick }: { icon: ComponentType<{ className?: string }>; label: string; active?: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <IconButton
      label={label}
      onClick={onClick}
      disabled={disabled}
      data-state={active ? 'selected' : undefined}
      aria-pressed={active}
    >
      <IconSm as={Icon} />
    </IconButton>
  );
}

function Divider() {
  return <span aria-hidden="true" className="mx-1 h-4 w-px shrink-0 bg-line" />;
}

const ALIGNMENTS = [
  { value: 'left', icon: AlignLeft, label: 'Align left' },
  { value: 'center', icon: AlignCenter, label: 'Align center' },
  { value: 'right', icon: AlignRight, label: 'Align right' },
  { value: 'justify', icon: AlignJustify, label: 'Justify' },
] as const;

const BLOCK_OPTIONS = [
  { value: 'paragraph', label: 'Text' },
  { value: 'h1', label: 'Heading 1' },
  { value: 'h2', label: 'Heading 2' },
  { value: 'h3', label: 'Heading 3' },
  { value: 'h4', label: 'Heading 4' },
  { value: 'quote', label: 'Quote' },
] as const;

type BlockValue = (typeof BLOCK_OPTIONS)[number]['value'];

const TOOLBAR_OPTIONS: { key: ToolbarItem; label: string }[] = [
  { key: 'blockType', label: 'Block type' },
  { key: 'marks', label: 'Bold, italic, code' },
  { key: 'lists', label: 'Lists' },
  { key: 'alignment', label: 'Alignment' },
  { key: 'find', label: 'Find and replace' },
  { key: 'viewMode', label: 'Continuous / page' },
  { key: 'zoom', label: 'Zoom' },
  { key: 'bubble', label: 'Selection bubble' },
];

export function ToolBar() {
  const {
    isBinderVisible,
    toggleBinder,
    isInspectorVisible,
    toggleInspector,
    toggleFocusMode,
    setActiveModal,
  } = useUIStore();
  const isFocusMode = !isBinderVisible && !isInspectorVisible;
  const {
    editor,
    toolbar,
    toggleToolbarItem,
    resetToolbar,
    viewMode,
    setViewMode,
    zoomLevel,
    setZoomLevel,
    toggleSearch,
    draftMode,
    toggleDraftMode,
    typography,
  } = useEditorStore();

  // The toolbar mirrors ProseMirror state, so re-render on every transaction
  // (which includes caret moves) — that is what keeps it in sync.
  const [, forceRender] = useReducer((tick: number) => tick + 1, 0);
  useEffect(() => {
    if (!editor) return;
    editor.on('transaction', forceRender);
    editor.on('selectionUpdate', forceRender);
    return () => {
      editor.off('transaction', forceRender);
      editor.off('selectionUpdate', forceRender);
    };
  }, [editor]);

  const [isCustomizerOpen, setIsCustomizerOpen] = useState(false);
  const customizerRef = useRef<HTMLDivElement>(null);
  const customizerTriggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isCustomizerOpen) return;
    customizerRef.current
      ?.querySelector<HTMLButtonElement>('[role^="menuitem"]:not(:disabled)')
      ?.focus();
    const handlePointerDown = (event: MouseEvent) => {
      if (customizerRef.current && !customizerRef.current.contains(event.target as Node)) {
        setIsCustomizerOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsCustomizerOpen(false);
        customizerTriggerRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isCustomizerOpen]);

  // Paragraphs without an explicit alignment follow the prose style, so the
  // toolbar mirrors what is actually rendered (book mode justifies by default).
  const fallbackAlignment = typography === 'book' ? 'justify' : 'left';
  const activeAlignment = editor
    ? ((editor.getAttributes('heading').textAlign as string | undefined) ??
      (editor.getAttributes('paragraph').textAlign as string | undefined) ??
      fallbackAlignment)
    : fallbackAlignment;

  const blockValue: BlockValue = !editor
    ? 'paragraph'
    : editor.isActive('heading', { level: 1 })
      ? 'h1'
      : editor.isActive('heading', { level: 2 })
        ? 'h2'
        : editor.isActive('heading', { level: 3 })
          ? 'h3'
          : editor.isActive('heading', { level: 4 })
            ? 'h4'
            : editor.isActive('blockquote')
            ? 'quote'
            : 'paragraph';

  const setBlock = (value: BlockValue) => {
    if (!editor) return;
    if (value === 'paragraph') editor.chain().focus().setParagraph().run();
    else if (value === 'quote') editor.chain().focus().toggleBlockquote().run();
    else editor.chain().focus().setHeading({ level: Number(value.slice(1)) as 1 | 2 | 3 | 4 }).run();
  };

  const leftGroups: { id: string; node: ReactNode }[] = [];

  if (toolbar.blockType) {
    leftGroups.push({
      id: 'block',
      node: (
        <select
          value={blockValue}
          onChange={(event) => setBlock(event.target.value as BlockValue)}
          disabled={!editor}
          aria-label="Block type"
          title="Block type"
          className="min-h-11 shrink-0 rounded-md border border-transparent bg-transparent px-2 text-[12px] text-ink-muted transition-colors hover:bg-hover hover:text-ink focus:border-line focus:bg-surface focus:outline-none disabled:opacity-35"
        >
          {BLOCK_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ),
    });
  }

  if (toolbar.marks) {
    leftGroups.push({
      id: 'marks',
      node: (
        <>
          <ToolButton
            icon={Bold}
            label="Bold"
            disabled={!editor}
            active={editor?.isActive('bold') ?? false}
            onClick={() => editor?.chain().focus().toggleBold().run()}
          />
          <ToolButton
            icon={Italic}
            label="Italic"
            disabled={!editor}
            active={editor?.isActive('italic') ?? false}
            onClick={() => editor?.chain().focus().toggleItalic().run()}
          />
          <ToolButton
            icon={UnderlineIcon}
            label="Underline"
            disabled={!editor}
            active={editor?.isActive('underline') ?? false}
            onClick={() => editor?.chain().focus().toggleUnderline().run()}
          />
          <ToolButton
            icon={Strikethrough}
            label="Strikethrough"
            disabled={!editor}
            active={editor?.isActive('strike') ?? false}
            onClick={() => editor?.chain().focus().toggleStrike().run()}
          />
          <ToolButton
            icon={Code}
            label="Code"
            disabled={!editor}
            active={editor?.isActive('code') ?? false}
            onClick={() => editor?.chain().focus().toggleCode().run()}
          />
        </>
      ),
    });
  }

  if (toolbar.lists) {
    leftGroups.push({
      id: 'lists',
      node: (
        <>
          <ToolButton
            icon={List}
            label="Bullet list"
            disabled={!editor}
            active={editor?.isActive('bulletList') ?? false}
            onClick={() => editor?.chain().focus().toggleBulletList().run()}
          />
          <ToolButton
            icon={ListOrdered}
            label="Numbered list"
            disabled={!editor}
            active={editor?.isActive('orderedList') ?? false}
            onClick={() => editor?.chain().focus().toggleOrderedList().run()}
          />
        </>
      ),
    });
  }

  if (toolbar.alignment) {
    leftGroups.push({
      id: 'alignment',
      node: (
        <>
          {ALIGNMENTS.map((alignment) => (
            <ToolButton
              key={alignment.value}
              icon={alignment.icon}
              label={alignment.label}
              disabled={!editor}
              active={activeAlignment === alignment.value}
              onClick={() => editor?.chain().focus().setTextAlign(alignment.value).run()}
            />
          ))}
        </>
      ),
    });
  }

  if (toolbar.find) {
    leftGroups.push({
      id: 'find',
      node: (
        <ToolButton
          icon={Search}
          label="Find and replace"
          disabled={draftMode || viewMode === 'page'}
          onClick={toggleSearch}
        />
      ),
    });
  }

  const rightGroups: { id: string; node: ReactNode }[] = [];

  if (toolbar.viewMode) {
    rightGroups.push({
      id: 'viewMode',
      node: (
        <div className="flex items-center gap-0.5 rounded-md bg-hover p-0.5" role="group" aria-label="Document view">
          <button
            type="button"
            onClick={() => setViewMode('continuous')}
            title="Continuous view"
            aria-label="Continuous view"
            aria-pressed={viewMode === 'continuous'}
            className={`inline-flex min-h-10 items-center gap-1 rounded px-2 text-[11.5px] transition-colors ${
              viewMode === 'continuous' ? 'bg-surface text-ink shadow-sm' : 'text-ink-muted hover:text-ink'
            }`}
          >
            <Rows3 className="w-3 h-3" />
            <span className="hidden xl:inline">Flow</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode('page')}
            title="Page preview (read-only)"
            aria-label="Page preview (read-only)"
            aria-pressed={viewMode === 'page'}
            className={`inline-flex min-h-10 items-center gap-1 rounded px-2 text-[11.5px] transition-colors ${
              viewMode === 'page' ? 'bg-surface text-ink shadow-sm' : 'text-ink-muted hover:text-ink'
            }`}
          >
            <File className="w-3 h-3" />
            <span className="hidden xl:inline">Preview</span>
          </button>
        </div>
      ),
    });
  }

  if (toolbar.zoom) {
    rightGroups.push({
      id: 'zoom',
      node: (
        <div className="flex items-center gap-0.5">
          <ToolButton icon={ZoomOut} label="Zoom out" onClick={() => setZoomLevel(zoomLevel - 10)} />
          <span className="w-10 select-none text-center text-[11px] tabular-nums text-ink-muted">{zoomLevel}%</span>
          <ToolButton icon={ZoomIn} label="Zoom in" onClick={() => setZoomLevel(zoomLevel + 10)} />
        </div>
      ),
    });
  }

  return (
    <div data-region="toolbar" className="shrink-0 overflow-x-auto overscroll-x-contain border-b border-line bg-canvas">
      <div className="flex min-h-11 min-w-max items-center justify-between gap-2 px-2">
        <div className="flex shrink-0 items-center gap-0.5">
          <ToolButton
            icon={PanelLeft}
            label={isBinderVisible ? 'Hide binder' : 'Show binder'}
            active={isBinderVisible}
            onClick={toggleBinder}
          />
          <ToolButton
            icon={Focus}
            label={isFocusMode ? 'Exit focus mode' : 'Focus mode'}
            active={isFocusMode}
            onClick={toggleFocusMode}
          />

          {leftGroups.map((group) => (
            <Fragment key={group.id}>
              <Divider />
              {group.node}
            </Fragment>
          ))}
        </div>

        <div className="flex shrink-0 items-center gap-0.5">
          <ToolButton
            icon={BookOpen}
            label={draftMode ? 'Back to the scene' : 'Draft view (whole manuscript)'}
            active={draftMode}
            onClick={toggleDraftMode}
          />
          <Divider />

          {rightGroups.map((group) => (
            <Fragment key={group.id}>
              {group.node}
              <Divider />
            </Fragment>
          ))}

          <ToolButton icon={Settings} label="Preferences" onClick={() => setActiveModal('settings')} />
          <ToolButton
            icon={PanelRight}
            label={isInspectorVisible ? 'Hide inspector' : 'Show inspector'}
            active={isInspectorVisible}
            onClick={toggleInspector}
          />

          <div className="relative">
            <button
              ref={customizerTriggerRef}
              type="button"
              onClick={() => setIsCustomizerOpen((open) => !open)}
              title="Customise toolbar"
              aria-label="Customise toolbar"
              aria-expanded={isCustomizerOpen}
              aria-haspopup="menu"
              className={`inline-flex min-h-11 min-w-11 items-center justify-center rounded-md transition-colors ${
                isCustomizerOpen ? 'bg-active text-ink' : 'text-ink-faint hover:bg-hover hover:text-ink'
              }`}
            >
              <IconSm as={SlidersHorizontal} />
            </button>

            {isCustomizerOpen && (
              <div
                ref={customizerRef}
                role="menu"
                aria-label="Toolbar items"
                onKeyDown={(event) => {
                  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
                  const items = Array.from(
                    event.currentTarget.querySelectorAll<HTMLButtonElement>(
                      '[role^="menuitem"]:not(:disabled)'
                    )
                  );
                  if (items.length === 0) return;
                  event.preventDefault();
                  const currentIndex = items.indexOf(document.activeElement as HTMLButtonElement);
                  const nextIndex =
                    event.key === 'Home'
                      ? 0
                      : event.key === 'End'
                        ? items.length - 1
                        : (currentIndex + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
                  items[nextIndex]?.focus();
                }}
                className="toolbar-customizer-menu popover-in absolute right-0 top-full z-50 mt-1 w-[min(224px,calc(100vw-1rem))] rounded-lg border border-line bg-surface p-1 shadow-[var(--shadow-popover)]"
              >
                <div className="px-2 py-1 text-[11px] text-ink-faint">Toolbar items</div>
                {TOOLBAR_OPTIONS.map((option) => {
                  const isEnabled = toolbar[option.key];
                  return (
                    <button
                      key={option.key}
                      type="button"
                      role="menuitemcheckbox"
                      aria-checked={isEnabled}
                      onClick={() => toggleToolbarItem(option.key)}
                      className="flex min-h-11 w-full items-center gap-2 rounded px-2 text-left text-[12.5px] text-ink transition-colors hover:bg-hover"
                    >
                      <span
                        className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border transition-colors ${
                          isEnabled ? 'border-accent-solid bg-accent-solid text-on-accent' : 'border-line-strong'
                        }`}
                      >
                        {isEnabled && <Check className="h-2.5 w-2.5" />}
                      </span>
                      <span className="truncate">{option.label}</span>
                    </button>
                  );
                })}
                <div className="my-1 h-px bg-line" />
                <button
                  type="button"
                  role="menuitem"
                  onClick={resetToolbar}
                  className="flex min-h-11 w-full items-center rounded px-2 text-left text-[12px] text-ink-muted transition-colors hover:bg-hover hover:text-ink"
                >
                  Reset to default
                </button>
              </div>
              )}
          </div>
        </div>
      </div>
    </div>
  );
}
