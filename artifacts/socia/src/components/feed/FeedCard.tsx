import { Post } from "@/lib/store";
import { Heart, Play, Bookmark } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useLocation } from "wouter";
import { useAppStore } from "@/lib/store";
import { useRef, useState } from "react";
import { VideoPlayerModal } from "@/components/ui/VideoPlayerModal";

interface Props { post: Post; index: number }

export function FeedCard({ post, index }: Props) {
  const [, navigate] = useLocation();
  const author = useAppStore.getState().user;
  const toggleLike     = useAppStore((s) => s.toggleLike);
  const toggleSavePost = useAppStore((s) => s.toggleSavePost);
  const savedPostIds   = useAppStore((s) => s.savedPostIds);

  const [imgLoaded, setImgLoaded] = useState(false);
  const [burstKey,  setBurstKey]  = useState(0);
  const [videoOpen, setVideoOpen] = useState(false);
  const lastTap = useRef(0);

  const hasVideo = Boolean(post.videoUrl);
  const isSaved  = savedPostIds.includes(post.id);

  // Masonry variety
  const aspect = index % 5 === 0 ? "3/4" : index % 7 === 0 ? "1/1" : "9/13";

  const handleTap = () => {
    const now = Date.now();
    if (now - lastTap.current < 280) {
      if (!post.hasLiked) toggleLike(post.id);
      setBurstKey((k) => k + 1);
      lastTap.current = 0;
      return;
    }
    lastTap.current = now;
    setTimeout(() => {
      if (lastTap.current && Date.now() - lastTap.current >= 280) {
        navigate(`/post/${post.id}`);
        lastTap.current = 0;
      }
    }, 290);
  };

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.24, delay: Math.min(index * 0.02, 0.18), ease: [0.22, 1, 0.36, 1] }}
        className="break-inside-avoid mb-3 gpu"
      >
        <motion.div
          whileTap={{ scale: 0.97 }}
          onClick={handleTap}
          role="button"
          tabIndex={0}
          className="group relative block w-full overflow-hidden gpu app-card"
          style={{ aspectRatio: aspect, borderRadius: 18 }}
        >
          {/* Skeleton */}
          {!imgLoaded && <div className="absolute inset-0 shimmer" />}

          <img
            src={post.imageUrl}
            alt={post.prompt}
            loading="lazy"
            decoding="async"
            onLoad={() => setImgLoaded(true)}
            className={"absolute inset-0 h-full w-full object-cover transition-opacity duration-300 " + (imgLoaded ? "opacity-100" : "opacity-0")}
          />

          {/* Duration badge */}
          {post.duration && (
            <span
              className="absolute right-2 top-2 rounded-full px-2 py-0.5 text-[9.5px] font-semibold text-white"
              style={{ background: "rgba(0,0,0,0.55)" }}
            >
              {post.duration}
            </span>
          )}

          {/* Play button */}
          {hasVideo && (
            <motion.span
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.12, type: "spring", stiffness: 320, damping: 24 }}
              whileTap={{ scale: 0.85 }}
              className="absolute inset-0 grid place-items-center"
              onClick={(e) => { e.stopPropagation(); setVideoOpen(true); }}
            >
              <span
                className="grid h-11 w-11 place-items-center rounded-full text-white"
                style={{
                  background: "linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))",
                  border: "1.5px solid rgba(255,255,255,0.18)",
                  boxShadow: "0 4px 20px -4px var(--accent-glow)",
                }}
              >
                <Play style={{ width: 18, height: 18, fill: "white" }} />
              </span>
            </motion.span>
          )}

          {/* Double-tap heart */}
          <AnimatePresence>
            {burstKey > 0 && (
              <motion.span key={burstKey} className="pointer-events-none absolute left-1/2 top-1/2">
                <span className="block heart-burst">
                  <Heart style={{ width: 76, height: 76, fill: "#ec4899", color: "#ec4899", filter: "drop-shadow(0 0 16px rgba(236,72,153,0.7))" }} />
                </span>
              </motion.span>
            )}
          </AnimatePresence>

          {/* Bottom overlay */}
          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 p-2.5"
            style={{ background: "linear-gradient(to top, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0.25) 55%, transparent 100%)" }}
          >
            <div className="flex items-end justify-between gap-1">
              <div className="flex items-center gap-1.5 min-w-0">
                <img src={author?.avatar} alt="" className="h-5 w-5 shrink-0 rounded-full object-cover" style={{ border: "1px solid rgba(255,255,255,0.2)" }} />
                <span className="truncate text-[10.5px] font-medium text-white">@{author?.handle}</span>
              </div>
              <div className="pointer-events-auto flex items-center gap-2">
                {/* Save */}
                <motion.span whileTap={{ scale: 0.78 }} role="button"
                  onClick={(e) => { e.stopPropagation(); toggleSavePost(post.id); }}
                >
                  <Bookmark style={{ width: 13, height: 13, fill: isSaved ? "var(--accent-primary)" : "none", color: isSaved ? "var(--accent-primary)" : "white" }} />
                </motion.span>
                {/* Like */}
                <motion.span whileTap={{ scale: 0.78 }} role="button"
                  onClick={(e) => { e.stopPropagation(); toggleLike(post.id); if (!post.hasLiked) setBurstKey((k) => k + 1); }}
                  className="flex items-center gap-0.5"
                >
                  <Heart style={{ width: 13, height: 13, fill: post.hasLiked ? "#ec4899" : "none", color: post.hasLiked ? "#ec4899" : "white" }} />
                  <span className="text-[10.5px] font-semibold text-white">{fmt(post.likes)}</span>
                </motion.span>
              </div>
            </div>
          </div>
        </motion.div>
      </motion.div>

      {hasVideo && (
        <VideoPlayerModal videoUrl={post.videoUrl!} posterUrl={post.imageUrl} open={videoOpen} onClose={() => setVideoOpen(false)} />
      )}
    </>
  );
}

function fmt(n: number) {
  if (n < 1000) return String(n);
  if (n < 10000) return (n / 1000).toFixed(1) + "k";
  if (n < 1_000_000) return Math.floor(n / 1000) + "k";
  return (n / 1_000_000).toFixed(1) + "m";
}
