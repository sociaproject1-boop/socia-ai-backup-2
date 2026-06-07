/**
 * CreatePulse.tsx — Facebook Stories–quality story creator.
 *
 * Layout (Facebook 2026 style):
 *   Top bar:  [X] close | "Create Story" | [Share] button
 *   Content:  full-screen immersive canvas (photo / video / text)
 *   Bottom:   gradient/color pickers (text mode), music card, audience
 *
 * Bugs fixed:
 *  • Upload uses Cloudinary (no Supabase bucket needed)
 *  • Video preview: controlsList="nodownload noplaybackrate", disablePictureInPicture
 *  • No accidental download access
 */
import { useState, useRef, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, Camera, Film, Type, Globe, Users, UserCheck, Lock,
  Music2, Check, Upload, Play, Pause, ChevronDown, ChevronUp,
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
const TEXT_BG_PRESETS = [
  { bg: "linear-gradient(160deg,#1a0533 0%,#4a0080 100%)",   label: "Violet"   },
  { bg: "linear-gradient(135deg,#8338ec 0%,#ff006e 100%)",   label: "Socia"    },
  { bg: "linear-gradient(135deg,#3a86ff 0%,#06d6a0 100%)",   label: "Ocean"    },
  { bg: "linear-gradient(135deg,#fb5607 0%,#ff006e 100%)",   label: "Sunset"   },
  { bg: "linear-gradient(160deg,#0d1b2a 0%,#1b4332 100%)",   label: "Forest"   },
  { bg: "linear-gradient(135deg,#240046 0%,#7b2d8b 100%)",   label: "Dark"     },
  { bg: "linear-gradient(135deg,#ff0080 0%,#ffb700 100%)",   label: "Candy"    },
  { bg: "linear-gradient(135deg,#00b4d8 0%,#023e8a 100%)",   label: "Blue"     },
  { bg: "linear-gradient(135deg,#e63946 0%,#6d6875 100%)",   label: "Rose"     },
  { bg: "linear-gradient(160deg,#1a1a2e 0%,#e94560 100%)",   label: "Night"    },
  { bg: "linear-gradient(135deg,#2d6a4f 0%,#95d5b2 100%)",   label: "Mint"     },
  { bg: "linear-gradient(135deg,#6a0572 0%,#f72585 100%)",   label: "Magenta"  },
];

const TEXT_COLORS = [
  "#ffffff", "#000000", "#ffbe0b", "#06d6a0",
  "#ff006e", "#3a86ff", "#ff9f43", "#c77dff",
  "#00f5d4", "#ef233c", "#8338ec", "#f72585",
];

const VISIBILITY_OPTS: { value: Visibility; label: string; Icon: React.ElementType }[] = [
  { value: "public",    label: "Public",    Icon: Globe     },
  { value: "followers", label: "Followers", Icon: Users     },
  { value: "friends",   label: "Friends",   Icon: UserCheck },
  { value: "private",   label: "Only Me",   Icon: Lock      },
];

function autoFontSize(len: number): number {
  if (len < 20)  return 36;
  if (len < 50)  return 28;
  if (len < 100) return 22;
  if (len < 180) return 17;
  return 14;
}

/* ── Component ─────────────────────────────────────────────────────────── */
export function CreatePulse({ onClose, onCreated }: CreatePulseProps) {
  const me = useAppStore((s) => s.user);

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
  const [uploadPct,  setUploadPct]  = useState(0);
  const [error,      setError]      = useState<string | null>(null);
  const [vidPlaying, setVidPlaying] = useState(false);
  const [kbOpen,     setKbOpen]     = useState(false);

  const imgRef  = useRef<HTMLInputElement>(null);
  const vidRef  = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const vidElRef = useRef<HTMLVideoElement>(null);

  /* ── Keyboard detection ─────────────────────────────────────────────── */
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const check = () => setKbOpen(vv.height < window.innerHeight * 0.75);
    vv.addEventListener("resize", check);
    return () => vv.removeEventListener("resize", check);
  }, []);

  /* ── Tab switch ─────────────────────────────────────────────────────── */
  const switchTab = useCallback((t: PulseType) => {
    setTab(t);
    setFile(null);
    if (preview?.startsWith("blob:")) URL.revokeObjectURL(preview);
    setPreview(null);
    setError(null);
    if (t === "text") setTimeout(() => textRef.current?.focus(), 180);
  }, [preview]);

  /* ── File pick ──────────────────────────────────────────────────────── */
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
    setVidPlaying(false);
  }, [preview]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (!f) return;
    pickFile(f);
    setTab(f.type.startsWith("video") ? "video" : "image");
  }, [pickFile]);

  const toggleVideoPlay = useCallback(() => {
    const v = vidElRef.current;
    if (!v) return;
    if (vidPlaying) { v.pause(); setVidPlaying(false); }
    else { v.play().then(() => setVidPlaying(true)).catch(() => {}); }
  }, [vidPlaying]);

  /* ── Simulate upload progress (Cloudinary doesn't give XHR progress here) */
  const simulateProgress = useCallback(() => {
    setUploadPct(0);
    const t = setInterval(() => {
      setUploadPct((p) => {
        if (p >= 85) { clearInterval(t); return 85; }
        return p + Math.random() * 12;
      });
    }, 200);
    return () => clearInterval(t);
  }, []);

  /* ── Post / Share ───────────────────────────────────────────────────── */
  const handlePost = useCallback(async () => {
    if (!me) return;
    setError(null);
    setUploading(true);
    let stopProgress = () => {};

    try {
      if (tab === "text") {
        if (!textVal.trim()) {
          setError("Write something first.");
          setUploading(false);
          return;
        }
        setUploadPct(50);
        await createPulse({
          type:         "text",
          text_content: textVal.trim(),
          text_bg:      TEXT_BG_PRESETS[bgIdx].bg,
          text_color:   textColor,
          visibility,
          music_name:   musicName.trim() || undefined,
        });
      } else {
        if (!file) {
          setError("Pick a file first.");
          setUploading(false);
          return;
        }
        stopProgress = simulateProgress();
        const mediaUrl = await uploadPulseMedia(file, me.id);
        setUploadPct(90);
        await createPulse({
          type:       tab,
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
      const msg = err?.message ?? "Failed to post. Please try again.";
      setError(msg);
    } finally {
      setUploading(false);
    }
  }, [me, tab, textVal, bgIdx, textColor, visibility, musicName, file, onCreated, simulateProgress]);

  const canPost = !uploading && (tab === "text" ? textVal.trim().length > 0 : Boolean(file));
  const textBg  = TEXT_BG_PRESETS[bgIdx].bg;

  return createPortal(
    <AnimatePresence>
      <motion.div
        key="story-creator"
        className="fixed inset-0 z-[9999] flex flex-col"
        style={{ background: tab === "text" ? textBg : "#0a0a0a" }}
        initial={{ y: "100%", opacity: 0.8 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: "100%", opacity: 0 }}
        transition={{ type: "spring", stiffness: 380, damping: 36, restDelta: 1 }}
        drag={kbOpen ? false : "y"}
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0, bottom: 0.2 }}
        onDragEnd={(_, info) => { if (!kbOpen && info.offset.y > 130) onClose(); }}
      >
        <input ref={imgRef} type="file" accept="image/*"  className="hidden" onChange={handleImgChange} />
        <input ref={vidRef} type="file" accept="video/*"  className="hidden" onChange={handleVidChange} />

        {/* Drag handle */}
        <div className="flex-shrink-0 flex justify-center pt-2.5 pb-0 pointer-events-none select-none">
          <div className="h-[3px] w-9 rounded-full" style={{ background: "rgba(255,255,255,0.2)" }} />
        </div>

        {/* ── Top bar ─────────────────────────────────────────────────── */}
        <div
          className="flex-shrink-0 flex items-center gap-3 px-4 pt-3 pb-3"
          style={{ paddingTop: `calc(env(safe-area-inset-top, 0px) + 12px)` }}
        >
          {/* Close */}
          <motion.button
            type="button"
            whileTap={{ scale: 0.85 }}
            onClick={onClose}
            className="grid h-9 w-9 place-items-center rounded-full flex-shrink-0"
            style={{ background: "rgba(255,255,255,0.12)", backdropFilter: "blur(8px)" }}
          >
            <X className="h-[18px] w-[18px] text-white" />
          </motion.button>

          {/* Mode tabs — centered */}
          <div className="flex-1 flex items-center justify-center">
            <div
              className="flex items-center rounded-full p-[3px] gap-0.5"
              style={{ background: "rgba(255,255,255,0.10)" }}
            >
              {([
                ["image", Camera, "Photo"],
                ["video", Film,   "Video"],
                ["text",  Type,   "Text" ],
              ] as const).map(([t, Icon, label]) => (
                <motion.button
                  type="button"
                  key={t}
                  whileTap={{ scale: 0.90 }}
                  onClick={() => switchTab(t as PulseType)}
                  className="flex items-center gap-1.5 rounded-full text-[12.5px] font-bold transition-all"
                  style={{
                    padding: "7px 14px",
                    ...(tab === t ? {
                      background: "linear-gradient(135deg,#8338ec,#ff006e)",
                      color: "#fff",
                    } : {
                      color: "rgba(255,255,255,0.45)",
                    }),
                  }}
                >
                  <Icon className="h-3.5 w-3.5 flex-shrink-0" />
                  {label}
                </motion.button>
              ))}
            </div>
          </div>

          {/* Share */}
          <motion.button
            type="button"
            whileTap={{ scale: 0.88 }}
            onClick={handlePost}
            disabled={!canPost}
            className="rounded-full px-5 py-2.5 text-[13px] font-bold text-white flex-shrink-0 transition-opacity disabled:opacity-30"
            style={{ background: "linear-gradient(135deg,#8338ec,#ff006e)" }}
          >
            {uploading ? (
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-3 w-3 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                {uploadPct < 100 ? `${Math.round(uploadPct)}%` : "Done"}
              </span>
            ) : "Share"}
          </motion.button>
        </div>

        {/* ── Progress bar (uploading) ─────────────────────────────── */}
        <AnimatePresence>
          {uploading && (
            <motion.div
              initial={{ scaleX: 0, opacity: 0 }}
              animate={{ scaleX: 1, opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex-shrink-0 h-[2px] origin-left"
              style={{ background: "linear-gradient(90deg,#8338ec,#ff006e)" }}
            >
              <motion.div
                className="h-full"
                style={{ background: "inherit", width: `${uploadPct}%`, transition: "width 0.3s ease" }}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Content area ────────────────────────────────────────────── */}
        <div className="flex-1 relative overflow-hidden">

          {/* ── PHOTO mode ────────────────────────────────────────────── */}
          {tab === "image" && (
            preview ? (
              <div className="h-full relative">
                <img
                  src={preview}
                  alt=""
                  className="h-full w-full object-contain"
                  draggable={false}
                  style={{ userSelect: "none" }}
                />
                {/* Remove button */}
                <button
                  type="button"
                  onClick={clearFile}
                  className="absolute top-3 right-3 grid h-9 w-9 place-items-center rounded-full"
                  style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(8px)", border: "1px solid rgba(255,255,255,0.15)" }}
                >
                  <X className="h-4 w-4 text-white" />
                </button>
              </div>
            ) : (
              <div
                className="h-full flex flex-col items-center justify-center gap-6 cursor-pointer"
                onClick={() => imgRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
              >
                {/* Upload area */}
                <motion.div
                  whileTap={{ scale: 0.96 }}
                  className="flex flex-col items-center gap-5"
                >
                  <div
                    className="grid place-items-center rounded-3xl"
                    style={{
                      width: 120, height: 120,
                      background: "rgba(131,56,236,0.12)",
                      border: "2px dashed rgba(131,56,236,0.45)",
                    }}
                  >
                    <Camera className="h-12 w-12" style={{ color: "rgba(131,56,236,0.7)" }} />
                  </div>
                  <div className="text-center">
                    <p className="text-[17px] font-bold text-white mb-1">Add a photo</p>
                    <p className="text-[13px]" style={{ color: "rgba(255,255,255,0.35)" }}>
                      JPG · PNG · WEBP
                    </p>
                  </div>
                  <div
                    className="flex items-center gap-2 rounded-full px-5 py-2.5 text-[13px] font-semibold text-white"
                    style={{ background: "rgba(131,56,236,0.25)", border: "1px solid rgba(131,56,236,0.4)" }}
                  >
                    <Upload className="h-3.5 w-3.5" />
                    Choose from gallery
                  </div>
                </motion.div>
              </div>
            )
          )}

          {/* ── VIDEO mode ────────────────────────────────────────────── */}
          {tab === "video" && (
            preview ? (
              <div className="h-full relative" onClick={toggleVideoPlay}>
                {/* Custom video player — NO browser controls */}
                <video
                  ref={vidElRef}
                  src={preview}
                  className="h-full w-full object-contain"
                  playsInline
                  loop
                  disablePictureInPicture
                  controlsList="nodownload noplaybackrate nofullscreen"
                  onContextMenu={(e) => e.preventDefault()}
                  onPlay={() => setVidPlaying(true)}
                  onPause={() => setVidPlaying(false)}
                />
                {/* Custom play/pause overlay */}
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <AnimatePresence>
                    {!vidPlaying && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.7 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.7 }}
                        className="grid h-16 w-16 place-items-center rounded-full"
                        style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(6px)" }}
                      >
                        <Play className="h-7 w-7 fill-white text-white ml-0.5" />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
                {/* Remove button */}
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); clearFile(); }}
                  className="absolute top-3 right-3 grid h-9 w-9 place-items-center rounded-full"
                  style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(8px)", border: "1px solid rgba(255,255,255,0.15)" }}
                >
                  <X className="h-4 w-4 text-white" />
                </button>
              </div>
            ) : (
              <div
                className="h-full flex flex-col items-center justify-center gap-6 cursor-pointer"
                onClick={() => vidRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
              >
                <motion.div whileTap={{ scale: 0.96 }} className="flex flex-col items-center gap-5">
                  <div
                    className="grid place-items-center rounded-3xl"
                    style={{
                      width: 120, height: 120,
                      background: "rgba(131,56,236,0.12)",
                      border: "2px dashed rgba(131,56,236,0.45)",
                    }}
                  >
                    <Film className="h-12 w-12" style={{ color: "rgba(131,56,236,0.7)" }} />
                  </div>
                  <div className="text-center">
                    <p className="text-[17px] font-bold text-white mb-1">Add a video</p>
                    <p className="text-[13px]" style={{ color: "rgba(255,255,255,0.35)" }}>
                      MP4 · MOV · WEBM
                    </p>
                  </div>
                  <div
                    className="flex items-center gap-2 rounded-full px-5 py-2.5 text-[13px] font-semibold text-white"
                    style={{ background: "rgba(131,56,236,0.25)", border: "1px solid rgba(131,56,236,0.4)" }}
                  >
                    <Upload className="h-3.5 w-3.5" />
                    Choose from gallery
                  </div>
                </motion.div>
              </div>
            )
          )}

          {/* ── TEXT mode — write on the gradient canvas ─────────────── */}
          {tab === "text" && (
            <div
              className="h-full relative"
              onClick={() => textRef.current?.focus()}
            >
              {/* Visual text layer */}
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-10 select-none">
                {textVal ? (
                  <p
                    className="text-center font-bold leading-snug break-words whitespace-pre-wrap w-full"
                    style={{
                      color:      textColor,
                      fontSize:   autoFontSize(textVal.length),
                      textShadow: "0 2px 32px rgba(0,0,0,0.40)",
                      transition: "font-size 0.12s ease",
                      letterSpacing: "-0.01em",
                    }}
                  >
                    {textVal}
                  </p>
                ) : (
                  <p
                    className="text-center font-semibold"
                    style={{ color: "rgba(255,255,255,0.30)", fontSize: 20 }}
                  >
                    Tap to type your story…
                  </p>
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
                  padding: "80px 40px",
                  fontSize: 24,
                  lineHeight: 1.4,
                }}
                aria-label="Story text"
                spellCheck
              />

              {/* Character counter */}
              {textVal.length > 220 && (
                <div
                  className="pointer-events-none absolute bottom-4 right-4 text-[12px] font-mono font-bold"
                  style={{ color: textVal.length > 270 ? "#ff006e" : "rgba(255,255,255,0.40)" }}
                >
                  {300 - textVal.length}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Bottom strip ─────────────────────────────────────────────── */}
        <div
          className="flex-shrink-0 px-4 space-y-3"
          style={{
            paddingTop: 12,
            paddingBottom: `max(20px, env(safe-area-inset-bottom, 20px))`,
            background: tab === "text"
              ? "linear-gradient(to top, rgba(0,0,0,0.65) 0%, transparent 100%)"
              : "rgba(0,0,0,0.4)",
            backdropFilter: tab !== "text" ? "blur(12px)" : undefined,
          }}
        >
          {/* Text background + color pickers */}
          {tab === "text" && (
            <div className="space-y-2.5">
              {/* Background swatches */}
              <div className="flex items-center gap-2 overflow-x-auto hide-scrollbar py-0.5">
                {TEXT_BG_PRESETS.map((preset, i) => (
                  <motion.button
                    type="button"
                    key={i}
                    whileTap={{ scale: 0.85 }}
                    onClick={(e) => { e.stopPropagation(); setBgIdx(i); }}
                    className="h-8 w-8 rounded-full flex-shrink-0 grid place-items-center relative"
                    style={{
                      background:    preset.bg,
                      outline:       bgIdx === i ? "2.5px solid #fff" : "2px solid transparent",
                      outlineOffset: 2,
                    }}
                  >
                    {bgIdx === i && <Check className="h-3 w-3 text-white drop-shadow" />}
                  </motion.button>
                ))}
              </div>

              {/* Font color swatches */}
              <div className="flex items-center gap-2 overflow-x-auto hide-scrollbar py-0.5">
                <span className="text-[10px] font-bold text-white/35 flex-shrink-0 uppercase tracking-wider pr-1">
                  Aa
                </span>
                {TEXT_COLORS.map((c) => (
                  <motion.button
                    type="button"
                    key={c}
                    whileTap={{ scale: 0.85 }}
                    onClick={(e) => { e.stopPropagation(); setTextColor(c); }}
                    className="h-7 w-7 rounded-full flex-shrink-0 grid place-items-center"
                    style={{
                      background:  c,
                      outline:       textColor === c ? "2.5px solid #fff" : "2px solid transparent",
                      outlineOffset: 2,
                    }}
                  >
                    {textColor === c && <Check className="h-2.5 w-2.5 drop-shadow" style={{ color: c === "#ffffff" ? "#000" : "#fff" }} />}
                  </motion.button>
                ))}
              </div>
            </div>
          )}

          {/* Music card */}
          <motion.button
            type="button"
            whileTap={{ scale: 0.98 }}
            onClick={(e) => { e.stopPropagation(); setMusicOpen((v) => !v); }}
            className="flex items-center gap-3 w-full rounded-2xl px-4 py-3 text-left"
            style={{
              background: "rgba(255,255,255,0.08)",
              border:     "1px solid rgba(255,255,255,0.10)",
            }}
          >
            <Music2
              className="h-4 w-4 flex-shrink-0"
              style={{ color: musicName ? "#a855f7" : "rgba(255,255,255,0.40)" }}
            />
            <span
              className="flex-1 text-[13px] truncate"
              style={{ color: musicName ? "#fff" : "rgba(255,255,255,0.38)" }}
            >
              {musicName || "Add a music label"}
            </span>
            {musicOpen
              ? <ChevronUp   className="h-4 w-4 text-white/30" />
              : <ChevronDown className="h-4 w-4 text-white/30" />
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
                    background: "rgba(255,255,255,0.07)",
                    border:     "1px solid rgba(255,255,255,0.10)",
                    caretColor: "#a855f7",
                  }}
                />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Privacy row */}
          <div className="flex gap-2">
            {VISIBILITY_OPTS.map(({ value, label, Icon }) => {
              const active = visibility === value;
              return (
                <motion.button
                  type="button"
                  key={value}
                  whileTap={{ scale: 0.90 }}
                  onClick={(e) => { e.stopPropagation(); setVisibility(value); }}
                  className="flex-1 flex flex-col items-center gap-1 rounded-2xl py-2.5 px-1 transition-all"
                  style={active ? {
                    background: "rgba(131,56,236,0.25)",
                    border:     "1.5px solid rgba(131,56,236,0.6)",
                  } : {
                    background: "rgba(255,255,255,0.06)",
                    border:     "1.5px solid rgba(255,255,255,0.08)",
                  }}
                >
                  <Icon
                    className="h-[18px] w-[18px]"
                    style={{ color: active ? "#c084fc" : "rgba(255,255,255,0.45)" }}
                  />
                  <span
                    className="text-[10.5px] font-semibold"
                    style={{ color: active ? "#c084fc" : "rgba(255,255,255,0.40)" }}
                  >
                    {label}
                  </span>
                </motion.button>
              );
            })}
          </div>

          {/* Error message */}
          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="flex items-center gap-2.5 rounded-2xl px-4 py-3 text-[13px] text-rose-300"
                style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.22)" }}
              >
                <span className="text-rose-400 flex-shrink-0">⚠</span>
                {error}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}
