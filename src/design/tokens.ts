/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export const PROJECT_COLORS = [
  { key: 'slate-blue', label: 'Slate Blue' },
  { key: 'lavender', label: 'Lavender' },
  { key: 'sage', label: 'Sage' },
  { key: 'terracotta', label: 'Terracotta' },
  { key: 'dusty-rose', label: 'Dusty Rose' },
  { key: 'ochre', label: 'Ochre' },
  { key: 'teal', label: 'Teal' },
  { key: 'graphite', label: 'Graphite' },
] as const;

export type ProjectColorKey = (typeof PROJECT_COLORS)[number]['key'];
export type ProjectColorPart = 'base' | 'soft' | 'foreground';

const PROJECT_COLOR_KEYS = new Set<string>(PROJECT_COLORS.map((color) => color.key));

/** Old binder nodes stored hex labels; keep them readable without rewriting data. */
const LEGACY_PROJECT_COLORS: Record<string, ProjectColorKey> = {
  '#3b82f6': 'slate-blue',
  '#10b981': 'sage',
  '#f59e0b': 'ochre',
  '#ec4899': 'dusty-rose',
  '#8b5cf6': 'lavender',
  '#64748b': 'graphite',
  '#68849d': 'slate-blue',
  '#9985ae': 'lavender',
  '#8b9d83': 'sage',
  '#bd8370': 'terracotta',
  '#b98491': 'dusty-rose',
  '#b99a5f': 'ochre',
  '#679a96': 'teal',
  '#828a8a': 'graphite',
};

export const PROJECT_COLOR_LABELS = Object.fromEntries(
  PROJECT_COLORS.map((color) => [color.key, color.label])
) as Record<ProjectColorKey, string>;

export function normalizeProjectColor(value: string | null | undefined): ProjectColorKey | null {
  if (!value) return null;
  if (PROJECT_COLOR_KEYS.has(value)) return value as ProjectColorKey;
  return LEGACY_PROJECT_COLORS[value.toLowerCase()] ?? null;
}

export function projectColorVar(key: ProjectColorKey, part: ProjectColorPart): string {
  return `var(--ds-project-${key}-${part})`;
}

export function projectColorStyle(
  value: string | null | undefined,
  part: ProjectColorPart = 'foreground'
): { color: string } | { backgroundColor: string } | undefined {
  const key = normalizeProjectColor(value);
  if (!key) return undefined;
  return part === 'foreground'
    ? { color: projectColorVar(key, 'foreground') }
    : { backgroundColor: projectColorVar(key, part) };
}

export interface TokenDefinition {
  name: string;
  label: string;
}

export interface TokenGroup {
  title: string;
  description?: string;
  tokens: TokenDefinition[];
}

export const COLOR_TOKEN_GROUPS: TokenGroup[] = [
  {
    title: 'Surfaces',
    tokens: [
      { name: '--ds-color-canvas', label: 'Canvas' },
      { name: '--ds-color-sidebar', label: 'Sidebar' },
      { name: '--ds-color-surface', label: 'Surface' },
      { name: '--ds-color-surface-muted', label: 'Surface muted' },
      { name: '--ds-color-overlay', label: 'Overlay' },
    ],
  },
  {
    title: 'Borders',
    tokens: [
      { name: '--ds-color-border', label: 'Border' },
      { name: '--ds-color-border-strong', label: 'Border strong' },
      { name: '--ds-color-control-border', label: 'Control border' },
    ],
  },
  {
    title: 'Text',
    tokens: [
      { name: '--ds-color-text', label: 'Primary text' },
      { name: '--ds-color-text-secondary', label: 'Secondary text' },
      { name: '--ds-color-text-muted', label: 'Secondary text — AA' },
      { name: '--ds-color-text-faint', label: 'Faint text' },
      { name: '--ds-color-text-placeholder', label: 'Placeholder' },
    ],
  },
  {
    title: 'Accent & states',
    tokens: [
      { name: '--ds-color-accent', label: 'Accent' },
      { name: '--ds-color-accent-hover', label: 'Accent hover' },
      { name: '--ds-color-accent-active', label: 'Accent active' },
      { name: '--ds-color-accent-tint', label: 'Accent tint' },
      { name: '--ds-color-accent-strong', label: 'Accent strong / text' },
      { name: '--ds-color-on-accent', label: 'On accent' },
      { name: '--ds-color-hover', label: 'Hover surface' },
      { name: '--ds-color-active', label: 'Active surface' },
      { name: '--ds-color-selected', label: 'Selected surface' },
      { name: '--ds-color-selected-strong', label: 'Selected strong' },
      { name: '--ds-color-focus', label: 'Focus ring' },
      { name: '--ds-color-disabled-bg', label: 'Disabled surface' },
      { name: '--ds-color-disabled-text', label: 'Disabled text' },
    ],
  },
  {
    title: 'Feedback',
    tokens: [
      { name: '--ds-color-danger', label: 'Danger' },
      { name: '--ds-color-danger-soft', label: 'Danger soft' },
      { name: '--ds-color-warning', label: 'Warning' },
      { name: '--ds-color-warning-soft', label: 'Warning soft' },
      { name: '--ds-color-success', label: 'Success' },
      { name: '--ds-color-success-soft', label: 'Success soft' },
      { name: '--ds-color-info', label: 'Info' },
      { name: '--ds-color-info-soft', label: 'Info soft' },
    ],
  },
  {
    title: 'Document status',
    tokens: [
      { name: '--ds-status-draft', label: 'Draft' },
      { name: '--ds-status-progress', label: 'In progress' },
      { name: '--ds-status-review', label: 'In review' },
      { name: '--ds-status-final', label: 'Final' },
    ],
  },
];

export const PROJECT_TOKEN_GROUP: TokenGroup = {
  title: 'Project labels',
  description: 'Base identifies the project, Soft is its quiet surface, Foreground is AA text on Soft.',
  tokens: PROJECT_COLORS.map((color) => ({
    name: `--ds-project-${color.key}-base`,
    label: color.label,
  })),
};

export const PRINT_TOKEN_GROUP: TokenGroup = {
  title: 'Paper & print',
  description: 'Paper preview and exported pages stay light in both themes.',
  tokens: [
    { name: '--ds-print-paper', label: 'Paper' },
    { name: '--ds-print-text', label: 'Paper text' },
    { name: '--ds-print-muted', label: 'Paper muted' },
    { name: '--ds-print-rule', label: 'Paper rule' },
    { name: '--ds-print-border', label: 'Paper border' },
    { name: '--ds-print-header-bg', label: 'Table header' },
  ],
};

export const TYPOGRAPHY_TOKENS: TokenDefinition[] = [
  { name: '--ds-text-display-size', label: 'Display' },
  { name: '--ds-text-title-size', label: 'Title' },
  { name: '--ds-text-heading-size', label: 'Heading' },
  { name: '--ds-text-body-size', label: 'Body' },
  { name: '--ds-text-ui-size', label: 'UI' },
  { name: '--ds-text-small-size', label: 'Small' },
  { name: '--ds-text-caption-size', label: 'Caption' },
  { name: '--ds-text-editor-size', label: 'Editor' },
];

export const SPACE_TOKENS: TokenDefinition[] = [
  { name: '--ds-space-1', label: '4' },
  { name: '--ds-space-2', label: '8' },
  { name: '--ds-space-3', label: '12' },
  { name: '--ds-space-4', label: '16' },
  { name: '--ds-space-5', label: '20' },
  { name: '--ds-space-6', label: '24' },
  { name: '--ds-space-8', label: '32' },
  { name: '--ds-space-10', label: '40' },
  { name: '--ds-space-12', label: '48' },
];

export const RADIUS_TOKENS: TokenDefinition[] = [
  { name: '--ds-radius-sm', label: 'Small' },
  { name: '--ds-radius-md', label: 'Medium' },
  { name: '--ds-radius-lg', label: 'Large' },
  { name: '--ds-radius-xl', label: 'Extra large' },
];

export function readCssVariable(name: string): string {
  if (typeof window === 'undefined') return '';
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/** Reads a token through an off-screen element scoped to one theme. */
export function readScopedCssVariable(name: string, theme: 'light' | 'dark'): string {
  if (typeof window === 'undefined') return '';
  const probe = document.createElement('div');
  probe.className = theme === 'dark' ? 'theme-dark' : 'theme-light';
  probe.style.cssText =
    'position:absolute;left:-9999px;top:0;width:1px;height:1px;pointer-events:none;visibility:hidden;';
  document.body.appendChild(probe);
  const value = getComputedStyle(probe).getPropertyValue(name).trim();
  probe.remove();
  return value;
}

function parseHex(value: string): [number, number, number] | null {
  const match = /^#([0-9a-f]{6})$/i.exec(value.trim());
  if (!match) return null;
  const number = Number.parseInt(match[1], 16);
  return [(number >> 16) & 255, (number >> 8) & 255, number & 255];
}

function relativeLuminance(value: string): number | null {
  const rgb = parseHex(value);
  if (!rgb) return null;
  const [r, g, b] = rgb.map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2.1 contrast ratio for two hex colours; null for non-hex values. */
export function contrastRatio(foreground: string, background: string): number | null {
  const foregroundLuminance = relativeLuminance(foreground);
  const backgroundLuminance = relativeLuminance(background);
  if (foregroundLuminance === null || backgroundLuminance === null) return null;
  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

export const CONTRAST_CHECKS = [
  { label: 'Primary text / canvas', foreground: '--ds-color-text', background: '--ds-color-canvas' },
  { label: 'Muted text / canvas', foreground: '--ds-color-text-muted', background: '--ds-color-canvas' },
  { label: 'Accent / surface', foreground: '--ds-color-accent', background: '--ds-color-surface' },
  { label: 'On accent / accent', foreground: '--ds-color-on-accent', background: '--ds-color-accent' },
  { label: 'Danger / danger soft', foreground: '--ds-color-danger', background: '--ds-color-danger-soft' },
  { label: 'Warning / warning soft', foreground: '--ds-color-warning', background: '--ds-color-warning-soft' },
  { label: 'Success / success soft', foreground: '--ds-color-success', background: '--ds-color-success-soft' },
] as const;

export function readTokenGroup(group: TokenGroup): Array<TokenDefinition & { value: string }> {
  return group.tokens.map((token) => ({ ...token, value: readCssVariable(token.name) }));
}
