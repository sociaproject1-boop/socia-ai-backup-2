/**
 * PreviewPlayer — 16:9 player wrapper with chrome overlays.
 * Wraps VideoTemplate. Purely presentational — no scene state.
 */
import { useRef, type ReactNode } from 'react';
import { Maximize2, Settings2 } from 'lucide-react';
import { IconButton, Badge } from '@/components/ui';

interface PreviewPlayerProps {
  children:      ReactNode;
  timeLabel?:    string;
  quality?:      string;
  aspectLabel?:  string;
  onFullscreen?: () => void;
  onSettings?:   () => void;
  className?:    string;
  /** When true, fill parent height instead of enforcing aspect-video ratio */
  fill?:         boolean;
}

export default function PreviewPlayer({
  children,
  timeLabel,
  quality = '1080P',
  aspectLabel = '16:9',
  onFullscreen,
  onSettings,
  className = '',
  fill = false,
}: PreviewPlayerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  const handleFullscreen = () => {
    if (onFullscreen) { onFullscreen(); return; }
    const el = containerRef.current;
    if (!el) return;
    document.fullscreenElement
      ? document.exitFullscreen().catch(() => {})
      : el.requestFullscreen().catch(() => {});
  };

  return (
    <div
      ref={containerRef}
      className={[
        'relative bg-black overflow-hidden',
        fill ? 'w-full h-full' : 'aspect-video max-h-full',
        fill ? '' : 'rounded-[var(--cs-radius-md)] shadow-[var(--cs-shadow-lg)] ring-1 ring-white/5',
        className,
      ].join(' ')}
    >
      {/* Video content fills the box */}
      <div className="absolute inset-0">{children}</div>

      {/* ── Top-left quality badge ─────────────────────────── */}
      <div className="absolute top-2 left-2 z-10 pointer-events-none">
        <Badge variant="default" size="xs" className="font-[var(--font-mono)] bg-black/60 backdrop-blur-sm">
          {quality}
        </Badge>
      </div>

      {/* ── Top-right controls ────────────────────────────── */}
      <div className="absolute top-2 right-2 z-10 flex items-center gap-1">
        {onSettings && (
          <IconButton
            label="Player settings"
            size="xs"
            variant="ghost"
            className="opacity-0 hover:opacity-100 group-hover:opacity-70 bg-black/50 backdrop-blur-sm transition-opacity"
            onClick={onSettings}
          >
            <Settings2 />
          </IconButton>
        )}
        <IconButton
          label="Fullscreen"
          size="xs"
          variant="ghost"
          className="bg-black/50 backdrop-blur-sm opacity-60 hover:opacity-100 transition-opacity"
          onClick={handleFullscreen}
        >
          <Maximize2 />
        </IconButton>
      </div>

      {/* ── Bottom bar ────────────────────────────────────── */}
      <div className="absolute bottom-0 left-0 right-0 z-10 px-3 pb-2.5 pt-8 flex items-end gap-3 bg-gradient-to-t from-black/70 via-black/30 to-transparent">
        {timeLabel && (
          <span className="text-[10px] font-[var(--font-mono)] text-white/60 shrink-0">
            {timeLabel}
          </span>
        )}
        <div className="flex-1 h-px bg-white/15 rounded-full" />
        {aspectLabel && (
          <span className="text-[9px] font-[var(--font-mono)] text-white/40 shrink-0">
            {aspectLabel}
          </span>
        )}
      </div>
    </div>
  );
}
