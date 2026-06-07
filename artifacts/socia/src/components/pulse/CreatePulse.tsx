/**
 * CreatePulse.tsx — Bottom-sheet modal for creating a new Pulse.
 *
 * Tabs:  📷 Image  |  🎬 Video  |  ✏️ Text
 *
 * Features:
 *  • Direct file upload to "pulses" Supabase storage bucket
 *  • Text pulse: custom bg gradient + font colour
 *  • Privacy selector (Public / Followers / Friends / Private)
 *  • Music label (text only — no audio file upload in v1)
 */
import { useState, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X, Image, Video, Upload, Lock, Globe, Users, UserCheck, Music2, Check } from "lucide-react";
import { createPulse, uploadPulseMedia } from "@/lib/pulseClient";
import { useAppStore } from "@/lib/store";

type PulseType = "image" | "video" | "text";
type Visibility = "public" | "followers" | "friends" | "private";

const TEXT_BG_PRESETS = [
  "linear-gradient(135deg,#0f0f23,#1a1040)",
  "linear-gradient(135deg,#8338ec,#ff006e)",
  "linear-gradient(135deg,#3a86ff,#06d6a0)",
  "linear-gradient(135deg,#fb5607,#ff006e)",
  "linear-gradient(135deg,#0d1b2a,#1b4332)",
  "linear-gradient(135deg,#240046,#7b2d8b)",
];
const TEXT_BG_SOLID_FALLBACKS = [
  "#0f0f23","#8338ec","#3a86ff","#fb5607","#0d1b2a","#240046",
];

const VISIBILITY_OPTIONS: { value: Visibility; label: string; icon: React.ReactNode }[] = [
  { value: "public",    label: "Public",          icon: <Globe className="h-3.5 w-3.5" /> },
  { value: "followers", label: "Followers",        icon: <Users className="h-3.5 w-3.5" /> },
  { value: "friends",   label: "Friends",          icon: <UserCheck className="h-3.5 w-3.5" /> },
  { value: "private",   label: "Only Me",          icon: <Lock className="h-3.5 w-3.5" /> },
];

interface CreatePulseProps {
  onClose:   () => void;
  onCreated: () => void;
}

export function CreatePulse({ onClose, onCreated }: CreatePulseProps) {
  const me = useAppStore((s) => s.user);

  const [tab,        setTab]        = useState<PulseType>("image");
  const [file,       setFile]       = useState<File | null>(null);
  const [preview,    setPreview]    = useState<string | null>(null);
  const [textVal,    setTextVal]    = useState("");
  const [textBgIdx,  setTextBgIdx]  = useState(0);
  const [textColor,  setTextColor]  = useState("#ffffff");
  const [visibility, setVisibility] = useState<Visibility>("public");
  const [musicName,  setMusicName]  = useState("");
  const [uploading,  setUploading]  = useState(false);
  const [error,      setError]      = useState<string | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    const url = URL.createObjectURL(f);
    setPreview(url);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (!f) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setTab(f.type.startsWith("video") ? "video" : "image");
  }, []);

  const handlePost = useCallback(async () => {
    if (!me) return;
    setError(null);
    setUploading(true);
    try {
      if (tab === "text") {
        if (!textVal.trim()) { setError("Write something first."); setUploading(false); return; }
        await createPulse({
          type: "text",
          text_content: textVal.trim(),
          text_bg: TEXT_BG_SOLID_FALLBACKS[textBgIdx],
          text_color: textColor,
          visibility,
          music_name: musicName.trim() || undefined,
        });
      } else {
        if (!file) { setError("Select a file first."); setUploading(false); return; }
        const mediaUrl = await uploadPulseMedia(file, me.id);
        await createPulse({
          type: tab,
          media_url: mediaUrl,
          visibility,
          music_name: musicName.trim() || undefined,
        });
      }
      onCreated();
    } catch (err: any) {
      setError(err?.message ?? "Failed to post Pulse");
    } finally {
      setUploading(false);
    }
  }, [me, tab, textVal, textBgIdx, textColor, visibility, musicName, file, onCreated]);

  const canPost = tab === "text" ? textVal.trim().length > 0 : Boolean(file);

  return createPortal(
    <AnimatePresence>
      <motion.div
        key="create-pulse-bg"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[9998] flex items-end"
        style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}
        onClick={onClose}
      >
        <motion.div
          key="create-pulse-sheet"
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          exit={{ y: "100%" }}
          transition={{ type: "spring", stiffness: 380, damping: 36 }}
          className="w-full rounded-t-[28px] overflow-hidden"
          style={{ background: "hsl(var(--background))", maxHeight: "92dvh" }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Handle */}
          <div className="flex justify-center pt-3 pb-1">
            <div className="h-1 w-10 rounded-full" style={{ background: "rgba(255,255,255,0.15)" }} />
          </div>

          {/* Header */}
          <div className="flex items-center justify-between px-4 pb-3">
            <div className="flex items-center gap-2">
              <span className="text-base font-bold app-text">Add Pulse</span>
              <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full"
                style={{ background: "linear-gradient(135deg,#8338ec,#ff006e)", color: "#fff" }}>
                24h
              </span>
            </div>
            <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-full"
              style={{ background: "rgba(255,255,255,0.06)" }}>
              <X className="h-4 w-4 app-text-muted" />
            </button>
          </div>

          {/* Tab bar */}
          <div className="flex gap-1 px-4 mb-4">
            {([["image","📷","Image"],["video","🎬","Video"],["text","✏️","Text"]] as const).map(([t, emoji, label]) => (
              <button
                key={t}
                onClick={() => { setTab(t as PulseType); setFile(null); setPreview(null); }}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold transition-all"
                style={tab === t ? {
                  background: "linear-gradient(135deg,#8338ec,#ff006e)",
                  color: "#fff",
                } : {
                  background: "rgba(255,255,255,0.05)",
                  color: "var(--s-text-muted)",
                }}
              >
                <span>{emoji}</span> {label}
              </button>
            ))}
          </div>

          <div className="overflow-y-auto" style={{ maxHeight: "65dvh" }}>
            {/* ── Image / Video tab ──────────────────────────────────── */}
            {(tab === "image" || tab === "video") && (
              <div className="px-4">
                <input
                  ref={fileRef}
                  type="file"
                  accept={tab === "image" ? "image/*" : "video/*"}
                  className="hidden"
                  onChange={handleFileChange}
                />
                {preview ? (
                  <div className="relative rounded-2xl overflow-hidden" style={{ aspectRatio: "9/16", maxHeight: 340 }}>
                    {tab === "image"
                      ? <img src={preview} className="w-full h-full object-cover" alt="Preview" />
                      : <video src={preview} className="w-full h-full object-cover" controls playsInline />
                    }
                    <button
                      onClick={() => { setFile(null); setPreview(null); }}
                      className="absolute top-2 right-2 h-7 w-7 rounded-full grid place-items-center"
                      style={{ background: "rgba(0,0,0,0.6)" }}
                    >
                      <X className="h-3.5 w-3.5 text-white" />
                    </button>
                  </div>
                ) : (
                  <div
                    className="rounded-2xl flex flex-col items-center justify-center gap-3 cursor-pointer"
                    style={{
                      aspectRatio: "9/16",
                      maxHeight: 300,
                      background: "rgba(255,255,255,0.04)",
                      border: "2px dashed rgba(131,56,236,0.35)",
                    }}
                    onClick={() => fileRef.current?.click()}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={handleDrop}
                  >
                    {tab === "image"
                      ? <Image className="h-10 w-10" style={{ color: "rgba(131,56,236,0.5)" }} />
                      : <Video className="h-10 w-10" style={{ color: "rgba(131,56,236,0.5)" }} />
                    }
                    <p className="text-sm font-semibold app-text-muted">
                      Tap or drop {tab === "image" ? "an image" : "a video"}
                    </p>
                    <span className="text-[11px] app-text-muted opacity-60">
                      {tab === "image" ? "JPG, PNG, WEBP" : "MP4, MOV, WEBM"}
                    </span>
                    <button
                      className="flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-white"
                      style={{ background: "linear-gradient(135deg,#8338ec,#ff006e)" }}
                    >
                      <Upload className="h-4 w-4" /> Browse
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* ── Text tab ───────────────────────────────────────────── */}
            {tab === "text" && (
              <div className="px-4 space-y-3">
                {/* Live preview */}
                <div
                  className="w-full rounded-2xl flex items-center justify-center p-6"
                  style={{
                    aspectRatio: "9/16",
                    maxHeight: 260,
                    background: TEXT_BG_PRESETS[textBgIdx],
                  }}
                >
                  <p className="text-center text-xl font-bold leading-snug" style={{ color: textColor }}>
                    {textVal || <span className="opacity-40">Your message…</span>}
                  </p>
                </div>

                {/* Text input */}
                <textarea
                  value={textVal}
                  onChange={(e) => setTextVal(e.target.value)}
                  maxLength={240}
                  rows={3}
                  placeholder="Write something…"
                  className="w-full rounded-xl px-4 py-3 text-sm resize-none app-text"
                  style={{
                    background: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    outline: "none",
                  }}
                />

                {/* BG presets */}
                <div>
                  <p className="text-[11px] app-text-muted mb-2">Background</p>
                  <div className="flex gap-2">
                    {TEXT_BG_PRESETS.map((bg, i) => (
                      <button
                        key={i}
                        onClick={() => setTextBgIdx(i)}
                        className="h-8 w-8 rounded-full flex-shrink-0 relative"
                        style={{ background: bg, outline: textBgIdx === i ? "2px solid #fff" : "none", outlineOffset: 2 }}
                      >
                        {textBgIdx === i && <Check className="h-3.5 w-3.5 text-white absolute inset-0 m-auto" />}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Text colour */}
                <div className="flex items-center gap-3">
                  <span className="text-[11px] app-text-muted">Font colour</span>
                  <div className="flex gap-2">
                    {["#ffffff","#000000","#ffbe0b","#06d6a0","#ff006e"].map((c) => (
                      <button
                        key={c}
                        onClick={() => setTextColor(c)}
                        className="h-6 w-6 rounded-full flex-shrink-0 border-2"
                        style={{
                          background: c,
                          borderColor: textColor === c ? "#8338ec" : "transparent",
                        }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ── Shared options ─────────────────────────────────────── */}
            <div className="px-4 mt-4 space-y-3 pb-2">
              {/* Music label */}
              <div className="flex items-center gap-3 rounded-xl px-4 py-2.5"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}>
                <Music2 className="h-4 w-4 app-text-muted flex-shrink-0" />
                <input
                  type="text"
                  value={musicName}
                  onChange={(e) => setMusicName(e.target.value)}
                  placeholder="Add music label (optional)"
                  className="flex-1 bg-transparent text-sm app-text outline-none"
                />
              </div>

              {/* Privacy */}
              <div>
                <p className="text-[11px] app-text-muted mb-2">Who can see this?</p>
                <div className="grid grid-cols-2 gap-2">
                  {VISIBILITY_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setVisibility(opt.value)}
                      className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-xs font-semibold transition-all"
                      style={visibility === opt.value ? {
                        background: "linear-gradient(135deg,rgba(131,56,236,0.25),rgba(255,0,110,0.15))",
                        border: "1px solid rgba(131,56,236,0.5)",
                        color: "hsl(var(--foreground))",
                      } : {
                        background: "rgba(255,255,255,0.04)",
                        border: "1px solid rgba(255,255,255,0.06)",
                        color: "var(--s-text-muted)",
                      }}
                    >
                      {opt.icon}
                      {opt.label}
                      {visibility === opt.value && <Check className="h-3 w-3 ml-auto" />}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Error */}
          {error && (
            <p className="px-4 mt-2 text-xs text-red-400">{error}</p>
          )}

          {/* Post button */}
          <div className="px-4 pt-3 pb-safe pb-6">
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={handlePost}
              disabled={!canPost || uploading}
              className="w-full py-3.5 rounded-2xl text-sm font-bold text-white disabled:opacity-50"
              style={{ background: "linear-gradient(135deg,#8338ec,#ff006e)" }}
            >
              {uploading ? "Posting…" : "Post Pulse ⚡"}
            </motion.button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}

