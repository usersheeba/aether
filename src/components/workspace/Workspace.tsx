/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useLayoutEffect, useRef } from 'react';
import { SettingsModal } from '../modals/SettingsModal';
import { useEditorStore } from '../../store/useEditorStore';
import { useProjectStore } from '../../store/useProjectStore';
import { useUIStore } from '../../store/useUIStore';
import { BinderPanel } from './Binder/BinderPanel';
import { EditorCanvas } from './Editor/EditorCanvas';
import { InspectorPanel } from './Inspector/InspectorPanel';
import { MenuBar } from './MenuBar';
import { StatusBar } from './StatusBar';
import { ToolBar } from './ToolBar';

const AUTOMATIC_BACKUP_INTERVAL_MS = 24 * 60 * 60 * 1000;

export function Workspace() {
  const projectReadOnly = useProjectStore((state) => state.projectReadOnly);
  const isBinderVisible = useUIStore((state) => state.isBinderVisible);
  const isInspectorVisible = useUIStore((state) => state.isInspectorVisible);
  const desktopPanelVisibility = useRef({
    isBinderVisible: useUIStore.getState().isBinderVisible,
    isInspectorVisible: useUIStore.getState().isInspectorVisible,
  });
  const compactMode = useRef<boolean | null>(null);

  useLayoutEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 899px)');
    const syncPanelVisibility = () => {
      if (compactMode.current === mediaQuery.matches) return;

      if (mediaQuery.matches) {
        const { isBinderVisible, isInspectorVisible } = useUIStore.getState();
        desktopPanelVisibility.current = { isBinderVisible, isInspectorVisible };
        useUIStore.setState({ isBinderVisible: false, isInspectorVisible: false });
      } else if (compactMode.current === true) {
        useUIStore.setState(desktopPanelVisibility.current);
      }

      compactMode.current = mediaQuery.matches;
    };

    syncPanelVisibility();
    mediaQuery.addEventListener('change', syncPanelVisibility);
    return () => mediaQuery.removeEventListener('change', syncPanelVisibility);
  }, []);

  useEffect(() => {
    let backupInProgress = false;
    const saveSessionBackup = (snapshotBeforeExit = false) => {
      if (backupInProgress) return;
      backupInProgress = true;
      void (async () => {
        const store = useProjectStore.getState();
        try {
          if (snapshotBeforeExit) {
            await store.createSafetySnapshot('Automatic session checkpoint');
          } else {
            await store.saveActiveDocumentNow();
            await store.flushManuscriptDocuments();
          }
          if (useProjectStore.getState().autoSaveStatus === 'error') {
            throw new Error('The latest changes could not be saved, so the automatic backup was skipped.');
          }
          await useProjectStore.getState().saveAutomaticBackup();
        } catch (error) {
          console.error('Could not save an automatic backup before leaving the workspace.', error);
          if (!useProjectStore.getState().errorMessage) {
            useProjectStore.setState({
              errorMessage: error instanceof Error ? error.message : 'Could not save the automatic backup.',
            });
          }
        } finally {
          backupInProgress = false;
        }
      })();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'hidden') return;
      saveSessionBackup();
    };
    const handlePageHide = () => saveSessionBackup(true);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!event.metaKey && !event.ctrlKey) return;

      const key = event.key.toLowerCase();

      if (key === 's' && !event.shiftKey) {
        event.preventDefault();
        void useProjectStore.getState().saveActiveDocumentNow();
        return;
      }

      if (key === 'f' && !event.shiftKey) {
        event.preventDefault();
        useEditorStore.getState().toggleSearch();
        return;
      }

      if (event.key === '\\') {
        event.preventDefault();
        useUIStore.getState().toggleFocusMode();
        return;
      }

      if (event.shiftKey && key === 'b') {
        event.preventDefault();
        useUIStore.getState().toggleBinder();
        return;
      }

      if (event.shiftKey && key === 'i') {
        event.preventDefault();
        useUIStore.getState().toggleInspector();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', handlePageHide);
    const backupTimer = window.setInterval(saveSessionBackup, AUTOMATIC_BACKUP_INTERVAL_MS);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', handlePageHide);
      window.clearInterval(backupTimer);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-canvas text-ink select-none">
      <MenuBar />
      <ToolBar />
      {projectReadOnly && (
        <div className="border-b border-warning/30 bg-warning-soft px-4 py-2 text-center text-small text-warning" role="status">
          This project uses a newer data format and is open read-only. Update Aether Writer to edit it.
        </div>
      )}

      <div className="workspace-panels relative flex min-w-0 flex-1 overflow-hidden">
        {(isBinderVisible || isInspectorVisible) && (
          <button
            type="button"
            className="workspace-panel-backdrop"
            aria-label="Close side panel"
            onClick={() => useUIStore.setState({ isBinderVisible: false, isInspectorVisible: false })}
          />
        )}
        <BinderPanel />
        <EditorCanvas />
        <InspectorPanel />
      </div>

      <StatusBar />
      <SettingsModal />
    </div>
  );
}
