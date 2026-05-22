/**
 * Button — AI Cinematic Studio design system
 * Matches the mockup: Export (sm primary), Generate Film (lg primary),
 * toolbar actions (ghost/secondary).
 */
import { forwardRef } from 'react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
export type ButtonSize    = 'xs' | 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?:   ButtonVariant;
  size?:      ButtonSize;
  loading?:   boolean;
  iconLeft?:  ReactNode;
  iconRight?: ReactNode;
  fullWidth?: boolean;
}

const VARIANT: Record<ButtonVariant, string> = {
  primary:
    'bg-[var(--cs-primary)] hover:bg-[var(--cs-primary-hover)] text-white ' +
    'shadow-[var(--cs-shadow-primary)] border border-transparent',
  secondary:
    'bg-[var(--cs-bg-elevated)] hover:bg-[var(--cs-bg-hover)] text-white ' +
    'border border-[var(--cs-border)]',
  ghost:
    'bg-transparent hover:bg-[var(--cs-bg-hover)] ' +
    'text-[var(--cs-text-secondary)] hover:text-white border border-transparent',
  danger:
    'bg-[var(--cs-error-dim,rgba(239,68,68,0.15))] hover:bg-red-600/25 ' +
    'text-red-400 hover:text-red-300 border border-red-500/30',
  success:
    'bg-[var(--cs-success-dim,rgba(16,185,129,0.15))] hover:bg-emerald-600/25 ' +
    'text-emerald-400 hover:text-emerald-300 border border-emerald-500/30',
};

const SIZE: Record<ButtonSize, string> = {
  xs: 'h-6  px-2   text-[10px] gap-1   rounded-[var(--cs-radius-xs)]',
  sm: 'h-7  px-3   text-[11px] gap-1.5 rounded-[var(--cs-radius-sm)]',
  md: 'h-8  px-3.5 text-xs     gap-2   rounded-[var(--cs-radius-sm)]',
  lg: 'h-10 px-5   text-sm     gap-2   rounded-[var(--cs-radius-md)]',
};

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'secondary',
      size = 'md',
      loading = false,
      iconLeft,
      iconRight,
      fullWidth = false,
      disabled,
      className = '',
      children,
      ...rest
    },
    ref,
  ) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={[
          'inline-flex items-center justify-center font-semibold',
          'transition-all duration-[var(--cs-duration-fast)]',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cs-primary)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--cs-canvas)]',
          'active:scale-[0.97]',
          'disabled:opacity-40 disabled:pointer-events-none',
          'select-none',
          VARIANT[variant],
          SIZE[size],
          fullWidth ? 'w-full' : '',
          className,
        ].join(' ')}
        {...rest}
      >
        {loading ? (
          <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
        ) : iconLeft}
        {children && <span className="truncate">{children}</span>}
        {!loading && iconRight}
      </button>
    );
  },
);
Button.displayName = 'Button';
export default Button;
