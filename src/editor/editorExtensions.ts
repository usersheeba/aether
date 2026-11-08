/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { FontFamily } from '@tiptap/extension-font-family';
import Image from '@tiptap/extension-image';
import { TableKit } from '@tiptap/extension-table';
import { TextAlign } from '@tiptap/extension-text-align';
import { TextStyle } from '@tiptap/extension-text-style';
import type { Extensions } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Collaboration from '@tiptap/extension-collaboration';
import type * as Y from 'yjs';
import { applyTypographyToPastedText, TypographyExtension } from './typography.ts';

/** Strips Word/Google Docs cruft while preserving paragraph structure. */
function cleanPastedHTML(html: string): string {
  const container = document.createElement('div');
  container.innerHTML = html;

  container.querySelectorAll('script, style, meta, link, iframe, object, embed, title').forEach((element) => {
    element.remove();
  });
  container.querySelectorAll('*').forEach((element) => {
    if (element.tagName.includes(':')) {
      element.replaceWith(...Array.from(element.childNodes));
      return;
    }
    for (const attribute of Array.from(element.attributes)) {
      element.removeAttribute(attribute.name);
    }
  });

  const comments = document.createTreeWalker(container, NodeFilter.SHOW_COMMENT);
  const commentNodes: Comment[] = [];
  while (comments.nextNode()) commentNodes.push(comments.currentNode as Comment);
  commentNodes.forEach((comment) => comment.remove());

  return container.textContent?.trim() ? container.innerHTML.trim() : '';
}

/** Extracts plain text paragraphs from HTML, preserving structure. */
function extractParagraphsFromHTML(html: string): string[] {
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = html;

  const paragraphs: string[] = [];
  const leafBlockTags = new Set(['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'PRE']);
  const blockTags = new Set([
    ...leafBlockTags,
    'BLOCKQUOTE',
    'DIV',
    'LI',
    'OL',
    'UL',
    'TABLE',
    'TBODY',
    'THEAD',
    'TFOOT',
    'TR',
    'TD',
    'TH',
  ]);

  const textContent = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? '';
    if (node instanceof HTMLElement && node.tagName === 'BR') return ' ';
    return Array.from(node.childNodes, textContent).join('');
  };
  const appendText = (content: string): void => {
    const text = content.replace(/[ \t\r\n]+/g, ' ').trim();
    if (text) paragraphs.push(text);
  };
  const visitChildren = (parent: ParentNode): void => {
    let inlineContent = '';
    const flushInlineContent = () => {
      appendText(inlineContent);
      inlineContent = '';
    };

    parent.childNodes.forEach((child) => {
      if (child instanceof HTMLElement && blockTags.has(child.tagName)) {
        flushInlineContent();
        visit(child);
      } else {
        inlineContent += textContent(child);
      }
    });
    flushInlineContent();
  };
  const visit = (node: HTMLElement): void => {
    if (leafBlockTags.has(node.tagName)) {
      appendText(textContent(node));
    } else {
      visitChildren(node);
    }
  };
  visitChildren(tempDiv);

  return paragraphs;
}

export function createEditorExtensions(options: {
  collaborationDocument?: Y.Doc | null;
  language?: string | (() => string);
} = {}): Extensions {
  const collaborationDocument = options.collaborationDocument ?? null;
  const language = options.language ?? 'en';
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3, 4] },
      ...(collaborationDocument ? { undoRedo: false } : {}),
    }),
    TextAlign.configure({
      types: ['heading', 'paragraph'],
      alignments: ['left', 'center', 'right', 'justify'],
      defaultAlignment: null,
    }),
    TextStyle,
    FontFamily,
    Image.configure({ allowBase64: true }),
    TableKit.configure({ table: { resizable: false } }),
    ...(collaborationDocument
      ? [Collaboration.configure({ document: collaborationDocument, field: 'default' })]
      : []),
    TypographyExtension(language),
  ];
}

export { cleanPastedHTML, extractParagraphsFromHTML, applyTypographyToPastedText };
