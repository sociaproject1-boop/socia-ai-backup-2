/**
 * SceneTimeline — bottom strip.
 * Shows: stats row | multi-segment progress | scene thumbnail cards.
 * Supports `compact` prop for mobile (hides stats, tighter layout).
 */
import { useEffect, useState } from 'react';
import { TimelineItem, AddSceneButton } from '@/components/ui';

const PROGRESS_TICK_MS = 60;

const SCENE_LABELS: Record<string, string> = {
  hook:     'Hook',
  studio:   'Studio',
  generate: 'Generate',
  gpt:      'GPT',
  monetize: 'Monetize',
  outro:    'Outro',
};

const SCENE_GRADIENTS: Record<string, string> = {
  hook:     'linear-gradient(135deg,#1a0533 0%,#2d0f6b 100%)',
  studio:   'linear-gradient(135deg,#0a1628 0%,#182848 100%)',
  generate: 'linear-gradient(135deg,#041821 0%,#0a3040 100%)',
  gpt:      'linear-gradient(135deg,#0e0d2e 0%,#1e1b4b 100%)',
  monetize: 'linear-gradient(135deg,#1a0a1a 0%,#3d1040 100%)',
  outro:    'linear-gradient(135deg,#070710 0%,#0f0f20 100%)',
};

function formatMs(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatTotal(dur: Record<string, number>): string {
  const sec = Math.round(Object.values(dur).reduce((a, b) => a + b, 0) / 1000);
  return `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
}

interface StatItemProps { label: string; value: string }
function StatItem({ label, value }: StatItemProps) {
  return (
    <div className="flex flex-col items-start gap-0.5">
      <span className="text-[8.5px] uppercase tracking-[0.08em] text-[var(--cs-text-muted)] font-semibold whitespace-nowrap">
        {label}
      </span>
      <span className="text-[11px] font-semibold text-[var(--cs-text-secondary)] font-[var(--font-mono)] whitespace-nowrap">
        {value}
      </span>
    </div>
  );
}

interface SceneTimelineProps {
  sceneKeys:      string[];
  activeIndex:    number;
  activeDuration: number;
  tick:           number;
  baseDurations:  Record<string, number>;
  onJumpTo:       (index: number) => void;
  allowAdd?:      boolean;
  compact?:       boolean; /* mobile compact mode */
}

export default function SceneTimeline({
  sceneKeys,
  activeIndex,
  activeDuration,
  tick,
  baseDurations,
  onJumpTo,
  allowAdd = false,
  compact  = false,
}: SceneTimelineProps) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    setElapsed(0);
    const start = performance.now();
    const id = window.setInterval(() => {
      setElapsed(performance.now() - start);
    }, PROGRESS_TICK_MS);
    return () => window.clearInterval(id);
  }, [tick]);

  const activeProgress = activeDuration > 0 ? Math.min(1, elapsed / activeDuration) : 0;
  const totalDur = Object.values(baseDurations).reduce((a, b) => a + b, 1);

  return (
    <div className={['flex flex-col px-3', compact ? 'gap-1.5 py-2' : 'gap-2 py-2.5'].join(' ')}>

      {/* ── Stats row — hidden in compact mode ──────────────────────── */}
      {!compact && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-5">
            <StatItem label="Duration"   value={formatTotal(baseDurations)} />
            <StatItem label="Scenes"     value={String(sceneKeys.length)} />
            <StatItem label="Resolution" value="1080p" />
            <StatItem label="Frame Rate" value="24 fps" />
          </div>
          <p className="text-[9px] text-[var(--cs-text-disabled)] hidden lg:block select-none">
            Click a scene to jump
          </p>
        </div>
      )}

      {/* ── Multi-segment progress bar ────────────────────────────────── */}
      <div className="flex items-center gap-0.5">
        {sceneKeys.map((key, i) => {
          const isActive = i === activeIndex;
          const isDone   = i < activeIndex;
          const flex     = (baseDurations[key] ?? 0) / totalDur;
          return (
            <button
              key={key}
              onClick={() => onJumpTo(i)}
              title={SCENE_LABELS[key]}
              className="h-1 rounded-full overflow-hidden bg-white/10 hover:bg-white/20 transition-colors relative cursor-pointer"
              style={{ flex }}
              aria-label={`Jump to ${SCENE_LABELS[key]}`}
            >
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-[var(--cs-primary)] transition-[width] duration-100"
                style={{
                  width: isDone ? '100%' : isActive ? `${activeProgress * 100}%` : '0%',
                }}
              />
            </button>
          );
        })}
      </div>

      {/* ── Section header ────────────────────────────────────────────── */}
      {!compact && (
        <p className="text-[11px] font-semibold text-[var(--cs-text-secondary)]">
          Scenes ({sceneKeys.length})
        </p>
      )}

      {/* ── Thumbnail strip ───────────────────────────────────────────── */}
      <div className={[
        'flex items-center gap-2 overflow-x-auto cs-no-scrollbar',
        compact ? 'pb-0' : 'pb-1',
      ].join(' ')}>
        {sceneKeys.map((key, i) => {
          const isActive = i === activeIndex;
          const label    = SCENE_LABELS[key] ?? key;
          const gradient = SCENE_GRADIENTS[key] ?? SCENE_GRADIENTS.outro;

          return (
            <div key={key} className="relative shrink-0">
              <TimelineItem
                index={i + 1}
                duration={formatMs(baseDurations[key] ?? 0)}
                active={isActive}
                onClick={() => onJumpTo(i)}
                style={{ background: gradient } as React.CSSProperties}
                className={compact ? 'w-[60px] h-[44px]' : ''}
                aria-label={`${label} — ${formatMs(baseDurations[key] ?? 0)}`}
              >
                {/* Scene name */}
                <span className="absolute bottom-1 left-0 right-0 text-center text-[8px] font-semibold text-white/60 truncate px-1">
                  {label}
                </span>
                {/* Active progress underline */}
                {isActive && (
                  <div
                    className="absolute bottom-0 left-0 h-[2px] bg-[var(--cs-primary)] rounded-b-[var(--cs-radius-xs)] transition-[width] duration-100"
                    style={{ width: `${activeProgress * 100}%` }}
                  />
                )}
              </TimelineItem>
            </div>
          );
        })}

        {allowAdd && <AddSceneButton className={compact ? 'w-[60px] h-[44px]' : ''} />}
      </div>
    </div>
  );
}
