/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ChevronsDownUp, ChevronsUpDown, FolderPlus, PanelLeftClose, Plus, Search, UserPlus } from 'lucide-react';
import { useState } from 'react';
import type { DragEvent, MouseEvent, ReactNode } from 'react';
import { useProjectStore } from '../../../store/useProjectStore';
import { useUIStore } from '../../../store/useUIStore';
import type { BinderNode, DocumentStatus, NodeType } from '../../../types/project';
import { compareBinderOrder } from '../../../utils/binderOrder';
import { BinderContextMenu } from './BinderContextMenu';
import { BinderTreeItem } from './BinderTreeItem';
import { IconSm, IconButton } from '../../../design/components';

const PANEL_WIDTH = 276;

interface ContextMenuState {
  x: number;
  y: number;
  nodeId: string;
  opener: HTMLElement;
}

function bySortOrder(a: BinderNode, b: BinderNode): number {
  return compareBinderOrder(a, b);
}

export function BinderPanel() {
  const { isBinderVisible, toggleBinder } = useUIStore();
  const {
    activeProject,
    activeDocumentId,
    selectNode,
    createNode,
    updateNode,
    deleteNode,
    moveNode,
    duplicateNode,
    setFoldersExpanded,
  } = useProjectStore();

  const [filterQuery, setFilterQuery] = useState('');
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [draggedNodeId, setDraggedNodeId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  if (!activeProject) return null;

  const tree = activeProject.tree;
  const isFiltering = filterQuery.trim() !== '';
  const rootNodes = tree.filter((node) => node.parentId === null).sort(bySortOrder);
  const contextNode = contextMenu === null ? null : (tree.find((node) => node.id === contextMenu.nodeId) ?? null);

  const childrenOf = (nodeId: string | null): BinderNode[] => tree.filter((node) => node.parentId === nodeId).sort(bySortOrder);

  const matchesFilter = (node: BinderNode): boolean => {
    const query = filterQuery.trim().toLowerCase();
    if (!query) return true;
    if (node.title.toLowerCase().includes(query)) return true;
    return tree.some((child) => child.parentId === node.id && matchesFilter(child));
  };

  const hasFilteredRootNodes = rootNodes.some(matchesFilter);

  const isDropInsideDraggedNode = (targetId: string): boolean => {
    let current = tree.find((node) => node.id === targetId);
    while (current) {
      if (current.id === draggedNodeId) return true;
      const parentId = current.parentId;
      current = parentId === null ? undefined : tree.find((node) => node.id === parentId);
    }
    return false;
  };

  const handleToggleExpand = (nodeId: string) => {
    const node = tree.find((entry) => entry.id === nodeId);
    if (node) void updateNode(nodeId, { expanded: !node.expanded });
  };

  const handleSaveRename = (nodeId: string, newTitle: string) => {
    setEditingNodeId(null);
    void updateNode(nodeId, { title: newTitle });
  };

  const handleContextMenu = (event: MouseEvent<HTMLDivElement>, node: BinderNode) => {
    event.preventDefault();
    setContextMenu({ x: event.clientX, y: event.clientY, nodeId: node.id, opener: event.currentTarget });
  };

  const handleDuplicate = (node: BinderNode) => {
    void duplicateNode(node.id);
  };

  const handleDelete = (nodeId: string) => {
    const node = tree.find((entry) => entry.id === nodeId);
    const hasChildren = tree.some((entry) => entry.parentId === nodeId);
    const message = hasChildren
      ? `Delete "${node?.title ?? 'this folder'}" and everything inside it? This cannot be undone.`
      : `Delete "${node?.title ?? 'this item'}"? This cannot be undone.`;
    if (!window.confirm(message)) return;
    void deleteNode(nodeId);
  };

  const handleDragStart = (event: DragEvent, node: BinderNode) => {
    setDraggedNodeId(node.id);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', node.id);
  };

  const handleDragOver = (_event: DragEvent, node: BinderNode) => {
    if (!draggedNodeId || draggedNodeId === node.id || isDropInsideDraggedNode(node.id)) return;
    setDropTargetId(node.id);
  };

  const handleDrop = (event: DragEvent, target: BinderNode) => {
    event.preventDefault();

    const draggedId = draggedNodeId;
    const isInvalidTarget = isDropInsideDraggedNode(target.id);
    setDraggedNodeId(null);
    setDropTargetId(null);

    if (!draggedId || isInvalidTarget || draggedId === target.id) return;

    if (target.type === 'folder') {
      const childCount = childrenOf(target.id).filter((node) => node.id !== draggedId).length;
      void moveNode(draggedId, target.id, childCount);
      return;
    }

    const siblings = childrenOf(target.parentId).filter((node) => node.id !== draggedId);
    const targetIndex = siblings.findIndex((node) => node.id === target.id);
    void moveNode(draggedId, target.parentId, targetIndex === -1 ? siblings.length : targetIndex + 1);
  };

  const renderNode = (node: BinderNode, depth: number): ReactNode => {
    if (!matchesFilter(node)) return null;

    return (
      <BinderTreeItem
        key={node.id}
        node={node}
        depth={depth}
        isSelected={activeDocumentId === node.id}
        isEditing={editingNodeId === node.id}
        isExpanded={isFiltering || Boolean(node.expanded)}
        isFiltering={isFiltering}
        isDropTarget={dropTargetId === node.id}
        childrenNodes={childrenOf(node.id)}
        onSelect={(nodeId) => void selectNode(nodeId)}
        onToggleExpand={handleToggleExpand}
        onStartRename={setEditingNodeId}
        onSaveRename={handleSaveRename}
        onCancelRename={() => setEditingNodeId(null)}
        onContextMenu={handleContextMenu}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragLeave={() => setDropTargetId(null)}
        onDrop={handleDrop}
        renderChild={renderNode}
      />
    );
  };

  const quickCreate = (type: NodeType) => {
    void createNode(null, type);
  };

  return (
    <aside
      aria-hidden={!isBinderVisible}
      aria-label="Project binder"
      inert={!isBinderVisible}
      data-visible={isBinderVisible}
      className={`workspace-drawer workspace-drawer-left relative h-full shrink-0 overflow-hidden border-r bg-sidebar transition-[width] duration-200 ease-out ${
        isBinderVisible ? 'w-[276px] border-line' : 'w-0 border-transparent'
      }`}
    >
      <div className="workspace-drawer-content flex h-full flex-col" style={{ width: PANEL_WIDTH }}>
        <div className="flex h-9 shrink-0 items-center justify-between px-3">
          <div className="flex items-baseline gap-1.5">
            <span className="text-[12px] font-medium text-ink">Binder</span>
            <span className="text-[11px] tabular-nums text-ink-faint">{tree.length}</span>
          </div>

          <div className="flex items-center gap-0.5">
            <IconButton
              label="Expand all"
              onClick={() => void setFoldersExpanded(true)}
              aria-label="Expand all folders"
            >
              <IconSm as={ChevronsUpDown} />
            </IconButton>
            <IconButton
              label="Collapse all"
              onClick={() => void setFoldersExpanded(false)}
              aria-label="Collapse all folders"
            >
              <IconSm as={ChevronsDownUp} />
            </IconButton>
            <IconButton
              label="Hide binder"
              onClick={toggleBinder}
              aria-label="Hide binder"
            >
              <IconSm as={PanelLeftClose} />
            </IconButton>
          </div>
        </div>

        <div className="px-2 pb-1.5">
          <div className="relative">
            <IconSm as={Search} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-ink-faint" />
            <input
              type="text"
              value={filterQuery}
              onChange={(event) => setFilterQuery(event.target.value)}
              placeholder="Search"
              aria-label="Search binder"
              className="h-11 w-full rounded-md border border-transparent bg-transparent pl-7 pr-2 text-[12.5px] text-ink transition-colors placeholder:text-ink-faint hover:bg-hover focus:border-line focus:bg-surface focus:outline-none"
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-2">
          {rootNodes.length === 0 ? (
            <p className="px-2 py-6 text-center text-[12px] leading-relaxed text-ink-faint">
              No pages yet.
              <br />
              Create your first document.
            </p>
          ) : !hasFilteredRootNodes ? (
            <div className="px-2 py-6 text-center text-[12px] leading-relaxed text-ink-faint">
              <p>No matching pages.</p>
              <button
                type="button"
                onClick={() => setFilterQuery('')}
                className="mt-2 min-h-11 rounded-md px-3 text-ink-muted transition-colors hover:bg-hover hover:text-ink"
              >
                Clear search
              </button>
            </div>
          ) : (
            <div role="tree" aria-label={`${activeProject.title} documents`}>
              {rootNodes.map((node) => renderNode(node, 0))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-1 border-t border-line p-2">
          <button
            type="button"
            onClick={() => quickCreate('document')}
            className="flex min-h-11 flex-1 items-center gap-1.5 rounded-md px-2 text-[12.5px] text-ink-muted transition-colors hover:bg-hover hover:text-ink"
          >
            <IconSm as={Plus} />
            New document
          </button>
          <IconButton
            label="New folder"
            onClick={() => quickCreate('folder')}
            aria-label="New folder"
          >
            <IconSm as={FolderPlus} />
          </IconButton>
          <IconButton
            label="New character card"
            onClick={() => quickCreate('character_card')}
            aria-label="New character card"
          >
            <IconSm as={UserPlus} />
          </IconButton>
        </div>
      </div>

      {contextMenu && contextNode && (
        <BinderContextMenu
          key={contextNode.id}
          x={contextMenu.x}
          y={contextMenu.y}
          opener={contextMenu.opener}
          node={contextNode}
          onClose={() => setContextMenu(null)}
          onRename={setEditingNodeId}
          onDelete={handleDelete}
          onCreateChild={(parentId, type) => void createNode(parentId, type)}
          onChangeStatus={(nodeId, status: DocumentStatus) => void updateNode(nodeId, { status })}
          onChangeColor={(nodeId, colorLabel) => void updateNode(nodeId, { colorLabel })}
          onDuplicate={handleDuplicate}
        />
      )}
    </aside>
  );
}
