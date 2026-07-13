/**
 * Upload.tsx — Post composer, styled to match X (Twitter)'s compose screen.
 * Supports photos and videos, multiple files, preview, caption, and publish.
 * Files are uploaded to Supabase post-media bucket; posts stored in DB.
 */
import { useRef, useState, useCallback, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, Image as ImageIcon, Video, X, Check, Camera,
  Globe, ListOrdered, MapPin, Smile, Music2,
} from "lucide-react";
import { useAppStore } from "@/lib/store";
import { uploadPostMedia, createPost } from "@/lib/postsClient";
import { SoundBrowser } from "@/components/sounds/SoundBrowser";
import { MentionInput } from "@/components/feed/MentionInput";
import { fetchSound } from "@/lib/soundsClient";
import type { Sound } from "@/lib/soundsClient";

interface MediaItem {
  file: File;
  preview: string;
  type: "photo" | "video";
  progress: number;
  url?: string;
  error?: string;
}

const CAPTION_LIMIT = 2200;
/** X's ring switches to a countdown once this many characters remain. */
const RING_WARN_THRESHOLD = 20;

export default function UploadPage() {
  const [, navigate]   = useLocation();
  const search         = useSearch();
  const user           = useAppStore((s) => s.user);
  const [items, setItems]       = useState<MediaItem[]>([]);
  const [caption, setCaption]   = useState("");
  const [publishing, setPublishing] = useState(false);
  const [published, setPublished]   = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [soundBrowserOpen, setSoundBrowserOpen] = useState(false);
  const [selectedSound, setSelectedSound]       = useState<Sound | null>(null);
  const fileRef   = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  /* ── Pre-select sound from ?sound=:id query param ─────────────── */
  useEffect(() => {
    const params  = new URLSearchParams(search);
    const soundId = params.get("sound");
    if (!soundId) return;
    fetchSound(soundId).then(setSelectedSound).catch(() => {});
  }, [search]);

  const addFiles = useCallback((files: FileList | File[]) => {
    const arr = Array.from(files).slice(0, 10 - items.length);
    const newItems: MediaItem[] = arr.map((file) => ({
      file,
      preview: URL.createObjectURL(file),
      type: file.type.startsWith("video/") ? "video" : "photo",
      progress: 0,
    }));
    setItems((prev) => [...prev, ...newItems]);
  }, [items.length]);

  const removeItem = (i: number) => {
    setItems((prev) => {
      const next = [...prev];
      URL.revokeObjectURL(next[i].preview);
      next.splice(i, 1);
      return next;
    });
  };

  const canPublish = (caption.trim().length > 0 || items.length > 0) && !publishing;

  const publish = async () => {
    if (!user || !canPublish) return;
    setPublishing(true);
    setError(null);

    try {
      const uploaded: Array<{ url: string; type: "photo" | "video" }> = [];

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const url = await uploadPostMedia(item.file, user.id, (pct) => {
          setItems((prev) => {
            const next = [...prev];
            if (next[i]) next[i] = { ...next[i], progress: pct };
            return next;
          });
        });
        uploaded.push({ url, type: item.type });
        setItems((prev) => {
          const next = [...prev];
          if (next[i]) next[i] = { ...next[i], url, progress: 100 };
          return next;
        });
      }

      const type = items.length > 1 ? "multi" : items.length === 1 && items[0].type === "video" ? "video" : "photo";
      await createPost({ caption: caption.trim() || undefined, type, media: uploaded, sound_id: selectedSound?.id ?? null });

      setPublished(true);
      setTimeout(() => navigate("/"), 1400);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed. Please try again.");
    } finally {
      setPublishing(false);
    }
  };

  if (!user) return null;

  const charsLeft   = CAPTION_LIMIT - caption.length;
  const ringPct      = Math.min(100, (caption.length / CAPTION_LIMIT) * 100);
  const ringWarn     = charsLeft <= RING_WARN_THRESHOLD;
  const ringOver     = charsLeft < 0;

  return (
    <div className="app-bg min-h-[100dvh] flex flex-col overflow-hidden">
      {/* ── Header — back left, Post button right, X proportions ── */}
      <div
        className="sticky top-0 z-40 flex items-center justify-between px-4"
        style={{ height: 53, borderBottom: "1px solid #2F3336" }}
      >
        <button
          onClick={() => navigate(-1 as any)}
          className="grid h-8 w-8 place-items-center rounded-full -ml-1"
          aria-label="Close"
        >
          <X className="h-5 w-5 app-text" />
        </button>

        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={publish}
          disabled={!canPublish}
          className="px-4 py-1.5 rounded-full font-bold text-[15px] text-white disabled:opacity-50 transition-opacity"
          style={{ background: "linear-gradient(135deg,var(--accent-primary),var(--accent-secondary))" }}
        >
          {publishing ? "Posting…" : "Post"}
        </motion.button>
      </div>

      <div className="flex-1 overflow-y-auto scroll-native px-4 pt-3">
        {/* Error */}
        {error && (
          <div className="mb-3 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
            {error}
          </div>
        )}

        {/* Success */}
        <AnimatePresence>
          {published && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="mb-3 rounded-2xl bg-emerald-500/15 border border-emerald-400/30 px-4 py-3 flex items-center gap-3"
            >
              <div className="h-8 w-8 rounded-full bg-emerald-500 grid place-items-center">
                <Check className="h-4 w-4 text-white" />
              </div>
              <div>
                <p className="text-sm font-bold text-emerald-200">Post published!</p>
                <p className="text-xs text-emerald-300/70">Taking you to your feed…</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Avatar + composer column (avatar 40px, X spacing) ── */}
        <div className="flex gap-3">
          {user.avatar ? (
            <img src={user.avatar} alt="" className="h-10 w-10 rounded-full object-cover flex-shrink-0" />
          ) : (
            <div className="h-10 w-10 rounded-full grid place-items-center text-sm font-bold text-white bg-[#1D9BF0] flex-shrink-0">
              {(user.name || user.handle || "?").charAt(0).toUpperCase()}
            </div>
          )}

          <div className="flex-1 min-w-0 pt-1">
            <MentionInput
              value={caption}
              onChange={setCaption}
              placeholder="What's happening?"
              autoGrow
              rows={1}
              disabled={publishing}
              className="w-full text-[20px] leading-[1.35] app-text placeholder:text-[#71767B] resize-none outline-none bg-transparent border-none p-0"
              maxLength={CAPTION_LIMIT}
            />

            {/* Media previews — natural aspect ratio, no forced cropping */}
            {items.length > 0 && (
              <div className={`mt-3 grid gap-1.5 ${items.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
                {items.map((item, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, scale: 0.96 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="relative rounded-2xl overflow-hidden bg-black/40"
                    style={{ border: "1px solid rgba(255,255,255,0.08)" }}
                  >
                    {item.type === "video" ? (
                      <video
                        src={item.preview}
                        className="w-full block"
                        style={{ maxHeight: 420, display: "block" }}
                        muted
                        playsInline
                        controls
                      />
                    ) : (
                      <img
                        src={item.preview}
                        alt=""
                        className="w-full block"
                        style={{ maxHeight: 420, objectFit: "contain", display: "block" }}
                      />
                    )}

                    {/* Progress overlay */}
                    {item.progress > 0 && item.progress < 100 && (
                      <div className="absolute inset-0 bg-black/60 grid place-items-center">
                        <div className="text-center">
                          <div className="text-lg font-bold text-white">{item.progress}%</div>
                          <div className="text-[10px] text-white/60">Uploading…</div>
                        </div>
                      </div>
                    )}

                    {/* Done checkmark */}
                    {item.url && (
                      <div className="absolute bottom-1.5 right-1.5 h-5 w-5 rounded-full bg-emerald-500 grid place-items-center">
                        <Check className="h-3 w-3 text-white" strokeWidth={2.5} />
                      </div>
                    )}

                    {/* Video badge */}
                    {item.type === "video" && (
                      <div className="absolute top-1.5 left-1.5 flex items-center gap-1 rounded-full bg-black/60 px-1.5 py-0.5">
                        <Video className="h-2.5 w-2.5 text-white" />
                      </div>
                    )}

                    {/* Remove button */}
                    {!publishing && (
                      <button
                        onClick={() => removeItem(i)}
                        className="absolute top-1.5 right-1.5 h-7 w-7 rounded-full bg-black/70 grid place-items-center"
                        aria-label="Remove"
                      >
                        <X className="h-4 w-4 text-white" />
                      </button>
                    )}
                  </motion.div>
                ))}
              </div>
            )}

            {/* Sound picker — Socia-specific, kept alongside the X-style composer */}
            <motion.button
              whileTap={{ scale: 0.98 }}
              onClick={() => setSoundBrowserOpen(true)}
              className="mt-3 w-full flex items-center justify-between rounded-2xl px-3 py-2.5 text-left"
              style={{ border: selectedSound ? "1px solid rgba(131,56,236,0.4)" : "1px solid rgba(255,255,255,0.08)" }}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                {selectedSound?.cover_image ? (
                  <img
                    src={selectedSound.cover_image}
                    alt={selectedSound.title}
                    className="h-7 w-7 rounded-lg object-cover flex-shrink-0"
                  />
                ) : (
                  <div
                    className="h-7 w-7 rounded-lg grid place-items-center flex-shrink-0"
                    style={{ background: selectedSound ? "linear-gradient(135deg,#8338ec,#ff006e)" : "rgba(255,255,255,0.06)" }}
                  >
                    <Music2 className="h-3.5 w-3.5 text-[#71767B]" />
                  </div>
                )}
                <p className="text-[13px] font-medium app-text truncate">
                  {selectedSound ? selectedSound.title : "Add sound"}
                </p>
              </div>
              {selectedSound && (
                <button
                  onClick={(e) => { e.stopPropagation(); setSelectedSound(null); }}
                  className="grid h-5 w-5 place-items-center rounded-full flex-shrink-0"
                  style={{ background: "rgba(255,255,255,0.1)" }}
                >
                  <X className="h-3 w-3 text-[#71767B]" />
                </button>
              )}
            </motion.button>

            {/* Sound Browser Modal */}
            <SoundBrowser
              open={soundBrowserOpen}
              onClose={() => setSoundBrowserOpen(false)}
              onSelect={(s) => setSelectedSound(s ?? null)}
              selected={selectedSound}
            />

            {/* "Everyone can reply" — X-style decorative audience row */}
            <button
              className="mt-4 flex items-center gap-1.5 text-[13px] font-semibold"
              style={{ color: "#1D9BF0" }}
            >
              <Globe className="h-4 w-4" />
              Everyone can reply
            </button>
          </div>
        </div>
      </div>

      {/* ── Bottom toolbar — X icon set, spacing, and character ring ── */}
      <div style={{ borderTop: "1px solid #2F3336" }}>
        <div className="flex items-center justify-between px-3" style={{ height: 48 }}>
          <div className="flex items-center">
            <ToolbarIcon
              icon={<ImageIcon className="h-[19px] w-[19px]" />}
              onClick={() => items.length < 10 && !publishing && fileRef.current?.click()}
              disabled={items.length >= 10 || publishing}
              color="#1D9BF0"
            />
            <ToolbarIcon
              icon={<span className="text-[10px] font-bold border border-current rounded px-[3px] leading-[14px]">GIF</span>}
              disabled
              color="#1D9BF0"
            />
            <ToolbarIcon
              icon={<ListOrdered className="h-[19px] w-[19px]" />}
              disabled
              color="#1D9BF0"
            />
            <ToolbarIcon
              icon={<Camera className="h-[19px] w-[19px]" />}
              onClick={() => !publishing && cameraRef.current?.click()}
              disabled={publishing}
              color="#1D9BF0"
            />
            <ToolbarIcon
              icon={<MapPin className="h-[19px] w-[19px]" />}
              disabled
              color="#1D9BF0"
            />
            <ToolbarIcon
              icon={<Smile className="h-[19px] w-[19px]" />}
              disabled
              color="#1D9BF0"
            />
          </div>

          {/* Character-count ring, X-style */}
          {caption.length > 0 && (
            <div className="flex items-center gap-3 pr-1">
              <svg width="24" height="24" viewBox="0 0 24 24" className="flex-shrink-0">
                <circle cx="12" cy="12" r="10" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="2" />
                <circle
                  cx="12" cy="12" r="10" fill="none"
                  stroke={ringOver ? "#F4212E" : ringWarn ? "#FFD400" : "#1D9BF0"}
                  strokeWidth="2"
                  strokeDasharray={`${Math.min(ringPct, 100) * 0.628} 62.8`}
                  strokeLinecap="round"
                  transform="rotate(-90 12 12)"
                />
              </svg>
              {ringWarn && (
                <span className={`text-xs font-medium ${ringOver ? "text-[#F4212E]" : "text-[#FFD400]"}`}>
                  {charsLeft}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Hidden file inputs */}
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime,video/webm"
        multiple
        className="hidden"
        onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ""; }}
      />
      {/* Camera capture — uses device camera directly on mobile */}
      <input
        ref={cameraRef}
        type="file"
        accept="image/*,video/*"
        capture="environment"
        className="hidden"
        onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ""; }}
      />
    </div>
  );
}

/** A single circular icon button in the compose toolbar, matching X's size/spacing/color. */
function ToolbarIcon({
  icon, onClick, disabled, color,
}: { icon: React.ReactNode; onClick?: () => void; disabled?: boolean; color: string }) {
  return (
    <motion.button
      whileTap={disabled ? undefined : { scale: 0.88 }}
      onClick={onClick}
      disabled={disabled || !onClick}
      className="grid place-items-center rounded-full"
      style={{ height: 36, width: 36, color, opacity: disabled ? 0.4 : 1 }}
    >
      {icon}
    </motion.button>
  );
}
