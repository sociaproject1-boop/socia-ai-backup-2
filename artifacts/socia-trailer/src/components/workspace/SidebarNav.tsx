/**
 * SidebarNav — left icon rail matching the mockup's vertical nav.
 * Hidden on mobile (< md), always visible on desktop.
 */
import type { ReactNode } from 'react';
import {
  LayoutGrid, Film, Image, Layers, Type,
  Music2, Zap, Sliders, Settings,
} from 'lucide-react';
import { Tooltip } from '@/components/ui';

export type SidebarSection = 'workspace' | 'scenes' | 'media' | 'elements' | 'text' | 'music' | 'transitions' | 'filters' | 'settings';

interface NavItem {
  id:    SidebarSection;
  label: string;
  icon:  ReactNode;
}

const TOP_ITEMS: NavItem[] = [
  { id: 'workspace',   label: 'Workspace',   icon: <LayoutGrid  size={18} /> },
  { id: 'scenes',      label: 'Scenes',      icon: <Film        size={18} /> },
  { id: 'media',       label: 'Media',       icon: <Image       size={18} /> },
  { id: 'elements',    label: 'Elements',    icon: <Layers      size={18} /> },
  { id: 'text',        label: 'Text',        icon: <Type        size={18} /> },
  { id: 'music',       label: 'Music',       icon: <Music2      size={18} /> },
  { id: 'transitions', label: 'Transitions', icon: <Zap         size={18} /> },
  { id: 'filters',     label: 'Filters',     icon: <Sliders     size={18} /> },
];

const BOTTOM_ITEMS: NavItem[] = [
  { id: 'settings', label: 'Settings', icon: <Settings size={18} /> },
];

interface SidebarNavProps {
  active:   SidebarSection;
  onChange: (id: SidebarSection) => void;
}

function NavBtn({
  item, active, onClick,
}: { item: NavItem; active: boolean; onClick: () => void }) {
  return (
    <Tooltip content={item.label} side="right">
      <button
        onClick={onClick}
        aria-label={item.label}
        aria-current={active ? 'page' : undefined}
        className={[
          'w-9 h-9 flex items-center justify-center rounded-[var(--cs-radius-sm)]',
          'transition-all duration-[var(--cs-duration-fast)] focus-visible:outline-none',
          'focus-visible:ring-2 focus-visible:ring-[var(--cs-primary)]',
          active
            ? 'bg-[var(--cs-primary-dim)] text-purple-300 border border-[var(--cs-primary)]/40'
            : 'text-[var(--cs-text-muted)] hover:text-[var(--cs-text-secondary)] hover:bg-[var(--cs-bg-hover)]',
        ].join(' ')}
      >
        {item.icon}
      </button>
    </Tooltip>
  );
}

export default function SidebarNav({ active, onChange }: SidebarNavProps) {
  return (
    <aside
      className={[
        'hidden md:flex flex-col items-center gap-1 shrink-0',
        'w-[52px] py-3 border-r border-[var(--cs-border-faint)]',
        'bg-[var(--cs-sidebar-bg)]',
      ].join(' ')}
      aria-label="Studio navigation"
    >
      {/* Logo mark */}
      <div className="w-7 h-7 rounded-[var(--cs-radius-sm)] bg-[var(--cs-primary)] flex items-center justify-center mb-2 shrink-0">
        <Film size={14} className="text-white" />
      </div>

      <div className="w-full px-1.5 h-px bg-[var(--cs-border-faint)] mb-1" />

      {/* Top nav items */}
      <div className="flex flex-col items-center gap-0.5 flex-1">
        {TOP_ITEMS.map((item) => (
          <NavBtn
            key={item.id}
            item={item}
            active={active === item.id}
            onClick={() => onChange(item.id)}
          />
        ))}
      </div>

      {/* Pro plan badge */}
      <div className="flex flex-col items-center gap-1 mb-1">
        <div className="w-8 h-8 rounded-full bg-[var(--cs-primary-dim)] border border-[var(--cs-primary)]/40 flex items-center justify-center">
          <span className="text-[8px] font-bold text-purple-300 leading-none">PRO</span>
        </div>
      </div>

      <div className="w-full px-1.5 h-px bg-[var(--cs-border-faint)]" />

      {/* Bottom nav items */}
      <div className="flex flex-col items-center gap-0.5 pt-1">
        {BOTTOM_ITEMS.map((item) => (
          <NavBtn
            key={item.id}
            item={item}
            active={active === item.id}
            onClick={() => onChange(item.id)}
          />
        ))}
      </div>
    </aside>
  );
}
