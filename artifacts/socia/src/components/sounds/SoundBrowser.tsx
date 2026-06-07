/**
 * SoundBrowser.tsx — Sound picker modal for post/pulse creation.
 *
 * Shows trending sounds + search.
 * User selects a sound → parent gets the Sound object.
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X, Music2, Search, Check, Play, Pause } from "lucide-react";
import { fetchSounds, fetchTrendingSounds, formatDuration } from "@/lib/soundsClient";
import type { Sound } from "@/lib/soundsClient";

interface SoundBrowserProps {
  open:       boolean;
  onClose:    () => void;
  onSelect:   (sound: Sound) => void;
  selected?:  Sound | null;
}

function SoundRow({
  sound,
  selected,
  playing,
  onSelect,
  onPreview,
}: {
  sound:     Sound;
  selected:  boolean;
  playing:   boolean;
  onSelect:  (s: Sound) => void;
  onPreview: (s: Sound) => void;
}) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center gap-3 px-4 py-3 cursor-pointer active:bg-white/5 transition-colors"
      onClick={() => onSelect(sound)}
      style={selected ? { background: "rgba(131,56,236,0.12)" } : {}}
    >
      {/* Cover */}
      <div
        className="h-12 w-12 rounded-xl flex-shrink-0 overflow-hidden"
        style={{ background: "linear-gradient(135deg,#8338ec,#ff006e)" }}
      >
        {sound.cover_image ? (
          <img src={sound.cover_image} alt={sound.title} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Music2 className="h-5 w-5 text-white/60" />
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-white truncate">{sound.title}</p>
        <p className="text-xs text-white/45 truncate">
          {sound.creator?.name ?? sound.creator?.username ?? "Socia Original"}
          {sound.duration_seconds ? ` · ${formatDuration(sound.duration_seconds)}` : ""}
        </p>
        <p className="text-[10px] text-white/30 mt-0.5">
          {sound.usage_count.toLocaleString()} videos
        </p>
      </div>

      {/* Preview button */}
      <button
        onClick={(e) => { e.stopPropagation(); onPreview(sound); }}
        className="grid h-8 w-8 place-items-center rounded-full flex-shrink-0"
        style={{ background: playing ? "rgba(131,56,236,0.35)" : "rgba(255,255,255,0.08)" }}
      >
        {playing
          ? <Pause className="h-3.5 w-3.5 text-purple-300" />
          : <Play  className="h-3.5 w-3.5 text-white/60 ml-0.5" />
        }
      </button>

      {/* Selected checkmark */}
      {selected && (
        <div
          className="grid h-7 w-7 place-items-center rounded-full flex-shrink-0"
          style={{ background: "linear-gradient(135deg,#8338ec,#ff006e)" }}
        >
          <Check className="h-3.5 w-3.5 text-white" />
        </div>
      )}
    </motion.div>
  );
}

export function SoundBrowser({ open, onClose, onSelect, selected }: SoundBrowserProps) {
  const [query,    setQuery]    = useState("");
  const [sounds,   setSounds]   = useState<Sound[]>([]);
  const [loading,  setLoading]  = useState(false);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ── Load sounds ──────────────────────────────────────────────── */
  const load = useCallback((q?: string) => {
    setLoading(true);
    const fn = q ? fetchSounds({ q, limit: 30 }) : fetchTrendingSounds();
    fn.then(setSounds).catch(() => setSounds([])).finally(() => setLoading(false));
  }, []);

  useEffect(() => { if (open) load(); }, [open, load]);

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => load(query || undefined), 350);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [query, load]);

  /* ── Audio preview ─────────────────────────────────────────────── */
  const togglePreview = useCallback((sound: Sound) => {
    if (!sound.audio_url) return;
    if (previewId === sound.id) {
      audioRef.current?.pause();
      setPreviewId(null);
      return;
    }
    audioRef.current?.pause();
    const a = new Audio(sound.audio_url);
    a.loop = true;
    a.play().catch(() => {});
    a.onpause = () => setPreviewId(null);
    audioRef.current = a;
    setPreviewId(sound.id);
  }, [previewId]);

  /* ── Cleanup on close ──────────────────────────────────────────── */
  useEffect(() => {
    if (!open) { audioRef.current?.pause(); setPreviewId(null); }
  }, [open]);
  useEffect(() => () => { audioRef.current?.pause(); }, []);

  const handleSelect = useCallback((sound: Sound) => {
    audioRef.current?.pause();
    setPreviewId(null);
    onSelect(sound);
    onClose();
  }, [onSelect, onClose]);

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[9990]"
            style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)" }}
            onClick={onClose}
          />

          {/* Sheet */}
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 380, damping: 38 }}
            className="fixed bottom-0 left-0 right-0 z-[9991] flex flex-col rounded-t-3xl overflow-hidden"
            style={{
              background:     "#111",
              border:         "1px solid rgba(255,255,255,0.08)",
              maxHeight:      "82dvh",
              paddingBottom:  "env(safe-area-inset-bottom, 20px)",
            }}
          >
            {/* Handle */}
            <div className="flex-shrink-0 flex justify-center pt-3 pb-2">
              <div className="h-1 w-10 rounded-full bg-white/15" />
            </div>

            {/* Header */}
            <div className="flex-shrink-0 flex items-center gap-3 px-4 pb-3">
              <Music2 className="h-5 w-5 text-purple-400 flex-shrink-0" />
              <h2 className="text-base font-bold text-white flex-1">Add Sound</h2>
              <button
                onClick={onClose}
                className="grid h-8 w-8 place-items-center rounded-full"
                style={{ background: "rgba(255,255,255,0.08)" }}
              >
                <X className="h-4 w-4 text-white" />
              </button>
            </div>

            {/* Search */}
            <div className="flex-shrink-0 px-4 pb-3">
              <div
                className="flex items-center gap-2 rounded-xl px-3 py-2.5"
                style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.08)" }}
              >
                <Search className="h-4 w-4 text-white/35 flex-shrink-0" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search sounds…"
                  className="flex-1 bg-transparent text-[13px] text-white outline-none placeholder-white/25"
                />
                {query && (
                  <button onClick={() => setQuery("")} className="text-white/35">
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Label */}
            <div className="flex-shrink-0 px-4 pb-2">
              <p className="text-[11px] font-bold text-white/35 uppercase tracking-wider">
                {query ? "Search results" : "Trending Sounds"}
              </p>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="flex justify-center py-8">
                  <div className="h-5 w-5 rounded-full border-2 border-purple-500/30 border-t-purple-500 animate-spin" />
                </div>
              ) : sounds.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 gap-2">
                  <Music2 className="h-8 w-8 text-white/15" />
                  <p className="text-white/35 text-sm">No sounds found</p>
                </div>
              ) : (
                sounds.map((s) => (
                  <SoundRow
                    key={s.id}
                    sound={s}
                    selected={selected?.id === s.id}
                    playing={previewId === s.id}
                    onSelect={handleSelect}
                    onPreview={togglePreview}
                  />
                ))
              )}
              <div className="h-4" />
            </div>

            {/* No sound option */}
            {selected && (
              <div className="flex-shrink-0 px-4 pt-2 pb-1 border-t border-white/5">
                <button
                  onClick={() => { onSelect(null as any); onClose(); }}
                  className="w-full py-2.5 text-sm text-white/45 hover:text-white/70 transition-colors"
                >
                  Remove sound
                </button>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  );
}
