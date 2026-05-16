import { useMemo, useState } from "react";
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
} from "lucide-react";
import {
  usePresets,
  useCreationsStore,
  useFavoritesStore,
  type ClientPreset,
} from "@/lib/presetClient";

// ── Category emoji map ──────────────────────────────────────────────────────
const CAT_EMOJI: Record<string, string> = {
  "All": "✨",
  "Viral TikTok Ads": "🔥",
  "Luxury Product Ads": "💎",
  "Beauty Influencer": "💄",
  "Fashion Editorial": "👗",
  "Hyper Realistic": "🔬",
  "Cinematic Film": "🎬",
  "Anime Style": "🌸",
  "Dark Luxury": "🖤",
  "Apple Commercial Style": "⬜",
  "Nike Style": "⚡",
  "Streetwear Campaign": "🧥",
  "Food Commercial": "🍽️",
  "Jewelry Macro": "💍",
  "Korean Aesthetic": "🌺",
  "Viral Unboxing": "📦",
  "AI Influencer": "🤖",
  "Documentary Style": "📷",
  "Drone Cinematic": "🚁",
  "Neon Cyberpunk": "🌃",
  "Studio Lighting Pro": "💡",
  "Luxury Perfume Ad": "🌹",
  "Hand Model Showcase": "🤲",
  "Ecommerce Conversion Ads": "🛒",
};

const BADGE_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  Hot:      { bg: "rgba(239,68,68,0.85)",    text: "#fff", label: "🔥 Hot" },
  New:      { bg: "rgba(34,197,94,0.85)",    text: "#fff", label: "✦ New" },
  "Top Pick": { bg: "rgba(168,85,247,0.85)", text: "#fff", label: "⭐ Top Pick" },
  Pro:      { bg: "rgba(251,191,36,0.9)",    text: "#000", label: "⚡ Pro" },
  Quick:    { bg: "rgba(34,211,238,0.85)",   text: "#000", label: "⚡ Quick" },
};

// ── Floating orbs ────────────────────────────────────────────────────────────
function FloatingOrbs() {
  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden">
      <motion.div
        animate={{ x: [0, 25, 0], y: [0, -18, 0], scale: [1, 1.12, 1] }}
        transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
        className="absolute rounded-full"
        style={{
          left: "-15%", top: "-8%",
          width: "55vw", height: "55vw",
          background: "radial-gradient(circle, rgba(168,85,247,0.12) 0%, transparent 70%)",
        }}
      />
      <motion.div
        animate={{ x: [0, -18, 0], y: [0, 28, 0], scale: [1, 1.16, 1] }}
        transition={{ duration: 22, repeat: Infinity, ease: "easeInOut", delay: 4 }}
        className="absolute rounded-full"
        style={{
          right: "-12%", top: "25%",
          width: "45vw", height: "45vw",
          background: "radial-gradient(circle, rgba(236,72,153,0.09) 0%, transparent 70%)",
        }}
      />
      <motion.div
        animate={{ x: [0, 12, 0], y: [0, -12, 0] }}
        transition={{ duration: 14, repeat: Infinity, ease: "easeInOut", delay: 8 }}
        className="absolute rounded-full"
        style={{
          left: "15%", bottom: "8%",
          width: "35vw", height: "35vw",
          background: "radial-gradient(circle, rgba(99,102,241,0.07) 0%, transparent 70%)",
        }}
      />
    </div>
  );
}

// ── Shimmer skeleton card ─────────────────────────────────────────────────────
function ShimmerCard({ index }: { index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: index * 0.05 }}
      className="overflow-hidden rounded-2xl"
      style={{ border: "1px solid rgba(255,255,255,0.06)" }}
    >
      <div
        className="aspect-[3/4] animate-pulse"
        style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.04), rgba(255,255,255,0.08))" }}
      />
      <div className="space-y-2 p-2.5">
        <div className="h-3 w-3/4 animate-pulse rounded-full bg-white/8" />
        <div className="h-2 w-1/2 animate-pulse rounded-full bg-white/5" />
      </div>
    </motion.div>
  );
}

// ── Badge chip ────────────────────────────────────────────────────────────────
function BadgeChip({ badge }: { badge: string }) {
  const style = BADGE_STYLES[badge];
  if (!style) return null;
  return (
    <div
      className="absolute right-2 top-2 rounded-full px-2 py-0.5 text-[9px] font-bold backdrop-blur-sm"
      style={{ background: style.bg, color: style.text }}
    >
      {style.label}
    </div>
  );
}

// ── Preset card ───────────────────────────────────────────────────────────────
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
  const needsUpload = preset.requiresUploadedImage || preset.kind === "video";
  const glow = preset.glowColor ?? "rgba(168,85,247,0.4)";

  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: (index % 8) * 0.04, type: "spring", stiffness: 300, damping: 24 }}
      className="relative"
    >
      <motion.button
        onClick={onTap}
        onHoverStart={() => setHovered(true)}
        onHoverEnd={() => setHovered(false)}
        whileTap={{ scale: 0.96 }}
        className="relative w-full overflow-hidden rounded-2xl text-left"
        style={{
          background: "rgba(8,4,22,0.96)",
          border: `1px solid ${hovered ? glow : "rgba(255,255,255,0.07)"}`,
          boxShadow: hovered ? `0 0 28px -6px ${glow}` : "none",
          transition: "border-color 0.25s, box-shadow 0.25s",
        }}
      >
        {/* Thumbnail area */}
        <div
          className="relative aspect-[3/4] overflow-hidden"
          style={{ background: `linear-gradient(145deg, ${preset.thumb.from}, ${preset.thumb.to})` }}
        >
          {/* Emoji */}
          <motion.div
            animate={hovered ? { scale: 1.1 } : { scale: 1 }}
            transition={{ type: "spring", stiffness: 280, damping: 22 }}
            className="absolute inset-0 grid place-items-center text-[52px] select-none"
          >
            {preset.thumb.emoji}
          </motion.div>

          {/* Dark gradient overlay */}
          <div
            className="absolute inset-0"
            style={{ background: "linear-gradient(to top, rgba(0,0,0,0.78) 0%, rgba(0,0,0,0.08) 55%, transparent 100%)" }}
          />

          {/* Hover color glow */}
          <motion.div
            animate={{ opacity: hovered ? 0.13 : 0 }}
            className="absolute inset-0"
            style={{ background: `linear-gradient(135deg, ${preset.thumb.from}, ${preset.thumb.to})` }}
          />

          {/* Kind + duration badge */}
          <div className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">
            {preset.kind === "video"
              ? <Film className="h-2.5 w-2.5" />
              : <ImageIcon className="h-2.5 w-2.5" />}
            {preset.kind === "video" ? `${preset.durationSec ?? 5}s video` : preset.defaultAspect}
          </div>

          {/* Quality badge */}
          {preset.badge && <BadgeChip badge={preset.badge} />}

          {/* Upload required indicator */}
          {needsUpload && (
            <div className="absolute bottom-2 left-2 rounded-full bg-black/55 px-1.5 py-0.5 text-[9px] text-white/75 backdrop-blur-sm">
              📎 photo
            </div>
          )}
        </div>

        {/* Body */}
        <div className="p-2.5 pb-3">
          <h3 className="text-[13px] font-semibold leading-tight text-white">
            {preset.title}
          </h3>
          <p className="mt-0.5 line-clamp-2 text-[10.5px] leading-tight text-white/55">
            {preset.description}
          </p>
          {preset.tags && preset.tags.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {preset.tags.slice(0, 2).map((tag) => (
                <span
                  key={tag}
                  className="rounded-full px-1.5 py-0.5 text-[9px] text-white/45"
                  style={{ background: "rgba(255,255,255,0.07)" }}
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Hover generate CTA */}
        <motion.div
          animate={{ y: hovered ? 0 : "110%" }}
          transition={{ type: "spring", stiffness: 420, damping: 32 }}
          className="absolute inset-x-0 bottom-0 rounded-b-2xl py-2"
          style={{ background: "linear-gradient(to top, rgba(168,85,247,0.88), rgba(168,85,247,0.55), transparent)" }}
        >
          <p className="text-center text-[11.5px] font-bold text-white">Generate →</p>
        </motion.div>
      </motion.button>

      {/* Fav button */}
      <button
        onClick={(e) => { e.stopPropagation(); onToggleFav(); }}
        className="absolute right-2 z-10 grid h-7 w-7 place-items-center rounded-full backdrop-blur-sm transition-all active:scale-90"
        style={{
          top: "calc(75% - 18px)",
          background: "rgba(0,0,0,0.6)",
        }}
        aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
      >
        <Heart
          className="h-3.5 w-3.5 transition-colors"
          style={{ color: isFavorite ? "#f472b6" : "rgba(255,255,255,0.6)", fill: isFavorite ? "#f472b6" : "none" }}
        />
      </button>
    </motion.div>
  );
}

// ── Featured banner ────────────────────────────────────────────────────────────
function FeaturedBanner({ featured, onTap }: { featured: ClientPreset[]; onTap: (id: string) => void }) {
  const [idx, setIdx] = useState(0);
  const p = featured[idx];
  if (!p) return null;

  return (
    <motion.div
      key={p.id}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="mb-4 overflow-hidden rounded-3xl"
      style={{
        background: `linear-gradient(135deg, ${p.thumb.from}55, ${p.thumb.to}44)`,
        border: "1px solid rgba(255,255,255,0.1)",
      }}
    >
      <button
        onClick={() => onTap(p.id)}
        className="flex w-full items-center gap-4 p-4 text-left"
      >
        <div
          className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl text-4xl"
          style={{
            background: `linear-gradient(135deg, ${p.thumb.from}, ${p.thumb.to})`,
            boxShadow: `0 10px 28px -8px ${p.glowColor ?? "rgba(168,85,247,0.5)"}`,
          }}
        >
          {p.thumb.emoji}
        </div>
        <div className="min-w-0 flex-1">
          <div className="mb-0.5 flex items-center gap-2">
            {p.badge && (
              <span
                className="rounded-full px-2 py-0.5 text-[9px] font-bold"
                style={{ background: BADGE_STYLES[p.badge]?.bg, color: BADGE_STYLES[p.badge]?.text }}
              >
                {BADGE_STYLES[p.badge]?.label}
              </span>
            )}
            <span className="text-[10px] text-white/45">{p.category}</span>
          </div>
          <h3 className="truncate text-[16px] font-bold text-white">{p.title}</h3>
          <p className="mt-0.5 truncate text-[11.5px] text-white/60">{p.description}</p>
        </div>
        <div
          className="shrink-0 rounded-xl px-3 py-2 text-[12px] font-semibold text-white"
          style={{ background: "linear-gradient(135deg,#a855f7,#ec4899)" }}
        >
          Try
        </div>
      </button>

      {/* Dot nav */}
      {featured.length > 1 && (
        <div className="flex justify-center gap-1.5 pb-3">
          {featured.map((_, i) => (
            <button
              key={i}
              onClick={() => setIdx(i)}
              className="rounded-full transition-all"
              style={{
                width: i === idx ? 16 : 6,
                height: 6,
                background: i === idx ? "#a855f7" : "rgba(255,255,255,0.2)",
              }}
            />
          ))}
        </div>
      )}
    </motion.div>
  );
}

// ── Main Studio page ──────────────────────────────────────────────────────────
export default function Studio() {
  const [, navigate] = useLocation();
  const { presets, loading, error } = usePresets();
  const [activeCat, setActiveCat] = useState<string>("All");
  const [search, setSearch] = useState("");
  const favoriteIds = useFavoritesStore((s) => s.ids);
  const toggleFav = useFavoritesStore((s) => s.toggle);
  const recentCount = useCreationsStore((s) => s.items.length);
  const [showFavsOnly, setShowFavsOnly] = useState(false);

  const categories = useMemo(() => {
    if (!presets) return ["All"];
    const seen = new Set<string>();
    const out: string[] = ["All"];
    for (const p of presets) {
      if (!seen.has(p.category)) {
        seen.add(p.category);
        out.push(p.category);
      }
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

  const showFeaturedBanner =
    activeCat === "All" && !search.trim() && !showFavsOnly && featured.length > 0;

  return (
    <div
      className="relative min-h-screen pb-28"
      style={{
        background:
          "radial-gradient(ellipse 70% 40% at 15% -5%, rgba(168,85,247,0.13) 0%, transparent 60%)," +
          "radial-gradient(ellipse 55% 35% at 85% 105%, rgba(236,72,153,0.09) 0%, transparent 60%)," +
          "#030010",
      }}
    >
      <FloatingOrbs />

      <div className="relative z-10 px-4 pt-4">
        {/* Top bar */}
        <div className="mb-4 flex items-center gap-3">
          <button
            onClick={() => navigate("/create")}
            className="grid h-9 w-9 place-items-center rounded-full bg-white/6 text-white/80 active:scale-95"
            style={{ border: "1px solid rgba(255,255,255,0.08)" }}
            aria-label="Back"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="flex-1">
            <h1 className="font-display text-[22px] font-bold leading-none text-white">
              AI <span className="text-gradient">Preset Studio</span>
            </h1>
            <p className="mt-0.5 text-[11.5px] text-white/45">
              {presets ? `${presets.length} presets · ${categories.length - 1} categories` : "1-click pro-grade looks"}
            </p>
          </div>
          <button
            onClick={() => setShowFavsOnly((v) => !v)}
            className="grid h-9 w-9 place-items-center rounded-full transition-all active:scale-95"
            style={{
              background: showFavsOnly ? "rgba(244,114,182,0.2)" : "rgba(255,255,255,0.06)",
              border: showFavsOnly ? "1px solid rgba(244,114,182,0.4)" : "1px solid rgba(255,255,255,0.08)",
            }}
            aria-label="Favorites"
          >
            <Heart
              className="h-4 w-4"
              style={{ color: showFavsOnly ? "#f472b6" : "rgba(255,255,255,0.7)", fill: showFavsOnly ? "#f472b6" : "none" }}
            />
          </button>
          <button
            onClick={() => navigate("/studio/creations")}
            className="relative grid h-9 w-9 place-items-center rounded-full bg-white/6 text-white/80 active:scale-95"
            style={{ border: "1px solid rgba(255,255,255,0.08)" }}
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

        {/* Search bar */}
        <div
          className="mb-4 flex items-center gap-2 rounded-2xl px-3 py-2.5"
          style={{
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <Search className="h-4 w-4 shrink-0 text-white/40" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search presets, styles, moods…"
            className="min-w-0 flex-1 bg-transparent text-[13.5px] text-white placeholder-white/35 outline-none"
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
        </div>

        {/* Category tabs */}
        <div className="-mx-4 mb-4 overflow-x-auto px-4">
          <div className="flex gap-2 whitespace-nowrap pb-1">
            {categories.map((c) => {
              const active = c === activeCat && !showFavsOnly;
              return (
                <motion.button
                  key={c}
                  onClick={() => { setActiveCat(c); setShowFavsOnly(false); }}
                  whileTap={{ scale: 0.95 }}
                  className="shrink-0 rounded-full px-3 py-1.5 text-[12px] font-medium transition-all"
                  style={
                    active
                      ? {
                          background: "linear-gradient(135deg,#a855f7,#ec4899)",
                          color: "#fff",
                          boxShadow: "0 6px 18px -6px rgba(168,85,247,0.65)",
                        }
                      : {
                          background: "rgba(255,255,255,0.06)",
                          color: "rgba(255,255,255,0.65)",
                          border: "1px solid rgba(255,255,255,0.07)",
                        }
                  }
                >
                  {CAT_EMOJI[c] ?? "✦"} {c}
                </motion.button>
              );
            })}
          </div>
        </div>

        {/* Featured banner */}
        {showFeaturedBanner && !loading && (
          <FeaturedBanner featured={featured} onTap={(id) => navigate(`/studio/${id}`)} />
        )}

        {/* Quick picks row */}
        {!loading && !search && activeCat === "All" && !showFavsOnly && (
          <div className="mb-4">
            <div className="mb-2 flex items-center gap-2">
              <Zap className="h-3.5 w-3.5 text-yellow-400" />
              <span className="text-[12px] font-medium text-white/60">Quick Generate (no photo needed)</span>
            </div>
            <div className="-mx-4 overflow-x-auto px-4">
              <div className="flex gap-2 whitespace-nowrap pb-1">
                {(presets ?? [])
                  .filter((p) => p.badge === "Quick" && !p.requiresUploadedImage && p.kind !== "video")
                  .slice(0, 6)
                  .map((p) => (
                    <button
                      key={p.id}
                      onClick={() => navigate(`/studio/${p.id}`)}
                      className="shrink-0 rounded-2xl px-3 py-2.5 text-left transition-all active:scale-95"
                      style={{
                        background: `linear-gradient(135deg, ${p.thumb.from}33, ${p.thumb.to}22)`,
                        border: "1px solid rgba(255,255,255,0.09)",
                        minWidth: 120,
                        maxWidth: 160,
                      }}
                    >
                      <div className="mb-1 text-[20px]">{p.thumb.emoji}</div>
                      <div className="truncate text-[11.5px] font-semibold text-white">{p.title}</div>
                      <div className="truncate text-[10px] text-white/45">{p.category}</div>
                    </button>
                  ))}
              </div>
            </div>
          </div>
        )}

        {/* Section label */}
        {!loading && !error && (
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-purple-400" />
              <span className="text-[12px] font-medium text-white/55">
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
            {Array.from({ length: 8 }).map((_, i) => (
              <ShimmerCard key={i} index={i} />
            ))}
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="rounded-2xl p-4 text-[13px] text-red-300"
            style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)" }}>
            Failed to load presets: {error}
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && visible.length === 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-12 flex flex-col items-center text-center"
          >
            <div
              className="mb-3 grid h-16 w-16 place-items-center rounded-2xl text-4xl"
              style={{ background: "linear-gradient(135deg,#a855f7,#ec4899)" }}
            >
              {showFavsOnly ? "❤️" : "🔍"}
            </div>
            <p className="text-[15px] font-semibold text-white">
              {showFavsOnly ? "No favorites yet" : "No presets found"}
            </p>
            <p className="mt-1 max-w-xs text-[12.5px] text-white/50">
              {showFavsOnly
                ? "Tap the heart on any preset card to save it here."
                : "Try a different search or category."}
            </p>
            <button
              onClick={() => { setSearch(""); setActiveCat("All"); setShowFavsOnly(false); }}
              className="mt-5 rounded-full px-5 py-2.5 text-[13px] font-semibold text-white"
              style={{ background: "linear-gradient(135deg,#a855f7,#ec4899)" }}
            >
              Show All Presets
            </button>
          </motion.div>
        )}

        {/* Preset grid */}
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
