/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ChevronRight, FileCode, FileText, Folder, GripVertical, User } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { DragEvent, KeyboardEvent, MouseEvent, ReactNode } from 'react';
import { projectColorStyle } from '../../../design/tokens';
import { DOCUMENT_STATUS_LABELS } from '../../../types/project';
import type { BinderNode, DocumentStatus, NodeType } from '../../../types/project';
import { IconSm } from '../../../design/components';

const STATUS_DOT_COLOR: Record<DocumentStatus, string> = {
  draft: 'var(--status-draft)',
  to_do: 'var(--status-draft)',
  in_progress: 'var(--status-progress)',
  first_draft: 'var(--status-progress)',
  revised: 'var(--status-review)',
  final: 'var(--status-final)',
};

interface BinderTreeItemProps {
  node: BinderNode;
  depth: number;
  isSelected: boolean;
  isEditing: boolean;
  isExpanded: boolean;
  isFiltering: boolean;
  isDropTarget: boolean;
  childrenNodes: BinderNode[];
  onSelect: (nodeId: string) => void;
  onToggleExpand: (nodeId: string) => void;
  onStartRename: (nodeId: string) => void;
  onSaveRename: (nodeId: string, newTitle: string) => void;
  onCancelRename: () => void;
  onContextMenu: (event: MouseEvent<HTMLDivElement>, node: BinderNode) => void;
  onDragStart: (event: DragEvent, node: BinderNode) => void;
  onDragOver: (event: DragEvent, node: BinderNode) => void;
  onDragLeave: () => void;
  onDrop: (event: DragEvent, node: BinderNode) => void;
  renderChild: (node: BinderNode, depth: number) => ReactNode;
}

function nodeIcon(type: NodeType): ReactNode {
  switch (type) {
    case 'folder':
      return <IconSm as={Folder} />;
    case 'character_card':
      return <IconSm as={User} />;
    case 'note':
      return <IconSm as={FileCode} />;
    case 'document':
    default:
      return <IconSm as={FileText} />;
  }
}

export function BinderTreeItem({
  node,
  depth,
  isSelected,
  isEditing,
  isExpanded,
  isFiltering,
  isDropTarget,
  childrenNodes,
  onSelect,
  onToggleExpand,
  onStartRename,
  onSaveRename,
  onCancelRename,
  onContextMenu,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  renderChild,
}: BinderTreeItemProps) {
  const [draftTitle, setDraftTitle] = useState(node.title);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDraftTitle(node.title);
  }, [node.title, isEditing]);

  useEffect(() => {
    if (isEditing) inputRef.current?.select();
  }, [isEditing]);

  const commitRename = () => {
    onSaveRename(node.id, draftTitle.trim() || node.title);
  };

  const handleTreeKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (isEditing) return;

    const tree = event.currentTarget.closest('[role="tree"]');
    const items = Array.from(tree?.querySelectorAll<HTMLElement>('[role="treeitem"]') ?? []);
    const itemIndex = items.indexOf(event.currentTarget);
    const focusItem = (item: HTMLElement | undefined) => {
      if (!item) return;
      item.focus();
      const nodeId = item.dataset.nodeId;
      if (nodeId) onSelect(nodeId);
    };

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const direction = event.key === 'ArrowDown' ? 1 : -1;
      focusItem(items[itemIndex + direction]);
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      focusItem(event.key === 'Home' ? items[0] : items[items.length - 1]);
    } else if (event.key === 'ArrowRight' && node.type === 'folder') {
      event.preventDefault();
      if (!isExpanded) {
        onToggleExpand(node.id);
      } else {
        const firstChild = event.currentTarget.querySelector<HTMLElement>('[role="group"] [role="treeitem"]');
        if (firstChild) focusItem(firstChild);
      }
    } else if (event.key === 'ArrowLeft' && node.type === 'folder' && isExpanded && !isFiltering) {
      event.preventDefault();
      onToggleExpand(node.id);
    } else if (event.key === 'ArrowLeft' && node.parentId !== null) {
      event.preventDefault();
      focusItem(items.find((item) => item.dataset.nodeId === node.parentId));
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onSelect(node.id);
    } else if (event.key === 'F2') {
      event.preventDefault();
      onStartRename(node.id);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      commitRename();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setDraftTitle(node.title);
      onCancelRename();
    }
  };

  return (
    <div
      role="treeitem"
      aria-level={depth + 1}
      aria-selected={isSelected}
      aria-expanded={node.type === 'folder' ? isExpanded : undefined}
      tabIndex={isSelected ? 0 : -1}
      data-node-id={node.id}
      className="binder-tree-item"
      onKeyDown={handleTreeKeyDown}
    >
      <div
        draggable={!isEditing}
        onDragStart={(event) => onDragStart(event, node)}
        onDragOver={(event) => {
          event.preventDefault();
          onDragOver(event, node);
        }}
        onDragLeave={onDragLeave}
        onDrop={(event) => onDrop(event, node)}
        onClick={(event) => {
          event.currentTarget.parentElement?.focus();
          onSelect(node.id);
        }}
        onDoubleClick={() => onStartRename(node.id)}
        onContextMenu={(event) => onContextMenu(event, node)}
        title={node.title}
        style={{ paddingLeft: `${depth * 12 + 6}px` }}
        className={`binder-tree-row group relative flex min-h-11 cursor-pointer items-center gap-1.5 rounded-md pr-1.5 text-[13px] transition-colors ${
          isDropTarget
            ? 'bg-accent-soft ring-1 ring-inset ring-accent'
            : isSelected
              ? 'bg-active text-ink'
              : 'text-ink-muted hover:bg-hover hover:text-ink'
        }`}
      >
        {node.type === 'folder' ? (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onToggleExpand(node.id);
            }}
            className="binder-expander -ml-0.5 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded text-ink-faint transition-colors hover:bg-active hover:text-ink"
            aria-label={isExpanded ? 'Collapse' : 'Expand'}
            aria-expanded={isExpanded}
            tabIndex={-1}
          >
            <IconSm as={ChevronRight} className={`transition-transform duration-150 ${isExpanded ? 'rotate-90' : ''}`} />
          </button>
        ) : (
          <span className="w-4 shrink-0" />
        )}

        <span
          className="shrink-0 text-ink-faint transition-colors"
          style={projectColorStyle(node.colorLabel)}
        >
          {nodeIcon(node.type)}
        </span>

        {isEditing ? (
          <input
            ref={inputRef}
            type="text"
            value={draftTitle}
            onChange={(event) => setDraftTitle(event.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={commitRename}
            onClick={(event) => event.stopPropagation()}
            className="h-6 min-w-0 flex-1 rounded border border-accent bg-surface px-1 text-[13px] text-ink focus:outline-none"
          />
        ) : (
          <span className="truncate">{node.title}</span>
        )}

        <span className="ml-auto flex shrink-0 items-center gap-1.5">
          {node.status && (
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: STATUS_DOT_COLOR[node.status] }}
              title={DOCUMENT_STATUS_LABELS[node.status]}
              aria-label={DOCUMENT_STATUS_LABELS[node.status]}
            />
          )}
          <IconSm as={GripVertical} className="opacity-0 transition-opacity group-hover:opacity-60" />
        </span>
      </div>

      {node.type === 'folder' && isExpanded && childrenNodes.length > 0 && (
        <div role="group">{childrenNodes.map((child) => renderChild(child, depth + 1))}</div>
      )}
    </div>
  );
}
