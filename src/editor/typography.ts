/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Typographic engine for automatic text transformations:
 * - Smart quotes (guillemets for RU, curly for EN)
 * - Em dashes (—) instead of double hyphens
 * - Non-breaking spaces after short prepositions (RU)
 */

import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';

/** Replaces straight quotes with smart quotes based on language. */
function replaceQuotes(text: string, language: string): string {
  return text.replace(/["']/g, (quote, index) => {
    const before = text.slice(0, index);
    const after = text.slice(index + 1);
    const opening = !before || /[\s([{—–-]$/u.test(before);

    if (quote === "'") {
      if (/\p{L}$/u.test(before) && /^\p{L}/u.test(after)) return '’';
      if (language.startsWith('ru')) return opening ? '„' : '“';
      return opening ? '‘' : '’';
    }

    if (language.startsWith('ru')) return opening ? '«' : '»';
    return opening ? '“' : '”';
  });
}

/** Replaces double/triple hyphens with em dash. */
function replaceDashes(text: string): string {
  return text
    .replace(/---/g, '—')
    .replace(/--/g, '—');
}

/** Adds non-breaking spaces after short Russian prepositions. */
function addNonBreakingSpaces(text: string, language: string): string {
  if (!language.startsWith('ru')) return text;

  // Pattern: preposition at word boundary followed by whitespace
  return text.replace(
    /(^|[^\wа-яё])(в|на|с|и|к|о|за|у|по|из|от|до|при|над|под|перед|после|без|для|через|между|среди|вокруг|около|возле)\s+/gi,
    (_match, prefix, prep) => `${prefix}${prep}\u00A0`
  );
}

/** Applies all typographic transformations to a text node. */
function applyTypography(text: string, language: string): string {
  let result = text;
  result = replaceDashes(result);
  result = replaceQuotes(result, language);
  result = addNonBreakingSpaces(result, language);
  return result;
}

interface TypedTextTransformation {
  replaceBefore: number;
  replacement: string;
}

/** Transforms just-typed punctuation without rebuilding or reformatting the text block. */
export function transformTypedText(text: string, before: string, language: string): TypedTextTransformation | null {
  if (text === '-' && before.endsWith('-')) {
    return { replaceBefore: 1, replacement: '—' };
  }
  if (text === '-' && before.endsWith('—')) {
    return { replaceBefore: 1, replacement: '—' };
  }

  if (
    text === ' ' &&
    language.startsWith('ru') &&
    /(?:^|[^\p{L}])(?:в|к|с|у|о|на|по|за|из|от|до|без|для|над|под|при|перед|между)$/iu.test(before)
  ) {
    return { replaceBefore: 0, replacement: '\u00A0' };
  }

  let preceding = before;
  let transformed = '';
  for (const character of text) {
    let replacement = character;
    if (character === '"' || character === "'") {
      const opening = !preceding || /[\s([{—–-]$/u.test(preceding);
      if (language.startsWith('ru')) {
        replacement = character === '"' ? (opening ? '«' : '»') : (opening ? '„' : '“');
      } else {
        replacement = character === '"' ? (opening ? '“' : '”') : (opening ? '‘' : '’');
      }
    }
    transformed += replacement;
    preceding += replacement;
  }

  return transformed === text ? null : { replaceBefore: 0, replacement: transformed };
}

/** Creates a ProseMirror plugin for real-time typographic transformations. */
export function createTypographyPlugin(getLanguage: () => string) {
  let isComposingEvent = false;
  return new Plugin({
    key: new PluginKey('typography'),
    props: {
      handleDOMEvents: {
        beforeinput: (_view, event) => {
          isComposingEvent = (event as InputEvent).isComposing;
          return false;
        },
      },
      handleTextInput: (view, from, to, text) => {
        if (view.composing || isComposingEvent || !text) return false;

        const $from = view.state.doc.resolve(from);
        const before = $from.parent.textBetween(0, $from.parentOffset, '', '\uFFFC');
        const transformation = transformTypedText(text, before, getLanguage());
        if (!transformation) return false;

        const replaceFrom = from - transformation.replaceBefore;
        view.dispatch(view.state.tr.insertText(transformation.replacement, replaceFrom, to));
        return true;
      },
    },
  });
}

/** TipTap extension wrapper for the typography plugin. */
export function TypographyExtension(language: string | (() => string)) {
  const getLanguage = typeof language === 'function' ? language : () => language;
  return Extension.create({
    name: 'typography',
    addProseMirrorPlugins() {
      return [createTypographyPlugin(getLanguage)];
    },
  });
}

/** Applies typographic transformations to pasted content. */
export function applyTypographyToPastedText(text: string, language: string): string {
  return applyTypography(text, language);
}

/** Applies typographic transformations to a ProseMirror document. */
export function applyTypographyToDocument(doc: any, _language: string): any {
  // This would recursively walk the document and transform text nodes
  // For now, we'll use it on plain text during paste
  return doc;
}

// Export internal functions for testing
export { replaceQuotes, replaceDashes, addNonBreakingSpaces, applyTypography };