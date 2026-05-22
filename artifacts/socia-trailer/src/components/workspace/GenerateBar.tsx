/**
 * GenerateBar — floating action bar above the timeline on desktop.
 * Shows estimated time, Generate Film CTA, and credit cost.
 * Has a settings quick-access button on the right.
 */
import { Sparkles, Clock, Zap, ChevronDown, Settings2 } from 'lucide-react';
import { Button, Badge, IconButton } from '@/components/ui';

interface GenerateBarProps {
  onGenerate:       () => void;
  onOpenSettings?:  () => void;
  estimatedMinutes?: number;
  creditsNeeded?:   number;
  quality?:         string;
  loading?:         boolean;
  className?:       string;
}

export default function GenerateBar({
  onGenerate,
  onOpenSettings,
  estimatedMinutes = 2,
  creditsNeeded = 80,
  quality = 'Standard',
  loading = false,
  className = '',
}: GenerateBarProps) {
  return (
    <div
      className={[
        'flex items-center gap-3 shrink-0 px-4 py-2.5',
        'border-t border-[var(--cs-border-faint)] bg-[var(--cs-bg)]',
        className,
      ].join(' ')}
      aria-label="Generate film action bar"
    >
      {/* Estimated time */}
      <div className="flex items-center gap-2 shrink-0">
        <Clock size={13} className="text-[var(--cs-text-muted)]" />
        <div className="leading-none">
          <p className="text-[9px] text-[var(--cs-text-muted)]">Estimated time</p>
          <p className="text-[11px] font-semibold text-[var(--cs-text-secondary)]">
            ~{estimatedMinutes} min
          </p>
        </div>
      </div>

      <div className="flex-1" />

      {/* Generate CTA */}
      <div className="flex flex-col items-center gap-1">
        <Button
          variant="primary"
          size="lg"
          loading={loading}
          iconLeft={<Sparkles size={15} />}
          onClick={onGenerate}
          className="min-w-[172px] shadow-[var(--cs-shadow-primary)]"
        >
          Generate Film
        </Button>
        <p className="text-[9px] text-[var(--cs-text-muted)]">
          Quality:{' '}
          <span className="text-[var(--cs-text-secondary)] font-semibold">{quality}</span>
        </p>
      </div>

      <div className="flex-1" />

      {/* Credits needed */}
      <div className="flex items-center gap-1.5 shrink-0">
        <div className="leading-none text-right">
          <p className="text-[9px] text-[var(--cs-text-muted)]">Credits needed</p>
          <p className="text-[11px] font-semibold text-red-400">
            −{creditsNeeded}
          </p>
        </div>
        <Badge variant="warning" size="xs">
          <Zap size={9} />
        </Badge>
        <button
          className="text-[var(--cs-text-muted)] hover:text-[var(--cs-text-secondary)] transition-colors"
          aria-label="Quality options"
        >
          <ChevronDown size={14} />
        </button>
      </div>

      {/* Settings shortcut */}
      {onOpenSettings && (
        <IconButton
          label="Open settings"
          size="sm"
          variant="ghost"
          onClick={onOpenSettings}
          className="ml-1"
        >
          <Settings2 />
        </IconButton>
      )}
    </div>
  );
}
