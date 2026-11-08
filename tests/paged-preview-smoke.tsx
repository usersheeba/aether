import { createRoot } from 'react-dom/client';
import type { JSONContent } from '@tiptap/core';
import { PagedPreview } from '../src/editor/PagedPreview';
import '../src/index.css';

const longParagraph = `Long paragraph line for pagination. This passage should flow naturally across page boundaries while preserving all of its words. `.repeat(24);
const cellParagraph = (row: number, column: number): JSONContent => ({
  type: 'paragraph',
  content: [{ type: 'text', text: `ROW_${row}_COL_${column}: ${'table copy '.repeat(9)}` }],
});

const content: JSONContent = {
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Smoke test heading' }] },
    ...Array.from({ length: 5 }, (_, index) => ({
      type: 'paragraph',
      content: [{ type: 'text', text: `PARAGRAPH_${index + 1}: ${longParagraph}` }],
    })),
    {
      type: 'image',
      attrs: {
        src: 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22600%22 height=%22220%22 viewBox=%220 0 600 220%22%3E%3Crect width=%22600%22 height=%22220%22 fill=%22%23e5e7eb%22/%3E%3Ctext x=%22300%22 y=%22120%22 text-anchor=%22middle%22 font-size=%2232%22 fill=%22%2337352f%22%3ESMOKE_IMAGE%3C/text%3E%3C/svg%3E',
        alt: 'SMOKE_IMAGE',
        width: 600,
        height: 220,
      },
    },
    {
      type: 'heading',
      attrs: { level: 2 },
      content: [{ type: 'text', text: 'Sixty-row table' }],
    },
    {
      type: 'table',
      content: [
        {
          type: 'tableRow',
          content: [1, 2, 3].map((column) => ({
            type: 'tableHeader',
            content: [cellParagraph(0, column)],
          })),
        },
        ...Array.from({ length: 60 }, (_, row) => ({
          type: 'tableRow',
          content: [1, 2, 3].map((column) => ({
            type: 'tableCell',
            content: [cellParagraph(row + 1, column)],
          })),
        })),
      ],
    },
  ],
};

const result = document.createElement('output');
result.id = 'result';
document.body.appendChild(result);

createRoot(document.getElementById('root')!).render(
  <div style={{ height: '100vh' }}>
    <PagedPreview
      title="Paged preview smoke test"
      content={content}
      pageView={{
        format: 'a4',
        orientation: 'portrait',
        margins: { topMm: 20, rightMm: 20, bottomMm: 20, leftMm: 20 },
        header: 'Aether Writer pagination smoke test',
        footer: 'Page {page} of {pages}',
      }}
      fontFamily="Literata"
      fontSizePx={17}
      lineHeight={1.7}
      typography="book"
      language="en"
      onPageCount={(count) => {
        result.value = count === null ? 'LAYOUT' : `READY:${count}`;
      }}
    />
  </div>
);
