import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  ImageIcon,
  Film,
  History,
  Search,
  X,
  Heart,
  Sparkles,
  Zap,
  Camera,
  ChevronRight,
  Flame,
  Star,
  Crown,
  Bolt,
} from "lucide-react";
import {
  usePresets,
  useCreationsStore,
  useFavoritesStore,
  type ClientPreset,
} from "@/lib/presetClient";

/* ── Real cinematic cover photography ─────────────────────────────────────────
   Locally bundled AI-generated cinematic product photography. Resolved
   per-preset via keyword match on id / title / category, with a graceful
   gradient fallback so older presets without a curated cover still look
   premium. Vite imports below get hashed + lazy-loaded by the browser. */
import coverTiktokWhiteBg   from "@assets/preset-covers/tiktok-white-bg.png";
import coverLuxuryProduct   from "@assets/preset-covers/luxury-product.png";
import coverBeauty          from "@assets/preset-covers/beauty-influencer.png";
import coverFashion         from "@assets/preset-covers/fashion-editorial.png";
import coverFloating        from "@assets/preset-covers/floating-product.png";
import coverFood            from "@assets/preset-covers/food-commercial.png";
import coverJewelry         from "@assets/preset-covers/jewelry-macro.png";
import coverAppleCommercial from "@assets/preset-covers/apple-commercial.png";
import coverNeonCyberpunk   from "@assets/preset-covers/neon-cyberpunk.png";
import coverFlatLay         from "@assets/preset-covers/flat-lay.png";

interface CoverRule {
  match: (p: ClientPreset) => boolean;
  src: string;
}
const COVER_RULES: CoverRule[] = [
  { match: (p) => /tiktok|white.?bg|white background|shopping.?bag/i.test(p.id + " " + p.title), src: coverTiktokWhiteBg },
  { match: (p) => /flat.?lay|korean|aesthetic/i.test(p.id + " " + p.title + " " + p.category), src: coverFlatLay },
  { match: (p) => /float|levit|hover/i.test(p.id + " " + p.title), src: coverFloating },
  { match: (p) => /black.?marble|marble|dark.?luxury|luxury.?perfume|perfume/i.test(p.id + " " + p.title + " " + p.category), src: coverLuxuryProduct },
  { match: (p) => /hand|skincare|hand.?model|beauty.?influencer|beauty/i.test(p.id + " " + p.title + " " + p.category), src: coverBeauty },
  { match: (p) => /fashion|editorial|streetwear/i.test(p.id + " " + p.title + " " + p.category), src: coverFashion },
  { match: (p) => /food|drink|coffee|cuisine|meal/i.test(p.id + " " + p.title + " " + p.category), src: coverFood },
  { match: (p) => /jewel|ring|diamond|watch|timepiece/i.test(p.id + " " + p.title + " " + p.category), src: coverJewelry },
  { match: (p) => /apple|minimal|white|clean|ecommerce/i.test(p.id + " " + p.title + " " + p.category), src: coverAppleCommercial },
  { match: (p) => /neon|cyber|cyberpunk|anime|night/i.test(p.id + " " + p.title + " " + p.category), src: coverNeonCyberpunk },
  { match: (p) => /luxury|premium|gold|diamond/i.test(p.id + " " + p.title + " " + p.category), src: coverLuxuryProduct },
];
function resolveCover(p: ClientPreset): string | null {
  for (const r of COVER_RULES) if (r.match(p)) return r.src;
  return null;
}

/* ── Quality badges — icon based, no emojis ──────────────────────────────── */
const BADGE_STYLES: Record<
  string,
  { bg: string; text: string; label: string; Icon: typeof Flame }
> = {
  Hot:        { bg: "rgba(239,68,68,0.92)",  text: "#fff", label: "Hot",      Icon: Flame },
  New:        { bg: "rgba(34,197,94,0.92)",  text: "#fff", label: "New",      Icon: Sparkles },
  "Top Pick": { bg: "rgba(168,85,247,0.92)", text: "#fff", label: "Top Pick", Icon: Star },
  Pro:        { bg: "rgba(251,191,36,0.95)", text: "#000", label: "Pro",      Icon: Crown },
  Quick:      { bg: "rgba(34,211,238,0.92)", text: "#000", label: "Quick",    Icon: Bolt },
};

/* ── Subtle ambient orbs (kept for cinematic depth) ──────────────────────── */
function AmbientGlow() {
  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden">
      <motion.div
        animate={{ x: [0, 30, 0], y: [0, -20, 0] }}
        transition={{ duration: 22, repeat: Infinity, ease: "easeInOut" }}
        className="absolute rounded-full blur-[120px]"
        style={{ left: "-15%", top: "-10%", width: "55vw", height: "55vw",
          background: "radial-gradient(circle, rgba(176,38,255,0.18) 0%, transparent 65%)" }}
      />
      <motion.div
        animate={{ x: [0, -20, 0], y: [0, 25, 0] }}
        transition={{ duration: 26, repeat: Infinity, ease: "easeInOut", delay: 4 }}
        className="absolute rounded-full blur-[140px]"
        style={{ right: "-15%", top: "30%", width: "50vw", height: "50vw",
          background: "radial-gradient(circle, rgba(236,72,153,0.10) 0%, transparent 65%)" }}
      />
    </div>
  );
}

/* ── Shimmer skeleton card ───────────────────────────────────────────────── */
function ShimmerCard({ index }: { index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: index * 0.05 }}
      className="overflow-hidden rounded-2xl"
      style={{ border: "1px solid rgba(255,255,255,0.06)" }}
    >
      <div className="aspect-[3/4] animate-pulse"
        style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.04), rgba(255,255,255,0.08))" }} />
      <div className="space-y-2 p-2.5">
        <div className="h-3 w-3/4 animate-pulse rounded-full bg-white/10" />
        <div className="h-2 w-1/2 animate-pulse rounded-full bg-white/5" />
      </div>
    </motion.div>
  );
}

/* ── Badge chip — icon + label ───────────────────────────────────────────── */
function BadgeChip({ badge, absolute = true }: { badge: string; absolute?: boolean }) {
  const s = BADGE_STYLES[badge];
  if (!s) return null;
  const Icon = s.Icon;
  return (
    <div
      className={`${absolute ? "absolute right-2 top-2 z-20" : ""} inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-bold tracking-wide`}
      style={{ background: s.bg, color: s.text, backdropFilter: "blur(8px)" }}
    >
      <Icon className="h-2.5 w-2.5" />
      {s.label}
    </div>
  );
}

/* ── Shared preset card design tokens ────────────────────────────────────────
   Single source of truth for spacing + typography across every preset card,
   so titles, categories, descriptions, badges, and tags can never collide
   regardless of category, screen size, or content length. */
const CARD_TYPO = {
  title:       "text-[13.5px] font-bold leading-[1.25] tracking-[-0.005em] text-white",
  category:    "text-[9px] font-semibold uppercase tracking-[0.14em] text-white/45",
  description: "text-[11px] leading-[1.5] text-white/55",
  tag:         "text-[9px] font-medium text-white/60 leading-none",
} as const;

const CARD_SPACING = {
  /* Body padding (between image and card edges). */
  bodyPad:        "px-3 pt-2.5 pb-3",
  /* Vertical rhythm between body blocks. */
  titleToCategory:"mt-1",
  categoryToDesc: "mt-1.5",
  descToTags:     "mt-2",
  /* Min body height keeps the masonry grid balanced even when titles are
     short and descriptions are missing, so cards don't visually "pop" up. */
  bodyMinH:       "min-h-[112px]",
} as const;

/* ── Cinematic preset card ───────────────────────────────────────────────── */
function PresetCard({
  preset,
  index,
  isFavorite,
  onToggleFav,
  onTap,
}: {
  preset: ClientPreset;
  index: number;
  isFavorite: boolean;
  onToggleFav: () => void;
  onTap: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);
  const needsUpload = preset.requiresUploadedImage || preset.kind === "video";
  const glow = preset.glowColor ?? "rgba(176,38,255,0.45)";
  const cover = resolveCover(preset);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ delay: (index % 8) * 0.04, type: "spring", stiffness: 280, damping: 26 }}
      className="relative"
    >
      {/* Card root is a motion.div with role=button (NOT a <button>) so the
          favorite heart can live inside the image div as a real nested
          <button> without invalid-HTML nesting. Keyboard + click parity
          maintained via onKeyDown. */}
      <motion.div
        role="button"
        tabIndex={0}
        onClick={onTap}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onTap(); }
        }}
        onHoverStart={() => setHovered(true)}
        onHoverEnd={() => setHovered(false)}
        whileTap={{ scale: 0.97 }}
        className="relative flex w-full cursor-pointer flex-col overflow-hidden rounded-2xl text-left outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-400/60"
        style={{
          background: "#0A0A0A",
          border: `1px solid ${hovered ? "rgba(176,38,255,0.45)" : "rgba(255,255,255,0.06)"}`,
          boxShadow: hovered ? `0 18px 50px -22px ${glow}` : "0 1px 0 rgba(255,255,255,0.02) inset",
          transition: "border-color 0.28s, box-shadow 0.28s",
        }}
      >
        {/* ───────── IMAGE AREA — pills + badges only, no text overlay ───────── */}
        <div className="relative aspect-[3/4] w-full overflow-hidden">
          {/* Gradient fallback / loading bed */}
          <div
            className="absolute inset-0"
            style={{ background: `linear-gradient(145deg, ${preset.thumb.from}, ${preset.thumb.to})` }}
          />
          {cover && (
            <motion.img
              src={cover}
              alt=""
              loading="lazy"
              decoding="async"
              draggable={false}
              onLoad={() => setImgLoaded(true)}
              initial={{ opacity: 0, scale: 1.04 }}
              animate={{ opacity: imgLoaded ? 1 : 0, scale: hovered ? 1.08 : 1.02 }}
              transition={{ opacity: { duration: 0.5 }, scale: { type: "spring", stiffness: 140, damping: 22 } }}
              className="absolute inset-0 h-full w-full object-cover"
            />
          )}

          {/* Light bottom vignette (kept for pill legibility — no text under it) */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3"
            style={{ background: "linear-gradient(to top, rgba(0,0,0,0.55) 0%, transparent 100%)" }} />

          {/* Hover neon wash */}
          <motion.div
            animate={{ opacity: hovered ? 0.22 : 0 }}
            transition={{ duration: 0.3 }}
            className="pointer-events-none absolute inset-0"
            style={{ background: `radial-gradient(ellipse at 50% 100%, ${glow} 0%, transparent 65%)` }}
          />

          {/* TOP-LEFT — kind/spec pill (aspect ratio or video duration) */}
          <div className="absolute left-2 top-2 z-10 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium text-white"
            style={{ background: "rgba(10,10,10,0.72)", backdropFilter: "blur(10px)", border: "1px solid rgba(255,255,255,0.08)" }}>
            {preset.kind === "video"
              ? <Film className="h-2.5 w-2.5" />
              : <ImageIcon className="h-2.5 w-2.5" />}
            {preset.kind === "video" ? `${preset.durationSec ?? 5}s` : preset.defaultAspect}
          </div>

          {/* TOP-RIGHT — Quality badge (Hot / New / Pro / Top Pick). Stays in
              its own corner — the favorite heart now lives at BOTTOM-RIGHT so
              they can never collide regardless of stacking context. */}
          {preset.badge && <BadgeChip badge={preset.badge} />}

          {/* BOTTOM-LEFT — Upload-required pill */}
          {needsUpload && (
            <div className="absolute bottom-2 left-2 z-10 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-medium text-white/85"
              style={{ background: "rgba(10,10,10,0.72)", backdropFilter: "blur(10px)", border: "1px solid rgba(255,255,255,0.08)" }}>
              <Camera className="h-2.5 w-2.5" />
              Photo
            </div>
          )}

          {/* BOTTOM-RIGHT — Favorite heart. Now lives inside the image div so
              it's reliably anchored to the image bottom-right corner across
              every screen width and body height. z-20 keeps it above the
              hover CTA wash. */}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onToggleFav(); }}
            onKeyDown={(e) => { e.stopPropagation(); }}
            className="absolute bottom-2 right-2 z-20 grid h-7 w-7 place-items-center rounded-full transition-all active:scale-90"
            style={{
              background: "rgba(10,10,10,0.7)",
              backdropFilter: "blur(10px)",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
            aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
          >
            <Heart className="h-3.5 w-3.5 transition-colors"
              style={{ color: isFavorite ? "#f472b6" : "rgba(255,255,255,0.75)", fill: isFavorite ? "#f472b6" : "none" }} />
          </button>

          {/* Hover CTA — slides up over the IMAGE ONLY so it never covers the
              title / category / description in the body below. */}
          <motion.div
            animate={{ y: hovered ? 0 : "110%" }}
            transition={{ type: "spring", stiffness: 380, damping: 30 }}
            className="pointer-events-none absolute inset-x-0 bottom-0 z-[5] flex items-center justify-center gap-1.5 py-2 text-[11.5px] font-bold text-white"
            style={{ background: "linear-gradient(to top, rgba(176,38,255,0.96) 0%, rgba(176,38,255,0.65) 60%, transparent 100%)" }}
          >
            <Sparkles className="h-3.5 w-3.5" />
            Try Preset
            <ChevronRight className="h-3.5 w-3.5" />
          </motion.div>
        </div>

        {/* ───────── BODY — Title → Category → Description → Tags ─────────
            Breathable vertical rhythm driven by CARD_SPACING tokens. Flex
            column with min-h keeps the masonry grid visually balanced and
            content can never collide because each block is its own row. */}
        <div className={`flex flex-1 flex-col ${CARD_SPACING.bodyPad} ${CARD_SPACING.bodyMinH}`}>
          {/* Title — up to 2 lines so long names like "Fashion Editorial" /
              "Commercial Style" never get truncated mid-word. */}
          <h3 className={`line-clamp-2 break-words ${CARD_TYPO.title}`}>
            {preset.title}
          </h3>

          {/* Category — sits cleanly under the title with proper gap. */}
          {preset.category && (
            <p className={`line-clamp-1 ${CARD_SPACING.titleToCategory} ${CARD_TYPO.category}`}>
              {preset.category}
            </p>
          )}

          {/* Description — 2-line clamp with relaxed leading; never collides
              with tags because they live in their own row below. */}
          {preset.description && (
            <p className={`line-clamp-2 ${CARD_SPACING.categoryToDesc} ${CARD_TYPO.description}`}>
              {preset.description}
            </p>
          )}

          {/* Tags — pushed to the bottom of the body via mt-auto so cards in
              the same row align nicely regardless of description length. */}
          {preset.tags && preset.tags.length > 0 && (
            <div className={`mt-auto flex flex-wrap gap-1 pt-2`}>
              {preset.tags.slice(0, 2).map((tag) => (
                <span key={tag}
                  className={`rounded-full px-1.5 py-1 ${CARD_TYPO.tag}`}
                  style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.06)" }}>
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ── Auto-sliding featured carousel ──────────────────────────────────────── */
function FeaturedCarousel({
  featured,
  onTap,
}: {
  featured: ClientPreset[];
  onTap: (id: string) => void;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const resumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [activeIdx, setActiveIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  const count = featured.length;

  /* Autoplay — advance every 5s, pause on user touch/hover. */
  useEffect(() => {
    if (count < 2 || paused) return;
    const t = setInterval(() => {
      const el = scrollerRef.current;
      if (!el) return;
      const next = (activeIdx + 1) % count;
      el.scrollTo({ left: next * el.clientWidth, behavior: "smooth" });
    }, 5000);
    return () => clearInterval(t);
  }, [activeIdx, count, paused]);

  /* Clear any pending resume timer on unmount to prevent late state updates
     after the carousel is gone (also stops overlapping resume timers from
     repeated touch cycles). */
  useEffect(() => {
    return () => {
      if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
    };
  }, []);

  /* Track active slide via scroll position (works with native swipe). */
  function onScroll() {
    const el = scrollerRef.current;
    if (!el) return;
    const i = Math.round(el.scrollLeft / el.clientWidth);
    if (i !== activeIdx) setActiveIdx(i);
  }

  function handleTouchStart() {
    if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
    setPaused(true);
  }
  function handleTouchEnd() {
    if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
    resumeTimerRef.current = setTimeout(() => setPaused(false), 4000);
  }

  if (count === 0) return null;

  return (
    <div className="mb-5 -mx-4">
      <div
        ref={scrollerRef}
        onScroll={onScroll}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        className="flex snap-x snap-mandatory overflow-x-auto scroll-smooth px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={{ scrollSnapType: "x mandatory" }}
      >
        {featured.map((p) => {
          const cover = resolveCover(p);
          return (
            <div
              key={p.id}
              className="relative w-full shrink-0 snap-center pr-3 last:pr-0"
              style={{ flexBasis: "100%" }}
            >
              <button
                onClick={() => onTap(p.id)}
                className="relative block aspect-[16/9] w-full overflow-hidden rounded-3xl text-left"
                style={{
                  background: `linear-gradient(135deg, ${p.thumb.from}, ${p.thumb.to})`,
                  border: "1px solid rgba(255,255,255,0.07)",
                  boxShadow: "0 24px 60px -28px rgba(176,38,255,0.55)",
                }}
              >
                {/* Cinematic cover */}
                {cover && (
                  <img
                    src={cover}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    draggable={false}
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                )}
                {/* Cinematic gradient — keeps text legible on any image */}
                <div className="absolute inset-0"
                  style={{ background: "linear-gradient(110deg, rgba(0,0,0,0.78) 0%, rgba(0,0,0,0.35) 45%, rgba(0,0,0,0.15) 100%)" }} />
                {/* Bottom shadow band */}
                <div className="absolute inset-x-0 bottom-0 h-1/2"
                  style={{ background: "linear-gradient(to top, rgba(0,0,0,0.85), transparent)" }} />

                {/* Content */}
                <div className="absolute inset-0 flex flex-col justify-between p-4">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold text-white"
                      style={{ background: "rgba(176,38,255,0.85)", backdropFilter: "blur(8px)" }}>
                      <Sparkles className="h-2.5 w-2.5" />
                      Featured
                    </span>
                    {p.badge && <BadgeChip badge={p.badge} absolute={false} />}
                  </div>

                  <div>
                    <p className="mb-1 text-[10px] uppercase tracking-[0.18em] text-white/65">{p.category}</p>
                    <h3 className="font-display text-[22px] font-bold leading-tight text-white drop-shadow-lg">
                      {p.title}
                    </h3>
                    <p className="mt-1 line-clamp-2 max-w-[78%] text-[12px] text-white/75">
                      {p.description}
                    </p>
                    <div className="mt-3 inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[12px] font-semibold text-white"
                      style={{ background: "linear-gradient(135deg, #B026FF, #ec4899)",
                        boxShadow: "0 8px 22px -8px rgba(176,38,255,0.85)" }}>
                      <Sparkles className="h-3.5 w-3.5" />
                      Try Preset
                      <ChevronRight className="h-3.5 w-3.5" />
                    </div>
                  </div>
                </div>
              </button>
            </div>
          );
        })}
      </div>

      {/* Smooth progress bar — replaces tiny clickable dots */}
      {count > 1 && (
        <div className="mt-3 flex items-center gap-1.5 px-4">
          {featured.map((_, i) => (
            <div key={i} className="relative h-[3px] flex-1 overflow-hidden rounded-full"
              style={{ background: "rgba(255,255,255,0.08)" }}>
              <motion.div
                key={`${i}-${activeIdx}-${paused}`}
                initial={{ width: i < activeIdx ? "100%" : "0%" }}
                animate={{ width: i === activeIdx ? (paused ? "55%" : "100%") : i < activeIdx ? "100%" : "0%" }}
                transition={{ duration: i === activeIdx && !paused ? 5 : 0.3, ease: "linear" }}
                className="absolute inset-y-0 left-0"
                style={{ background: "linear-gradient(90deg,#B026FF,#ec4899)" }}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Main page ───────────────────────────────────────────────────────────── */
export default function Studio() {
  const [, navigate] = useLocation();
  const { presets, loading, error } = usePresets();
  const [activeCat, setActiveCat] = useState<string>("All");
  const [search, setSearch] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const favoriteIds = useFavoritesStore((s) => s.ids);
  const toggleFav = useFavoritesStore((s) => s.toggle);
  const recentCount = useCreationsStore((s) => s.items.length);
  const [showFavsOnly, setShowFavsOnly] = useState(false);

  const categories = useMemo(() => {
    if (!presets) return ["All"];
    const seen = new Set<string>();
    const out: string[] = ["All"];
    for (const p of presets) {
      if (!seen.has(p.category)) { seen.add(p.category); out.push(p.category); }
    }
    return out;
  }, [presets]);

  const featured = useMemo(() => presets?.filter((p) => p.featured) ?? [], [presets]);

  const visible = useMemo(() => {
    if (!presets) return [];
    let list = presets;
    if (activeCat !== "All") list = list.filter((p) => p.category === activeCat);
    if (showFavsOnly) list = list.filter((p) => favoriteIds.includes(p.id));
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      list = list.filter(
        (p) =>
          p.title.toLowerCase().includes(q) ||
          p.description.toLowerCase().includes(q) ||
          p.category.toLowerCase().includes(q) ||
          (p.tags ?? []).some((t) => t.toLowerCase().includes(q)),
      );
    }
    return list;
  }, [presets, activeCat, search, showFavsOnly, favoriteIds]);

  const showFeatured =
    activeCat === "All" && !search.trim() && !showFavsOnly && featured.length > 0;

  return (
    <div className="relative min-h-screen pb-28" style={{ background: "#0A0A0A" }}>
      <AmbientGlow />

      <div className="relative z-10 px-4 pt-4">
        {/* Top bar */}
        <div className="mb-4 flex items-center gap-3">
          <button
            onClick={() => navigate("/create")}
            className="grid h-9 w-9 place-items-center rounded-full text-white/80 active:scale-95"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", backdropFilter: "blur(10px)" }}
            aria-label="Back"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="flex-1">
            <h1 className="font-display text-[22px] font-bold leading-none text-white">
              AI <span className="text-gradient">Preset Studio</span>
            </h1>
            <p className="mt-0.5 text-[11.5px] text-white/45">
              {presets ? `${presets.length} cinematic presets · ${categories.length - 1} categories` : "1-click pro-grade looks"}
            </p>
          </div>
          <button
            onClick={() => setShowFavsOnly((v) => !v)}
            className="grid h-9 w-9 place-items-center rounded-full transition-all active:scale-95"
            style={{
              background: showFavsOnly ? "rgba(244,114,182,0.18)" : "rgba(255,255,255,0.04)",
              border: showFavsOnly ? "1px solid rgba(244,114,182,0.45)" : "1px solid rgba(255,255,255,0.07)",
              backdropFilter: "blur(10px)",
            }}
            aria-label="Favorites"
          >
            <Heart className="h-4 w-4"
              style={{ color: showFavsOnly ? "#f472b6" : "rgba(255,255,255,0.7)", fill: showFavsOnly ? "#f472b6" : "none" }} />
          </button>
          <button
            onClick={() => navigate("/studio/creations")}
            className="relative grid h-9 w-9 place-items-center rounded-full text-white/80 active:scale-95"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", backdropFilter: "blur(10px)" }}
            aria-label="My Creations"
          >
            <History className="h-4 w-4" />
            {recentCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-[16px] place-items-center rounded-full bg-fuchsia-500 px-1 text-[9px] font-bold text-white">
                {recentCount > 99 ? "99+" : recentCount}
              </span>
            )}
          </button>
        </div>

        {/* Cinematic search bar */}
        <motion.div
          animate={{
            borderColor: searchFocused ? "rgba(176,38,255,0.55)" : "rgba(255,255,255,0.08)",
            boxShadow: searchFocused
              ? "0 0 0 4px rgba(176,38,255,0.10), 0 18px 40px -22px rgba(176,38,255,0.55)"
              : "0 1px 0 rgba(255,255,255,0.02) inset",
          }}
          transition={{ duration: 0.25 }}
          className="mb-4 flex items-center gap-2.5 rounded-2xl border px-3.5 py-2.5"
          style={{ background: "rgba(255,255,255,0.04)", backdropFilter: "blur(14px)" }}
        >
          <Search className="h-4 w-4 shrink-0"
            style={{ color: searchFocused ? "#B026FF" : "rgba(255,255,255,0.4)", transition: "color 0.2s" }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            placeholder="Search cinematic presets, looks, moods…"
            className="min-w-0 flex-1 bg-transparent text-[13.5px] font-medium text-white placeholder-white/35 outline-none"
          />
          <AnimatePresence>
            {search && (
              <motion.button
                initial={{ opacity: 0, scale: 0.7 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.7 }}
                onClick={() => setSearch("")}
                className="grid h-5 w-5 place-items-center rounded-full bg-white/15 text-white/70"
              >
                <X className="h-3 w-3" />
              </motion.button>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Category tabs — premium pills */}
        <div className="-mx-4 mb-5 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="flex gap-2 whitespace-nowrap pb-1">
            {categories.map((c) => {
              const active = c === activeCat && !showFavsOnly;
              return (
                <motion.button
                  key={c}
                  onClick={() => { setActiveCat(c); setShowFavsOnly(false); }}
                  whileTap={{ scale: 0.94 }}
                  className="relative shrink-0 rounded-full px-4 py-2 text-[12px] font-semibold transition-all"
                  style={
                    active
                      ? {
                          background: "linear-gradient(135deg, #B026FF, #ec4899)",
                          color: "#fff",
                          boxShadow: "0 8px 24px -8px rgba(176,38,255,0.75), 0 0 0 1px rgba(255,255,255,0.10) inset",
                        }
                      : {
                          background: "rgba(255,255,255,0.05)",
                          color: "rgba(255,255,255,0.7)",
                          border: "1px solid rgba(255,255,255,0.08)",
                          backdropFilter: "blur(10px)",
                        }
                  }
                >
                  {c}
                </motion.button>
              );
            })}
          </div>
        </div>

        {/* Featured auto-carousel */}
        {showFeatured && !loading && (
          <FeaturedCarousel featured={featured} onTap={(id) => navigate(`/studio/${id}`)} />
        )}

        {/* Quick generate row */}
        {!loading && !search && activeCat === "All" && !showFavsOnly && (
          <div className="mb-5">
            <div className="mb-2.5 flex items-center gap-2">
              <Bolt className="h-3.5 w-3.5 text-yellow-400" />
              <span className="text-[12px] font-semibold uppercase tracking-wider text-white/65">Quick Generate</span>
              <span className="text-[11px] text-white/35">no photo needed</span>
            </div>
            <div className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <div className="flex gap-2.5 whitespace-nowrap pb-1">
                {(presets ?? [])
                  .filter((p) => p.badge === "Quick" && !p.requiresUploadedImage && p.kind !== "video")
                  .slice(0, 8)
                  .map((p) => {
                    const cover = resolveCover(p);
                    return (
                      <button
                        key={p.id}
                        onClick={() => navigate(`/studio/${p.id}`)}
                        className="group relative shrink-0 overflow-hidden rounded-2xl text-left transition-all active:scale-95"
                        style={{
                          background: `linear-gradient(135deg, ${p.thumb.from}, ${p.thumb.to})`,
                          border: "1px solid rgba(255,255,255,0.09)",
                          width: 156, height: 88,
                          boxShadow: "0 8px 24px -12px rgba(0,0,0,0.6)",
                        }}
                      >
                        {cover && (
                          <img src={cover} alt="" loading="lazy" decoding="async" draggable={false}
                            className="absolute inset-0 h-full w-full object-cover" />
                        )}
                        <div className="absolute inset-0"
                          style={{ background: "linear-gradient(to top, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.25) 60%, transparent 100%)" }} />
                        <div className="absolute inset-x-0 bottom-0 p-2">
                          <div className="truncate text-[11.5px] font-bold text-white">{p.title}</div>
                          <div className="truncate text-[9px] uppercase tracking-wider text-white/55">{p.category}</div>
                        </div>
                      </button>
                    );
                  })}
              </div>
            </div>
          </div>
        )}

        {/* Section label */}
        {!loading && !error && (
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-purple-400" />
              <span className="text-[12px] font-semibold uppercase tracking-wider text-white/65">
                {showFavsOnly
                  ? `${visible.length} favorited`
                  : search
                  ? `${visible.length} results`
                  : activeCat === "All"
                  ? `All ${visible.length} presets`
                  : `${visible.length} in ${activeCat}`}
              </span>
            </div>
          </div>
        )}

        {/* Loading skeletons */}
        {loading && (
          <div className="grid grid-cols-2 gap-3">
            {Array.from({ length: 8 }).map((_, i) => <ShimmerCard key={i} index={i} />)}
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="rounded-2xl p-4 text-[13px] text-red-300"
            style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)" }}>
            Failed to load presets: {error}
          </div>
        )}

        {/* Empty state — icon, no emoji */}
        {!loading && !error && visible.length === 0 && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            className="mt-14 flex flex-col items-center text-center">
            <div className="mb-3 grid h-16 w-16 place-items-center rounded-2xl"
              style={{ background: "linear-gradient(135deg, #B026FF, #ec4899)", boxShadow: "0 18px 40px -16px rgba(176,38,255,0.65)" }}>
              {showFavsOnly
                ? <Heart className="h-7 w-7 text-white" fill="currentColor" />
                : <Search className="h-7 w-7 text-white" />}
            </div>
            <p className="text-[15px] font-semibold text-white">
              {showFavsOnly ? "No favorites yet" : "No presets found"}
            </p>
            <p className="mt-1 max-w-xs text-[12.5px] text-white/55">
              {showFavsOnly
                ? "Tap the heart on any preset to save it here."
                : "Try a different search or category."}
            </p>
            <button
              onClick={() => { setSearch(""); setActiveCat("All"); setShowFavsOnly(false); }}
              className="mt-5 inline-flex items-center gap-1.5 rounded-full px-5 py-2.5 text-[13px] font-semibold text-white"
              style={{ background: "linear-gradient(135deg, #B026FF, #ec4899)",
                boxShadow: "0 10px 28px -10px rgba(176,38,255,0.75)" }}>
              <Sparkles className="h-3.5 w-3.5" />
              Show All Presets
            </button>
          </motion.div>
        )}

        {/* Grid */}
        {!loading && !error && visible.length > 0 && (
          <div className="grid grid-cols-2 gap-3">
            {visible.map((p, i) => (
              <PresetCard
                key={p.id}
                preset={p}
                index={i}
                isFavorite={favoriteIds.includes(p.id)}
                onToggleFav={() => toggleFav(p.id)}
                onTap={() => navigate(`/studio/${p.id}`)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
