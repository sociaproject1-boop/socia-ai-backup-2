/**
 * SettingsPanel — right-side settings / presets panel.
 * Matches the mockup: Render Engine, Aspect Ratio, Export Settings, Advanced.
 * Phase 3: full UI structure. Phase 4 will wire these to real state.
 */
import { useState } from 'react';
import { X, ChevronDown } from 'lucide-react';
import { Tabs, Toggle, Badge, IconButton } from '@/components/ui';
import type { Tab } from '@/components/ui';

/* ── Aspect ratio grid ─────────────────────────────────────────────── */
const ASPECT_RATIOS = [
  { label: '9:16', sub: 'Portrait'  },
  { label: '16:9', sub: 'Widescreen'},
  { label: '1:1',  sub: 'Square'    },
  { label: '4:5',  sub: 'Instagram' },
  { label: '3:4',  sub: 'Classic'   },
  { label: '21:9', sub: 'Ultrawide' },
];

const PANEL_TABS: Tab[] = [
  { id: 'settings', label: 'Settings' },
  { id: 'presets',  label: 'Presets'  },
];

interface SettingsPanelProps {
  width?:    number;
  onClose?:  () => void;
}

export default function SettingsPanel({ width = 268, onClose }: SettingsPanelProps) {
  const [tab,             setTab]             = useState('settings');
  const [engine,          setEngine]          = useState<'standard' | 'cinematic'>('standard');
  const [aspectRatio,     setAspectRatio]     = useState('16:9');
  const [resolution,      setResolution]      = useState('1080p');
  const [frameRate,       setFrameRate]       = useState('24 fps');
  const [format,          setFormat]          = useState('MP4');
  const [advancedOpen,    setAdvancedOpen]    = useState(false);
  const [beginnerMode,    setBeginnerMode]    = useState(true);

  return (
    <aside
      className="flex flex-col h-full border-l border-[var(--cs-border-faint)] bg-[var(--cs-bg)] overflow-hidden"
      style={{ width }}
      aria-label="Settings panel"
    >
      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-3 pt-3 pb-2 shrink-0">
        <Tabs tabs={PANEL_TABS} active={tab} onChange={setTab} variant="segment" />
        {onClose && (
          <IconButton label="Close settings" size="sm" onClick={onClose}>
            <X />
          </IconButton>
        )}
      </div>

      {/* ── Scrollable body ─────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-3 pb-4 space-y-4">

        {/* ── Render Engine ─────────────────────────────────────── */}
        <section>
          <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--cs-text-muted)] mb-2">
            Render Engine
          </p>

          <EngineCard
            id="standard"
            title="Standard"
            description="Fast results · Good quality · Save credits"
            badge={<Badge variant="success" size="xs" dot>Recommended</Badge>}
            active={engine === 'standard'}
            onClick={() => setEngine('standard')}
          />
          <div className="h-1.5" />
          <EngineCard
            id="cinematic"
            title="Cinematic Pro"
            description="Best quality · More detailed · Save longer"
            active={engine === 'cinematic'}
            onClick={() => setEngine('cinematic')}
          />
        </section>

        <Divider />

        {/* ── Aspect Ratio ──────────────────────────────────────── */}
        <section>
          <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--cs-text-muted)] mb-2">
            Aspect Ratio
          </p>
          <div className="grid grid-cols-3 gap-1.5">
            {ASPECT_RATIOS.map((ar) => {
              const active = aspectRatio === ar.label;
              return (
                <button
                  key={ar.label}
                  onClick={() => setAspectRatio(ar.label)}
                  className={[
                    'flex flex-col items-center justify-center gap-0.5 py-2 rounded-[var(--cs-radius-sm)]',
                    'border transition-all duration-[var(--cs-duration-fast)] focus-visible:outline-none',
                    active
                      ? 'bg-[var(--cs-primary-dim)] border-[var(--cs-primary)]/50 text-purple-300'
                      : 'bg-[var(--cs-bg-elevated)] border-[var(--cs-border)] text-[var(--cs-text-muted)] hover:border-[var(--cs-border-medium)] hover:text-[var(--cs-text-secondary)]',
                  ].join(' ')}
                >
                  <span className="text-[11px] font-bold leading-none">{ar.label}</span>
                  <span className="text-[8.5px] leading-none opacity-70">{ar.sub}</span>
                </button>
              );
            })}
          </div>
        </section>

        <Divider />

        {/* ── Export Settings ───────────────────────────────────── */}
        <section>
          <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--cs-text-muted)] mb-2">
            Export Settings
          </p>
          <div className="space-y-2">
            <SelectRow
              label="Resolution"
              value={resolution}
              options={['720p', '1080p', '4K']}
              onChange={setResolution}
            />
            <SelectRow
              label="Frame rate"
              value={frameRate}
              options={['24 fps', '30 fps', '60 fps']}
              onChange={setFrameRate}
            />
            <SelectRow
              label="Format"
              value={format}
              options={['MP4', 'MOV', 'WebM']}
              onChange={setFormat}
            />
          </div>
        </section>

        <Divider />

        {/* ── Advanced ──────────────────────────────────────────── */}
        <section>
          <button
            onClick={() => setAdvancedOpen((v) => !v)}
            className="flex items-center justify-between w-full text-left focus-visible:outline-none group"
          >
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--cs-text-muted)]">
              Advanced
            </p>
            <ChevronDown
              size={13}
              className={[
                'text-[var(--cs-text-muted)] transition-transform duration-150',
                advancedOpen ? 'rotate-180' : '',
              ].join(' ')}
            />
          </button>

          {advancedOpen && (
            <div className="mt-3 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-[11.5px] font-semibold text-[var(--cs-text-secondary)]">
                    Beginner Mode
                    <span className="ml-1 text-amber-400">✦</span>
                  </p>
                  <p className="text-[9.5px] text-[var(--cs-text-muted)] mt-0.5 leading-snug">
                    Simplified controls · Switch to Pro for all options
                  </p>
                </div>
                <Toggle
                  checked={beginnerMode}
                  onChange={setBeginnerMode}
                  size="sm"
                />
              </div>
            </div>
          )}
        </section>
      </div>
    </aside>
  );
}

/* ── Sub-components ─────────────────────────────────────────────────── */

function Divider() {
  return <div className="h-px bg-[var(--cs-border-faint)]" />;
}

function EngineCard({
  title, description, badge, active, onClick,
}: {
  id:          string;
  title:       string;
  description: string;
  badge?:      React.ReactNode;
  active:      boolean;
  onClick:     () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={[
        'w-full text-left p-3 rounded-[var(--cs-radius-sm)] border',
        'transition-all duration-[var(--cs-duration-fast)] focus-visible:outline-none',
        active
          ? 'bg-[var(--cs-primary-dim)] border-[var(--cs-primary)]/50'
          : 'bg-[var(--cs-bg-elevated)] border-[var(--cs-border)] hover:border-[var(--cs-border-medium)]',
      ].join(' ')}
    >
      <div className="flex items-center justify-between mb-1">
        <span className={['text-[12px] font-semibold', active ? 'text-purple-200' : 'text-[var(--cs-text-secondary)]'].join(' ')}>
          {title}
        </span>
        <div className="flex items-center gap-1.5">
          {badge}
          {active && (
            <span className="w-4 h-4 rounded-full bg-[var(--cs-primary)] flex items-center justify-center">
              <span className="text-[8px] text-white font-bold">✓</span>
            </span>
          )}
        </div>
      </div>
      <p className="text-[9.5px] text-[var(--cs-text-muted)] leading-snug">{description}</p>
    </button>
  );
}

function SelectRow({
  label, value, options, onChange,
}: {
  label:    string;
  value:    string;
  options:  string[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[11px] text-[var(--cs-text-muted)] shrink-0">{label}</span>
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={[
            'appearance-none h-6 pl-2 pr-6 rounded-[var(--cs-radius-xs)]',
            'bg-[var(--cs-bg-elevated)] border border-[var(--cs-border)]',
            'text-[11px] font-semibold text-[var(--cs-text-secondary)]',
            'cursor-pointer focus:outline-none focus:border-[var(--cs-primary)]/60',
            'transition-colors',
          ].join(' ')}
        >
          {options.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
        <ChevronDown
          size={10}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none text-[var(--cs-text-muted)]"
        />
      </div>
    </div>
  );
}
