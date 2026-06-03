import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, Sparkles, Wand2, ChevronDown, X, Crown, AlertCircle,
  SlidersHorizontal, Play, Download, Share2, Trash2, RefreshCw,
  Check, Film, Camera, Lightbulb, MoveHorizontal, ZoomIn, ZoomOut,
  RotateCcw, Video, Clapperboard,
} from "lucide-react";
import { generateVideo, GenResult } from "@/lib/ai";
import { useAIGeneration } from "@/lib/aiGenerationStore";
import { saveToDevice } from "@/lib/download";
import { useAppStore } from "@/lib/store";
import { VideoPlayerModal } from "@/components/ui/VideoPlayerModal";
import { SendPromptSheet } from "@/components/create/SendPromptSheet";

/* ─────────────────────────────────────────────────────────────
   CONSTANTS
───────────────────────────────────────────────────────────── */
const STYLES = [
  "Cinematic",
  "Photoreal",
  "Anime",
  "3D Render",
  "Surreal",
  "Luxury Ad",
  "Editorial",
  "Noir",
  "Sci-Fi",
  "Vintage Film",
] as const;
type StyleId = typeof STYLES[number];

const ASPECTS = [
  { id: "1:1",  label: "1:1",  w: 1,  h: 1,  name: "Square"  },
  { id: "4:5",  label: "4:5",  w: 4,  h: 5,  name: "Portrait"},
  { id: "9:16", label: "9:16", w: 9,  h: 16, name: "Story"   },
  { id: "16:9", label: "16:9", w: 16, h: 9,  name: "Wide"    },
] as const;
type AspectId = typeof ASPECTS[number]["id"];

const DURATION_PRESETS = [5, 10] as const;

const CAMERA_MOTIONS = [
  { id: "pan-left",  label: "Pan Left",  Icon: MoveHorizontal, prompt: "camera slowly panning left" },
  { id: "pan-right", label: "Pan Right", Icon: MoveHorizontal, prompt: "camera slowly panning right" },
  { id: "zoom-in",   label: "Zoom In",   Icon: ZoomIn,         prompt: "cinematic dolly push in" },
  { id: "zoom-out",  label: "Zoom Out",  Icon: ZoomOut,        prompt: "camera pulling back revealing the scene" },
  { id: "orbit",     label: "Orbit",     Icon: RotateCcw,      prompt: "cinematic orbit around subject" },
  { id: "handheld",  label: "Handheld",  Icon: Camera,         prompt: "handheld documentary camera movement" },
  { id: "static",    label: "Static",    Icon: Clapperboard,   prompt: "static locked-off tripod shot" },
] as const;
type MotionId = typeof CAMERA_MOTIONS[number]["id"];

const MOTION_STRENGTHS = ["Subtle", "Medium", "Strong"] as const;
type StrengthId = typeof MOTION_STRENGTHS[number];

const PROMPT_CHIPS = [
  "Drone Shot",
  "Slow Motion",
  "Cinematic Lighting",
  "Hyper Real",
  "Film Grain",
  "Bokeh",
  "4K Ultra HD",
] as const;

const EXAMPLES = [
  "cinematic portrait of a woman in golden hour fog, depth of field",
  "luxury sports car driving through neon-lit rain-soaked streets at night",
  "drone shot over snow-capped mountain peaks at sunrise, epic scale",
  "slow motion macro of a rose petal falling into clear water",
  "futuristic city skyline at night with holographic billboards glowing",
  "fashion editorial, model in red coat walks through autumn forest",
  "underwater coral reef with colorful tropical fish, god rays",
  "vintage film aesthetic, couple in a café, warm tungsten light",
];

const VIDEO_STAGES = [
  { key: "compose",  label: "Composing scene",    threshold: 0.00 },
  { key: "keyframe", label: "Generating keyframe", threshold: 0.08 },
  { key: "animate",  label: "Animating",           threshold: 0.22 },
  { key: "render",   label: "Rendering frames",    threshold: 0.50 },
  { key: "encode",   label: "Encoding video",      threshold: 0.80 },
  { key: "upload",   label: "Uploading",           threshold: 0.94 },
];

/* ─────────────────────────────────────────────────────────────
   ASPECT RECT PREVIEW
───────────────────────────────────────────────────────────── */
function AspectRect({ w, h, active }: { w: number; h: number; active: boolean }) {
  const maxW = 22, maxH = 28;
  const scale = Math.min(maxW / w, maxH / h);
  const pw = Math.max(8, Math.round(w * scale));
  const ph = Math.max(8, Math.round(h * scale));
  return (
    <div
      style={{ width: pw, height: ph }}
      className={`rounded-[2px] border-[1.5px] transition-colors ${
        active
          ? "border-pink-400/80"
          : "border-white/22"
      }`}
    />
  );
}

/* ═══════════════════════════════════════════════════════════
   MAIN PAGE
══════════════════════════════════════════════════════════ */
export default function CreatePromptVideo() {
  const [, navigate] = useLocation();
  const activePrompt = useAppStore((s) => s.activePrompt);
  const setActivePrompt = useAppStore((s) => s.setActivePrompt);

  /* core state */
  const [prompt, setPrompt] = useState(activePrompt || "");
  const [style, setStyle] = useState<StyleId>("Cinematic");
  const [aspect, setAspect] = useState<AspectId>(
    () => (localStorage.getItem("socia_last_video_aspect") as AspectId) || "9:16",
  );
  const [duration, setDuration] = useState<5 | 10>(5);

  /* pro controls */
  const [showPro, setShowPro] = useState(false);
  const [cameraMotion, setCameraMotion] = useState<MotionId | "">("");
  const [motionStrength, setMotionStrength] = useState<StrengthId>("Medium");
  const [negPrompt, setNegPrompt] = useState("");
  const [seed, setSeed] = useState("");
  const [showNeg, setShowNeg] = useState(false);

  /* ui helpers */
  const [showExamples, setShowExamples] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);

  /* generation */
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<GenResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isQuotaError, setIsQuotaError] = useState(false);

  /* result ui */
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "done">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [videoOpen, setVideoOpen] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);

  useEffect(() => { setPrompt(activePrompt || ""); }, [activePrompt]);
  useEffect(() => () => setActivePrompt(""), [setActivePrompt]);
  useEffect(() => { localStorage.setItem("socia_last_video_aspect", aspect); }, [aspect]);

  const wordCount = prompt.trim() ? prompt.trim().split(/\s+/).length : 0;
  const canGenerate = !loading && prompt.trim().length > 0;

  /* build final prompt with camera modifiers */
  const buildFinalPrompt = useCallback(() => {
    let p = prompt.trim();
    if (cameraMotion) {
      const motion = CAMERA_MOTIONS.find((m) => m.id === cameraMotion);
      if (motion) p += `, ${motion.prompt}`;
    }
    if (motionStrength !== "Medium") {
      p += `, ${motionStrength.toLowerCase()} camera motion`;
    }
    return p;
  }, [prompt, cameraMotion, motionStrength]);

  /* add a chip to the prompt */
  const addChip = (chip: string) => {
    setPrompt((prev) => {
      const base = prev.trim().replace(/,\s*$/, "");
      return base ? `${base}, ${chip}` : chip;
    });
    taRef.current?.focus();
  };

  /* generate */
  const handleGenerate = useCallback(async () => {
    if (!canGenerate) return;
    setLoading(true);
    setError(null);
    setIsQuotaError(false);
    setResult(null);
    setSaveError(null);
    const aiGen = useAIGeneration.getState();
    aiGen.start({ kind: "video", model: "Kling 1.6 Pro", retry: handleGenerate });
    try {
      const r = await generateVideo(buildFinalPrompt(), {
        style,
        aspect,
        durationSec: duration,
        negativePrompt: negPrompt.trim() || undefined,
        seed: seed || undefined,
      });
      setResult(r);
      aiGen.succeed();
    } catch (err: unknown) {
      const e = err as { message?: string; code?: string };
      setError(e.message || "Generation failed. Please try again.");
      setIsQuotaError(e.code === "QUOTA_EXCEEDED");
      aiGen.fail(e.message || "Generation failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [canGenerate, buildFinalPrompt, style, aspect, duration, negPrompt, seed]);

  /* save */
  const handleSave = useCallback(async () => {
    if (!result || saveStatus === "saving") return;
    setSaveStatus("saving");
    setSaveError(null);
    try {
      const url = result.videoUrl || result.url;
      const kind: "image" | "video" = result.videoUrl ? "video" : "image";
      await saveToDevice(url, { kind, filename: result.prompt });
      setSaveStatus("done");
      setTimeout(() => setSaveStatus("idle"), 2000);
    } catch (e: unknown) {
      setSaveError((e as { message?: string }).message || "Could not save. Try again.");
      setSaveStatus("idle");
    }
  }, [result, saveStatus]);

  const activeAspect = ASPECTS.find((a) => a.id === aspect) || ASPECTS[2];

  return (
    <div className="relative flex h-full flex-col bg-[#08080f]">

      {/* ── HEADER ──────────────────────────────────────────── */}
      <div
        className="sticky top-0 z-20 flex items-center gap-3 border-b border-white/[0.04] bg-[#000000] px-4"
        style={{ paddingTop: `calc(env(safe-area-inset-top,0px) + 12px)`, paddingBottom: 12 }}
      >
        <button
          onClick={() => navigate("/create")}
          className="grid h-9 w-9 place-items-center rounded-full border border-white/[0.06] bg-[#0a0a0a] text-white/60 transition hover:bg-[#141414]"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1">
          <h2 className="text-[14px] font-semibold tracking-tight text-white">Prompt to Video</h2>
          <p className="text-[11px] text-white/30">AI filmmaking · Kling 1.6 Pro</p>
        </div>
        <button
          onClick={() => setShowPro((v) => !v)}
          className={`flex h-8 items-center gap-1.5 rounded-lg border px-3 text-[11px] font-medium transition ${
            showPro
              ? "border-pink-500/40 bg-pink-900/20 text-pink-200"
              : "border-white/[0.07] text-white/40 hover:border-white/[0.12] hover:text-white/60"
          }`}
        >
          <SlidersHorizontal className="h-3 w-3" />
          Controls
        </button>
      </div>

      {/* ── SCROLL BODY ─────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto pb-44 hide-scrollbar">

        {/* ── PROMPT BOX ────────────────────────────────────── */}
        <div className="px-4 pt-5">
          <div className="overflow-hidden rounded-2xl border border-white/[0.1] bg-white/[0.04] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] [&:focus-within]:border-pink-500/35 transition-colors duration-200">

            {/* Top bar */}
            <div className="flex items-center justify-between border-b border-white/[0.05] px-4 py-2.5">
              <div className="flex items-center gap-2">
                <Film className="h-3 w-3 text-pink-400/70" />
                <span className="text-[10px] font-semibold uppercase tracking-widest text-white/35">
                  Scene Description
                </span>
              </div>
              <div className="flex items-center gap-2.5">
                <span className={`text-[10px] tabular-nums ${wordCount > 60 ? "text-amber-400/70" : "text-white/20"}`}>
                  {wordCount} words
                </span>
                <button
                  onClick={() => setShowExamples((v) => !v)}
                  className="flex items-center gap-1 rounded-md border border-white/[0.06] bg-white/[0.03] px-2 py-1 text-[10px] text-white/40 transition hover:bg-white/[0.06]"
                >
                  <Lightbulb className="h-2.5 w-2.5" />
                  Examples
                </button>
              </div>
            </div>

            {/* Examples */}
            <AnimatePresence>
              {showExamples && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden border-b border-white/[0.05]"
                >
                  <div className="flex flex-col gap-0.5 px-4 py-3">
                    {EXAMPLES.map((ex) => (
                      <button
                        key={ex}
                        onClick={() => { setPrompt(ex); setShowExamples(false); taRef.current?.focus(); }}
                        className="rounded-lg px-3 py-2 text-left text-[12px] leading-relaxed text-white/45 transition hover:bg-white/[0.04] hover:text-white/70"
                      >
                        {ex}
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Textarea */}
            <div className="relative px-4 py-4">
              <textarea
                ref={taRef}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={4}
                placeholder="Describe the cinematic scene you want to generate…"
                className="w-full resize-none bg-transparent text-[14px] leading-[1.7] text-white/85 placeholder:text-white/22 focus:outline-none"
              />
            </div>

            {/* Prompt chips */}
            <div className="border-t border-white/[0.05] px-4 py-3">
              <div className="hide-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5">
                {PROMPT_CHIPS.map((chip) => (
                  <button
                    key={chip}
                    onClick={() => addChip(chip)}
                    className="shrink-0 rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1 text-[10px] font-medium text-white/45 transition hover:border-pink-500/25 hover:bg-pink-900/10 hover:text-pink-200/80"
                  >
                    {chip}
                  </button>
                ))}
              </div>
            </div>

            {/* Bottom bar */}
            <div className="flex items-center gap-2 border-t border-white/[0.05] px-4 py-2.5">
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={() => {
                  if (!prompt.trim()) return;
                  const hint = `cinematic color grading, anamorphic lens flare, film grain, depth of field, ${style} aesthetic`;
                  const base = prompt.trim().replace(/[,;]+$/, "");
                  setPrompt(`${base}, ${hint}`);
                  taRef.current?.focus();
                }}
                disabled={!prompt.trim()}
                className="flex h-7 items-center gap-1.5 rounded-md border border-white/[0.08] bg-white/[0.04] px-3 text-[11px] font-medium text-white/50 disabled:opacity-30 transition hover:bg-white/[0.07] hover:text-white/70"
              >
                <Wand2 className="h-3 w-3" />
                Enhance
              </motion.button>
              {prompt.trim() && (
                <button
                  onClick={() => setPrompt("")}
                  className="ml-auto grid h-7 w-7 place-items-center rounded-md text-white/20 transition hover:text-white/45"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ── STYLE SELECTOR ────────────────────────────────── */}
        <div className="mt-6">
          <p className="mb-3 px-4 text-[10px] font-semibold uppercase tracking-widest text-white/30">
            Visual Style
          </p>
          <div className="hide-scrollbar flex gap-2 overflow-x-auto px-4 pb-0.5">
            {STYLES.map((s) => {
              const active = style === s;
              return (
                <motion.button
                  key={s}
                  whileTap={{ scale: 0.94 }}
                  onClick={() => setStyle(s)}
                  className={`relative shrink-0 rounded-full border px-4 py-2 text-[12px] font-medium transition-all ${
                    active
                      ? "border-pink-500/40 bg-[linear-gradient(135deg,rgba(168,85,247,0.25),rgba(236,72,153,0.2),rgba(59,130,246,0.2))] text-white shadow-[0_0_16px_-4px_rgba(236,72,153,0.4)]"
                      : "border-white/[0.08] bg-white/[0.03] text-white/50 hover:border-white/[0.14] hover:text-white/70"
                  }`}
                >
                  {s}
                </motion.button>
              );
            })}
          </div>
        </div>

        {/* ── ASPECT RATIO ──────────────────────────────────── */}
        <div className="mt-6 px-4">
          <p className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-white/30">
            Aspect Ratio
          </p>
          <div className="relative flex rounded-xl border border-white/[0.07] bg-white/[0.02] p-1">
            {ASPECTS.map((a) => {
              const active = aspect === a.id;
              return (
                <button
                  key={a.id}
                  onClick={() => setAspect(a.id)}
                  className="relative flex flex-1 flex-col items-center gap-2 rounded-lg py-3 transition-all"
                >
                  {active && (
                    <motion.div
                      layoutId="video-aspect-bg"
                      className="absolute inset-0 rounded-lg border border-pink-500/30 bg-[linear-gradient(135deg,rgba(168,85,247,0.18),rgba(236,72,153,0.12))]"
                      style={{ boxShadow: "0 0 10px -4px rgba(236,72,153,0.25)" }}
                      transition={{ type: "spring", stiffness: 420, damping: 32 }}
                    />
                  )}
                  <span className="relative z-10 flex items-center justify-center" style={{ height: 28 }}>
                    <AspectRect w={a.w} h={a.h} active={active} />
                  </span>
                  <span className={`relative z-10 text-[11px] font-semibold tabular-nums transition-colors ${active ? "text-white" : "text-white/35"}`}>
                    {a.label}
                  </span>
                  <span className={`relative z-10 text-[9px] leading-none transition-colors ${active ? "text-pink-300/60" : "text-white/18"}`}>
                    {a.name}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── DURATION ──────────────────────────────────────── */}
        <div className="mt-6 px-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-white/30">Duration</p>
            <span className="text-[11px] font-semibold text-white/50 tabular-nums">
              {duration}s
            </span>
          </div>

          {/* Preset buttons */}
          <div className="mb-4 flex gap-2">
            {DURATION_PRESETS.map((d) => {
              const active = duration === d;
              return (
                <button
                  key={d}
                  onClick={() => setDuration(d as 5 | 10)}
                  className={`relative flex flex-1 flex-col items-center gap-0.5 rounded-xl border py-3 transition-all ${
                    active
                      ? "border-pink-500/40 bg-[linear-gradient(135deg,rgba(168,85,247,0.2),rgba(236,72,153,0.15))] text-white"
                      : "border-white/[0.07] bg-white/[0.02] text-white/35 hover:border-white/[0.12] hover:text-white/55"
                  }`}
                >
                  <span className="text-[18px] font-bold leading-none tabular-nums">{d}</span>
                  <span className="text-[9px] leading-none opacity-60">seconds</span>
                  {active && (
                    <motion.div
                      layoutId="duration-active"
                      className="absolute inset-0 rounded-xl border border-pink-500/30"
                      style={{ boxShadow: "0 0 12px -4px rgba(236,72,153,0.3)" }}
                      transition={{ type: "spring", stiffness: 420, damping: 32 }}
                    />
                  )}
                </button>
              );
            })}
          </div>

          {/* Timeline-style slider */}
          <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] px-4 py-3.5">
            <div className="mb-2.5 flex justify-between text-[9px] text-white/20 tabular-nums">
              <span>0s</span>
              <span>5s</span>
              <span>10s</span>
            </div>
            <div className="relative h-5 flex items-center">
              {/* Track background */}
              <div className="absolute inset-x-0 h-[3px] rounded-full bg-white/[0.08]" />
              {/* Active track */}
              <div
                className="absolute left-0 h-[3px] rounded-full"
                style={{
                  width: `${((duration - 2) / 8) * 100}%`,
                  background: "linear-gradient(90deg, #a855f7, #ec4899, #3b82f6)",
                  boxShadow: "0 0 8px -1px rgba(236,72,153,0.5)",
                }}
              />
              {/* Range input */}
              <input
                type="range"
                min={2}
                max={10}
                step={1}
                value={duration}
                onChange={(e) => {
                  const v = parseInt(e.target.value) as 5 | 10;
                  setDuration(v >= 7 ? 10 : 5);
                }}
                className="absolute inset-x-0 h-full w-full cursor-pointer opacity-0"
              />
              {/* Custom thumb */}
              <div
                className="absolute h-4 w-4 -translate-x-1/2 rounded-full border-2 border-white bg-gradient-to-br from-purple-500 to-pink-500 shadow-[0_0_8px_rgba(236,72,153,0.6)]"
                style={{ left: `${((duration - 2) / 8) * 100}%` }}
              />
            </div>
          </div>
        </div>

        {/* ── PRO CONTROLS ──────────────────────────────────── */}
        <AnimatePresence>
          {showPro && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="mx-4 mt-5 overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.02]">

                {/* Header */}
                <div className="flex items-center gap-2 border-b border-white/[0.05] px-4 py-3">
                  <Video className="h-3.5 w-3.5 text-pink-400/50" />
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-white/30">
                    Camera Controls
                  </span>
                </div>

                {/* Camera Motion */}
                <div className="border-b border-white/[0.05] px-4 py-4">
                  <p className="mb-3 text-[10px] font-medium uppercase tracking-widest text-white/25">
                    Camera Motion
                  </p>
                  <div className="grid grid-cols-4 gap-1.5">
                    {CAMERA_MOTIONS.map(({ id, label, Icon: MIcon }) => {
                      const active = cameraMotion === id;
                      return (
                        <button
                          key={id}
                          onClick={() => setCameraMotion(cameraMotion === id ? "" : id)}
                          className={`flex flex-col items-center gap-1.5 rounded-xl border py-2.5 transition-all ${
                            active
                              ? "border-pink-500/40 bg-[linear-gradient(135deg,rgba(168,85,247,0.22),rgba(236,72,153,0.15))] text-pink-200"
                              : "border-white/[0.06] text-white/30 hover:border-white/[0.12] hover:text-white/55"
                          }`}
                        >
                          <MIcon className="h-3.5 w-3.5" strokeWidth={active ? 2 : 1.5} />
                          <span className="text-center text-[9px] font-medium leading-none">{label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Motion Strength */}
                <div className="border-b border-white/[0.05] px-4 py-4">
                  <p className="mb-3 text-[10px] font-medium uppercase tracking-widest text-white/25">
                    Motion Strength
                  </p>
                  <div className="flex gap-2">
                    {MOTION_STRENGTHS.map((s) => {
                      const active = motionStrength === s;
                      return (
                        <button
                          key={s}
                          onClick={() => setMotionStrength(s)}
                          className={`flex flex-1 items-center justify-center rounded-lg border py-2 text-[11px] font-medium transition-all ${
                            active
                              ? "border-pink-500/40 bg-[linear-gradient(135deg,rgba(168,85,247,0.2),rgba(236,72,153,0.14))] text-white"
                              : "border-white/[0.06] text-white/30 hover:border-white/[0.12]"
                          }`}
                        >
                          {s}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Negative Prompt */}
                <div className="border-b border-white/[0.05] px-4 py-3.5">
                  <button
                    onClick={() => setShowNeg((v) => !v)}
                    className="flex w-full items-center gap-1.5 text-[10px] text-white/25 transition hover:text-white/45"
                  >
                    <ChevronDown className={`h-3 w-3 transition-transform ${showNeg ? "rotate-180" : ""}`} />
                    <span className="uppercase tracking-widest font-medium">Negative Prompt</span>
                    <span className="ml-auto text-[9px]">{showNeg ? "hide" : "expand"}</span>
                  </button>
                  <AnimatePresence>
                    {showNeg && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                      >
                        <textarea
                          value={negPrompt}
                          onChange={(e) => setNegPrompt(e.target.value)}
                          rows={2}
                          placeholder="Exclude: blurry, distorted faces, watermark, overexposed…"
                          className="mt-2.5 w-full resize-none rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2.5 text-[12px] leading-relaxed text-white/55 placeholder:text-white/18 focus:outline-none focus:border-pink-500/25"
                        />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Seed */}
                <div className="px-4 py-3.5">
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] uppercase tracking-widest font-medium text-white/25">Seed</span>
                    <input
                      value={seed}
                      onChange={(e) => setSeed(e.target.value.replace(/\D/g, ""))}
                      placeholder="random"
                      className="flex-1 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-1.5 text-[11px] text-white/55 placeholder:text-white/18 focus:outline-none focus:border-pink-500/25"
                    />
                    {seed && (
                      <button onClick={() => setSeed("")} className="text-white/25 hover:text-white/45">
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Active summary */}
                {(cameraMotion || motionStrength !== "Medium") && (
                  <div className="border-t border-white/[0.05] px-4 py-2.5">
                    <p className="text-[10px] text-white/25">
                      {[cameraMotion && CAMERA_MOTIONS.find((m) => m.id === cameraMotion)?.label, motionStrength !== "Medium" && motionStrength].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── ERROR ─────────────────────────────────────────── */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className={`mx-4 mt-5 flex gap-3 rounded-xl border p-4 ${
                isQuotaError
                  ? "border-amber-500/20 bg-amber-500/[0.06]"
                  : "border-red-500/20 bg-red-500/[0.06]"
              }`}
            >
              {isQuotaError
                ? <Crown className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400/80" />
                : <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-400/80" />}
              <div className="flex-1">
                <p className="text-[12px] leading-relaxed text-white/65">{error}</p>
                {isQuotaError && (
                  <button
                    onClick={() => navigate("/billing/upgrade")}
                    className="mt-1.5 text-[11px] font-medium text-amber-400/80 underline"
                  >
                    Upgrade plan
                  </button>
                )}
              </div>
              <button onClick={() => setError(null)} className="text-white/20 hover:text-white/40">
                <X className="h-3.5 w-3.5" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── GENERATE BAR ────────────────────────────────────── */}
      <div
        className="sticky bottom-0 z-20 border-t border-white/[0.04] bg-[#000000] px-4 pt-3"
        style={{ paddingBottom: `calc(env(safe-area-inset-bottom,0px) + 16px)` }}
      >
        {/* Settings summary */}
        <div className="mb-2.5 flex flex-wrap gap-1.5">
          <span className="rounded-full border border-pink-500/20 bg-pink-900/15 px-2.5 py-0.5 text-[10px] text-pink-300/70">
            {style}
          </span>
          <span className="rounded-full border border-purple-500/20 bg-purple-900/15 px-2.5 py-0.5 text-[10px] text-purple-300/70">
            {aspect}
          </span>
          <span className="rounded-full border border-white/[0.07] bg-white/[0.03] px-2.5 py-0.5 text-[10px] text-white/35">
            {duration}s
          </span>
          {cameraMotion && (
            <span className="rounded-full border border-white/[0.07] bg-white/[0.03] px-2.5 py-0.5 text-[10px] text-white/35">
              {CAMERA_MOTIONS.find((m) => m.id === cameraMotion)?.label}
            </span>
          )}
        </div>

        <motion.button
          whileTap={{ scale: canGenerate ? 0.97 : 1 }}
          disabled={!canGenerate}
          onClick={handleGenerate}
          className={`relative flex w-full items-center justify-center gap-2.5 overflow-hidden rounded-2xl text-[15px] font-semibold text-white transition-all duration-200 ${
            canGenerate
              ? "bg-gradient-to-r from-purple-600 via-pink-500 to-blue-500 shadow-[0_6px_32px_-6px_rgba(236,72,153,0.55)] hover:shadow-[0_6px_40px_-4px_rgba(236,72,153,0.70)] hover:brightness-110"
              : "bg-white/[0.05] text-white/20 cursor-not-allowed"
          }`}
          style={{ height: 52 }}
        >
          {loading ? (
            <>
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-white/80" />
              Generating…
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4" />
              Generate Video
            </>
          )}
        </motion.button>
      </div>

      {/* ── OVERLAYS ─────────────────────────────────────────── */}
      <AnimatePresence>
        {result && !loading && (
          <VideoResultOverlay
            result={result}
            aspect={activeAspect}
            saveStatus={saveStatus}
            saveError={saveError}
            onClose={() => setResult(null)}
            onSave={handleSave}
            onPlay={() => setVideoOpen(true)}
            onSend={() => setSendOpen(true)}
            onRegen={handleGenerate}
          />
        )}
      </AnimatePresence>

      {result?.videoUrl && (
        <VideoPlayerModal
          videoUrl={result.videoUrl}
          posterUrl={result.url}
          open={videoOpen}
          onClose={() => setVideoOpen(false)}
        />
      )}

      <AnimatePresence>
        {sendOpen && result && (
          <SendPromptSheet
            open={sendOpen}
            prompt={result.originalPrompt || result.prompt}
            onClose={() => setSendOpen(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   VIDEO LOADING OVERLAY
   - Two-stage feel (Image → Video) via video-specific stage labels
   - Longer tau for the 1-3 min video generation time
   - Premium dual-ring loader from the existing design system
══════════════════════════════════════════════════════════ */
function VideoLoadingOverlay() {
  const tau = 90_000;
  const startRef = useRef(performance.now());
  const lastRef = useRef(0);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const elapsed = performance.now() - startRef.current;
      const next = Math.min(0.97, 1 - Math.exp(-elapsed / tau));
      if (next > lastRef.current) { lastRef.current = next; setProgress(next); }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const stage = VIDEO_STAGES.reduce((acc, s) => (progress >= s.threshold ? s : acc), VIDEO_STAGES[0]);
  const pct = Math.round(progress * 100);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-8"
      style={{ background: "rgba(8,8,15,0.96)" }}
    >
      {/* Dual-ring cinematic loader */}
      <div className="relative" style={{ width: 96, height: 96 }}>
        {/* Outer glow */}
        <div
          className="pointer-events-none absolute -inset-4 rounded-full"
          style={{
            background: "radial-gradient(circle, rgba(168,85,247,0.4), rgba(236,72,153,0.25) 45%, transparent 70%)",
            filter: "blur(16px)",
            animation: "socia-loader-pulse 2.4s ease-in-out infinite",
          }}
        />
        {/* Outer ring */}
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background: "conic-gradient(from 0deg, transparent 0deg, transparent 200deg, rgba(168,85,247,0.9) 280deg, rgba(236,72,153,1) 330deg, rgba(59,130,246,0.9) 360deg)",
            WebkitMask: "radial-gradient(circle, transparent 34px, #000 36px)",
            mask: "radial-gradient(circle, transparent 34px, #000 36px)",
            animation: "socia-loader-spin 1.4s linear infinite",
            willChange: "transform",
          }}
        />
        {/* Inner ring */}
        <div
          className="absolute rounded-full"
          style={{
            inset: 13,
            background: "conic-gradient(from 180deg, transparent 0deg, transparent 240deg, rgba(59,130,246,0.8) 320deg, rgba(168,85,247,0.9) 360deg)",
            WebkitMask: "radial-gradient(circle, transparent 22px, #000 24px)",
            mask: "radial-gradient(circle, transparent 22px, #000 24px)",
            animation: "socia-loader-spin-reverse 2.2s linear infinite",
            willChange: "transform",
          }}
        />
        {/* Core pct */}
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5">
          <span className="text-[13px] font-bold tabular-nums text-white/75">{pct}%</span>
        </div>
      </div>

      {/* Stage label */}
      <div className="flex flex-col items-center gap-2">
        <AnimatePresence mode="wait" initial={false}>
          <motion.p
            key={stage.key}
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            transition={{ duration: 0.25 }}
            className="text-[14px] font-medium text-white/75"
          >
            {stage.label}…
          </motion.p>
        </AnimatePresence>

        {/* Progress bar */}
        <div className="h-[3px] w-52 overflow-hidden rounded-full bg-white/[0.08]">
          <motion.div
            className="h-full rounded-full"
            style={{ background: "linear-gradient(90deg,#a855f7,#ec4899,#3b82f6)" }}
            animate={{ width: `${(progress * 100).toFixed(1)}%` }}
            transition={{ duration: 0.6, ease: "easeOut" }}
          />
        </div>

        <p className="text-[11px] text-white/28 text-center px-8 mt-1">
          Video generation takes 1–3 minutes
        </p>
      </div>
    </motion.div>
  );
}

/* ═══════════════════════════════════════════════════════════
   VIDEO RESULT OVERLAY
══════════════════════════════════════════════════════════ */
function VideoResultOverlay({
  result, aspect, saveStatus, saveError,
  onClose, onSave, onPlay, onSend, onRegen,
}: {
  result: GenResult;
  aspect: typeof ASPECTS[number];
  saveStatus: "idle" | "saving" | "done";
  saveError: string | null;
  onClose: () => void;
  onSave: () => void;
  onPlay: () => void;
  onSend: () => void;
  onRegen: () => void;
}) {
  const hasVideo = Boolean(result.videoUrl);
  const ratio = `${aspect.w}/${aspect.h}`;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="absolute inset-0 z-30 flex flex-col bg-[#06060e]"
    >
      {/* Top bar */}
      <div
        className="flex items-center justify-between px-4"
        style={{ paddingTop: `calc(env(safe-area-inset-top,0px) + 12px)`, paddingBottom: 12 }}
      >
        <button
          onClick={onClose}
          className="grid h-9 w-9 place-items-center rounded-full border border-white/[0.08] bg-white/[0.04] text-white/50"
        >
          <X className="h-4 w-4" />
        </button>
        <div className="flex items-center gap-2">
          <div className="h-1.5 w-1.5 rounded-full bg-pink-400 shadow-[0_0_6px_rgba(236,72,153,0.8)]" />
          <span className="text-[13px] font-semibold text-white/80">
            {hasVideo ? "Video Ready" : "Frame Ready"}
          </span>
        </div>
        <div className="w-9" />
      </div>

      {/* Thumbnail */}
      <div className="flex flex-1 items-center justify-center overflow-hidden px-5">
        <div
          className="relative w-full max-w-xs overflow-hidden rounded-2xl border border-white/[0.1] shadow-[0_20px_60px_-20px_rgba(168,85,247,0.5)]"
          style={{ aspectRatio: ratio }}
        >
          <motion.img
            src={result.url}
            alt={result.prompt}
            initial={{ opacity: 0, filter: "blur(16px)", scale: 1.03 }}
            animate={{ opacity: 1, filter: "blur(0px)", scale: 1 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="absolute inset-0 h-full w-full object-cover"
            decoding="async"
          />
          {/* Play button */}
          {hasVideo && (
            <button onClick={onPlay} className="absolute inset-0 grid place-items-center">
              <motion.span
                initial={{ scale: 0.7, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.25, type: "spring", stiffness: 300, damping: 22 }}
                className="grid h-14 w-14 place-items-center rounded-full border border-white/20 bg-gradient-to-br from-purple-600/80 via-pink-500/80 to-blue-500/80"
              >
                <Play className="h-5 w-5 fill-white text-white ml-0.5" />
              </motion.span>
            </button>
          )}
          {result.durationSec && (
            <span className="absolute right-2 top-2 rounded-full bg-[#000000] px-2 py-0.5 text-[10px] font-semibold text-white/80">
              {result.durationSec}s
            </span>
          )}
        </div>
      </div>

      {/* Prompt preview */}
      {result.originalPrompt && (
        <div className="mx-4 mt-3">
          <p className="line-clamp-2 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5 text-[11px] leading-relaxed text-white/35">
            {result.originalPrompt}
          </p>
        </div>
      )}

      {/* Save error */}
      {saveError && (
        <div className="mx-4 mt-2 rounded-xl border border-red-500/20 bg-red-500/[0.06] px-3 py-2 text-[11px] text-red-300/80">
          {saveError}
        </div>
      )}

      {/* Actions */}
      <div
        className="mt-3 grid grid-cols-4 gap-2 px-4"
        style={{ paddingBottom: `calc(env(safe-area-inset-bottom,0px) + 16px)` }}
      >
        <VideoActionBtn onClick={onClose} icon={<Trash2 className="h-4 w-4" />} label="Discard" />
        <VideoActionBtn onClick={onSend} icon={<Share2 className="h-4 w-4" />} label="Share" />
        <VideoActionBtn onClick={onRegen} icon={<RefreshCw className="h-4 w-4" />} label="Remix" />
        <VideoActionBtn
          onClick={onSave}
          primary
          icon={
            saveStatus === "done"
              ? <Check className="h-4 w-4" />
              : saveStatus === "saving"
                ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/25 border-t-white/80" />
                : <Download className="h-4 w-4" />
          }
          label={saveStatus === "done" ? "Saved" : saveStatus === "saving" ? "Saving…" : "Download"}
          active={saveStatus === "done"}
        />
      </div>
    </motion.div>
  );
}

function VideoActionBtn({
  onClick, icon, label, primary, active,
}: { onClick: () => void; icon: React.ReactNode; label: string; primary?: boolean; active?: boolean }) {
  return (
    <motion.button
      whileTap={{ scale: 0.94 }}
      onClick={onClick}
      className={`flex flex-col items-center gap-1.5 rounded-xl border py-3 text-white transition-all ${
        primary || active
          ? "border-pink-500/30 bg-gradient-to-b from-purple-600/30 to-pink-500/20 shadow-[0_4px_16px_-4px_rgba(236,72,153,0.3)]"
          : "border-white/[0.07] bg-white/[0.03]"
      }`}
    >
      <span className={primary || active ? "text-pink-200" : "text-white/50"}>{icon}</span>
      <span className={`text-[10px] font-medium ${primary || active ? "text-pink-200/90" : "text-white/45"}`}>
        {label}
      </span>
    </motion.button>
  );
}
