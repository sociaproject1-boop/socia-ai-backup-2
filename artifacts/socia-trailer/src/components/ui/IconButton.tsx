/**
 * IconButton — square/circle icon-only button.
 * Used in toolbars, player controls, close buttons.
 */
import { forwardRef } from 'react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

export type IconButtonVariant = 'ghost' | 'secondary' | 'primary' | 'danger';
export type IconButtonSize    = 'xs' | 'sm' | 'md' | 'lg';

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: IconButtonVariant;
  size?:    IconButtonSize;
  rounded?: boolean; /* pill/circle shape */
  label:    string;  /* required for a11y */
  children: ReactNode;
}

const VARIANT: Record<IconButtonVariant, string> = {
  ghost:
    'bg-transparent hover:bg-[var(--cs-bg-hover)] ' +
    'text-[var(--cs-text-secondary)] hover:text-white',
  secondary:
    'bg-[var(--cs-bg-elevated)] hover:bg-[var(--cs-bg-hover)] ' +
    'text-[var(--cs-text-secondary)] hover:text-white border border-[var(--cs-border)]',
  primary:
    'bg-[var(--cs-primary)] hover:bg-[var(--cs-primary-hover)] text-white',
  danger:
    'bg-transparent hover:bg-red-600/20 text-red-400 hover:text-red-300',
};

const SIZE: Record<IconButtonSize, string> = {
  xs: 'w-6  h-6  [&_svg]:w-3   [&_svg]:h-3',
  sm: 'w-7  h-7  [&_svg]:w-3.5 [&_svg]:h-3.5',
  md: 'w-8  h-8  [&_svg]:w-4   [&_svg]:h-4',
  lg: 'w-10 h-10 [&_svg]:w-5   [&_svg]:h-5',
};

const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ variant = 'ghost', size = 'md', rounded = false, label, children, className = '', ...rest }, ref) => (
    <button
      ref={ref}
      aria-label={label}
      title={label}
      className={[
        'inline-flex items-center justify-center shrink-0',
        'transition-all duration-[var(--cs-duration-fast)]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cs-primary)]',
        'active:scale-[0.94] disabled:opacity-40 disabled:pointer-events-none select-none',
        rounded ? 'rounded-full' : 'rounded-[var(--cs-radius-sm)]',
        VARIANT[variant],
        SIZE[size],
        className,
      ].join(' ')}
      {...rest}
    >
      {children}
    </button>
  ),
);
IconButton.displayName = 'IconButton';
export default IconButton;
