import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, Upload, Sparkles, X, Save, Share2, Trash2,
  Loader2, Play, AlertCircle, Send, CheckCircle2, Crown,
} from "lucide-react";
import { SendPromptSheet } from "@/components/create/SendPromptSheet";
import { useAppStore } from "@/lib/store";
import {
  generateImage, generateVideo, imageToVideo,
  GenResult,
} from "@/lib/ai";
import { saveToDevice } from "@/lib/download";
import { supabase } from "@/lib/supabase";
import { VideoPlayerModal } from "@/components/ui/VideoPlayerModal";

export type GeneratorMode = "prompt-image" | "prompt-video" | "image-video";

interface Props {
  mode: GeneratorMode;
  title: string;
  subtitle: string;
}

const STYLES = ["Cinematic", "Anime", "3D Render", "Photoreal", "Surreal", "Glitch"];
const ASPECTS: Array<"1:1" | "9:16" | "16:9"> = ["1:1", "9:16", "16:9"];

export function Generator({ mode, title, subtitle }: Props) {
  const [, navigate] = useLocation();
  const activePrompt = useAppStore((s) => s.activePrompt);
  const setActivePrompt = useAppStore((s) => s.setActivePrompt);
  const user = useAppStore((s) => s.user);

  const [prompt, setPrompt] = useState(activePrompt);
  const [style, setStyle] = useState<string>("Cinematic");
  const [aspect, setAspect] = useState<"1:1" | "9:16" | "16:9">("9:16");
  const [duration, setDuration] = useState(5);
  const [image, setImage] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isQuotaError, setIsQuotaError] = useState(false);
  const [result, setResult] = useState<GenResult | null>(null);
  const [resultVideoOpen, setResultVideoOpen] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "done">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);

  const isVideoMode = mode !== "prompt-image";

  // Preload the result image as soon as we have a URL so the ResultOverlay
  // mounts with a fully-decoded bitmap — no perceived flash, no jank.
  useEffect(() => {
    if (!result?.url) return;
    const img = new Image();
    img.decoding = "async";
    img.src = result.url;
    img.decode?.().catch(() => {});
  }, [result?.url]);

  useEffect(() => { setPrompt(activePrompt); }, [activePrompt]);
  useEffect(() => () => setActivePrompt(""), [setActivePrompt]);

  const canGenerate =
    !loading &&
    (["prompt-image", "prompt-video"].includes(mode) ? prompt.trim().length > 0 : true) &&
    (mode === "image-video" ? Boolean(image) : true);

  const generate = async () => {
    if (!canGenerate) return;
    setLoading(true);
    setError(null);
    setIsQuotaError(false);
    setResult(null);

    try {
      let r: GenResult;
      if (mode === "prompt-image") r = await generateImage(prompt, { aspect, style });
      else if (mode === "prompt-video") r = await generateVideo(prompt, { aspect, style, durationSec: duration });
      else r = await imageToVideo(image!, prompt, { aspect, style, durationSec: duration });
      setResult(r);
    } catch (err: unknown) {
      const e = err as { message?: string; code?: string };
      setError(e.message || "Generation failed. Please try again.");
      setIsQuotaError(e.code === "QUOTA_EXCEEDED");
    } finally {
      setLoading(false);
    }
  };

  // Save = download to the user's device at original quality. NOTHING else.
  // Posting to the feed is a separate action (kept off this button on purpose
  // so users don't accidentally publish their creations).
  const onSave = async () => {
    if (!result || saveStatus === "saving") return;
    setSaveStatus("saving");
    setSaveError(null);

    try {
      const downloadUrl = result.videoUrl || result.url;
      const kind: "image" | "video" = result.videoUrl ? "video" : "image";
      await saveToDevice(downloadUrl, { kind, filename: result.prompt });
      setSaveStatus("done");
      // Auto-dismiss the success overlay so the user stays on their result —
      // no surprise navigation to the feed.
      setTimeout(() => setSaveStatus("idle"), 1600);
    } catch (err) {
      const e = err as { message?: string };
      setSaveError(e.message || "Couldn't save to your device. Try again.");
      setSaveStatus("idle");
    }
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div
        className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-white/[0.04] bg-[#000000] px-4"
        style={{ paddingTop: `calc(env(safe-area-inset-top, 0px) + 12px)`, paddingBottom: 12 }}
      >
        <button onClick={() => navigate("/create")} className="grid h-9 w-9 place-items-center rounded-full bg-[#0a0a0a] border border-white/[0.06]">
          <ArrowLeft className="h-4 w-4 text-white" />
        </button>
        <div className="min-w-0 flex-1 text-center">
          <h2 className="font-display text-base font-semibold text-white truncate">{title}</h2>
          <p className="text-[11px] text-white/50 truncate">{subtitle}</p>
        </div>
        <div className="w-9" />
      </div>

      <div className="flex-1 overflow-y-auto px-5 pb-36 pt-5 hide-scrollbar">
        {/* Upload tiles */}
        {mode === "image-video" && (
          <UploadTile label="Source image" image={image} onChange={setImage} className="mb-4" />
        )}

        {/* Prompt */}
        {(["prompt-image", "prompt-video"].includes(mode) || image) && (
          <div className="card-premium mb-4 rounded-2xl p-4">
            <label className="mb-2 block text-[11px] font-semibold uppercase tracking-wider text-white/55">
              Prompt
            </label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={3}
              placeholder="describe the world you want to see…"
              className="w-full resize-none bg-transparent text-base leading-relaxed text-white placeholder:text-white/30 focus:outline-none"
            />
          </div>
        )}

        {/* Style */}
        <div className="mb-4">
          <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-white/55">Style</h4>
          <div className="hide-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5">
            {STYLES.map((s) => (
              <Chip key={s} active={style === s} onClick={() => setStyle(s)}>{s}</Chip>
            ))}
          </div>
        </div>

        {/* Aspect */}
        <div className="mb-4">
          <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-white/55">Aspect</h4>
          <div className="flex gap-2">
            {ASPECTS.map((a) => (
              <Chip key={a} active={aspect === a} onClick={() => setAspect(a)}>{a}</Chip>
            ))}
          </div>
        </div>

        {/* Duration */}
        {isVideoMode && (
          <div className="mb-4">
            <div className="mb-2 flex items-center justify-between">
              <h4 className="text-[11px] font-semibold uppercase tracking-wider text-white/55">Duration</h4>
              <span className="text-xs text-white/70">{duration}s</span>
            </div>
            <input
              type="range" min={2} max={10} value={duration}
              onChange={(e) => setDuration(parseInt(e.target.value))}
              className="w-full accent-pink-500"
            />
          </div>
        )}

        {/* Error */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
              className={
                "mb-4 flex gap-3 rounded-2xl border p-4 " +
                (isQuotaError ? "border-yellow-500/30 bg-yellow-500/10" : "border-red-500/30 bg-red-500/10")
              }
            >
              {isQuotaError
                ? <Crown className="mt-0.5 h-4 w-4 shrink-0 text-yellow-400" />
                : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />}
              <div className="flex-1">
                <p className="text-xs leading-relaxed text-white/85">{error}</p>
                {isQuotaError && (
                  <button className="mt-2 text-[11px] font-semibold text-yellow-400 underline">
                    Upgrade to Premium →
                  </button>
                )}
              </div>
              <button onClick={() => setError(null)} className="shrink-0 text-white/50">
                <X className="h-3.5 w-3.5" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Generate bar */}
      <div
        className="sticky bottom-0 z-20 border-t border-white/[0.04] bg-[#000000] px-5 pt-3"
        style={{ paddingBottom: `calc(env(safe-area-inset-bottom, 0px) + 16px)` }}
      >
        <motion.button
          whileTap={{ scale: canGenerate ? 0.98 : 1 }}
          disabled={!canGenerate}
          onClick={generate}
          className="relative flex h-14 w-full items-center justify-center gap-2 overflow-hidden rounded-2xl bg-[#1D9BF0] font-display text-base font-semibold text-white shadow-[0_8px_28px_-4px_rgba(29,155,240,0.35)] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Sparkles className="h-5 w-5" />
          {loading ? "Generating…" : "Generate"}
        </motion.button>
      </div>

      <AnimatePresence>
        {loading && <LoadingOverlay isVideo={isVideoMode} />}
        {result && !loading && (
          <ResultOverlay
            result={result}
            aspect={aspect}
            saveStatus={saveStatus}
            saveError={saveError}
            onClose={() => setResult(null)}
            onSave={onSave}
            onPlay={() => setResultVideoOpen(true)}
            onSendPrompt={() => setSendOpen(true)}
          />
        )}
        {saveStatus === "done" && <SaveSuccessOverlay />}
      </AnimatePresence>

      {result?.videoUrl && (
        <VideoPlayerModal
          videoUrl={result.videoUrl}
          posterUrl={result.url}
          open={resultVideoOpen}
          onClose={() => setResultVideoOpen(false)}
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

/* ── Sub-components ─────────────────────────────────────────────────────────── */

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <motion.button
      whileTap={{ scale: 0.94 }}
      onClick={onClick}
      className={
        "shrink-0 rounded-full border px-4 py-2 text-xs font-medium transition " +
        (active
          ? "border-white/25 bg-[linear-gradient(135deg,rgba(168,85,247,0.32),rgba(236,72,153,0.28),rgba(59,130,246,0.32))] text-white shadow-[0_0_18px_-4px_rgba(236,72,153,0.55)]"
          : "border-white/[0.08] bg-white/[0.04] text-white/70")
      }
    >
      {children}
    </motion.button>
  );
}

function UploadTile({
  label, image, onChange, className = "",
}: { label: string; image: string | null; onChange: (v: string | null) => void; className?: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const handleFile = async (f: File) => {
    setUploading(true);
    setUploadError(null);
    try {
      const ext  = f.name.split(".").pop()?.toLowerCase() ?? "jpg";
      const path = `temp/${Date.now()}.${ext}`;
      const { data, error } = await supabase.storage
        .from("chat-images")
        .upload(path, f, { upsert: true, contentType: f.type });
      if (error || !data) throw new Error(error?.message ?? "Upload failed");
      const { data: urlData } = supabase.storage.from("chat-images").getPublicUrl(data.path);
      onChange(urlData.publicUrl);
    }
    catch (e: unknown) {
      setUploadError((e as { message?: string }).message || "Upload failed");
    }
    finally { setUploading(false); }
  };

  return (
    <div className={className}>
      <button
        type="button" disabled={uploading}
        onClick={() => !image && inputRef.current?.click()}
        className="relative flex aspect-[3/4] w-full items-center justify-center overflow-hidden rounded-2xl border border-dashed border-white/[0.1] bg-[#0a0a0a] transition hover:border-white/25 disabled:cursor-not-allowed"
      >
        {image ? (
          <>
            <img src={image} alt="" className="absolute inset-0 h-full w-full object-cover" />
            <span onClick={(e) => { e.stopPropagation(); onChange(null); setUploadError(null); }}
              className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full bg-black/60 text-white">
              <X className="h-4 w-4" />
            </span>
            <span className="absolute bottom-2 left-2 rounded-full bg-[#000000] px-2 py-0.5 text-[9px] font-semibold text-white/70">☁ Uploaded</span>
          </>
        ) : uploading ? (
          <div className="flex flex-col items-center gap-2">
            <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }}>
              <Loader2 className="h-7 w-7 text-pink-400" />
            </motion.div>
            <span className="text-[11px] text-white/60">Uploading…</span>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 text-center">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-[#141414] border border-white/[0.06]">
              <Upload className="h-4 w-4 text-white/70" />
            </span>
            <span className="text-xs font-medium text-white/70">{label}</span>
            {uploadError
              ? <span className="text-[10px] text-red-400">{uploadError}</span>
              : <span className="text-[10px] text-white/40">Tap to upload</span>}
          </div>
        )}
      </button>
      <input ref={inputRef} type="file" accept="image/*" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }} />
    </div>
  );
}

/**
 * Premium AI loading overlay.
 * - Stages move FORWARD only (Preparing → Generating → Enhancing → Finalizing → Uploading).
 * - Progress follows an asymptotic ease-out curve toward ~97% so it never
 *   jumps and never falsely claims "done" — it just keeps inching forward
 *   like ChatGPT/Midjourney while the real request is in flight.
 * - When the parent unmounts the overlay (loading=false), AnimatePresence
 *   fades it out, naturally "skipping" any remaining stages.
 */
const STAGES: Array<{ key: string; label: string; threshold: number }> = [
  { key: "prep", label: "Preparing AI",  threshold: 0    },
  { key: "gen",  label: "Generating",    threshold: 0.15 },
  { key: "enh",  label: "Enhancing",     threshold: 0.55 },
  { key: "fin",  label: "Finalizing",    threshold: 0.80 },
  { key: "upl",  label: "Uploading",     threshold: 0.93 },
];

/**
 * Premium AI loader — pure CSS, GPU-accelerated, no images.
 * Two counter-rotating conic-gradient rings + a soft pulsing glow + a core dot.
 * No favicon, no orange — feels like ChatGPT / Midjourney.
 * Only `transform` + `opacity` animate, so it stays smooth on weak Androids.
 */
function PremiumAILoader() {
  return (
    <div className="relative" style={{ width: 88, height: 88 }}>
      {/* Soft outer glow */}
      <div
        className="pointer-events-none absolute -inset-4 rounded-full opacity-60"
        style={{
          background:
            "radial-gradient(circle, rgba(168,85,247,0.55), rgba(236,72,153,0.35) 45%, transparent 70%)",
          filter: "blur(14px)",
          animation: "socia-loader-pulse 2.4s ease-in-out infinite",
        }}
      />

      {/* Outer ring — fast spin */}
      <div
        className="absolute inset-0 rounded-full"
        style={{
          background:
            "conic-gradient(from 0deg, transparent 0deg, transparent 200deg, rgba(168,85,247,0.95) 280deg, rgba(236,72,153,1) 330deg, rgba(59,130,246,0.95) 360deg)",
          WebkitMask: "radial-gradient(circle, transparent 32px, #000 34px)",
          mask: "radial-gradient(circle, transparent 32px, #000 34px)",
          animation: "socia-loader-spin 1.4s linear infinite",
          willChange: "transform",
        }}
      />

      {/* Inner ring — slower, reverse direction */}
      <div
        className="absolute rounded-full"
        style={{
          inset: 12,
          background:
            "conic-gradient(from 180deg, transparent 0deg, transparent 240deg, rgba(59,130,246,0.9) 320deg, rgba(168,85,247,0.95) 360deg)",
          WebkitMask: "radial-gradient(circle, transparent 22px, #000 24px)",
          mask: "radial-gradient(circle, transparent 22px, #000 24px)",
          animation: "socia-loader-spin-reverse 2.2s linear infinite",
          willChange: "transform",
        }}
      />

      {/* Core dot */}
      <div className="absolute inset-0 grid place-items-center">
        <div
          style={{
            width: 6,
            height: 6,
            borderRadius: "9999px",
            background: "#fff",
            boxShadow: "0 0 14px 2px rgba(255,255,255,0.85)",
            animation: "socia-loader-pulse 1.6s ease-in-out infinite",
          }}
        />
      </div>
    </div>
  );
}

/**
 * Full-screen success animation shown after a generation is saved to the
 * device. Auto-dismisses (parent navigates away after the timer).
 */
function SaveSuccessOverlay() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="absolute inset-0 z-40 grid place-items-center"
      style={{ background: "rgba(0,0,0,0.92)" }}
    >
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 320, damping: 22 }}
        className="flex flex-col items-center gap-4"
      >
        <div className="relative">
          <div
            className="pointer-events-none absolute -inset-5 rounded-full opacity-70"
            style={{
              background:
                "radial-gradient(circle, rgba(34,197,94,0.55), rgba(168,85,247,0.35) 50%, transparent 75%)",
              filter: "blur(16px)",
            }}
          />
          <motion.div
            initial={{ scale: 0.5, rotate: -20 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 360, damping: 18, delay: 0.05 }}
            className="relative grid h-16 w-16 place-items-center rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 shadow-[0_0_40px_-4px_rgba(34,197,94,0.7)]"
          >
            <CheckCircle2 className="h-8 w-8 text-white" strokeWidth={2.5} />
          </motion.div>
        </div>
        <motion.p
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.3 }}
          className="text-sm font-semibold tracking-wide text-white/90"
        >
          Saved to device
        </motion.p>
      </motion.div>
    </motion.div>
  );
}

function LoadingOverlay({ isVideo }: { isVideo: boolean }) {
  // Tau controls perceived speed of the asymptotic curve.
  // Image: ~10s feels right for gpt-image-1. Video: ~60s for fal.ai.
  const tau = isVideo ? 60_000 : 10_000;
  const startRef = useRef(performance.now());
  const lastRef = useRef(0);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const elapsed = performance.now() - startRef.current;
      // 1 - e^(-t/tau), capped at 0.97 so we never imply "done" prematurely.
      const next = Math.min(0.97, 1 - Math.exp(-elapsed / tau));
      // Monotonic guard — never go backwards.
      if (next > lastRef.current) {
        lastRef.current = next;
        setProgress(next);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [tau]);

  // Highest threshold whose value is <= progress. Monotonic by construction.
  const current = STAGES.reduce((acc, s) => (progress >= s.threshold ? s : acc), STAGES[0]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="absolute inset-0 z-30 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.94)" }}
    >
      <div className="flex flex-col items-center gap-6">
        {/* Premium AI loader: dual conic-gradient rings + soft glow + core pulse */}
        <PremiumAILoader />


        {/* Stage label — fades cleanly between stages, never loops */}
        <div className="h-5 overflow-hidden">
          <AnimatePresence mode="wait" initial={false}>
            <motion.p
              key={current.key}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              className="text-sm font-medium tracking-wide text-white/85"
            >
              {current.label}…
            </motion.p>
          </AnimatePresence>
        </div>

        {/* Smooth, monotonic progress bar */}
        <div className="h-[3px] w-56 overflow-hidden rounded-full bg-white/10">
          <motion.div
            className="h-full rounded-full"
            style={{
              background: "#1D9BF0",
            }}
            animate={{ width: `${(progress * 100).toFixed(2)}%` }}
            transition={{ duration: 0.6, ease: "easeOut" }}
          />
        </div>

        {isVideo && (
          <p className="text-[11px] text-white/40 text-center px-8">
            Video generation takes 1–3 minutes
          </p>
        )}
      </div>
    </motion.div>
  );
}

function ResultOverlay({
  result, aspect, saveStatus, saveError, onClose, onSave, onPlay, onSendPrompt,
}: {
  result: GenResult; aspect: string;
  saveStatus: "idle" | "saving" | "done";
  saveError: string | null;
  onClose: () => void; onSave: () => void; onPlay: () => void; onSendPrompt: () => void;
}) {
  const ratio = aspect === "1:1" ? "1/1" : aspect === "16:9" ? "16/9" : "9/16";
  const hasVideo = Boolean(result.videoUrl);

  return (
    // No outer fade-in — the dark background is shown instantly so the result
    // doesn't feel like a "black sheet dropping in". The reveal is carried
    // entirely by the image's blur-to-clear animation, which feels native.
    <motion.div
      initial={false}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="absolute inset-0 z-30 flex flex-col"
      style={{ background: "rgba(0,0,0,0.96)" }}
    >
      <div
        className="flex items-center justify-between px-5"
        style={{ paddingTop: `calc(env(safe-area-inset-top, 0px) + 16px)`, paddingBottom: 12 }}
      >
        <button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-full bg-[#141414] border border-white/[0.06]">
          <X className="h-4 w-4 text-white" />
        </button>
        <h3 className="font-display text-sm font-semibold text-white">
          {hasVideo ? "Video Ready ✦" : "Image Ready ✦"}
        </h3>
        <div className="h-9 w-9" />
      </div>

      <div className="flex flex-1 flex-col items-center justify-center px-5">
        <div
          className="relative w-full max-w-sm overflow-hidden rounded-3xl border border-white/[0.08]"
          style={{ aspectRatio: ratio }}
        >
          {/* Blur-to-clear reveal — feels like ChatGPT's image reveal.
              Only `filter` and `opacity` animate, both GPU-friendly.
              The image itself is already decoded thanks to the parent's
              decode() preload, so this is purely a cosmetic flourish. */}
          <motion.img
            src={result.url}
            alt={result.prompt}
            decoding="async"
            initial={{ opacity: 0, filter: "blur(18px) saturate(0.7)", scale: 1.03 }}
            animate={{ opacity: 1, filter: "blur(0px) saturate(1)",   scale: 1    }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="absolute inset-0 h-full w-full object-cover"
            style={{ willChange: "filter, opacity, transform" }}
          />
          {hasVideo && (
            <button onClick={onPlay} className="absolute inset-0 grid place-items-center">
              <motion.span
                initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.2, type: "spring", stiffness: 320, damping: 20 }}
                className="grid h-14 w-14 place-items-center rounded-full border border-white/20 bg-[#1D9BF0]/80"
              >
                <Play className="h-6 w-6 fill-white text-white" />
              </motion.span>
            </button>
          )}
          {result.durationSec && (
            <span className="absolute right-3 top-3 rounded-full bg-black/70 px-2 py-0.5 text-xs font-semibold text-white">
              0:0{Math.min(result.durationSec, 9)}
            </span>
          )}
        </div>
        {result.originalPrompt && result.originalPrompt !== result.prompt && (
          <div className="mt-3 w-full max-w-sm rounded-xl border border-white/8 bg-white/5 p-3">
            <span className="block text-[10px] font-semibold uppercase tracking-wider text-purple-400/80 mb-1">AI Enhanced</span>
            <p className="text-[11px] leading-relaxed text-white/50 line-clamp-2">{result.prompt}</p>
          </div>
        )}
      </div>

      <div
        className="grid grid-cols-4 gap-2 px-5"
        style={{ paddingBottom: `calc(env(safe-area-inset-bottom, 0px) + 24px)`, paddingTop: 12 }}
      >
        <ResultBtn icon={Trash2} label="Discard" onClick={onClose} />
        <ResultBtn icon={Share2} label="Share" onClick={() => {
          if (navigator.share) navigator.share({ url: result.url, title: "My Socia creation" }).catch(() => {});
          else navigator.clipboard?.writeText(result.url);
        }} />
        <ResultBtn icon={Send} label="Send" onClick={onSendPrompt} />
        <ResultBtn
          icon={saveStatus === "saving" ? Loader2 : Save}
          label={saveStatus === "saving" ? "Saving…" : "Save"}
          primary
          disabled={saveStatus !== "idle"}
          spin={saveStatus === "saving"}
          onClick={onSave}
        />
      </div>

      {saveError && (
        <div className="absolute inset-x-5 bottom-28 z-10 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs text-red-200">
          {saveError}
        </div>
      )}
    </motion.div>
  );
}

function ResultBtn({ icon: Icon, label, onClick, primary, disabled, spin }: { icon: typeof Save; label: string; onClick: () => void; primary?: boolean; disabled?: boolean; spin?: boolean }) {
  return (
    <motion.button
      whileTap={{ scale: disabled ? 1 : 0.95 }}
      onClick={onClick}
      disabled={disabled}
      className={
        "flex h-12 items-center justify-center gap-2 rounded-2xl text-sm font-semibold transition-opacity " +
        (disabled ? "opacity-70 " : "") +
        (primary
          ? "bg-[#1D9BF0] text-white"
          : "border border-white/[0.06] bg-[#141414] text-white/85")
      }
    >
      <Icon className={"h-4 w-4 " + (spin ? "animate-spin" : "")} />
      {label}
    </motion.button>
  );
}
