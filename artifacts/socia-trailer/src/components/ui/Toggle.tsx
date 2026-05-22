/**
 * Toggle — pill-style on/off switch.
 * Used in Settings drawer (Beginner Mode, etc.)
 */

interface ToggleProps {
  checked:   boolean;
  onChange:  (val: boolean) => void;
  label?:    string;
  disabled?: boolean;
  size?:     'sm' | 'md';
}

const TRACK = {
  sm: 'w-8  h-4  rounded-full',
  md: 'w-10 h-5  rounded-full',
};
const THUMB = {
  sm: 'w-3  h-3',
  md: 'w-3.5 h-3.5',
};
const TRANSLATE = {
  sm: 'translate-x-4',
  md: 'translate-x-5',
};

export default function Toggle({
  checked,
  onChange,
  label,
  disabled = false,
  size = 'md',
}: ToggleProps) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={[
        'relative flex items-center cursor-pointer focus-visible:outline-none',
        'focus-visible:ring-2 focus-visible:ring-[var(--cs-primary)] rounded-full',
        'disabled:opacity-40 disabled:pointer-events-none',
        label ? 'gap-2.5' : '',
      ].join(' ')}
    >
      {/* Track */}
      <span
        className={[
          TRACK[size],
          'shrink-0 transition-colors duration-200 ease-in-out p-0.5 flex items-center',
          checked
            ? 'bg-[var(--cs-primary)]'
            : 'bg-[var(--cs-bg-hover)] border border-[var(--cs-border)]',
        ].join(' ')}
      >
        {/* Thumb */}
        <span
          className={[
            THUMB[size],
            'rounded-full bg-white shadow-sm',
            'transition-transform duration-200 ease-[var(--cs-ease)]',
            checked ? TRANSLATE[size] : 'translate-x-0',
          ].join(' ')}
        />
      </span>
      {label && (
        <span className="text-[12px] text-[var(--cs-text-secondary)] select-none">{label}</span>
      )}
    </button>
  );
}
