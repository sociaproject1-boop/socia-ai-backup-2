import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, Sparkles, Upload, X, Loader2, Play, Save, Share2,
  Trash2, Send, AlertCircle, Crown, CheckCircle2, Mic, MicOff, Film,
  ChevronDown, ChevronUp,
} from "lucide-react";
import { imageToVideo, type GenResult } from "@/lib/ai";
import { saveToDevice } from "@/lib/download";
import { supabase } from "@/lib/supabase";
import { VideoPlayerModal } from "@/components/ui/VideoPlayerModal";
import { SendPromptSheet } from "@/components/create/SendPromptSheet";

/* ── Constants ── */
const DURATIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const ASPECTS: Array<"9:16" | "1:1" | "16:9"> = ["9:16", "1:1", "16:9"];
const CAMERA_MOTIONS = [
  { id: "none",     label: "None" },
  { id: "push-in",  label: "Push In" },
  { id: "pull-out", label: "Pull Out" },
  { id: "orbit",    label: "Orbit" },
  { id: "handheld", label: "Handheld" },
  { id: "drone",    label: "Drone" },
  { id: "parallax", label: "Parallax" },
];

/* ── Loading stages ── */
const STAGES = [
  { key: "prep", label: "Preparing AI",  threshold: 0    },
  { key: "gen",  label: "Generating",    threshold: 0.15 },
  { key: "enh",  label: "Enhancing",     threshold: 0.55 },
  { key: "fin",  label: "Finalizing",    threshold: 0.80 },
  { key: "upl",  label: "Uploading",     threshold: 0.93 },
];

export default function CreateImageVideo() {
  const [, navigate] = useLocation();

  /* ── Frame state ── */
  const [startFrame, setStartFrame]   = useState<string | null>(null);
  const [endFrame,   setEndFrame]     = useState<string | null>(null);

  /* ── Controls ── */
  const [prompt,          setPrompt]         = useState("");
  const [negativePrompt,  setNegativePrompt] = useState("");
  const [duration,        setDuration]       = useState(5);
  const [aspect,          setAspect]         = useState<"9:16" | "1:1" | "16:9">("9:16");
  const [cameraMotion,    setCameraMotion]   = useState("none");

  /* ── Voice Over ── */
  const [voiceOpen,      setVoiceOpen]      = useState(false);
  const [voiceText,      setVoiceText]      = useState("");
  const [voiceFile,      setVoiceFile]      = useState<File | null>(null);
  const voiceInputRef = useRef<HTMLInputElement>(null);

  /* ── Gen state ── */
  const [loading,        setLoading]        = useState(false);
  const [error,          setError]          = useState<string | null>(null);
  const [isQuotaError,   setIsQuotaError]   = useState(false);
  const [result,         setResult]         = useState<GenResult | null>(null);
  const [resultVideoOpen, setResultVideoOpen] = useState(false);
  const [sendOpen,       setSendOpen]       = useState(false);
  const [saveStatus,     setSaveStatus]     = useState<"idle" | "saving" | "done">("idle");
  const [saveError,      setSaveError]      = useState<string | null>(null);

  /* Preload result image */
  useEffect(() => {
    if (!result?.url) return;
    const img = new Image();
    img.decoding = "async";
    img.src = result.url;
    img.decode?.().catch(() => {});
  }, [result?.url]);

  const canGenerate = !loading && Boolean(startFrame);

  /* ── Build enriched prompt ── */
  function buildPrompt() {
    const parts: string[] = [];
    if (prompt.trim()) parts.push(prompt.trim());
    if (cameraMotion !== "none") {
      const motion = CAMERA_MOTIONS.find((m) => m.id === cameraMotion);
      if (motion) parts.push(`Camera: ${motion.label} movement`);
    }
    if (voiceText.trim()) parts.push(`Narration: "${voiceText.trim()}"`);
    if (negativePrompt.trim()) parts.push(`Avoid: ${negativePrompt.trim()}`);
    if (endFrame) parts.push("Animate smoothly to the end frame provided.");
    return parts.join(". ");
  }

  async function generate() {
    if (!canGenerate || !startFrame) return;
    setLoading(true); setError(null); setIsQuotaError(false); setResult(null);
    try {
      const r = await imageToVideo(startFrame, buildPrompt(), { aspect, durationSec: duration });
      setResult(r);
    } catch (err: unknown) {
      const e = err as { message?: string; code?: string };
      setError(e.message || "Generation failed. Please try again.");
      setIsQuotaError(e.code === "QUOTA_EXCEEDED");
    } finally {
      setLoading(false);
    }
  }

  async function onSave() {
    if (!result || saveStatus === "saving") return;
    setSaveStatus("saving"); setSaveError(null);
    try {
      const downloadUrl = result.videoUrl || result.url;
      const kind: "image" | "video" = result.videoUrl ? "video" : "image";
      await saveToDevice(downloadUrl, { kind, filename: result.prompt });
      setSaveStatus("done");
      setTimeout(() => setSaveStatus("idle"), 1600);
    } catch (err) {
      setSaveError((err as { message?: string }).message || "Save failed.");
      setSaveStatus("idle");
    }
  }

  return (
    <div className="flex h-full flex-col" style={{ background: "rgba(6,3,14,1)" }}>

      {/* ── Header ── */}
      <div
        className="flex items-center gap-3 px-4"
        style={{
          paddingTop: "calc(env(safe-area-inset-top,0px) + 14px)",
          paddingBottom: 14,
          borderBottom: "1px solid rgba(255,255,255,0.05)",
          background: "rgba(8,4,16,0.92)",
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
        }}
      >
        <motion.button
          whileTap={{ scale: 0.88 }}
          onClick={() => navigate("/create")}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-white/50 hover:text-white transition-colors"
          style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.07)" }}
        >
          <ArrowLeft className="h-4 w-4" />
        </motion.button>

        <div className="flex-1 min-w-0 text-center">
          <h2 className="font-display text-[15px] font-bold tracking-tight text-white">Image to Video</h2>
          <p className="text-[10px] mt-0.5" style={{ color: "rgba(255,255,255,0.3)" }}>Cinematic AI Studio</p>
        </div>

        <div className="h-9 w-9 shrink-0" />
      </div>

      {/* ── Scrollable content ── */}
      <div className="flex-1 overflow-y-auto pb-32" style={{ padding: "20px 16px 0" }}>

        {/* ── Frame cards ── */}
        <div className="mb-5">
          <SectionLabel>Frames</SectionLabel>
          <div className="grid grid-cols-2 gap-3">
            <FrameCard
              label="Start Frame"
              required
              image={startFrame}
              onChange={setStartFrame}
            />
            <FrameCard
              label="End Frame"
              hint="optional"
              image={endFrame}
              onChange={setEndFrame}
            />
          </div>
        </div>

        {/* ── Prompt ── */}
        <div className="mb-4">
          <SectionLabel>Prompt</SectionLabel>
          <GlassCard>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={3}
              placeholder="Describe the motion, mood, and scene…"
              className="w-full resize-none bg-transparent text-[14px] leading-relaxed text-white placeholder-white/25 outline-none"
              style={{ caretColor: "#c084fc" }}
            />
          </GlassCard>
        </div>

        {/* ── Negative Prompt ── */}
        <div className="mb-5">
          <SectionLabel>Negative Prompt <span style={{ color: "rgba(255,255,255,0.3)", fontWeight: 400 }}>(optional)</span></SectionLabel>
          <GlassCard>
            <textarea
              value={negativePrompt}
              onChange={(e) => setNegativePrompt(e.target.value)}
              rows={2}
              placeholder="Avoid blur, shaky cam, watermarks…"
              className="w-full resize-none bg-transparent text-[13.5px] leading-relaxed text-white placeholder-white/20 outline-none"
              style={{ caretColor: "#c084fc" }}
            />
          </GlassCard>
        </div>

        {/* ── Duration chips ── */}
        <div className="mb-5">
          <SectionLabel>Duration</SectionLabel>
          <div className="flex flex-wrap gap-1.5">
            {DURATIONS.map((d) => (
              <DurationChip key={d} value={d} active={duration === d} onClick={() => setDuration(d)} />
            ))}
          </div>
        </div>

        {/* ── Aspect ratio ── */}
        <div className="mb-5">
          <SectionLabel>Aspect Ratio</SectionLabel>
          <div className="flex gap-2">
            {ASPECTS.map((a) => (
              <motion.button
                key={a}
                whileTap={{ scale: 0.93 }}
                onClick={() => setAspect(a)}
                className="flex-1 rounded-2xl py-2.5 text-[12px] font-semibold transition-all"
                style={
                  aspect === a
                    ? { background: "linear-gradient(135deg,rgba(168,85,247,0.35),rgba(236,72,153,0.3))", border: "1px solid rgba(168,85,247,0.5)", color: "#fff", boxShadow: "0 2px 12px rgba(168,85,247,0.25)" }
                    : { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.5)" }
                }
              >
                {a}
              </motion.button>
            ))}
          </div>
        </div>

        {/* ── Camera Motion ── */}
        <div className="mb-5">
          <SectionLabel>Camera Motion</SectionLabel>
          <div className="flex flex-wrap gap-1.5">
            {CAMERA_MOTIONS.map((m) => (
              <motion.button
                key={m.id}
                whileTap={{ scale: 0.93 }}
                onClick={() => setCameraMotion(m.id)}
                className="rounded-full px-3.5 py-1.5 text-[11.5px] font-medium transition-all"
                style={
                  cameraMotion === m.id
                    ? { background: "linear-gradient(135deg,#a855f7,#ec4899)", color: "#fff", boxShadow: "0 2px 14px rgba(168,85,247,0.4)" }
                    : { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.5)" }
                }
              >
                {m.label}
              </motion.button>
            ))}
          </div>
        </div>

        {/* ── Voice Over ── */}
        <div className="mb-5">
          <button
            className="flex w-full items-center justify-between rounded-2xl px-4 py-3 transition-all"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}
            onClick={() => setVoiceOpen((v) => !v)}
          >
            <div className="flex items-center gap-2.5">
              <span className="grid h-7 w-7 place-items-center rounded-xl"
                style={{ background: "rgba(168,85,247,0.12)" }}>
                <Mic className="h-3.5 w-3.5" style={{ color: "rgba(216,180,254,0.8)" }} />
              </span>
              <div className="text-left">
                <p className="text-[13px] font-semibold text-white">Voice Over</p>
                <p className="text-[10.5px]" style={{ color: "rgba(255,255,255,0.35)" }}>
                  {voiceFile ? voiceFile.name : voiceText ? "Text narration set" : "Optional · text or audio"}
                </p>
              </div>
            </div>
            {voiceOpen ? <ChevronUp className="h-4 w-4 text-white/30" /> : <ChevronDown className="h-4 w-4 text-white/30" />}
          </button>

          <AnimatePresence>
            {voiceOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="mt-2 space-y-2.5 rounded-2xl p-4"
                  style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>

                  {/* Text narration */}
                  <div>
                    <p className="mb-1.5 text-[10.5px] font-semibold tracking-wider uppercase" style={{ color: "rgba(255,255,255,0.35)" }}>
                      Narration Text
                    </p>
                    <textarea
                      value={voiceText}
                      onChange={(e) => setVoiceText(e.target.value)}
                      rows={2}
                      placeholder="Type the narration to layer over the video…"
                      className="w-full resize-none rounded-xl px-3 py-2.5 text-[13px] leading-relaxed text-white placeholder-white/20 outline-none"
                      style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.07)", caretColor: "#c084fc" }}
                    />
                  </div>

                  {/* Audio upload */}
                  <div>
                    <p className="mb-1.5 text-[10.5px] font-semibold tracking-wider uppercase" style={{ color: "rgba(255,255,255,0.35)" }}>
                      Or Upload Audio
                    </p>
                    <div className="flex items-center gap-2">
                      <motion.button
                        whileTap={{ scale: 0.93 }}
                        type="button"
                        onClick={() => voiceInputRef.current?.click()}
                        className="flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 text-[12.5px] font-medium transition-all"
                        style={{
                          background: voiceFile ? "rgba(168,85,247,0.12)" : "rgba(255,255,255,0.04)",
                          border: "1px solid " + (voiceFile ? "rgba(168,85,247,0.3)" : "rgba(255,255,255,0.07)"),
                          color: voiceFile ? "rgba(216,180,254,0.9)" : "rgba(255,255,255,0.5)",
                        }}
                      >
                        <Mic className="h-3.5 w-3.5" />
                        {voiceFile ? voiceFile.name.slice(0, 20) + (voiceFile.name.length > 20 ? "…" : "") : "Upload MP3 / WAV"}
                      </motion.button>
                      {voiceFile && (
                        <motion.button whileTap={{ scale: 0.9 }} onClick={() => setVoiceFile(null)}
                          className="grid h-9 w-9 shrink-0 place-items-center rounded-xl"
                          style={{ background: "rgba(239,68,68,0.08)", color: "rgba(248,113,113,0.8)" }}>
                          <X className="h-3.5 w-3.5" />
                        </motion.button>
                      )}
                    </div>
                    <input ref={voiceInputRef} type="file" accept="audio/mp3,audio/mpeg,audio/wav,audio/ogg,audio/m4a" className="hidden"
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) setVoiceFile(f); e.target.value = ""; }} />
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* ── Error ── */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
              className="mb-4 flex gap-3 rounded-2xl border p-4"
              style={isQuotaError
                ? { borderColor: "rgba(234,179,8,0.25)", background: "rgba(234,179,8,0.07)" }
                : { borderColor: "rgba(239,68,68,0.25)", background: "rgba(239,68,68,0.07)" }
              }
            >
              {isQuotaError
                ? <Crown className="mt-0.5 h-4 w-4 shrink-0 text-yellow-400" />
                : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />}
              <div className="flex-1">
                <p className="text-[12.5px] leading-relaxed text-white/80">{error}</p>
                {isQuotaError && (
                  <button className="mt-1.5 text-[11px] font-semibold text-yellow-400 underline">
                    Upgrade to Premium →
                  </button>
                )}
              </div>
              <button onClick={() => setError(null)} className="shrink-0 text-white/40">
                <X className="h-3.5 w-3.5" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Generate bar (sticky bottom) ── */}
      <div
        className="absolute bottom-0 inset-x-0 px-4"
        style={{
          paddingBottom: "calc(env(safe-area-inset-bottom,0px) + 20px)",
          paddingTop: 16,
          background: "linear-gradient(to top, rgba(6,3,14,1) 60%, rgba(6,3,14,0))",
        }}
      >
        {!canGenerate && !startFrame && (
          <p className="mb-3 text-center text-[11.5px]" style={{ color: "rgba(255,255,255,0.3)" }}>
            Upload a start frame to generate
          </p>
        )}
        <motion.button
          whileTap={{ scale: canGenerate ? 0.97 : 1 }}
          disabled={!canGenerate}
          onClick={generate}
          className="relative flex h-14 w-full items-center justify-center gap-2.5 overflow-hidden rounded-2xl font-display text-[15px] font-bold text-white transition-all"
          style={canGenerate
            ? {
                background: "linear-gradient(135deg,#a855f7,#ec4899,#6366f1)",
                boxShadow: "0 8px 32px -4px rgba(168,85,247,0.6), 0 0 0 1px rgba(255,255,255,0.1) inset",
              }
            : {
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.08)",
                opacity: 0.5,
              }
          }
        >
          {/* Animated shimmer on active */}
          {canGenerate && (
            <motion.div
              className="absolute inset-0 -translate-x-full"
              animate={{ translateX: ["−100%", "200%"] }}
              transition={{ duration: 2.5, repeat: Infinity, ease: "linear", repeatDelay: 1.5 }}
              style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.12), transparent)" }}
            />
          )}
          <Sparkles className="h-5 w-5" />
          {loading ? "Generating…" : "Generate Video"}
          {duration > 0 && !loading && (
            <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
              style={{ background: "rgba(255,255,255,0.15)" }}>
              {duration}s
            </span>
          )}
        </motion.button>
      </div>

      {/* ── Overlays ── */}
      <AnimatePresence>
        {loading && <LoadingOverlay />}
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
        <VideoPlayerModal videoUrl={result.videoUrl} posterUrl={result.url}
          open={resultVideoOpen} onClose={() => setResultVideoOpen(false)} />
      )}

      <AnimatePresence>
        {sendOpen && result && (
          <SendPromptSheet open={sendOpen} prompt={result.originalPrompt || result.prompt}
            onClose={() => setSendOpen(false)} />
        )}
      </AnimatePresence>
    </div>
  );
}

/* ── Design tokens / helpers ── */

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-2.5 text-[10.5px] font-semibold uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.38)" }}>
      {children}
    </p>
  );
}

function GlassCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl px-4 py-3"
      style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
      {children}
    </div>
  );
}

function DurationChip({ value, active, onClick }: { value: number; active: boolean; onClick: () => void }) {
  return (
    <motion.button
      whileTap={{ scale: 0.88 }}
      onClick={onClick}
      className="rounded-xl px-3 py-2 text-[12px] font-semibold transition-all min-w-[40px] text-center"
      style={active
        ? { background: "linear-gradient(135deg,#a855f7,#ec4899)", color: "#fff", boxShadow: "0 2px 14px rgba(168,85,247,0.4)" }
        : { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.45)" }
      }
    >
      {value}s
    </motion.button>
  );
}

/* ── Frame upload card ── */
function FrameCard({
  label, hint, required, image, onChange,
}: {
  label: string; hint?: string; required?: boolean; image: string | null; onChange: (v: string | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const handleFile = async (f: File) => {
    setUploading(true); setUploadError(null);
    try {
      const ext = f.name.split(".").pop()?.toLowerCase() ?? "jpg";
      const path = `temp/${Date.now()}.${ext}`;
      const { data, error } = await supabase.storage.from("chat-images").upload(path, f, { upsert: true, contentType: f.type });
      if (error || !data) throw new Error(error?.message ?? "Upload failed");
      const { data: urlData } = supabase.storage.from("chat-images").getPublicUrl(data.path);
      onChange(urlData.publicUrl);
    } catch (e: unknown) {
      setUploadError((e as { message?: string }).message || "Upload failed");
    } finally { setUploading(false); }
  };

  return (
    <div>
      <div className="mb-1.5 flex items-center gap-1.5">
        <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.4)" }}>
          {label}
        </p>
        {required && (
          <span className="rounded-full px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider"
            style={{ background: "rgba(168,85,247,0.2)", color: "rgba(192,132,252,0.9)" }}>
            Required
          </span>
        )}
        {hint && (
          <span className="text-[9px]" style={{ color: "rgba(255,255,255,0.25)" }}>{hint}</span>
        )}
      </div>

      <motion.button
        type="button"
        whileTap={{ scale: 0.97 }}
        disabled={uploading}
        onClick={() => !image && inputRef.current?.click()}
        className="relative flex aspect-[3/4] w-full items-center justify-center overflow-hidden rounded-2xl transition-all"
        style={image
          ? { border: "1.5px solid rgba(168,85,247,0.5)", boxShadow: "0 0 20px rgba(168,85,247,0.15)" }
          : { border: "1.5px dashed rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.025)" }
        }
      >
        {image ? (
          <>
            <img src={image} alt="" className="absolute inset-0 h-full w-full object-cover" />
            {/* Overlay gradient */}
            <div className="absolute inset-0" style={{ background: "linear-gradient(to top, rgba(0,0,0,0.5) 0%, transparent 50%)" }} />
            {/* Change button */}
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={(e) => { e.stopPropagation(); inputRef.current?.click(); }}
              className="absolute bottom-2 left-2 rounded-xl px-2.5 py-1.5 text-[10px] font-semibold text-white"
              style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)" }}
            >
              Change
            </motion.button>
            {/* Remove */}
            <motion.button
              whileTap={{ scale: 0.88 }}
              onClick={(e) => { e.stopPropagation(); onChange(null); setUploadError(null); }}
              className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full"
              style={{ background: "rgba(0,0,0,0.65)", backdropFilter: "blur(8px)" }}
            >
              <X className="h-3.5 w-3.5 text-white" />
            </motion.button>
          </>
        ) : uploading ? (
          <div className="flex flex-col items-center gap-2">
            <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }}>
              <Loader2 className="h-6 w-6" style={{ color: "rgba(192,132,252,0.8)" }} />
            </motion.div>
            <span className="text-[10px]" style={{ color: "rgba(255,255,255,0.4)" }}>Uploading…</span>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 px-2 text-center">
            <div className="grid h-10 w-10 place-items-center rounded-full"
              style={{ background: "rgba(168,85,247,0.1)", border: "1px solid rgba(168,85,247,0.2)" }}>
              <Upload className="h-4 w-4" style={{ color: "rgba(192,132,252,0.7)" }} />
            </div>
            <span className="text-[11px] font-medium" style={{ color: "rgba(255,255,255,0.5)" }}>
              {uploadError ? uploadError : "Tap to upload"}
            </span>
            {uploadError && (
              <span className="text-[9.5px]" style={{ color: "rgba(248,113,113,0.8)" }}>{uploadError}</span>
            )}
          </div>
        )}
      </motion.button>
      <input ref={inputRef} type="file" accept="image/*" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }} />
    </div>
  );
}

/* ── Loading overlay ── */
function LoadingOverlay() {
  const tau = 60_000;
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

  const current = STAGES.reduce((acc, s) => (progress >= s.threshold ? s : acc), STAGES[0]);

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.35 }}
      className="absolute inset-0 z-30 flex items-center justify-center"
      style={{ background: "rgba(6,3,14,0.95)", backdropFilter: "blur(12px)" }}
    >
      <div className="flex flex-col items-center gap-6 px-8">
        {/* Rings */}
        <div className="relative" style={{ width: 88, height: 88 }}>
          <div className="pointer-events-none absolute -inset-4 rounded-full opacity-60"
            style={{ background: "radial-gradient(circle, rgba(168,85,247,0.55), rgba(236,72,153,0.35) 45%, transparent 70%)", filter: "blur(14px)", animation: "socia-loader-pulse 2.4s ease-in-out infinite" }} />
          <div className="absolute inset-0 rounded-full"
            style={{ background: "conic-gradient(from 0deg, transparent 0deg, transparent 200deg, rgba(168,85,247,0.95) 280deg, rgba(236,72,153,1) 330deg, rgba(99,102,241,0.95) 360deg)", WebkitMask: "radial-gradient(circle, transparent 32px, #000 34px)", mask: "radial-gradient(circle, transparent 32px, #000 34px)", animation: "socia-loader-spin 1.4s linear infinite", willChange: "transform" }} />
          <div className="absolute rounded-full"
            style={{ inset: 12, background: "conic-gradient(from 180deg, transparent 0deg, transparent 240deg, rgba(99,102,241,0.9) 320deg, rgba(168,85,247,0.95) 360deg)", WebkitMask: "radial-gradient(circle, transparent 22px, #000 24px)", mask: "radial-gradient(circle, transparent 22px, #000 24px)", animation: "socia-loader-spin-reverse 2.2s linear infinite", willChange: "transform" }} />
          <div className="absolute inset-0 grid place-items-center">
            <div style={{ width: 6, height: 6, borderRadius: "9999px", background: "#fff", boxShadow: "0 0 14px 2px rgba(255,255,255,0.85)", animation: "socia-loader-pulse 1.6s ease-in-out infinite" }} />
          </div>
        </div>

        <div className="h-5 overflow-hidden">
          <AnimatePresence mode="wait" initial={false}>
            <motion.p key={current.key}
              initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.3 }}
              className="text-center text-[13px] font-medium tracking-wide text-white/85"
            >
              {current.label}…
            </motion.p>
          </AnimatePresence>
        </div>

        <div className="h-[3px] w-56 overflow-hidden rounded-full" style={{ background: "rgba(255,255,255,0.08)" }}>
          <motion.div className="h-full rounded-full"
            style={{ background: "linear-gradient(90deg,#a855f7,#ec4899,#6366f1)" }}
            animate={{ width: `${(progress * 100).toFixed(2)}%` }}
            transition={{ duration: 0.6, ease: "easeOut" }}
          />
        </div>

        <p className="text-center text-[11px]" style={{ color: "rgba(255,255,255,0.35)" }}>
          Video generation typically takes 1–3 minutes
        </p>
      </div>
    </motion.div>
  );
}

/* ── Result overlay ── */
function ResultOverlay({ result, aspect, saveStatus, saveError, onClose, onSave, onPlay, onSendPrompt }: {
  result: GenResult; aspect: string;
  saveStatus: "idle" | "saving" | "done"; saveError: string | null;
  onClose: () => void; onSave: () => void; onPlay: () => void; onSendPrompt: () => void;
}) {
  const ratio = aspect === "1:1" ? "1/1" : aspect === "16:9" ? "16/9" : "9/16";
  const hasVideo = Boolean(result.videoUrl);

  return (
    <motion.div
      initial={false} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}
      className="absolute inset-0 z-30 flex flex-col"
      style={{ background: "rgba(6,3,14,0.97)" }}
    >
      <div className="flex items-center justify-between px-5"
        style={{ paddingTop: "calc(env(safe-area-inset-top,0px) + 16px)", paddingBottom: 12 }}>
        <motion.button whileTap={{ scale: 0.9 }} onClick={onClose}
          className="grid h-9 w-9 place-items-center rounded-full"
          style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}>
          <X className="h-4 w-4 text-white" />
        </motion.button>
        <h3 className="font-display text-[14px] font-bold text-white">
          {hasVideo ? "Video Ready ✦" : "Image Ready ✦"}
        </h3>
        <div className="h-9 w-9" />
      </div>

      <div className="flex flex-1 flex-col items-center justify-center px-5">
        <div className="relative w-full max-w-sm overflow-hidden rounded-3xl"
          style={{ aspectRatio: ratio, border: "1px solid rgba(255,255,255,0.1)", boxShadow: "0 24px 60px -12px rgba(168,85,247,0.5)" }}>
          <motion.img src={result.url} alt={result.prompt} decoding="async"
            initial={{ opacity: 0, filter: "blur(18px) saturate(0.7)", scale: 1.03 }}
            animate={{ opacity: 1, filter: "blur(0px) saturate(1)", scale: 1 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="absolute inset-0 h-full w-full object-cover"
            style={{ willChange: "filter, opacity, transform" }}
          />
          {hasVideo && (
            <button onClick={onPlay} className="absolute inset-0 grid place-items-center">
              <motion.span
                initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.2, type: "spring", stiffness: 320, damping: 20 }}
                className="grid h-14 w-14 place-items-center rounded-full border border-white/25 backdrop-blur-xl"
                style={{ background: "linear-gradient(135deg,rgba(168,85,247,0.8),rgba(236,72,153,0.8))", boxShadow: "0 0 36px 6px rgba(168,85,247,0.5)" }}
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
      </div>

      <div className="grid grid-cols-4 gap-2 px-5"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom,0px) + 24px)", paddingTop: 12 }}>
        <ResultBtn icon={Trash2} label="Discard" onClick={onClose} />
        <ResultBtn icon={Share2} label="Share" onClick={() => {
          if (navigator.share) navigator.share({ url: result.url, title: "My Socia creation" }).catch(() => {});
          else navigator.clipboard?.writeText(result.url);
        }} />
        <ResultBtn icon={Send} label="Send" onClick={onSendPrompt} />
        <ResultBtn icon={saveStatus === "saving" ? Loader2 : Save} label={saveStatus === "saving" ? "Saving…" : "Save"}
          primary disabled={saveStatus !== "idle"} spin={saveStatus === "saving"} onClick={onSave} />
      </div>
      {saveError && (
        <div className="absolute inset-x-5 bottom-28 z-10 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs text-red-200">
          {saveError}
        </div>
      )}
    </motion.div>
  );
}

function ResultBtn({ icon: Icon, label, onClick, primary, disabled, spin }: {
  icon: typeof Save; label: string; onClick: () => void; primary?: boolean; disabled?: boolean; spin?: boolean;
}) {
  return (
    <motion.button whileTap={{ scale: disabled ? 1 : 0.94 }} onClick={onClick} disabled={disabled}
      className={"flex h-12 items-center justify-center gap-1.5 rounded-2xl text-[12px] font-semibold transition-opacity " +
        (disabled ? "opacity-60 " : "") +
        (primary
          ? "text-white"
          : "text-white/80")}
      style={primary
        ? { background: "linear-gradient(135deg,#a855f7,#ec4899)", boxShadow: "0 6px 20px -4px rgba(168,85,247,0.55)" }
        : { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)" }
      }
    >
      <Icon className={"h-4 w-4 " + (spin ? "animate-spin" : "")} />
      {label}
    </motion.button>
  );
}

function SaveSuccessOverlay() {
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="absolute inset-0 z-40 grid place-items-center"
      style={{ background: "rgba(6,3,14,0.92)" }}
    >
      <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 320, damping: 22 }}
        className="flex flex-col items-center gap-4"
      >
        <div className="relative">
          <div className="pointer-events-none absolute -inset-5 rounded-full opacity-70"
            style={{ background: "radial-gradient(circle, rgba(34,197,94,0.5), rgba(168,85,247,0.3) 50%, transparent 75%)", filter: "blur(16px)" }} />
          <motion.div initial={{ scale: 0.5, rotate: -20 }} animate={{ scale: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 360, damping: 18, delay: 0.05 }}
            className="relative grid h-16 w-16 place-items-center rounded-full"
            style={{ background: "linear-gradient(135deg,#22c55e,#16a34a)", boxShadow: "0 0 40px -4px rgba(34,197,94,0.7)" }}
          >
            <CheckCircle2 className="h-8 w-8 text-white" strokeWidth={2.5} />
          </motion.div>
        </div>
        <motion.p initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
          className="text-[13px] font-semibold tracking-wide text-white/90"
        >
          Saved to device
        </motion.p>
      </motion.div>
    </motion.div>
  );
}
