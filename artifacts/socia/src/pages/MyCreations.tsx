import { useState } from "react";
import { useLocation } from "wouter";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  Trash2,
  Download,
  X,
  Sparkles,
  Film,
  ImageIcon,
  RotateCcw,
  Share2,
  Heart,
  ChevronDown,
} from "lucide-react";
import { useCreationsStore, useFavoritesStore, type Creation } from "@/lib/presetClient";

const FILTER_OPTIONS = ["All", "Images", "Videos", "Favorites"] as const;
type Filter = (typeof FILTER_OPTIONS)[number];

function CreationCard({
  creation,
  isFavorite,
  index,
  onClick,
}: {
  creation: Creation;
  isFavorite: boolean;
  index: number;
  onClick: () => void;
}) {
  return (
    <motion.button
      onClick={onClick}
      whileTap={{ scale: 0.96 }}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: (index % 8) * 0.03, type: "spring", stiffness: 300, damping: 24 }}
      className="relative overflow-hidden rounded-2xl text-left"
      style={{ background: "rgba(8,4,22,0.96)", border: "1px solid rgba(255,255,255,0.07)" }}
    >
      <div className="relative aspect-[3/4] w-full overflow-hidden bg-black">
        <img
          src={creation.thumbnailUrl || creation.url}
          alt=""
          className="h-full w-full object-cover"
          loading="lazy"
        />
        <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/85 to-transparent" />

        {/* Kind badge */}
        <div className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/65 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">
          {creation.type === "video" ? <Film className="h-2.5 w-2.5" /> : <ImageIcon className="h-2.5 w-2.5" />}
          {creation.type === "video" ? `${creation.durationSec || 5}s` : "image"}
        </div>

        {/* Fav dot */}
        {isFavorite && (
          <div className="absolute right-2 top-2 grid h-5 w-5 place-items-center rounded-full bg-black/60">
            <Heart className="h-3 w-3 fill-pink-400 text-pink-400" />
          </div>
        )}
      </div>
      <div className="p-2.5">
        <p className="truncate text-[10px] text-white/45">{creation.category}</p>
        <p className="truncate text-[12.5px] font-semibold text-white">{creation.presetTitle}</p>
        <p className="mt-0.5 text-[10px] text-white/30">
          {new Date(creation.createdAt).toLocaleDateString()}
        </p>
      </div>
    </motion.button>
  );
}

function DetailOverlay({
  creation,
  isFavorite,
  onToggleFav,
  onClose,
  onRemove,
  onRegen,
  onShare,
}: {
  creation: Creation;
  isFavorite: boolean;
  onToggleFav: () => void;
  onClose: () => void;
  onRemove: () => void;
  onRegen: () => void;
  onShare: () => void;
}) {
  const url = creation.type === "video" ? creation.videoUrl! : creation.url;
  const [showPrompt, setShowPrompt] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
      style={{ background: "rgba(0,0,0,0.88)" }}
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 50, scale: 0.97, opacity: 0 }}
        animate={{ y: 0, scale: 1, opacity: 1 }}
        exit={{ y: 50, scale: 0.97, opacity: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 28 }}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-md overflow-hidden rounded-t-3xl sm:rounded-3xl"
        style={{
          background: "rgba(10,4,24,0.98)",
          border: "1px solid rgba(168,85,247,0.25)",
          boxShadow: "0 0 50px -15px rgba(168,85,247,0.35)",
          maxHeight: "90vh",
          overflowY: "auto",
        }}
      >
        <button
          onClick={onClose}
          className="absolute right-3 top-3 z-10 grid h-8 w-8 place-items-center rounded-full bg-black/70 text-white backdrop-blur-sm"
        >
          <X className="h-4 w-4" />
        </button>

        {creation.type === "video" ? (
          <video src={url} controls autoPlay playsInline className="w-full bg-black" style={{ maxHeight: "60vh", objectFit: "contain" }} />
        ) : (
          <img src={url} alt="" className="w-full object-cover" />
        )}

        <div className="p-4">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-wider text-white/35">{creation.category}</p>
              <p className="truncate text-[15px] font-bold text-white">{creation.presetTitle}</p>
              <p className="text-[11px] text-white/35">{new Date(creation.createdAt).toLocaleString()}</p>
            </div>
            <button onClick={onToggleFav} className="grid h-9 w-9 shrink-0 place-items-center rounded-full transition active:scale-90" style={{ background: "rgba(255,255,255,0.07)" }}>
              <Heart className="h-4 w-4" style={{ color: isFavorite ? "#f472b6" : "rgba(255,255,255,0.6)", fill: isFavorite ? "#f472b6" : "none" }} />
            </button>
          </div>

          {/* Prompt toggle */}
          <button onClick={() => setShowPrompt((v) => !v)} className="mb-3 flex w-full items-center gap-1 text-[11px] text-white/40">
            <ChevronDown className={`h-3 w-3 transition-transform ${showPrompt ? "rotate-180" : ""}`} />
            {showPrompt ? "Hide prompt" : "Show AI prompt used"}
          </button>
          <AnimatePresence>
            {showPrompt && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                <p className="mb-3 rounded-xl p-2.5 text-[11px] leading-relaxed text-white/50" style={{ background: "rgba(255,255,255,0.04)" }}>
                  {creation.prompt}
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex gap-2">
            <button onClick={onRemove} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-white/60 transition active:scale-95" style={{ background: "rgba(255,255,255,0.07)" }} aria-label="Delete">
              <Trash2 className="h-4 w-4" />
            </button>
            <button onClick={onShare} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-white/60 transition active:scale-95" style={{ background: "rgba(255,255,255,0.07)" }} aria-label="Share">
              <Share2 className="h-4 w-4" />
            </button>
            <a href={url} download target="_blank" rel="noreferrer" className="flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 text-[13px] font-medium text-white transition active:scale-95" style={{ background: "rgba(255,255,255,0.09)" }}>
              <Download className="h-4 w-4" />
              Save
            </a>
            <button onClick={onRegen} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 text-[13px] font-semibold text-white transition active:scale-95" style={{ background: "linear-gradient(135deg,#a855f7,#ec4899)" }}>
              <RotateCcw className="h-4 w-4" />
              Remix
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

export default function MyCreations() {
  const [, navigate] = useLocation();
  const items = useCreationsStore((s) => s.items);
  const remove = useCreationsStore((s) => s.remove);
  const clear = useCreationsStore((s) => s.clear);
  const favoriteIds = useFavoritesStore((s) => s.ids);
  const toggleFav = useFavoritesStore((s) => s.toggle);
  const [open, setOpen] = useState<Creation | null>(null);
  const [filter, setFilter] = useState<Filter>("All");

  const visible = items.filter((c) => {
    if (filter === "Images") return c.type === "image";
    if (filter === "Videos") return c.type === "video";
    if (filter === "Favorites") return favoriteIds.includes(c.presetId);
    return true;
  });

  const imageCount = items.filter((c) => c.type === "image").length;
  const videoCount = items.filter((c) => c.type === "video").length;

  return (
    <div
      className="min-h-screen pb-28"
      style={{
        background:
          "radial-gradient(ellipse 70% 40% at 20% -5%, rgba(168,85,247,0.1) 0%, transparent 55%)," +
          "#030010",
      }}
    >
      <div className="px-4 pt-4">
        {/* Header */}
        <div className="mb-4 flex items-center gap-3">
          <button
            onClick={() => navigate("/studio")}
            className="grid h-9 w-9 place-items-center rounded-full text-white/80 active:scale-95"
            style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)" }}
            aria-label="Back"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="flex-1">
            <h1 className="font-display text-[22px] font-bold text-white">My Creations</h1>
            {items.length > 0 && (
              <p className="text-[11.5px] text-white/45">
                {items.length} total · {imageCount} images · {videoCount} videos
              </p>
            )}
          </div>
          {items.length > 0 && (
            <button
              onClick={() => { if (confirm("Clear all creations? This cannot be undone.")) clear(); }}
              className="grid h-9 w-9 place-items-center rounded-full text-white/55 active:scale-95"
              style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)" }}
              aria-label="Clear all"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>

        {items.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-16 flex flex-col items-center text-center"
          >
            <div
              className="mb-4 grid h-20 w-20 place-items-center rounded-3xl text-4xl"
              style={{
                background: "linear-gradient(135deg,#a855f7,#ec4899)",
                boxShadow: "0 16px 40px -10px rgba(168,85,247,0.5)",
              }}
            >
              ✨
            </div>
            <p className="text-[17px] font-bold text-white">No creations yet</p>
            <p className="mt-2 max-w-xs text-[12.5px] text-white/50">
              Pick a preset in the studio, generate something beautiful — it'll appear here instantly.
            </p>
            <button
              onClick={() => navigate("/studio")}
              className="mt-6 rounded-full px-6 py-3 text-[14px] font-semibold text-white"
              style={{
                background: "linear-gradient(135deg,#a855f7,#ec4899)",
                boxShadow: "0 10px 30px -8px rgba(168,85,247,0.55)",
              }}
            >
              <Sparkles className="mr-1.5 inline h-4 w-4" />
              Open AI Preset Studio
            </button>
          </motion.div>
        ) : (
          <>
            {/* Filter tabs */}
            <div className="mb-4 flex gap-2">
              {FILTER_OPTIONS.map((f) => {
                const active = filter === f;
                const count =
                  f === "All" ? items.length
                    : f === "Images" ? imageCount
                    : f === "Videos" ? videoCount
                    : items.filter((c) => favoriteIds.includes(c.presetId)).length;
                return (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className="flex-1 rounded-xl py-2 text-[12px] font-medium transition-all active:scale-95"
                    style={
                      active
                        ? { background: "linear-gradient(135deg,#a855f7,#ec4899)", color: "#fff" }
                        : { background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.6)", border: "1px solid rgba(255,255,255,0.07)" }
                    }
                  >
                    {f === "Favorites" ? "❤️" : ""} {f}
                    {count > 0 && <span className="ml-1 opacity-70">({count})</span>}
                  </button>
                );
              })}
            </div>

            {visible.length === 0 ? (
              <div className="mt-10 text-center">
                <p className="text-[15px] font-semibold text-white/60">Nothing here</p>
                <button onClick={() => setFilter("All")} className="mt-3 text-[12.5px] text-purple-400 underline">
                  Show all
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {visible.map((c, i) => (
                  <CreationCard
                    key={c.id}
                    creation={c}
                    isFavorite={favoriteIds.includes(c.presetId)}
                    index={i}
                    onClick={() => setOpen(c)}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <AnimatePresence>
        {open && (
          <DetailOverlay
            creation={open}
            isFavorite={favoriteIds.includes(open.presetId)}
            onToggleFav={() => toggleFav(open.presetId)}
            onClose={() => setOpen(null)}
            onRemove={() => { remove(open.id); setOpen(null); }}
            onRegen={() => { setOpen(null); navigate(`/studio/${open.presetId}`); }}
            onShare={() => {
              const url = open.type === "video" ? open.videoUrl : open.url;
              navigate(`/create?prefillUrl=${encodeURIComponent(url ?? "")}`);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
