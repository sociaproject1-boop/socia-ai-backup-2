/**
 * EmptyState — illustrated placeholder for empty lists, drop zones, etc.
 */
import type { ReactNode } from 'react';

interface EmptyStateProps {
  icon?:       ReactNode;
  title:       string;
  description?: string;
  action?:     ReactNode;
  className?:  string;
}

export default function EmptyState({
  icon,
  title,
  description,
  action,
  className = '',
}: EmptyStateProps) {
  return (
    <div
      className={[
        'flex flex-col items-center justify-center gap-3 py-10 px-6 text-center',
        className,
      ].join(' ')}
    >
      {icon && (
        <div className="text-[var(--cs-text-muted)] opacity-50 [&_svg]:w-10 [&_svg]:h-10">
          {icon}
        </div>
      )}
      <div className="space-y-1">
        <p className="text-[13px] font-semibold text-[var(--cs-text-secondary)]">{title}</p>
        {description && (
          <p className="text-[11.5px] text-[var(--cs-text-muted)] leading-relaxed max-w-[220px]">
            {description}
          </p>
        )}
      </div>
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}

/** Drop zone variant — dashed border, accepts file drops */
export function DropZone({
  onDrop,
  accept,
  children,
  active = false,
  className = '',
}: {
  onDrop?:   (files: FileList) => void;
  accept?:   string;
  children?: ReactNode;
  active?:   boolean;
  className?: string;
}) {
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (onDrop && e.dataTransfer.files.length) onDrop(e.dataTransfer.files);
  };
  return (
    <div
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
      className={[
        'flex flex-col items-center justify-center rounded-[var(--cs-radius-lg)]',
        'border-2 border-dashed transition-all duration-[var(--cs-duration-fast)]',
        'cursor-pointer select-none py-8 px-6',
        active
          ? 'border-[var(--cs-primary)] bg-[var(--cs-primary-dim)]'
          : 'border-[var(--cs-border-medium)] hover:border-[var(--cs-border-strong)] hover:bg-[var(--cs-bg-hover)]',
        className,
      ].join(' ')}
    >
      {children}
      {accept && (
        <p className="mt-2 text-[10px] text-[var(--cs-text-disabled)]">{accept}</p>
      )}
    </div>
  );
}
