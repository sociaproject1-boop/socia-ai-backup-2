/**
 * FounderHero — Ultra-cinematic founder profile hero matching IMAGE 2.
 *
 * Structure (back to front):
 *   1. <video> background — autoplay muted loop (multiple source fallbacks)
 *   2. Canvas overlay — particles, headlight beams, center glow, fog, streaks
 *   3. Gradient vignettes — top + bottom fades
 *   4. Crown + Avatar circle — centered in hero
 *   5. Audio button — bottom-left with waveform bars
 *
 * Web Audio API ambient drone:
 *   38 Hz + 41 Hz (slow beating bass), 110 Hz + 165 Hz chord,
 *   low-pass filtered, 5 s fade-in to 0.038 master gain, fade-out on unmount.
 *
 * Mobile-safe: 30 fps RAF throttle, DPR capped ×2, ResizeObserver.
 */

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Camera } from "lucide-react";

/* ══════════════════════════════════════════════════════════════════════════
   Video sources — dark luxury / night city aesthetic
   Falls back gracefully: if none load, canvas-only is the visual.
══════════════════════════════════════════════════════════════════════════ */
const VIDEO_SRCS = [
  "https://assets.mixkit.co/videos/preview/mixkit-car-driving-on-a-highway-at-night-4354-large.mp4",
  "https://assets.mixkit.co/videos/preview/mixkit-driving-at-night-on-a-road-with-traffic-4356-large.mp4",
  "https://assets.mixkit.co/videos/preview/mixkit-city-traffic-at-night-11-large.mp4",
];

/* ══════════════════════════════════════════════════════════════════════════
   Web Audio: cinematic ambient drone — auto-starts, handles browser policy.
   If AudioContext is suspended (iOS / strict policy), it resumes on the
   first user interaction (click or touch) automatically.
══════════════════════════════════════════════════════════════════════════ */
function makeAmbient(): () => void {
  try {
    const AC = window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return () => {};
    const ac = new AC();
    const spec: [number, OscillatorType, number][] = [
      [38, "sine", 0.45], [41, "sine", 0.45],
      [110, "sine", 0.18], [165, "sine", 0.12], [220, "triangle", 0.06],
    ];
    const master = ac.createGain();
    master.gain.setValueAtTime(0, ac.currentTime);
    master.gain.linearRampToValueAtTime(0.038, ac.currentTime + 5);
    const lpf = ac.createBiquadFilter();
    lpf.type = "lowpass"; lpf.frequency.value = 260; lpf.Q.value = 0.5;
    lpf.connect(master).connect(ac.destination);
    const oscs: OscillatorNode[] = [];
    spec.forEach(([freq, type, vol]) => {
      const o = ac.createOscillator(); o.type = type; o.frequency.value = freq;
      const g = ac.createGain(); g.gain.value = vol;
      o.connect(g).connect(lpf); o.start(); oscs.push(o);
    });

    /* Handle browsers that start AudioContext in 'suspended' state.
     * Resume on first click or touch — silent, no UI required. */
    const resume = () => { ac.resume().catch(() => {}); };
    if (ac.state === "suspended") {
      document.addEventListener("click",      resume, { capture: true, once: true });
      document.addEventListener("touchstart", resume, { capture: true, once: true });
    }

    return () => {
      document.removeEventListener("click",      resume, true);
      document.removeEventListener("touchstart", resume, true);
      master.gain.setValueAtTime(master.gain.value, ac.currentTime);
      master.gain.linearRampToValueAtTime(0, ac.currentTime + 1.5);
      setTimeout(() => { oscs.forEach(o => { try { o.stop(); } catch { /**/ } }); ac.close(); }, 2000);
    };
  } catch { return () => {}; }
}

/* ══════════════════════════════════════════════════════════════════════════
   Crown SVG (floating above avatar)
══════════════════════════════════════════════════════════════════════════ */
function CrownIcon({ size = 36 }: { size?: number }) {
  return (
    <svg viewBox="0 0 48 32" style={{ width: size, height: size * 0.7, filter: "drop-shadow(0 0 10px rgba(251,191,36,1)) drop-shadow(0 0 20px rgba(245,158,11,0.8))" }}>
      <defs>
        <linearGradient id="crownGrad" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%"   stopColor="#fde68a" />
          <stop offset="50%"  stopColor="#fbbf24" />
          <stop offset="100%" stopColor="#d97706" />
        </linearGradient>
      </defs>
      {/* Crown body */}
      <path d="M4 28 L8 10 L18 20 L24 4 L30 20 L40 10 L44 28 Z" fill="url(#crownGrad)" stroke="#f59e0b" strokeWidth="1" />
      {/* Jewels */}
      <circle cx="24" cy="4"  r="3" fill="#fde68a" />
      <circle cx="8"  cy="10" r="2" fill="#fbbf24" />
      <circle cx="40" cy="10" r="2" fill="#fbbf24" />
      {/* Base bar */}
      <rect x="4" y="27" width="40" height="4" rx="2" fill="url(#crownGrad)" />
    </svg>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Canvas animation types
══════════════════════════════════════════════════════════════════════════ */
interface Particle { x: number; y: number; vy: number; size: number; opacity: number; rgb: [number,number,number]; wobbleAmp: number; wobbleFreq: number; phase: number; }
interface Streak   { x1: number; y1: number; x2: number; y2: number; t: number; opacity: number; width: number; }
interface FogBlob  { x: number; y: number; r: number; alpha: number; dx: number; dy: number; rgb: string; }

/* ══════════════════════════════════════════════════════════════════════════
   FounderHero
══════════════════════════════════════════════════════════════════════════ */
interface Props {
  avatarUrl?:      string | null;
  initials?:       string;
  isOnline?:       boolean;
  isEditing?:      boolean;
  onAvatarClick?:  () => void;
  uploading?:      boolean;
  coverPhotoUrl?:  string | null;
  onCoverClick?:   () => void;
  coverUploading?: boolean;
}

export function FounderHero({
  avatarUrl, initials = "A", isOnline = false,
  isEditing = false, onAvatarClick, uploading = false,
  coverPhotoUrl = null, onCoverClick, coverUploading = false,
}: Props) {
  const canvasRef      = useRef<HTMLCanvasElement>(null);
  const videoRef       = useRef<HTMLVideoElement>(null);
  const audioCleanup   = useRef<() => void>(() => {});
  const [videoOk,      setVideoOk]      = useState(true);

  /* Auto-start ambient audio on mount. makeAmbient() handles suspended
   * AudioContext by attaching a one-time interaction listener internally. */
  useEffect(() => {
    audioCleanup.current = makeAmbient();
    return () => { audioCleanup.current(); };
  }, []);

  /* ── Canvas cinematic animation ──────────────────────────────────── */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const setSize = () => {
      const r = canvas.getBoundingClientRect();
      canvas.width  = Math.round(r.width  * dpr);
      canvas.height = Math.round(r.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    setSize();
    const W = () => canvas.width  / dpr;
    const H = () => canvas.height / dpr;

    /* Particles */
    const PARTICLES = 60;
    const particles: Particle[] = Array.from({ length: PARTICLES }, () => {
      const roll = Math.random();
      const rgb: [number,number,number] =
        roll < 0.60 ? [251,191,36] : roll < 0.82 ? [245,158,11] : [255,210,100];
      return {
        x: Math.random() * W(), y: Math.random() * H(),
        vy: 0.15 + Math.random() * 0.55, size: 0.6 + Math.random() * 2.0,
        opacity: 0.2 + Math.random() * 0.75, rgb,
        wobbleAmp: 0.4 + Math.random() * 1.4, wobbleFreq: 0.0008 + Math.random() * 0.0016,
        phase: Math.random() * Math.PI * 2,
      };
    });

    /* Fog blobs */
    const fogs: FogBlob[] = [
      { x: W() * 0.18, y: H() * 0.78, r: W() * 0.72, alpha: 0.06,  dx:  0.07, dy: -0.03, rgb: "245,158,11" },
      { x: W() * 0.85, y: H() * 0.32, r: W() * 0.50, alpha: 0.03,  dx: -0.05, dy:  0.05, rgb: "168,85,247"  },
      { x: W() * 0.50, y: H() * 0.10, r: W() * 0.36, alpha: 0.025, dx:  0.04, dy:  0.04, rgb: "251,191,36"  },
      { x: W() * 0.30, y: H() * 0.55, r: W() * 0.38, alpha: 0.02,  dx: -0.03, dy: -0.02, rgb: "255,140,50"  },
    ];

    /* Streaks */
    const streaks: Streak[] = [];
    let lastStreak = 0; let nextStreakDelay = 3000 + Math.random() * 4000;
    let flashAlpha = 0; let lastFlash = 0; let nextFlashDelay = 30000 + Math.random() * 20000;
    let lastFrame = 0; let rafId = 0; let alive = true;

    const spawnStreak = (t: number) => {
      if (t - lastStreak < nextStreakDelay) return;
      if (streaks.filter(s => s.opacity > 0).length >= 3) return;
      lastStreak = t; nextStreakDelay = 4500 + Math.random() * 5000;
      const w = W(); const angle = 0.2 + Math.random() * 0.65; const len = 80 + Math.random() * 130;
      const x1 = Math.random() * w * 1.3 - w * 0.15;
      streaks.push({ x1, y1: -20, x2: x1 + Math.sin(angle) * len, y2: -20 + Math.cos(angle) * len, t: 0, opacity: 0.5 + Math.random() * 0.4, width: 1 + Math.random() * 1.3 });
      for (let i = streaks.length - 1; i >= 0; i--) if (streaks[i].opacity <= 0) streaks.splice(i, 1);
    };

    const draw = (t: number) => {
      if (!alive) return;
      rafId = requestAnimationFrame(draw);
      if (t - lastFrame < 33) return;
      lastFrame = t;
      const w = W(); const h = H();

      /* Base — dark fill only when no video */
      if (!videoOk) {
        const bg = ctx.createLinearGradient(0, 0, 0, h);
        bg.addColorStop(0, "#04020a"); bg.addColorStop(1, "#000000");
        ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
      } else {
        ctx.clearRect(0, 0, w, h);
      }

      /* Headlight beams from bottom corners (car headlight effect) */
      const drawBeam = (fromX: number, fromW: number, tipX: number, tipY: number, colorA: string) => {
        const path = new Path2D();
        path.moveTo(fromX,        h);
        path.lineTo(fromX + fromW, h);
        path.lineTo(tipX,          tipY);
        path.closePath();
        const g = ctx.createLinearGradient(fromX + fromW * 0.5, h, tipX, tipY);
        g.addColorStop(0, colorA);
        g.addColorStop(1, "rgba(245,158,11,0)");
        ctx.fillStyle = g;
        ctx.fill(path);
      };
      drawBeam(-20,         w * 0.22, w * 0.46, h * 0.48, "rgba(255,140,30,0.12)");
      drawBeam(w * 0.78 + 20, w * 0.22, w * 0.54, h * 0.48, "rgba(255,140,30,0.12)");

      /* Fog blobs */
      fogs.forEach(f => {
        const g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.r);
        g.addColorStop(0, `rgba(${f.rgb},${f.alpha})`);
        g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
        f.x += f.dx; f.y += f.dy;
        if (f.x < -f.r * 0.5 || f.x > w + f.r * 0.5) f.dx *= -1;
        if (f.y < -f.r * 0.5 || f.y > h + f.r * 0.5) f.dy *= -1;
      });

      /* Central avatar glow (breathe) */
      const avatarCX = w * 0.5; const avatarCY = h * 0.67;
      const breathe = 0.08 + Math.sin(t * 0.0009) * 0.04;
      const cg = ctx.createRadialGradient(avatarCX, avatarCY, 0, avatarCX, avatarCY, w * 0.42);
      cg.addColorStop(0, `rgba(251,191,36,${breathe})`);
      cg.addColorStop(0.5, `rgba(245,158,11,${breathe * 0.4})`);
      cg.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = cg; ctx.fillRect(0, 0, w, h);

      /* Particles */
      particles.forEach(p => {
        const wx = p.x + Math.sin(t * p.wobbleFreq + p.phase) * p.wobbleAmp;
        ctx.beginPath(); ctx.arc(wx, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${p.rgb.join(",")},${p.opacity})`; ctx.fill();
        p.y -= p.vy;
        if (p.y < -4) { p.y = h + 6; p.x = Math.random() * w; }
      });

      /* Streaks */
      spawnStreak(t);
      streaks.forEach(s => {
        if (s.opacity <= 0) return;
        s.t = Math.min(1, s.t + 0.02);
        const ex = s.x1 + (s.x2 - s.x1) * s.t; const ey = s.y1 + (s.y2 - s.y1) * s.t;
        const sg = ctx.createLinearGradient(s.x1, s.y1, ex, ey);
        sg.addColorStop(0, `rgba(251,191,36,${s.opacity})`);
        sg.addColorStop(1, "rgba(251,191,36,0)");
        ctx.beginPath(); ctx.moveTo(s.x1, s.y1); ctx.lineTo(ex, ey);
        ctx.strokeStyle = sg; ctx.lineWidth = s.width; ctx.stroke();
        if (s.t >= 0.82) s.opacity -= 0.02;
      });

      /* Lightning flash */
      if (t - lastFlash > nextFlashDelay) {
        lastFlash = t; nextFlashDelay = 30000 + Math.random() * 20000; flashAlpha = 0.1;
      }
      if (flashAlpha > 0) {
        ctx.fillStyle = `rgba(255,255,210,${flashAlpha})`; ctx.fillRect(0, 0, w, h);
        flashAlpha = Math.max(0, flashAlpha - 0.013);
      }

      /* Bottom gold border pulse */
      const lp = 0.3 + Math.sin(t * 0.002) * 0.14;
      const lg = ctx.createLinearGradient(0, h - 1, w, h - 1);
      lg.addColorStop(0, "rgba(251,191,36,0)"); lg.addColorStop(0.2, `rgba(251,191,36,${lp})`);
      lg.addColorStop(0.8, `rgba(251,191,36,${lp})`); lg.addColorStop(1, "rgba(251,191,36,0)");
      ctx.strokeStyle = lg; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(0, h - 0.75); ctx.lineTo(w, h - 0.75); ctx.stroke();

      rafId = requestAnimationFrame(draw);
    };

    rafId = requestAnimationFrame(draw);
    const ro = new ResizeObserver(() => setSize());
    ro.observe(canvas);
    return () => { alive = false; cancelAnimationFrame(rafId); ro.disconnect(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoOk]);


  return (
    <div className="relative w-full overflow-hidden select-none" style={{ height: 160 }}>

      {/* ── Layer 1a: Cover photo (owner-uploaded, overrides video) ── */}
      {coverPhotoUrl ? (
        <img
          src={coverPhotoUrl}
          alt="cover"
          className="absolute inset-0 h-full w-full object-cover"
          style={{ display: "block" }}
        />
      ) : (
        /* ── Layer 1b: Video (fallback when no cover photo) ─────── */
        <video
          ref={videoRef}
          autoPlay muted loop playsInline
          onError={() => setVideoOk(false)}
          className="absolute inset-0 h-full w-full object-cover"
          style={{ display: videoOk ? "block" : "none" }}
        >
          {VIDEO_SRCS.map(src => <source key={src} src={src} type="video/mp4" />)}
        </video>
      )}

      {/* ── Cover photo edit overlay (tap to change) ─────────────── */}
      {isEditing && onCoverClick && (
        <button
          onClick={onCoverClick}
          className="absolute inset-0 z-10 flex flex-col items-center justify-start pt-6 gap-1"
          style={{ background: "rgba(0,0,0,0.38)" }}
        >
          {coverUploading
            ? <span className="h-7 w-7 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            : (
              <>
                <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ width: 26, height: 26 }}>
                  <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
                  <circle cx="12" cy="13" r="4" />
                </svg>
                <span style={{ fontSize: 11, fontWeight: 700, color: "white", letterSpacing: "0.06em" }}>
                  {coverPhotoUrl ? "Change Cover" : "Add Cover Photo"}
                </span>
              </>
            )}
        </button>
      )}

      {/* ── Layer 2: Canvas particles / effects ───────────────────── */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full pointer-events-none"
        style={{ display: "block" }}
      />

      {/* ── Layer 3: Gradient overlays (vignette) ─────────────────── */}
      {/* Top vignette */}
      <div className="absolute top-0 left-0 right-0 pointer-events-none"
        style={{ height: 60, background: "linear-gradient(to bottom, rgba(0,0,0,0.72), transparent)" }} />
      {/* Bottom fade-to-black */}
      <div className="absolute bottom-0 left-0 right-0 pointer-events-none"
        style={{ height: 120, background: "linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.65) 50%, #000000 100%)" }} />
      {/* Side vignettes */}
      <div className="absolute inset-y-0 left-0 pointer-events-none"
        style={{ width: 48, background: "linear-gradient(to right, rgba(0,0,0,0.6), transparent)" }} />
      <div className="absolute inset-y-0 right-0 pointer-events-none"
        style={{ width: 48, background: "linear-gradient(to left, rgba(0,0,0,0.6), transparent)" }} />

      {/* ── Layer 4: Avatar centered in lower hero ─────────────────── */}
      {/* z-20 ensures the camera-button overlay sits ABOVE the z-10 cover overlay */}
      <div
        className="absolute flex flex-col items-center z-20"
        style={{ bottom: 18, left: 0, right: 0, alignItems: "center" }}
      >
        {/* Crown floats above avatar */}
        <motion.div
          animate={{ y: [-2, 2, -2] }}
          transition={{ duration: 2.8, repeat: Infinity, ease: "easeInOut" }}
          style={{ marginBottom: -6 }}
        >
          <CrownIcon size={44} />
        </motion.div>

        {/* Avatar ring */}
        <motion.div
          animate={{
            boxShadow: [
              "0 0 0 3px #f59e0b, 0 0 22px 8px rgba(245,158,11,0.55), 0 0 50px 16px rgba(251,191,36,0.2)",
              "0 0 0 3.5px #fbbf24, 0 0 38px 14px rgba(251,191,36,0.9), 0 0 70px 24px rgba(245,158,11,0.45)",
              "0 0 0 3px #f59e0b, 0 0 22px 8px rgba(245,158,11,0.55), 0 0 50px 16px rgba(251,191,36,0.2)",
            ],
          }}
          transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
          className="relative overflow-hidden rounded-full"
          style={{ width: 96, height: 96 }}
        >
          {avatarUrl ? (
            <img
              src={avatarUrl} alt="avatar"
              className={"h-full w-full object-cover rounded-full " + (uploading ? "opacity-50" : "")}
            />
          ) : (
            <div className="h-full w-full rounded-full bg-gradient-to-br from-amber-600 via-yellow-500 to-orange-600 grid place-items-center text-2xl font-bold text-black">
              {uploading ? <span className="h-5 w-5 animate-spin rounded-full border-2 border-black/30 border-t-black" /> : initials}
            </div>
          )}

          {/* Edit overlay */}
          {isEditing && onAvatarClick && (
            <button
              onClick={onAvatarClick}
              className="absolute inset-0 rounded-full grid place-items-center"
              style={{ background: "rgba(0,0,0,0.55)" }}
            >
              <Camera style={{ width: 22, height: 22, color: "#fff" }} />
            </button>
          )}
        </motion.div>

        {/* Online dot below avatar */}
        <div className="mt-2 flex items-center gap-1.5">
          {isOnline ? (
            <motion.div
              animate={{ scale: [1, 1.5, 1], opacity: [1, 0.5, 1] }}
              transition={{ duration: 1.4, repeat: Infinity }}
              style={{ width: 7, height: 7, borderRadius: "50%", background: "#22c55e" }}
            />
          ) : (
            <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#6b7280" }} />
          )}
          <span style={{
            fontSize: 10.5, fontWeight: 800, letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: isOnline ? "#22c55e" : "#6b7280",
          }}>
            {isOnline ? "Online" : "Offline"}
          </span>
        </div>
      </div>

    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   KING badge — gold pill (IMAGE 2 style)
══════════════════════════════════════════════════════════════════════════ */
export function KingBadge() {
  return (
    <motion.div
      animate={{
        boxShadow: [
          "0 0 10px 2px rgba(251,191,36,0.5)",
          "0 0 22px 6px rgba(251,191,36,0.9)",
          "0 0 10px 2px rgba(251,191,36,0.5)",
        ],
      }}
      transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
      className="inline-flex items-center gap-1.5 rounded-full"
      style={{
        padding: "5px 12px 5px 8px",
        background: "linear-gradient(135deg, #d97706 0%, #fbbf24 50%, #f59e0b 100%)",
        border: "1px solid rgba(253,230,138,0.6)",
      }}
    >
      {/* Crown icon */}
      <svg viewBox="0 0 18 14" style={{ width: 14, height: 11 }}>
        <defs>
          <linearGradient id="kg" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%"   stopColor="#78350f" />
            <stop offset="100%" stopColor="#451a03" />
          </linearGradient>
        </defs>
        <path d="M1 12 L3 4 L7 8 L9 1 L11 8 L15 4 L17 12 Z" fill="url(#kg)" />
        <rect x="1" y="11" width="16" height="2.5" rx="1" fill="url(#kg)" />
      </svg>
      <span style={{ fontSize: 11.5, fontWeight: 900, color: "#000", letterSpacing: "0.08em" }}>KING</span>
    </motion.div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   VerifiedFounderBadge — animated blue checkmark (Twitter/X style).
   Layers (back to front):
     1. Outer rotating dashed ring  (6 s CW)
     2. Inner counter-rotating ring (9 s CCW)
     3. Pulse glow explosion (2.4 s)
     4. Badge circle with shine sweep
══════════════════════════════════════════════════════════════════════════ */
export function VerifiedFounderBadge() {
  return (
    <div style={{ position: "relative", width: 28, height: 28, flexShrink: 0 }}>
      {/* Outer dashed rotating ring */}
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ duration: 6, repeat: Infinity, ease: "linear" }}
        style={{
          position: "absolute", inset: -4, borderRadius: "50%",
          border: "1.5px dashed rgba(29,155,240,0.7)",
          pointerEvents: "none",
        }}
      />
      {/* Inner solid counter-rotating ring */}
      <motion.div
        animate={{ rotate: -360 }}
        transition={{ duration: 9, repeat: Infinity, ease: "linear" }}
        style={{
          position: "absolute", inset: -1.5, borderRadius: "50%",
          border: "1px solid rgba(96,165,250,0.4)",
          pointerEvents: "none",
        }}
      />
      {/* Glow pulse explosion */}
      <motion.div
        animate={{ scale: [1, 1.7, 1], opacity: [0.5, 0, 0.5] }}
        transition={{ duration: 2.4, repeat: Infinity, ease: "easeOut" }}
        style={{
          position: "absolute", inset: -5, borderRadius: "50%",
          background: "rgba(29,155,240,0.35)",
          pointerEvents: "none",
        }}
      />
      {/* Badge circle */}
      <motion.div
        animate={{ scale: [1, 1.06, 1] }}
        transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
        style={{
          position: "relative", width: 28, height: 28, borderRadius: "50%",
          background: "linear-gradient(135deg, #1d9bf0, #0e71c7 55%, #1a8cd8)",
          boxShadow: "0 0 16px rgba(29,155,240,0.8), 0 0 32px rgba(14,113,199,0.4)",
          display: "grid", placeItems: "center", overflow: "hidden",
        }}
      >
        {/* Checkmark */}
        <svg viewBox="0 0 12 12" style={{ width: 13, height: 13, position: "relative", zIndex: 1 }}>
          <path d="M2 6.5 L5 9.5 L10 3" stroke="#fff" strokeWidth="2.2"
            strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </svg>
        {/* Shine sweep */}
        <motion.div
          animate={{ x: ["-160%", "160%"] }}
          transition={{ duration: 2.2, repeat: Infinity, repeatDelay: 2.0, ease: "easeInOut" }}
          style={{
            position: "absolute", top: "-10%", bottom: "-10%", width: "45%",
            background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.55), transparent)",
            transform: "skewX(-18deg)", zIndex: 2,
          }}
        />
      </motion.div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   MiniWaveform — for admin cards
══════════════════════════════════════════════════════════════════════════ */
export function MiniWaveform({ active = true, color = "#22c55e" }: { active?: boolean; color?: string }) {
  const bars = [4, 9, 13, 7, 11, 5, 12, 8];
  return (
    <div style={{ display: "flex", gap: 2, alignItems: "flex-end", height: 14 }}>
      {bars.map((h, i) => (
        <motion.div
          key={i}
          animate={active ? { scaleY: [0.25, 1, 0.35, 0.88, 0.2, 1, 0.5] } : { scaleY: 0.2 }}
          transition={{ duration: 1.0, repeat: Infinity, delay: i * 0.08, ease: "easeInOut" }}
          style={{ width: 2.5, height: h, background: color, borderRadius: 1.5, transformOrigin: "bottom", opacity: 0.85 }}
        />
      ))}
    </div>
  );
}
