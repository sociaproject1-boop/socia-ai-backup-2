/**
 * CreatePulse.tsx — Fullscreen mobile-first story creator.
 *
 * Features:
 *  • Fullscreen overlay (fixed inset-0, no bottom-sheet card)
 *  • Tabs: Photo / Video / Text — icon labels, no emoji
 *  • Text mode: type directly ON the gradient canvas (transparent textarea + visual display)
 *  • 10 rich gradient backgrounds + 8 font colors
 *  • Music: expandable card (not a bare input)
 *  • Privacy: horizontal pill row with icons
 *  • Swipe down to close (drag="y" on the sheet, disabled when keyboard open)
 *  • Rubber-band close threshold: 120px drag-down
 *  • Keyboard detection via visualViewport
 *  • All buttons carry type="button" — no accidental form submit or download
 *  • Slides in from bottom (spring animation)
 */
import { useState, useRef, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, Camera, Film, Type, Globe, Users, UserCheck, Lock,
  Music2, ChevronDown, ChevronUp, Check, AlertCircle,
} from "lucide-react";
import { createPulse, uploadPulseMedia } from "@/lib/pulseClient";
import { useAppStore } from "@/lib/store";

/* ── Types ─────────────────────────────────────────────────────────────── */
type PulseType  = "image" | "video" | "text";
type Visibility = "public" | "followers" | "friends" | "private";

interface CreatePulseProps {
  onClose:   () => void;
  onCreated: () => void;
}

/* ── Design tokens ──────────────────────────────────────────────────────── */
const TEXT_BG_PRESETS: { bg: string }[] = [
  { bg: "linear-gradient(160deg,#0d0b1a 0%,#1a1040 100%)" },   // Deep space
  { bg: "linear-gradient(135deg,#8338ec 0%,#ff006e 100%)" },    // Socia brand
  { bg: "linear-gradient(135deg,#3a86ff 0%,#06d6a0 100%)" },    // Ocean teal
  { bg: "linear-gradient(135deg,#fb5607 0%,#ff006e 100%)" },    // Sunset
  { bg: "linear-gradient(160deg,#0d1b2a 0%,#1b4332 100%)" },   // Night forest
  { bg: "linear-gradient(135deg,#240046 0%,#7b2d8b 100%)" },    // Dark violet
  { bg: "linear-gradient(135deg,#ff0080 0%,#ffb700 100%)" },    // Candy
  { bg: "linear-gradient(135deg,#00b4d8 0%,#023e8a 100%)" },    // Deep ocean
  { bg: "linear-gradient(135deg,#e63946 0%,#6d6875 100%)" },    // Rose-lavender
  { bg: "linear-gradient(160deg,#1a1a2e 0%,#e94560 100%)" },   // Midnight red
];

const TEXT_COLORS = [
  "#ffffff", "#000000", "#ffbe0b", "#06d6a0",
  "#ff006e", "#3a86ff", "#ff9f43", "#c77dff",
];

const VISIBILITY_OPTS: { value: Visibility; label: string; Icon: React.ElementType }[] = [
  { value: "public",    label: "Public",    Icon: Globe },
  { value: "followers", label: "Followers", Icon: Users },
  { value: "friends",   label: "Friends",   Icon: UserCheck },
  { value: "private",   label: "Only Me",   Icon: Lock },
];

/* ── Auto font-size ────────────────────────────────────────────────────── */
function autoFontSize(len: number): number {
  if (len < 20)  return 34;
  if (len < 50)  return 28;
  if (len < 100) return 22;
  if (len < 180) return 18;
  return 14;
}

/* ── Component ─────────────────────────────────────────────────────────── */
export function CreatePulse({ onClose, onCreated }: CreatePulseProps) {
  const me = useAppStore((s) => s.user);

  /* ── State ─────────────────────────────────────────────── */
  const [tab,        setTab]        = useState<PulseType>("image");
  const [file,       setFile]       = useState<File | null>(null);
  const [preview,    setPreview]    = useState<string | null>(null);
  const [textVal,    setTextVal]    = useState("");
  const [bgIdx,      setBgIdx]      = useState(0);
  const [textColor,  setTextColor]  = useState("#ffffff");
  const [visibility, setVisibility] = useState<Visibility>("public");
  const [musicOpen,  setMusicOpen]  = useState(false);
  const [musicName,  setMusicName]  = useState("");
  const [uploading,  setUploading]  = useState(false);
  const [error,      setError]      = useState<string | null>(null);
  const [kbOpen,     setKbOpen]     = useState(false);

  const imgRef  = useRef<HTMLInputElement>(null);
  const vidRef  = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);

  /* ── Keyboard detection ────────────────────────────────── */
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const check = () => setKbOpen(vv.height < window.innerHeight * 0.75);
    vv.addEventListener("resize", check);
    return () => vv.removeEventListener("resize", check);
  }, []);

  /* ── Tab switch ────────────────────────────────────────── */
  const switchTab = useCallback((t: PulseType) => {
    setTab(t);
    setFile(null);
    if (preview?.startsWith("blob:")) URL.revokeObjectURL(preview);
    setPreview(null);
    setError(null);
    if (t === "text") setTimeout(() => textRef.current?.focus(), 180);
  }, [preview]);

  /* ── File pick ─────────────────────────────────────────── */
  const pickFile = useCallback((f: File) => {
    if (preview?.startsWith("blob:")) URL.revokeObjectURL(preview);
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setError(null);
  }, [preview]);

  const handleImgChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) { pickFile(f); setTab("image"); }
    e.target.value = "";
  }, [pickFile]);

  const handleVidChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) { pickFile(f); setTab("video"); }
    e.target.value = "";
  }, [pickFile]);

  const clearFile = useCallback(() => {
    if (preview?.startsWith("blob:")) URL.revokeObjectURL(preview);
    setFile(null);
    setPreview(null);
  }, [preview]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (!f) return;
    pickFile(f);
    setTab(f.type.startsWith("video") ? "video" : "image");
  }, [pickFile]);

  /* ── Post ──────────────────────────────────────────────── */
  const handlePost = useCallback(async () => {
    if (!me) return;
    setError(null);
    setUploading(true);
    try {
      if (tab === "text") {
        if (!textVal.trim()) { setError("Write something first."); setUploading(false); return; }
        await createPulse({
          type:         "text",
          text_content: textVal.trim(),
          text_bg:      TEXT_BG_PRESETS[bgIdx].bg,
          text_color:   textColor,
          visibility,
          music_name:   musicName.trim() || undefined,
        });
      } else {
        if (!file) { setError("Pick a file first."); setUploading(false); return; }
        const mediaUrl = await uploadPulseMedia(file, me.id);
        await createPulse({
          type:       tab,
          media_url:  mediaUrl,
          visibility,
          music_name: musicName.trim() || undefined,
        });
      }
      onCreated();
    } catch (err: any) {
      setError(err?.message ?? "Failed to post. Please try again.");
    } finally {
      setUploading(false);
    }
  }, [me, tab, textVal, bgIdx, textColor, visibility, musicName, file, onCreated]);

  const canPost = tab === "text" ? textVal.trim().length > 0 : Boolean(file);
  const textBg  = TEXT_BG_PRESETS[bgIdx].bg;

  /* ── Render ────────────────────────────────────────────── */
  return createPortal(
    <AnimatePresence>
      <motion.div
        key="story-creator"
        className="fixed inset-0 z-[9999] flex flex-col overflow-hidden"
        style={{
          background:  tab === "text" ? textBg : "#000",
          willChange:  "transform",
          touchAction: kbOpen ? "auto" : "none",
        }}
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", stiffness: 360, damping: 34, restDelta: 1 }}
        drag={kbOpen ? false : "y"}
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0, bottom: 0.22 }}
        onDragEnd={(_, info) => { if (!kbOpen && info.offset.y > 120) onClose(); }}
      >
        {/* Hidden file inputs */}
        <input ref={imgRef} type="file" accept="image/*" className="hidden" onChange={handleImgChange} />
        <input ref={vidRef} type="file" accept="video/*" className="hidden" onChange={handleVidChange} />

        {/* ── Drag handle ─────────────────────────────────── */}
        <div className="flex-shrink-0 flex justify-center pt-3 pb-1 pointer-events-none select-none">
          <div className="h-1 w-10 rounded-full" style={{ background: "rgba(255,255,255,0.22)" }} />
        </div>

        {/* ── Top bar ─────────────────────────────────────── */}
        <div className="flex-shrink-0 flex items-center justify-between px-4 pb-3">
          {/* Close */}
          <motion.button
            type="button"
            whileTap={{ scale: 0.85 }}
            onClick={onClose}
            className="grid h-9 w-9 place-items-center rounded-full"
            style={{ background: "rgba(255,255,255,0.10)" }}
            aria-label="Close"
          >
            <X className="h-4 w-4 text-white" />
          </motion.button>

          {/* Tab pills */}
          <div
            className="flex items-center rounded-full p-[3px]"
            style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.06)" }}
          >
            {([
              ["image", Camera, "Photo"],
              ["video", Film,   "Video"],
              ["text",  Type,   "Text" ],
            ] as const).map(([t, Icon, label]) => (
              <motion.button
                type="button"
                key={t}
                whileTap={{ scale: 0.92 }}
                onClick={() => switchTab(t as PulseType)}
                className="flex items-center gap-1.5 px-3.5 py-[6px] rounded-full text-[12px] font-semibold"
                style={tab === t ? {
                  background: "linear-gradient(135deg,#8338ec,#ff006e)",
                  color: "#fff",
                } : { color: "rgba(255,255,255,0.42)" }}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </motion.button>
            ))}
          </div>

          {/* Share button */}
          <motion.button
            type="button"
            whileTap={{ scale: 0.92 }}
            onClick={handlePost}
            disabled={!canPost || uploading}
            className="rounded-full px-4 py-2 text-[13px] font-bold text-white disabled:opacity-35 transition-opacity"
            style={{ background: "linear-gradient(135deg,#8338ec,#ff006e)" }}
          >
            {uploading ? (
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-3 w-3 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                Posting
              </span>
            ) : "Share"}
          </motion.button>
        </div>

        {/* ── Content area ────────────────────────────────── */}
        <div className="flex-1 relative overflow-hidden">

          {/* Photo */}
          {tab === "image" && (
            preview ? (
              <div className="h-full relative">
                <img src={preview} alt="" className="h-full w-full object-contain" draggable={false} />
                <button
                  type="button"
                  onClick={clearFile}
                  className="absolute top-3 right-3 h-8 w-8 rounded-full grid place-items-center"
                  style={{ background: "rgba(0,0,0,0.6)", border: "1px solid rgba(255,255,255,0.12)" }}
                  aria-label="Remove photo"
                >
                  <X className="h-3.5 w-3.5 text-white" />
                </button>
              </div>
            ) : (
              <div
                className="h-full flex flex-col items-center justify-center gap-6 cursor-pointer"
                onClick={() => imgRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
              >
                <div
                  className="grid place-items-center rounded-full"
                  style={{
                    width: 100, height: 100,
                    background: "rgba(131,56,236,0.11)",
                    border: "2.5px dashed rgba(131,56,236,0.40)",
                  }}
                >
                  <Camera className="h-10 w-10" style={{ color: "rgba(131,56,236,0.65)" }} />
                </div>
                <div className="text-center">
                  <p className="text-[16px] font-semibold" style={{ color: "rgba(255,255,255,0.65)" }}>
                    Tap to add a photo
                  </p>
                  <p className="mt-1.5 text-[12px]" style={{ color: "rgba(255,255,255,0.28)" }}>
                    JPG · PNG · WEBP
                  </p>
                </div>
              </div>
            )
          )}

          {/* Video */}
          {tab === "video" && (
            preview ? (
              <div className="h-full relative">
                <video
                  src={preview}
                  className="h-full w-full object-contain"
                  controls
                  playsInline
                />
                <button
                  type="button"
                  onClick={clearFile}
                  className="absolute top-3 right-3 h-8 w-8 rounded-full grid place-items-center"
                  style={{ background: "rgba(0,0,0,0.6)", border: "1px solid rgba(255,255,255,0.12)" }}
                  aria-label="Remove video"
                >
                  <X className="h-3.5 w-3.5 text-white" />
                </button>
              </div>
            ) : (
              <div
                className="h-full flex flex-col items-center justify-center gap-6 cursor-pointer"
                onClick={() => vidRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
              >
                <div
                  className="grid place-items-center rounded-full"
                  style={{
                    width: 100, height: 100,
                    background: "rgba(131,56,236,0.11)",
                    border: "2.5px dashed rgba(131,56,236,0.40)",
                  }}
                >
                  <Film className="h-10 w-10" style={{ color: "rgba(131,56,236,0.65)" }} />
                </div>
                <div className="text-center">
                  <p className="text-[16px] font-semibold" style={{ color: "rgba(255,255,255,0.65)" }}>
                    Tap to add a video
                  </p>
                  <p className="mt-1.5 text-[12px]" style={{ color: "rgba(255,255,255,0.28)" }}>
                    MP4 · MOV · WEBM
                  </p>
                </div>
              </div>
            )
          )}

          {/* Text (canvas) */}
          {tab === "text" && (
            <div
              className="h-full relative"
              onClick={() => textRef.current?.focus()}
            >
              {/* Visual text display — non-interactive overlay */}
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-10 select-none">
                {textVal ? (
                  <p
                    className="text-center font-bold leading-tight break-words whitespace-pre-wrap w-full"
                    style={{
                      color:      textColor,
                      fontSize:   autoFontSize(textVal.length),
                      textShadow: "0 2px 24px rgba(0,0,0,0.35)",
                      transition: "font-size 0.12s ease",
                    }}
                  >
                    {textVal}
                  </p>
                ) : (
                  <p
                    className="text-center font-medium"
                    style={{ color: "rgba(255,255,255,0.28)", fontSize: 19 }}
                  >
                    Tap to type your story…
                  </p>
                )}
              </div>

              {/* Transparent textarea — captures all input, shows only caret */}
              <textarea
                ref={textRef}
                value={textVal}
                onChange={(e) => setTextVal(e.target.value)}
                maxLength={280}
                className="absolute inset-0 w-full h-full resize-none outline-none bg-transparent text-transparent"
                style={{ caretColor: textColor, padding: "80px 40px", fontSize: 24 }}
                aria-label="Story text"
                spellCheck
              />

              {/* Character counter */}
              {textVal.length > 200 && (
                <div
                  className="pointer-events-none absolute bottom-4 right-4 text-[11px] font-mono"
                  style={{ color: textVal.length > 260 ? "#ff006e" : "rgba(255,255,255,0.35)" }}
                >
                  {280 - textVal.length}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Bottom strip ─────────────────────────────────── */}
        <div
          className="flex-shrink-0 px-4 pt-3 space-y-3"
          style={{
            paddingBottom: "max(24px, env(safe-area-inset-bottom))",
            background: tab === "text"
              ? "linear-gradient(to top,rgba(0,0,0,0.6) 0%,transparent 100%)"
              : "transparent",
          }}
        >
          {/* Background + color pickers (text mode only) */}
          {tab === "text" && (
            <div className="flex items-center gap-2 overflow-x-auto hide-scrollbar py-1">
              {TEXT_BG_PRESETS.map((preset, i) => (
                <motion.button
                  type="button"
                  key={i}
                  whileTap={{ scale: 0.88 }}
                  onClick={(e) => { e.stopPropagation(); setBgIdx(i); }}
                  className="h-9 w-9 rounded-full flex-shrink-0 grid place-items-center relative"
                  style={{
                    background:    preset.bg,
                    outline:       bgIdx === i ? "2.5px solid #fff" : "none",
                    outlineOffset: 2,
                  }}
                  aria-label={`Background ${i + 1}`}
                >
                  {bgIdx === i && <Check className="h-3.5 w-3.5 text-white drop-shadow" />}
                </motion.button>
              ))}

              <div
                className="w-px self-stretch flex-shrink-0 mx-1"
                style={{ background: "rgba(255,255,255,0.15)" }}
              />

              {TEXT_COLORS.map((c) => (
                <motion.button
                  type="button"
                  key={c}
                  whileTap={{ scale: 0.88 }}
                  onClick={(e) => { e.stopPropagation(); setTextColor(c); }}
                  className="h-8 w-8 rounded-full flex-shrink-0 border-2"
                  style={{
                    background:  c,
                    borderColor: textColor === c ? "#fff" : "rgba(255,255,255,0.15)",
                  }}
                  aria-label={`Color ${c}`}
                />
              ))}
            </div>
          )}

          {/* Music card */}
          <motion.button
            type="button"
            whileTap={{ scale: 0.98 }}
            onClick={(e) => { e.stopPropagation(); setMusicOpen(!musicOpen); }}
            className="flex items-center gap-3 w-full rounded-2xl px-4 py-3 text-left"
            style={{
              background: "rgba(255,255,255,0.07)",
              border:     "1px solid rgba(255,255,255,0.09)",
            }}
          >
            <Music2
              className="h-4 w-4 flex-shrink-0"
              style={{ color: musicOpen ? "#a855f7" : "rgba(255,255,255,0.40)" }}
            />
            <span
              className="flex-1 text-[13px] truncate"
              style={{ color: musicName ? "#fff" : "rgba(255,255,255,0.35)" }}
            >
              {musicName || "Add a music label"}
            </span>
            {musicOpen
              ? <ChevronUp   className="h-4 w-4 flex-shrink-0 text-white/35" />
              : <ChevronDown className="h-4 w-4 flex-shrink-0 text-white/35" />
            }
          </motion.button>

          <AnimatePresence initial={false}>
            {musicOpen && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <input
                  type="text"
                  value={musicName}
                  onChange={(e) => setMusicName(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  placeholder="Song name or artist…"
                  className="w-full rounded-xl px-4 py-3 text-[13px] text-white outline-none"
                  style={{
                    background: "rgba(255,255,255,0.06)",
                    border:     "1px solid rgba(255,255,255,0.09)",
                  }}
                />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Privacy pills */}
          <div className="flex gap-2">
            {VISIBILITY_OPTS.map(({ value, label, Icon }) => {
              const active = visibility === value;
              return (
                <motion.button
                  type="button"
                  key={value}
                  whileTap={{ scale: 0.92 }}
                  onClick={(e) => { e.stopPropagation(); setVisibility(value); }}
                  className="flex-1 flex flex-col items-center gap-1.5 rounded-2xl py-2.5 px-1"
                  style={active ? {
                    background: "linear-gradient(135deg,rgba(131,56,236,0.28),rgba(255,0,110,0.14))",
                    border:     "1px solid rgba(131,56,236,0.5)",
                  } : {
                    background: "rgba(255,255,255,0.05)",
                    border:     "1px solid rgba(255,255,255,0.07)",
                  }}
                  aria-pressed={active}
                  aria-label={label}
                >
                  <Icon
                    className="h-4 w-4"
                    style={{ color: active ? "#a855f7" : "rgba(255,255,255,0.38)" }}
                  />
                  <span
                    className="text-[10px] font-bold"
                    style={{ color: active ? "#a855f7" : "rgba(255,255,255,0.38)" }}
                  >
                    {label}
                  </span>
                </motion.button>
              );
            })}
          </div>

          {/* Error */}
          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="flex items-center gap-2 rounded-xl px-3 py-2.5"
                style={{
                  background: "rgba(239,68,68,0.12)",
                  border:     "1px solid rgba(239,68,68,0.28)",
                }}
              >
                <AlertCircle className="h-3.5 w-3.5 text-red-400 flex-shrink-0" />
                <span className="text-[12px] text-red-400">{error}</span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </AnimatePresence>,
    document.body,
  );
}
