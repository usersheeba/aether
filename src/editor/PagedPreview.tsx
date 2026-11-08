import { generateHTML, type JSONContent } from '@tiptap/core';
import { Printer } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { PageViewSettings } from '../types/project.ts';
import { resolvePageGeometry } from '../utils/pageLayout.ts';
import { createEditorExtensions } from './editorExtensions';
import { createRepeatTableHeadersHandler } from './pagedTableHeaders';
import { IconSm } from '../design/components';

interface PagedPreviewProps {
  title: string;
  content: JSONContent | null;
  pageView: PageViewSettings;
  fontFamily: string;
  fontSizePx: number;
  lineHeight: number;
  typography: 'book' | 'draft';
  language: string;
  onPageCount: (count: number | null) => void;
}

const registeredHandlers = new WeakSet<object>();

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    return entities[character]!;
  });
}

function serializeContent(content: JSONContent | null, title: string, language: string): string {
  const body = content ? generateHTML(content, createEditorExtensions()) : '<p></p>';
  const template = document.createElement('template');
  template.innerHTML = body;

  for (const table of template.content.querySelectorAll('table')) {
    if (table.tHead) continue;

    const bodySection = table.tBodies[0];
    if (!bodySection) continue;

    const headerRows: HTMLTableRowElement[] = [];
    while (bodySection.rows.length) {
      const row = bodySection.rows[0];
      if (!row.cells.length || Array.from(row.cells).some((cell) => cell.tagName !== 'TH')) break;
      headerRows.push(row);
      bodySection.removeChild(row);
    }

    if (headerRows.length) {
      const header = table.createTHead();
      headerRows.forEach((row) => header.appendChild(row));
    }
  }

  return `<article class="aether-print-content" lang="${escapeHtml(language)}"><h1 class="aether-print-title">${escapeHtml(title)}</h1>${template.innerHTML}</article>`;
}

function cssString(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r?\n/g, ' ')}"`;
}

/** Turns `Page {page} of {pages}` into a CSS `content` declaration. */
function marginBoxContent(template: string): string | null {
  const trimmed = template.trim();
  if (!trimmed) return null;

  const parts = trimmed
    .split(/(\{page\}|\{pages\})/g)
    .filter(Boolean)
    .map((part) => {
      if (part === '{page}') return 'counter(page)';
      if (part === '{pages}') return 'counter(pages)';
      return cssString(part);
    });

  return parts.length ? `content: ${parts.join(' ')};` : null;
}

function marginBox(position: string, template: string, font: string): string {
  const content = marginBoxContent(template);
  if (!content) return '';
  return `@${position} {
    ${content}
    color: var(--ds-print-muted);
    font-family: "${font}", Georgia, serif;
    font-size: 8.5pt;
    letter-spacing: 0.01em;
  }`;
}

async function waitForPreviewFont(fontFamily: string, fontSizePx: number): Promise<void> {
  const font = fontFamily.trim();
  if (!font) return;

  const size = Math.max(8, Math.round(fontSizePx));
  const specs = [
    `400 ${size}px "${font}"`,
    `700 ${size}px "${font}"`,
    `italic 400 ${size}px "${font}"`,
    `italic 700 ${size}px "${font}"`,
  ];

  await Promise.all(
    specs.map((spec) =>
      document.fonts.load(spec).catch((error: unknown) => {
        console.warn(`Could not preload the preview font "${font}".`, error);
        return [];
      })
    )
  );
  await document.fonts.ready;
}

function createPrintStyles({
  pageView,
  fontFamily,
  fontSizePx,
  lineHeight,
  typography,
}: Pick<PagedPreviewProps, 'pageView' | 'fontFamily' | 'fontSizePx' | 'lineHeight' | 'typography'>): string {
  const font = fontFamily.replace(/["\\;]/g, '');
  const geometry = resolvePageGeometry(pageView);
  const indent = typography === 'book' ? '1.4em' : '0';
  const paragraphSpacing = typography === 'book' ? '0' : '0.85em';

  return `
    @page {
      size: ${geometry.widthMm}mm ${geometry.heightMm}mm;
      margin: ${geometry.margins.topMm}mm ${geometry.margins.rightMm}mm ${geometry.margins.bottomMm}mm ${geometry.margins.leftMm}mm;
      ${marginBox('top-center', geometry.header, font)}
      ${marginBox('bottom-center', geometry.footer, font)}
    }
    .aether-print-content {
      color: var(--ds-print-text);
      font-family: "${font}", Georgia, serif;
      font-size: ${fontSizePx}px;
      line-height: ${lineHeight};
      text-align: justify;
      /* Auto-hyphenation uses per-browser dictionaries, which shifts line and
         page breaks between engines. The preview keeps breaks deterministic. */
      hyphens: manual;
      -webkit-hyphens: manual;
    }
    .aether-print-title {
      font-size: 1.8em;
      line-height: 1.2;
      margin: 0 0 1.25em;
      text-align: left;
      break-after: avoid-page;
      page-break-after: avoid;
    }
    .aether-print-content p {
      margin: ${paragraphSpacing} 0 0;
      text-indent: ${indent};
      orphans: 3;
      widows: 3;
    }
    .aether-print-content > p:first-child,
    .aether-print-content > h1 + p,
    .aether-print-content > h2 + p,
    .aether-print-content > h3 + p,
    .aether-print-content > h4 + p,
    .aether-print-content > blockquote + p,
    .aether-print-content > ul + p,
    .aether-print-content > ol + p,
    .aether-print-content > pre + p,
    .aether-print-content > hr + p {
      text-indent: 0;
    }
    .aether-print-content h1,
    .aether-print-content h2,
    .aether-print-content h3,
    .aether-print-content h4 {
      break-after: avoid-page;
      page-break-after: avoid;
      line-height: 1.25;
      margin: 1.1em 0 0.35em;
      text-align: left;
      text-indent: 0;
    }
    .aether-print-content h1 { font-size: 1.6em; }
    .aether-print-content h2 { font-size: 1.3em; }
    .aether-print-content h3 { font-size: 1.12em; }
    .aether-print-content h4 { font-size: 1em; }
    .aether-print-content blockquote,
    .aether-print-content pre,
    .aether-print-content figure,
    .aether-print-content img {
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .aether-print-content blockquote {
      border-left: 2px solid var(--ds-print-rule);
      color: var(--ds-print-muted);
      margin: 0.85em 0;
      padding-left: 0.9em;
    }
    .aether-print-content img {
      display: block;
      height: auto;
      max-width: 100%;
    }
    .aether-print-content table {
      border-collapse: collapse;
      break-inside: auto;
      page-break-inside: auto;
      width: 100%;
    }
    .aether-print-content thead { display: table-header-group; }
    .aether-print-content tfoot { display: table-footer-group; }
    .aether-print-content tr {
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .aether-print-content th,
    .aether-print-content td {
      border: 1px solid var(--ds-print-border);
      padding: 0.35em 0.45em;
      text-align: left;
      vertical-align: top;
    }
    .aether-print-content th { background: var(--ds-print-header-bg); }
  `;
}

export function PagedPreview({
  title,
  content,
  pageView,
  fontFamily,
  fontSizePx,
  lineHeight,
  typography,
  language,
  onPageCount,
}: PagedPreviewProps) {
  const targetRef = useRef<HTMLDivElement>(null);
  const onPageCountRef = useRef(onPageCount);
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    onPageCountRef.current = onPageCount;
  }, [onPageCount]);

  const source = useMemo(() => {
    try {
      return {
        html: serializeContent(content, title, language),
        error: null,
      };
    } catch (sourceError) {
      console.error('Could not serialize the document for page preview.', sourceError);
      return {
        html: '',
        error: sourceError instanceof Error ? sourceError.message : 'Could not prepare this document for preview.',
      };
    }
  }, [content, language, title]);

  const styles = useMemo(
    () => createPrintStyles({ pageView, fontFamily, fontSizePx, lineHeight, typography }),
    [fontFamily, fontSizePx, lineHeight, pageView, typography]
  );

  useEffect(() => {
    onPageCountRef.current(null);
    setPageCount(null);
    setError(source.error);
    setLoading(!source.error);
    if (source.error) return;

    let cancelled = false;
    let previewer: import('pagedjs').Previewer | null = null;

    void (async () => {
      try {
        await waitForPreviewFont(fontFamily, fontSizePx);
        const { Handler, Previewer, registerHandlers } = await import('pagedjs');
        if (cancelled || !targetRef.current) return;

        if (!registeredHandlers.has(registerHandlers)) {
          registerHandlers(createRepeatTableHeadersHandler(Handler));
          registeredHandlers.add(registerHandlers);
        }
        previewer = new Previewer();
        const flow = await previewer.preview(
          source.html,
          [{ [window.location.href]: styles }],
          targetRef.current
        );

        if (cancelled) return;
        setPageCount(flow.total);
        onPageCountRef.current(flow.total);
      } catch (previewError) {
        if (cancelled) return;
        console.error('Could not paginate the document preview.', previewError);
        setError(previewError instanceof Error ? previewError.message : 'Could not paginate this document.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      previewer?.chunker.stop();
      previewer?.polisher.destroy();
      targetRef.current?.replaceChildren();
    };
  }, [source, styles]);

  return (
    <section className="paged-preview-root flex h-full min-h-0 flex-col" aria-label="Read-only page preview">
      <header className="paged-preview-controls flex min-h-11 shrink-0 items-center justify-between gap-3 border-b border-line bg-sidebar px-3 text-[11px] text-ink-muted">
        <span>
          Read-only preview{pageCount === null ? '' : ` · ${pageCount} ${pageCount === 1 ? 'page' : 'pages'}`}
        </span>
        <button
          type="button"
          onClick={() => window.print()}
          disabled={loading || Boolean(error)}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-md px-3 text-ink-muted hover:bg-hover hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
        >
          <IconSm as={Printer} />
          <span>Print / Save PDF</span>
        </button>
      </header>
      <div
        className={`paged-preview-viewport min-h-0 flex-1 ${loading ? 'overflow-visible' : 'overflow-auto'}`}
      >
        {loading && (
          <p className="p-6 text-center text-[12px] text-ink-muted" role="status">
            Preparing page preview…
          </p>
        )}
        {error && (
          <p className="m-4 rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-small text-danger" role="alert">
            Could not render page preview: {error}
          </p>
        )}
        <div
          ref={targetRef}
          className="paged-preview-pages"
          role="document"
          aria-label="Paginated document contents"
        />
      </div>
    </section>
  );
}
