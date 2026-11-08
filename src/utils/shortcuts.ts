/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.userAgent);

/**
 * Shortcut labels for the current platform. Keeping them in one place stops the
 * UI from advertising "⌘S" on a Windows machine, where the key is Ctrl.
 */
export const SHORTCUTS = {
  save: IS_MAC ? '⌘S' : 'Ctrl+S',
  undo: IS_MAC ? '⌘Z' : 'Ctrl+Z',
  redo: IS_MAC ? '⌘⇧Z' : 'Ctrl+Shift+Z',
  cut: IS_MAC ? '⌘X' : 'Ctrl+X',
  copy: IS_MAC ? '⌘C' : 'Ctrl+C',
  selectAll: IS_MAC ? '⌘A' : 'Ctrl+A',
  find: IS_MAC ? '⌘F' : 'Ctrl+F',
  binder: IS_MAC ? '⌘⇧B' : 'Ctrl+Shift+B',
  inspector: IS_MAC ? '⌘⇧I' : 'Ctrl+Shift+I',
  focus: IS_MAC ? '⌘\\' : 'Ctrl+\\',
} as const;
