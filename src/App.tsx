/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Suspense, lazy, useEffect } from 'react';
import { StartPage } from './components/start/StartPage';
import { requestPersistentStorageAfterUserAction } from './storage/BrowserStoragePersistence';
import { useProjectStore } from './store/useProjectStore';
import { useUIStore } from './store/useUIStore';

const AUTOMATIC_BACKUP_INTERVAL_MS = 24 * 60 * 60 * 1000;

// The workspace pulls in the whole TipTap/ProseMirror bundle, so it is only
// loaded once a project is actually opened.
const Workspace = lazy(() =>
  import('./components/workspace/Workspace').then((module) => ({ default: module.Workspace }))
);

export default function App() {
  const viewMode = useUIStore((state) => state.viewMode);
  const activeProject = useProjectStore((state) => state.activeProject);
  const showWorkspace = viewMode === 'workspace' && activeProject !== null;

  useEffect(() => {
    const handleFirstInteraction = () => {
      requestPersistentStorageAfterUserAction();
      window.removeEventListener('pointerdown', handleFirstInteraction, true);
      window.removeEventListener('keydown', handleFirstInteraction, true);
    };
    window.addEventListener('pointerdown', handleFirstInteraction, { capture: true, once: true });
    window.addEventListener('keydown', handleFirstInteraction, { capture: true, once: true });
    return () => {
      window.removeEventListener('pointerdown', handleFirstInteraction, true);
      window.removeEventListener('keydown', handleFirstInteraction, true);
    };
  }, []);

  useEffect(() => {
    if (showWorkspace) return;
    let backupInProgress = false;
    const saveAutomaticBackup = () => {
      if (backupInProgress) return;
      backupInProgress = true;
      void useProjectStore
        .getState()
        .saveAutomaticBackup()
        .catch((error: unknown) => {
          console.error('Could not save an automatic backup from the project library.', error);
        })
        .finally(() => {
          backupInProgress = false;
        });
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') saveAutomaticBackup();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', saveAutomaticBackup);
    const backupTimer = window.setInterval(saveAutomaticBackup, AUTOMATIC_BACKUP_INTERVAL_MS);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', saveAutomaticBackup);
      window.clearInterval(backupTimer);
    };
  }, [showWorkspace]);

  return (
    <div className="h-screen w-screen overflow-hidden bg-canvas text-ink">
      {showWorkspace ? (
        <Suspense
          fallback={
            <div className="h-full flex items-center justify-center text-caption font-mono text-ink-faint">
              Loading workspace…
            </div>
          }
        >
          <Workspace />
        </Suspense>
      ) : (
        <StartPage />
      )}
    </div>
  );
}
