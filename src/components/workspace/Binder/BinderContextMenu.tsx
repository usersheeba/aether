/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Copy, Edit2, FileCode, FilePlus, FolderPlus, Trash2, UserPlus } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  PROJECT_COLORS,
  normalizeProjectColor,
  projectColorVar,
} from '../../../design/tokens';
import { DOCUMENT_STATUSES, DOCUMENT_STATUS_LABELS } from '../../../types/project';
import type { BinderNode, DocumentStatus, NodeType } from '../../../types/project';
import { IconSm, MenuItem, MenuPanel } from '../../../design/components';

const STATUS_DOT_COLOR: Record<DocumentStatus, string> = {
  draft: 'var(--status-draft)',
  to_do: 'var(--status-draft)',
  in_progress: 'var(--status-progress)',
  first_draft: 'var(--status-progress)',
  revised: 'var(--status-review)',
  final: 'var(--status-final)',
};

interface BinderContextMenuProps {
  x: number;
  y: number;
  opener: HTMLElement;
  node: BinderNode;
  onClose: () => void;
  onRename: (nodeId: string) => void;
  onDelete: (nodeId: string) => void;
  onCreateChild: (parentId: string | null, type: NodeType) => void;
  onChangeStatus: (nodeId: string, status: DocumentStatus) => void;
  onChangeColor: (nodeId: string, color: string) => void;
  onDuplicate: (node: BinderNode) => void;
}

export function BinderContextMenu({
  x,
  y,
  opener,
  node,
  onClose,
  onRename,
  onDelete,
  onCreateChild,
  onChangeStatus,
  onChangeColor,
  onDuplicate,
}: BinderContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const closeTimerRef = useRef<number | null>(null);
  const onCloseRef = useRef(onClose);
  const [isOpen, setIsOpen] = useState(true);
  const [position, setPosition] = useState({ x, y });

  useLayoutEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  const close = (restoreFocus = false) => {
    if (closeTimerRef.current !== null) return;
    setIsOpen(false);
    if (restoreFocus && opener.isConnected) opener.focus();
    closeTimerRef.current = window.setTimeout(() => {
      onCloseRef.current();
    }, 120);
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) close();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close(true);
      }
    };

    const firstItem = menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]:not(:disabled)');
    firstItem?.focus();
    document.addEventListener('pointerdown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
      if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
    };
  }, []);

  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;

    const positionMenu = () => {
      const margin = 8;
      const adjustedX = Math.max(margin, Math.min(x, window.innerWidth - menu.offsetWidth - margin));
      const adjustedY = Math.max(margin, Math.min(y, window.innerHeight - menu.offsetHeight - margin));
      setPosition({ x: adjustedX, y: adjustedY });
      menu.style.setProperty('--menu-origin-x', x > window.innerWidth - menu.offsetWidth - margin ? '100%' : '0%');
      menu.style.setProperty('--menu-origin-y', y > window.innerHeight - menu.offsetHeight - margin ? '100%' : '0%');
    };

    positionMenu();
    window.addEventListener('resize', positionMenu);
    return () => window.removeEventListener('resize', positionMenu);
  }, [x, y]);

  const childParentId = node.type === 'folder' ? node.id : node.parentId;
  const action = (callback: () => void) => () => {
    callback();
    close();
  };

  return (
    <MenuPanel
      ref={menuRef}
      data-state={isOpen ? 'open' : 'closing'}
      style={{ top: `${position.y}px`, left: `${position.x}px` }}
      aria-label={`${node.title} actions`}
      onKeyDown={(event) => {
        if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
        const items = Array.from(
          event.currentTarget.querySelectorAll<HTMLElement>('[role^="menuitem"]:not(:disabled)')
        );
        if (items.length === 0) return;
        event.preventDefault();
        const currentIndex = items.indexOf(document.activeElement as HTMLElement);
        const nextIndex =
          event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? items.length - 1
              : (currentIndex + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
        items[nextIndex]?.focus();
      }}
    >
      <div className="truncate px-2 py-1 text-[11px] text-ink-faint">{node.title}</div>

      <MenuItem onClick={action(() => onCreateChild(childParentId, 'document'))}>
        <IconSm as={FilePlus} />
        <span>Add document</span>
      </MenuItem>
      <MenuItem onClick={action(() => onCreateChild(childParentId, 'folder'))}>
        <IconSm as={FolderPlus} />
        <span>Add folder</span>
      </MenuItem>
      <MenuItem onClick={action(() => onCreateChild(childParentId, 'character_card'))}>
        <IconSm as={UserPlus} />
        <span>Add character card</span>
      </MenuItem>
      <MenuItem onClick={action(() => onCreateChild(childParentId, 'note'))}>
        <IconSm as={FileCode} />
        <span>Add research note</span>
      </MenuItem>

      <div className="my-1 h-px bg-line" />

      <MenuItem onClick={action(() => onRename(node.id))}>
        <IconSm as={Edit2} />
        <span>Rename</span>
      </MenuItem>
      <MenuItem onClick={action(() => onDuplicate(node))}>
        <IconSm as={Copy} />
        <span>Duplicate</span>
      </MenuItem>

      <div className="my-1 h-px bg-line" />

      <div className="px-2 pb-1 pt-0.5">
        <span className="text-[11px] text-ink-faint">Status</span>
        <div className="mt-1 flex flex-wrap gap-1">
          {DOCUMENT_STATUSES.map((status) => (
            <button
              key={status}
              type="button"
              role="menuitemradio"
              aria-checked={node.status === status}
              onClick={action(() => onChangeStatus(node.id, status))}
              className={`flex min-h-11 items-center gap-1.5 rounded border px-1.5 text-[11px] transition-colors ${
                node.status === status
                  ? 'border-line-strong bg-active text-ink'
                  : 'border-transparent bg-hover/60 text-ink-muted hover:bg-hover hover:text-ink'
              }`}
            >
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: STATUS_DOT_COLOR[status] }}
                aria-hidden="true"
              />
              {DOCUMENT_STATUS_LABELS[status]}
            </button>
          ))}
        </div>
      </div>

      <div className="px-2 pb-1.5 pt-1">
        <span className="text-caption text-ink-faint">Colour</span>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          {PROJECT_COLORS.map((color) => {
            const isSelected = normalizeProjectColor(node.colorLabel) === color.key;
            return (
              <button
                key={color.key}
                type="button"
                role="menuitemradio"
                aria-checked={isSelected}
                onClick={action(() => onChangeColor(node.id, color.key))}
                aria-label={`Set colour ${color.label}`}
                title={color.label}
                className={`flex h-11 w-11 items-center justify-center rounded-full transition-transform hover:scale-105 ${
                  isSelected ? 'ring-2 ring-focus ring-offset-1 ring-offset-surface' : ''
                }`}
              >
                <span
                  className="h-3.5 w-3.5 rounded-full"
                  style={{ backgroundColor: projectColorVar(color.key, 'base') }}
                />
              </button>
            );
          })}
        </div>
      </div>

      <div className="my-1 h-px bg-line" />

      <MenuItem danger onClick={action(() => onDelete(node.id))}>
        <IconSm as={Trash2} />
        <span>Delete</span>
      </MenuItem>
    </MenuPanel>
  );
}
