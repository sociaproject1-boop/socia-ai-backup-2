/**
 * Badge — small label chips.
 * Used for quality presets (Standard, 1080P), status (Recommended), credits.
 */
import type { ReactNode } from 'react';

export type BadgeVariant = 'default' | 'primary' | 'success' | 'warning' | 'error' | 'accent' | 'outline';

interface BadgeProps {
  variant?:  BadgeVariant;
  size?:     'xs' | 'sm';
  dot?:      boolean;
  children:  ReactNode;
  className?: string;
}

const VARIANT: Record<BadgeVariant, string> = {
  default:
    'bg-[var(--cs-bg-elevated)] border border-[var(--cs-border)] text-[var(--cs-text-secondary)]',
  primary:
    'bg-[var(--cs-primary-dim)] border border-[var(--cs-primary)]/40 text-purple-300',
  success:
    'bg-[var(--cs-success-dim)] border border-[var(--cs-success)]/40 text-emerald-300',
  warning:
    'bg-[var(--cs-warning-dim)] border border-[var(--cs-warning)]/40 text-amber-300',
  error:
    'bg-[var(--cs-error-dim)] border border-[var(--cs-error)]/40 text-red-300',
  accent:
    'bg-[var(--cs-accent-dim)] border border-[var(--cs-accent)]/40 text-cyan-300',
  outline:
    'bg-transparent border border-[var(--cs-border-medium)] text-[var(--cs-text-secondary)]',
};

const SIZE = {
  xs: 'h-4   px-1.5 text-[9px]  gap-1   rounded-[4px]',
  sm: 'h-5   px-2   text-[10px] gap-1.5 rounded-[var(--cs-radius-xs)]',
};

export default function Badge({
  variant = 'default',
  size = 'sm',
  dot = false,
  children,
  className = '',
}: BadgeProps) {
  return (
    <span
      className={[
        'inline-flex items-center font-semibold select-none',
        VARIANT[variant],
        SIZE[size],
        className,
      ].join(' ')}
    >
      {dot && (
        <span className="w-1.5 h-1.5 rounded-full bg-current shrink-0" />
      )}
      {children}
    </span>
  );
}

/** Credits badge matching the mockup's ⚡ 3,245 Credits display */
export function CreditsBadge({ credits, className = '' }: { credits: number; className?: string }) {
  return (
    <span
      className={[
        'inline-flex items-center gap-1 h-7 px-3 rounded-[var(--cs-radius-sm)]',
        'bg-[var(--cs-bg-elevated)] border border-[var(--cs-border)]',
        'text-[11px] font-semibold text-[var(--cs-text-secondary)]',
        className,
      ].join(' ')}
    >
      <span className="text-amber-400">⚡</span>
      {credits.toLocaleString()} Credits
    </span>
  );
}
