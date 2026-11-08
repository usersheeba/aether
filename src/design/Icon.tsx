/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Unified icon wrapper. Enforces consistent stroke width and sizing
 * across the entire application. All Lucide icons should go through this.
 */

import type { ComponentType, SVGProps } from 'react';

/** Standard icon sizes mapped to semantic roles. */
export type IconSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

const SIZE_MAP: Record<IconSize, string> = {
  xs: 'w-3 h-3',      // 12px — inline with caption text
  sm: 'w-3.5 h-3.5',  // 14px — toolbar buttons, menu items, nav items
  md: 'w-4 h-4',      // 16px — default UI icons
  lg: 'w-5 h-5',      // 20px — primary toolbar, large actions
  xl: 'w-7 h-7',      // 28px — empty states, hero illustrations
};

/**
 * Standard stroke width for all icons. Matches the visual weight of
 * Inter font-weight: 400 at 13px (--ds-text-ui-size).
 */
const STROKE_WIDTH = 1.5;

interface IconProps extends SVGProps<SVGSVGElement> {
  /** Semantic size token. Defaults to 'md' (16px). */
  size?: IconSize;
  /** Override stroke width (rarely needed). */
  strokeWidth?: number;
  /** Additional className. */
  className?: string;
}

/**
 * Wrapper that applies consistent stroke-width and sizing to any Lucide icon.
 * Usage: <Icon as={FileText} size="sm" />
 */
export function Icon({
  as: Component,
  size = 'md',
  strokeWidth = STROKE_WIDTH,
  className,
  ...props
}: IconProps & { as: ComponentType<SVGProps<SVGSVGElement>> }) {
  return (
    <Component
      className={`${SIZE_MAP[size]} ${className ?? ''}`}
      strokeWidth={strokeWidth}
      {...props}
    />
  );
}

/**
 * Convenience re-exports for common sizes to avoid importing the type.
 */
export const IconXs = ({ as: Component, ...props }: Omit<IconProps, 'size'> & { as: ComponentType<SVGProps<SVGSVGElement>> }) =>
  <Icon as={Component} size="xs" {...props} />;

export const IconSm = ({ as: Component, ...props }: Omit<IconProps, 'size'> & { as: ComponentType<SVGProps<SVGSVGElement>> }) =>
  <Icon as={Component} size="sm" {...props} />;

export const IconMd = ({ as: Component, ...props }: Omit<IconProps, 'size'> & { as: ComponentType<SVGProps<SVGSVGElement>> }) =>
  <Icon as={Component} size="md" {...props} />;

export const IconLg = ({ as: Component, ...props }: Omit<IconProps, 'size'> & { as: ComponentType<SVGProps<SVGSVGElement>> }) =>
  <Icon as={Component} size="lg" {...props} />;

export const IconXl = ({ as: Component, ...props }: Omit<IconProps, 'size'> & { as: ComponentType<SVGProps<SVGSVGElement>> }) =>
  <Icon as={Component} size="xl" {...props} />;