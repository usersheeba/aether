/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  ArrowLeft,
  Check,
  Download,
  FilePlus,
  FolderPlus,
  Moon,
  Save,
  Sun,
  UserPlus,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useEditorStore } from '../../store/useEditorStore';
import { useProjectStore } from '../../store/useProjectStore';
import { useUIStore } from '../../store/useUIStore';
import { SHORTCUTS } from '../../utils/shortcuts';
import { IconButton, IconSm, MenuPanel, MenuItem } from '../../design/components';

interface MenuItemData {
  label?: string;
  icon?: ReactNode;
  shortcut?: string;
  checked?: boolean;
  disabled?: boolean;
  type?: 'divider';
  action?: () => void | Promise<void>;
}

interface MenuCategory {
  label: string;
  items: MenuItemData[];
}

export function MenuBar() {
  const {
    setViewMode,
    theme,
    toggleTheme,
    isBinderVisible,
    toggleBinder,
    isInspectorVisible,
    toggleInspector,
    isStatusBarVisible,
    toggleStatusBar,
    toggleFocusMode,
  } = useUIStore();

  const { activeProject, createNode, saveActiveDocumentNow, closeProject, exportCurrentProject } = useProjectStore();
  const {
    editor,
    viewMode: editorViewMode,
    setViewMode: setEditorViewMode,
    draftMode,
    toggleDraftMode,
  } = useEditorStore();

  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuContentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!openMenu) return;
    menuContentRef.current?.querySelector<HTMLButtonElement>('[role^="menuitem"]:not(:disabled)')?.focus();
  }, [openMenu]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setOpenMenu(null);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenMenu(null);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const handleExport = async () => {
    try {
      const bundle = await exportCurrentProject();
      const blob = new Blob([bundle], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${activeProject?.title ?? 'project'}.aether`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Export failed', error);
    }
  };

  const handleCopy = () => {
    if (!editor) return;
    const { from, to } = editor.state.selection;
    const selected = editor.state.doc.textBetween(from, to, '\n');
    if (!selected || !navigator.clipboard) return;
    void navigator.clipboard.writeText(selected).catch((error) => console.error('Clipboard write failed', error));
  };

  const handleCut = () => {
    if (!editor) return;
    handleCopy();
    editor.chain().focus().deleteSelection().run();
  };

  const menuCategories: MenuCategory[] = [
    {
      label: 'File',
      items: [
        {
          label: 'Back to start page',
          icon: <IconSm as={ArrowLeft} />,
          action: async () => {
            await saveActiveDocumentNow();
            setViewMode('start_page');
          },
        },
        { type: 'divider' },
        {
          label: 'New document',
          icon: <IconSm as={FilePlus} />,
          action: () => void createNode(null, 'document'),
        },
        {
          label: 'New folder',
          icon: <IconSm as={FolderPlus} />,
          action: () => void createNode(null, 'folder'),
        },
        {
          label: 'New character card',
          icon: <IconSm as={UserPlus} />,
          action: () => void createNode(null, 'character_card'),
        },
        { type: 'divider' },
        {
          label: 'Save now',
          icon: <IconSm as={Save} />,
          shortcut: SHORTCUTS.save,
          action: () => saveActiveDocumentNow(),
        },
        {
          label: 'Export .aether bundle',
          icon: <IconSm as={Download} />,
          action: handleExport,
        },
        { type: 'divider' },
        {
          label: 'Close project',
          action: async () => {
            await closeProject();
            setViewMode('start_page');
          },
        },
      ],
    },
    {
      label: 'Edit',
      items: [
        { label: 'Undo', shortcut: SHORTCUTS.undo, disabled: !editor, action: () => { editor?.chain().focus().undo().run(); } },
        { label: 'Redo', shortcut: SHORTCUTS.redo, disabled: !editor, action: () => { editor?.chain().focus().redo().run(); } },
        { type: 'divider' },
        { label: 'Cut', shortcut: SHORTCUTS.cut, disabled: !editor, action: handleCut },
        { label: 'Copy', shortcut: SHORTCUTS.copy, disabled: !editor, action: handleCopy },
        {
          label: 'Select all',
          shortcut: SHORTCUTS.selectAll,
          disabled: !editor,
          action: () => { editor?.chain().focus().selectAll().run(); },
        },
      ],
    },
    {
      label: 'Project',
      items: [
        { label: 'Add document', action: () => void createNode(null, 'document') },
        { label: 'Add character profile', action: () => void createNode(null, 'character_card') },
        { label: 'Add research note', action: () => void createNode(null, 'note') },
      ],
    },
    {
      label: 'View',
      items: [
        {
          label: isBinderVisible ? 'Hide binder' : 'Show binder',
          shortcut: SHORTCUTS.binder,
          checked: isBinderVisible,
          action: toggleBinder,
        },
        {
          label: isInspectorVisible ? 'Hide inspector' : 'Show inspector',
          shortcut: SHORTCUTS.inspector,
          checked: isInspectorVisible,
          action: toggleInspector,
        },
        {
          label: isStatusBarVisible ? 'Hide status bar' : 'Show status bar',
          checked: isStatusBarVisible,
          action: toggleStatusBar,
        },
        { type: 'divider' },
        {
          label: 'Continuous view',
          checked: editorViewMode === 'continuous',
          action: () => setEditorViewMode('continuous'),
        },
        {
          label: 'Page preview (read-only)',
          checked: editorViewMode === 'page',
          action: () => setEditorViewMode('page'),
        },
        { type: 'divider' },
        {
          label: draftMode ? 'Back to scene view' : 'Draft view (whole manuscript)',
          checked: draftMode,
          action: toggleDraftMode,
        },
        { type: 'divider' },
        { label: theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme', action: toggleTheme },
      ],
    },
    {
      label: 'Window',
      items: [{ label: 'Toggle focus mode', shortcut: SHORTCUTS.focus, action: toggleFocusMode }],
    },
    {
      label: 'Help',
      items: [
        {
          label: 'About Aether Writer',
          action: () => window.alert('Aether Writer 1.0 — a local-first workspace for long-form writing.'),
        },
      ],
    },
  ];

  const handleItemClick = (item: MenuItemData, menuLabel: string) => {
    if (item.disabled) return;
    setOpenMenu(null);
    document.getElementById(`menu-trigger-${menuLabel.toLowerCase()}`)?.focus();
    void item.action?.();
  };

  return (
    <div
      ref={menuRef}
      className="relative z-40 flex min-h-11 shrink-0 items-center justify-between gap-2 border-b border-line bg-canvas px-2 text-[12.5px]"
    >
      <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto">
        <button
          type="button"
          onClick={async () => {
            await saveActiveDocumentNow();
            setViewMode('start_page');
          }}
          className="mr-1 min-h-11 shrink-0 rounded px-2 font-medium tracking-tight text-ink transition-colors hover:bg-hover"
          title="Back to start page"
        >
          Aether
        </button>
        <span className="mr-1 shrink-0 text-ink-faint">·</span>
        <span className="mr-2 max-w-[220px] shrink-0 truncate text-ink-faint">{activeProject?.title ?? 'Untitled'}</span>

        {menuCategories.map((menu) => (
          <div key={menu.label} className="relative">
            <button
              id={`menu-trigger-${menu.label.toLowerCase()}`}
              type="button"
              onClick={() => setOpenMenu(openMenu === menu.label ? null : menu.label)}
              aria-haspopup="menu"
              aria-expanded={openMenu === menu.label}
              aria-controls={`menu-${menu.label.toLowerCase()}`}
              className={`min-h-11 shrink-0 rounded px-2 transition-colors ${
                openMenu === menu.label ? 'bg-hover text-ink' : 'text-ink-muted hover:bg-hover hover:text-ink'
              }`}
            >
              {menu.label}
            </button>

            {openMenu === menu.label && (
              <MenuPanel
                ref={menuContentRef}
                id={`menu-${menu.label.toLowerCase()}`}
                aria-label={`${menu.label} menu`}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    event.preventDefault();
                    setOpenMenu(null);
                    document.getElementById(`menu-trigger-${menu.label.toLowerCase()}`)?.focus();
                    return;
                  }
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
              >
                {menu.items.map((item, index) =>
                  item.type === 'divider' ? (
                    <div key={`divider-${index}`} className="my-1 h-px bg-line" />
                  ) : (
                    <MenuItem
                      key={item.label}
                      onClick={() => handleItemClick(item, menu.label)}
                      disabled={item.disabled}
                      role={item.checked !== undefined ? 'menuitemcheckbox' : 'menuitem'}
                      aria-checked={item.checked}
                      state={item.checked ? 'selected' : undefined}
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="text-ink-faint">{item.icon}</span>
                        <span className="truncate">{item.label}</span>
                      </span>
                      <span className="flex shrink-0 items-center gap-2 text-[11px] text-ink-faint">
                        {item.checked && <IconSm as={Check} />}
                        {item.shortcut && <span className="tabular-nums">{item.shortcut}</span>}
                      </span>
                    </MenuItem>
                  )
                )}
              </MenuPanel>
            )}
          </div>
        ))}
      </div>

      <div className="flex shrink-0 items-center gap-0.5">
        <IconButton
          label="Toggle theme"
          onClick={toggleTheme}
          aria-label="Toggle theme"
        >
          {theme === 'dark' ? <IconSm as={Sun} /> : <IconSm as={Moon} />}
        </IconButton>
      </div>
    </div>
  );
}
