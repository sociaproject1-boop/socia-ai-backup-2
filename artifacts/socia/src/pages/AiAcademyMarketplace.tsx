/**
 * AiAcademyMarketplace.tsx — replaces the old "AI Studio Hub" (CreateHub)
 * behind the center "S" bottom-nav tab.
 *
 * A premium, card-based marketplace for prompt packs / templates, backed
 * by the existing preset catalog (`/api/presets`, categorised server-side
 * in `lib/presets.ts`) and the existing generation routes. No placeholders:
 * every card routes into real, already-wired functionality —
 *   • Category cards  → /studio?cat=<server category>  (AI Preset Studio,
 *     which fetches from /api/presets and generates via
 *     /api/generate-from-preset)
 *   • Prompt to Image → /create/prompt-image (POST /api/generate-image)
 *   • Video Generator → /create/prompt-video (POST /api/generate-video)
 *   • Socia GPT       → /socia-gpt (POST /api/socia-gpt) — the composer
 *     here hands its draft straight to the real chat page via ?q=.
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
import productImg from "@/assets/marketplace/ai-product.jpg";
import movieImg from "@/assets/marketplace/movie.jpg";
import animeImg from "@/assets/marketplace/anime.jpg";
import advertisingImg from "@/assets/marketplace/advertising.jpg";

/* ── Design tokens (per spec) ─────────────────────────────────────────── */
const BG           = "#090909";
const CARD_BG      = "#111111";
const BORDER       = "rgba(255,255,255,0.08)";
const PURPLE       = "#8A4DFF";
const GLOW         = "#A855F7";
const TEXT         = "#FFFFFF";
const TEXT_MUTED   = "#A1A1AA";

/* ── Category grid definition — mapped onto real preset categories ──────
 * `serverCategories` values must match `category` strings returned by
 * GET /api/presets (see api-server/src/lib/presets.ts) so the deep link
 * lands on a pre-filtered, populated Studio view. */
interface CategoryDef {
  key: string;
  title: string;
  subtitle: string;
  image: string;
  icon: typeof Box;
  serverCategory: string;
}

const CATEGORIES: CategoryDef[] = [
  {
    key: "product",
    title: "AI Product",
    subtitle: "Generate stunning AI product visuals.",
    image: productImg,
    icon: Box,
    serverCategory: "Luxury Product Ads",
  },
  {
    key: "movie",
    title: "Movie",
    subtitle: "Cinematic scenes, storyboards & more.",
    image: movieImg,
    icon: Clapperboard,
    serverCategory: "Cinematic Film",
  },
  {
    key: "anime",
    title: "Anime",
    subtitle: "Anime characters, scenes, worlds & story prompts.",
    image: animeImg,
    icon: Drama,
    serverCategory: "Anime Style",
  },
  {
    key: "advertising",
    title: "Advertising",
    subtitle: "High-converting ads, product promos & more.",
    image: advertisingImg,
    icon: Megaphone,
    serverCategory: "Viral TikTok Ads",
  },
];

const QUICK_ACTIONS = [
  {
    key: "prompt-image",
    title: "Prompt to Image",
    subtitle: "Describe it. We create it.",
    icon: ImageIcon,
    path: "/create/prompt-image",
  },
  {
    key: "video-generator",
    title: "Video Generator",
    subtitle: "Turn your ideas into videos.",
    icon: VideoIcon,
    path: "/create/prompt-video",
  },
] as const;

function MarketplaceStyles() {
  return (
    <style>{`
      .aam-scroll{
        overflow-y:auto;
        overscroll-behavior:contain;
        -webkit-overflow-scrolling:touch;
        scroll-behavior:smooth;
      }
      @keyframes aam-glow-pulse{
        0%,100%{ opacity:.55; transform:scale(1); }
        50%{ opacity:.9; transform:scale(1.06); }
      }
      .aam-glow{ animation: aam-glow-pulse 2.6s ease-in-out infinite; }
      @keyframes aam-fade-up{
        from{ opacity:0; transform:translateY(10px); }
        to{ opacity:1; transform:translateY(0); }
      }
      .aam-fade-up{ animation: aam-fade-up .45s cubic-bezier(.22,.9,.32,1) both; }
    `}</style>
  );
}

/* ── Category card ────────────────────────────────────────────────────── */
function CategoryCard({ cat, index, onTap }: { cat: CategoryDef; index: number; onTap: () => void }) {
  const Icon = cat.icon;
  return (
    <motion.button
      className="aam-fade-up"
      style={{ animationDelay: `${index * 60}ms`, textAlign: "left" }}
      whileTap={{ scale: 0.96 }}
      whileHover={{ y: -3 }}
      transition={{ type: "spring", stiffness: 360, damping: 28 }}
      onClick={onTap}
    >
      <div
        style={{
          borderRadius: 20,
          overflow: "hidden",
          background: CARD_BG,
          border: `1px solid ${BORDER}`,
          boxShadow: `0 10px 30px -12px rgba(138,77,255,0.22), 0 1px 0 rgba(255,255,255,0.02)`,
          backdropFilter: "blur(10px)",
          WebkitBackdropFilter: "blur(10px)",
        }}
      >
        {/* Preview image */}
        <div style={{ position: "relative", width: "100%", aspectRatio: "1 / 0.92" }}>
          <img
            src={cat.image}
            alt={cat.title}
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          />
          <div
            style={{
              position: "absolute", inset: 0,
              background: "linear-gradient(180deg, rgba(0,0,0,0) 45%, rgba(9,9,9,0.55) 100%)",
            }}
          />
          {/* Purple circular icon */}
          <div
            style={{
              position: "absolute", top: 10, left: 10,
              width: 34, height: 34, borderRadius: "50%",
              background: "rgba(20,14,32,0.72)",
              border: `1px solid ${BORDER}`,
              display: "grid", placeItems: "center",
              boxShadow: `0 0 16px rgba(138,77,255,0.45)`,
              backdropFilter: "blur(6px)",
            }}
          >
            <Icon style={{ width: 16, height: 16, color: PURPLE }} strokeWidth={2} />
          </div>
        </div>

        {/* Text */}
        <div style={{ padding: "12px 13px 14px" }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: TEXT, lineHeight: 1.2, margin: 0 }}>
            {cat.title}
          </h3>
          <p style={{ marginTop: 4, fontSize: 12, lineHeight: 1.4, color: TEXT_MUTED }}>
            {cat.subtitle}
          </p>
        </div>
      </div>
    </motion.button>
  );
}

/* ── Quick action card ────────────────────────────────────────────────── */
function QuickActionCard({
  title, subtitle, icon: Icon, index, onTap,
}: {
  title: string; subtitle: string; icon: typeof ImageIcon; index: number; onTap: () => void;
}) {
  return (
    <motion.button
      className="aam-fade-up"
      style={{ animationDelay: `${(index + 4) * 60}ms`, textAlign: "left" }}
      whileTap={{ scale: 0.96 }}
      whileHover={{ y: -2 }}
      transition={{ type: "spring", stiffness: 360, damping: 28 }}
      onClick={onTap}
    >
      <div
        style={{
          height: 92,
          borderRadius: 18,
          background: CARD_BG,
          border: `1px solid ${BORDER}`,
          padding: "14px 12px",
          display: "flex",
          flexDirection: "column",
          gap: 10,
          boxShadow: "0 8px 22px -14px rgba(0,0,0,0.6)",
        }}
      >
        <div
          style={{
            width: 34, height: 34, borderRadius: 10,
            background: `linear-gradient(135deg, ${PURPLE}, #6d28d9)`,
            display: "grid", placeItems: "center",
            boxShadow: `0 4px 14px -4px rgba(138,77,255,0.6)`,
          }}
        >
          <Icon style={{ width: 17, height: 17, color: "#fff" }} strokeWidth={2} />
        </div>
        <div>
          <h3 style={{ fontSize: 13.5, fontWeight: 700, color: TEXT, margin: 0, lineHeight: 1.2 }}>
            {title}
          </h3>
          <p style={{ marginTop: 2, fontSize: 11, color: TEXT_MUTED, lineHeight: 1.35 }}>
            {subtitle}
          </p>
        </div>
      </div>
    </motion.button>
  );
}

/* ── Socia GPT hero card ──────────────────────────────────────────────── */
function SociaGptCard({ onSubmit }: { onSubmit: (text: string) => void }) {
  const [value, setValue] = useState("");

  const submit = () => {
    onSubmit(value.trim());
  };

  return (
    <div
      className="aam-fade-up"
      style={{
        animationDelay: "420ms",
        borderRadius: 22,
        background: `linear-gradient(160deg, ${CARD_BG} 0%, #0c0710 100%)`,
        border: `1px solid ${BORDER}`,
        padding: 16,
        position: "relative",
        overflow: "hidden",
        boxShadow: `0 14px 40px -18px rgba(138,77,255,0.35)`,
      }}
    >
      {/* Ambient glow */}
      <div
        aria-hidden
        className="aam-glow"
        style={{
          position: "absolute", left: -30, top: -30,
          width: 140, height: 140, borderRadius: "50%",
          background: `radial-gradient(circle, ${GLOW}33 0%, transparent 70%)`,
          pointerEvents: "none",
        }}
      />

      <div style={{ display: "flex", alignItems: "center", gap: 14, position: "relative" }}>
        {/* Glowing logo */}
        <div
          style={{
            position: "relative", width: 56, height: 56, flexShrink: 0,
            borderRadius: "50%", display: "grid", placeItems: "center",
          }}
        >
          <div
            className="aam-glow"
            style={{
              position: "absolute", inset: -6, borderRadius: "50%",
              background: `radial-gradient(circle, ${GLOW}55 0%, transparent 72%)`,
              filter: "blur(2px)",
            }}
          />
          <div
            style={{
              position: "relative", width: 56, height: 56, borderRadius: "50%",
              border: `1px solid rgba(168,85,247,0.4)`,
              display: "grid", placeItems: "center",
              background: "rgba(20,14,32,0.6)",
            }}
          >
            <img src={sociaMark} alt="Socia" style={{ width: 32, height: 32, objectFit: "contain" }} />
          </div>
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <h3 style={{ fontSize: 17, fontWeight: 800, color: TEXT, margin: 0 }}>Socia GPT</h3>
            <span
              style={{
                fontSize: 10, fontWeight: 800, letterSpacing: "0.04em",
                color: "#fff", background: PURPLE,
                borderRadius: 999, padding: "2px 8px",
              }}
            >
              PRO
            </span>
          </div>
          <p style={{ marginTop: 3, fontSize: 12.5, color: TEXT_MUTED, lineHeight: 1.4 }}>
            Your all-in-one AI assistant.<br />Ask anything. Generate anything.
          </p>
        </div>
      </div>

      {/* Input row */}
      <div
        style={{
          marginTop: 14,
          display: "flex", alignItems: "center", gap: 8,
          background: "rgba(255,255,255,0.04)",
          border: `1px solid ${BORDER}`,
          borderRadius: 999,
          padding: "6px 6px 6px 16px",
        }}
      >
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
          placeholder="Ask Socia GPT anything..."
          style={{
            flex: 1, minWidth: 0, background: "none", border: "none", outline: "none",
            fontSize: 13.5, color: TEXT, padding: "8px 0",
          }}
        />
        <button
          onClick={submit}
          aria-label="Attach file"
          style={{
            width: 30, height: 30, borderRadius: "50%", flexShrink: 0,
            background: "none", border: "none", cursor: "pointer",
            display: "grid", placeItems: "center", color: TEXT_MUTED,
          }}
        >
          <Paperclip style={{ width: 16, height: 16 }} />
        </button>
        <button
          onClick={submit}
          aria-label="Voice input"
          style={{
            width: 30, height: 30, borderRadius: "50%", flexShrink: 0,
            background: "none", border: "none", cursor: "pointer",
            display: "grid", placeItems: "center", color: TEXT_MUTED,
          }}
        >
          <Mic style={{ width: 16, height: 16 }} />
        </button>
        <motion.button
          whileTap={{ scale: 0.88 }}
          onClick={submit}
          aria-label="Send"
          style={{
            width: 34, height: 34, borderRadius: "50%", flexShrink: 0,
            background: `linear-gradient(135deg, ${PURPLE}, #6d28d9)`,
            border: "none", cursor: "pointer",
            display: "grid", placeItems: "center",
            boxShadow: `0 4px 14px -3px rgba(138,77,255,0.7)`,
          }}
        >
          <ArrowUp style={{ width: 16, height: 16, color: "#fff" }} strokeWidth={2.4} />
        </motion.button>
      </div>
    </div>
  );
}

/* ── Main page ────────────────────────────────────────────────────────── */
export default function AiAcademyMarketplace() {
  const [, navigate] = useLocation();
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
      className="aam-scroll h-full pb-28"
      style={{ background: BG, WebkitOverflowScrolling: "touch" }}
    >
      <MarketplaceStyles />

      <div style={{ padding: "22px 16px 4px", textAlign: "center" }}>
        <h1
          style={{
            fontSize: 26,
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
        <p style={{ marginTop: 6, fontSize: 13, color: TEXT_MUTED }}>
          Premium prompt packs &amp; templates for every style.
        </p>
      </div>

      {/* Category grid */}
      <div
        style={{
          marginTop: 16,
          padding: "0 16px",
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 12,
        }}
      >
        {CATEGORIES.map((cat, i) => (
          <CategoryCard key={cat.key} cat={cat} index={i} onTap={() => openCategory(cat)} />
        ))}
      </div>

      {/* Quick actions */}
      <div
        style={{
          marginTop: 12,
          padding: "0 16px",
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 12,
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
      <div style={{ marginTop: 12, padding: "0 16px" }}>
        <SociaGptCard onSubmit={openSociaGpt} />
      </div>
    </div>
  );
}
