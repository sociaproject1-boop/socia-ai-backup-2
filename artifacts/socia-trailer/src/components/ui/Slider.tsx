/**
 * Slider — thin track with purple thumb.
 * Used for timeline scrubbing and settings values.
 */

interface SliderProps {
  value:     number;  /* 0–1 normalized, or use min/max */
  onChange:  (val: number) => void;
  min?:      number;
  max?:      number;
  step?:     number;
  label?:    string;
  disabled?: boolean;
  className?: string;
}

export default function Slider({
  value,
  onChange,
  min = 0,
  max = 1,
  step = 0.01,
  label,
  disabled = false,
  className = '',
}: SliderProps) {
  const pct = max > min ? ((value - min) / (max - min)) * 100 : 0;

  return (
    <div className={['flex flex-col gap-1.5', className].join(' ')}>
      {label && (
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-[var(--cs-text-secondary)]">{label}</span>
          <span className="text-[11px] font-mono text-[var(--cs-text-muted)]">
            {Math.round(value * 100) / 100}
          </span>
        </div>
      )}
      <div className="relative flex items-center h-4 group">
        {/* Track background */}
        <div className="absolute inset-y-1/2 -translate-y-1/2 left-0 right-0 h-1 rounded-full bg-[var(--cs-bg-hover)]" />
        {/* Fill */}
        <div
          className="absolute inset-y-1/2 -translate-y-1/2 left-0 h-1 rounded-full bg-[var(--cs-primary)] pointer-events-none"
          style={{ width: `${pct}%` }}
        />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className={[
            'absolute inset-0 w-full opacity-0 cursor-pointer',
            'disabled:pointer-events-none',
          ].join(' ')}
          aria-label={label}
        />
        {/* Thumb */}
        <div
          className={[
            'absolute w-3.5 h-3.5 rounded-full bg-white shadow-sm pointer-events-none',
            'transition-transform group-hover:scale-110',
            '-translate-x-1/2',
          ].join(' ')}
          style={{ left: `${pct}%` }}
        />
      </div>
    </div>
  );
}
