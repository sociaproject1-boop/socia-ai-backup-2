/**
 * VideoWithControls — entry point for preview mode.
 *
 * Owns all scene-control state (useSceneControls).
 * Passes state + callbacks into WorkspaceLayout; WorkspaceLayout owns the shell UI.
 * When not iframed, renders a bare VideoTemplate (unchanged behaviour).
 */
import { useCallback } from 'react';
import VideoTemplate, { SCENE_DURATIONS } from './VideoTemplate';
import { useSceneControls } from './useSceneControls';
import WorkspaceLayout from '@/components/workspace/WorkspaceLayout';

export default function VideoWithControls() {
  /* ?preview=1  → bare cinematic trailer (no studio chrome, for embeds) */
  const isBarePreview =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).has('preview');

  const {
    sceneKeys,
    activeIndex,
    locked: _locked,          // kept in hook; lock UI deferred to Phase 4
    mountKey,
    tick,
    durations,
    activeDuration,
    onSceneChange,
    jumpTo,
    toggleLock: _toggleLock,  // kept in hook; lock UI deferred to Phase 4
  } = useSceneControls(SCENE_DURATIONS);

  const openExportPage = useCallback(() => {
    const base = import.meta.env.BASE_URL ?? '/socia-trailer/';
    window.open(`${base}?export=1`, '_blank', 'noopener');
  }, []);

  /* ── Bare preview mode (embed / social share) ────────────────── */
  if (isBarePreview) return <VideoTemplate />;

  /* ── Iframed → full AI Cinematic Studio workspace ───────────── */
  return (
    <WorkspaceLayout
      sceneKeys={sceneKeys}
      activeIndex={activeIndex}
      activeDuration={activeDuration}
      tick={tick}
      baseDurations={SCENE_DURATIONS}
      onJumpTo={jumpTo}
      onExport={openExportPage}
    >
      {/* VideoTemplate is the actual cinematic renderer — do NOT move logic */}
      <VideoTemplate
        key={mountKey}
        durations={durations}
        loop
        onSceneChange={onSceneChange}
      />
    </WorkspaceLayout>
  );
}
