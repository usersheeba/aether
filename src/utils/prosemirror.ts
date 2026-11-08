/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Editor } from '@tiptap/react';
import { escapeRegExp } from './text';

/**
 * Replaces literal text inside the ProseMirror document while keeping every
 * mark and block structure intact (a plain-text rebuild would flatten headings,
 * alignment and inline formatting).
 *
 * @returns the number of replaced occurrences.
 */
export function replaceTextInEditor(
  editor: Editor,
  query: string,
  replacement: string,
  replaceAll: boolean
): number {
  if (!query) return 0;

  const pattern = new RegExp(escapeRegExp(query), replaceAll ? 'gi' : 'i');
  const ranges: { from: number; to: number }[] = [];

  editor.state.doc.descendants((node, position) => {
    if (!node.isText || !node.text) return true;

    pattern.lastIndex = 0;
    let match = pattern.exec(node.text);
    while (match) {
      ranges.push({ from: position + match.index, to: position + match.index + match[0].length });
      if (!replaceAll) return false;
      match = pattern.exec(node.text);
    }
    return true;
  });

  if (ranges.length === 0) return 0;

  const transaction = editor.state.tr;
  // Apply from the end so earlier positions stay valid.
  for (const range of [...ranges].sort((a, b) => b.from - a.from)) {
    if (replacement) transaction.insertText(replacement, range.from, range.to);
    else transaction.delete(range.from, range.to);
  }
  editor.view.dispatch(transaction);

  return ranges.length;
}
