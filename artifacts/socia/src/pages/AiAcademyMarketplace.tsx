/**
 * AiAcademyMarketplace.tsx — AI Academy Marketplace
 *
 * Four category cards each show a looping background video.
 * Videos autoplay, are muted, loop forever and never pause.
 */
import { useState } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import {
  Box, Clapperboard, Drama, Megaphone,
  Image as ImageIcon, Video as VideoIcon,
  Paperclip, Mic, ArrowUp,
} from "lucide-react";
import { useLoginGate } from "@/lib/useLoginGate";
import sociaMark from "@assets/splash2/mark.png";

/* ─────────────────────────────────────────────────────────────────────────
   Design tokens
   ───────────────────────────────────────────────────────────────────────── */
const BG         = "#090909";
const CARD_BG    = "#111111";
const BORDER     = "rgba(255,255,255,0.08)";
const PURPLE     = "#8A4DFF";
const GLOW       = "#A855F7";
const TEXT       = "#FFFFFF";
const TEXT_MUTED = "#A1A1AA";

/* ─────────────────────────────────────────────────────────────────────────
   Data types
   ───────────────────────────────────────────────────────────────────────── */
interface CategoryDef {
  key: string; title: string; subtitle: string;
  video: string; icon: typeof Box; serverCategory: string;
}

const CATEGORIES: CategoryDef[] = [
  {
    key:            "product",
    title:          "AI Product",
    subtitle:       "Generate stunning AI product visuals.",
    video:          "/videos/ai-product.mp4",
    icon:           Box,
    serverCategory: "Luxury Product Ads",
  },
  {
    key:            "movie",
    title:          "Movie",
    subtitle:       "Cinematic scenes, storyboards & more.",
    video:          "/videos/movie.mp4",
    icon:           Clapperboard,
    serverCategory: "Cinematic Film",
  },
  {
    key:            "anime",
    title:          "Anime",
    subtitle:       "Characters, scenes, worlds & story prompts.",
    video:          "/videos/anime.mp4",
    icon:           Drama,
    serverCategory: "Anime Style",
  },
  {
    key:            "advertising",
    title:          "Advertising",
    subtitle:       "High-converting ads, product promos & more.",
    video:          "/videos/advertising.mp4",
    icon:           Megaphone,
    serverCategory: "Viral TikTok Ads",
  },
];

const QUICK_ACTIONS = [
  { key: "prompt-image",    title: "Prompt to Image",  subtitle: "Describe it. We create it.",    icon: ImageIcon, path: "/create/prompt-image"  },
  { key: "video-generator", title: "Video Generator",   subtitle: "Turn your ideas into videos.", icon: VideoIcon, path: "/create/prompt-video"   },
] as const;

/* ─────────────────────────────────────────────────────────────────────────
   Shared CSS
   ───────────────────────────────────────────────────────────────────────── */
function MarketplaceStyles() {
  return (
    <style>{`
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

/* ─────────────────────────────────────────────────────────────────────────
   VideoCard — card shell with a looping background video
   ───────────────────────────────────────────────────────────────────────── */
function VideoCard({
  cat, index, onTap,
}: { cat: CategoryDef; index: number; onTap: () => void }) {
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
      {/* Card shell — overflow:hidden clips the video + overlays */}
      <div
        style={{
          position: "relative",
          width: "100%",
          aspectRatio: "1 / 0.87",
          borderRadius: 18,
          overflow: "hidden",
          boxShadow:
            "0 10px 28px -10px rgba(138,77,255,0.30)," +
            "0 1px 0 rgba(255,255,255,0.04) inset",
          border: "1px solid rgba(255,255,255,0.09)",
          background: "#0a0a0a",
        }}
      >
        {/* ── Looping background video ── */}
        <video
          src={cat.video}
          autoPlay
          muted
          loop
          playsInline
          disablePictureInPicture
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            display: "block",
            pointerEvents: "none",
          }}
        />

        {/* ── Bottom vignette for text legibility ── */}
        <div
          style={{
            position: "absolute", inset: 0, pointerEvents: "none",
            background:
              "linear-gradient(180deg," +
              " rgba(0,0,0,0) 26%," +
              " rgba(0,0,0,0.75) 100%)",
          }}
        />

        {/* ── Top edge fade for depth ── */}
        <div
          style={{
            position: "absolute", inset: 0, pointerEvents: "none",
            background:
              "linear-gradient(180deg," +
              " rgba(0,0,0,0.25) 0%," +
              " rgba(0,0,0,0) 18%)",
          }}
        />

        {/* ── Icon badge ── */}
        <div
          style={{
            position: "absolute", top: 9, left: 9,
            width: 30, height: 30, borderRadius: "50%",
            background: "rgba(12,8,22,0.78)",
            border: "1px solid rgba(255,255,255,0.14)",
            display: "grid", placeItems: "center",
            boxShadow: "0 0 14px rgba(138,77,255,0.40)",
            backdropFilter: "blur(6px)",
            WebkitBackdropFilter: "blur(6px)",
          }}
        >
          <Icon style={{ width: 14, height: 14, color: PURPLE }} strokeWidth={2.1} />
        </div>

        {/* ── Title overlay ── */}
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
              textShadow: "0 1px 8px rgba(0,0,0,0.95)",
            }}
          >
            {cat.title}
          </h3>
        </div>
      </div>
    </motion.button>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   Quick action card
   ───────────────────────────────────────────────────────────────────────── */
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

/* ─────────────────────────────────────────────────────────────────────────
   Socia GPT card
   ───────────────────────────────────────────────────────────────────────── */
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

/* ─────────────────────────────────────────────────────────────────────────
   Main page
   ───────────────────────────────────────────────────────────────────────── */
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
      style={{
        background: BG,
        height: "100%",
        overflowY: "auto",
        overscrollBehavior: "contain",
        WebkitOverflowScrolling: "touch",
        paddingBottom: "calc(60px + env(safe-area-inset-bottom))",
      }}
    >
      <MarketplaceStyles />

      {/* Title */}
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

      {/* 2×2 video card grid */}
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
          <VideoCard key={cat.key} cat={cat} index={i} onTap={() => openCategory(cat)} />
        ))}
      </div>

      {/* Quick actions */}
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

      {/* Socia GPT */}
      <div style={{ marginTop: 10, padding: "0 12px" }}>
        <SociaGptCard onSubmit={openSociaGpt} />
      </div>
    </div>
  );
}
