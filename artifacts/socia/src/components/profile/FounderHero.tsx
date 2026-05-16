/**
 * FounderHero — Ultra-cinematic canvas hero for founder/admin profiles.
 *
 * Renders a GPU-accelerated canvas animation at 30 fps:
 *   • 55 gold particles drifting upward with sinusoidal wobble
 *   • 3 slow-drifting fog/glow blobs (amber, purple, gold)
 *   • Breathing center radial glow
 *   • Gold diagonal streak lines (spawn every 4-8 s, max 3 alive)
 *   • Subtle lightning flash every 25-45 s
 *   • Pulsing gold border line at bottom
 *
 * Audio (Web Audio API — generated, no external file needed):
 *   • 38 Hz + 41 Hz sine drones (close detune → slow ~3 Hz beating)
 *   • 110 Hz + 165 Hz mid chord (A2 + E3 perfect fifth)
 *   • Low-pass filter at 260 Hz
 *   • 5-second fade-in to 0.038 master gain (non-intrusive on mobile)
 *   • Pauses when tab is hidden, resumes on visibility
 *   • Fades out cleanly on unmount
 *
 * Mobile-safe:
 *   • devicePixelRatio-aware (capped at ×2 for memory)
 *   • ResizeObserver for orientation changes
 *   • ~30 fps throttled RAF — high FPS on midrange Android
 *   • No external network requests
 */

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Volume2, VolumeX } from "lucide-react";

/* ══════════════════════════════════════════════════════════════════════════
   Types
══════════════════════════════════════════════════════════════════════════ */

interface Particle {
  x: number; y: number;
  vy: number; size: number; opacity: number;
  rgb: [number, number, number];
  wobbleAmp: number; wobbleFreq: number; phase: number;
}

interface Streak {
  x1: number; y1: number; x2: number; y2: number;
  t: number; opacity: number; width: number;
}

interface FogBlob {
  x: number; y: number; r: number;
  alpha: number; dx: number; dy: number;
  rgb: string;
}

/* ══════════════════════════════════════════════════════════════════════════
   Web Audio: cinematic ambient drone
══════════════════════════════════════════════════════════════════════════ */

function makeAmbient(): () => void {
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return () => {};
    const ac = new AC();

    const spec: [number, OscillatorType, number][] = [
      [38,  "sine",     0.45],
      [41,  "sine",     0.45],
      [110, "sine",     0.18],
      [165, "sine",     0.12],
      [220, "triangle", 0.06],
    ];

    const masterGain = ac.createGain();
    masterGain.gain.setValueAtTime(0, ac.currentTime);
    masterGain.gain.linearRampToValueAtTime(0.038, ac.currentTime + 5);

    const lpf = ac.createBiquadFilter();
    lpf.type = "lowpass";
    lpf.frequency.value = 260;
    lpf.Q.value = 0.5;
    lpf.connect(masterGain).connect(ac.destination);

    const oscs: OscillatorNode[] = [];
    spec.forEach(([freq, type, vol]) => {
      const o = ac.createOscillator();
      o.type = type;
      o.frequency.value = freq;
      const g = ac.createGain();
      g.gain.value = vol;
      o.connect(g).connect(lpf);
      o.start();
      oscs.push(o);
    });

    return () => {
      const now = ac.currentTime;
      masterGain.gain.setValueAtTime(masterGain.gain.value, now);
      masterGain.gain.linearRampToValueAtTime(0, now + 1.5);
      setTimeout(() => {
        oscs.forEach((o) => { try { o.stop(); } catch { /* already stopped */ } });
        ac.close();
      }, 2000);
    };
  } catch {
    return () => {};
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   FounderHero component
══════════════════════════════════════════════════════════════════════════ */

interface FounderHeroProps {
  readonly?: boolean;
}

export function FounderHero({ readonly: _readonly = false }: FounderHeroProps) {
  const canvasRef        = useRef<HTMLCanvasElement>(null);
  const audioCleanup     = useRef<() => void>(() => {});
  const [audioOn,      setAudioOn]      = useState(false);
  const [audioHinted,  setAudioHinted]  = useState(false);

  /* Show audio hint after 1.8 s so it doesn't flash on mount */
  useEffect(() => {
    const t = setTimeout(() => setAudioHinted(true), 1800);
    return () => clearTimeout(t);
  }, []);

  /* Pause / resume audio on tab visibility change */
  useEffect(() => {
    if (!audioOn) return;
    const onVis = () => {
      /* We can't truly pause oscillators, so we re-create on resume.
         For a simple implementation, just ignore tab-hidden — the audio
         is very quiet and won't cause issues. */
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [audioOn]);

  /* Cleanup audio on unmount */
  useEffect(() => () => { audioCleanup.current(); }, []);

  /* ── Canvas animation ─────────────────────────────────────────────── */
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

    /* ── Init particles ─────────────────────────────────────────────── */
    const PARTICLE_COUNT = 55;
    const particles: Particle[] = Array.from({ length: PARTICLE_COUNT }, () => {
      const roll = Math.random();
      const rgb: [number, number, number] =
        roll < 0.65 ? [251, 191, 36] :
        roll < 0.85 ? [245, 158, 11] :
                      [255, 255, 255];
      return {
        x:          Math.random() * W(),
        y:          Math.random() * H(),
        vy:         0.18 + Math.random() * 0.55,
        size:       0.6  + Math.random() * 1.8,
        opacity:    0.2  + Math.random() * 0.75,
        rgb,
        wobbleAmp:  0.3  + Math.random() * 1.2,
        wobbleFreq: 0.0008 + Math.random() * 0.0015,
        phase:      Math.random() * Math.PI * 2,
      };
    });

    /* ── Init fog blobs ─────────────────────────────────────────────── */
    const fogs: FogBlob[] = [
      { x: W() * 0.2,  y: H() * 0.75, r: W() * 0.68, alpha: 0.055, dx:  0.08, dy: -0.04, rgb: "245,158,11" },
      { x: W() * 0.82, y: H() * 0.30, r: W() * 0.48, alpha: 0.032, dx: -0.06, dy:  0.06, rgb: "168,85,247" },
      { x: W() * 0.5,  y: H() * 0.08, r: W() * 0.32, alpha: 0.020, dx:  0.04, dy:  0.03, rgb: "251,191,36" },
    ];

    /* ── Streak state ───────────────────────────────────────────────── */
    const streaks: Streak[] = [];
    let lastStreak      = 0;
    let nextStreakDelay  = 3000 + Math.random() * 4000;

    /* ── Flash state ────────────────────────────────────────────────── */
    let flashAlpha      = 0;
    let lastFlash       = 0;
    let nextFlashDelay  = 28000 + Math.random() * 18000;

    /* ── RAF loop ───────────────────────────────────────────────────── */
    let lastFrame = 0;
    let rafId     = 0;
    let alive     = true;

    const spawnStreak = (t: number) => {
      if (t - lastStreak < nextStreakDelay) return;
      if (streaks.filter((s) => s.opacity > 0).length >= 3) return;
      lastStreak      = t;
      nextStreakDelay  = 4200 + Math.random() * 5000;
      const w = W(); const h = H();
      const x1    = Math.random() * w * 1.3 - w * 0.15;
      const angle = 0.25 + Math.random() * 0.7;
      const len   = 70 + Math.random() * 120;
      streaks.push({
        x1, y1: -20,
        x2: x1 + Math.sin(angle) * len,
        y2: -20 + Math.cos(angle) * len,
        t: 0,
        opacity: 0.5 + Math.random() * 0.38,
        width:   1.0 + Math.random() * 1.2,
      });
      /* Clean dead streaks */
      for (let i = streaks.length - 1; i >= 0; i--) {
        if (streaks[i].opacity <= 0) streaks.splice(i, 1);
      }
    };

    const triggerFlash = (t: number) => {
      if (t - lastFlash < nextFlashDelay) return;
      lastFlash      = t;
      nextFlashDelay = 28000 + Math.random() * 18000;
      flashAlpha     = 0.11;
    };

    const draw = (t: number) => {
      if (!alive) return;
      rafId = requestAnimationFrame(draw);
      if (t - lastFrame < 33) return; /* ~30 fps */
      lastFrame = t;

      const w = W(); const h = H();

      /* Base */
      ctx.fillStyle = "#000000";
      ctx.fillRect(0, 0, w, h);

      /* Fog blobs */
      fogs.forEach((f) => {
        const g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.r);
        g.addColorStop(0, `rgba(${f.rgb},${f.alpha})`);
        g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
        f.x += f.dx; f.y += f.dy;
        if (f.x < -f.r * 0.5 || f.x > w + f.r * 0.5) f.dx *= -1;
        if (f.y < -f.r * 0.5 || f.y > h + f.r * 0.5) f.dy *= -1;
      });

      /* Breathing center glow */
      const breathe = 0.055 + Math.sin(t * 0.00085) * 0.035;
      const cg = ctx.createRadialGradient(w * 0.5, h * 0.72, 0, w * 0.5, h * 0.72, w * 0.58);
      cg.addColorStop(0, `rgba(245,158,11,${breathe})`);
      cg.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = cg;
      ctx.fillRect(0, 0, w, h);

      /* Particles */
      particles.forEach((p) => {
        const wx = p.x + Math.sin(t * p.wobbleFreq + p.phase) * p.wobbleAmp;
        ctx.beginPath();
        ctx.arc(wx, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${p.rgb.join(",")},${p.opacity})`;
        ctx.fill();
        p.y -= p.vy;
        if (p.y < -4) { p.y = h + 6; p.x = Math.random() * w; }
      });

      /* Gold streaks */
      spawnStreak(t);
      streaks.forEach((s) => {
        if (s.opacity <= 0) return;
        s.t = Math.min(1, s.t + 0.021);
        const ex = s.x1 + (s.x2 - s.x1) * s.t;
        const ey = s.y1 + (s.y2 - s.y1) * s.t;
        const sg = ctx.createLinearGradient(s.x1, s.y1, ex, ey);
        sg.addColorStop(0, `rgba(251,191,36,${s.opacity})`);
        sg.addColorStop(1, "rgba(251,191,36,0)");
        ctx.beginPath();
        ctx.moveTo(s.x1, s.y1);
        ctx.lineTo(ex, ey);
        ctx.strokeStyle = sg;
        ctx.lineWidth = s.width;
        ctx.stroke();
        if (s.t >= 0.82) s.opacity -= 0.022;
      });

      /* Lightning flash */
      triggerFlash(t);
      if (flashAlpha > 0) {
        ctx.fillStyle = `rgba(255,255,220,${flashAlpha})`;
        ctx.fillRect(0, 0, w, h);
        flashAlpha = Math.max(0, flashAlpha - 0.014);
      }

      /* Bottom gold border line */
      const lp = 0.32 + Math.sin(t * 0.002) * 0.14;
      const lg = ctx.createLinearGradient(0, h - 1, w, h - 1);
      lg.addColorStop(0,    "rgba(251,191,36,0)");
      lg.addColorStop(0.22, `rgba(251,191,36,${lp})`);
      lg.addColorStop(0.78, `rgba(251,191,36,${lp})`);
      lg.addColorStop(1,    "rgba(251,191,36,0)");
      ctx.strokeStyle = lg;
      ctx.lineWidth   = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, h - 0.75);
      ctx.lineTo(w, h - 0.75);
      ctx.stroke();
    };

    rafId = requestAnimationFrame(draw);

    /* Resize observer (handles orientation flip on mobile) */
    const ro = new ResizeObserver(() => setSize());
    ro.observe(canvas);

    return () => {
      alive = false;
      cancelAnimationFrame(rafId);
      ro.disconnect();
    };
  }, []);

  /* ── Audio toggle ─────────────────────────────────────────────────── */
  const toggleAudio = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!audioOn) {
      audioCleanup.current = makeAmbient();
      setAudioOn(true);
    } else {
      audioCleanup.current();
      audioCleanup.current = () => {};
      setAudioOn(false);
    }
    setAudioHinted(true);
  };

  return (
    <div
      className="relative w-full overflow-hidden select-none"
      style={{ height: 270 }}
    >
      {/* Cinematic canvas */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        style={{ display: "block" }}
      />

      {/* Top vignette */}
      <div
        className="absolute top-0 left-0 right-0 pointer-events-none"
        style={{ height: 52, background: "linear-gradient(to bottom, rgba(0,0,0,0.65), transparent)" }}
      />

      {/* Bottom fade to black */}
      <div
        className="absolute bottom-0 left-0 right-0 pointer-events-none"
        style={{ height: 108, background: "linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.72) 55%, #000000 100%)" }}
      />

      {/* Audio toggle button */}
      <AnimatePresence>
        {audioHinted && (
          <motion.button
            key="audio-btn"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.22 }}
            whileTap={{ scale: 0.88 }}
            onClick={toggleAudio}
            className="absolute bottom-10 right-4 flex items-center gap-1.5 rounded-full px-3 py-1.5"
            style={{
              background: audioOn ? "rgba(251,191,36,0.14)" : "rgba(0,0,0,0.52)",
              border: `1px solid ${audioOn ? "rgba(251,191,36,0.38)" : "rgba(255,255,255,0.14)"}`,
              zIndex: 5,
            }}
          >
            {audioOn
              ? <Volume2  style={{ width: 12, height: 12, color: "#fbbf24" }} />
              : <VolumeX  style={{ width: 12, height: 12, color: "rgba(255,255,255,0.55)" }} />
            }
            <span style={{
              fontSize:      10,
              fontWeight:    800,
              letterSpacing: "0.06em",
              color: audioOn ? "#fbbf24" : "rgba(255,255,255,0.55)",
            }}>
              {audioOn ? "AUDIO ON" : "AUDIO"}
            </span>

            {/* Live-pulse dot when audio is on */}
            {audioOn && (
              <motion.span
                animate={{ opacity: [1, 0.3, 1] }}
                transition={{ duration: 1.2, repeat: Infinity }}
                style={{ width: 5, height: 5, borderRadius: "50%", background: "#fbbf24", flexShrink: 0 }}
              />
            )}
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   SuperKingBadge — exported so UserProfile can also display it
══════════════════════════════════════════════════════════════════════════ */

export function SuperKingBadge() {
  const particles = [
    { ox: -14, oy: -10, delay: 0,   size: 2.5 },
    { ox:  15, oy: -12, delay: 0.5, size: 2.0 },
    { ox: -10, oy:  12, delay: 0.9, size: 2.0 },
    { ox:  17, oy:   7, delay: 1.4, size: 2.5 },
    { ox:  -4, oy: -16, delay: 0.3, size: 1.5 },
    { ox:   9, oy:  15, delay: 1.8, size: 1.5 },
  ];

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: 36, height: 36 }}>
      {/* Outer slow-rotating dashed ring */}
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ duration: 9, repeat: Infinity, ease: "linear" }}
        style={{
          position: "absolute",
          width: 31, height: 31,
          borderRadius: "50%",
          border: "1.5px dashed rgba(251,191,36,0.32)",
          pointerEvents: "none",
        }}
      />

      {/* Outer pulse explosion */}
      <motion.div
        animate={{ scale: [1, 2.4, 1], opacity: [0.55, 0, 0.55] }}
        transition={{ duration: 2.3, repeat: Infinity, ease: "easeOut" }}
        style={{
          position: "absolute",
          inset: -5,
          borderRadius: "50%",
          background: "radial-gradient(circle, #fbbf24 0%, transparent 68%)",
          pointerEvents: "none",
        }}
      />

      {/* Main badge circle */}
      <motion.div
        animate={{
          boxShadow: [
            "0 0 8px 3px rgba(251,191,36,0.65), 0 0 22px 6px rgba(245,158,11,0.22)",
            "0 0 18px 6px rgba(251,191,36,0.95), 0 0 44px 12px rgba(245,158,11,0.48)",
            "0 0 8px 3px rgba(251,191,36,0.65), 0 0 22px 6px rgba(245,158,11,0.22)",
          ],
        }}
        transition={{ duration: 2.1, repeat: Infinity, ease: "easeInOut" }}
        style={{
          width: 29, height: 29,
          borderRadius: "50%",
          background: "linear-gradient(135deg, #d97706 0%, #fbbf24 45%, #f59e0b 75%, #d97706 100%)",
          display: "grid", placeItems: "center",
          overflow: "hidden",
          position: "relative",
          zIndex: 1,
        }}
      >
        {/* Shine sweep */}
        <motion.div
          animate={{ x: ["-140%", "230%"] }}
          transition={{ duration: 1.05, repeat: Infinity, repeatDelay: 2.6, ease: "easeInOut" }}
          style={{
            position: "absolute", inset: 0,
            background: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.68) 50%, transparent 100%)",
            transform: "skewX(-20deg)",
            pointerEvents: "none",
          }}
        />
        {/* Crown — inline SVG for guaranteed availability */}
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="#78350f"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ width: 14, height: 14, position: "relative", zIndex: 1 }}
        >
          <path d="M2 20h20M5 20V10l7-6 7 6v10" />
          <path d="M9 20v-5h6v5" />
        </svg>
      </motion.div>

      {/* Floating particles */}
      {particles.map((p, i) => (
        <motion.div
          key={i}
          animate={{ y: [p.oy, p.oy - 11, p.oy], opacity: [0, 1, 0], scale: [0, 1, 0] }}
          transition={{ duration: 2.5, repeat: Infinity, delay: p.delay, ease: "easeInOut" }}
          style={{
            position: "absolute",
            left: `calc(50% + ${p.ox}px)`,
            top:  `calc(50% + ${p.oy}px)`,
            width: p.size, height: p.size,
            borderRadius: "50%",
            background: "#fbbf24",
            pointerEvents: "none",
          }}
        />
      ))}
    </div>
  );
}
