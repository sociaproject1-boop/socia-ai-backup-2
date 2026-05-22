/**
 * WorkspaceLayout — the AI Cinematic Studio shell.
 *
 * Desktop: TopBar | (SidebarNav | Player | SettingsPanel) | SceneTimeline | GenerateBar
 * Mobile:  TopBar | Player | SceneTimeline (compact) | MobileNav
 *          + bottom-sheet settings drawer
 */
import { useState, type ReactNode } from 'react';
import TopBar from './TopBar';
import SidebarNav, { type SidebarSection } from './SidebarNav';
import PreviewPlayer from './PreviewPlayer';
import SceneTimeline from './SceneTimeline';
import GenerateBar from './GenerateBar';
import SettingsPanel from './SettingsPanel';
import MobileNav from './MobileNav';
import { Drawer } from '@/components/ui';

interface WorkspaceLayoutProps {
  children:       ReactNode;
  sceneKeys:      string[];
  activeIndex:    number;
  activeDuration: number;
  tick:           number;
  baseDurations:  Record<string, number>;
  onJumpTo:       (index: number) => void;
  onExport:       () => void;
}

export default function WorkspaceLayout({
  children,
  sceneKeys,
  activeIndex,
  activeDuration,
  tick,
  baseDurations,
  onJumpTo,
  onExport,
}: WorkspaceLayoutProps) {
  const [activeSection, setActiveSection] = useState<SidebarSection>('scenes');
  const [settingsOpen,  setSettingsOpen]  = useState(true);
  const [mobileSheet,   setMobileSheet]   = useState(false);

  const totalMs = Object.values(baseDurations).reduce((a, b) => a + b, 0);
  const secT    = Math.floor(totalMs / 1000);
  const timeLabel = `00:00 / ${String(Math.floor(secT / 60)).padStart(2,'0')}:${String(secT % 60).padStart(2,'0')}`;

  return (
    <div
      className="flex flex-col w-full h-[100dvh] bg-[var(--cs-canvas)] overflow-hidden"
      style={{ fontFamily: 'var(--font-body)' }}
    >
      {/* ── Top bar ─────────────────────────────────────────────────── */}
      <TopBar
        onExport={onExport}
        onToggleSettings={() => setSettingsOpen((v) => !v)}
        settingsOpen={settingsOpen}
      />

      {/* ── Body ────────────────────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* Left sidebar — desktop only */}
        <SidebarNav active={activeSection} onChange={setActiveSection} />

        {/* Centre + right column */}
        <div className="flex flex-col flex-1 min-w-0 min-h-0 overflow-hidden">

          {/* ── DESKTOP player: centred inside flex-1 space ────────── */}
          <div className="hidden sm:flex flex-1 min-h-0 items-center justify-center bg-[var(--cs-canvas)] p-2 sm:p-3">
            <PreviewPlayer
              timeLabel={timeLabel}
              quality="1080P"
              aspectLabel="16:9"
              onSettings={() => setSettingsOpen((v) => !v)}
              className="w-full max-h-full"
            >
              {children}
            </PreviewPlayer>
          </div>

          {/* ── MOBILE player: fills flex-1 height ──────────────────── */}
          <div className="sm:hidden flex-1 min-h-0">
            <PreviewPlayer
              quality="1080P"
              onSettings={() => setMobileSheet(true)}
              fill
              className="w-full"
            >
              {children}
            </PreviewPlayer>
          </div>

          {/* Scene timeline — desktop */}
          <div className="hidden sm:block border-t border-[var(--cs-border-faint)] bg-[var(--cs-bg)]">
            <SceneTimeline
              sceneKeys={sceneKeys}
              activeIndex={activeIndex}
              activeDuration={activeDuration}
              tick={tick}
              baseDurations={baseDurations}
              onJumpTo={onJumpTo}
            />
          </div>

          {/* Scene timeline — mobile (compact) */}
          <div className="sm:hidden border-t border-[var(--cs-border-faint)] bg-[var(--cs-bg)]">
            <SceneTimeline
              sceneKeys={sceneKeys}
              activeIndex={activeIndex}
              activeDuration={activeDuration}
              tick={tick}
              baseDurations={baseDurations}
              onJumpTo={onJumpTo}
              compact
            />
          </div>

          {/* Generate bar — desktop only */}
          <div className="hidden md:block">
            <GenerateBar
              onGenerate={onExport}
              onOpenSettings={() => setSettingsOpen((v) => !v)}
              estimatedMinutes={2}
              creditsNeeded={80}
            />
          </div>
        </div>

        {/* Right settings panel — large desktop, collapsible */}
        {settingsOpen && (
          <div className="hidden lg:flex shrink-0">
            <SettingsPanel onClose={() => setSettingsOpen(false)} />
          </div>
        )}
      </div>

      {/* ── Mobile bottom nav ────────────────────────────────────────── */}
      <MobileNav
        onGenerate={onExport}
        onSettings={() => setMobileSheet(true)}
        activeScene={activeIndex}
        totalScenes={sceneKeys.length}
      />

      {/* ── Mobile settings bottom sheet ─────────────────────────────── */}
      <Drawer
        open={mobileSheet}
        onClose={() => setMobileSheet(false)}
        title="Settings"
        side="bottom"
      >
        <SettingsPanel />
      </Drawer>
    </div>
  );
}
