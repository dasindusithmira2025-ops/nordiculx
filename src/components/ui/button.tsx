import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { SpinnerIcon } from './icons';

/**
 * Nordic Lux button.
 *
 * Square corners, uppercase micro-label, generous horizontal padding. Colour
 * comes entirely from semantic tokens, so the same button reads correctly on
 * a paper section and inside a dark editorial section without any variant
 * switching at the call site.
 *
 * There is no `asChild` indirection: `Button` renders a <button>, `ButtonLink`
 * renders a <Link>. Two exports beat a polymorphic component nobody can type.
 */

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'quiet';
export type ButtonSize = 'sm' | 'md' | 'lg';

const base = [
  'relative inline-flex items-center justify-center gap-2 rounded-none',
  'font-medium uppercase tracking-eyebrow whitespace-nowrap',
  'transition-[background-color,color,border-color,opacity] duration-standard ease-standard',
  'disabled:pointer-events-none disabled:opacity-40',
  'aria-disabled:pointer-events-none aria-disabled:opacity-40',
].join(' ');

const variants: Record<ButtonVariant, string> = {
  // Inverted block. The primary commerce action.
  primary: 'bg-accent text-accent-fg hover:bg-fg hover:text-surface',
  // Hairline outline that fills on hover.
  secondary:
    'border border-line-strong text-fg hover:bg-fg hover:text-surface hover:border-fg',
  // No chrome until hover — used inside dense UI and toolbars.
  ghost: 'text-fg hover:bg-accent-soft',
  // Text-only affordance with the house underline behaviour.
  quiet: 'text-fg link-underline px-0! h-auto! py-1!',
};

const sizes: Record<ButtonSize, string> = {
  sm: 'h-10 px-5 text-2xs',
  md: 'h-12 px-7 text-2xs',
  lg: 'h-14 px-9 text-xs',
};

export function buttonStyles({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  className,
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  className?: string;
} = {}) {
  return cn(
    base,
    variants[variant],
    sizes[size],
    fullWidth && 'w-full',
    className,
  );
}

type ButtonProps = ComponentProps<'button'> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  /** Shows a spinner and blocks interaction. Keeps the label for stable width. */
  loading?: boolean;
  loadingLabel?: string;
};

export function Button({
  variant,
  size,
  fullWidth,
  loading = false,
  loadingLabel = 'Working',
  className,
  children,
  disabled,
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      // `aria-busy` tells assistive tech the control is working; the label is
      // kept mounted (visually hidden) so the accessible name never vanishes.
      aria-busy={loading || undefined}
      disabled={disabled || loading}
      className={buttonStyles({ variant, size, fullWidth, className })}
      {...props}
    >
      {loading ? (
        <>
          {/* Keeps the button's width identical while busy. */}
          <span aria-hidden className="opacity-0">
            {children}
          </span>
          <span className="absolute inset-0 flex items-center justify-center">
            <SpinnerIcon width={16} height={16} />
          </span>
          <span className="sr-only">{loadingLabel}</span>
        </>
      ) : (
        children
      )}
    </button>
  );
}

type ButtonLinkProps = ComponentProps<typeof Link> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  children?: ReactNode;
};

export function ButtonLink({
  variant,
  size,
  fullWidth,
  className,
  ...props
}: ButtonLinkProps) {
  return (
    <Link
      className={buttonStyles({ variant, size, fullWidth, className })}
      {...props}
    />
  );
}

/**
 * Square icon-only control (header actions, gallery arrows, close buttons).
 * `label` is required — an icon button with no accessible name is a defect.
 */
export function IconButton({
  label,
  size = 'md',
  variant = 'ghost',
  className,
  children,
  type = 'button',
  ...props
}: ComponentProps<'button'> & {
  label: string;
  size?: ButtonSize;
  variant?: ButtonVariant;
}) {
  const box = size === 'sm' ? 'size-9' : size === 'lg' ? 'size-12' : 'size-11';
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex items-center justify-center rounded-none',
        'duration-micro ease-standard transition-colors',
        variant === 'ghost' && 'text-fg hover:bg-accent-soft',
        variant === 'secondary' &&
          'border-line-strong text-fg hover:bg-accent-soft border',
        variant === 'primary' &&
          'bg-accent text-accent-fg hover:bg-fg hover:text-surface',
        'disabled:pointer-events-none disabled:opacity-40',
        box,
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
