/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { DEFAULT_PAGE_VIEW } from '../types/project.ts';
import type { PageFormat, PageMargins, PageOrientation, PageViewSettings } from '../types/project.ts';

export interface PageGeometry {
  widthMm: number;
  heightMm: number;
  margins: PageMargins;
  header: string;
  footer: string;
}

/** Portrait dimensions of the built-in formats, in millimetres. */
const FORMAT_SIZES_MM: Record<Exclude<PageFormat, 'custom'>, { widthMm: number; heightMm: number }> = {
  a4: { widthMm: 210, heightMm: 297 },
  a5: { widthMm: 148, heightMm: 210 },
  letter: { widthMm: 215.9, heightMm: 279.4 },
};

export const PAGE_FORMAT_LABELS: Record<PageFormat, string> = {
  a4: 'A4 (210 × 297 mm)',
  a5: 'A5 (148 × 210 mm)',
  letter: 'Letter (8.5 × 11 in)',
  custom: 'Custom',
};

export const PAGE_ORIENTATION_LABELS: Record<PageOrientation, string> = {
  portrait: 'Portrait',
  landscape: 'Landscape',
};

const PX_TO_MM = 25.4 / 96;
const LEGACY_WIDTH_PX = 816;
const LEGACY_HEIGHT_PX = 1056;
const LEGACY_PADDING_PX = 64;

function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function isPageFormat(value: unknown): value is PageFormat {
  return value === 'a4' || value === 'a5' || value === 'letter' || value === 'custom';
}

function isOrientation(value: unknown): value is PageOrientation {
  return value === 'portrait' || value === 'landscape';
}

function readMargins(value: unknown, fallback: PageMargins): PageMargins {
  if (!value || typeof value !== 'object') return { ...fallback };
  const candidate = value as Record<string, unknown>;
  return {
    topMm: clamp(finite(candidate.topMm, fallback.topMm), 0, 100),
    rightMm: clamp(finite(candidate.rightMm, fallback.rightMm), 0, 100),
    bottomMm: clamp(finite(candidate.bottomMm, fallback.bottomMm), 0, 100),
    leftMm: clamp(finite(candidate.leftMm, fallback.leftMm), 0, 100),
  };
}

/**
 * Accepts both the current page model and the legacy pixel model that older
 * projects stored in their manifest (`widthPx` / `minHeightPx` / `paddingPx`).
 */
export function normalizePageView(value: unknown): PageViewSettings {
  const defaults = DEFAULT_PAGE_VIEW;
  if (!value || typeof value !== 'object') {
    return { ...defaults, margins: { ...defaults.margins } };
  }

  const candidate = value as Record<string, unknown>;
  const hasModernShape =
    isPageFormat(candidate.format) &&
    (isOrientation(candidate.orientation) || (candidate.margins !== null && typeof candidate.margins === 'object'));

  if (hasModernShape) {
    const format = candidate.format as PageFormat;
    const orientation = isOrientation(candidate.orientation) ? candidate.orientation : 'portrait';
    return {
      format,
      orientation,
      margins: readMargins(candidate.margins, defaults.margins),
      header: typeof candidate.header === 'string' ? candidate.header : '',
      footer: typeof candidate.footer === 'string' ? candidate.footer : '',
      ...(format === 'custom'
        ? {
            customWidthMm: clamp(finite(candidate.customWidthMm, 210), 50, 500),
            customHeightMm: clamp(finite(candidate.customHeightMm, 297), 50, 500),
          }
        : {}),
    };
  }

  // Legacy pixel geometry: infer the closest paper size so old projects keep
  // the same visual page while gaining the modern settings model.
  const legacyWidth = clamp(finite(candidate.widthPx, LEGACY_WIDTH_PX), 100, 5000);
  const legacyHeight = clamp(finite(candidate.minHeightPx, LEGACY_HEIGHT_PX), 100, 5000);
  const paddingPx = clamp(finite(candidate.paddingPx, LEGACY_PADDING_PX), 0, 400);
  const orientation: PageOrientation = legacyWidth > legacyHeight ? 'landscape' : 'portrait';
  const shortSide = Math.min(legacyWidth, legacyHeight);
  const longSide = Math.max(legacyWidth, legacyHeight);
  const marginMm = clamp(paddingPx * PX_TO_MM, 0, 100);

  let format: PageFormat = 'custom';
  if (Math.abs(shortSide - LEGACY_WIDTH_PX) <= 2 && Math.abs(longSide - LEGACY_HEIGHT_PX) <= 2) {
    format = 'letter';
  } else if (Math.abs(shortSide - 794) <= 3 && Math.abs(longSide - 1123) <= 3) {
    format = 'a4';
  }

  return {
    format,
    orientation,
    margins: { topMm: marginMm, rightMm: marginMm, bottomMm: marginMm, leftMm: marginMm },
    header: '',
    footer: '',
    ...(format === 'custom'
      ? { customWidthMm: shortSide * PX_TO_MM, customHeightMm: longSide * PX_TO_MM }
      : {}),
  };
}

/** Resolves the CSS page box for a set of shared page settings. */
export function resolvePageGeometry(value: PageViewSettings | null | undefined): PageGeometry {
  const view = normalizePageView(value);
  const base =
    view.format === 'custom'
      ? {
          widthMm: clamp(finite(view.customWidthMm, 210), 50, 500),
          heightMm: clamp(finite(view.customHeightMm, 297), 50, 500),
        }
      : FORMAT_SIZES_MM[view.format];
  const isLandscape = view.orientation === 'landscape';

  return {
    widthMm: isLandscape ? base.heightMm : base.widthMm,
    heightMm: isLandscape ? base.widthMm : base.heightMm,
    margins: view.margins,
    header: view.header,
    footer: view.footer,
  };
}

export function normalizeProjectSettings<T extends { pageView?: unknown }>(settings: T): T & { pageView: PageViewSettings } {
  return {
    ...settings,
    pageView: normalizePageView(settings.pageView),
  };
}
