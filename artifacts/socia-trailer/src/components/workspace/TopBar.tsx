/**
 * TopBar — studio header matching the mockup.
 * Logo | project title | undo/redo | credits | Settings toggle | Export | avatar
 */
import { Undo2, Redo2, Download, Film, PanelRight } from 'lucide-react';
import { Button, IconButton, CreditsBadge } from '@/components/ui';

interface TopBarProps {
  projectTitle?:      string;
  credits?:           number;
  onExport:           () => void;
  onToggleSettings?:  () => void;
  settingsOpen?:      boolean;
}

export default function TopBar({
  projectTitle = 'Socia Cinematic Trailer',
  credits = 3245,
  onExport,
  onToggleSettings,
  settingsOpen = true,
}: TopBarProps) {
  return (
    <header
      className={[
        'flex items-center gap-2 shrink-0 px-3',
        'bg-[var(--cs-bg)] border-b border-[var(--cs-border-faint)]',
        'h-[var(--cs-topbar-h,52px)]',
      ].join(' ')}
      aria-label="Studio top bar"
    >
      {/* Logo */}
      <div className="hidden md:flex items-center gap-2 shrink-0 mr-1">
        <div className="w-7 h-7 rounded-[var(--cs-radius-sm)] bg-[var(--cs-primary)] flex items-center justify-center">
          <Film size={14} className="text-white" />
        </div>
        <div className="leading-none">
          <p className="text-[10px] font-bold tracking-widest text-white uppercase font-[var(--font-display)]">
            AI Cinematic
          </p>
          <p className="text-[8px] text-[var(--cs-text-muted)] uppercase tracking-[0.12em]">Studio</p>
        </div>
      </div>

      <div className="hidden md:block w-px h-6 bg-[var(--cs-border-faint)] mx-1 shrink-0" />

      {/* Project title */}
      <div className="flex items-center gap-1.5 min-w-0 flex-1">
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-white truncate leading-tight font-[var(--font-display)]">
            {projectTitle}
          </p>
          <p className="text-[10px] text-[var(--cs-text-muted)] leading-tight hidden sm:block">
            Auto-saved · just now
          </p>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 shrink-0">
        {/* Undo / Redo */}
        <div className="hidden sm:flex items-center gap-0.5">
          <IconButton label="Undo" size="sm" variant="ghost" disabled>
            <Undo2 />
          </IconButton>
          <IconButton label="Redo" size="sm" variant="ghost" disabled>
            <Redo2 />
          </IconButton>
        </div>

        {/* Credits */}
        <CreditsBadge credits={credits} className="hidden sm:inline-flex" />

        {/* Settings panel toggle */}
        {onToggleSettings && (
          <IconButton
            label={settingsOpen ? 'Close settings' : 'Open settings'}
            size="sm"
            variant={settingsOpen ? 'secondary' : 'ghost'}
            className="hidden lg:flex"
            onClick={onToggleSettings}
          >
            <PanelRight />
          </IconButton>
        )}

        {/* Export */}
        <Button
          variant="primary"
          size="sm"
          iconLeft={<Download size={12} />}
          onClick={onExport}
          aria-label="Export MP4"
        >
          Export
        </Button>
      </div>
    </header>
  );
}
