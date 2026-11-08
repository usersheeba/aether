/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Command, Download, FileText, HardDrive, Moon, Palette, Sun, Type, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useEditorStore } from '../../store/useEditorStore';
import type { ProseTypography, WorkspaceWidthOption } from '../../store/useEditorStore';
import {
  chooseAutomaticBackupFolder,
  clearAutomaticBackupFolder,
  getAutomaticBackupFolder,
  supportsAutomaticBackup,
} from '../../storage/BackupManager';
import { useProjectStore } from '../../store/useProjectStore';
import { useUIStore } from '../../store/useUIStore';
import type { PageFormat, PageOrientation, PageViewSettings } from '../../types/project.ts';
import {
  PAGE_FORMAT_LABELS,
  PAGE_ORIENTATION_LABELS,
  normalizePageView,
} from '../../utils/pageLayout.ts';
import { SHORTCUTS as KEYS } from '../../utils/shortcuts';
import { useModalPresence } from '../../utils/useModalPresence';
import { IconButton, IconSm, IconMd } from '../../design/components';

type SettingsTab = 'editor' | 'page' | 'appearance' | 'shortcuts' | 'storage';

const FONT_FAMILIES = [
  'Literata',
  'Source Serif 4',
  'PT Serif',
  'Inter',
  'EB Garamond',
  'JetBrains Mono',
  'Cinzel',
];

const SHORTCUT_LIST: { label: string; binding: string }[] = [
  { label: 'Save document', binding: KEYS.save },
  { label: 'Find and replace', binding: KEYS.find },
  { label: 'Toggle binder', binding: KEYS.binder },
  { label: 'Toggle inspector', binding: KEYS.inspector },
  { label: 'Focus mode', binding: KEYS.focus },
];

const TABS: { id: SettingsTab; label: string; icon: typeof Type }[] = [
  { id: 'editor', label: 'Editor', icon: Type },
  { id: 'page', label: 'Page', icon: FileText },
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'shortcuts', label: 'Shortcuts', icon: Command },
  { id: 'storage', label: 'Backup', icon: HardDrive },
];

const LANGUAGES = [
  { value: 'ru', label: 'Русский' },
  { value: 'en', label: 'English' },
  { value: 'uk', label: 'Українська' },
  { value: 'de', label: 'Deutsch' },
  { value: 'fr', label: 'Français' },
  { value: 'es', label: 'Español' },
  { value: 'pl', label: 'Polski' },
  { value: 'it', label: 'Italiano' },
  { value: 'pt', label: 'Português' },
];

const TYPOGRAPHY_OPTIONS: { value: ProseTypography; label: string }[] = [
  { value: 'book', label: 'Book — indent, justified' },
  { value: 'draft', label: 'Draft — spaced paragraphs' },
];

const MARGIN_FIELDS: { key: keyof PageViewSettings['margins']; label: string }[] = [
  { key: 'topMm', label: 'Top' },
  { key: 'rightMm', label: 'Right' },
  { key: 'bottomMm', label: 'Bottom' },
  { key: 'leftMm', label: 'Left' },
];

const LABEL = 'block text-caption font-medium text-ink-muted';
const FIELD =
  'min-h-11 w-full rounded-md border border-control bg-surface px-2 text-small text-ink transition-colors focus:border-accent focus:outline-none';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(1)} ${units[unitIndex]}`;
}

export function SettingsModal() {
  const { activeModal, setActiveModal, theme, setTheme } = useUIStore();
  const isOpen = activeModal === 'settings';
  const { isPresent, dialogRef } = useModalPresence(isOpen, () => setActiveModal(null));
  const {
    fontFamily,
    setFontFamily,
    fontSizePx,
    setFontSizePx,
    lineHeight,
    setLineHeight,
    workspaceWidth,
    setWorkspaceWidth,
    typography,
    setTypography,
    language,
    setLanguage,
  } = useEditorStore();
  const {
    activeProject,
    exportCurrentProject,
    saveAutomaticBackup,
    updateProjectSettings,
    errorMessage,
  } = useProjectStore();

  const [activeTab, setActiveTab] = useState<SettingsTab>('editor');
  const [pageDraft, setPageDraft] = useState<PageViewSettings>(() =>
    normalizePageView(activeProject?.settings.pageView)
  );
  const pageDraftRef = useRef<PageViewSettings>(pageDraft);
  const [pageMessage, setPageMessage] = useState<string | null>(null);
  const pageSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pageProjectId = useRef<string | null>(activeProject?.id ?? null);
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const [storagePersisted, setStoragePersisted] = useState<boolean | null>(null);
  const [storageChecked, setStorageChecked] = useState(false);
  const [storageUsage, setStorageUsage] = useState<{ usage?: number; quota?: number } | null>(null);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [requestingPersistence, setRequestingPersistence] = useState(false);
  const [automaticBackupFolder, setAutomaticBackupFolder] = useState<{
    name: string;
    permission: PermissionState;
  } | null>(null);
  const [automaticBackupBusy, setAutomaticBackupBusy] = useState(false);
  const [automaticBackupMessage, setAutomaticBackupMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || activeTab !== 'storage') return;
    let active = true;
    const storage = navigator.storage;
    const refreshStorageInfo = () => {
      if (!storage?.persisted || !storage.estimate) {
        setStoragePersisted(null);
        setStorageUsage(null);
        setStorageChecked(true);
        return;
      }

      setStorageChecked(false);
      void Promise.all([storage.persisted(), storage.estimate()]).then(
        ([persisted, estimate]) => {
          if (!active) return;
          setStoragePersisted(persisted);
          setStorageUsage({ usage: estimate.usage, quota: estimate.quota });
          setStorageError(null);
          setStorageChecked(true);
        },
        (error: unknown) => {
          if (!active) return;
          console.error('Could not inspect browser storage.', error);
          setStorageError('Could not read this browser’s storage status.');
          setStorageChecked(true);
        }
      );
    };

    const refreshPersistenceStatus = (event: Event) => {
      const persisted = (event as CustomEvent<{ persisted?: boolean }>).detail?.persisted;
      if (typeof persisted === 'boolean') setStoragePersisted(persisted);
      refreshStorageInfo();
    };
    const handlePersistenceError = () => {
      setStorageError('The browser could not update persistent storage protection.');
    };
    const handleAutomaticBackup = (event: Event) => {
      const { filename } = (event as CustomEvent<{ filename?: string }>).detail ?? {};
      if (filename) setAutomaticBackupMessage(`Automatic backup saved: ${filename}`);
    };
    const handleAutomaticBackupError = (event: Event) => {
      const { message } = (event as CustomEvent<{ message?: string }>).detail ?? {};
      setAutomaticBackupMessage(message ?? 'Could not write the automatic backup.');
    };

    refreshStorageInfo();
    window.addEventListener('aether:persistence-updated', refreshPersistenceStatus);
    window.addEventListener('aether:persistence-error', handlePersistenceError);
    window.addEventListener('aether:automatic-backup', handleAutomaticBackup);
    window.addEventListener('aether:automatic-backup-error', handleAutomaticBackupError);
    if (supportsAutomaticBackup()) {
      void getAutomaticBackupFolder().then(
        (folder) => {
          if (active) setAutomaticBackupFolder(folder);
        },
        (error: unknown) => {
          if (!active) return;
          console.error('Could not read the automatic backup folder.', error);
          setAutomaticBackupMessage('Could not read the selected backup folder.');
        }
      );
    }

    return () => {
      active = false;
      window.removeEventListener('aether:persistence-updated', refreshPersistenceStatus);
      window.removeEventListener('aether:persistence-error', handlePersistenceError);
      window.removeEventListener('aether:automatic-backup', handleAutomaticBackup);
      window.removeEventListener('aether:automatic-backup-error', handleAutomaticBackupError);
    };
  }, [activeTab, isOpen]);

  useEffect(() => {
    if (pageProjectId.current === (activeProject?.id ?? null)) return;
    if (pageSaveTimer.current) {
      clearTimeout(pageSaveTimer.current);
      pageSaveTimer.current = null;
    }
    pageProjectId.current = activeProject?.id ?? null;
    const next = normalizePageView(activeProject?.settings.pageView);
    pageDraftRef.current = next;
    setPageDraft(next);
    setPageMessage(null);
  }, [activeProject?.id, activeProject?.settings.pageView]);

  useEffect(
    () => () => {
      if (pageSaveTimer.current) clearTimeout(pageSaveTimer.current);
    },
    []
  );

  if (!isPresent) return null;

  const applyPageView = (patch: Partial<PageViewSettings>) => {
    const next = { ...pageDraftRef.current, ...patch };
    pageDraftRef.current = next;
    setPageDraft(next);
    if (!activeProject) return;
    const projectId = activeProject.id;
    setPageMessage('Saving…');
    if (pageSaveTimer.current) clearTimeout(pageSaveTimer.current);
    pageSaveTimer.current = setTimeout(() => {
      pageSaveTimer.current = null;
      if (useProjectStore.getState().activeProject?.id !== projectId) return;
      void updateProjectSettings({ pageView: next }).then(
        () => {
          setPageMessage('Saved for everyone');
          setTimeout(() => setPageMessage(null), 1600);
        },
        () => {
          setPageMessage('Could not save the page set-up');
        }
      );
    }, 450);
  };

  const patchPageView = (patch: Partial<PageViewSettings>) => {
    applyPageView(patch);
  };

  const patchMargin = (side: keyof PageViewSettings['margins'], rawValue: string) => {
    const value = Number(rawValue);
    if (!Number.isFinite(value)) return;
    const current = pageDraftRef.current;
    applyPageView({
      margins: { ...current.margins, [side]: Math.min(100, Math.max(0, value)) },
    });
  };

  const handleRequestPersistence = async () => {
    const storage = navigator.storage;
    if (!storage?.persist) {
      setStorageError('Persistent storage is not available in this browser.');
      return;
    }
    setRequestingPersistence(true);
    setStorageError(null);
    try {
      setStoragePersisted(await storage.persist());
      const estimate = await storage.estimate();
      setStorageUsage({ usage: estimate.usage, quota: estimate.quota });
    } catch (error) {
      console.error('Could not request persistent browser storage.', error);
      setStorageError('The browser could not update the storage protection status.');
    } finally {
      setRequestingPersistence(false);
    }
  };

  const handleChooseAutomaticBackupFolder = async () => {
    setAutomaticBackupBusy(true);
    setAutomaticBackupMessage(null);
    try {
      const name = await chooseAutomaticBackupFolder();
      const folder = await getAutomaticBackupFolder();
      setAutomaticBackupFolder(folder);
      const filename = await saveAutomaticBackup();
      setAutomaticBackupMessage(
        filename ? `First backup saved to ${name}\\${filename}.` : `Automatic backups are ready for ${name}.`
      );
    } catch (error) {
      console.error('Could not configure automatic backups.', error);
      setAutomaticBackupMessage(error instanceof Error ? error.message : 'Could not configure automatic backups.');
    } finally {
      setAutomaticBackupBusy(false);
    }
  };

  const handleClearAutomaticBackupFolder = async () => {
    setAutomaticBackupBusy(true);
    try {
      await clearAutomaticBackupFolder();
      setAutomaticBackupFolder(null);
      setAutomaticBackupMessage('Automatic folder backups are turned off.');
    } catch (error) {
      console.error('Could not remove the automatic backup folder.', error);
      setAutomaticBackupMessage('Could not remove the automatic backup folder.');
    } finally {
      setAutomaticBackupBusy(false);
    }
  };

  const handleSaveAutomaticBackup = async () => {
    setAutomaticBackupBusy(true);
    setAutomaticBackupMessage(null);
    try {
      const filename = await saveAutomaticBackup();
      setAutomaticBackupMessage(filename ? `Backup saved: ${filename}` : 'Choose a backup folder first.');
    } catch (error) {
      console.error('Could not create an automatic backup.', error);
      setAutomaticBackupMessage(error instanceof Error ? error.message : 'Could not create an automatic backup.');
    } finally {
      setAutomaticBackupBusy(false);
    }
  };

  const handleExportBackup = async () => {
    try {
      const bundle = await exportCurrentProject();
      const blob = new Blob([bundle], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `aether_backup_${Date.now()}.aether`;
      anchor.click();
      URL.revokeObjectURL(url);
      setExportMessage('Backup downloaded.');
    } catch (error) {
      console.error('Export backup failed', error);
      setExportMessage('Open a project first.');
    }
  };

  return (
    <div
      className="modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-overlay p-3 sm:p-4"
      data-state={isOpen ? 'open' : 'closing'}
    >
      <div
        ref={dialogRef}
        className="modal-panel flex max-h-[90dvh] w-full max-w-[720px] flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-[var(--shadow-popover)]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        data-state={isOpen ? 'open' : 'closing'}
        aria-hidden={!isOpen}
        inert={!isOpen}
        tabIndex={-1}
      >
        <div className="flex items-center justify-between gap-4 px-4 py-3">
          <h2 id="settings-title" className="text-[14px] font-medium text-ink">Preferences</h2>
          <IconButton
                      label="Close preferences"
                      onClick={() => setActiveModal(null)}
                      aria-label="Close preferences"
                    >
                      <IconMd as={X} />
                    </IconButton>
        </div>

        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          <div
            className="flex shrink-0 overflow-x-auto border-b border-line p-1.5 md:w-[180px] md:flex-col md:overflow-x-visible md:border-b-0 md:border-r"
            role="group"
            aria-label="Preference sections"
          >
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  aria-pressed={isActive}
                  className={`flex min-h-11 shrink-0 items-center gap-2 rounded-md px-3 text-left text-[12.5px] transition-colors md:w-full ${
                    isActive ? 'bg-active text-ink' : 'text-ink-muted hover:bg-hover hover:text-ink'
                  }`}
                >
                              <IconSm as={Icon} />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          <div className="min-h-0 min-w-0 flex-1 overflow-y-auto p-4">
            {activeTab === 'editor' && (
              <div className="space-y-4">
                <p className={LABEL}>Typing defaults</p>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <label className={LABEL} htmlFor="settings-font">
                      Font
                    </label>
                    <select
                      id="settings-font"
                      value={fontFamily}
                      onChange={(event) => setFontFamily(event.target.value)}
                      className={FIELD}
                    >
                      {FONT_FAMILIES.map((font) => (
                        <option key={font} value={font}>
                          {font}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className={LABEL} htmlFor="settings-size">
                      Size (px)
                    </label>
                    <input
                      id="settings-size"
                      type="number"
                      min={8}
                      max={48}
                      value={fontSizePx}
                      onChange={(event) => setFontSizePx(Number(event.target.value))}
                      className={FIELD}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className={LABEL} htmlFor="settings-line-height">
                      Line height
                    </label>
                    <select
                      id="settings-line-height"
                      value={lineHeight}
                      onChange={(event) => setLineHeight(Number(event.target.value))}
                      className={FIELD}
                    >
                      <option value={1.4}>1.4</option>
                      <option value={1.6}>1.6</option>
                      <option value={1.7}>1.7</option>
                      <option value={1.8}>1.8</option>
                      <option value={2.0}>2.0</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className={LABEL} htmlFor="settings-width">
                      Column width
                    </label>
                    <select
                      id="settings-width"
                      value={workspaceWidth}
                      onChange={(event) => setWorkspaceWidth(event.target.value as WorkspaceWidthOption)}
                      className={FIELD}
                    >
                      <option value="narrow">Narrow</option>
                      <option value="medium">Medium</option>
                      <option value="wide">Wide</option>
                      <option value="full">Full</option>
                    </select>
                  </div>
                </div>

                <p className={LABEL}>Prose</p>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <label className={LABEL} htmlFor="settings-typography">
                      Typography
                    </label>
                    <select
                      id="settings-typography"
                      value={typography}
                      onChange={(event) => setTypography(event.target.value as ProseTypography)}
                      className={FIELD}
                    >
                      {TYPOGRAPHY_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className={LABEL} htmlFor="settings-language">
                      Manuscript language
                    </label>
                    <select
                      id="settings-language"
                      value={language}
                      onChange={(event) => setLanguage(event.target.value)}
                      className={FIELD}
                    >
                      {LANGUAGES.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'page' && (
              <div className="space-y-4">
                <p className={LABEL}>Page set-up</p>

                {!activeProject ? (
                  <p className="rounded-md border border-line bg-canvas px-3 py-2 text-[12px] text-ink-muted">
                    Open a project to change its page set-up.
                  </p>
                ) : (
                  <>
                    <p className="text-[11.5px] leading-relaxed text-ink-muted">
                      Page size and margins are stored in the project and shared with collaborators. Page breaks are
                      calculated locally in each browser and are never saved.
                    </p>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <label className={LABEL} htmlFor="settings-page-format">
                          Paper size
                        </label>
                        <select
                          id="settings-page-format"
                          value={pageDraft.format}
                          onChange={(event) => patchPageView({ format: event.target.value as PageFormat })}
                          className={FIELD}
                        >
                          {(Object.keys(PAGE_FORMAT_LABELS) as PageFormat[]).map((format) => (
                            <option key={format} value={format}>
                              {PAGE_FORMAT_LABELS[format]}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="space-y-1.5">
                        <label className={LABEL} htmlFor="settings-page-orientation">
                          Orientation
                        </label>
                        <select
                          id="settings-page-orientation"
                          value={pageDraft.orientation}
                          onChange={(event) =>
                            patchPageView({ orientation: event.target.value as PageOrientation })
                          }
                          className={FIELD}
                        >
                          {(Object.keys(PAGE_ORIENTATION_LABELS) as PageOrientation[]).map((orientation) => (
                            <option key={orientation} value={orientation}>
                              {PAGE_ORIENTATION_LABELS[orientation]}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {pageDraft.format === 'custom' && (
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div className="space-y-1.5">
                          <label className={LABEL} htmlFor="settings-page-width">
                            Width (mm)
                          </label>
                          <input
                            id="settings-page-width"
                            type="number"
                            min={50}
                            max={500}
                            value={pageDraft.customWidthMm ?? 210}
                            onChange={(event) =>
                              patchPageView({ customWidthMm: Number(event.target.value) })
                            }
                            className={FIELD}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className={LABEL} htmlFor="settings-page-height">
                            Height (mm)
                          </label>
                          <input
                            id="settings-page-height"
                            type="number"
                            min={50}
                            max={500}
                            value={pageDraft.customHeightMm ?? 297}
                            onChange={(event) =>
                              patchPageView({ customHeightMm: Number(event.target.value) })
                            }
                            className={FIELD}
                          />
                        </div>
                      </div>
                    )}

                    <div className="space-y-1.5">
                      <p className={LABEL}>Margins (mm)</p>
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                        {MARGIN_FIELDS.map((field) => (
                          <div key={field.key} className="space-y-1.5">
                            <label className={LABEL} htmlFor={`settings-margin-${field.key}`}>
                              {field.label}
                            </label>
                            <input
                              id={`settings-margin-${field.key}`}
                              type="number"
                              min={0}
                              max={100}
                              step={1}
                              value={pageDraft.margins[field.key]}
                              onChange={(event) => patchMargin(field.key, event.target.value)}
                              className={FIELD}
                            />
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <label className={LABEL} htmlFor="settings-page-header">
                          Header
                        </label>
                        <input
                          id="settings-page-header"
                          type="text"
                          value={pageDraft.header}
                          onChange={(event) => patchPageView({ header: event.target.value })}
                          placeholder="e.g. Working manuscript"
                          maxLength={180}
                          className={FIELD}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className={LABEL} htmlFor="settings-page-footer">
                          Footer
                        </label>
                        <input
                          id="settings-page-footer"
                          type="text"
                          value={pageDraft.footer}
                          onChange={(event) => patchPageView({ footer: event.target.value })}
                          placeholder="Page {page} of {pages}"
                          maxLength={180}
                          className={FIELD}
                        />
                      </div>
                    </div>

                    <p className="text-[11px] leading-relaxed text-ink-faint">
                      In the header and footer, <code>{'{page}'}</code> is the current page and{' '}
                      <code>{'{pages}'}</code> is the total page count. Leave a field empty to hide it.
                    </p>

                    <p className="text-[11px] text-ink-faint" role="status" aria-live="polite">
                      {pageMessage ?? 'Changes are saved automatically.'}
                    </p>
                  </>
                )}
              </div>
            )}

            {activeTab === 'appearance' && (
              <div className="space-y-3">
                <p className={LABEL}>Theme</p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => setTheme('light')}
                    className={`flex items-center gap-2 rounded-lg border p-3 text-left transition-colors ${
                      theme === 'light' ? 'border-accent bg-accent-soft' : 'border-line hover:bg-hover'
                    }`}
                  >
                                  <IconMd as={Sun} className="text-ink-muted" />
                    <span>
                      <span className="block text-[12.5px] text-ink">Light</span>
                      <span className="block text-[11px] text-ink-faint">Warm paper</span>
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setTheme('dark')}
                    className={`flex items-center gap-2 rounded-lg border p-3 text-left transition-colors ${
                      theme === 'dark' ? 'border-accent bg-accent-soft' : 'border-line hover:bg-hover'
                    }`}
                  >
                                  <IconMd as={Moon} className="text-ink-muted" />
                    <span>
                      <span className="block text-[12.5px] text-ink">Dark</span>
                      <span className="block text-[11px] text-ink-faint">Warm graphite</span>
                    </span>
                  </button>
                </div>
              </div>
            )}

            {activeTab === 'shortcuts' && (
              <div className="space-y-3">
                <p className={LABEL}>Keyboard</p>
                <div className="divide-y divide-line rounded-lg border border-line">
                  {SHORTCUT_LIST.map((shortcut) => (
                    <div key={shortcut.label} className="flex items-center justify-between px-3 py-1.5 text-[12.5px]">
                      <span className="text-ink-muted">{shortcut.label}</span>
                      <span className="tabular-nums text-[11px] text-ink-faint">{shortcut.binding}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeTab === 'storage' && (
              <div className="space-y-3">
                <p className={LABEL}>Browser storage</p>
                <p className="text-[12px] leading-relaxed text-ink-muted">
                  Projects are stored on this device. Browser storage estimates include data from this origin and may
                  also include other site data.
                </p>

                {errorMessage && <p className="rounded-md bg-danger-soft px-2 py-1.5 text-small text-danger">{errorMessage}</p>}
                <div className="space-y-2 rounded-lg border border-line p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[12.5px] text-ink">Persistent storage</p>
                      <p className="text-[11px] text-ink-faint" role="status">
                        {!storageChecked
                          ? 'Checking browser storage…'
                          : storagePersisted === null
                          ? 'Status unavailable in this browser.'
                          : storagePersisted
                            ? 'The browser is less likely to evict this site’s data.'
                            : 'The browser may evict this site’s data when storage is under pressure.'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleRequestPersistence()}
                      disabled={!storageChecked || storagePersisted === null || storagePersisted || requestingPersistence}
                      className="min-h-11 shrink-0 rounded-md border border-line px-3 text-[12px] text-ink transition-colors hover:bg-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {requestingPersistence ? 'Requesting…' : storagePersisted ? 'Enabled' : 'Protect data'}
                    </button>
                  </div>
                  {storageUsage && (
                    <p className="text-[11px] tabular-nums text-ink-faint">
                      Browser storage: {storageUsage.usage === undefined ? 'unknown' : formatBytes(storageUsage.usage)}
                      {storageUsage.quota === undefined ? '' : ` of ${formatBytes(storageUsage.quota)}`}
                    </p>
                  )}
                  {storageError && (
                    <p className="text-[11px] text-danger" role="alert">
                      {storageError}
                    </p>
                  )}
                </div>

                <div className="space-y-2 rounded-lg border border-line p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[12.5px] text-ink">Automatic backup folder</p>
                      <p className="truncate text-[11px] text-ink-faint">
                        {!supportsAutomaticBackup()
                          ? 'Available in Chromium-based browsers.'
                          : automaticBackupFolder
                            ? `${automaticBackupFolder.name} · ${
                                automaticBackupFolder.permission === 'granted'
                                  ? 'access granted'
                                  : 'reconnect access'
                              }`
                            : 'Not configured. A daily backup is written while the app is in use.'}
                      </p>
                    </div>
                    {supportsAutomaticBackup() && (
                      <div className="flex flex-wrap gap-1">
                        {automaticBackupFolder && (
                          <button
                            type="button"
                            onClick={() => void handleSaveAutomaticBackup()}
                            disabled={automaticBackupBusy}
                            className="min-h-11 rounded-md border border-line px-3 text-[12px] text-ink transition-colors hover:bg-hover disabled:opacity-50"
                          >
                            Back up now
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => void handleChooseAutomaticBackupFolder()}
                          disabled={automaticBackupBusy}
                          className="min-h-11 rounded-md border border-line px-3 text-[12px] text-ink transition-colors hover:bg-hover disabled:opacity-50"
                        >
                          {automaticBackupBusy
                            ? 'Working…'
                            : automaticBackupFolder
                              ? 'Choose again'
                              : 'Choose folder'}
                        </button>
                        {automaticBackupFolder && (
                          <button
                            type="button"
                            onClick={() => void handleClearAutomaticBackupFolder()}
                            disabled={automaticBackupBusy}
                            className="min-h-11 rounded-md px-3 text-[12px] text-ink-muted transition-colors hover:bg-hover disabled:opacity-50"
                          >
                            Turn off
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                  {automaticBackupMessage && (
                    <p className="text-[11px] text-ink-faint" role="status">
                      {automaticBackupMessage}
                    </p>
                  )}
                </div>

                <div className="flex items-center justify-between gap-3 rounded-lg border border-line p-3">
                  <div>
                    <p className="text-[12.5px] text-ink">Export manuscript</p>
                    <p className="text-[11px] text-ink-faint">Chapters, notes and metadata as a JSON bundle.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleExportBackup()}
                    className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md bg-accent-solid px-2.5 text-[12px] font-medium text-on-accent transition-colors hover:bg-accent-solid-hover"
                  >
                                      <IconSm as={Download} /> Export
                  </button>
                </div>
                {exportMessage && <p className="text-[11px] text-ink-faint">{exportMessage}</p>}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-2">
          <span className="hidden text-[11px] text-ink-faint sm:inline">Stored on this device.</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveModal(null)}
              className="min-h-11 rounded-md bg-ink px-4 text-[12.5px] font-medium text-canvas transition-opacity hover:opacity-90"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
