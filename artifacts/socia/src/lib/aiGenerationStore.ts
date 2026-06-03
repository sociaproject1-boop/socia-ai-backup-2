/**
 * aiGenerationStore — global state for the SOCIA AI Generation loading screen.
 *
 * This is an ISOLATED, additive system. It does NOT touch any generation API,
 * payment, auth, or database logic. AI generation tools (Prompt→Image,
 * Prompt→Video, Image→Video, AI Cinematic Studio, and any future tool) call
 * `start()` when generation begins and `succeed()` / `fail()` when the real
 * generation process resolves. The <GlobalAIGenerationOverlay/> mounted at the
 * app root reads this store and renders the live loading experience.
 *
 * Progress contract:
 *   • If the provider exposes real progress (e.g. cinematic render jobs over
 *     Socket.IO), feed it via `setProgress(pct)`. The overlay tracks it.
 *   • If the provider does NOT expose progress (image/video REST calls that
 *     resolve in one shot), leave `externalProgress` null. The overlay runs an
 *     intelligent, time-based progressive curve that never jumps and never
 *     freezes — no random percentages.
 */

import { create } from "zustand";

export type AIGenKind = "image" | "video" | "image-video" | "cinematic";

/** Mirrors the real generation lifecycle: generating → completed | failed. */
export type AIGenPhase = "generating" | "completed" | "failed";

export interface AIGenStartOptions {
  kind: AIGenKind;
  /** Human-readable active model name shown in the overlay (e.g. "Socia AI"). */
  model: string;
  /** Expected duration in ms — drives ETA + the intelligent progress curve. */
  estimateMs?: number;
  /** Optional retry handler invoked from the error state's Retry button. */
  retry?: (() => void) | null;
  /**
   * Optional "run in background" handler. When present (e.g. the cinematic
   * studio's background-render feature), the overlay shows a "Run in
   * background" affordance so that existing functionality is preserved.
   */
  onBackground?: (() => void) | null;
}

interface AIGenState {
  active: boolean;
  kind: AIGenKind;
  phase: AIGenPhase;
  model: string;
  estimateMs: number;
  startedAt: number;
  /** Real provider progress (0–100), or null when the provider gives none. */
  externalProgress: number | null;
  error: string | null;
  retry: (() => void) | null;
  onBackground: (() => void) | null;

  start: (o: AIGenStartOptions) => void;
  setProgress: (pct: number) => void;
  succeed: () => void;
  fail: (message: string) => void;
  dismiss: () => void;
}

/** Sensible per-task ETAs (ms). Image: 10–20s, Video: 30–120s, Cinematic: 1–5m. */
export const DEFAULT_ESTIMATE_MS: Record<AIGenKind, number> = {
  image:          18_000,
  video:          75_000,
  "image-video":  60_000,
  cinematic:      180_000,
};

export const useAIGeneration = create<AIGenState>((set) => ({
  active:           false,
  kind:             "image",
  phase:            "generating",
  model:            "Socia AI",
  estimateMs:       DEFAULT_ESTIMATE_MS.image,
  startedAt:        0,
  externalProgress: null,
  error:            null,
  retry:            null,
  onBackground:     null,

  start: (o) =>
    set({
      active:           true,
      kind:             o.kind,
      phase:            "generating",
      model:            o.model,
      estimateMs:       o.estimateMs ?? DEFAULT_ESTIMATE_MS[o.kind],
      startedAt:        Date.now(),
      externalProgress: null,
      error:            null,
      retry:            o.retry ?? null,
      onBackground:     o.onBackground ?? null,
    }),

  setProgress: (pct) =>
    set({ externalProgress: Math.max(0, Math.min(100, pct)) }),

  succeed: () => set({ phase: "completed" }),

  fail: (message) => set({ phase: "failed", error: message }),

  dismiss: () =>
    set({
      active:           false,
      phase:            "generating",
      error:            null,
      externalProgress: null,
      retry:            null,
      onBackground:     null,
    }),
}));
