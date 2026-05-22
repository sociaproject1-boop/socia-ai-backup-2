/**
 * Drawer — slide-in panel from right or bottom.
 * Used for Settings drawer and mobile bottom-sheet.
 */
import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import IconButton from './IconButton';

interface DrawerProps {
  open:       boolean;
  onClose:    () => void;
  title?:     string;
  side?:      'right' | 'bottom';
  width?:     number; /* px, for side=right only */
  children:   ReactNode;
  className?: string;
}

export default function Drawer({
  open,
  onClose,
  title,
  side = 'right',
  width = 300,
  children,
  className = '',
}: DrawerProps) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (typeof document === 'undefined') return null;

  const isRight  = side === 'right';
  const isBottom = side === 'bottom';

  return createPortal(
    <>
      {/* Scrim */}
      <div
        className={[
          'fixed inset-0 z-[200] transition-opacity duration-[var(--cs-duration)]',
          open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none',
        ].join(' ')}
        style={{ background: 'var(--cs-bg-overlay)' }}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className={[
          'fixed z-[210]',
          'bg-[var(--cs-bg-elevated)] border-[var(--cs-border-medium)]',
          'flex flex-col overflow-hidden',
          'transition-transform duration-[var(--cs-duration-slow)] ease-[var(--cs-ease)]',
          'will-change-transform',
          isRight  ? 'top-0 right-0 h-full border-l rounded-l-[var(--cs-radius-lg)]' : '',
          isBottom ? 'bottom-0 left-0 right-0 max-h-[85dvh] border-t rounded-t-[var(--cs-radius-xl)]' : '',
          isRight  && (open ? 'translate-x-0' : 'translate-x-full'),
          isBottom && (open ? 'translate-y-0' : 'translate-y-full'),
          className,
        ].join(' ')}
        style={isRight ? { width } : undefined}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        {/* Grabber (bottom drawer only) */}
        {isBottom && (
          <div className="flex justify-center py-3 shrink-0">
            <div className="w-10 h-1 rounded-full bg-white/15" />
          </div>
        )}

        {/* Header */}
        {title && (
          <div className="flex items-center justify-between px-4 py-3 shrink-0 border-b border-[var(--cs-border-faint)]">
            <h3 className="text-[13px] font-semibold text-white font-[var(--font-display)]">{title}</h3>
            <IconButton label="Close" size="sm" onClick={onClose}>
              <X />
            </IconButton>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">{children}</div>
      </div>
    </>,
    document.body,
  );
}
