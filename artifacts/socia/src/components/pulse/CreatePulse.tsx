/**
 * CreatePulse.tsx — TikTok × Facebook Stories creator.
 *
 * Design language:
 *   • Edge-to-edge fullscreen canvas
 *   • Floating glass controls (backdrop-blur)
 *   • Camera-first viewfinder idle state
 *   • Bottom sheet media picker
 *   • No technical file-format labels
 */
import { useState, useRef, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, Check, Globe, Users, UserCheck, Lock,
  Music2, ChevronDown, Play, Sparkles,
  ImageIcon, Video,
} from "lucide-react";
import { createPulse, uploadPulseMedia } from "@/lib/pulseClient";
import { useAppStore } from "@/lib/store";

/* ── Types ─────────────────────────────────────────────────────────────── */
type PulseMode   = "photo" | "video" | "text";
type Visibility  = "public" | "followers" | "friends" | "private";

interface Props {
  onClose:   () => void;
  onCreated: () => void;
}

/* ── Design tokens ──────────────────────────────────────────────────────── */
const BG_PRESETS = [
  { bg: "linear-gradient(160deg,#1a0533 0%,#4a0080 100%)" },
  { bg: "linear-gradient(135deg,#8338ec 0%,#ff006e 100%)" },
  { bg: "linear-gradient(135deg,#3a86ff 0%,#06d6a0 100%)" },
  { bg: "linear-gradient(135deg,#fb5607 0%,#ff006e 100%)" },
  { bg: "linear-gradient(160deg,#0d1b2a 0%,#1b4332 100%)" },
  { bg: "linear-gradient(135deg,#240046 0%,#7b2d8b 100%)" },
  { bg: "linear-gradient(135deg,#ff0080 0%,#ffb700 100%)" },
  { bg: "linear-gradient(135deg,#00b4d8 0%,#023e8a 100%)" },
  { bg: "linear-gradient(135deg,#e63946 0%,#6d6875 100%)" },
  { bg: "linear-gradient(160deg,#1a1a2e 0%,#e94560 100%)" },
  { bg: "linear-gradient(135deg,#2d6a4f 0%,#95d5b2 100%)" },
  { bg: "linear-gradient(135deg,#6a0572 0%,#f72585 100%)" },
];

const TEXT_COLORS = [
  "#ffffff","#000000","#ffbe0b","#06d6a0",
  "#ff006e","#3a86ff","#ff9f43","#c77dff",
  "#00f5d4","#ef233c","#8338ec","#f72585",
];

const VISIBILITY_OPTS: { value: Visibility; label: string; Icon: React.ElementType }[] = [
  { value: "public",    label: "Everyone", Icon: Globe     },
  { value: "followers", label: "Followers", Icon: Users     },
  { value: "friends",   label: "Friends",  Icon: UserCheck },
  { value: "private",   label: "Only Me",  Icon: Lock      },
];

const MODES: { id: PulseMode; label: string }[] = [
  { id: "photo", label: "Photo" },
  { id: "video", label: "Video" },
  { id: "text",  label: "Text"  },
];

function fontSize(len: number) {
  if (len < 20)  return 40;
  if (len < 50)  return 30;
  if (len < 100) return 24;
  if (len < 180) return 18;
  return 15;
}

/* ── Glass pill ─────────────────────────────────────────────────────────── */
function GlassBtn({
  onClick, children, className = "", style = {},
}: {
  onClick: (e: React.MouseEvent) => void;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.88 }}
      onClick={onClick}
      className={`grid place-items-center rounded-full ${className}`}
      style={{
        background:    "rgba(0,0,0,0.35)",
        backdropFilter:"blur(14px) saturate(1.4)",
        WebkitBackdropFilter:"blur(14px) saturate(1.4)",
        border:        "1px solid rgba(255,255,255,0.14)",
        ...style,
      }}
    >
      {children}
    </motion.button>
  );
}

/* ── Viewfinder corner brackets ─────────────────────────────────────────── */
function ViewfinderCorners() {
  const corner = (pos: React.CSSProperties) => (
    <div
      style={{
        position: "absolute",
        width: 28,
        height: 28,
        borderColor: "rgba(255,255,255,0.55)",
        borderStyle: "solid",
        ...pos,
      }}
    />
  );
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
      <div className="relative" style={{ width: 200, height: 280 }}>
        {corner({ top: 0, left: 0,  borderWidth: "2px 0 0 2px", borderRadius: "6px 0 0 0"    })}
        {corner({ top: 0, right: 0, borderWidth: "2px 2px 0 0", borderRadius: "0 6px 0 0"    })}
        {corner({ bottom: 0, left: 0,  borderWidth: "0 0 2px 2px", borderRadius: "0 0 0 6px" })}
        {corner({ bottom: 0, right: 0, borderWidth: "0 2px 2px 0", borderRadius: "0 0 6px 0" })}
      </div>
    </div>
  );
}

/* ── Main component ─────────────────────────────────────────────────────── */
export function CreatePulse({ onClose, onCreated }: Props) {
  const me = useAppStore((s) => s.user);

  const [mode,       setMode]       = useState<PulseMode>("photo");
  const [file,       setFile]       = useState<File | null>(null);
  const [preview,    setPreview]    = useState<string | null>(null);
  const [textVal,    setTextVal]    = useState("");
  const [bgIdx,      setBgIdx]      = useState(0);
  const [textColor,  setTextColor]  = useState("#ffffff");
  const [visibility, setVisibility] = useState<Visibility>("public");
  const [musicName,  setMusicName]  = useState("");
  const [uploading,  setUploading]  = useState(false);
  const [uploadPct,  setUploadPct]  = useState(0);
  const [error,      setError]      = useState<string | null>(null);
  const [playing,    setPlaying]    = useState(false);
  const [sheet,      setSheet]      = useState(false);   // bottom media-picker sheet
  const [musicOpen,  setMusicOpen]  = useState(false);
  const [visOpen,    setVisOpen]    = useState(false);

  const imgRef   = useRef<HTMLInputElement>(null);
  const vidRef   = useRef<HTMLInputElement>(null);
  const textRef  = useRef<HTMLTextAreaElement>(null);
  const vidElRef = useRef<HTMLVideoElement>(null);

  /* Focus textarea when entering text mode */
  useEffect(() => {
    if (mode === "text") setTimeout(() => textRef.current?.focus(), 200);
  }, [mode]);

  const switchMode = useCallback((m: PulseMode) => {
    setMode(m);
    setFile(null);
    if (preview?.startsWith("blob:")) URL.revokeObjectURL(preview);
    setPreview(null);
    setError(null);
    setSheet(false);
    setPlaying(false);
  }, [preview]);

  const pickFile = useCallback((f: File) => {
    if (preview?.startsWith("blob:")) URL.revokeObjectURL(preview);
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setError(null);
    setSheet(false);
  }, [preview]);

  const handleImgChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) { pickFile(f); setMode("photo"); }
    e.target.value = "";
  }, [pickFile]);

  const handleVidChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) { pickFile(f); setMode("video"); }
    e.target.value = "";
  }, [pickFile]);

  const clearMedia = useCallback(() => {
    if (preview?.startsWith("blob:")) URL.revokeObjectURL(preview);
    setFile(null); setPreview(null); setPlaying(false);
  }, [preview]);

  const togglePlay = useCallback(() => {
    const v = vidElRef.current;
    if (!v) return;
    if (playing) { v.pause(); setPlaying(false); }
    else { v.play().then(() => setPlaying(true)).catch(() => {}); }
  }, [playing]);

  const simulateProgress = useCallback(() => {
    setUploadPct(0);
    const t = setInterval(() => {
      setUploadPct((p) => {
        if (p >= 85) { clearInterval(t); return 85; }
        return p + Math.random() * 14;
      });
    }, 180);
    return () => clearInterval(t);
  }, []);

  /* ── Post ────────────────────────────────────────────────────────────── */
  const handlePost = useCallback(async () => {
    if (!me) return;
    setError(null);
    setUploading(true);
    let stopProgress = () => {};

    try {
      if (mode === "text") {
        if (!textVal.trim()) {
          setError("Write something first.");
          setUploading(false);
          return;
        }
        setUploadPct(50);
        await createPulse({
          type:         "text",
          text_content: textVal.trim(),
          text_bg:      BG_PRESETS[bgIdx].bg,
          text_color:   textColor,
          visibility,
          music_name:   musicName.trim() || undefined,
        });
      } else {
        if (!file) {
          setError("Pick a photo or video first.");
          setUploading(false);
          return;
        }
        stopProgress = simulateProgress();
        const mediaUrl = await uploadPulseMedia(file, me.id);
        setUploadPct(90);
        await createPulse({
          type:       mode === "photo" ? "image" : "video",
          media_url:  mediaUrl,
          visibility,
          music_name: musicName.trim() || undefined,
        });
      }
      setUploadPct(100);
      setTimeout(() => { stopProgress(); onCreated(); }, 300);
    } catch (err: any) {
      stopProgress();
      setUploadPct(0);
      setError(err?.message ?? "Something went wrong. Try again.");
    } finally {
      setUploading(false);
    }
  }, [me, mode, textVal, bgIdx, textColor, visibility, musicName, file, onCreated, simulateProgress]);

  const canPost = !uploading && (mode === "text" ? textVal.trim().length > 0 : Boolean(file));
  const textBg  = BG_PRESETS[bgIdx].bg;
  const activeVisibility = VISIBILITY_OPTS.find((o) => o.value === visibility)!;
  const VisIcon = activeVisibility.Icon;

  /* ── Canvas background ──────────────────────────────────────────────── */
  const canvasBg = mode === "text" ? textBg : "#0a0a0a";

  return createPortal(
    <AnimatePresence>
      <motion.div
        key="pulse-creator"
        className="fixed inset-0 z-[9999] flex flex-col overflow-hidden"
        style={{ background: canvasBg }}
        initial={{ y: "100%", opacity: 0.7 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: "100%", opacity: 0 }}
        transition={{ type: "spring", stiffness: 340, damping: 34 }}
      >
        {/* Hidden file inputs */}
        <input ref={imgRef} type="file" accept="image/*" className="hidden" onChange={handleImgChange} />
        <input ref={vidRef} type="file" accept="video/*" className="hidden" onChange={handleVidChange} />

        {/* ── Upload progress bar ──────────────────────────────────────── */}
        <AnimatePresence>
          {uploading && (
            <motion.div
              className="absolute top-0 left-0 right-0 h-[3px] origin-left z-50"
              style={{ background: "linear-gradient(90deg,#8338ec,#ff006e,#ffbe0b)" }}
              initial={{ scaleX: 0 }}
              animate={{ scaleX: uploadPct / 100 }}
              transition={{ ease: "linear", duration: 0.2 }}
            />
          )}
        </AnimatePresence>

        {/* ── Floating top bar ─────────────────────────────────────────── */}
        <div
          className="absolute top-0 left-0 right-0 z-30 flex items-center justify-between px-4"
          style={{ paddingTop: `max(env(safe-area-inset-top, 0px), 14px)`, paddingBottom: 12 }}
        >
          {/* Close */}
          <GlassBtn onClick={onClose} style={{ width: 40, height: 40 }}>
            <X className="h-5 w-5 text-white" />
          </GlassBtn>

          {/* Visibility pill */}
          <motion.button
            type="button"
            whileTap={{ scale: 0.93 }}
            onClick={(e) => { e.stopPropagation(); setVisOpen((v) => !v); }}
            className="flex items-center gap-1.5 rounded-full px-3 py-1.5"
            style={{
              background:    "rgba(0,0,0,0.35)",
              backdropFilter:"blur(14px)",
              WebkitBackdropFilter:"blur(14px)",
              border:        "1px solid rgba(255,255,255,0.14)",
            }}
          >
            <VisIcon className="h-3.5 w-3.5 text-white/70" />
            <span className="text-[12px] font-semibold text-white/80">
              {activeVisibility.label}
            </span>
            <ChevronDown className="h-3 w-3 text-white/40" />
          </motion.button>

          {/* Share / Post */}
          <motion.button
            type="button"
            whileTap={{ scale: 0.88 }}
            onClick={handlePost}
            disabled={!canPost}
            className="rounded-full px-5 py-2 text-[13.5px] font-bold text-white transition-opacity disabled:opacity-30"
            style={{ background: "linear-gradient(135deg,#8338ec,#ff006e)" }}
          >
            {uploading
              ? `${Math.round(uploadPct)}%`
              : "Share"
            }
          </motion.button>
        </div>

        {/* ── Visibility dropdown ──────────────────────────────────────── */}
        <AnimatePresence>
          {visOpen && (
            <>
              <motion.div
                className="fixed inset-0 z-[35]"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setVisOpen(false)}
              />
              <motion.div
                className="absolute left-1/2 top-20 z-40 rounded-2xl overflow-hidden shadow-2xl"
                style={{
                  transform: "translateX(-50%)",
                  background: "rgba(15,10,25,0.88)",
                  backdropFilter: "blur(20px)",
                  border: "1px solid rgba(255,255,255,0.12)",
                  minWidth: 200,
                }}
                initial={{ opacity: 0, scale: 0.9, y: -8 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: -8 }}
                transition={{ type: "spring", stiffness: 400, damping: 28 }}
              >
                {VISIBILITY_OPTS.map(({ value, label, Icon: Ic }) => (
                  <motion.button
                    type="button"
                    key={value}
                    whileTap={{ scale: 0.97 }}
                    onClick={(e) => { e.stopPropagation(); setVisibility(value); setVisOpen(false); }}
                    className="flex items-center gap-3 w-full px-4 py-3 text-left transition-colors"
                    style={{
                      background: visibility === value ? "rgba(131,56,236,0.20)" : "transparent",
                    }}
                  >
                    <Ic className="h-4 w-4 flex-shrink-0" style={{ color: visibility === value ? "#c084fc" : "rgba(255,255,255,0.5)" }} />
                    <span className="text-[13.5px] font-medium" style={{ color: visibility === value ? "#e2c6ff" : "rgba(255,255,255,0.75)" }}>
                      {label}
                    </span>
                    {visibility === value && <Check className="h-3.5 w-3.5 text-purple-400 ml-auto" />}
                  </motion.button>
                ))}
              </motion.div>
            </>
          )}
        </AnimatePresence>

        {/* ══════════════════════════════════════════════════════════════
            CONTENT AREA — fills remaining screen between topbar & bottom
            ══════════════════════════════════════════════════════════════ */}
        <div className="absolute inset-0 flex items-center justify-center">

          {/* ── TEXT mode ────────────────────────────────────────────── */}
          {mode === "text" && (
            <div
              className="absolute inset-0"
              onClick={() => textRef.current?.focus()}
            >
              {/* Visual layer */}
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-10">
                {textVal ? (
                  <p
                    className="text-center font-bold leading-snug break-words whitespace-pre-wrap w-full"
                    style={{
                      color:       textColor,
                      fontSize:    fontSize(textVal.length),
                      textShadow:  "0 2px 40px rgba(0,0,0,0.45)",
                      letterSpacing: "-0.01em",
                      transition:  "font-size 0.12s ease",
                    }}
                  >
                    {textVal}
                  </p>
                ) : (
                  <div className="flex flex-col items-center gap-3 select-none pointer-events-none">
                    <Sparkles className="h-8 w-8 opacity-25 text-white" />
                    <p className="text-center font-semibold text-white/25" style={{ fontSize: 19 }}>
                      Tap to write your story
                    </p>
                  </div>
                )}
              </div>

              {/* Transparent textarea */}
              <textarea
                ref={textRef}
                value={textVal}
                onChange={(e) => setTextVal(e.target.value)}
                maxLength={300}
                className="absolute inset-0 w-full h-full resize-none outline-none bg-transparent text-transparent"
                style={{
                  caretColor: textColor,
                  padding: "100px 40px",
                  fontSize: 28,
                  lineHeight: 1.4,
                }}
                aria-label="Story text"
                spellCheck
              />

              {/* Char counter */}
              {textVal.length > 230 && (
                <div
                  className="pointer-events-none absolute bottom-48 right-5 text-[11px] font-mono font-bold tabular-nums"
                  style={{ color: textVal.length > 270 ? "#ff006e" : "rgba(255,255,255,0.35)" }}
                >
                  {300 - textVal.length}
                </div>
              )}
            </div>
          )}

          {/* ── PHOTO mode — preview ─────────────────────────────────── */}
          {mode === "photo" && preview && (
            <motion.div
              className="absolute inset-0"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              <img
                src={preview}
                alt=""
                className="h-full w-full object-cover"
                draggable={false}
                style={{ userSelect: "none" }}
              />
              {/* Scrim */}
              <div
                className="absolute inset-0"
                style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0.25) 0%, transparent 25%, transparent 70%, rgba(0,0,0,0.5) 100%)" }}
              />
            </motion.div>
          )}

          {/* ── VIDEO mode — preview ─────────────────────────────────── */}
          {mode === "video" && preview && (
            <motion.div
              className="absolute inset-0"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              onClick={togglePlay}
            >
              <video
                ref={vidElRef}
                src={preview}
                className="h-full w-full object-cover"
                playsInline
                loop
                disablePictureInPicture
                controlsList="nodownload noplaybackrate nofullscreen"
                onContextMenu={(e) => e.preventDefault()}
                onPlay={() => setPlaying(true)}
                onPause={() => setPlaying(false)}
              />
              {/* Scrim */}
              <div
                className="absolute inset-0 pointer-events-none"
                style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0.25) 0%, transparent 25%, transparent 70%, rgba(0,0,0,0.5) 100%)" }}
              />
              {/* Play/Pause overlay */}
              <AnimatePresence>
                {!playing && (
                  <motion.div
                    className="pointer-events-none absolute inset-0 flex items-center justify-center"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                  >
                    <div
                      className="grid h-20 w-20 place-items-center rounded-full"
                      style={{ background: "rgba(0,0,0,0.45)", backdropFilter: "blur(8px)" }}
                    >
                      <Play className="h-8 w-8 fill-white text-white ml-1" />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}

          {/* ── Empty state: camera viewfinder ───────────────────────── */}
          {(mode === "photo" || mode === "video") && !preview && (
            <div className="absolute inset-0 flex items-center justify-center">
              {/* Subtle vignette */}
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  background: "radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.65) 100%)",
                }}
              />
              <ViewfinderCorners />
            </div>
          )}
        </div>

        {/* ── Remove media (floating top-right corner) ─────────────────── */}
        <AnimatePresence>
          {preview && (
            <motion.div
              className="absolute top-20 right-4 z-30"
              initial={{ opacity: 0, scale: 0.7 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.7 }}
            >
              <GlassBtn onClick={clearMedia} style={{ width: 38, height: 38 }}>
                <X className="h-[17px] w-[17px] text-white" />
              </GlassBtn>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Error toast ──────────────────────────────────────────────── */}
        <AnimatePresence>
          {error && (
            <motion.div
              className="absolute top-20 left-4 right-4 z-40 flex items-center gap-2.5 rounded-2xl px-4 py-3 text-[13px] text-rose-200"
              style={{ background: "rgba(239,68,68,0.18)", border: "1px solid rgba(239,68,68,0.3)", backdropFilter: "blur(12px)" }}
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
            >
              <span className="text-rose-400 flex-shrink-0 text-base">⚠</span>
              {error}
              <button type="button" onClick={() => setError(null)} className="ml-auto">
                <X className="h-3.5 w-3.5 text-rose-400" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ══════════════════════════════════════════════════════════════
            BOTTOM CONTROLS
            ══════════════════════════════════════════════════════════════ */}
        <div
          className="absolute bottom-0 left-0 right-0 z-30 flex flex-col"
          style={{ paddingBottom: `max(env(safe-area-inset-bottom, 0px), 20px)` }}
        >

          {/* ── Text mode: bg + text color pickers ──────────────────── */}
          <AnimatePresence>
            {mode === "text" && (
              <motion.div
                className="px-4 space-y-3 pb-3"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 16 }}
              >
                {/* Background swatches */}
                <div className="flex items-center gap-2 overflow-x-auto hide-scrollbar py-1">
                  {BG_PRESETS.map((p, i) => (
                    <motion.button
                      type="button"
                      key={i}
                      whileTap={{ scale: 0.82 }}
                      onClick={() => setBgIdx(i)}
                      className="h-9 w-9 rounded-full flex-shrink-0 grid place-items-center relative shadow-lg"
                      style={{
                        background:    p.bg,
                        outline:       bgIdx === i ? "2.5px solid #fff" : "2.5px solid transparent",
                        outlineOffset: 2,
                      }}
                    >
                      {bgIdx === i && <Check className="h-3 w-3 text-white drop-shadow-lg" />}
                    </motion.button>
                  ))}
                </div>

                {/* Font color swatches */}
                <div className="flex items-center gap-2 overflow-x-auto hide-scrollbar py-1">
                  <span className="text-[11px] font-black text-white/30 flex-shrink-0 pr-1 select-none tracking-wide">
                    Aa
                  </span>
                  {TEXT_COLORS.map((c) => (
                    <motion.button
                      type="button"
                      key={c}
                      whileTap={{ scale: 0.82 }}
                      onClick={() => setTextColor(c)}
                      className="h-8 w-8 rounded-full flex-shrink-0 grid place-items-center shadow-lg"
                      style={{
                        background:    c,
                        outline:       textColor === c ? "2.5px solid #fff" : "2.5px solid transparent",
                        outlineOffset: 2,
                      }}
                    >
                      {textColor === c && (
                        <Check className="h-2.5 w-2.5 drop-shadow" style={{ color: c === "#ffffff" ? "#000" : "#fff" }} />
                      )}
                    </motion.button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Music row ────────────────────────────────────────────── */}
          <div className="px-4 pb-3">
            <AnimatePresence initial={false}>
              {musicOpen && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden pb-2"
                >
                  <input
                    type="text"
                    value={musicName}
                    onChange={(e) => setMusicName(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    placeholder="Song name or artist…"
                    className="w-full rounded-2xl px-4 py-3 text-[13px] text-white outline-none"
                    style={{
                      background: "rgba(255,255,255,0.09)",
                      border:     "1px solid rgba(255,255,255,0.12)",
                      backdropFilter: "blur(12px)",
                      caretColor: "#a855f7",
                    }}
                  />
                </motion.div>
              )}
            </AnimatePresence>

            <motion.button
              type="button"
              whileTap={{ scale: 0.97 }}
              onClick={(e) => { e.stopPropagation(); setMusicOpen((v) => !v); }}
              className="flex items-center gap-3 w-full rounded-2xl px-4 py-2.5 text-left"
              style={{
                background:    "rgba(255,255,255,0.07)",
                border:        "1px solid rgba(255,255,255,0.10)",
                backdropFilter: "blur(12px)",
              }}
            >
              <Music2
                className="h-4 w-4 flex-shrink-0"
                style={{ color: musicName ? "#a855f7" : "rgba(255,255,255,0.38)" }}
              />
              <span
                className="flex-1 text-[12.5px] font-medium truncate"
                style={{ color: musicName ? "#c084fc" : "rgba(255,255,255,0.35)" }}
              >
                {musicName || "Add music label"}
              </span>
              <motion.div animate={{ rotate: musicOpen ? 180 : 0 }} transition={{ duration: 0.18 }}>
                <ChevronDown className="h-3.5 w-3.5 text-white/25" />
              </motion.div>
            </motion.button>
          </div>

          {/* ── Shutter + mode strip ─────────────────────────────────── */}
          <div className="flex flex-col items-center gap-4 px-4 pb-2">

            {/* Shutter / open-sheet button (photo & video modes) */}
            <AnimatePresence mode="wait">
              {(mode === "photo" || mode === "video") && !preview && (
                <motion.button
                  type="button"
                  key="shutter"
                  whileTap={{ scale: 0.92 }}
                  onClick={() => setSheet(true)}
                  className="relative flex items-center justify-center rounded-full flex-shrink-0"
                  style={{ width: 76, height: 76 }}
                  initial={{ opacity: 0, scale: 0.7 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.7 }}
                  transition={{ type: "spring", stiffness: 400, damping: 26 }}
                >
                  {/* Outer ring */}
                  <div
                    className="absolute inset-0 rounded-full"
                    style={{ border: "2.5px solid rgba(255,255,255,0.55)" }}
                  />
                  {/* Inner fill */}
                  <div
                    className="rounded-full"
                    style={{
                      width: 58,
                      height: 58,
                      background: "linear-gradient(135deg,#8338ec,#ff006e)",
                      boxShadow: "0 0 32px rgba(131,56,236,0.6)",
                    }}
                  />
                </motion.button>
              )}
            </AnimatePresence>

            {/* Mode strip */}
            <div className="flex items-center gap-0 relative">
              {MODES.map(({ id, label }) => {
                const active = mode === id;
                return (
                  <motion.button
                    type="button"
                    key={id}
                    onClick={() => switchMode(id)}
                    className="relative px-5 py-1.5"
                    whileTap={{ scale: 0.92 }}
                  >
                    <span
                      className="text-[14px] font-bold transition-colors duration-150"
                      style={{
                        color: active ? "#ffffff" : "rgba(255,255,255,0.35)",
                      }}
                    >
                      {label}
                    </span>
                    {active && (
                      <motion.div
                        layoutId="mode-indicator"
                        className="absolute bottom-0 left-1/2 -translate-x-1/2 h-[2.5px] w-5 rounded-full"
                        style={{ background: "linear-gradient(90deg,#8338ec,#ff006e)" }}
                        transition={{ type: "spring", stiffness: 500, damping: 30 }}
                      />
                    )}
                  </motion.button>
                );
              })}
            </div>
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════════
            BOTTOM SHEET — media picker
            ══════════════════════════════════════════════════════════════ */}
        <AnimatePresence>
          {sheet && (
            <>
              {/* Scrim */}
              <motion.div
                className="fixed inset-0 z-[50]"
                style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(6px)" }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setSheet(false)}
              />

              {/* Sheet */}
              <motion.div
                className="fixed bottom-0 left-0 right-0 z-[51] rounded-t-[28px] overflow-hidden"
                style={{
                  background: "rgba(14,10,22,0.95)",
                  backdropFilter: "blur(24px)",
                  border: "1px solid rgba(255,255,255,0.10)",
                  paddingBottom: `max(env(safe-area-inset-bottom, 0px), 24px)`,
                }}
                initial={{ y: "100%" }}
                animate={{ y: 0 }}
                exit={{ y: "100%" }}
                transition={{ type: "spring", stiffness: 380, damping: 34 }}
              >
                {/* Handle */}
                <div className="flex justify-center pt-3 pb-2">
                  <div className="h-[3px] w-10 rounded-full bg-white/20" />
                </div>

                <p className="text-center text-[13px] font-semibold text-white/40 mb-5 tracking-wide uppercase">
                  Add to your story
                </p>

                <div className="flex gap-4 px-6 pb-2">
                  {/* Photo option */}
                  <motion.button
                    type="button"
                    whileTap={{ scale: 0.94 }}
                    onClick={() => { setMode("photo"); imgRef.current?.click(); }}
                    className="flex-1 flex flex-col items-center gap-4 rounded-3xl py-8"
                    style={{
                      background: "rgba(131,56,236,0.10)",
                      border:     "1px solid rgba(131,56,236,0.25)",
                    }}
                  >
                    <div
                      className="grid h-16 w-16 place-items-center rounded-2xl"
                      style={{ background: "linear-gradient(135deg,rgba(131,56,236,0.35),rgba(255,0,110,0.20))" }}
                    >
                      <ImageIcon className="h-8 w-8 text-white" />
                    </div>
                    <span className="text-[15px] font-bold text-white">Photo</span>
                  </motion.button>

                  {/* Video option */}
                  <motion.button
                    type="button"
                    whileTap={{ scale: 0.94 }}
                    onClick={() => { setMode("video"); vidRef.current?.click(); }}
                    className="flex-1 flex flex-col items-center gap-4 rounded-3xl py-8"
                    style={{
                      background: "rgba(255,0,110,0.09)",
                      border:     "1px solid rgba(255,0,110,0.22)",
                    }}
                  >
                    <div
                      className="grid h-16 w-16 place-items-center rounded-2xl"
                      style={{ background: "linear-gradient(135deg,rgba(255,0,110,0.30),rgba(255,190,11,0.18))" }}
                    >
                      <Video className="h-8 w-8 text-white" />
                    </div>
                    <span className="text-[15px] font-bold text-white">Video</span>
                  </motion.button>
                </div>

                {/* Dismiss */}
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.97 }}
                  onClick={() => setSheet(false)}
                  className="mt-4 mx-6 w-[calc(100%-48px)] py-3.5 rounded-2xl text-[14px] font-semibold text-white/50"
                  style={{ background: "rgba(255,255,255,0.05)" }}
                >
                  Cancel
                </motion.button>
              </motion.div>
            </>
          )}
        </AnimatePresence>

      </motion.div>
    </AnimatePresence>,
    document.body
  );
}
