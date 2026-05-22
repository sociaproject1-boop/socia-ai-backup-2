/**
 * Modal — centered overlay dialog with scrim.
 * Used for confirmations, media upload, etc.
 */
import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import IconButton from './IconButton';

interface ModalProps {
  open:       boolean;
  onClose:    () => void;
  title?:     string;
  size?:      'sm' | 'md' | 'lg';
  children:   ReactNode;
  className?: string;
}

const SIZE: Record<string, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
};

export default function Modal({
  open,
  onClose,
  title,
  size = 'md',
  children,
  className = '',
}: ModalProps) {
  // ESC to close
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center p-4"
      style={{ background: 'var(--cs-bg-overlay)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className={[
          'relative w-full rounded-[var(--cs-radius-xl)]',
          'bg-[var(--cs-bg-elevated)] border border-[var(--cs-border-medium)]',
          'shadow-[var(--cs-shadow-lg)]',
          SIZE[size],
          className,
        ].join(' ')}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        {title && (
          <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-[var(--cs-border-faint)]">
            <h2 className="text-[14px] font-semibold text-white font-[var(--font-display)]">{title}</h2>
            <IconButton label="Close" size="sm" onClick={onClose}>
              <X />
            </IconButton>
          </div>
        )}
        <div className="p-5">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
