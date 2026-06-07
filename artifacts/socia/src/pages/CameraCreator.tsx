/**
 * CameraCreator.tsx — Professional camera/story creator.
 *
 * Route: /camera
 *
 * Features:
 *  • Live camera preview (getUserMedia)
 *  • Photo capture
 *  • Video recording (MediaRecorder)
 *  • 6 live visual effects (CSS filters)
 *  • Countdown timer (3 / 5 / 10 s)
 *  • Speed selector (0.5× / 1× / 2×)
 *  • Sound attachment (SoundBrowser)
 *  • Flash simulation
 *  • Front/back camera flip
 *  • After capture → Upload.tsx with the media pre-filled
 */
import { useEffect, useRef, useState, useCallback } from "react";
import { useLocation, useSearch } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, SwitchCamera, Zap, ZapOff, Timer, Gauge, Music2, Download,
  CameraIcon, Circle,
} from "lucide-react";
import { SoundBrowser } from "@/components/sounds/SoundBrowser";
import type { Sound } from "@/lib/soundsClient";

/* ── Types ─────────────────────────────────────────────────────────────── */

type Mode     = "photo" | "video";
type EffectId = "normal" | "vivid" | "warm" | "cool" | "fade" | "bw";

interface Effect {
  id:     EffectId;
  label:  string;
  filter: string;
}

/* ── Constants ─────────────────────────────────────────────────────────── */

const EFFECTS: Effect[] = [
  { id: "normal", label: "Normal", filter: "none" },
  { id: "vivid",  label: "Vivid",  filter: "saturate(1.6) contrast(1.12)" },
  { id: "warm",   label: "Warm",   filter: "sepia(0.28) saturate(1.3) brightness(1.05)" },
  { id: "cool",   label: "Cool",   filter: "hue-rotate(22deg) saturate(0.88) brightness(1.02)" },
  { id: "fade",   label: "Fade",   filter: "contrast(0.78) brightness(1.12) saturate(0.7)" },
  { id: "bw",     label: "B&W",    filter: "grayscale(1) contrast(1.12)" },
];

const TIMER_OPTIONS = [0, 3, 5, 10];
const SPEED_OPTIONS = [0.5, 1, 2];

/* ── Component ─────────────────────────────────────────────────────────── */

export default function CameraCreator() {
  const [, navigate]  = useLocation();
  const search        = useSearch();

  const videoRef      = useRef<HTMLVideoElement>(null);
  const streamRef     = useRef<MediaStream | null>(null);
  const recorderRef   = useRef<MediaRecorder | null>(null);
  const chunksRef     = useRef<Blob[]>([]);
  const countRef      = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flashRef      = useRef<HTMLDivElement | null>(null);

  const [mode,        setMode]      = useState<Mode>("photo");
  const [facing,      setFacing]    = useState<"user" | "environment">("environment");
  const [flashOn,     setFlashOn]   = useState(false);
  const [recording,   setRecording] = useState(false);
  const [countdown,   setCountdown] = useState<number | null>(null);
  const [timerSel,    setTimerSel]  = useState(0);
  const [speedSel,    setSpeedSel]  = useState(1);
  const [effectIdx,   setEffectIdx] = useState(0);
  const [camError,    setCamError]  = useState<string | null>(null);
  const [showTimer,   setShowTimer] = useState(false);
  const [showSpeed,   setShowSpeed] = useState(false);
  const [showEffects, setShowEffects] = useState(false);
  const [soundOpen,   setSoundOpen]   = useState(false);
  const [sound,       setSound]       = useState<Sound | null>(null);
  const [recSeconds,  setRecSeconds]  = useState(0);

  const selectedEffect = EFFECTS[effectIdx];

  /* ── Camera setup ───────────────────────────────────────────────── */
  const startCamera = useCallback(async (f: "user" | "environment") => {
    try {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: f, width: { ideal: 1080 }, height: { ideal: 1920 } },
        audio: true,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      setCamError(null);
    } catch (err: any) {
      setCamError(err?.message?.includes("Permission") ? "Camera permission denied." : "Camera unavailable.");
    }
  }, []);

  useEffect(() => {
    startCamera(facing);
    return () => streamRef.current?.getTracks().forEach((t) => t.stop());
  }, [facing, startCamera]);

  /* ── Recording timer ────────────────────────────────────────────── */
  useEffect(() => {
    if (!recording) { setRecSeconds(0); return; }
    const t = setInterval(() => setRecSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [recording]);

  /* ── Flash ──────────────────────────────────────────────────────── */
  const triggerFlash = useCallback(() => {
    if (!flashOn || !flashRef.current) return;
    flashRef.current.style.opacity = "1";
    setTimeout(() => { if (flashRef.current) flashRef.current.style.opacity = "0"; }, 80);
  }, [flashOn]);

  /* ── Capture photo ──────────────────────────────────────────────── */
  const capturePhoto = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    triggerFlash();
    const canvas = document.createElement("canvas");
    canvas.width  = v.videoWidth  || 1080;
    canvas.height = v.videoHeight || 1920;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    if (selectedEffect.filter !== "none") ctx.filter = selectedEffect.filter;
    if (facing === "user") { ctx.translate(canvas.width, 0); ctx.scale(-1, 1); }
    ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const file = new File([blob], `photo-${Date.now()}.jpg`, { type: "image/jpeg" });
      const params = new URLSearchParams();
      if (sound) params.set("sound", sound.id);
      navigate(`/upload?${params}`);
      /* Store captured file in sessionStorage URL */
      const url = URL.createObjectURL(file);
      sessionStorage.setItem("camera_capture_url", url);
      sessionStorage.setItem("camera_capture_type", "photo");
      if (sound) sessionStorage.setItem("camera_sound_id", sound.id);
    }, "image/jpeg", 0.88);
  }, [triggerFlash, selectedEffect, facing, navigate, sound]);

  /* ── Start countdown then action ────────────────────────────────── */
  const startCountdown = useCallback((action: () => void) => {
    if (timerSel === 0) { action(); return; }
    let left = timerSel;
    setCountdown(left);
    const tick = () => {
      left--;
      if (left > 0) { setCountdown(left); countRef.current = setTimeout(tick, 1000); }
      else { setCountdown(null); action(); }
    };
    countRef.current = setTimeout(tick, 1000);
  }, [timerSel]);

  /* ── Video recording ─────────────────────────────────────────────── */
  const startRecording = useCallback(() => {
    const stream = streamRef.current;
    if (!stream) return;
    chunksRef.current = [];
    const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
      ? "video/webm;codecs=vp9"
      : "video/webm";
    const recorder = new MediaRecorder(stream, { mimeType });
    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: mimeType });
      const url  = URL.createObjectURL(blob);
      sessionStorage.setItem("camera_capture_url", url);
      sessionStorage.setItem("camera_capture_type", "video");
      if (sound) sessionStorage.setItem("camera_sound_id", sound.id);
      const params = new URLSearchParams();
      if (sound) params.set("sound", sound.id);
      navigate(`/upload?${params}`);
    };
    recorder.start(250);
    recorderRef.current = recorder;
    setRecording(true);
  }, [navigate, sound]);

  const stopRecording = useCallback(() => {
    recorderRef.current?.stop();
    setRecording(false);
  }, []);

  const handleShutter = useCallback(() => {
    if (mode === "photo") { startCountdown(capturePhoto); return; }
    if (recording) { stopRecording(); return; }
    startCountdown(startRecording);
  }, [mode, recording, startCountdown, capturePhoto, stopRecording, startRecording]);

  /* ── Cancel countdown ────────────────────────────────────────────── */
  const cancelCountdown = useCallback(() => {
    if (countRef.current) clearTimeout(countRef.current);
    setCountdown(null);
  }, []);

  /* ── Format time ─────────────────────────────────────────────────── */
  const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  return (
    <div
      className="fixed inset-0 z-[9500] flex flex-col overflow-hidden"
      style={{ background: "#000", paddingTop: "env(safe-area-inset-top)" }}
    >
      {/* Flash overlay */}
      <div
        ref={flashRef}
        className="pointer-events-none fixed inset-0 z-[9998] transition-opacity duration-75"
        style={{ background: "#fff", opacity: 0 }}
      />

      {/* ── Camera feed ─────────────────────────────────────────────── */}
      <div className="relative flex-1 overflow-hidden">
        {camError ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-zinc-950">
            <CameraIcon className="h-16 w-16 text-white/20" />
            <p className="text-white/50 text-sm text-center px-8">{camError}</p>
            <button
              onClick={() => startCamera(facing)}
              className="px-5 py-2.5 rounded-full text-sm font-semibold text-white"
              style={{ background: "linear-gradient(135deg,#8338ec,#ff006e)" }}
            >
              Try again
            </button>
          </div>
        ) : (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="absolute inset-0 w-full h-full object-cover"
            style={{
              filter:    selectedEffect.filter,
              transform: facing === "user" ? "scaleX(-1)" : "none",
              transition: "filter 0.2s ease",
            }}
          />
        )}

        {/* Countdown overlay */}
        <AnimatePresence>
          {countdown !== null && (
            <motion.div
              initial={{ scale: 1.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              key={countdown}
              className="absolute inset-0 flex items-center justify-center pointer-events-none"
              style={{ background: "rgba(0,0,0,0.3)" }}
            >
              <span className="text-[96px] font-black text-white drop-shadow-2xl">{countdown}</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Recording indicator */}
        {recording && (
          <div
            className="absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-2 px-3 py-1.5 rounded-full z-10"
            style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(8px)" }}
          >
            <div className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
            <span className="text-sm font-bold text-white font-mono">{fmtTime(recSeconds)}</span>
          </div>
        )}

        {/* ── Top bar ─────────────────────────────────────────────── */}
        <div className="absolute top-4 left-0 right-0 flex items-center justify-between px-4 z-10">
          <button
            onClick={() => navigate(-1 as any)}
            className="grid h-10 w-10 place-items-center rounded-full"
            style={{ background: "rgba(0,0,0,0.45)", backdropFilter: "blur(8px)" }}
          >
            <X className="h-5 w-5 text-white" />
          </button>

          {/* Sound badge */}
          {sound && (
            <button
              onClick={() => setSoundOpen(true)}
              className="flex items-center gap-1.5 rounded-full px-3 py-1.5 max-w-[40%]"
              style={{ background: "rgba(131,56,236,0.5)", backdropFilter: "blur(8px)" }}
            >
              <Music2 className="h-3.5 w-3.5 text-purple-200 flex-shrink-0" />
              <span className="text-xs font-semibold text-white truncate">{sound.title}</span>
            </button>
          )}

          <button
            onClick={() => setFacing((f) => f === "user" ? "environment" : "user")}
            className="grid h-10 w-10 place-items-center rounded-full"
            style={{ background: "rgba(0,0,0,0.45)", backdropFilter: "blur(8px)" }}
          >
            <SwitchCamera className="h-5 w-5 text-white" />
          </button>
        </div>

        {/* ── Right side controls ──────────────────────────────────── */}
        <div className="absolute right-3 top-1/2 -translate-y-1/2 flex flex-col gap-4 z-10">
          {/* Flash */}
          <button
            onClick={() => setFlashOn((v) => !v)}
            className="grid h-11 w-11 place-items-center rounded-full"
            style={{ background: flashOn ? "rgba(255,190,0,0.35)" : "rgba(0,0,0,0.45)", backdropFilter: "blur(8px)" }}
          >
            {flashOn ? <Zap className="h-5 w-5 text-yellow-300" /> : <ZapOff className="h-5 w-5 text-white" />}
          </button>

          {/* Timer */}
          <div className="relative">
            <button
              onClick={() => { setShowTimer((v) => !v); setShowSpeed(false); setShowEffects(false); }}
              className="grid h-11 w-11 place-items-center rounded-full"
              style={{ background: timerSel > 0 ? "rgba(131,56,236,0.4)" : "rgba(0,0,0,0.45)", backdropFilter: "blur(8px)" }}
            >
              <Timer className="h-5 w-5 text-white" />
            </button>
            <AnimatePresence>
              {showTimer && (
                <motion.div
                  initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }}
                  className="absolute right-12 top-0 flex items-center gap-1 rounded-full px-3 py-2"
                  style={{ background: "rgba(20,20,30,0.95)", border: "1px solid rgba(255,255,255,0.1)" }}
                >
                  {TIMER_OPTIONS.map((t) => (
                    <button
                      key={t}
                      onClick={() => { setTimerSel(t); setShowTimer(false); }}
                      className="px-2.5 py-1 rounded-full text-xs font-bold"
                      style={timerSel === t ? { background: "linear-gradient(135deg,#8338ec,#ff006e)", color: "#fff" } : { color: "rgba(255,255,255,0.55)" }}
                    >
                      {t === 0 ? "Off" : `${t}s`}
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Speed */}
          <div className="relative">
            <button
              onClick={() => { setShowSpeed((v) => !v); setShowTimer(false); setShowEffects(false); }}
              className="grid h-11 w-11 place-items-center rounded-full"
              style={{ background: speedSel !== 1 ? "rgba(131,56,236,0.4)" : "rgba(0,0,0,0.45)", backdropFilter: "blur(8px)" }}
            >
              <Gauge className="h-5 w-5 text-white" />
            </button>
            <AnimatePresence>
              {showSpeed && (
                <motion.div
                  initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }}
                  className="absolute right-12 top-0 flex items-center gap-1 rounded-full px-3 py-2"
                  style={{ background: "rgba(20,20,30,0.95)", border: "1px solid rgba(255,255,255,0.1)" }}
                >
                  {SPEED_OPTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => { setSpeedSel(s); setShowSpeed(false); }}
                      className="px-2.5 py-1 rounded-full text-xs font-bold"
                      style={speedSel === s ? { background: "linear-gradient(135deg,#8338ec,#ff006e)", color: "#fff" } : { color: "rgba(255,255,255,0.55)" }}
                    >
                      {s}×
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Sound */}
          <button
            onClick={() => { setSoundOpen(true); setShowTimer(false); setShowSpeed(false); }}
            className="grid h-11 w-11 place-items-center rounded-full"
            style={{ background: sound ? "rgba(131,56,236,0.4)" : "rgba(0,0,0,0.45)", backdropFilter: "blur(8px)" }}
          >
            <Music2 className="h-5 w-5 text-white" />
          </button>
        </div>

        {/* ── Effects strip ────────────────────────────────────────── */}
        <div className="absolute bottom-36 left-0 right-0 px-2">
          <div className="flex gap-2 overflow-x-auto hide-scrollbar py-1">
            {EFFECTS.map((eff, i) => (
              <button
                key={eff.id}
                onClick={() => setEffectIdx(i)}
                className="flex-shrink-0 flex flex-col items-center gap-1"
              >
                <div
                  className="w-12 h-12 rounded-xl overflow-hidden"
                  style={{
                    filter:  eff.filter,
                    outline: effectIdx === i ? "2.5px solid #fff" : "none",
                    outlineOffset: 1,
                    background: "linear-gradient(135deg,#8338ec44,#ff006e44)",
                  }}
                >
                  <div className="w-full h-full" style={{ background: "linear-gradient(135deg,#8338ec,#ff006e)" }} />
                </div>
                <span
                  className="text-[10px] font-semibold"
                  style={{ color: effectIdx === i ? "#fff" : "rgba(255,255,255,0.4)" }}
                >
                  {eff.label}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Bottom controls ──────────────────────────────────────────── */}
      <div
        className="flex-shrink-0 flex flex-col items-center gap-4 pt-4"
        style={{
          paddingBottom:   "max(24px, env(safe-area-inset-bottom, 24px))",
          background:      "linear-gradient(to top, rgba(0,0,0,0.9) 0%, transparent 100%)",
        }}
      >
        {/* Mode selector */}
        <div
          className="flex items-center rounded-full p-[3px]"
          style={{ background: "rgba(255,255,255,0.10)" }}
        >
          {(["photo", "video"] as Mode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className="rounded-full px-5 py-1.5 text-[13px] font-bold capitalize transition-all"
              style={mode === m ? {
                background: "linear-gradient(135deg,#8338ec,#ff006e)",
                color: "#fff",
              } : { color: "rgba(255,255,255,0.4)" }}
            >
              {m}
            </button>
          ))}
        </div>

        {/* Shutter row */}
        <div className="flex items-center justify-between w-full px-8">
          {/* Gallery shortcut */}
          <button
            onClick={() => navigate("/upload")}
            className="grid h-12 w-12 place-items-center rounded-xl"
            style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.08)" }}
          >
            <Download className="h-5 w-5 text-white" />
          </button>

          {/* Main shutter button */}
          <button
            onClick={countdown !== null ? cancelCountdown : handleShutter}
            className="relative grid place-items-center rounded-full transition-transform active:scale-95"
            style={{ width: 72, height: 72 }}
          >
            {/* Outer ring */}
            <div
              className="absolute inset-0 rounded-full"
              style={{
                border: recording ? "4px solid #ef4444" : "4px solid white",
                transition: "border-color 0.2s",
              }}
            />
            {/* Inner fill */}
            <div
              className="rounded-full transition-all"
              style={{
                width:      recording ? 28 : mode === "video" ? 40 : 56,
                height:     recording ? 28 : mode === "video" ? 40 : 56,
                background: recording ? "#ef4444" : mode === "video" ? "#ef4444" : "white",
                borderRadius: recording ? 6 : "50%",
                transition: "all 0.2s ease",
              }}
            />
            {countdown !== null && (
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-lg font-black text-white">{countdown}</span>
              </div>
            )}
          </button>

          {/* Effects toggle */}
          <button
            onClick={() => setShowEffects((v) => !v)}
            className="grid h-12 w-12 place-items-center rounded-xl"
            style={{
              background: showEffects ? "rgba(131,56,236,0.35)" : "rgba(255,255,255,0.1)",
              border:     "1px solid rgba(255,255,255,0.08)",
            }}
          >
            <Circle className="h-5 w-5 text-white" />
          </button>
        </div>
      </div>

      {/* ── Sound Browser ────────────────────────────────────────────── */}
      <SoundBrowser
        open={soundOpen}
        onClose={() => setSoundOpen(false)}
        onSelect={(s) => { setSound(s); setSoundOpen(false); }}
        selected={sound}
      />
    </div>
  );
}
