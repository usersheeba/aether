/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { create } from 'zustand';
import { readStoredTheme, storeTheme } from '../storage/ThemePreferenceStore';

export type AppViewMode = 'start_page' | 'workspace';
export type Theme = 'dark' | 'light';
export type ActiveModal = 'create_project' | 'settings' | null;

function applyTheme(theme: Theme): void {
  document.documentElement.classList.toggle('dark', theme === 'dark');
}

function isCompactWorkspace(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(max-width: 899px)').matches;
}

interface UIState {
  viewMode: AppViewMode;
  theme: Theme;
  activeModal: ActiveModal;
  isBinderVisible: boolean;
  isInspectorVisible: boolean;
  isStatusBarVisible: boolean;

  setViewMode: (mode: AppViewMode) => void;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  setActiveModal: (modal: ActiveModal) => void;
  toggleBinder: () => void;
  toggleInspector: () => void;
  toggleFocusMode: () => void;
  toggleStatusBar: () => void;
  setBinderVisible: (visible: boolean) => void;
  setInspectorVisible: (visible: boolean) => void;
  setStatusBarVisible: (visible: boolean) => void;
}

export const useUIStore = create<UIState>((set, get) => ({
  viewMode: 'start_page',
  theme: readStoredTheme(),
  activeModal: null,
  isBinderVisible: true,
  isInspectorVisible: true,
  isStatusBarVisible: true,

  setViewMode: (mode) => set({ viewMode: mode }),

  setTheme: (theme) => {
    storeTheme(theme);
    applyTheme(theme);
    set({ theme });
  },

  toggleTheme: () => get().setTheme(get().theme === 'dark' ? 'light' : 'dark'),

  setActiveModal: (modal) => set({ activeModal: modal }),

  toggleBinder: () =>
    set((state) => {
      const isBinderVisible = !state.isBinderVisible;
      return isCompactWorkspace()
        ? { isBinderVisible, isInspectorVisible: false }
        : { isBinderVisible };
    }),
  toggleInspector: () =>
    set((state) => {
      const isInspectorVisible = !state.isInspectorVisible;
      return isCompactWorkspace()
        ? { isBinderVisible: false, isInspectorVisible }
        : { isInspectorVisible };
    }),
  toggleFocusMode: () =>
    set((state) => {
      const shouldFocus = state.isBinderVisible || state.isInspectorVisible;
      if (isCompactWorkspace()) {
        return shouldFocus
          ? { isBinderVisible: false, isInspectorVisible: false }
          : { isBinderVisible: true, isInspectorVisible: false };
      }
      return { isBinderVisible: !shouldFocus, isInspectorVisible: !shouldFocus };
    }),
  toggleStatusBar: () => set((state) => ({ isStatusBarVisible: !state.isStatusBarVisible })),

  setBinderVisible: (visible) =>
    set(() =>
      visible && isCompactWorkspace()
        ? { isBinderVisible: true, isInspectorVisible: false }
        : { isBinderVisible: visible }
    ),
  setInspectorVisible: (visible) =>
    set(() =>
      visible && isCompactWorkspace()
        ? { isBinderVisible: false, isInspectorVisible: true }
        : { isInspectorVisible: visible }
    ),
  setStatusBarVisible: (visible) => set({ isStatusBarVisible: visible }),
}));

// Keep the root element in sync with the persisted theme on first paint.
applyTheme(readStoredTheme());
