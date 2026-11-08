import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolvePageGeometry, normalizePageView } from '../../src/utils/pageLayout.ts';

test('normalizes the legacy pixel page model into shared page settings', () => {
  const view = normalizePageView({ widthPx: 816, minHeightPx: 1056, paddingPx: 64 });

  assert.equal(view.format, 'letter');
  assert.equal(view.orientation, 'portrait');
  assert.equal(Math.round(view.margins.topMm * 100) / 100, 16.93);
  assert.equal(view.header, '');
  assert.equal(view.footer, '');
});

test('keeps modern page settings and applies landscape orientation', () => {
  const view = normalizePageView({
    format: 'a4',
    orientation: 'landscape',
    margins: { topMm: 15, rightMm: 18, bottomMm: 15, leftMm: 18 },
    header: 'Aether',
    footer: 'Page {page} of {pages}',
  });
  const geometry = resolvePageGeometry(view);

  assert.equal(geometry.widthMm, 297);
  assert.equal(geometry.heightMm, 210);
  assert.deepEqual(geometry.margins, { topMm: 15, rightMm: 18, bottomMm: 15, leftMm: 18 });
  assert.equal(geometry.header, 'Aether');
  assert.equal(geometry.footer, 'Page {page} of {pages}');
});

test('clamps custom page dimensions and margins to sane bounds', () => {
  const view = normalizePageView({
    format: 'custom',
    orientation: 'portrait',
    margins: { topMm: -5, rightMm: 200, bottomMm: 20, leftMm: 20 },
    customWidthMm: 10,
    customHeightMm: 900,
  });
  const geometry = resolvePageGeometry(view);

  assert.equal(geometry.widthMm, 50);
  assert.equal(geometry.heightMm, 500);
  assert.equal(geometry.margins.topMm, 0);
  assert.equal(geometry.margins.rightMm, 100);
});

test('returns defaults for missing or malformed settings', () => {
  const view = normalizePageView(undefined);
  const geometry = resolvePageGeometry(view);

  assert.equal(view.format, 'a4');
  assert.equal(geometry.widthMm, 210);
  assert.equal(geometry.heightMm, 297);
  assert.equal(geometry.margins.topMm, 20);
});
