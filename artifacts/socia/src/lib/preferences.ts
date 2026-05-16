export type AccentKey  = 'purple' | 'blue' | 'gold' | 'green';
export type TextSizeKey = 'small'  | 'default' | 'large';
export type ThemeMode   = 'dark';

export interface Notifs {
  push: boolean; email: boolean; sound: boolean; followers: boolean; likes: boolean;
}

export interface Preferences {
  theme:    ThemeMode;
  accent:   AccentKey;
  textSize: TextSizeKey;
  notifs:   Notifs;
}

export const DEFAULTS: Preferences = {
  theme:    'dark',
  accent:   'purple',
  textSize: 'default',
  notifs:   { push: true, email: false, sound: true, followers: true, likes: true },
};

export const ACCENTS: Record<AccentKey, { primary: string; secondary: string; glow: string }> = {
  purple: { primary: '#a855f7', secondary: '#ec4899', glow: 'rgba(168,85,247,0.30)' },
  blue:   { primary: '#3b82f6', secondary: '#06b6d4', glow: 'rgba(59,130,246,0.30)'  },
  gold:   { primary: '#f59e0b', secondary: '#f97316', glow: 'rgba(245,158,11,0.30)'  },
  green:  { primary: '#10b981', secondary: '#34d399', glow: 'rgba(16,185,129,0.30)'  },
};

export const TEXT_PX: Record<TextSizeKey, string> = {
  small:   '13px',
  default: '15px',
  large:   '17px',
};

export function loadPrefs(): Preferences {
  try {
    const raw = localStorage.getItem('socia_prefs');
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<Preferences>;
    return {
      ...DEFAULTS,
      ...parsed,
      theme: 'dark',   // always dark — light mode removed
      notifs: { ...DEFAULTS.notifs, ...(parsed.notifs ?? {}) },
    };
  } catch {
    return DEFAULTS;
  }
}

export function savePrefs(p: Preferences): void {
  localStorage.setItem('socia_prefs', JSON.stringify(p));
}

export function applyPrefs(p: Preferences): void {
  const root = document.documentElement;
  const a = ACCENTS[p.accent];

  // Always dark — light mode removed
  root.classList.add('dark');
  root.classList.remove('light');

  // Accent CSS custom properties
  root.style.setProperty('--accent-primary',   a.primary);
  root.style.setProperty('--accent-secondary', a.secondary);
  root.style.setProperty('--accent-glow',      a.glow);

  // Text size on <html> cascades to rem-based units via browser default
  root.style.fontSize = TEXT_PX[p.textSize];
}
