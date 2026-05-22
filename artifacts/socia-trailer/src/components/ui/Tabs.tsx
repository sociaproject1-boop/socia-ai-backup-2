/**
 * Tabs — Settings / Presets tab bar matching the right panel in the mockup.
 */
import type { ReactNode } from 'react';

export interface Tab {
  id:    string;
  label: string;
  icon?: ReactNode;
}

interface TabsProps {
  tabs:     Tab[];
  active:   string;
  onChange: (id: string) => void;
  variant?: 'underline' | 'pill' | 'segment';
  size?:    'sm' | 'md';
  className?: string;
}

export default function Tabs({
  tabs,
  active,
  onChange,
  variant = 'segment',
  size = 'sm',
  className = '',
}: TabsProps) {
  if (variant === 'segment') {
    return (
      <div
        className={[
          'flex items-center gap-0.5 p-0.5',
          'bg-[var(--cs-bg)] border border-[var(--cs-border-faint)] rounded-[var(--cs-radius-sm)]',
          className,
        ].join(' ')}
        role="tablist"
      >
        {tabs.map((t) => {
          const isActive = t.id === active;
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={isActive}
              onClick={() => onChange(t.id)}
              className={[
                'flex-1 inline-flex items-center justify-center gap-1.5 transition-all',
                'duration-[var(--cs-duration-fast)] focus-visible:outline-none rounded-[5px]',
                size === 'sm' ? 'h-6 text-[11px] px-2' : 'h-7 text-xs px-3',
                isActive
                  ? 'bg-[var(--cs-bg-elevated)] text-white font-semibold shadow-[var(--cs-shadow-sm)]'
                  : 'text-[var(--cs-text-muted)] hover:text-[var(--cs-text-secondary)]',
              ].join(' ')}
            >
              {t.icon}
              {t.label}
            </button>
          );
        })}
      </div>
    );
  }

  if (variant === 'underline') {
    return (
      <div
        className={['flex gap-4 border-b border-[var(--cs-border-faint)]', className].join(' ')}
        role="tablist"
      >
        {tabs.map((t) => {
          const isActive = t.id === active;
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={isActive}
              onClick={() => onChange(t.id)}
              className={[
                'pb-2 text-xs font-semibold transition-colors focus-visible:outline-none',
                'border-b-2 -mb-px',
                isActive
                  ? 'text-white border-[var(--cs-primary)]'
                  : 'text-[var(--cs-text-muted)] border-transparent hover:text-[var(--cs-text-secondary)]',
              ].join(' ')}
            >
              {t.label}
            </button>
          );
        })}
      </div>
    );
  }

  // pill
  return (
    <div className={['flex items-center gap-1', className].join(' ')} role="tablist">
      {tabs.map((t) => {
        const isActive = t.id === active;
        return (
          <button
            key={t.id}
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(t.id)}
            className={[
              'inline-flex items-center gap-1.5 px-3 rounded-full font-semibold transition-all',
              size === 'sm' ? 'h-6 text-[11px]' : 'h-7 text-xs',
              isActive
                ? 'bg-[var(--cs-primary)] text-white'
                : 'text-[var(--cs-text-muted)] hover:bg-[var(--cs-bg-hover)] hover:text-[var(--cs-text-secondary)]',
            ].join(' ')}
          >
            {t.icon}
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
