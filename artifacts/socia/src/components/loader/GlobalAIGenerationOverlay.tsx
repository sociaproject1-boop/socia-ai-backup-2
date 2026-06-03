/**
 * GlobalAIGenerationOverlay — the OFFICIAL SOCIA AI Generation loading screen.
 *
 * Fullscreen, dark, neon overlay shown ONLY during AI generation tasks
 * (Prompt→Image, Prompt→Video, Image→Video, AI Cinematic Studio, and any
 * future AI tool). Driven entirely by the isolated `useAIGeneration` store —
 * it never touches generation APIs, payments, auth, or the database.
 *
 * Lifecycle:
 *   • Opens (fade in) when a tool calls store.start() → phase "generating".
 *   • Tracks REAL progress when the provider feeds it (store.setProgress),
 *     otherwise runs an intelligent time-based curve (never random, never
 *     frozen, never instant).
 *   • On store.succeed() → ramps to 100%, shows "Generation Complete" then
 *     "Opening Result…" and self-dismisses so the page's result can show.
 *   • On store.fail() → shows the error state with a Retry button.
 *
 * Performance: particle/neural background uses transform/opacity-only CSS
 * animations on a small fixed set of nodes — GPU-light and smooth on mobile.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Search, Box, Palette, Sparkles, CheckCircle2, Clock, Cpu, Lightbulb,
  RotateCcw, X,
} from "lucide-react";
import {
  useAIGeneration, type AIGenKind,
} from "@/lib/aiGenerationStore";
import logoUrl from "@assets/socia-ai-logo.png";

/* ── Copy banks keyed by task type ───────────────────────────────────────── */

const ROTATING_MESSAGES: Record<AIGenKind, string[]> = {
  image: [
    "Analyzing Prompt…", "Building Composition…", "Generating Details…",
    "Enhancing Quality…", "Optimizing Results…", "Finalizing Output…",
  ],
  video: [
    "Preparing Scene…", "Generating Motion…", "Rendering Frames…",
    "Applying Effects…", "Finalizing Video…",
  ],
  "image-video": [
    "Preparing Scene…", "Generating Motion…", "Rendering Frames…",
    "Applying Effects…", "Finalizing Video…",
  ],
  cinematic: [
    "Preparing Scene…", "Building Composition…", "Generating Motion…",
    "Rendering Frames…", "Color Grading…", "Finalizing Video…",
  ],
};

interface Step { label: string; Icon: typeof Search; }

const IMAGE_STEPS: Step[] = [
  { label: "Analyzing\nPrompt",      Icon: Search },
  { label: "Building\nComposition",  Icon: Box },
  { label: "Generating\nDetails",    Icon: Palette },
  { label: "Enhancing\nQuality",     Icon: Sparkles },
  { label: "Finalizing\nResults",    Icon: CheckCircle2 },
];

const VIDEO_STEPS: Step[] = [
  { label: "Preparing\nScene",     Icon: Search },
  { label: "Generating\nMotion",   Icon: Box },
  { label: "Rendering\nFrames",    Icon: Palette },
  { label: "Applying\nEffects",    Icon: Sparkles },
  { label: "Finalizing\nVideo",    Icon: CheckCircle2 },
];

function stepsFor(kind: AIGenKind): Step[] {
  return kind === "image" ? IMAGE_STEPS
    : kind === "cinematic" ? IMAGE_STEPS
    : VIDEO_STEPS;
}

const NEON = "linear-gradient(90deg,#ec4899 0%,#a855f7 50%,#3b82f6 100%)";

/* ── Helpers ─────────────────────────────────────────────────────────────── */

function fmtTime(sec: number): string {
  if (sec <= 0) return "almost done";
  if (sec < 60) return `${Math.round(sec)} sec`;
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")} min`;
}

/* ── Background: GPU-light neural particles ──────────────────────────────── */

const PARTICLES = Array.from({ length: 18 }, (_, i) => {
  const colors = ["#ec4899", "#a855f7", "#3b82f6"];
  return {
    id:    i,
    left:  (i * 53) % 100,
    top:   (i * 37 + 11) % 100,
    size:  2 + (i % 3),
    delay: (i % 6) * 0.7,
    dur:   5 + (i % 5),
    color: colors[i % 3],
  };
});

function ParticleField() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* faint neural lattice */}
      <svg className="absolute inset-0 h-full w-full opacity-[0.13]" preserveAspectRatio="none">
        <defs>
          <linearGradient id="aigen-line" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#ec4899" />
            <stop offset="50%" stopColor="#a855f7" />
            <stop offset="100%" stopColor="#3b82f6" />
          </linearGradient>
        </defs>
        {PARTICLES.slice(0, 9).map((p, i) => {
          const n = PARTICLES[(i + 4) % PARTICLES.length];
          return (
            <line
              key={p.id}
              x1={`${p.left}%`} y1={`${p.top}%`}
              x2={`${n.left}%`} y2={`${n.top}%`}
              stroke="url(#aigen-line)" strokeWidth="0.6"
            />
          );
        })}
      </svg>
      {PARTICLES.map((p) => (
        <span
          key={p.id}
          className="absolute rounded-full"
          style={{
            left: `${p.left}%`, top: `${p.top}%`,
            width: p.size, height: p.size,
            background: p.color,
            boxShadow: `0 0 ${p.size * 4}px ${p.color}`,
            animation: `aigenFloat ${p.dur}s ease-in-out ${p.delay}s infinite`,
            willChange: "transform, opacity",
          }}
        />
      ))}
    </div>
  );
}

/* ── Main overlay ────────────────────────────────────────────────────────── */

export function GlobalAIGenerationOverlay() {
  const active           = useAIGeneration((s) => s.active);
  const kind             = useAIGeneration((s) => s.kind);
  const phase            = useAIGeneration((s) => s.phase);
  const model            = useAIGeneration((s) => s.model);
  const estimateMs       = useAIGeneration((s) => s.estimateMs);
  const startedAt        = useAIGeneration((s) => s.startedAt);
  const externalProgress = useAIGeneration((s) => s.externalProgress);
  const error            = useAIGeneration((s) => s.error);
  const retry            = useAIGeneration((s) => s.retry);
  const onBackground     = useAIGeneration((s) => s.onBackground);
  const dismiss          = useAIGeneration((s) => s.dismiss);

  const [progress, setProgress] = useState(0);
  const [dots, setDots]         = useState(".");
  const [msgIdx, setMsgIdx]     = useState(0);
  const progressRef             = useRef(0);

  const steps    = useMemo(() => stepsFor(kind), [kind]);
  const messages = ROTATING_MESSAGES[kind];

  /* Reset visual progress whenever a new generation starts. */
  useEffect(() => {
    if (active && phase === "generating") {
      setProgress(0);
      progressRef.current = 0;
      setMsgIdx(0);
    }
  }, [active, startedAt, phase]);

  /* Intelligent progress engine — runs while generating. */
  useEffect(() => {
    if (!active || phase !== "generating") return;
    const id = window.setInterval(() => {
      setProgress((prev) => {
        let next: number;
        if (externalProgress != null) {
          // Real provider progress — ease toward it, never go backwards.
          next = Math.max(prev, prev + (externalProgress - prev) * 0.25);
        } else {
          // Time-based curve, asymptotic toward 92% (no random, no freeze).
          const elapsed = Date.now() - startedAt;
          const target  = 92 * (1 - Math.exp(-elapsed / (estimateMs * 0.55)));
          next = prev + (target - prev) * 0.12 + 0.15;
        }
        next = Math.min(next, externalProgress != null ? 99 : 92);
        progressRef.current = next;
        return next;
      });
    }, 120);
    return () => window.clearInterval(id);
  }, [active, phase, externalProgress, startedAt, estimateMs]);

  /* On completion, ramp smoothly to 100 then hand off to the page result. */
  useEffect(() => {
    if (!active || phase !== "completed") return;
    const id = window.setInterval(() => {
      setProgress((prev) => {
        const next = prev + (100 - prev) * 0.3 + 1.5;
        return next >= 100 ? 100 : next;
      });
    }, 60);
    const closeTimer = window.setTimeout(() => dismiss(), 1500);
    return () => { window.clearInterval(id); window.clearTimeout(closeTimer); };
  }, [active, phase, dismiss]);

  /* Looping "…" dots. */
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(
      () => setDots((d) => (d.length >= 3 ? "." : d + ".")),
      450,
    );
    return () => window.clearInterval(id);
  }, [active]);

  /* Rotating status pill messages. */
  useEffect(() => {
    if (!active || phase !== "generating") return;
    const id = window.setInterval(
      () => setMsgIdx((i) => (i + 1) % messages.length),
      2400,
    );
    return () => window.clearInterval(id);
  }, [active, phase, messages.length]);

  if (!active) return null;

  const pct       = Math.round(progress);
  const stepIdx   = Math.min(steps.length - 1, Math.floor((progress / 100) * steps.length));
  const remaining = phase === "generating"
    ? (estimateMs / 1000) * (1 - progress / 100)
    : 0;

  const processLabel =
    phase === "completed" ? "Complete"
    : phase === "failed"  ? "Failed"
    : "Generating";

  return (
    <AnimatePresence>
      <motion.div
        key="aigen-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="fixed inset-0 flex items-center justify-center"
        style={{
          zIndex: 99999,
          background:
            "radial-gradient(120% 90% at 50% 18%, #1a0b2e 0%, #0a0613 55%, #050308 100%)",
          backdropFilter: "blur(6px)",
        }}
        role="dialog"
        aria-modal="true"
        aria-label="AI is creating your content"
      >
        <ParticleField />

        <div
          className="relative z-10 mx-auto flex w-full max-w-md flex-col items-center px-6"
          style={{
            paddingTop:    "max(env(safe-area-inset-top), 16px)",
            paddingBottom: "max(env(safe-area-inset-bottom), 16px)",
            maxHeight:     "100dvh",
            overflowY:     "auto",
          }}
        >
          {/* ── Logo with breathing pulse + neon glow ── */}
          <motion.div
            animate={
              phase === "generating"
                ? { scale: [0.98, 1.02, 0.98] }
                : { scale: 1 }
            }
            transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
            className="relative mt-2"
            style={{ width: 220, maxWidth: "62vw" }}
          >
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  "radial-gradient(circle at 50% 42%, rgba(168,85,247,0.45), rgba(59,130,246,0.18) 45%, transparent 70%)",
                filter: "blur(26px)",
              }}
            />
            <img
              src={logoUrl}
              alt="SOCIA"
              className="relative w-full select-none"
              draggable={false}
              style={{ mixBlendMode: "screen" }}
            />
          </motion.div>

          {phase === "failed" ? (
            <FailedBlock
              error={error}
              onRetry={() => { const r = retry; dismiss(); r?.(); }}
              onClose={dismiss}
            />
          ) : (
            <>
              {/* ── AI thinking message ── */}
              <h2
                className="mt-1 text-center text-[22px] font-bold leading-tight"
                style={{
                  background: NEON,
                  WebkitBackgroundClip: "text",
                  backgroundClip: "text",
                  color: "transparent",
                }}
              >
                AI is creating your content
                <span style={{ color: "#ec4899" }}>{dots}</span>
              </h2>

              {/* ── Rotating status pill ── */}
              <div className="mt-4 h-9">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={phase === "completed" ? "done" : msgIdx}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.3 }}
                    className="flex items-center gap-2 rounded-full px-4 py-1.5"
                    style={{
                      background: "rgba(255,255,255,0.04)",
                      border: "1px solid rgba(168,85,247,0.35)",
                    }}
                  >
                    <Sparkles style={{ width: 14, height: 14, color: "#c084fc" }} />
                    <span className="text-[13px] font-medium text-white/90">
                      {phase === "completed" ? "Opening Result…" : messages[msgIdx]}
                    </span>
                  </motion.div>
                </AnimatePresence>
              </div>

              {/* ── Progress bar ── */}
              <div className="mt-5 flex w-full items-center gap-3">
                <div
                  className="relative h-3 flex-1 overflow-hidden rounded-full"
                  style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.06)" }}
                >
                  <motion.div
                    className="absolute inset-y-0 left-0 rounded-full"
                    style={{
                      background: NEON,
                      boxShadow: "0 0 14px rgba(168,85,247,0.8), 0 0 6px rgba(236,72,153,0.7)",
                    }}
                    animate={{ width: `${pct}%` }}
                    transition={{ ease: "easeOut", duration: 0.2 }}
                  />
                </div>
                <span
                  className="w-12 text-right text-[17px] font-bold tabular-nums"
                  style={{ color: phase === "completed" ? "#22d3ee" : "#60a5fa" }}
                >
                  {pct}%
                </span>
              </div>

              {/* ── Stat cards: Estimated Time · AI Model · Process ── */}
              <div className="mt-5 grid w-full grid-cols-3 gap-2.5">
                <StatCard
                  Icon={Clock}
                  iconColor="#ec4899"
                  title="Estimated Time"
                  value={phase === "completed" ? "Done" : fmtTime(remaining)}
                  valueColor="#f472b6"
                />
                <StatCard
                  Icon={Cpu}
                  iconColor="#a855f7"
                  title="AI Model"
                  value={model}
                  valueColor="#c084fc"
                />
                <StatCard
                  Icon={Sparkles}
                  iconColor="#3b82f6"
                  title="Process"
                  value={processLabel}
                  valueColor="#60a5fa"
                />
              </div>

              {/* ── Process flow tracker ── */}
              <div
                className="mt-5 w-full rounded-2xl p-3.5"
                style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.06)" }}
              >
                <p className="mb-3 text-center text-[10px] font-bold tracking-[0.18em] text-white/45">
                  WHAT&apos;S HAPPENING?
                </p>
                <div className="flex items-start justify-between">
                  {steps.map((step, i) => {
                    const done    = i < stepIdx || phase === "completed";
                    const current = i === stepIdx && phase === "generating";
                    const Icon    = done ? CheckCircle2 : step.Icon;
                    return (
                      <div key={step.label} className="flex flex-1 flex-col items-center gap-1.5">
                        <motion.div
                          className="grid place-items-center rounded-full"
                          style={{
                            width: 34, height: 34,
                            background: current
                              ? NEON
                              : done
                                ? "rgba(34,211,238,0.14)"
                                : "rgba(255,255,255,0.05)",
                            border: current
                              ? "none"
                              : done
                                ? "1px solid rgba(34,211,238,0.5)"
                                : "1px solid rgba(255,255,255,0.1)",
                            boxShadow: current ? "0 0 16px rgba(168,85,247,0.7)" : "none",
                          }}
                          animate={current ? { scale: [1, 1.12, 1] } : { scale: 1 }}
                          transition={{ duration: 1.4, repeat: current ? Infinity : 0 }}
                        >
                          <Icon
                            style={{
                              width: 16, height: 16,
                              color: current ? "#fff" : done ? "#22d3ee" : "rgba(255,255,255,0.35)",
                            }}
                          />
                        </motion.div>
                        <span
                          className="whitespace-pre-line text-center text-[8.5px] font-medium leading-tight"
                          style={{
                            color: current ? "#f472b6" : done ? "rgba(34,211,238,0.85)" : "rgba(255,255,255,0.4)",
                          }}
                        >
                          {step.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* ── Tip ── */}
              <div className="mt-4 flex items-center gap-2 px-2 text-center">
                <Lightbulb style={{ width: 14, height: 14, color: "#fbbf24", flexShrink: 0 }} />
                <p className="text-[11px] leading-snug text-white/45">
                  <span className="font-semibold text-white/60">TIP </span>
                  Good things take time. AI is crafting something amazing for you.
                </p>
              </div>

              {/* ── Run in background (preserves existing render feature) ── */}
              {onBackground && phase === "generating" && (
                <button
                  onClick={() => { const fn = onBackground; dismiss(); fn?.(); }}
                  className="mt-3 rounded-full px-4 py-1.5 text-[12px] font-medium text-white/55 transition-colors"
                  style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
                >
                  Run in background
                </button>
              )}
            </>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

/* ── Sub-components ──────────────────────────────────────────────────────── */

function StatCard({
  Icon, iconColor, title, value, valueColor,
}: {
  Icon: typeof Clock; iconColor: string; title: string; value: string; valueColor: string;
}) {
  return (
    <div
      className="flex flex-col items-center gap-1 rounded-2xl px-1.5 py-3"
      style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.06)" }}
    >
      <Icon style={{ width: 18, height: 18, color: iconColor }} />
      <span className="text-center text-[9px] font-medium leading-tight text-white/45">{title}</span>
      <span
        className="max-w-full truncate text-center text-[12px] font-bold leading-tight"
        style={{ color: valueColor }}
        title={value}
      >
        {value}
      </span>
    </div>
  );
}

function FailedBlock({
  error, onRetry, onClose,
}: {
  error: string | null; onRetry: () => void; onClose: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="mt-4 flex w-full flex-col items-center"
    >
      <div
        className="grid place-items-center rounded-full"
        style={{ width: 56, height: 56, background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.5)" }}
      >
        <X style={{ width: 28, height: 28, color: "#f87171" }} />
      </div>
      <h2 className="mt-4 text-center text-[22px] font-bold text-white">Generation Failed</h2>
      <p className="mt-1 text-center text-[13px] text-white/55">
        {error || "Something went wrong. Please try again."}
      </p>
      <div className="mt-6 flex w-full max-w-xs flex-col gap-2.5">
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={onRetry}
          className="flex items-center justify-center gap-2 rounded-[14px] py-3 text-[15px] font-bold text-white"
          style={{ background: NEON, boxShadow: "0 6px 22px -8px rgba(168,85,247,0.7)" }}
        >
          <RotateCcw style={{ width: 17, height: 17 }} />
          Retry
        </motion.button>
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={onClose}
          className="rounded-[14px] py-2.5 text-[13px] font-medium text-white/60"
          style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
        >
          Dismiss
        </motion.button>
      </div>
    </motion.div>
  );
}
