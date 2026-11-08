/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  AlertCircle,
  Download,
  FileText,
  MoreHorizontal,
  Moon,
  Pin,
  Plus,
  Search,
  Sun,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { confirmMigrationBackupSavedOutsideBrowser } from '../../storage/MigrationBackupConfirmation';
import { getAutomaticBackupFolder, writeAutomaticBackup } from '../../storage/BackupManager';
import { markFullBackupCreated, shouldShowWeeklyBackupReminder, snoozeWeeklyBackupReminder } from '../../storage/BackupReminder';
import { useProjectStore } from '../../store/useProjectStore';
import { useUIStore } from '../../store/useUIStore';
import { formatDate } from '../../utils/text';
import { CreateProjectModal } from './CreateProjectModal';
import { IconSm, IconMd, IconXl, IconButton } from '../../design/components';

type FilterTab = 'all' | 'pinned';

export function StartPage() {
  const { theme, toggleTheme, setActiveModal, setViewMode } = useUIStore();
  const {
    recentProjects,
    loadRecentProjects,
    openProject,
    deleteProject,
    togglePinRecent,
    removeFromRecentList,
    importProjectBundle,
    importAllProjects,
    exportProject,
    exportAllProjects,
    estimateLocalStorageUsage,
    createProject,
    errorMessage,
    clearError,
  } = useProjectStore();

  const [filterTab, setFilterTab] = useState<FilterTab>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [isBackupBusy, setIsBackupBusy] = useState(false);
  const [backupDownloaded, setBackupDownloaded] = useState(false);
  const [openProjectActions, setOpenProjectActions] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [storageUsage, setStorageUsage] = useState<number | null>(null);
  const [showBackupReminder, setShowBackupReminder] = useState(false);
  const projectActionsRef = useRef<HTMLDivElement>(null);
  const projectImportInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!openProjectActions) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!projectActionsRef.current?.contains(event.target as Node)) setOpenProjectActions(null);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpenProjectActions(null);
        projectActionsRef.current?.querySelector<HTMLButtonElement>('[aria-haspopup="menu"]')?.focus();
      }
    };
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [openProjectActions]);

  useEffect(() => {
    if (openProjectActions) {
      projectActionsRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
    }
  }, [openProjectActions]);

  useEffect(() => {
    void loadRecentProjects();
    void estimateLocalStorageUsage().then(setStorageUsage).catch((error: unknown) => {
      console.error('Could not estimate local storage usage', error);
    });
    try {
      setShowBackupReminder(shouldShowWeeklyBackupReminder());
    } catch (error) {
      console.error('Could not check the weekly backup reminder.', error);
    }
  }, [loadRecentProjects]);

  useEffect(() => {
    const handleAutomaticBackup = () => setShowBackupReminder(false);
    window.addEventListener('aether:automatic-backup', handleAutomaticBackup);
    return () => window.removeEventListener('aether:automatic-backup', handleAutomaticBackup);
  }, []);

  const handleOpenProject = async (projectId: string) => {
    clearError();
    const opened = await openProject(projectId);
    if (opened) setViewMode('workspace');
  };

  const handleLoadDemo = async () => {
    const created = await createProject('novel_fantasy', 'The Drowned Chapel', 'Evelyn Vane', 75000);
    if (created) setViewMode('workspace');
  };

  const handleDeleteProject = async (projectId: string, title: string) => {
    setOpenProjectActions(null);
    if (!window.confirm(`Delete "${title}"? The manuscript will be removed from this device permanently.`)) return;
    await deleteProject(projectId);
  };

  const handleProjectExport = async (projectId: string, title: string) => {
    setOpenProjectActions(null);
    try {
      const bundle = await exportProject(projectId);
      const url = URL.createObjectURL(new Blob([bundle], { type: 'application/json' }));
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${title.replace(/[<>:"/\\|?*]+/g, '-').trim() || 'project'}.aether`;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice(`"${title}" exported. The file contains this project's documents only.`);
    } catch (error) {
      console.error('Project export failed', error);
      setNotice(error instanceof Error ? error.message : 'Could not export that project.');
    }
  };

  const handleFileUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    setNotice(null);

    const reader = new FileReader();
    reader.onload = async (loadEvent) => {
      try {
        const content = String(loadEvent.target?.result ?? '');
        const imported = await importProjectBundle(content);
        if (imported) {
          setNotice('Project imported.');
          setViewMode('workspace');
        }
      } catch (error) {
        console.error('Import failed', error);
        setNotice('Could not read that file.');
      } finally {
        setIsImporting(false);
        event.target.value = '';
      }
    };
    reader.onerror = () => {
      setIsImporting(false);
      setNotice('Could not read that file.');
    };
    reader.readAsText(file);
  };

  const handleFullBackupUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsBackupBusy(true);
    setNotice(null);
    const reader = new FileReader();
    reader.onload = async (loadEvent) => {
      try {
        const content = String(loadEvent.target?.result ?? '');
        const importedCount = await importAllProjects(content);
        setNotice(
          importedCount > 0
            ? `Restored ${importedCount} ${importedCount === 1 ? 'project' : 'projects'}. Existing projects were kept.`
            : 'The backup contains no projects.'
        );
        setStorageUsage(await estimateLocalStorageUsage());
      } catch (error) {
        console.error('Full backup import failed', error);
        setNotice(error instanceof Error ? error.message : 'Could not restore that backup.');
      } finally {
        setIsBackupBusy(false);
        event.target.value = '';
      }
    };
    reader.onerror = () => {
      setIsBackupBusy(false);
      setNotice('Could not read that backup file.');
    };
    reader.readAsText(file);
  };

  const handleFullBackupExport = async () => {
    setIsBackupBusy(true);
    setNotice(null);
    try {
      const backup = await exportAllProjects();
      const url = URL.createObjectURL(new Blob([backup], { type: 'application/json' }));
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `aether_full_backup_${new Date().toISOString().slice(0, 10)}.aether-backup`;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setBackupDownloaded(true);
      setNotice('Full backup downloaded. Keep a copy outside this browser.');
      setShowBackupReminder(false);
      try {
        markFullBackupCreated();
      } catch (error) {
        console.error('The downloaded backup reminder status could not be saved.', error);
      }
      try {
        const folder = await getAutomaticBackupFolder();
        if (folder) {
          if (folder.permission !== 'granted') throw new Error('Backup folder access expired. Reconnect it in Preferences.');
          await writeAutomaticBackup(backup);
        }
      } catch (error) {
        console.error('The downloaded full backup could not also be saved to the automatic backup folder.', error);
        setNotice(
          `Full backup downloaded, but the automatic folder copy failed: ${
            error instanceof Error ? error.message : 'unknown error'
          }`
        );
      }
    } catch (error) {
      console.error('Full backup export failed', error);
      setNotice(error instanceof Error ? error.message : 'Could not create the full backup.');
    } finally {
      setIsBackupBusy(false);
      void estimateLocalStorageUsage().then(setStorageUsage).catch((error: unknown) => {
        console.error('Could not estimate local storage usage', error);
      });
    }
  };

  const handleConfirmMigrationBackup = () => {
    try {
      confirmMigrationBackupSavedOutsideBrowser();
      window.location.reload();
    } catch (error) {
      console.error('Could not confirm the migration backup', error);
      setNotice(error instanceof Error ? error.message : 'Could not confirm the migration backup.');
    }
  };

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const storageUsageLabel =
    storageUsage === null
      ? null
      : storageUsage < 1024 * 1024
        ? `${(storageUsage / 1024).toFixed(1)} KiB`
        : `${(storageUsage / (1024 * 1024)).toFixed(2)} MiB`;
  const filteredProjects = recentProjects.filter((project) => {
    if (filterTab === 'pinned' && !project.pinned) return false;
    if (!normalizedQuery) return true;
    return (
      project.title.toLowerCase().includes(normalizedQuery) || project.author.toLowerCase().includes(normalizedQuery)
    );
  });

  return (
    <div className="flex min-h-screen flex-col bg-canvas text-ink">
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-line px-3">
        <div className="flex min-w-0 items-baseline gap-2">
          <span className="text-[12.5px] font-medium tracking-tight text-ink">Aether</span>
          <span className="text-[11px] text-ink-faint">1.0</span>
        </div>

        <IconButton
          label="Toggle theme"
          onClick={toggleTheme}
          aria-label="Toggle theme"
        >
          {theme === 'dark' ? <IconSm as={Sun} /> : <IconSm as={Moon} />}
        </IconButton>
      </header>

      <main className="start-page-enter mx-auto min-h-0 w-full max-w-[760px] flex-1 overflow-y-auto px-6 pb-24 pt-10 md:pt-14">
        <h1 className="text-2xl font-semibold leading-tight tracking-[-0.025em] text-ink">Projects</h1>
        <p className="mt-1 text-[13px] leading-relaxed text-ink-muted">
          Manuscripts stored on this device. Nothing is uploaded.
        </p>

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveModal('create_project')}
            className="start-page-button inline-flex min-h-11 items-center gap-1.5 rounded-md bg-accent-solid px-3 text-[12.5px] font-medium text-on-accent transition-colors hover:bg-accent-solid-hover"
          >
            <IconSm as={Plus} />
            New project
          </button>

          <button
            type="button"
            onClick={() => projectImportInputRef.current?.click()}
            disabled={isImporting}
            className="start-page-button inline-flex min-h-11 items-center gap-1.5 rounded-md px-3 text-[12.5px] text-ink-muted transition-colors hover:bg-hover hover:text-ink disabled:opacity-50"
          >
            <IconSm as={Upload} />
            {isImporting ? 'Importing…' : 'Import project'}
          </button>
          <input
            ref={projectImportInputRef}
            type="file"
            accept=".json,.aether"
            onChange={handleFileUpload}
            disabled={isImporting}
            className="hidden"
          />

          <button
            type="button"
            onClick={() => void handleLoadDemo()}
            className="start-page-button inline-flex min-h-11 items-center rounded-md px-3 text-[12.5px] text-ink-muted transition-colors hover:bg-hover hover:text-ink"
          >
            Load sample
          </button>
        </div>

        <details className="mt-4 rounded-lg border border-line bg-surface px-3">
          <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-3 text-[12px] text-ink-muted outline-none transition-colors hover:text-ink focus-visible:ring-2 focus-visible:ring-accent-solid">
            <span>Full library backup <span className="text-ink-faint">(all projects)</span></span>
            <span className="text-[11px] text-ink-faint">Migration and recovery</span>
          </summary>
          <div className="border-t border-line pb-3 pt-3">
            <p className="max-w-[620px] text-[11px] leading-relaxed text-ink-faint">
              Includes every project and its snapshots. Restoring adds projects without replacing existing ones.
              Use this archive for migration or recovering the whole library.
              {storageUsageLabel && (
                <> Approx. legacy localStorage copy: {storageUsageLabel}. Browser storage limits vary.</>
              )}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void handleFullBackupExport()}
                disabled={isBackupBusy}
                className="start-page-button inline-flex min-h-11 items-center gap-1.5 rounded-md px-3 text-[12px] text-ink-muted transition-colors hover:bg-hover hover:text-ink disabled:opacity-50"
              >
                <IconSm as={Download} />
                {isBackupBusy ? 'Preparing backup…' : 'Export all projects'}
              </button>
              <label
                className={`start-page-button inline-flex min-h-11 items-center gap-1.5 rounded-md px-3 text-[12px] text-ink-muted transition-colors ${
                  isBackupBusy ? 'pointer-events-none opacity-50' : 'cursor-pointer hover:bg-hover hover:text-ink'
                }`}
              >
                <IconSm as={Upload} />
                {isBackupBusy ? 'Restoring…' : 'Restore all projects'}
                <input
                  type="file"
                  accept=".aether-backup,.json"
                  onChange={handleFullBackupUpload}
                  disabled={isBackupBusy}
                  className="hidden"
                />
              </label>
              {backupDownloaded && (
                <button
                  type="button"
                  onClick={handleConfirmMigrationBackup}
                  className="start-page-button inline-flex min-h-11 items-center rounded-md border border-line px-3 text-[11px] text-ink-muted transition-colors hover:bg-hover hover:text-ink"
                >
                  I saved the backup outside this browser
                </button>
              )}
            </div>
          </div>
        </details>

        {errorMessage && (
          <div className="mt-4 flex items-start justify-between gap-4 rounded-md border border-danger/30 bg-danger-soft px-2.5 py-2 text-small text-danger">
            <span className="flex items-start gap-2">
              <IconSm as={AlertCircle} className="mt-0.5 shrink-0" />
              {errorMessage}
            </span>
            <button type="button" onClick={clearError} className="shrink-0 font-medium underline">
              Dismiss
            </button>
          </div>
        )}

        {notice && (
          <div className="mt-4 flex items-center justify-between gap-4 rounded-md border border-line bg-hover px-2.5 py-2 text-[12px] text-ink-muted" role="status" aria-live="polite">
            <span>{notice}</span>
            <button type="button" onClick={() => setNotice(null)} className="shrink-0 font-medium underline">
              Dismiss
            </button>
          </div>
        )}

        {showBackupReminder && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-accent/30 bg-accent-soft px-3 py-2.5 text-[12px] text-ink" role="status">
            <span>It’s been a week since your last full backup. Keep a copy outside this browser.</span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => void handleFullBackupExport()}
                disabled={isBackupBusy}
                className="min-h-11 rounded-md bg-accent-solid px-3 text-on-accent transition-colors hover:bg-accent-solid-hover disabled:opacity-50"
              >
                Back up now
              </button>
              <button
                type="button"
                onClick={() => {
                  try {
                    snoozeWeeklyBackupReminder();
                    setShowBackupReminder(false);
                  } catch (error) {
                    console.error('Could not snooze the weekly backup reminder.', error);
                    setNotice('Could not snooze the backup reminder.');
                  }
                }}
                className="min-h-11 rounded-md px-3 text-ink-muted transition-colors hover:bg-hover"
              >
                Remind me next week
              </button>
            </div>
          </div>
        )}

        <section className="mt-10">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-1" role="group" aria-label="Filter projects">
              {(['all', 'pinned'] as const).map((tab) => {
                const isActive = filterTab === tab;
                const count =
                  tab === 'all' ? recentProjects.length : recentProjects.filter((project) => project.pinned).length;
                return (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setFilterTab(tab)}
                    aria-pressed={isActive}
                    className={`min-h-11 rounded-md px-3 text-[12px] capitalize transition-colors ${
                      isActive ? 'bg-active text-ink' : 'text-ink-muted hover:bg-hover hover:text-ink'
                    }`}
                  >
                    {tab} <span className="tabular-nums text-ink-faint">{count}</span>
                  </button>
                );
              })}
            </div>

            <div className="relative w-full max-w-[220px]">
              <IconSm as={Search} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-ink-faint" />
              <input
                type="text"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search"
                className="h-11 w-full rounded-md border border-transparent bg-transparent pl-7 pr-2 text-[12.5px] text-ink transition-colors placeholder:text-placeholder hover:bg-hover focus:border-control focus:bg-surface focus:outline-none"
              />
            </div>
          </div>

          {filteredProjects.length === 0 ? (
            <div className="mt-8 flex flex-col items-center gap-2 py-16 text-center">
              <IconXl as={FileText} />
              <p className="text-[13px] text-ink">
                {normalizedQuery
                  ? 'Nothing matches that search'
                  : filterTab === 'pinned'
                    ? 'No pinned projects'
                    : 'No projects yet'}
              </p>
              <p className="max-w-[320px] text-[12px] leading-relaxed text-ink-faint">
                {normalizedQuery
                  ? 'Try a different title or author.'
                  : filterTab === 'pinned'
                    ? 'Pin a project to keep it close at hand.'
                    : 'Create a project to start writing.'}
              </p>
              {!normalizedQuery && filterTab === 'all' && (
                <button
                  type="button"
                  onClick={() => setActiveModal('create_project')}
                  className="start-page-button mt-2 inline-flex min-h-11 items-center gap-1.5 rounded-md bg-accent-solid px-3 text-[12.5px] font-medium text-on-accent hover:bg-accent-solid-hover"
                >
                  <IconSm as={Plus} />
                  Create a project
                </button>
              )}
            </div>
          ) : (
            <ul className="project-list -mx-2 mt-4 space-y-0.5">
              {filteredProjects.map((project) => (
                <li
                  key={project.id}
                  className="group flex items-center gap-1 rounded-lg px-2 transition-colors hover:bg-hover"
                >
                  <button
                    type="button"
                    onClick={() => void handleOpenProject(project.id)}
                    className="project-open-button flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-md py-2 pr-1 text-left"
                  >
                    <IconSm as={FileText} />
                    <span className="min-w-0">
                      <span className="block truncate text-[13.5px] text-ink">{project.title}</span>
                      <span className="block truncate text-[11.5px] tabular-nums text-ink-faint">
                        {project.author} · {project.totalWords.toLocaleString()} words · {project.documentCount} docs ·{' '}
                        {formatDate(project.lastOpenedAt)}
                      </span>
                    </span>
                  </button>

                  <div className="project-actions flex shrink-0 items-center gap-0.5 pr-1">
                    <button
                      type="button"
                      onClick={() => void togglePinRecent(project.id)}
                      data-pinned={project.pinned}
                      className={`project-action inline-flex h-11 w-11 items-center justify-center rounded-md text-ink-faint transition-colors hover:bg-active hover:text-ink ${
                        project.pinned ? 'text-ink-muted' : ''
                      }`}
                      title={project.pinned ? 'Unpin' : 'Pin'}
                      aria-label={project.pinned ? 'Unpin project' : 'Pin project'}
                    >
                      <Pin className={`h-3 w-3 ${project.pinned ? 'fill-current' : ''}`} />
                    </button>
                    <button
                      type="button"
                      onClick={() => void removeFromRecentList(project.id)}
                      className="project-action inline-flex h-11 w-11 items-center justify-center rounded-md text-ink-faint transition-colors hover:bg-active hover:text-ink"
                      title="Remove from list"
                      aria-label="Remove from list"
                    >
                      <X className="h-3 w-3" />
                    </button>
                    <div className="relative" ref={openProjectActions === project.id ? projectActionsRef : null}>
                      <button
                        type="button"
                        onClick={() =>
                          setOpenProjectActions((current) => (current === project.id ? null : project.id))
                        }
                        aria-label={`Actions for ${project.title}`}
                        aria-haspopup="menu"
                        aria-expanded={openProjectActions === project.id}
                        className="project-action inline-flex h-11 w-11 items-center justify-center rounded-md text-ink-faint transition-colors hover:bg-active hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-solid"
                      >
                        <IconMd as={MoreHorizontal} />
                      </button>
                      {openProjectActions === project.id && (
                        <div
                          className="absolute right-0 top-full z-30 mt-1 min-w-52 origin-top-right rounded-lg border border-line bg-surface p-1 shadow-xl"
                          role="menu"
                          aria-label={`${project.title} actions`}
                        >
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => void handleProjectExport(project.id, project.title)}
                            className="flex min-h-11 w-full items-center gap-2 rounded-md px-3 text-left text-[12px] text-ink-muted transition-colors hover:bg-hover hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-solid"
                          >
                            <IconSm as={Download} />
                            Export project
                          </button>
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => void handleDeleteProject(project.id, project.title)}
                            className="flex min-h-11 w-full items-center gap-2 rounded-md px-3 text-left text-[12px] text-danger transition-colors hover:bg-danger-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-solid"
                          >
                            <IconSm as={Trash2} />
                            Delete project
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>

      <CreateProjectModal />
    </div>
  );
}
