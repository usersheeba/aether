/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { AlertCircle, BookOpen, Check, FilePlus, Film, X } from 'lucide-react';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { useProjectStore } from '../../store/useProjectStore';
import { useUIStore } from '../../store/useUIStore';
import { TEMPLATE_OPTIONS } from '../../utils/templates';
import { useModalPresence } from '../../utils/useModalPresence';
import type { ProjectTemplateOption } from '../../utils/templates';
import { IconMd, IconSm, IconButton, Button, TextField } from '../../design/components';

const DEFAULT_TARGET_WORDS = 75000;

function templateIcon(iconName: string) {
  switch (iconName) {
    case 'Film':
      return <IconMd as={Film} />;
    case 'FilePlus':
      return <IconMd as={FilePlus} />;
    case 'BookOpen':
    default:
      return <IconMd as={BookOpen} />;
  }
}

function defaultTitleFor(template: ProjectTemplateOption): string {
  switch (template.id) {
    case 'novel_fantasy':
      return 'Fantasy Novel';
    case 'screenplay_noir':
      return 'Neon Noir';
    default:
      return 'Untitled Novel';
  }
}

export function CreateProjectModal() {
  const { activeModal, setActiveModal, setViewMode } = useUIStore();
  const { createProject, errorMessage, clearError } = useProjectStore();
  const isOpen = activeModal === 'create_project';
  const { isPresent, dialogRef } = useModalPresence(isOpen, () => setActiveModal(null));

  const [selectedTemplate, setSelectedTemplate] = useState(TEMPLATE_OPTIONS[0].id);
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [targetWordCount, setTargetWordCount] = useState(DEFAULT_TARGET_WORDS);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isPresent) return null;

  const template = TEMPLATE_OPTIONS.find((option) => option.id === selectedTemplate) ?? TEMPLATE_OPTIONS[0];

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (isSubmitting) return;

    setIsSubmitting(true);
    clearError();
    try {
      const created = await createProject(
        template.id,
        title.trim() || defaultTitleFor(template),
        author.trim() || 'Author',
        targetWordCount
      );
      if (!created) return;

      setTitle('');
      setAuthor('');
      setTargetWordCount(DEFAULT_TARGET_WORDS);
      setActiveModal(null);
      setViewMode('workspace');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-overlay p-3 sm:p-4" data-state={isOpen ? 'open' : 'closing'}>
      <div
        ref={dialogRef}
        className="modal-panel flex max-h-[92dvh] w-full max-w-[560px] flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-[var(--shadow-popover)]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-project-title"
        data-state={isOpen ? 'open' : 'closing'}
        aria-hidden={!isOpen}
        inert={!isOpen}
        tabIndex={-1}
      >
        <div className="flex items-center justify-between px-4 py-3">
          <h2 id="create-project-title" className="text-[14px] font-medium text-ink">New project</h2>
          <IconButton
            label="Close"
            onClick={() => setActiveModal(null)}
            aria-label="Close"
          >
            <IconMd as={X} />
          </IconButton>
        </div>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-col">
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pb-4">
            <div className="space-y-1.5">
              <span className="block text-[11px] font-medium text-ink-faint">Structure</span>
              <div className="space-y-1">
                {TEMPLATE_OPTIONS.map((option) => {
                  const isSelected = selectedTemplate === option.id;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => setSelectedTemplate(option.id)}
                      aria-pressed={isSelected}
                      className={`template-option flex w-full items-start gap-2.5 rounded-lg border px-2.5 py-2 text-left ${
                        isSelected
                          ? 'border-accent/40 bg-accent-soft'
                          : 'border-transparent hover:bg-hover'
                      }`}
                    >
                      <span className="mt-0.5 text-ink-muted">{templateIcon(option.iconName)}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[12.5px] text-ink">{option.name}</span>
                        <span className="mt-0.5 block text-[11.5px] leading-relaxed text-ink-faint">
                          {option.description}
                        </span>
                      </span>
                      <IconSm as={Check} className="template-option__check mt-0.5 shrink-0 text-accent" aria-hidden="true" />
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <TextField
                id="project-title"
                label="Title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder={defaultTitleFor(template)}
              />
              <TextField
                id="project-author"
                label="Author"
                value={author}
                onChange={(event) => setAuthor(event.target.value)}
                placeholder="Author"
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-baseline justify-between">
                <label className="block text-[11px] font-medium text-ink-faint" htmlFor="project-target">
                  Target words
                </label>
                <span className="text-[11px] tabular-nums text-ink-faint">
                  {targetWordCount.toLocaleString()}
                </span>
              </div>
              <input
                id="project-target"
                type="range"
                min={5000}
                max={200000}
                step={5000}
                value={targetWordCount}
                onChange={(event) => setTargetWordCount(Number(event.target.value))}
                className="range w-full"
              />
            </div>

            {errorMessage && (
              <p className="flex items-center gap-1.5 text-[12px] text-danger">
                <IconSm as={AlertCircle} /> {errorMessage}
              </p>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-line px-4 py-2">
            <Button variant="ghost" onClick={() => setActiveModal(null)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Creating…' : 'Create'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
