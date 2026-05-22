/**
 * TimelineItem — scene thumbnail card in the bottom strip.
 * Matches the numbered scene cards with duration overlays from the mockup.
 */
import type { ReactNode } from 'react';

interface TimelineItemProps {
  index:       number;        /* 1-based scene number */
  duration?:   string;        /* e.g. "5.2s", "4.8s" */
  thumbnail?:  string;        /* background image URL */
  active?:     boolean;
  loading?:    boolean;
  onClick?:    () => void;
  onMenu?:     () => void;
  className?:  string;
  style?:      React.CSSProperties;
  children?:   ReactNode;     /* optional icon/overlay content */
}

export default function TimelineItem({
  index,
  duration,
  thumbnail,
  active = false,
  loading = false,
  onClick,
  className = '',
  style,
  children,
}: TimelineItemProps) {
  return (
    <button
      onClick={onClick}
      style={style}
      className={[
        'relative shrink-0 w-[72px] h-[52px] rounded-[var(--cs-radius-sm)] overflow-hidden',
        'border transition-all duration-[var(--cs-duration-fast)]',
        'group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cs-primary)]',
        active
          ? 'border-[var(--cs-primary)] shadow-[0_0_0_2px_var(--cs-primary-glow)]'
          : 'border-[var(--cs-border)] hover:border-[var(--cs-border-medium)]',
        onClick ? 'cursor-pointer' : 'cursor-default',
        className,
      ].join(' ')}
      aria-label={`Scene ${index}`}
      aria-current={active ? 'true' : undefined}
    >
      {/* Thumbnail / shimmer background */}
      {loading ? (
        <div className="absolute inset-0 cs-shimmer" />
      ) : thumbnail ? (
        <img
          src={thumbnail}
          alt={`Scene ${index} thumbnail`}
          className="absolute inset-0 w-full h-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 bg-[var(--cs-bg-hover)]" />
      )}

      {/* Dark gradient for text legibility */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />

      {/* Scene number — top left */}
      <span className="absolute top-1 left-1 text-[9px] font-bold text-white/80 leading-none">
        {index}
      </span>

      {/* Active indicator dot */}
      {active && (
        <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-[var(--cs-primary)]" />
      )}

      {/* Duration — bottom left */}
      {duration && (
        <span className="absolute bottom-1 left-1 text-[9px] font-semibold text-white/70 leading-none font-[var(--font-mono)]">
          {duration}
        </span>
      )}

      {/* Slot for extra overlays */}
      {children}
    </button>
  );
}

/** "Add Scene" button matching the + tile at the end of the strip */
export function AddSceneButton({
  onClick,
  className = '',
}: {
  onClick?: () => void;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={[
        'shrink-0 w-[72px] h-[52px] rounded-[var(--cs-radius-sm)]',
        'border border-dashed border-[var(--cs-border-medium)]',
        'flex flex-col items-center justify-center gap-1',
        'text-[var(--cs-text-muted)] hover:text-[var(--cs-text-secondary)]',
        'hover:border-[var(--cs-border-strong)] hover:bg-[var(--cs-bg-hover)]',
        'transition-all duration-[var(--cs-duration-fast)]',
        className,
      ].join(' ')}
      aria-label="Add scene"
    >
      <span className="text-lg leading-none">+</span>
      <span className="text-[8.5px] font-medium">Add Scene</span>
    </button>
  );
}
