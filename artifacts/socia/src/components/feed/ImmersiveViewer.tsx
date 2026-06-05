/**
 * ImmersiveViewer.tsx — TikTok/Reels-style fullscreen media viewer.
 *
 * Features:
 *  - 9:16 portrait fullscreen overlay (covers entire viewport)
 *  - Videos: auto-play, tap to pause/resume, NO browser controls, custom mute
 *  - Images: swipe left/right with momentum, smooth AnimatePresence transitions
 *  - Swipe up → next post in feed, swipe down → prev post (or close)
 *  - Right-side vertical action bar: Like, Comment, Save, Share
 *  - Bottom overlay: author, caption, view count
 *  - Keyboard/back gesture closes the viewer
 */
import {
  useState, useRef, useCallback, useEffect,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, Heart, MessageCircle, Bookmark, Share2, Volume2, VolumeX,
  Eye, ChevronLeft, ChevronRight, Play, Pause, BadgeCheck,
} from "lucide-react";
import { useLocation } from "wouter";
import type { SocialPost } from "@/lib/postsClient";

/* ── Helpers ─────────────────────────────────────────────────────────────── */
function fmtCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

/* ── Props ───────────────────────────────────────────────────────────────── */
export interface ImmersiveViewerProps {
  posts:        SocialPost[];
  startIndex:   number;
  onClose:      () => void;
  onLike:       (postId: string) => void;
  onSave:       (postId: string) => void;
  onComment:    (postId: string) => void;
}

/* ── Custom video layer (zero browser chrome) ───────────────────────────── */
function ImmersiveVideo({
  url,
  active,
}: {
  url:    string;
  active: boolean;
}) {
  const videoRef  = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [muted,   setMuted]   = useState(true);
  const [buffering, setBuffering] = useState(false);

  /* Play/pause when active changes */
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (active) {
      v.muted = true;
      setMuted(true);
      v.currentTime = 0;
      v.play().then(() => setPlaying(true)).catch(() => {});
    } else {
      v.pause();
      setPlaying(false);
    }
  }, [active, url]);

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (playing) { v.pause(); setPlaying(false); }
    else { v.play().then(() => setPlaying(true)).catch(() => {}); }
  }, [playing]);

  const toggleMute = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation();
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
  }, []);

  return (
    <div className="absolute inset-0" onClick={togglePlay}>
      <video
        ref={videoRef}
        src={url}
        loop
        playsInline
        muted
        preload="auto"
        onWaiting={() => setBuffering(true)}
        onCanPlay={() => setBuffering(false)}
        onPlay={() => { setPlaying(true); setBuffering(false); }}
        onPause={() => setPlaying(false)}
        className="h-full w-full object-cover"
        style={{ display: "block" }}
      />

      {/* Buffering spinner */}
      {buffering && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-10 w-10 rounded-full border-2 border-white/30 border-t-white animate-spin" />
        </div>
      )}

      {/* Play/Pause indicator (flash on tap) */}
      <AnimatePresence>
        {!playing && !buffering && (
          <motion.div
            key="pause"
            initial={{ opacity: 0, scale: 0.7 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.1 }}
            transition={{ duration: 0.18 }}
            className="pointer-events-none absolute inset-0 flex items-center justify-center"
          >
            <div className="grid h-16 w-16 place-items-center rounded-full bg-black/50 backdrop-blur-sm">
              <Play className="h-7 w-7 fill-white text-white ml-1" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mute toggle — bottom-left */}
      <button
        onClick={toggleMute}
        onTouchEnd={toggleMute}
        className="absolute bottom-28 left-4 grid h-9 w-9 place-items-center rounded-full bg-black/50 backdrop-blur-sm z-20"
      >
        {muted
          ? <VolumeX className="h-4 w-4 text-white" />
          : <Volume2 className="h-4 w-4 text-white" />
        }
      </button>
    </div>
  );
}

/* ── Image frame layer with swipe ────────────────────────────────────────── */
function ImmersiveImages({
  media,
  onSwipeCapture,
}: {
  media: SocialPost["media"];
  onSwipeCapture: (captured: boolean) => void;
}) {
  const [idx, setIdx] = useState(0);
  const touchX  = useRef<number | null>(null);
  const touchY  = useRef<number | null>(null);
  const [dir, setDir] = useState(0); // -1 = left, 1 = right

  const goTo = useCallback((next: number) => {
    setDir(next > idx ? -1 : 1);
    setIdx(next);
  }, [idx]);

  const onTouchStart = (e: React.TouchEvent) => {
    touchX.current = e.touches[0].clientX;
    touchY.current = e.touches[0].clientY;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchX.current === null || !media?.length) return;
    const dx = e.changedTouches[0].clientX - touchX.current;
    const dy = Math.abs(e.changedTouches[0].clientY - (touchY.current ?? 0));
    /* Only capture horizontal swipes that aren't vertical scrolls */
    if (Math.abs(dx) > 50 && Math.abs(dx) > dy * 1.5) {
      onSwipeCapture(true); /* tell parent this was a horizontal swipe */
      if (dx < 0 && idx < media.length - 1) goTo(idx + 1);
      if (dx > 0 && idx > 0)               goTo(idx - 1);
    } else {
      onSwipeCapture(false);
    }
    touchX.current = null;
    touchY.current = null;
  };

  const current = media?.[idx];

  return (
    <div
      className="absolute inset-0 overflow-hidden"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.img
          key={idx}
          src={current?.url}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          draggable={false}
          initial={{ x: dir * -30, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: dir * 30, opacity: 0 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
        />
      </AnimatePresence>

      {/* Frame dots */}
      {(media?.length ?? 0) > 1 && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 flex gap-1.5 z-20">
          {media!.map((_, i) => (
            <div key={i} className="h-1 rounded-full transition-all duration-200"
              style={{ width: i === idx ? 16 : 6, background: i === idx ? "white" : "rgba(255,255,255,0.4)" }} />
          ))}
        </div>
      )}

      {/* Edge tap zones for non-touch */}
      {idx > 0 && (
        <button
          aria-label="Previous"
          onClick={() => goTo(idx - 1)}
          className="absolute left-3 top-1/2 -translate-y-1/2 grid h-10 w-10 place-items-center rounded-full bg-black/40 backdrop-blur-sm z-20"
        >
          <ChevronLeft className="h-5 w-5 text-white" />
        </button>
      )}
      {idx < (media?.length ?? 1) - 1 && (
        <button
          aria-label="Next"
          onClick={() => goTo(idx + 1)}
          className="absolute right-3 top-1/2 -translate-y-1/2 grid h-10 w-10 place-items-center rounded-full bg-black/40 backdrop-blur-sm z-20"
        >
          <ChevronRight className="h-5 w-5 text-white" />
        </button>
      )}
    </div>
  );
}

/* ── Main viewer ─────────────────────────────────────────────────────────── */
export function ImmersiveViewer({
  posts,
  startIndex,
  onClose,
  onLike,
  onSave,
  onComment,
}: ImmersiveViewerProps) {
  const [, navigate] = useLocation();
  const [postIdx, setPostIdx] = useState(startIndex);
  const [heartBurst, setHeartBurst] = useState(false);

  /* Gesture tracking for swipe-up/down between posts */
  const touchStartY   = useRef<number | null>(null);
  const touchStartX   = useRef<number | null>(null);
  const swipeCaptured = useRef(false); /* set true by ImmersiveImages when it handles an H-swipe */

  const post = posts[postIdx];

  /* Keyboard close */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  /* Lock body scroll while open */
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  /* Double-tap to like */
  const lastTap = useRef(0);
  const handleTap = useCallback(() => {
    const now = Date.now();
    if (now - lastTap.current < 300) {
      if (!post.has_liked) {
        onLike(post.id);
        setHeartBurst(true);
        setTimeout(() => setHeartBurst(false), 900);
      }
      lastTap.current = 0;
    } else {
      lastTap.current = now;
    }
  }, [post, onLike]);

  /* Vertical swipe handlers (post navigation) */
  const onTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
    touchStartX.current = e.touches[0].clientX;
    swipeCaptured.current = false;
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStartY.current === null || swipeCaptured.current) return;
    const dy = e.changedTouches[0].clientY - touchStartY.current;
    const dx = Math.abs(e.changedTouches[0].clientX - (touchStartX.current ?? 0));
    if (Math.abs(dy) > 80 && Math.abs(dy) > dx) {
      if (dy > 0) {
        /* Swipe down → prev post or close */
        if (postIdx > 0) setPostIdx((i) => i - 1);
        else onClose();
      } else {
        /* Swipe up → next post */
        if (postIdx < posts.length - 1) setPostIdx((i) => i + 1);
      }
    }
    touchStartY.current = null;
    touchStartX.current = null;
  };

  if (!post) { onClose(); return null; }

  const firstMedia  = post.media?.[0];
  const isVideo     = firstMedia?.type === "video";
  const author      = post.author;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      className="fixed inset-0 z-[9999] bg-black"
      style={{ touchAction: "none" }}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      onClick={handleTap}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* ── Media layer ───────────────────────────────────────────────── */}
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={`post-${postIdx}`}
          className="absolute inset-0"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
        >
          {isVideo ? (
            <ImmersiveVideo url={firstMedia!.url} active={true} />
          ) : (
            <ImmersiveImages
              media={post.media}
              onSwipeCapture={(c) => { swipeCaptured.current = c; }}
            />
          )}
        </motion.div>
      </AnimatePresence>

      {/* ── Gradient overlays ─────────────────────────────────────────── */}
      {/* Top gradient (for close button readability) */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-40 z-10"
        style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0.55) 0%, transparent 100%)" }} />
      {/* Bottom gradient (for overlay readability) */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-80 z-10"
        style={{ background: "linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.4) 60%, transparent 100%)" }} />

      {/* ── Close button ──────────────────────────────────────────────── */}
      <button
        onClick={(e) => { e.stopPropagation(); onClose(); }}
        className="absolute top-0 left-0 z-30 grid h-12 w-12 place-items-center text-white"
        style={{ paddingTop: "env(safe-area-inset-top, 16px)", paddingLeft: 16 }}
        aria-label="Close"
      >
        <X className="h-6 w-6 drop-shadow-md" />
      </button>

      {/* ── Right action bar ──────────────────────────────────────────── */}
      <div
        className="absolute right-4 bottom-24 z-30 flex flex-col items-center gap-6"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Like */}
        <motion.button
          whileTap={{ scale: 0.8 }}
          onClick={() => onLike(post.id)}
          className="flex flex-col items-center gap-1"
        >
          <div className="grid h-12 w-12 place-items-center">
            <Heart
              className="h-7 w-7 drop-shadow-lg transition-transform"
              style={{
                fill: post.has_liked ? "#f43f5e" : "transparent",
                color: post.has_liked ? "#f43f5e" : "white",
                filter: post.has_liked ? "drop-shadow(0 0 6px #f43f5e80)" : undefined,
              }}
            />
          </div>
          <span className="text-[11px] font-bold text-white drop-shadow">
            {fmtCount(post.like_count ?? 0)}
          </span>
        </motion.button>

        {/* Comment */}
        <motion.button
          whileTap={{ scale: 0.8 }}
          onClick={() => { onClose(); onComment(post.id); }}
          className="flex flex-col items-center gap-1"
        >
          <div className="grid h-12 w-12 place-items-center">
            <MessageCircle className="h-7 w-7 text-white drop-shadow-lg" />
          </div>
          <span className="text-[11px] font-bold text-white drop-shadow">
            {fmtCount(post.comment_count ?? 0)}
          </span>
        </motion.button>

        {/* Save */}
        <motion.button
          whileTap={{ scale: 0.8 }}
          onClick={() => onSave(post.id)}
          className="flex flex-col items-center gap-1"
        >
          <div className="grid h-12 w-12 place-items-center">
            <Bookmark
              className="h-7 w-7 drop-shadow-lg transition-colors"
              style={{
                fill: post.has_saved ? "#a855f7" : "transparent",
                color: post.has_saved ? "#a855f7" : "white",
                filter: post.has_saved ? "drop-shadow(0 0 6px #a855f780)" : undefined,
              }}
            />
          </div>
          <span className="text-[11px] font-bold text-white drop-shadow">
            {post.has_saved ? "Saved" : "Save"}
          </span>
        </motion.button>

        {/* Share */}
        <motion.button
          whileTap={{ scale: 0.8 }}
          onClick={() => {
            if (navigator.share) {
              navigator.share({ title: post.caption ?? "Check this out on Socia", url: window.location.origin + `/post/${post.id}` }).catch(() => {});
            }
          }}
          className="flex flex-col items-center gap-1"
        >
          <div className="grid h-12 w-12 place-items-center">
            <Share2 className="h-6 w-6 text-white drop-shadow-lg" />
          </div>
          <span className="text-[11px] font-bold text-white drop-shadow">Share</span>
        </motion.button>
      </div>

      {/* ── Bottom overlay — author + caption + view count ────────────── */}
      <div
        className="absolute inset-x-0 bottom-0 z-20 px-4 pb-8 pr-20"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 28px)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Author row */}
        <div className="flex items-center gap-2.5 mb-3">
          {author?.avatar_url ? (
            <img
              src={author.avatar_url}
              alt=""
              className="h-10 w-10 rounded-full object-cover cursor-pointer"
              style={{ border: "1.5px solid rgba(255,255,255,0.35)" }}
              onClick={() => { onClose(); navigate(`/profile/${author.id}`); }}
            />
          ) : (
            <div
              className="h-10 w-10 rounded-full grid place-items-center text-sm font-bold text-white cursor-pointer"
              style={{ background: "linear-gradient(135deg,var(--accent-primary),var(--accent-secondary))" }}
              onClick={() => { onClose(); navigate(`/profile/${author?.id}`); }}
            >
              {(author?.name || "?").charAt(0).toUpperCase()}
            </div>
          )}
          <div>
            <div className="flex items-center gap-1">
              <span
                className="text-[14px] font-bold text-white cursor-pointer"
                onClick={() => { onClose(); navigate(`/profile/${author?.id}`); }}
              >
                {author?.name || author?.username || "Creator"}
              </span>
              {(author?.is_verified || author?.is_owner) && (
                <BadgeCheck className="h-4 w-4" style={{ color: "var(--accent-primary)" }} />
              )}
            </div>
            {author?.username && (
              <p className="text-[11px] text-white/60">@{author.username}</p>
            )}
          </div>
        </div>

        {/* Caption */}
        {post.caption && (
          <CaptionText caption={post.caption} />
        )}

        {/* View count */}
        <div className="flex items-center gap-1.5 mt-2">
          <Eye className="h-3.5 w-3.5 text-white/50" />
          <span className="text-[11px] text-white/50">{fmtCount(post.view_count ?? 0)} views</span>
        </div>
      </div>

      {/* ── Double-tap heart burst ─────────────────────────────────────── */}
      <AnimatePresence>
        {heartBurst && (
          <motion.div
            key="heart-burst"
            className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center"
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1.3 }}
            exit={{ opacity: 0, scale: 1.8 }}
            transition={{ duration: 0.65, ease: "easeOut" }}
          >
            <Heart className="h-28 w-28 fill-rose-500 text-rose-500 drop-shadow-2xl" />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Post nav indicator (swipe hint) ───────────────────────────── */}
      {posts.length > 1 && (
        <div className="absolute right-2 top-1/2 -translate-y-1/2 z-30 flex flex-col gap-1 items-center">
          {posts.map((_, i) => (
            <div key={i}
              className="rounded-full transition-all duration-200"
              style={{
                width: 3,
                height: i === postIdx ? 20 : 5,
                background: i === postIdx ? "white" : "rgba(255,255,255,0.3)",
              }}
            />
          ))}
        </div>
      )}
    </motion.div>
  );
}

/* ── Caption with expand ─────────────────────────────────────────────────── */
function CaptionText({ caption }: { caption: string }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = caption.length > 100;

  return (
    <div>
      <p
        className="text-[13px] leading-snug text-white/90"
        style={expanded ? undefined : {
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
        } as React.CSSProperties}
      >
        {caption}
      </p>
      {isLong && !expanded && (
        <button onClick={() => setExpanded(true)} className="text-[12px] text-white/50 mt-0.5">
          more
        </button>
      )}
    </div>
  );
}
