/**
 * Upload.tsx — Social post upload page.
 * Supports photos and videos, multiple files, preview, caption, and publish.
 * Files are uploaded to Supabase post-media bucket; posts stored in DB.
 */
import { useRef, useState, useCallback } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, Image as ImageIcon, Video, X, Check, Plus,
  Upload as UploadIcon, Music2, ChevronRight, Camera, Library,
} from "lucide-react";
import { useAppStore } from "@/lib/store";
import { uploadPostMedia, createPost } from "@/lib/postsClient";

interface MediaItem {
  file: File;
  preview: string;
  type: "photo" | "video";
  progress: number;
  url?: string;
  error?: string;
}

export default function UploadPage() {
  const [, navigate]   = useLocation();
  const user           = useAppStore((s) => s.user);
  const [items, setItems]       = useState<MediaItem[]>([]);
  const [caption, setCaption]   = useState("");
  const [publishing, setPublishing] = useState(false);
  const [published, setPublished]   = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [dragOver, setDragOver]     = useState(false);
  const fileRef   = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

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

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
  };

  const publish = async () => {
    if (!user || items.length === 0) return;
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

      const type = items.length > 1 ? "multi" : items[0].type === "video" ? "video" : "photo";
      await createPost({ caption: caption.trim() || undefined, type, media: uploaded });

      setPublished(true);
      setTimeout(() => navigate("/"), 1400);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed. Please try again.");
    } finally {
      setPublishing(false);
    }
  };

  if (!user) return null;

  return (
    <div className="app-bg min-h-[100dvh] pb-28 overflow-y-auto scroll-native">
      {/* Header */}
      <div className="app-header sticky top-0 z-40 flex items-center gap-3 px-4 py-3">
        <button
          onClick={() => navigate(-1 as any)}
          className="rounded-full p-2 app-surface"
          aria-label="Back"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-lg font-bold app-text flex-1">New Post</h1>
        {items.length > 0 && !published && (
          <motion.button
            whileTap={{ scale: 0.94 }}
            onClick={publish}
            disabled={publishing}
            className="px-4 py-2 rounded-2xl font-bold text-sm text-white disabled:opacity-50"
            style={{ background: "linear-gradient(135deg,var(--accent-primary),var(--accent-secondary))" }}
          >
            {publishing ? "Publishing…" : "Publish"}
          </motion.button>
        )}
      </div>

      <div className="px-4 pt-2 space-y-4">
        {/* Error */}
        {error && (
          <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
            {error}
          </div>
        )}

        {/* Success */}
        <AnimatePresence>
          {published && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="rounded-2xl bg-emerald-500/15 border border-emerald-400/30 px-4 py-3 flex items-center gap-3"
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

        {/* Drop zone */}
        {items.length === 0 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileRef.current?.click()}
            className="relative cursor-pointer rounded-3xl border-2 border-dashed flex flex-col items-center justify-center py-16 gap-4 transition-colors"
            style={{
              borderColor: dragOver ? "var(--accent-primary)" : "rgba(255,255,255,0.12)",
              background: dragOver ? "rgba(168,85,247,0.06)" : "rgba(255,255,255,0.02)",
            }}
          >
            <div
              className="h-16 w-16 rounded-2xl grid place-items-center"
              style={{ background: "linear-gradient(135deg,rgba(168,85,247,0.2),rgba(236,72,153,0.15))", border: "1px solid rgba(168,85,247,0.3)" }}
            >
              <UploadIcon className="h-7 w-7 text-white/70" />
            </div>
            <div className="text-center">
              <p className="text-sm font-semibold app-text">Select photos or videos</p>
              <p className="text-xs app-text-muted mt-1">Up to 10 files · JPG, PNG, MP4, MOV</p>
            </div>
            {/* Quick-pick buttons */}
            <div className="flex gap-3 w-full px-4">
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={(e) => { e.stopPropagation(); cameraRef.current?.click(); }}
                className="flex flex-1 items-center justify-center gap-2 rounded-2xl py-3 text-sm font-semibold text-white"
                style={{ background: "linear-gradient(135deg,rgba(168,85,247,0.3),rgba(236,72,153,0.2))", border: "1px solid rgba(168,85,247,0.3)" }}
              >
                <Camera className="h-4 w-4" /> Camera
              </motion.button>
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={(e) => { e.stopPropagation(); fileRef.current?.click(); }}
                className="flex flex-1 items-center justify-center gap-2 rounded-2xl py-3 text-sm font-semibold app-text"
                style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}
              >
                <Library className="h-4 w-4" /> Library
              </motion.button>
            </div>
          </motion.div>
        )}

        {/* Media grid */}
        {items.length > 0 && (
          <div>
            <div className="grid grid-cols-3 gap-2">
              {items.map((item, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="relative aspect-square rounded-2xl overflow-hidden bg-white/5"
                >
                  {item.type === "video" ? (
                    <video
                      src={item.preview}
                      className="w-full h-full object-cover"
                      muted
                      playsInline
                    />
                  ) : (
                    <img
                      src={item.preview}
                      alt=""
                      className="w-full h-full object-cover"
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
                      className="absolute top-1.5 right-1.5 h-5 w-5 rounded-full bg-black/70 grid place-items-center"
                    >
                      <X className="h-3 w-3 text-white" />
                    </button>
                  )}
                </motion.div>
              ))}

              {/* Add more */}
              {items.length < 10 && !publishing && (
                <motion.button
                  whileTap={{ scale: 0.94 }}
                  onClick={() => fileRef.current?.click()}
                  className="aspect-square rounded-2xl border-2 border-dashed grid place-items-center"
                  style={{ borderColor: "rgba(255,255,255,0.12)" }}
                >
                  <Plus className="h-6 w-6 app-text-muted" />
                </motion.button>
              )}
            </div>
          </div>
        )}

        {/* Caption */}
        {items.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-3"
          >
            <textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value.slice(0, 2200))}
              placeholder="Write a caption…"
              rows={4}
              disabled={publishing}
              className="w-full rounded-2xl px-4 py-3 text-sm app-text placeholder:app-text-muted resize-none outline-none focus:border-white/25 disabled:opacity-50"
              style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
            />
            <div className="text-right text-[11px] app-text-muted">{caption.length}/2200</div>

            {/* Music — architecture placeholder (not fake) */}
            <div
              className="flex items-center justify-between rounded-2xl px-4 py-3 app-surface"
              style={{ border: "1px solid rgba(255,255,255,0.06)" }}
            >
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-xl grid place-items-center"
                  style={{ background: "linear-gradient(135deg,rgba(168,85,247,0.2),rgba(236,72,153,0.15))" }}>
                  <Music2 className="h-4 w-4 text-purple-400" />
                </div>
                <div>
                  <p className="text-sm font-medium app-text">Add Sound</p>
                  <p className="text-xs app-text-muted">Music library — coming soon</p>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 app-text-muted" />
            </div>
          </motion.div>
        )}

        {/* Publish button (bottom) */}
        {items.length > 0 && !published && (
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={publish}
            disabled={publishing}
            className="w-full py-3.5 rounded-2xl font-bold text-sm text-white disabled:opacity-50"
            style={{ background: "linear-gradient(135deg,var(--accent-primary),var(--accent-secondary))" }}
          >
            {publishing ? "Publishing…" : "Publish Post"}
          </motion.button>
        )}
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
