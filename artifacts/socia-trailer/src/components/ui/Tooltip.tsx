/**
 * Tooltip — lightweight title-based tooltip wrapper.
 * No heavy JS library — uses CSS :hover + position:absolute.
 */
import type { ReactNode } from 'react';

interface TooltipProps {
  content:   string;
  children:  ReactNode;
  side?:     'top' | 'bottom' | 'left' | 'right';
  className?: string;
}

const SIDE_CLASSES: Record<string, string> = {
  top:    'bottom-full left-1/2 -translate-x-1/2 mb-1.5',
  bottom: 'top-full  left-1/2 -translate-x-1/2 mt-1.5',
  left:   'right-full top-1/2 -translate-y-1/2 mr-1.5',
  right:  'left-full  top-1/2 -translate-y-1/2 ml-1.5',
};

export default function Tooltip({
  content,
  children,
  side = 'top',
  className = '',
}: TooltipProps) {
  return (
    <span className={['relative inline-flex group', className].join(' ')}>
      {children}
      <span
        role="tooltip"
        className={[
          'absolute z-50 pointer-events-none',
          'px-2 py-1 rounded-[var(--cs-radius-xs)]',
          'bg-[#1c1c33] border border-[var(--cs-border-medium)]',
          'text-[10.5px] font-medium text-white whitespace-nowrap',
          'shadow-[var(--cs-shadow-md)]',
          'opacity-0 group-hover:opacity-100',
          'transition-opacity duration-[var(--cs-duration-fast)]',
          SIDE_CLASSES[side] ?? SIDE_CLASSES.top,
        ].join(' ')}
      >
        {content}
      </span>
    </span>
  );
}
