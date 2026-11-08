/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEditorStore } from '../../store/useEditorStore';
import { useProjectStore } from '../../store/useProjectStore';
import { useUIStore } from '../../store/useUIStore';

function SaveState({
  status,
  errorMessage,
}: {
  status: 'saved' | 'saving' | 'dirty' | 'error';
  errorMessage: string | null;
}) {
  if (status === 'error') {
    return (
      <span
        className="flex items-center gap-1.5 text-danger"
        title={errorMessage ?? 'Saving failed'}
        role="status"
        aria-live="polite"
      >
        <span className="h-1.5 w-1.5 rounded-full bg-current" /> Save error
      </span>
    );
  }
  if (status === 'saving') {
    return (
      <span className="flex items-center gap-1.5" role="status" aria-live="polite">
        <span className="save-status-pulse h-1.5 w-1.5 animate-pulse rounded-full bg-warning" /> Saving
      </span>
    );
  }
  if (status === 'dirty') {
    return (
      <span className="flex items-center gap-1.5" role="status" aria-live="polite">
        <span className="h-1.5 w-1.5 rounded-full bg-warning/70" /> Unsaved
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1.5" role="status" aria-live="polite">
      <span className="h-1.5 w-1.5 rounded-full bg-success/80" /> Saved
    </span>
  );
}

export function StatusBar() {
  const { isStatusBarVisible } = useUIStore();
  const { activeDocument, activeProject, autoSaveStatus, errorMessage } = useProjectStore();
  const { viewMode, zoomLevel, pageCount } = useEditorStore();

  if (!isStatusBarVisible) return null;

  const documentWords = activeDocument?.wordCount ?? 0;
  const documentChars = activeDocument?.charCount ?? 0;

  const cachedTotal = activeProject?.tree.reduce((total, node) => total + (node.wordCount ?? 0), 0) ?? 0;
  const cachedActive = activeProject?.tree.find((node) => node.id === activeDocument?.id)?.wordCount ?? 0;
  const totalWords = activeDocument ? Math.max(0, cachedTotal - cachedActive + documentWords) : cachedTotal;

  const targetWords = activeProject?.settings.targetWordCount || 75000;
  const ratio = targetWords > 0 ? (totalWords / targetWords) * 100 : 0;
  const progressLabel = ratio >= 1 ? `${Math.round(ratio)}%` : totalWords > 0 ? '<1%' : '0%';
  const progressWidth = Math.min(100, Math.max(ratio, totalWords > 0 ? 1.5 : 0));

  return (
    <footer className="flex min-h-11 shrink-0 items-center justify-between gap-2 border-t border-line bg-sidebar px-3 text-[11px] text-ink-faint sm:gap-4">
      <div className="flex items-center gap-2 tabular-nums">
        <span>
          <span className="text-ink-muted">{documentWords.toLocaleString()}</span> words
        </span>
        <span aria-hidden="true">·</span>
        <span>
          <span className="text-ink-muted">{documentChars.toLocaleString()}</span> chars
        </span>
        {viewMode === 'page' && (
          <>
            <span aria-hidden="true">·</span>
            <span>
              pages <span className="text-ink-muted">{pageCount ?? 'laying out…'}</span>
            </span>
          </>
        )}
      </div>

      <div className="hidden items-center gap-2 md:flex">
        <div
          className="h-1 w-24 overflow-hidden rounded-full bg-active"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(Math.min(100, ratio))}
          aria-label="Manuscript progress"
        >
          <div
            className="status-progress-fill h-full rounded-full bg-accent"
            style={{ transform: `scaleX(${progressWidth / 100})` }}
          />
        </div>
        <span className="tabular-nums">
          {progressLabel} of {targetWords.toLocaleString()}
        </span>
      </div>

      <div className="flex items-center gap-3">
        <SaveState status={autoSaveStatus} errorMessage={errorMessage} />
        <span className="tabular-nums">{zoomLevel}%</span>
      </div>
    </footer>
  );
}
