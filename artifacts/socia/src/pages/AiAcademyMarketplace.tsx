/**
 * AiAcademyMarketplace.tsx — AI Academy Marketplace
 *
 * No-scroll single-screen layout with premium CSS 3D cinemagraph cards.
 * All category cards animate via requestAnimationFrame using only
 * transform + opacity (GPU-friendly). IntersectionObserver pauses
 * off-screen cards automatically for battery efficiency.
 *
 * Routing:
 *   Category cards  → /studio?cat=<serverCategory>
 *   Prompt to Image → /create/prompt-image
 *   Video Generator → /create/prompt-video
 *   Socia GPT       → /socia-gpt
 */
import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import {
  Box, Clapperboard, Drama, Megaphone,
  Image as ImageIcon, Video as VideoIcon,
  Paperclip, Mic, ArrowUp,
} from "lucide-react";
import { useLoginGate } from "@/lib/useLoginGate";
import sociaMark    from "@assets/splash2/mark.png";
import productImg   from "@/assets/marketplace/ai-product.jpg";
import movieImg     from "@/assets/marketplace/movie.jpg";
import animeImg     from "@/assets/marketplace/anime.jpg";
import advertisingImg from "@/assets/marketplace/advertising.jpg";

/* ── Design tokens ─────────────────────────────────────────────────────── */
const BG         = "#090909";
const CARD_BG    = "#111111";
const BORDER     = "rgba(255,255,255,0.08)";
const PURPLE     = "#8A4DFF";
const GLOW       = "#A855F7";
const TEXT       = "#FFFFFF";
const TEXT_MUTED = "#A1A1AA";

/* ── Cinemagraph animation config per card ─────────────────────────────── */
interface CinemaConfig {
  scaleMin: number; scaleMax: number; scalePeriod: number;
  panXAmp: number;  panYAmp: number;  panXPeriod: number; panYPeriod: number;
  rotXAmp: number;  rotYAmp: number;  rotXPeriod: number; rotYPeriod: number;
  lightR: number;   lightG: number;   lightB: number;
  lightAmp: number; lightPeriod: number;
  shinePeriod: number;
}

const CINEMA: Record<string, CinemaConfig> = {
  /** AI Product — luxury lighting, bottle gently breathes, glass reflection moves */
  product: {
    scaleMin: 1.00, scaleMax: 1.09, scalePeriod: 8,
    panXAmp: 3.0,  panYAmp: 2.5,  panXPeriod: 11, panYPeriod: 9,
    rotXAmp: 1.5,  rotYAmp: 2.2,  rotXPeriod: 13, rotYPeriod: 10,
    lightR: 168, lightG: 100, lightB: 255, lightAmp: 0.14, lightPeriod: 5,
    shinePeriod: 7,
  },
  /** Movie — clouds drift, smoke moves, cinematic camera push */
  movie: {
    scaleMin: 1.03, scaleMax: 1.11, scalePeriod: 14,
    panXAmp: 6.0,  panYAmp: 2.0,  panXPeriod: 16, panYPeriod: 20,
    rotXAmp: 0.6,  rotYAmp: 1.2,  rotXPeriod: 18, rotYPeriod: 13,
    lightR: 30,  lightG: 70,  lightB: 160, lightAmp: 0.16, lightPeriod: 8,
    shinePeriod: 11,
  },
  /** Anime — hair sways, petals float, moonlight shifts */
  anime: {
    scaleMin: 1.02, scaleMax: 1.07, scalePeriod: 6,
    panXAmp: 2.5,  panYAmp: 5.0,  panXPeriod: 8,  panYPeriod: 6,
    rotXAmp: 2.2,  rotYAmp: 1.5,  rotXPeriod: 9,  rotYPeriod: 12,
    lightR: 210, lightG: 150, lightB: 255, lightAmp: 0.11, lightPeriod: 4,
    shinePeriod: 6,
  },
  /** Advertising — neon reflections move, road shimmer, environment lighting */
  advertising: {
    scaleMin: 1.02, scaleMax: 1.10, scalePeriod: 10,
    panXAmp: 5.0,  panYAmp: 2.0,  panXPeriod: 12, panYPeriod: 10,
    rotXAmp: 1.0,  rotYAmp: 2.8,  rotXPeriod: 9,  rotYPeriod: 14,
    lightR: 255, lightG: 160, lightB: 80,  lightAmp: 0.11, lightPeriod: 6,
    shinePeriod: 9,
  },
};

/* ── Category / quick-action types ─────────────────────────────────────── */
interface CategoryDef {
  key: string; title: string; subtitle: string;
  image: string; icon: typeof Box; serverCategory: string;
}

const CATEGORIES: CategoryDef[] = [
  { key: "product",     title: "AI Product",  subtitle: "Generate stunning AI product visuals.",               image: productImg,     icon: Box,          serverCategory: "Luxury Product Ads" },
  { key: "movie",       title: "Movie",        subtitle: "Cinematic scenes, storyboards & more.",              image: movieImg,       icon: Clapperboard, serverCategory: "Cinematic Film"      },
  { key: "anime",       title: "Anime",         subtitle: "Characters, scenes, worlds & story prompts.",       image: animeImg,       icon: Drama,        serverCategory: "Anime Style"         },
  { key: "advertising", title: "Advertising",   subtitle: "High-converting ads, product promos & more.",       image: advertisingImg, icon: Megaphone,    serverCategory: "Viral TikTok Ads"   },
];

const QUICK_ACTIONS = [
  { key: "prompt-image",    title: "Prompt to Image",  subtitle: "Describe it. We create it.",    icon: ImageIcon, path: "/create/prompt-image"  },
  { key: "video-generator", title: "Video Generator",   subtitle: "Turn your ideas into videos.", icon: VideoIcon, path: "/create/prompt-video"   },
] as const;

/* ── Shared CSS ─────────────────────────────────────────────────────────── */
function MarketplaceStyles() {
  return (
    <style>{`
      .aam-scroll {
        overflow-y: auto;
        overscroll-behavior: contain;
        -webkit-overflow-scrolling: touch;
        scroll-behavior: smooth;
      }
      @keyframes aam-glow-pulse {
        0%, 100% { opacity: .55; transform: scale(1);    }
        50%       { opacity: .9;  transform: scale(1.06); }
      }
      .aam-glow { animation: aam-glow-pulse 2.6s ease-in-out infinite; }
      @keyframes aam-fade-up {
        from { opacity: 0; transform: translateY(8px); }
        to   { opacity: 1; transform: translateY(0);   }
      }
      .aam-fade-up { animation: aam-fade-up .38s cubic-bezier(.22,.9,.32,1) both; }
    `}</style>
  );
}

/* ── CinemaCard — GPU-accelerated living artwork ────────────────────────
 *
 * The image layer is inset by -12% on all sides so that pan + zoom
 * animations never expose the card edge. Only `transform` and `opacity`
 * are animated — both are compositor-thread properties that run at 60 fps
 * without touching the main thread. IntersectionObserver suspends the
 * rAF loop when the card is scrolled off screen.                        */
function CinemaCard({ cat, index, onTap }: { cat: CategoryDef; index: number; onTap: () => void }) {
  const wrapRef  = useRef<HTMLDivElement>(null);
  const imgRef   = useRef<HTMLDivElement>(null);
  const lightRef = useRef<HTMLDivElement>(null);
  const shineRef = useRef<HTMLDivElement>(null);
  const cfg      = CINEMA[cat.key];
  const TAU      = Math.PI * 2;

  useEffect(() => {
    const wrap  = wrapRef.current;
    const img   = imgRef.current;
    const light = lightRef.current;
    const shine = shineRef.current;
    if (!wrap || !img || !light || !shine || !cfg) return;

    let rafId  = 0;
    let active = false;
    const t0   = performance.now();

    function tick(now: number) {
      if (!active || !img || !light || !shine) return;
      const t = (now - t0) * 0.001; // seconds

      // ── Scale: slow breathing zoom ──────────────────────────────────
      const scale = cfg.scaleMin + (cfg.scaleMax - cfg.scaleMin) *
        (0.5 + 0.5 * Math.sin(TAU * t / cfg.scalePeriod));

      // ── Pan: smooth Lissajous-figure drift ──────────────────────────
      const tx = cfg.panXAmp * Math.sin(TAU * t / cfg.panXPeriod);
      const ty = cfg.panYAmp * Math.cos(TAU * t / cfg.panYPeriod);

      // ── Tilt: subtle 3-D perspective rotation ───────────────────────
      const rx = cfg.rotXAmp * Math.sin(TAU * t / cfg.rotXPeriod);
      const ry = cfg.rotYAmp * Math.cos(TAU * t / cfg.rotYPeriod);

      // Single transform string — GPU composite layer, no layout touches
      img.style.transform =
        `perspective(420px)` +
        ` translate3d(${tx.toFixed(3)}px,${ty.toFixed(3)}px,0)` +
        ` scale(${scale.toFixed(5)})` +
        ` rotateX(${rx.toFixed(3)}deg)` +
        ` rotateY(${ry.toFixed(3)}deg)`;

      // ── Ambient light overlay pulse ──────────────────────────────────
      light.style.opacity = String(
        (0.04 + cfg.lightAmp * (0.5 + 0.5 * Math.sin(TAU * t / cfg.lightPeriod))).toFixed(4),
      );

      // ── Glass-shine slide ────────────────────────────────────────────
      const shineX = -20 + 140 * (0.5 + 0.5 * Math.sin(TAU * t / cfg.shinePeriod));
      shine.style.transform = `translate3d(${shineX.toFixed(2)}%,0,0)`;

      rafId = requestAnimationFrame(tick);
    }

    function start() { if (active) return; active = true;  rafId = requestAnimationFrame(tick); }
    function stop()  {                     active = false; cancelAnimationFrame(rafId); }

    const obs = new IntersectionObserver(
      ([entry]) => { entry.isIntersecting ? start() : stop(); },
      { threshold: 0.05 },
    );
    obs.observe(wrap);
    return () => { stop(); obs.disconnect(); };
  // cfg is a module-level constant — safe to omit from deps
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const Icon = cat.icon;

  return (
    <motion.button
      className="aam-fade-up"
      style={{
        animationDelay: `${index * 55}ms`,
        textAlign: "left",
        display: "block",
        width: "100%",
      }}
      whileTap={{ scale: 0.955 }}
      transition={{ type: "spring", stiffness: 420, damping: 30 }}
      onClick={onTap}
    >
      {/* ── Card shell ── */}
      <div
        ref={wrapRef}
        style={{
          position: "relative",
          width: "100%",
          aspectRatio: "1 / 0.87",
          borderRadius: 18,
          overflow: "hidden",
          boxShadow:
            "0 10px 28px -10px rgba(138,77,255,0.28)," +
            "0 1px 0 rgba(255,255,255,0.04) inset",
          border: "1px solid rgba(255,255,255,0.09)",
        }}
      >
        {/* ── Layer 1: artwork (oversized, animated) ── */}
        <div
          ref={imgRef}
          style={{
            position: "absolute",
            inset: "-12%",         /* extra bleed prevents edge exposure */
            willChange: "transform",
            transformOrigin: "center center",
          }}
        >
          <img
            src={cat.image}
            alt={cat.title}
            draggable={false}
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          />
        </div>

        {/* ── Layer 2: bottom vignette for text legibility ── */}
        <div
          style={{
            position: "absolute", inset: 0, pointerEvents: "none",
            background:
              "linear-gradient(180deg, rgba(0,0,0,0) 28%, rgba(0,0,0,0.72) 100%)",
          }}
        />

        {/* ── Layer 3: ambient colour light overlay ── */}
        <div
          ref={lightRef}
          style={{
            position: "absolute", inset: 0, pointerEvents: "none",
            background: `radial-gradient(ellipse at 35% 25%,` +
              ` rgba(${cfg.lightR},${cfg.lightG},${cfg.lightB},0.55) 0%,` +
              ` transparent 65%)`,
            willChange: "opacity",
            opacity: 0.04,
          }}
        />

        {/* ── Layer 4: glass-shine stripe ── */}
        <div
          ref={shineRef}
          style={{
            position: "absolute",
            top: 0, bottom: 0, left: 0,
            width: "28%", pointerEvents: "none",
            background:
              "linear-gradient(108deg," +
              " transparent 0%," +
              " rgba(255,255,255,0.065) 50%," +
              " transparent 100%)",
            willChange: "transform",
          }}
        />

        {/* ── Icon badge (top-left) ── */}
        <div
          style={{
            position: "absolute", top: 9, left: 9,
            width: 30, height: 30, borderRadius: "50%",
            background: "rgba(12,8,22,0.75)",
            border: "1px solid rgba(255,255,255,0.13)",
            display: "grid", placeItems: "center",
            boxShadow: "0 0 14px rgba(138,77,255,0.38)",
            backdropFilter: "blur(6px)",
            WebkitBackdropFilter: "blur(6px)",
          }}
        >
          <Icon style={{ width: 14, height: 14, color: PURPLE }} strokeWidth={2.1} />
        </div>

        {/* ── Title overlay (bottom) ── */}
        <div
          style={{
            position: "absolute", bottom: 0, left: 0, right: 0,
            padding: "8px 11px 11px",
          }}
        >
          <h3
            style={{
              fontSize: 13, fontWeight: 700, color: "#fff",
              margin: 0, lineHeight: 1.2,
              textShadow: "0 1px 8px rgba(0,0,0,0.9)",
            }}
          >
            {cat.title}
          </h3>
        </div>
      </div>
    </motion.button>
  );
}

/* ── Quick action card ──────────────────────────────────────────────────── */
function QuickActionCard({
  title, subtitle, icon: Icon, index, onTap,
}: {
  title: string; subtitle: string; icon: typeof ImageIcon; index: number; onTap: () => void;
}) {
  return (
    <motion.button
      className="aam-fade-up"
      style={{ animationDelay: `${(index + 4) * 55}ms`, textAlign: "left" }}
      whileTap={{ scale: 0.96 }}
      transition={{ type: "spring", stiffness: 420, damping: 30 }}
      onClick={onTap}
    >
      <div
        style={{
          height: 74,
          borderRadius: 16,
          background: CARD_BG,
          border: `1px solid ${BORDER}`,
          padding: "12px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          boxShadow: "0 6px 20px -12px rgba(0,0,0,0.6)",
        }}
      >
        <div
          style={{
            width: 30, height: 30, borderRadius: 9,
            background: `linear-gradient(135deg, ${PURPLE}, #6d28d9)`,
            display: "grid", placeItems: "center",
            boxShadow: "0 3px 12px -3px rgba(138,77,255,0.58)",
          }}
        >
          <Icon style={{ width: 15, height: 15, color: "#fff" }} strokeWidth={2} />
        </div>
        <div>
          <h3 style={{ fontSize: 12.5, fontWeight: 700, color: TEXT, margin: 0, lineHeight: 1.2 }}>
            {title}
          </h3>
          <p style={{ marginTop: 2, fontSize: 10.5, color: TEXT_MUTED, lineHeight: 1.3 }}>
            {subtitle}
          </p>
        </div>
      </div>
    </motion.button>
  );
}

/* ── Socia GPT card ─────────────────────────────────────────────────────── */
function SociaGptCard({ onSubmit }: { onSubmit: (text: string) => void }) {
  const [value, setValue] = useState("");
  const submit = () => { onSubmit(value.trim()); };

  return (
    <div
      className="aam-fade-up"
      style={{
        animationDelay: "380ms",
        borderRadius: 20,
        background: `linear-gradient(160deg, ${CARD_BG} 0%, #0c0710 100%)`,
        border: `1px solid ${BORDER}`,
        padding: "13px 14px",
        position: "relative",
        overflow: "hidden",
        boxShadow: "0 12px 36px -16px rgba(138,77,255,0.35)",
      }}
    >
      {/* Ambient glow blob */}
      <div
        aria-hidden
        className="aam-glow"
        style={{
          position: "absolute", left: -28, top: -28,
          width: 120, height: 120, borderRadius: "50%",
          background: `radial-gradient(circle, ${GLOW}33 0%, transparent 70%)`,
          pointerEvents: "none",
        }}
      />

      {/* Header row */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, position: "relative" }}>
        {/* Logo with glow ring */}
        <div
          style={{
            position: "relative",
            width: 48, height: 48,
            flexShrink: 0,
            display: "grid", placeItems: "center",
          }}
        >
          <div
            className="aam-glow"
            style={{
              position: "absolute", inset: -5, borderRadius: "50%",
              background: `radial-gradient(circle, ${GLOW}55 0%, transparent 72%)`,
              filter: "blur(2px)",
            }}
          />
          <div
            style={{
              position: "relative",
              width: 48, height: 48, borderRadius: "50%",
              border: "1px solid rgba(168,85,247,0.4)",
              display: "grid", placeItems: "center",
              background: "rgba(20,14,32,0.6)",
            }}
          >
            <img src={sociaMark} alt="Socia" style={{ width: 27, height: 27, objectFit: "contain" }} />
          </div>
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <h3 style={{ fontSize: 16, fontWeight: 800, color: TEXT, margin: 0 }}>Socia GPT</h3>
            <span
              style={{
                fontSize: 9.5, fontWeight: 800, letterSpacing: "0.04em",
                color: "#fff", background: PURPLE,
                borderRadius: 999, padding: "2px 7px",
              }}
            >
              PRO
            </span>
          </div>
          <p style={{ marginTop: 2, fontSize: 11.5, color: TEXT_MUTED, lineHeight: 1.4 }}>
            Your all-in-one AI assistant. Ask anything. Generate anything.
          </p>
        </div>
      </div>

      {/* Input row */}
      <div
        style={{
          marginTop: 11,
          display: "flex", alignItems: "center", gap: 6,
          background: "rgba(255,255,255,0.04)",
          border: `1px solid ${BORDER}`,
          borderRadius: 999,
          padding: "5px 5px 5px 14px",
        }}
      >
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
          placeholder="Ask Socia GPT anything..."
          style={{
            flex: 1, minWidth: 0,
            background: "none", border: "none", outline: "none",
            fontSize: 13, color: TEXT, padding: "7px 0",
          }}
        />
        <button
          onClick={submit}
          aria-label="Attach file"
          style={{
            width: 28, height: 28, borderRadius: "50%", flexShrink: 0,
            background: "none", border: "none", cursor: "pointer",
            display: "grid", placeItems: "center", color: TEXT_MUTED,
          }}
        >
          <Paperclip style={{ width: 15, height: 15 }} />
        </button>
        <button
          onClick={submit}
          aria-label="Voice input"
          style={{
            width: 28, height: 28, borderRadius: "50%", flexShrink: 0,
            background: "none", border: "none", cursor: "pointer",
            display: "grid", placeItems: "center", color: TEXT_MUTED,
          }}
        >
          <Mic style={{ width: 15, height: 15 }} />
        </button>
        <motion.button
          whileTap={{ scale: 0.88 }}
          onClick={submit}
          aria-label="Send"
          style={{
            width: 32, height: 32, borderRadius: "50%", flexShrink: 0,
            background: `linear-gradient(135deg, ${PURPLE}, #6d28d9)`,
            border: "none", cursor: "pointer",
            display: "grid", placeItems: "center",
            boxShadow: "0 4px 14px -3px rgba(138,77,255,0.7)",
          }}
        >
          <ArrowUp style={{ width: 15, height: 15, color: "#fff" }} strokeWidth={2.4} />
        </motion.button>
      </div>
    </div>
  );
}

/* ── Main page ──────────────────────────────────────────────────────────── */
export default function AiAcademyMarketplace() {
  const [, navigate]     = useLocation();
  const { requireLogin } = useLoginGate();

  const openCategory = (cat: CategoryDef) => {
    navigate(`/studio?cat=${encodeURIComponent(cat.serverCategory)}`);
  };

  const openQuickAction = (path: string, title: string) => {
    if (!requireLogin(title)) return;
    navigate(path);
  };

  const openSociaGpt = (draft: string) => {
    if (!requireLogin("Socia GPT")) return;
    navigate(draft ? `/socia-gpt?q=${encodeURIComponent(draft)}` : "/socia-gpt");
  };

  return (
    <div
      className="aam-scroll h-full"
      style={{
        background: BG,
        WebkitOverflowScrolling: "touch",
        /* enough clearance for bottom nav + safe area */
        paddingBottom: "calc(60px + env(safe-area-inset-bottom, 12px))",
      }}
    >
      <MarketplaceStyles />

      {/* ── Title ── */}
      <div style={{ padding: "12px 14px 0", textAlign: "center" }}>
        <h1
          style={{
            fontSize: 22,
            fontWeight: 800,
            margin: 0,
            lineHeight: 1.15,
            letterSpacing: "-0.01em",
            background: `linear-gradient(135deg, ${PURPLE} 0%, #c4b5fd 55%, #93c5fd 100%)`,
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
          }}
        >
          AI Academy Marketplace
        </h1>
        <p style={{ marginTop: 4, fontSize: 12, color: TEXT_MUTED }}>
          Premium prompt packs &amp; templates for every style.
        </p>
      </div>

      {/* ── Category grid — 2 × 2 cinemagraph cards ── */}
      <div
        style={{
          marginTop: 10,
          padding: "0 12px",
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 10,
        }}
      >
        {CATEGORIES.map((cat, i) => (
          <CinemaCard key={cat.key} cat={cat} index={i} onTap={() => openCategory(cat)} />
        ))}
      </div>

      {/* ── Quick actions ── */}
      <div
        style={{
          marginTop: 10,
          padding: "0 12px",
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 10,
        }}
      >
        {QUICK_ACTIONS.map((qa, i) => (
          <QuickActionCard
            key={qa.key}
            title={qa.title}
            subtitle={qa.subtitle}
            icon={qa.icon}
            index={i}
            onTap={() => openQuickAction(qa.path, qa.title)}
          />
        ))}
      </div>

      {/* ── Socia GPT ── */}
      <div style={{ marginTop: 10, padding: "0 12px" }}>
        <SociaGptCard onSubmit={openSociaGpt} />
      </div>
    </div>
  );
}
