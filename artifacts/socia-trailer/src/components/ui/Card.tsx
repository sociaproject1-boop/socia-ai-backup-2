/**
 * Card — dark elevated surface matching the studio panels.
 * Variants match different panel types in the mockup.
 */
import type { HTMLAttributes, ReactNode } from 'react';

export type CardVariant = 'default' | 'elevated' | 'inset' | 'glass' | 'active';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?:    CardVariant;
  padding?:    'none' | 'sm' | 'md' | 'lg';
  noBorder?:   boolean;
  children:    ReactNode;
}

const VARIANT: Record<CardVariant, string> = {
  default:
    'bg-[var(--cs-bg-elevated)] border border-[var(--cs-border)]',
  elevated:
    'bg-[var(--cs-bg-elevated)] border border-[var(--cs-border-medium)] shadow-[var(--cs-shadow-md)]',
  inset:
    'bg-[var(--cs-bg)] border border-[var(--cs-border-faint)]',
  glass:
    'cs-glass',
  active:
    'bg-[var(--cs-primary-dim)] border border-[var(--cs-primary)]/40',
};

const PADDING: Record<'none' | 'sm' | 'md' | 'lg', string> = {
  none: 'p-0',
  sm:   'p-2.5',
  md:   'p-4',
  lg:   'p-5',
};

export default function Card({
  variant = 'default',
  padding = 'md',
  noBorder = false,
  children,
  className = '',
  ...rest
}: CardProps) {
  return (
    <div
      className={[
        'rounded-[var(--cs-radius-md)]',
        VARIANT[variant],
        PADDING[padding],
        noBorder ? 'border-0' : '',
        className,
      ].join(' ')}
      {...rest}
    >
      {children}
    </div>
  );
}

/** Convenience sub-component for card sections */
export function CardHeader({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`flex items-center justify-between mb-3 ${className}`}>
      {children}
    </div>
  );
}

export function CardTitle({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <p className={`text-[10.5px] font-semibold uppercase tracking-[0.08em] text-[var(--cs-text-muted)] ${className}`}>
      {children}
    </p>
  );
}

export function CardDivider({ className = '' }: { className?: string }) {
  return <div className={`h-px bg-[var(--cs-border-faint)] my-3 ${className}`} />;
}
