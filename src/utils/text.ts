/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/** Counts whitespace-separated words, ignoring leading/trailing whitespace. */
export function countWords(text: string): number {
  const normalized = text.trim();
  return normalized ? normalized.split(/\s+/).length : 0;
}

/** Escapes a literal string so it can be embedded into a regular expression. */
export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Counts case-insensitive literal occurrences of `query` inside `text`. */
export function countMatches(text: string, query: string): number {
  if (!query.trim() || !text) return 0;
  const matches = text.match(new RegExp(escapeRegExp(query), 'gi'));
  return matches ? matches.length : 0;
}

/** Formats an ISO timestamp as a short local date, tolerating invalid input. */
export function formatDate(isoDate: string): string {
  const date = new Date(isoDate);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString();
}

/** Formats an ISO timestamp as a local date + time, tolerating invalid input. */
export function formatDateTime(isoDate: string): string {
  const date = new Date(isoDate);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
}
