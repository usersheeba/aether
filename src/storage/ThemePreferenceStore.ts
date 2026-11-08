/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Theme } from '../store/useUIStore';

const THEME_STORAGE_KEY = 'aether_theme';

export function readStoredTheme(): Theme {
  try {
    return localStorage.getItem(THEME_STORAGE_KEY) === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

export function storeTheme(theme: Theme): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch (error) {
    console.error('Could not persist the theme preference', error);
  }
}
