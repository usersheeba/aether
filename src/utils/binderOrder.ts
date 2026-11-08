/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { generateKeyBetween, generateNKeysBetween } from 'fractional-indexing';
import type { BinderNode } from '../types/project';

export function compareBinderOrder(a: BinderNode, b: BinderNode): number {
  if (a.orderKey && b.orderKey) {
    if (a.orderKey !== b.orderKey) return a.orderKey < b.orderKey ? -1 : 1;
    return a.id.localeCompare(b.id);
  }
  return a.sortOrder - b.sortOrder || a.id.localeCompare(b.id);
}

export function normalizeBinderOrder(tree: BinderNode[]): BinderNode[] {
  const groups = new Map<string | null, BinderNode[]>();
  for (const node of tree) {
    const siblings = groups.get(node.parentId) ?? [];
    siblings.push(node);
    groups.set(node.parentId, siblings);
  }

  const normalized = new Map<string, BinderNode>();
  for (const siblings of groups.values()) {
    const hasMissingKey = siblings.some((node) => !node.orderKey);
    const ordered = [...siblings].sort(compareBinderOrder);
    if (!hasMissingKey) {
      for (const node of siblings) normalized.set(node.id, node);
      continue;
    }

    const keys = generateNKeysBetween(null, null, ordered.length);
    ordered.forEach((node, index) => {
      normalized.set(node.id, { ...node, orderKey: keys[index] });
    });
  }

  return tree.map((node) => normalized.get(node.id) ?? node);
}

export function orderKeyAt(tree: BinderNode[], parentId: string | null, index: number): string {
  const siblings = tree
    .filter((node) => node.parentId === parentId)
    .sort(compareBinderOrder);
  const boundedIndex = Math.max(0, Math.min(index, siblings.length));
  let before = siblings[boundedIndex - 1]?.orderKey ?? null;
  let after = siblings[boundedIndex]?.orderKey ?? null;
  if (before && before === after) {
    let nextIndex = boundedIndex;
    while (siblings[nextIndex]?.orderKey === before) nextIndex += 1;
    after = siblings[nextIndex]?.orderKey ?? null;
  }
  return generateKeyBetween(before, after);
}
