/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  Ref,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';
import {
  PROJECT_COLORS,
  PROJECT_COLOR_LABELS,
  normalizeProjectColor,
  projectColorVar,
} from './tokens';
import type { ProjectColorKey } from './tokens';

type ComponentState = 'default' | 'hover' | 'active' | 'selected' | 'focus' | 'disabled';

function stateAttribute(state: ComponentState | undefined): string | undefined {
  return state && state !== 'default' ? state : undefined;
}

function classes(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ');
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  state?: ComponentState;
  leadingIcon?: ReactNode;
}

export function Button({
  variant = 'secondary',
  size = 'md',
  state,
  leadingIcon,
  className,
  children,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      type="button"
      {...props}
      disabled={disabled || state === 'disabled'}
      data-state={stateAttribute(state)}
      className={classes(
        'ds-button',
        `ds-button--${variant}`,
        size !== 'md' && `ds-button--${size}`,
        className
      )}
    >
      {leadingIcon}
      {children}
    </button>
  );
}

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  state?: ComponentState;
  size?: 'sm' | 'md' | 'lg';
}

export function IconButton({ label, state, size = 'md', className, children, ...props }: IconButtonProps) {
  return (
    <button
      type="button"
      {...props}
      aria-label={label}
      title={props.title ?? label}
      disabled={props.disabled || state === 'disabled'}
      data-state={stateAttribute(state)}
      className={classes('ds-icon-button', size !== 'md' && `ds-icon-button--${size}`, className)}
    >
      {children}
    </button>
  );
}

interface FieldShellProps {
  id?: string;
  label?: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}

function FieldShell({ id, label, hint, error, children }: FieldShellProps) {
  return (
    <div>
      {label && (
        <label className="ds-field-label" htmlFor={id}>
          {label}
        </label>
      )}
      {children}
      {error ? (
        <p className="ds-field-error" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="ds-field-hint">{hint}</p>
      ) : null}
    </div>
  );
}

export interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
  state?: ComponentState;
}

export function TextField({
  label,
  hint,
  error,
  state,
  className,
  id,
  ...props
}: TextFieldProps) {
  return (
    <FieldShell id={id} label={label} hint={hint} error={error}>
      <input
        id={id}
        {...props}
        disabled={props.disabled || state === 'disabled'}
        data-state={error ? 'error' : stateAttribute(state)}
        className={classes('ds-field', className)}
      />
    </FieldShell>
  );
}

export interface TextareaFieldProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  hint?: string;
  error?: string;
  state?: ComponentState;
}

export function TextareaField({
  label,
  hint,
  error,
  state,
  className,
  id,
  ...props
}: TextareaFieldProps) {
  return (
    <FieldShell id={id} label={label} hint={hint} error={error}>
      <textarea
        id={id}
        {...props}
        disabled={props.disabled || state === 'disabled'}
        data-state={error ? 'error' : stateAttribute(state)}
        className={classes('ds-field ds-field--textarea', className)}
      />
    </FieldShell>
  );
}

export interface SelectFieldProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  hint?: string;
  error?: string;
  state?: ComponentState;
}

export function SelectField({
  label,
  hint,
  error,
  state,
  className,
  id,
  children,
  ...props
}: SelectFieldProps) {
  return (
    <FieldShell id={id} label={label} hint={hint} error={error}>
      <select
        id={id}
        {...props}
        disabled={props.disabled || state === 'disabled'}
        data-state={error ? 'error' : stateAttribute(state)}
        className={classes('ds-field', className)}
      >
        {children}
      </select>
    </FieldShell>
  );
}

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  state?: ComponentState;
  muted?: boolean;
}

export function Card({ state, muted, className, ...props }: CardProps) {
  return (
    <div
      {...props}
      data-state={stateAttribute(state)}
      className={classes('ds-card', muted && 'ds-card--muted', className)}
    />
  );
}

export function MenuPanel({ className, ...props }: HTMLAttributes<HTMLDivElement> & { ref?: Ref<HTMLDivElement> }) {
  return <div {...props} role="menu" className={classes('ds-menu', className)} />;
}

export interface MenuItemProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  state?: ComponentState;
  danger?: boolean;
  leadingIcon?: ReactNode;
}

export function MenuItem({
  state,
  danger,
  leadingIcon,
  className,
  children,
  ...props
}: MenuItemProps) {
  return (
    <button
      type="button"
      {...props}
      role="menuitem"
      data-state={stateAttribute(state)}
      className={classes(
        'ds-menu-item',
        danger && 'ds-menu-item--danger',
        className
      )}
    >
      {leadingIcon}
      {children}
    </button>
  );
}

export function ModalPanel({ className, ...props }: HTMLAttributes<HTMLDivElement> & { ref?: Ref<HTMLDivElement> }) {
  return <div {...props} role="dialog" aria-modal="true" className={classes('ds-modal', className)} />;
}

export interface NavItemProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  state?: ComponentState;
  leadingIcon?: ReactNode;
  trailing?: ReactNode;
  active?: boolean;
}

export function NavItem({
  state,
  leadingIcon,
  trailing,
  active,
  className,
  children,
  ...props
}: NavItemProps) {
  return (
    <button
      type="button"
      {...props}
      data-state={active ? 'selected' : stateAttribute(state)}
      aria-current={active ? 'page' : undefined}
      className={classes('ds-nav-item', className)}
    >
      {leadingIcon}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {trailing}
    </button>
  );
}

export function Segmented({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div {...props} role="group" className={classes('ds-segmented', className)} />;
}

export function SegmentedItem({
  active,
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      type="button"
      {...props}
      aria-pressed={active}
      data-state={active ? 'selected' : undefined}
      className={classes('ds-segmented__item', className)}
    >
      {children}
    </button>
  );
}

export function Badge({
  tone = 'neutral',
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: 'neutral' | 'accent' | 'warning' | 'danger' | 'success' }) {
  return <span {...props} className={classes('ds-badge', `ds-badge--${tone}`, className)} />;
}

export function ProjectColorChip({
  color,
  className,
}: {
  color: ProjectColorKey | string;
  className?: string;
}) {
  const key = normalizeProjectColor(color) ?? 'graphite';
  return (
    <span
      className={classes('ds-project-chip', className)}
      style={{
        backgroundColor: projectColorVar(key, 'soft'),
        color: projectColorVar(key, 'foreground'),
      }}
    >
      <span className="ds-swatch" style={{ backgroundColor: projectColorVar(key, 'base') }} aria-hidden="true" />
      {PROJECT_COLOR_LABELS[key]}
    </span>
  );
}

export function ProjectColorSwatch({ color }: { color: ProjectColorKey }) {
  return (
    <span
      className="ds-swatch"
      style={{ backgroundColor: projectColorVar(color, 'base') }}
      aria-hidden="true"
    />
  );
}

export { PROJECT_COLORS };
export { Icon, IconXs, IconSm, IconMd, IconLg, IconXl, type IconSize } from './Icon';
