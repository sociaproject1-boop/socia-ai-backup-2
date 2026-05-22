/**
 * MobileNav — bottom action bar for small screens.
 * Visible only on mobile (< md). Shows Edit and Share pills + scene counter.
 */
import { Sparkles, Share2 } from 'lucide-react';

interface MobileNavProps {
  onGenerate:   () => void;
  onSettings:   () => void;
  activeScene:  number;
  totalScenes:  number;
}

export default function MobileNav({
  onGenerate,
  onSettings: _onSettings,
  activeScene,
  totalScenes,
}: MobileNavProps) {
  return (
    <div className="flex md:hidden items-center gap-2 px-3 pb-safe pb-3 pt-2 border-t border-[var(--cs-border-faint)] bg-[var(--cs-canvas)] shrink-0">
      {/* Scene indicator pill */}
      <div className="flex items-center gap-1.5 px-3 h-10 rounded-full bg-[var(--cs-bg-elevated)] border border-[var(--cs-border)] shrink-0">
        <span className="text-[10px] text-[var(--cs-text-muted)] font-semibold">
          {activeScene + 1}/{totalScenes}
        </span>
      </div>

      {/* Generate Film */}
      <button
        onClick={onGenerate}
        className={[
          'flex-1 flex items-center justify-center gap-2 h-10 rounded-full',
          'bg-[var(--cs-primary)] hover:bg-[var(--cs-primary-hover)]',
          'text-white text-[13px] font-semibold',
          'shadow-[var(--cs-shadow-primary)] active:scale-[0.97]',
          'transition-all duration-[var(--cs-duration-fast)]',
        ].join(' ')}
      >
        <Sparkles size={14} />
        Generate Film
      </button>

      {/* Share */}
      <button
        className={[
          'flex items-center justify-center gap-1.5 px-4 h-10 rounded-full shrink-0',
          'bg-[var(--cs-bg-elevated)] border border-[var(--cs-border)]',
          'text-[var(--cs-text-secondary)] text-[12px] font-semibold',
          'hover:bg-[var(--cs-bg-hover)] transition-colors',
        ].join(' ')}
      >
        <Share2 size={13} />
        Share
      </button>
    </div>
  );
}
