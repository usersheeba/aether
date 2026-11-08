/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { BinderNode } from '../types/project';
import { compareBinderOrder } from './binderOrder';

/** Folder names that act as Scrivener's "Draft": the compiled manuscript. */
const MANUSCRIPT_TITLE = /^(manuscript|draft|рукопись|сценарий|screenplay|script)\b/i;

/**
 * Resolves the manuscript root: the first top-level folder that looks like a
 * Draft folder, otherwise the first top-level folder of the project.
 */
export function resolveManuscriptFolder(tree: BinderNode[]): BinderNode | null {
  const roots = tree
    .filter((node) => node.parentId === null && node.type === 'folder')
    .sort(compareBinderOrder);

  return roots.find((node) => MANUSCRIPT_TITLE.test(node.title.trim())) ?? roots[0] ?? null;
}

/**
 * Depth-first, order-preserving list of documents that make up the manuscript.
 * Folders are traversed, everything that is not a document-like node is skipped.
 */
export function collectManuscriptNodes(tree: BinderNode[], rootId: string): BinderNode[] {
  const result: BinderNode[] = [];

  const visit = (parentId: string) => {
    const children = tree
      .filter((node) => node.parentId === parentId)
      .sort(compareBinderOrder);

    for (const child of children) {
      if (child.type === 'folder') visit(child.id);
      else result.push(child);
    }
  };

  visit(rootId);
  return result;
}
