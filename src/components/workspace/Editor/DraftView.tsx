/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BookOpen } from 'lucide-react';
import { useEffect } from 'react';
import { TipTapEditor } from '../../../editor/TipTapEditor';
import { useEditorStore } from '../../../store/useEditorStore';
import type { SceneSeparator } from '../../../store/useEditorStore';
import { useProjectStore } from '../../../store/useProjectStore';
import { useUIStore } from '../../../store/useUIStore';
import type { BinderNode } from '../../../types/project';
import { collectManuscriptNodes, resolveManuscriptFolder } from '../../../utils/manuscript';
import { IconXl } from '../../../design/components';

const SEPARATOR_OPTIONS: { value: SceneSeparator; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'line', label: 'Line' },
  { value: 'asterisks', label: '***' },
];

function SceneBreak({ type }: { type: SceneSeparator }) {
  if (type === 'none') return null;
  if (type === 'line') return <div aria-hidden="true" className="my-10 h-px bg-line" />;
  return (
    <div aria-hidden="true" className="my-10 select-none text-center font-serif text-[15px] tracking-[0.4em] text-ink-muted">
      * * *
    </div>
  );
}

/**
 * Scrivener-style Draft: every document inside the manuscript folder, stacked
 * into one continuous scroll. Each scene keeps its own editor and its own
 * autosave, so the stored model stays per-document.
 */
export function DraftView() {
  const isFocusMode = useUIStore((state) => !state.isBinderVisible && !state.isInspectorVisible);
  const {
    activeProject,
    projectReadOnly,
    manuscriptDocuments,
    manuscriptLoading,
    loadManuscriptDocuments,
    updateManuscriptDocument,
    focusManuscriptDocument,
    flushManuscriptDocuments,
  } = useProjectStore();
  const { sceneSeparator, setSceneSeparator } = useEditorStore();

  useEffect(() => {
    void loadManuscriptDocuments();
    // Flush queued per-scene saves when the writer leaves the draft.
    return () => {
      void flushManuscriptDocuments();
    };
  }, [loadManuscriptDocuments, flushManuscriptDocuments]);

  if (!activeProject) return null;

  const root = resolveManuscriptFolder(activeProject.tree);
  const nodes: BinderNode[] = root ? collectManuscriptNodes(activeProject.tree, root.id) : [];
  const totalWords = nodes.reduce(
    (sum, node) => sum + (manuscriptDocuments[node.id]?.wordCount ?? node.wordCount ?? 0),
    0
  );

  return (
    <div className={`editor-canvas h-full overflow-y-auto ${isFocusMode ? 'is-focus-mode' : ''}`}>
      <div className="editor-focus-surface mx-auto w-full max-w-[720px] px-4 pb-40 pt-8 sm:px-8 sm:pt-12">
        <header className="mb-8 flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <h1 className="text-[22px] font-semibold leading-tight tracking-[-0.01em] text-ink">
              {root?.title ?? 'Manuscript'}
            </h1>
            <p className="mt-1 text-[12px] tabular-nums text-ink-faint">
              {nodes.length} {nodes.length === 1 ? 'scene' : 'scenes'} · {totalWords.toLocaleString()} words
            </p>
          </div>

          <label className="flex items-center gap-1.5 text-[11px] text-ink-faint">
            Separator
            <select
              value={sceneSeparator}
              onChange={(event) => setSceneSeparator(event.target.value as SceneSeparator)}
              className="h-6 rounded border border-line bg-surface px-1 text-[11px] text-ink transition-colors focus:border-accent focus:outline-none"
            >
              {SEPARATOR_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </header>

        {manuscriptLoading && nodes.length === 0 ? (
          <p className="py-10 text-center text-[12px] text-ink-faint">Preparing the manuscript…</p>
        ) : nodes.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-16 text-center">
            <IconXl as={BookOpen} />
            <p className="text-[13px] text-ink">Nothing to compile yet</p>
            <p className="max-w-[320px] text-[12px] leading-relaxed text-ink-faint">
              Documents inside “{root?.title ?? 'Manuscript'}” appear here as one manuscript.
            </p>
          </div>
        ) : (
          <div>
            {nodes.map((node, index) => {
              const document = manuscriptDocuments[node.id];
              return (
                <section
                  key={node.id}
                  data-scene={node.id}
                  onFocusCapture={() => focusManuscriptDocument(node.id)}
                  className="scene-item"
                >
                  {index > 0 && <SceneBreak type={sceneSeparator} />}
                  {document ? (
                    <TipTapEditor
                      key={document.id}
                      projectId={document.projectId}
                      documentId={document.id}
                      projectReadOnly={projectReadOnly}
                      mode="scene"
                      initialContent={document.content}
                      initialPlainText={document.plainText}
                      onUpdate={(content, plainText, wordCount, charCount) =>
                        updateManuscriptDocument(node.id, content, plainText, wordCount, charCount)
                      }
                    />
                  ) : (
                    <p className="py-6 text-[12px] text-ink-faint">Loading “{node.title}”…</p>
                  )}
                </section>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
