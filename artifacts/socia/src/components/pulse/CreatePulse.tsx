/**
 * CreatePulse.tsx — Premium story creator (v2).
 *
 * Upgrades from v1:
 *  • Real camera preview via getUserMedia (photo + video)
 *  • Front / back camera toggle
 *  • Flash / torch toggle
 *  • Video recording via MediaRecorder (tap to start, tap to stop)
 *  • Gallery fallback for both photo and video
 *  • Camera permission denied state with friendly prompt
 *  • Cleaner text story editor (more BG presets, solid colours)
 *  • Recording timer indicator
 *  • No empty black areas when camera is active
 */
import { useState, useRef, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, Check, Globe, Users, UserCheck, Lock,
  Music2, ChevronDown, Sparkles, Camera,
  CameraOff, FlipHorizontal, ImageIcon, Video,
  Zap, ZapOff,
} from "lucide-react";
import { createPulse, uploadPulseMedia } from "@/lib/pulseClient";
import { useAppStore } from "@/lib/store";

/* ── Types ─────────────────────────────────────────────────────────────── */
type PulseMode   = "photo" | "video" | "text";
type Visibility  = "public" | "followers" | "friends" | "private";
type CamPerm     = "pending" | "granted" | "denied";

interface Props {
  onClose:   () => void;
  onCreated: () => void;
}

/* ── Design tokens ──────────────────────────────────────────────────────── */
const BG_PRESETS = [
  /* Gradients */
  { bg: "linear-gradient(160deg,#1a0533 0%,#4a0080 100%)", solid: false },
  { bg: "linear-gradient(135deg,#8338ec 0%,#ff006e 100%)", solid: false },
  { bg: "linear-gradient(135deg,#3a86ff 0%,#06d6a0 100%)", solid: false },
  { bg: "linear-gradient(135deg,#fb5607 0%,#ff006e 100%)", solid: false },
  { bg: "linear-gradient(160deg,#0d1b2a 0%,#1b4332 100%)", solid: false },
  { bg: "linear-gradient(135deg,#240046 0%,#7b2d8b 100%)", solid: false },
  { bg: "linear-gradient(135deg,#ff0080 0%,#ffb700 100%)", solid: false },
  { bg: "linear-gradient(135deg,#00b4d8 0%,#023e8a 100%)", solid: false },
  { bg: "linear-gradient(135deg,#e63946 0%,#6d6875 100%)", solid: false },
  { bg: "linear-gradient(160deg,#1a1a2e 0%,#e94560 100%)", solid: false },
  { bg: "linear-gradient(135deg,#2d6a4f 0%,#95d5b2 100%)", solid: false },
  { bg: "linear-gradient(135deg,#6a0572 0%,#f72585 100%)", solid: false },
  /* Solid colours */
  { bg: "#000000", solid: true },
  { bg: "#1a1a2e", solid: true },
  { bg: "#0f172a", solid: true },
  { bg: "#7c3aed", solid: true },
  { bg: "#db2777", solid: true },
  { bg: "#0284c7", solid: true },
  { bg: "#16a34a", solid: true },
  { bg: "#d97706", solid: true },
];

const TEXT_COLORS = [
  "#ffffff","#000000","#ffbe0b","#06d6a0",
  "#ff006e","#3a86ff","#ff9f43","#c77dff",
  "#00f5d4","#ef233c","#8338ec","#f72585",
];

const VISIBILITY_OPTS: { value: Visibility; label: string; Icon: React.ElementType }[] = [
  { value: "public",    label: "Everyone",  Icon: Globe     },
  { value: "followers", label: "Followers", Icon: Users     },
  { value: "friends",   label: "Friends",   Icon: UserCheck },
  { value: "private",   label: "Only Me",   Icon: Lock      },
];

const MODES: { id: PulseMode; label: string }[] = [
  { id: "photo", label: "Photo" },
  { id: "video", label: "Video" },
  { id: "text",  label: "Text"  },
];

function textFontSize(len: number) {
  if (len < 20)  return 40;
  if (len < 50)  return 30;
  if (len < 100) return 24;
  if (len < 180) return 18;
  return 15;
}

/* ── Best recorder mime type ────────────────────────────────────────────── */
function bestMime(): string {
  const types = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
    "video/mp4",
  ];
  return types.find((t) => {
    try { return MediaRecorder.isTypeSupported(t); } catch { return false; }
  }) ?? "";
}

/* ── Glass pill ─────────────────────────────────────────────────────────── */
function GlassBtn({
  onClick, children, style = {}, disabled = false,
}: {
  onClick: (e: React.MouseEvent) => void;
  children: React.ReactNode;
  style?: React.CSSProperties;
  disabled?: boolean;
}) {
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.88 }}
      onClick={onClick}
      disabled={disabled}
      className="grid place-items-center rounded-full disabled:opacity-40"
      style={{
        background:          "rgba(0,0,0,0.40)",
        backdropFilter:      "blur(14px) saturate(1.4)",
        WebkitBackdropFilter:"blur(14px) saturate(1.4)",
        border:              "1px solid rgba(255,255,255,0.14)",
        width: 44, height: 44,
        ...style,
      }}
    >
      {children}
    </motion.button>
  );
}

/* ── Main component ─────────────────────────────────────────────────────── */
export function CreatePulse({ onClose, onCreated }: Props) {
  const me = useAppStore((s) => s.user);

  /* ── UI state ──────────────────────────────────────────────────────── */
  const [mode,        setMode]        = useState<PulseMode>("photo");
  const [file,        setFile]        = useState<File | null>(null);
  const [preview,     setPreview]     = useState<string | null>(null);
  const [textVal,     setTextVal]     = useState("");
  const [bgIdx,       setBgIdx]       = useState(0);
  const [textColor,   setTextColor]   = useState("#ffffff");
  const [visibility,  setVisibility]  = useState<Visibility>("public");
  const [musicName,   setMusicName]   = useState("");
  const [uploading,   setUploading]   = useState(false);
  const [uploadPct,   setUploadPct]   = useState(0);
  const [error,       setError]       = useState<string | null>(null);
  const [sheet,       setSheet]       = useState(false);
  const [musicOpen,   setMusicOpen]   = useState(false);
  const [visOpen,     setVisOpen]     = useState(false);
  const [playing,     setPlaying]     = useState(false);

  /* ── Camera state ──────────────────────────────────────────────────── */
  const [camPerm,     setCamPerm]     = useState<CamPerm>("pending");
  const [camReady,    setCamReady]    = useState(false);
  const [facingMode,  setFacingMode]  = useState<"user" | "environment">("environment");
  const [flashOn,     setFlashOn]     = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recSecs,     setRecSecs]     = useState(0);

  /* ── Refs ──────────────────────────────────────────────────────────── */
  const imgRef         = useRef<HTMLInputElement>(null);
  const vidRef         = useRef<HTMLInputElement>(null);
  const textRef        = useRef<HTMLTextAreaElement>(null);
  const vidElRef       = useRef<HTMLVideoElement>(null);   // preview playback
  const camVideoRef    = useRef<HTMLVideoElement>(null);   // live camera
  const streamRef      = useRef<MediaStream | null>(null);
  const recorderRef    = useRef<MediaRecorder | null>(null);
  const chunksRef      = useRef<Blob[]>([]);
  const recTimerRef    = useRef<ReturnType<typeof setInterval> | null>(null);

  /* Focus textarea when entering text mode */
  useEffect(() => {
    if (mode === "text") setTimeout(() => textRef.current?.focus(), 200);
  }, [mode]);

  /* ── Camera lifecycle ──────────────────────────────────────────────── */
  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCamReady(false);
  }, []);

  const startCamera = useCallback(async () => {
    stopCamera();
    if (!navigator.mediaDevices?.getUserMedia) { setCamPerm("denied"); return; }
    try {
      const constraints: MediaStreamConstraints = {
        video: { facingMode, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: mode === "video",
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      if (camVideoRef.current) {
        camVideoRef.current.srcObject = stream;
        await camVideoRef.current.play().catch(() => {});
      }
      setCamReady(true);
      setCamPerm("granted");
    } catch (err: any) {
      if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
        setCamPerm("denied");
      }
      setCamReady(false);
    }
  }, [facingMode, mode, stopCamera]);

  /* Start/stop camera when mode or preview changes */
  useEffect(() => {
    if ((mode === "photo" || mode === "video") && !preview) {
      startCamera();
    } else {
      stopCamera();
    }
    return () => { stopCamera(); };
  }, [mode, preview]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Restart camera when facingMode changes */
  useEffect(() => {
    if ((mode === "photo" || mode === "video") && !preview) {
      startCamera();
    }
  }, [facingMode]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Cleanup on unmount */
  useEffect(() => {
    return () => {
      stopCamera();
      if (recTimerRef.current) clearInterval(recTimerRef.current);
    };
  }, [stopCamera]);

  /* ── Mode switch ────────────────────────────────────────────────────── */
  const switchMode = useCallback((m: PulseMode) => {
    /* Stop any ongoing recording */
    if (isRecording) {
      recorderRef.current?.stop();
      recorderRef.current = null;
      setIsRecording(false);
      if (recTimerRef.current) { clearInterval(recTimerRef.current); recTimerRef.current = null; }
      setRecSecs(0);
    }
    setMode(m);
    setFile(null);
    if (preview?.startsWith("blob:")) URL.revokeObjectURL(preview);
    setPreview(null);
    setError(null);
    setSheet(false);
    setPlaying(false);
  }, [preview, isRecording]);

  const pickFile = useCallback((f: File) => {
    stopCamera();
    if (preview?.startsWith("blob:")) URL.revokeObjectURL(preview);
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setError(null);
    setSheet(false);
    setPlaying(false);
  }, [preview, stopCamera]);

  const clearMedia = useCallback(() => {
    if (preview?.startsWith("blob:")) URL.revokeObjectURL(preview);
    setFile(null); setPreview(null); setPlaying(false);
  }, [preview]);

  /* ── File inputs ────────────────────────────────────────────────────── */
  const handleImgChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (f) { pickFile(f); setMode("photo"); } e.target.value = "";
  }, [pickFile]);

  const handleVidChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (f) { pickFile(f); setMode("video"); } e.target.value = "";
  }, [pickFile]);

  /* ── Photo capture ──────────────────────────────────────────────────── */
  const capturePhoto = useCallback(() => {
    const video = camVideoRef.current;
    if (!video || !camReady) return;
    const canvas = document.createElement("canvas");
    canvas.width  = video.videoWidth  || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    if (facingMode === "user") {
      ctx.translate(canvas.width, 0); ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const f = new File([blob], "story-photo.jpg", { type: "image/jpeg" });
      pickFile(f);
    }, "image/jpeg", 0.9);
  }, [camReady, facingMode, pickFile]);

  /* ── Video recording ────────────────────────────────────────────────── */
  const startRecording = useCallback(() => {
    const stream = streamRef.current;
    if (!stream) return;
    chunksRef.current = [];
    const mime = bestMime();
    try {
      const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mime || "video/webm" });
        const f    = new File([blob], "story-video.webm", { type: mime || "video/webm" });
        pickFile(f);
      };
      recorder.start(100);
      recorderRef.current = recorder;
      setIsRecording(true);
      setRecSecs(0);
      recTimerRef.current = setInterval(() => setRecSecs((s) => s + 1), 1000);
    } catch (err: any) {
      setError("Recording failed: " + (err?.message ?? "Unknown error"));
    }
  }, [pickFile]);

  const stopRecording = useCallback(() => {
    recorderRef.current?.stop();
    recorderRef.current = null;
    setIsRecording(false);
    if (recTimerRef.current) { clearInterval(recTimerRef.current); recTimerRef.current = null; }
    setRecSecs(0);
  }, []);

  const handleShutter = useCallback(() => {
    if (mode === "photo") {
      if (camReady) capturePhoto();
      else setSheet(true);
    } else if (mode === "video") {
      if (!camReady) { setSheet(true); return; }
      if (isRecording) stopRecording();
      else startRecording();
    }
  }, [mode, camReady, capturePhoto, isRecording, startRecording, stopRecording]);

  /* ── Preview playback (video) ───────────────────────────────────────── */
  const togglePlay = useCallback(() => {
    const v = vidElRef.current;
    if (!v) return;
    if (playing) { v.pause(); setPlaying(false); }
    else { v.play().then(() => setPlaying(true)).catch(() => {}); }
  }, [playing]);

  /* ── Post ────────────────────────────────────────────────────────────── */
  const simulateProgress = useCallback(() => {
    setUploadPct(0);
    const t = setInterval(() => {
      setUploadPct((p) => { if (p >= 85) { clearInterval(t); return 85; } return p + Math.random() * 14; });
    }, 180);
    return () => clearInterval(t);
  }, []);

  const handlePost = useCallback(async () => {
    if (!me) return;
    setError(null); setUploading(true);
    let stopProgress = () => {};
    try {
      if (mode === "text") {
        if (!textVal.trim()) { setError("Write something first."); setUploading(false); return; }
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
        if (!file) { setError("Pick a photo or video first."); setUploading(false); return; }
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
      stopProgress(); setUploadPct(0);
      setError(err?.message ?? "Something went wrong. Try again.");
    } finally {
      setUploading(false);
    }
  }, [me, mode, textVal, bgIdx, textColor, visibility, musicName, file, onCreated, simulateProgress]);

  const canPost = !uploading && (mode === "text" ? textVal.trim().length > 0 : Boolean(file));
  const textBg  = BG_PRESETS[bgIdx].bg;
  const activeVis = VISIBILITY_OPTS.find((o) => o.value === visibility)!;
  const VisIcon = activeVis.Icon;
  const canvasMode = mode === "text" ? textBg : "#0a0a0a";
  const isCameraMode = (mode === "photo" || mode === "video") && !preview;
  const recLabel = `${Math.floor(recSecs / 60).toString().padStart(2, "0")}:${(recSecs % 60).toString().padStart(2, "0")}`;

  return createPortal(
    <AnimatePresence>
      <motion.div
        key="pulse-creator"
        className="fixed inset-0 z-[9999] flex flex-col overflow-hidden"
        style={{ background: canvasMode }}
        initial={{ y: "100%", opacity: 0.7 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: "100%", opacity: 0 }}
        transition={{ type: "spring", stiffness: 340, damping: 34 }}
      >
        {/* Hidden file inputs */}
        <input ref={imgRef} type="file" accept="image/*"  className="hidden" onChange={handleImgChange} />
        <input ref={vidRef} type="file" accept="video/*"  className="hidden" onChange={handleVidChange} />

        {/* ── Upload progress bar ─────────────────────────────────────── */}
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

        {/* ══════════════════════════════════════════════════════════════
            LIVE CAMERA PREVIEW
        ══════════════════════════════════════════════════════════════ */}
        {isCameraMode && (
          <div className="absolute inset-0">
            {/* Camera video element */}
            <video
              ref={camVideoRef}
              className="absolute inset-0 w-full h-full object-cover"
              playsInline
              muted
              style={{
                transform: facingMode === "user" ? "scaleX(-1)" : "none",
              }}
            />

            {/* Camera denied state */}
            {camPerm === "denied" && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-8"
                style={{ background: "#0a0a0a" }}>
                <CameraOff className="h-12 w-12 text-white/30" />
                <p className="text-center text-[15px] font-bold text-white">Camera access denied</p>
                <p className="text-center text-[13px] text-white/50 leading-relaxed">
                  Allow camera access in your browser settings, then reload the page.
                </p>
                <button
                  type="button"
                  onClick={() => setSheet(true)}
                  className="mt-2 rounded-full px-6 py-3 text-[13px] font-bold text-white"
                  style={{ background: "linear-gradient(135deg,#8338ec,#ff006e)" }}
                >
                  Pick from Gallery
                </button>
              </div>
            )}

            {/* Loading indicator */}
            {camPerm === "pending" && !camReady && (
              <div className="absolute inset-0 flex items-center justify-center"
                style={{ background: "#0a0a0a" }}>
                <div className="h-10 w-10 rounded-full border-2 border-purple-500 border-t-transparent animate-spin" />
              </div>
            )}

            {/* Gradient scrim */}
            {camReady && (
              <div className="absolute inset-0 pointer-events-none"
                style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0.35) 0%, transparent 20%, transparent 75%, rgba(0,0,0,0.5) 100%)" }} />
            )}

            {/* Recording indicator */}
            <AnimatePresence>
              {isRecording && (
                <motion.div
                  className="absolute top-24 left-1/2 -translate-x-1/2 flex items-center gap-2 rounded-full px-4 py-2"
                  style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(8px)" }}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <motion.div
                    className="h-2.5 w-2.5 rounded-full bg-red-500"
                    animate={{ opacity: [1, 0.3, 1] }}
                    transition={{ duration: 1.2, repeat: Infinity }}
                  />
                  <span className="text-[13px] font-bold text-white tabular-nums">{recLabel}</span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════
            CONTENT AREA (text / media preview)
        ══════════════════════════════════════════════════════════════ */}
        <div className="absolute inset-0 flex items-center justify-center">

          {/* ── Text mode ────────────────────────────────────────────── */}
          {mode === "text" && (
            <div className="absolute inset-0" onClick={() => textRef.current?.focus()}>
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-10">
                {textVal ? (
                  <p
                    className="text-center font-bold leading-snug break-words whitespace-pre-wrap w-full"
                    style={{
                      color:         textColor,
                      fontSize:      textFontSize(textVal.length),
                      textShadow:    "0 2px 40px rgba(0,0,0,0.45)",
                      letterSpacing: "-0.01em",
                      transition:    "font-size 0.12s ease",
                    }}
                  >
                    {textVal}
                  </p>
                ) : (
                  <div className="flex flex-col items-center gap-3 select-none">
                    <Sparkles className="h-8 w-8 opacity-25 text-white" />
                    <p className="text-center font-semibold text-white/25" style={{ fontSize: 19 }}>
                      Tap to write your story
                    </p>
                  </div>
                )}
              </div>
              <textarea
                ref={textRef}
                value={textVal}
                onChange={(e) => setTextVal(e.target.value)}
                maxLength={300}
                className="absolute inset-0 w-full h-full resize-none outline-none bg-transparent text-transparent"
                style={{ caretColor: textColor, padding: "100px 40px", fontSize: 28, lineHeight: 1.4 }}
                aria-label="Story text"
                spellCheck
              />
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

          {/* ── Photo preview ─────────────────────────────────────────── */}
          {mode === "photo" && preview && (
            <motion.div className="absolute inset-0" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <img src={preview} alt="" className="h-full w-full object-cover" draggable={false} />
              <div className="absolute inset-0 pointer-events-none"
                style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0.25) 0%, transparent 25%, transparent 70%, rgba(0,0,0,0.5) 100%)" }} />
            </motion.div>
          )}

          {/* ── Video preview ─────────────────────────────────────────── */}
          {mode === "video" && preview && (
            <motion.div className="absolute inset-0" initial={{ opacity: 0 }} animate={{ opacity: 1 }} onClick={togglePlay}>
              <video
                ref={vidElRef}
                src={preview}
                className="h-full w-full object-cover"
                playsInline loop disablePictureInPicture
                controlsList="nodownload noplaybackrate nofullscreen"
                onContextMenu={(e) => e.preventDefault()}
                onPlay={() => setPlaying(true)}
                onPause={() => setPlaying(false)}
              />
              <div className="absolute inset-0 pointer-events-none"
                style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0.25) 0%, transparent 25%, transparent 70%, rgba(0,0,0,0.5) 100%)" }} />
            </motion.div>
          )}
        </div>

        {/* ── Floating top bar ─────────────────────────────────────────── */}
        <div
          className="absolute top-0 left-0 right-0 z-30 flex items-center justify-between px-4"
          style={{ paddingTop: `max(env(safe-area-inset-top, 0px), 14px)`, paddingBottom: 12 }}
        >
          <GlassBtn onClick={onClose}>
            <X className="h-5 w-5 text-white" />
          </GlassBtn>

          {/* Camera controls (only in camera mode without preview) */}
          {isCameraMode && camPerm === "granted" && (
            <div className="flex gap-2">
              {/* Flash */}
              <GlassBtn onClick={() => setFlashOn((v) => !v)}>
                {flashOn
                  ? <Zap className="h-4.5 w-4.5 text-yellow-400" />
                  : <ZapOff className="h-[18px] w-[18px] text-white/60" />
                }
              </GlassBtn>
              {/* Flip */}
              <GlassBtn onClick={() => setFacingMode((m) => m === "user" ? "environment" : "user")}>
                <FlipHorizontal className="h-[18px] w-[18px] text-white" />
              </GlassBtn>
            </div>
          )}

          {/* Visibility + Share — always visible */}
          <div className="flex items-center gap-2">
            <motion.button
              type="button"
              whileTap={{ scale: 0.93 }}
              onClick={(e) => { e.stopPropagation(); setVisOpen((v) => !v); }}
              className="flex items-center gap-1.5 rounded-full px-3 py-1.5"
              style={{
                background:         "rgba(0,0,0,0.35)",
                backdropFilter:     "blur(14px)",
                WebkitBackdropFilter:"blur(14px)",
                border:             "1px solid rgba(255,255,255,0.14)",
              }}
            >
              <VisIcon className="h-3.5 w-3.5 text-white/70" />
              <span className="text-[12px] font-semibold text-white/80">{activeVis.label}</span>
              <ChevronDown className="h-3 w-3 text-white/40" />
            </motion.button>

            <motion.button
              type="button"
              whileTap={{ scale: 0.88 }}
              onClick={handlePost}
              disabled={!canPost}
              className="rounded-full px-5 py-2 text-[13.5px] font-bold text-white transition-opacity disabled:opacity-30"
              style={{ background: "linear-gradient(135deg,#8338ec,#ff006e)" }}
            >
              {uploading ? `${Math.round(uploadPct)}%` : "Share"}
            </motion.button>
          </div>
        </div>

        {/* ── Visibility dropdown ──────────────────────────────────────── */}
        <AnimatePresence>
          {visOpen && (
            <>
              <motion.div className="fixed inset-0 z-[35]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setVisOpen(false)} />
              <motion.div
                className="absolute left-1/2 top-20 z-40 rounded-2xl overflow-hidden shadow-2xl"
                style={{ transform: "translateX(-50%)", background: "rgba(15,10,25,0.88)", backdropFilter: "blur(20px)", border: "1px solid rgba(255,255,255,0.12)", minWidth: 200 }}
                initial={{ opacity: 0, scale: 0.9, y: -8 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9, y: -8 }}
                transition={{ type: "spring", stiffness: 400, damping: 28 }}
              >
                {VISIBILITY_OPTS.map(({ value, label, Icon: Ic }) => (
                  <motion.button type="button" key={value} whileTap={{ scale: 0.97 }}
                    onClick={(e) => { e.stopPropagation(); setVisibility(value); setVisOpen(false); }}
                    className="flex items-center gap-3 w-full px-4 py-3 text-left transition-colors"
                    style={{ background: visibility === value ? "rgba(131,56,236,0.20)" : "transparent" }}
                  >
                    <Ic className="h-4 w-4 flex-shrink-0" style={{ color: visibility === value ? "#c084fc" : "rgba(255,255,255,0.5)" }} />
                    <span className="text-[13.5px] font-medium" style={{ color: visibility === value ? "#e2c6ff" : "rgba(255,255,255,0.75)" }}>{label}</span>
                    {visibility === value && <Check className="h-3.5 w-3.5 text-purple-400 ml-auto" />}
                  </motion.button>
                ))}
              </motion.div>
            </>
          )}
        </AnimatePresence>

        {/* ── Remove media ─────────────────────────────────────────────── */}
        <AnimatePresence>
          {preview && (
            <motion.div
              className="absolute top-20 right-4 z-30"
              initial={{ opacity: 0, scale: 0.7 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.7 }}
            >
              <GlassBtn onClick={clearMedia}>
                <X className="h-[18px] w-[18px] text-white" />
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
              initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
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
          {/* ── Text mode: bg + text-color pickers ───────────────────── */}
          <AnimatePresence>
            {mode === "text" && (
              <motion.div
                className="px-4 space-y-3 pb-3"
                initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 16 }}
              >
                {/* Background swatches */}
                <div className="flex items-center gap-2 overflow-x-auto hide-scrollbar py-1">
                  {BG_PRESETS.map((p, i) => (
                    <motion.button type="button" key={i} whileTap={{ scale: 0.82 }}
                      onClick={() => setBgIdx(i)}
                      className="h-9 w-9 rounded-full flex-shrink-0 grid place-items-center relative shadow-lg"
                      style={{ background: p.bg, outline: bgIdx === i ? "2.5px solid #fff" : "2.5px solid transparent", outlineOffset: 2 }}
                    >
                      {bgIdx === i && <Check className="h-3 w-3 text-white drop-shadow-lg" />}
                    </motion.button>
                  ))}
                </div>

                {/* Font color swatches */}
                <div className="flex items-center gap-2 overflow-x-auto hide-scrollbar py-1">
                  <span className="text-[11px] font-black text-white/30 flex-shrink-0 pr-1 select-none tracking-wide">Aa</span>
                  {TEXT_COLORS.map((c) => (
                    <motion.button type="button" key={c} whileTap={{ scale: 0.82 }}
                      onClick={() => setTextColor(c)}
                      className="h-8 w-8 rounded-full flex-shrink-0 grid place-items-center shadow-lg"
                      style={{ background: c, outline: textColor === c ? "2.5px solid #fff" : "2.5px solid transparent", outlineOffset: 2 }}
                    >
                      {textColor === c && <Check className="h-2.5 w-2.5 drop-shadow" style={{ color: c === "#ffffff" ? "#000" : "#fff" }} />}
                    </motion.button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Music row ─────────────────────────────────────────────── */}
          <div className="px-4 pb-3">
            <AnimatePresence initial={false}>
              {musicOpen && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden pb-2"
                >
                  <input
                    type="text" value={musicName} onChange={(e) => setMusicName(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    placeholder="Song name or artist…"
                    className="w-full rounded-2xl px-4 py-3 text-[13px] text-white outline-none"
                    style={{ background: "rgba(255,255,255,0.09)", border: "1px solid rgba(255,255,255,0.12)", backdropFilter: "blur(12px)", caretColor: "#a855f7" }}
                  />
                </motion.div>
              )}
            </AnimatePresence>
            <motion.button type="button" whileTap={{ scale: 0.97 }}
              onClick={(e) => { e.stopPropagation(); setMusicOpen((v) => !v); }}
              className="flex items-center gap-3 w-full rounded-2xl px-4 py-2.5 text-left"
              style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.10)", backdropFilter: "blur(12px)" }}
            >
              <Music2 className="h-4 w-4 flex-shrink-0" style={{ color: musicName ? "#a855f7" : "rgba(255,255,255,0.38)" }} />
              <span className="flex-1 text-[12.5px] font-medium truncate" style={{ color: musicName ? "#c084fc" : "rgba(255,255,255,0.35)" }}>
                {musicName || "Add music label"}
              </span>
              <motion.div animate={{ rotate: musicOpen ? 180 : 0 }} transition={{ duration: 0.18 }}>
                <ChevronDown className="h-3.5 w-3.5 text-white/25" />
              </motion.div>
            </motion.button>
          </div>

          {/* ── Shutter + controls + mode strip ──────────────────────── */}
          <div className="flex flex-col items-center gap-4 px-4 pb-2">

            {(mode === "photo" || mode === "video") && !preview && (
              <div className="flex items-center justify-center w-full gap-8">

                {/* Gallery button (left) */}
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.9 }}
                  onClick={() => mode === "photo" ? imgRef.current?.click() : vidRef.current?.click()}
                  className="flex flex-col items-center gap-1"
                >
                  <div
                    className="h-10 w-10 rounded-[14px] grid place-items-center"
                    style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.15)" }}
                  >
                    {mode === "photo"
                      ? <ImageIcon className="h-5 w-5 text-white" />
                      : <Video      className="h-5 w-5 text-white" />
                    }
                  </div>
                  <span className="text-[9px] font-semibold text-white/40 uppercase tracking-wide">Gallery</span>
                </motion.button>

                {/* Shutter button (center) */}
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.92 }}
                  onClick={handleShutter}
                  className="relative flex items-center justify-center rounded-full flex-shrink-0"
                  style={{ width: 76, height: 76 }}
                  initial={{ opacity: 0, scale: 0.7 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ type: "spring", stiffness: 400, damping: 26 }}
                >
                  {/* Outer ring */}
                  <div
                    className="absolute inset-0 rounded-full"
                    style={{
                      border: isRecording
                        ? "3px solid rgba(239,68,68,0.9)"
                        : "2.5px solid rgba(255,255,255,0.55)",
                    }}
                  />
                  {/* Inner fill */}
                  <motion.div
                    className="rounded-full"
                    animate={{ scale: isRecording ? 0.65 : 1 }}
                    style={{
                      width: 58, height: 58,
                      background: isRecording
                        ? "rgb(239,68,68)"
                        : "linear-gradient(135deg,#8338ec,#ff006e)",
                      boxShadow: isRecording
                        ? "0 0 32px rgba(239,68,68,0.6)"
                        : "0 0 32px rgba(131,56,236,0.6)",
                      borderRadius: isRecording ? "8px" : "50%",
                    }}
                    transition={{ type: "spring", stiffness: 300, damping: 20 }}
                  />
                </motion.button>

                {/* Camera indicator (right) */}
                <div className="flex flex-col items-center gap-1">
                  <div
                    className="h-10 w-10 rounded-full grid place-items-center"
                    style={{ background: camReady ? "rgba(6,214,160,0.15)" : "rgba(255,255,255,0.06)", border: `1px solid ${camReady ? "rgba(6,214,160,0.4)" : "rgba(255,255,255,0.1)"}` }}
                  >
                    <Camera className="h-5 w-5" style={{ color: camReady ? "#06d6a0" : "rgba(255,255,255,0.3)" }} />
                  </div>
                  <span className="text-[9px] font-semibold uppercase tracking-wide" style={{ color: camReady ? "#06d6a0" : "rgba(255,255,255,0.25)" }}>
                    {camReady ? (mode === "video" && isRecording ? "REC" : "Live") : "Cam"}
                  </span>
                </div>
              </div>
            )}

            {/* Mode strip */}
            <div className="flex items-center gap-0 relative">
              {MODES.map(({ id, label }) => {
                const active = mode === id;
                return (
                  <motion.button type="button" key={id} onClick={() => switchMode(id)} className="relative px-5 py-1.5" whileTap={{ scale: 0.92 }}>
                    <span className="text-[14px] font-bold transition-colors duration-150"
                      style={{ color: active ? "#ffffff" : "rgba(255,255,255,0.35)" }}>
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
            BOTTOM SHEET — gallery picker (fallback / extra)
        ══════════════════════════════════════════════════════════════ */}
        <AnimatePresence>
          {sheet && (
            <>
              <motion.div
                className="fixed inset-0 z-[50]"
                style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(6px)" }}
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                onClick={() => setSheet(false)}
              />
              <motion.div
                className="fixed bottom-0 left-0 right-0 z-[51] rounded-t-[28px] overflow-hidden"
                style={{
                  background: "rgba(14,10,22,0.95)", backdropFilter: "blur(24px)",
                  border: "1px solid rgba(255,255,255,0.10)",
                  paddingBottom: `max(env(safe-area-inset-bottom, 0px), 24px)`,
                }}
                initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
                transition={{ type: "spring", stiffness: 380, damping: 34 }}
              >
                <div className="flex justify-center pt-3 pb-2">
                  <div className="h-[3px] w-10 rounded-full bg-white/20" />
                </div>
                <p className="text-center text-[13px] font-semibold text-white/40 mb-5 tracking-wide uppercase">
                  Choose from Gallery
                </p>
                <div className="flex gap-4 px-6 pb-2">
                  <motion.button type="button" whileTap={{ scale: 0.94 }}
                    onClick={() => { setMode("photo"); imgRef.current?.click(); setSheet(false); }}
                    className="flex-1 flex flex-col items-center gap-4 rounded-3xl py-8"
                    style={{ background: "rgba(131,56,236,0.10)", border: "1px solid rgba(131,56,236,0.25)" }}
                  >
                    <div className="grid h-16 w-16 place-items-center rounded-2xl"
                      style={{ background: "linear-gradient(135deg,rgba(131,56,236,0.35),rgba(255,0,110,0.20))" }}>
                      <ImageIcon className="h-8 w-8 text-white" />
                    </div>
                    <span className="text-[15px] font-bold text-white">Photo</span>
                  </motion.button>

                  <motion.button type="button" whileTap={{ scale: 0.94 }}
                    onClick={() => { setMode("video"); vidRef.current?.click(); setSheet(false); }}
                    className="flex-1 flex flex-col items-center gap-4 rounded-3xl py-8"
                    style={{ background: "rgba(255,0,110,0.09)", border: "1px solid rgba(255,0,110,0.22)" }}
                  >
                    <div className="grid h-16 w-16 place-items-center rounded-2xl"
                      style={{ background: "linear-gradient(135deg,rgba(255,0,110,0.30),rgba(255,190,11,0.18))" }}>
                      <Video className="h-8 w-8 text-white" />
                    </div>
                    <span className="text-[15px] font-bold text-white">Video</span>
                  </motion.button>
                </div>
                <motion.button type="button" whileTap={{ scale: 0.97 }}
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
    document.body,
  );
}
