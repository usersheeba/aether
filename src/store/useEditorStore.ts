/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Editor } from '@tiptap/react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type EditorViewMode = 'continuous' | 'page';
export type SceneSeparator = 'none' | 'line' | 'asterisks';
export type WorkspaceWidthOption = 'narrow' | 'medium' | 'wide' | 'full';

export type ProseTypography = 'book' | 'draft';

export interface EditorPreferences {
  viewMode: EditorViewMode;
  zoomLevel: number;
  workspaceWidth: WorkspaceWidthOption;
  fontFamily: string;
  fontSizePx: number;
  lineHeight: number;
  /** `book` sets prose like a printed page; `draft` keeps paragraph gaps. */
  typography: ProseTypography;
  /** BCP-47 language of the manuscript, used for hyphenation. */
  language: string;
}

export type ToolbarItem = 'blockType' | 'marks' | 'lists' | 'alignment' | 'find' | 'viewMode' | 'zoom' | 'bubble';

export type ToolbarConfig = Record<ToolbarItem, boolean>;

export const DEFAULT_TOOLBAR: ToolbarConfig = {
  blockType: true,
  marks: true,
  lists: true,
  alignment: true,
  find: true,
  viewMode: true,
  zoom: true,
  bubble: true,
};

interface EditorState extends EditorPreferences {
  /** Live ProseMirror instance, shared with the toolbar and the menu bar. */
  editor: Editor | null;
  /** Actual Paged.js page count for the read-only preview, never persisted. */
  pageCount: number | null;
  /** Which toolbar groups are visible; persisted with the other preferences. */
  toolbar: ToolbarConfig;
  /** Draft view: the whole manuscript folder in one continuous scroll. */
  draftMode: boolean;
  sceneSeparator: SceneSeparator;
  isSearchOpen: boolean;
  searchQuery: string;
  replaceQuery: string;

  setEditor: (editor: Editor | null) => void;
  setViewMode: (mode: EditorViewMode) => void;
  setPageCount: (count: number | null) => void;
  setZoomLevel: (zoom: number) => void;
  setWorkspaceWidth: (width: WorkspaceWidthOption) => void;
  setFontFamily: (font: string) => void;
  setFontSizePx: (size: number) => void;
  setLineHeight: (height: number) => void;
  setTypography: (typography: ProseTypography) => void;
  setLanguage: (language: string) => void;
  toggleToolbarItem: (item: ToolbarItem) => void;
  resetToolbar: () => void;
  setDraftMode: (enabled: boolean) => void;
  toggleDraftMode: () => void;
  setSceneSeparator: (separator: SceneSeparator) => void;
  toggleSearch: () => void;
  setSearchQuery: (query: string) => void;
  setReplaceQuery: (query: string) => void;
}

function detectLanguage(): string {
  if (typeof navigator === 'undefined') return 'en';
  const code = navigator.language?.slice(0, 2).toLowerCase();
  return code && code.length === 2 ? code : 'en';
}

const MIN_ZOOM = 50;
const MAX_ZOOM = 200;

const DEFAULT_PREFERENCES: EditorPreferences = {
  viewMode: 'continuous',
  zoomLevel: 100,
  workspaceWidth: 'medium',
  fontFamily: 'Literata',
  fontSizePx: 17,
  lineHeight: 1.7,
  typography: 'book',
  language: detectLanguage(),
};

type PersistedState = EditorPreferences & { toolbar: ToolbarConfig; sceneSeparator: SceneSeparator };

const LEGACY_FONT_FAMILIES: Record<string, string> = {
  Georgia: 'Literata',
  'Times New Roman': 'PT Serif',
  Arial: 'Inter',
  'Courier New': 'JetBrains Mono',
  Garamond: 'EB Garamond',
  Cinzel: 'Cinzel',
};

function migrateFontFamily(fontFamily: unknown): string {
  if (typeof fontFamily !== 'string') return DEFAULT_PREFERENCES.fontFamily;
  return LEGACY_FONT_FAMILIES[fontFamily] ?? fontFamily;
}

export const useEditorStore = create<EditorState>()(
  persist(
    (set) => ({
      ...DEFAULT_PREFERENCES,
      editor: null,
      pageCount: null,
      toolbar: { ...DEFAULT_TOOLBAR },
      draftMode: false,
      sceneSeparator: 'none',
      isSearchOpen: false,
      searchQuery: '',
      replaceQuery: '',

      setEditor: (editor) => set({ editor }),
      setViewMode: (viewMode) => set({ viewMode, pageCount: null }),
      setPageCount: (pageCount) => set({ pageCount }),
      setZoomLevel: (zoom) => set({ zoomLevel: Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(zoom))) }),
      setWorkspaceWidth: (workspaceWidth) => set({ workspaceWidth }),
      setFontFamily: (fontFamily) => set({ fontFamily }),
      setFontSizePx: (size) => set({ fontSizePx: Math.min(48, Math.max(8, Math.round(size))) }),
      setLineHeight: (lineHeight) => set({ lineHeight }),
      setTypography: (typography) => set({ typography }),
      setLanguage: (language) => set({ language }),
      toggleToolbarItem: (item) =>
        set((state) => ({ toolbar: { ...state.toolbar, [item]: !state.toolbar[item] } })),
      resetToolbar: () => set({ toolbar: { ...DEFAULT_TOOLBAR } }),
      setDraftMode: (draftMode) => set({ draftMode, editor: null }),
      toggleDraftMode: () => set((state) => ({ draftMode: !state.draftMode, editor: null })),
      setSceneSeparator: (sceneSeparator) => set({ sceneSeparator }),
      toggleSearch: () => set((state) => ({ isSearchOpen: !state.isSearchOpen })),
      setSearchQuery: (searchQuery) => set({ searchQuery }),
      setReplaceQuery: (replaceQuery) => set({ replaceQuery }),
    }),
    {
      name: 'aether_editor_preferences_v1',
      version: 2,
      migrate: (persistedState, version) => {
        const state = (persistedState ?? {}) as Partial<PersistedState>;
        if (version < 2) {
          return {
            ...DEFAULT_PREFERENCES,
            toolbar: { ...DEFAULT_TOOLBAR },
            sceneSeparator: 'none',
            ...state,
            fontFamily: migrateFontFamily(state.fontFamily),
          } as PersistedState;
        }
        return state as PersistedState;
      },
      // Only typography/layout/toolbar preferences are persisted; the editor
      // instance, search UI state and the action functions must never be serialised.
      partialize: (state): PersistedState => ({
        viewMode: state.viewMode,
        zoomLevel: state.zoomLevel,
        workspaceWidth: state.workspaceWidth,
        fontFamily: state.fontFamily,
        fontSizePx: state.fontSizePx,
        lineHeight: state.lineHeight,
        typography: state.typography,
        language: state.language,
        toolbar: state.toolbar,
        sceneSeparator: state.sceneSeparator,
      }),
    }
  )
);
