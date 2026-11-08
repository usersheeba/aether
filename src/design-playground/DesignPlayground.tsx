/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Internal design-system preview. It is intentionally not linked from the app
 * navigation; open /design-playground.html directly.
 */

import { useMemo, useState } from 'react';
import {
  Check,
  ChevronDown,
  Command,
  FileText,
  Folder,
  Moon,
  MoreHorizontal,
  Search,
  Sun,
  Type,
} from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  IconButton,
  MenuItem,
  MenuPanel,
  ModalPanel,
  NavItem,
  ProjectColorChip,
  Segmented,
  SegmentedItem,
  SelectField,
  TextareaField,
  TextField,
  IconSm,
  IconMd,
} from '../design/components';
import {
  COLOR_TOKEN_GROUPS,
  CONTRAST_CHECKS,
  PRINT_TOKEN_GROUP,
  PROJECT_COLORS,
  RADIUS_TOKENS,
  SPACE_TOKENS,
  TYPOGRAPHY_TOKENS,
  contrastRatio,
  projectColorVar,
  readCssVariable,
  readScopedCssVariable,
} from '../design/tokens';
import type { ProjectColorKey, TokenGroup } from '../design/tokens';
import { useUIStore } from '../store/useUIStore';

function Section({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24 space-y-4">
      <div className="max-w-[720px]">
        <h2 className="ds-type-title text-ink">{title}</h2>
        {description && <p className="ds-type-small mt-1 text-ink-muted">{description}</p>}
      </div>
      {children}
    </section>
  );
}

function Swatch({ value, label }: { value: string; label?: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span
        className="ds-swatch shrink-0"
        style={{ backgroundColor: value }}
        title={label ?? value}
        aria-hidden="true"
      />
      <span className="ds-type-caption font-mono text-ink-muted">{value || '—'}</span>
    </span>
  );
}

function TokenTable({ group }: { group: TokenGroup }) {
  const rows = useMemo(
    () =>
      group.tokens.map((token) => ({
        ...token,
        light: readScopedCssVariable(token.name, 'light'),
        dark: readScopedCssVariable(token.name, 'dark'),
      })),
    [group]
  );

  return (
    <div className="ds-card overflow-hidden">
      <div className="border-b border-line px-4 py-3">
        <h3 className="ds-type-small font-medium text-ink">{group.title}</h3>
        {group.description && <p className="ds-type-caption mt-0.5 text-ink-faint">{group.description}</p>}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[620px] border-collapse text-left">
          <thead>
            <tr className="border-b border-line bg-surface-muted">
              <th className="ds-type-caption px-4 py-2 font-medium text-ink-muted">Token</th>
              <th className="ds-type-caption px-4 py-2 font-medium text-ink-muted">Light</th>
              <th className="ds-type-caption px-4 py-2 font-medium text-ink-muted">Dark</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.name} className="border-b border-line last:border-b-0">
                <td className="px-4 py-2">
                  <span className="ds-type-caption block text-ink">{row.label}</span>
                  <span className="ds-type-caption font-mono text-ink-faint">{row.name}</span>
                </td>
                <td className="px-4 py-2">
                  <Swatch value={row.light} />
                </td>
                <td className="px-4 py-2">
                  <Swatch value={row.dark} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ThemeSample({ theme }: { theme: 'light' | 'dark' }) {
  return (
    <div className={`theme-${theme} rounded-xl border border-line bg-canvas p-4`}>
      <div className="overflow-hidden rounded-lg border border-line bg-surface">
        <div className="flex items-center justify-between border-b border-line px-3 py-2">
          <span className="ds-type-caption font-medium text-ink">Manuscript</span>
          <Badge tone="accent">{theme}</Badge>
        </div>
        <div className="space-y-3 p-4">
          <div>
            <p className="ds-type-caption text-ink-faint">Chapter 1</p>
            <h3 className="ds-type-heading mt-0.5 text-ink">The Lantern at Sunset</h3>
            <p className="ds-type-small mt-1 text-ink-muted">
              The tide came in quietly, carrying the last of the day behind it.
            </p>
          </div>
          <TextField label="Document title" defaultValue="The Lantern at Sunset" />
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" leadingIcon={<IconSm as={FileText} />}>
              Open manuscript
            </Button>
            <Button variant="secondary">Preview</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

const BUTTON_STATES = ['default', 'hover', 'active', 'focus', 'disabled'] as const;
const BUTTON_VARIANTS = [
  { key: 'primary', label: 'Primary' },
  { key: 'secondary', label: 'Secondary' },
  { key: 'ghost', label: 'Ghost' },
  { key: 'danger', label: 'Danger' },
] as const;

function ButtonGallery() {
  return (
    <div className="space-y-5">
      <div className="ds-card overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse text-left">
          <thead>
            <tr className="border-b border-line bg-surface-muted">
              <th className="ds-type-caption px-4 py-2 font-medium text-ink-muted">Variant</th>
              {BUTTON_STATES.map((state) => (
                <th key={state} className="ds-type-caption px-4 py-2 font-medium text-ink-muted capitalize">
                  {state}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {BUTTON_VARIANTS.map((variant) => (
              <tr key={variant.key} className="border-b border-line last:border-b-0">
                <td className="ds-type-caption px-4 py-3 font-mono text-ink-muted">{variant.label}</td>
                {BUTTON_STATES.map((state) => (
                  <td key={state} className="px-4 py-3">
                    <Button variant={variant.key} state={state === 'default' ? undefined : state}>
                      {variant.label}
                    </Button>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="p-4">
          <p className="ds-type-caption mb-3 font-medium text-ink-muted">Sizes and icons</p>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="primary" size="sm">Small</Button>
            <Button variant="primary">Medium</Button>
            <Button variant="primary" size="lg">Large</Button>
            <IconButton label="Search">
              <IconMd as={Search} />
            </IconButton>
            <IconButton label="More actions">
              <IconMd as={MoreHorizontal} />
            </IconButton>
          </div>
        </Card>
        <Card className="p-4">
          <p className="ds-type-caption mb-3 font-medium text-ink-muted">Selection states</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" state="selected">Selected</Button>
            <Button variant="secondary" state="disabled">Disabled</Button>
            <Button variant="ghost" state="hover">Hover</Button>
            <Button variant="danger" state="focus">Focus</Button>
          </div>
        </Card>
      </div>
    </div>
  );
}

function FieldGallery() {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="space-y-4 p-4">
        <p className="ds-type-caption font-medium text-ink-muted">Text inputs</p>
        <TextField label="Project title" placeholder="Untitled project" />
        <TextField
          label="Search"
          placeholder="Search the manuscript"
          hint="Find text without changing its formatting."
        />
        <TextField label="Slug" defaultValue="the-lantern-at-sunset" />
        <TextField label="Read-only field" defaultValue="Aether Writer" state="disabled" />
      </Card>

      <Card className="space-y-4 p-4">
        <p className="ds-type-caption font-medium text-ink-muted">Validation and choices</p>
        <TextField label="Email" defaultValue="not-an-email" error="Enter a valid email address." />
        <TextField label="Focused field" defaultValue="The Lantern at Sunset" state="focus" />
        <SelectField label="Document status" defaultValue="first_draft">
          <option value="draft">Draft</option>
          <option value="in_progress">In progress</option>
          <option value="first_draft">First draft</option>
          <option value="revised">Revised</option>
          <option value="final">Final</option>
        </SelectField>
        <TextareaField
          label="Synopsis"
          defaultValue="Evelyn arrives at the coastal watchtower and discovers the abandoned compass."
          hint="Visible in the inspector and the binder."
        />
      </Card>

      <Card className="p-4 lg:col-span-2">
        <p className="ds-type-caption mb-3 font-medium text-ink-muted">Field states</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {[
            { label: 'Default', state: undefined },
            { label: 'Hover', state: 'hover' },
            { label: 'Focus', state: 'focus' },
            { label: 'Error', state: 'error' },
            { label: 'Disabled', state: 'disabled' },
          ].map((item) => (
            <div key={item.label}>
              <span className="ds-type-caption mb-1 block text-ink-faint">{item.label}</span>
              <TextField
                aria-label={item.label}
                defaultValue="Chapter one"
                state={item.state as never}
              />
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function ProjectCard({
  color,
  state,
  title,
}: {
  color: ProjectColorKey;
  state?: 'default' | 'hover' | 'selected' | 'disabled';
  title: string;
}) {
  return (
    <Card className="p-3" state={state}>
      <div className="flex items-start gap-3">
        <span
          className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md"
          style={{
            backgroundColor: projectColorVar(color, 'soft'),
            color: projectColorVar(color, 'foreground'),
          }}
        >
          <IconMd as={FileText} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="ds-type-small truncate font-medium text-ink">{title}</p>
          <p className="ds-type-caption truncate text-ink-faint">Author · 12,480 words</p>
          <div className="mt-2 flex items-center gap-2">
            <ProjectColorChip color={color} />
            <Badge tone="warning">In progress</Badge>
          </div>
        </div>
      </div>
    </Card>
  );
}

function CardsAndNavigation() {
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <ProjectCard color="slate-blue" title="The Lantern at Sunset" />
          <ProjectCard color="sage" state="hover" title="A Field Guide to Quiet" />
          <ProjectCard color="ochre" state="selected" title="The Cartographer's Wife" />
          <ProjectCard color="graphite" state="disabled" title="Archived draft" />
        </div>

        <Card className="p-4">
          <p className="ds-type-caption mb-3 font-medium text-ink-muted">Navigation</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <NavItem active leadingIcon={<IconMd as={FileText} />}>Manuscript</NavItem>
            <NavItem state="hover" leadingIcon={<IconMd as={Folder} />}>Research</NavItem>
            <NavItem state="default" leadingIcon={<IconMd as={Type} />}>Characters</NavItem>
            <NavItem state="disabled" leadingIcon={<IconMd as={FileText} />}>Archived notes</NavItem>
          </div>
        </Card>
      </div>

      <Card className="space-y-3 p-4">
        <p className="ds-type-caption font-medium text-ink-muted">Segmented control</p>
        <Segmented>
          <SegmentedItem active>Flow</SegmentedItem>
          <SegmentedItem>Preview</SegmentedItem>
        </Segmented>
        <div className="ds-divider" />
        <p className="ds-type-caption font-medium text-ink-muted">Binder row</p>
        <div className="space-y-0.5">
          <div className="ds-nav-item" data-state="selected">
            <IconSm as={ChevronDown} className="text-ink-faint" />
            <IconSm as={FileText} />
            <span className="truncate">Chapter 1</span>
          </div>
          <div className="ds-nav-item">
            <span className="w-3.5" />
            <IconSm as={FileText} />
            <span className="truncate">Chapter 2</span>
          </div>
          <div className="ds-nav-item" data-state="active">
            <span className="w-3.5" />
            <IconSm as={FileText} />
            <span className="truncate">Chapter 3</span>
          </div>
        </div>
        <div className="ds-divider" />
        <div className="flex items-center justify-between">
          <span className="ds-type-small text-ink-muted">Words today</span>
          <Badge tone="accent">1,240</Badge>
        </div>
      </Card>
    </div>
  );
}

function ProjectColorGallery() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {PROJECT_COLORS.map((color) => {
        const lightSoft = readScopedCssVariable(`--ds-project-${color.key}-soft`, 'light');
        const lightForeground = readScopedCssVariable(`--ds-project-${color.key}-foreground`, 'light');
        const darkSoft = readScopedCssVariable(`--ds-project-${color.key}-soft`, 'dark');
        const darkForeground = readScopedCssVariable(`--ds-project-${color.key}-foreground`, 'dark');
        const base = readCssVariable(`--ds-project-${color.key}-base`);
        return (
          <Card key={color.key} className="overflow-hidden">
            <div className="h-16" style={{ backgroundColor: base }} />
            <div className="space-y-2 p-3">
              <p className="ds-type-small font-medium text-ink">{color.label}</p>
              <div className="grid grid-cols-3 gap-1.5">
                {[
                  { label: 'Base', value: base },
                  { label: 'Soft L', value: lightSoft },
                  { label: 'Text L', value: lightForeground },
                ].map((item) => (
                  <div key={item.label}>
                    <span
                      className="block h-8 rounded-sm border border-line"
                      style={{ backgroundColor: item.value }}
                    />
                    <span className="ds-type-caption mt-1 block text-ink-faint">{item.label}</span>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-1.5 border-t border-line pt-2">
                {[
                  { label: 'Soft D', value: darkSoft },
                  { label: 'Text D', value: darkForeground },
                ].map((item) => (
                  <div key={item.label}>
                    <span
                      className="block h-6 rounded-sm border border-line"
                      style={{ backgroundColor: item.value }}
                    />
                    <span className="ds-type-caption mt-1 block text-ink-faint">{item.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

function TypographyGallery() {
  const [fontFamily, setFontFamily] = useState<'editor' | 'alt' | 'serif'>('editor');
  const [fontSize, setFontSize] = useState(17);
  const [lineHeight, setLineHeight] = useState(1.7);
  const font = fontFamily === 'alt' ? 'var(--ds-font-editor-alt)' : fontFamily === 'serif' ? 'var(--ds-font-ui)' : 'var(--ds-font-editor)';

  const rows = [
    { name: 'Display', token: '--ds-text-display-size', className: 'ds-type-display', sample: 'A quiet place to write.' },
    { name: 'Title', token: '--ds-text-title-size', className: 'ds-type-title', sample: 'The Lantern at Sunset' },
    { name: 'Heading', token: '--ds-text-heading-size', className: 'ds-type-heading', sample: 'Chapter one' },
    { name: 'Body', token: '--ds-text-body-size', className: 'ds-type-body', sample: 'The tide came in quietly, carrying the last of the day behind it.' },
    { name: 'UI', token: '--ds-text-ui-size', className: 'ds-type-ui', sample: 'Manuscript · 12,480 words · 24 pages' },
    { name: 'Small', token: '--ds-text-small-size', className: 'ds-type-small', sample: 'Saved for everyone' },
    { name: 'Caption', token: '--ds-text-caption-size', className: 'ds-type-caption', sample: 'PAGE SET-UP' },
  ];

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
      <Card className="divide-y divide-line">
        {rows.map((row) => (
          <div key={row.name} className="grid gap-2 p-4 sm:grid-cols-[120px_minmax(0,1fr)]">
            <div>
              <span className="ds-type-caption block font-medium text-ink">{row.name}</span>
              <span className="ds-type-caption font-mono text-ink-faint">
                {readCssVariable(row.token)} · {row.token}
              </span>
            </div>
            <p className={`${row.className} text-ink`}>{row.sample}</p>
          </div>
        ))}
      </Card>

      <Card className="space-y-4 p-4">
        <div>
          <p className="ds-type-caption font-medium text-ink-muted">Editor typography</p>
          <p className="ds-type-caption mt-0.5 text-ink-faint">
            Independent family, size and line-height, exactly as in Preferences.
          </p>
        </div>
        <SelectField
          label="Family"
          value={fontFamily}
          onChange={(event) => setFontFamily(event.target.value as typeof fontFamily)}
        >
          <option value="editor">Literata</option>
          <option value="alt">Source Serif 4</option>
          <option value="serif">Inter</option>
        </SelectField>
        <label className="block">
          <span className="ds-field-label flex items-center justify-between">
            Size <span className="font-mono text-ink-faint">{fontSize}px</span>
          </span>
          <input
            type="range"
            min={12}
            max={28}
            value={fontSize}
            onChange={(event) => setFontSize(Number(event.target.value))}
            className="range w-full"
          />
        </label>
        <label className="block">
          <span className="ds-field-label flex items-center justify-between">
            Line height <span className="font-mono text-ink-faint">{lineHeight.toFixed(2)}</span>
          </span>
          <input
            type="range"
            min={1.2}
            max={2.2}
            step={0.05}
            value={lineHeight}
            onChange={(event) => setLineHeight(Number(event.target.value))}
            className="range w-full"
          />
        </label>
        <div
          className="rounded-md border border-line bg-surface p-3 text-ink"
          style={{ fontFamily: font, fontSize: `${fontSize}px`, lineHeight }}
        >
          The tide came in quietly, carrying the last of the day behind it. Evelyn watched the lantern
          steady itself against the wind.
        </div>
      </Card>
    </div>
  );
}

function OverlaysGallery() {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="overflow-hidden rounded-xl border border-line bg-surface-muted p-4">
        <p className="ds-type-caption mb-3 font-medium text-ink-muted">Modal</p>
        <ModalPanel className="modal-panel mx-auto w-full max-w-[440px]">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <div>
              <p className="ds-type-small font-medium text-ink">New project</p>
              <p className="ds-type-caption text-ink-faint">Start with a quiet, structured workspace.</p>
            </div>
            <IconButton label="Close modal">
              <span className="text-lg leading-none">×</span>
            </IconButton>
          </div>
          <div className="space-y-3 p-4">
            <TextField label="Title" defaultValue="The Lantern at Sunset" />
            <SelectField label="Template" defaultValue="blank">
              <option value="blank">Standard blank project</option>
              <option value="novel">Fantasy novel</option>
              <option value="screenplay">Screenplay</option>
            </SelectField>
          </div>
          <div className="flex justify-end gap-2 border-t border-line px-4 py-3">
            <Button variant="ghost">Cancel</Button>
            <Button variant="primary">Create project</Button>
          </div>
        </ModalPanel>
      </div>

      <div className="overflow-hidden rounded-xl border border-line bg-surface-muted p-4">
        <p className="ds-type-caption mb-3 font-medium text-ink-muted">Dropdown menu</p>
        <MenuPanel className="mx-auto w-60">
          <div className="ds-type-caption px-2 py-1 text-ink-faint">The Lantern at Sunset</div>
          <MenuItem leadingIcon={<IconSm as={FileText} />}>Open</MenuItem>
          <MenuItem leadingIcon={<IconSm as={Folder} />} state="hover">
            Move to folder
          </MenuItem>
          <MenuItem leadingIcon={<IconSm as={Check} />} state="selected">
            Mark as final
          </MenuItem>
          <div className="my-1 h-px bg-line" />
          <MenuItem leadingIcon={<IconSm as={Command} />} disabled>
            Keyboard shortcuts
          </MenuItem>
          <MenuItem danger leadingIcon={<IconSm as={Moon} />}>
            Delete project
          </MenuItem>
        </MenuPanel>
      </div>
    </div>
  );
}

function ContrastSection() {
  const rows = useMemo(
    () =>
      CONTRAST_CHECKS.map((check) => {
        const lightForeground = readScopedCssVariable(check.foreground, 'light');
        const lightBackground = readScopedCssVariable(check.background, 'light');
        const darkForeground = readScopedCssVariable(check.foreground, 'dark');
        const darkBackground = readScopedCssVariable(check.background, 'dark');
        return {
          ...check,
          light: contrastRatio(lightForeground, lightBackground),
          dark: contrastRatio(darkForeground, darkBackground),
          lightForeground,
          lightBackground,
          darkForeground,
          darkBackground,
        };
      }),
    []
  );

  return (
    <Card className="overflow-x-auto">
      <table className="w-full min-w-[680px] border-collapse text-left">
        <thead>
          <tr className="border-b border-line bg-surface-muted">
            <th className="ds-type-caption px-4 py-2 font-medium text-ink-muted">Pair</th>
            <th className="ds-type-caption px-4 py-2 font-medium text-ink-muted">Light</th>
            <th className="ds-type-caption px-4 py-2 font-medium text-ink-muted">Dark</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label} className="border-b border-line last:border-b-0">
              <td className="ds-type-caption px-4 py-2 text-ink">{row.label}</td>
              {[
                { theme: 'light', ratio: row.light, fg: row.lightForeground, bg: row.lightBackground },
                { theme: 'dark', ratio: row.dark, fg: row.darkForeground, bg: row.darkBackground },
              ].map((item) => (
                <td key={item.theme} className="px-4 py-2">
                  <span className="inline-flex items-center gap-2">
                    <span
                      className="ds-type-caption rounded px-1.5 py-0.5 font-mono"
                      style={{ color: item.fg, backgroundColor: item.bg }}
                    >
                      Aa
                    </span>
                    <span className="ds-type-caption font-mono text-ink-muted">
                      {item.ratio === null ? '—' : `${item.ratio.toFixed(2)}:1`}
                    </span>
                    <Badge tone={item.ratio !== null && item.ratio >= 4.5 ? 'success' : 'warning'}>
                      {item.ratio !== null && item.ratio >= 4.5 ? 'AA' : 'Decorative'}
                    </Badge>
                  </span>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function ScaleTable() {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Card className="overflow-hidden">
        <div className="border-b border-line px-4 py-2">
          <h3 className="ds-type-caption font-medium text-ink">Spacing</h3>
        </div>
        <div className="divide-y divide-line">
          {SPACE_TOKENS.map((token) => {
            const value = readCssVariable(token.name);
            return (
              <div key={token.name} className="flex items-center gap-3 px-4 py-2">
                <span className="ds-type-caption w-8 font-mono text-ink-muted">{token.label}</span>
                <span className="h-2 rounded-sm bg-accent" style={{ width: value }} />
                <span className="ds-type-caption ml-auto font-mono text-ink-faint">{value}</span>
              </div>
            );
          })}
        </div>
      </Card>
      <Card className="overflow-hidden">
        <div className="border-b border-line px-4 py-2">
          <h3 className="ds-type-caption font-medium text-ink">Radius</h3>
        </div>
        <div className="divide-y divide-line">
          {RADIUS_TOKENS.map((token) => {
            const value = readCssVariable(token.name);
            return (
              <div key={token.name} className="flex items-center gap-3 px-4 py-2">
                <span className="ds-type-caption w-20 text-ink-muted">{token.label}</span>
                <span className="h-8 w-12 border border-line-strong bg-hover" style={{ borderRadius: value }} />
                <span className="ds-type-caption ml-auto font-mono text-ink-faint">{value}</span>
              </div>
            );
          })}
        </div>
      </Card>
      <Card className="overflow-hidden">
        <div className="border-b border-line px-4 py-2">
          <h3 className="ds-type-caption font-medium text-ink">Type scale</h3>
        </div>
        <div className="divide-y divide-line">
          {TYPOGRAPHY_TOKENS.map((token) => (
            <div key={token.name} className="flex items-center justify-between gap-3 px-4 py-2">
              <span className="ds-type-caption text-ink-muted">{token.label}</span>
              <span className="ds-type-caption font-mono text-ink-faint">{readCssVariable(token.name)}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function ProjectTokenTable() {
  const rows = PROJECT_COLORS.map((color) => ({
    key: color.key,
    label: color.label,
    base: readCssVariable(`--ds-project-${color.key}-base`),
    lightSoft: readScopedCssVariable(`--ds-project-${color.key}-soft`, 'light'),
    lightForeground: readScopedCssVariable(`--ds-project-${color.key}-foreground`, 'light'),
    darkSoft: readScopedCssVariable(`--ds-project-${color.key}-soft`, 'dark'),
    darkForeground: readScopedCssVariable(`--ds-project-${color.key}-foreground`, 'dark'),
  }));

  return (
    <Card className="overflow-x-auto">
      <table className="w-full min-w-[1080px] border-collapse text-left">
        <thead>
          <tr className="border-b border-line bg-surface-muted">
            <th className="ds-type-caption px-4 py-2 font-medium text-ink-muted">Colour</th>
            <th className="ds-type-caption px-4 py-2 font-medium text-ink-muted">Base</th>
            <th className="ds-type-caption px-4 py-2 font-medium text-ink-muted">Light soft</th>
            <th className="ds-type-caption px-4 py-2 font-medium text-ink-muted">Light text</th>
            <th className="ds-type-caption px-4 py-2 font-medium text-ink-muted">Dark soft</th>
            <th className="ds-type-caption px-4 py-2 font-medium text-ink-muted">Dark text</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className="border-b border-line last:border-b-0">
              <td className="ds-type-caption px-4 py-2 text-ink">{row.label}</td>
              <td className="px-4 py-2">
                <Swatch value={row.base} />
              </td>
              <td className="px-4 py-2">
                <Swatch value={row.lightSoft} />
              </td>
              <td className="px-4 py-2">
                <span className="inline-flex items-center gap-2">
                  <span
                    className="ds-type-caption rounded px-1.5 py-0.5 font-mono"
                    style={{ color: row.lightForeground, backgroundColor: row.lightSoft }}
                  >
                    Aa
                  </span>
                  <span className="ds-type-caption font-mono text-ink-faint">{row.lightForeground}</span>
                </span>
              </td>
              <td className="px-4 py-2">
                <Swatch value={row.darkSoft} />
              </td>
              <td className="px-4 py-2">
                <span className="inline-flex items-center gap-2">
                  <span
                    className="ds-type-caption rounded px-1.5 py-0.5 font-mono"
                    style={{ color: row.darkForeground, backgroundColor: row.darkSoft }}
                  >
                    Aa
                  </span>
                  <span className="ds-type-caption font-mono text-ink-faint">{row.darkForeground}</span>
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

export function DesignPlayground() {
  const theme = useUIStore((state) => state.theme);
  const setTheme = useUIStore((state) => state.setTheme);

  return (
    <div className="min-h-screen bg-canvas text-ink">
      <header className="sticky top-0 z-20 border-b border-line bg-canvas/90 backdrop-blur">
        <div className="mx-auto flex max-w-[1240px] flex-wrap items-center justify-between gap-3 px-5 py-3 sm:px-8">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-on-accent">
              <IconMd as={Type} />
            </span>
            <div>
              <p className="ds-type-caption text-ink-faint">Aether Writer · internal</p>
              <h1 className="ds-type-heading leading-tight text-ink">Design System Preview</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <a href="/" className="ds-button ds-button--ghost ds-button--sm">
              Back to app
            </a>
            <Segmented aria-label="Preview theme">
              <SegmentedItem active={theme === 'light'} onClick={() => setTheme('light')}>
                <IconSm as={Sun} /> Light
              </SegmentedItem>
              <SegmentedItem active={theme === 'dark'} onClick={() => setTheme('dark')}>
                <IconSm as={Moon} /> Dark
              </SegmentedItem>
            </Segmented>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1240px] space-y-14 px-5 py-10 sm:px-8">
        <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-3">
            <Badge tone="accent">Quiet Creative Workspace</Badge>
            <h2 className="ds-type-display max-w-[560px] text-ink">
              A calm system for long writing sessions.
            </h2>
            <p className="ds-type-body max-w-[620px] text-ink-muted">
              Graphite &amp; Mineral is the shared visual language of Aether Writer. This page is a
              technical preview: it uses the same tokens and component classes as the application, and
              is intentionally absent from the user navigation.
            </p>
          </div>
          <Card className="p-4">
            <p className="ds-type-caption mb-2 font-medium text-ink-muted">How to use this page</p>
            <ul className="ds-type-small space-y-2 text-ink-muted">
              <li>Toggle the theme in the header, or compare both themes below.</li>
              <li>Tokens are read live from CSS custom properties; hex values update with the theme.</li>
              <li>New screens should compose the shared classes and primitives, not new colours.</li>
            </ul>
          </Card>
        </section>

        <Section
          id="themes"
          title="Light and dark, side by side"
          description="The same components rendered inside separate theme scopes. No component has theme-specific markup."
        >
          <div className="grid gap-4 md:grid-cols-2">
            <ThemeSample theme="light" />
            <ThemeSample theme="dark" />
          </div>
        </Section>

        <Section
          id="colors"
          title="Colour tokens"
          description="Semantic surfaces, text, accent and states. Components read these variables directly."
        >
          <div className="grid gap-4 xl:grid-cols-2">
            {COLOR_TOKEN_GROUPS.map((group) => (
              <TokenTable key={group.title} group={group} />
            ))}
            <TokenTable group={PRINT_TOKEN_GROUP} />
          </div>
        </Section>

        <Section
          id="contrast"
          title="Contrast check"
          description="AA is shown for normal text pairs. Secondary text at #747D79 is kept as a decorative token; UI text uses the darker AA variant."
        >
          <ContrastSection />
        </Section>

        <Section
          id="typography"
          title="Typography"
          description="Inter for the interface, Literata and Source Serif 4 for the manuscript. Editor family, size and line-height stay independent."
        >
          <TypographyGallery />
          <ScaleTable />
        </Section>

        <Section
          id="buttons"
          title="Buttons"
          description="Primary, secondary, ghost and danger actions across default, hover, active, focus and disabled states."
        >
          <ButtonGallery />
        </Section>

        <Section
          id="fields"
          title="Fields"
          description="Shared field shell with labels, hints, validation and the full interaction state set."
        >
          <FieldGallery />
        </Section>

        <Section
          id="cards"
          title="Cards and navigation"
          description="Project cards, binder rows, navigation items and segmented controls."
        >
          <CardsAndNavigation />
        </Section>

        <Section
          id="project-colors"
          title="Project labels"
          description="Eight muted project colours, each with Base, Soft and Foreground. Only the small marker and quiet surfaces use them."
        >
          <ProjectColorGallery />
          <ProjectTokenTable />
        </Section>

        <Section
          id="overlays"
          title="Modals and menus"
          description="The same surfaces and shadows used by Preferences, the project menu and the binder context menu."
        >
          <OverlaysGallery />
        </Section>

        <Section
          id="states"
          title="State gallery"
          description="A compact reference for default, hover, active, selected, focus and disabled states."
        >
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[
              { label: 'Default', state: undefined, text: 'Quiet by default' },
              { label: 'Hover', state: 'hover', text: 'Hover surface' },
              { label: 'Active', state: 'active', text: 'Pressed / active' },
              { label: 'Selected', state: 'selected', text: 'Selected surface' },
              { label: 'Focus', state: 'focus', text: 'Focus ring' },
              { label: 'Disabled', state: 'disabled', text: 'Unavailable' },
            ].map((item) => (
              <Card key={item.label} className="p-4" state={item.state as never}>
                <p className="ds-type-caption text-ink-faint">{item.label}</p>
                <p className="ds-type-small mt-1 text-ink">{item.text}</p>
              </Card>
            ))}
          </div>
        </Section>

        <footer className="border-t border-line pb-6 pt-6">
          <p className="ds-type-caption text-ink-faint">
            Tokens: <span className="font-mono">src/design/tokens.css</span> · Primitives:{' '}
            <span className="font-mono">src/design/components.css</span> · This page:{' '}
            <span className="font-mono">/design-playground.html</span>
          </p>
        </footer>
      </main>
    </div>
  );
}
