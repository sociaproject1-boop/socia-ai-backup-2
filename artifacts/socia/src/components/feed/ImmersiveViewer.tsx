/**
 * ImmersiveViewer.tsx — TikTok/Reels-style fullscreen media viewer.
 *
 * Features:
 *  - True fullscreen via React portal (escapes AppShell stacking context)
 *  - Videos: auto-play, tap to pause/resume, NO browser controls, custom mute
 *  - Images: swipe left/right with momentum, smooth AnimatePresence transitions
 *  - Swipe up → next post in feed, swipe down → prev post (or close)
 *  - Right-side TikTok action bar: Avatar, Like, Comment, Save, Share
 *  - Bottom-left overlay: author, caption, view count
 *  - No scroll indicators, no browser chrome feel
 */
import {
  useState, useRef, useCallback, useEffect,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, Heart, MessageCircle, Bookmark, Share2, Volume2, VolumeX,
  Eye, ChevronLeft, ChevronRight, Play, BadgeCheck,
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
  onMuteToggle,
  muted,
}: {
  url:          string;
  active:       boolean;
  muted:        boolean;
  onMuteToggle: () => void;
}) {
  const videoRef    = useRef<HTMLVideoElement>(null);
  const [playing,   setPlaying]   = useState(false);
  const [buffering, setBuffering] = useState(false);

  /* Play/pause when active changes */
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (active) {
      v.muted = muted;
      v.currentTime = 0;
      v.play().then(() => setPlaying(true)).catch(() => {});
    } else {
      v.pause();
      setPlaying(false);
    }
  }, [active, url]);

  /* Keep video muted prop in sync */
  useEffect(() => {
    const v = videoRef.current;
    if (v) v.muted = muted;
  }, [muted]);

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (playing) { v.pause(); setPlaying(false); }
    else { v.play().then(() => setPlaying(true)).catch(() => {}); }
  }, [playing]);

  return (
    <div className="absolute inset-0" onClick={togglePlay}>
      <video
        ref={videoRef}
        src={url}
        loop
        playsInline
        muted={muted}
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

      {/* Play indicator (flash on tap) */}
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

      {/* Mute toggle — top-left, below close button */}
      <button
        onClick={(e) => { e.stopPropagation(); onMuteToggle(); }}
        onTouchEnd={(e) => { e.stopPropagation(); onMuteToggle(); }}
        className="absolute grid place-items-center rounded-full bg-black/50 backdrop-blur-sm z-20"
        style={{ top: 56, left: 16, width: 34, height: 34 }}
        aria-label={muted ? "Unmute" : "Mute"}
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
  const [dir, setDir] = useState(0);

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
    if (Math.abs(dx) > 50 && Math.abs(dx) > dy * 1.5) {
      onSwipeCapture(true);
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

      {/* Frame dots — top-center, clear of everything */}
      {(media?.length ?? 0) > 1 && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 flex gap-1.5 z-20">
          {media!.map((_, i) => (
            <div key={i} className="h-1 rounded-full transition-all duration-200"
              style={{ width: i === idx ? 16 : 6, background: i === idx ? "white" : "rgba(255,255,255,0.4)" }} />
          ))}
        </div>
      )}

      {/* Edge tap zones */}
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
  const [, navigate]  = useLocation();
  const [postIdx, setPostIdx]     = useState(startIndex);
  const [heartBurst, setHeartBurst] = useState(false);
  const [muted, setMuted]           = useState(true);

  const touchStartY   = useRef<number | null>(null);
  const touchStartX   = useRef<number | null>(null);
  const swipeCaptured = useRef(false);

  const post   = posts[postIdx];
  const author = post?.author;

  /* Keyboard close */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  /* Lock body scroll */
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

  /* Vertical swipe between posts */
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
        if (postIdx > 0) setPostIdx((i) => i - 1);
        else onClose();
      } else {
        if (postIdx < posts.length - 1) setPostIdx((i) => i + 1);
      }
    }
    touchStartY.current = null;
    touchStartX.current = null;
  };

  if (!post) { onClose(); return null; }

  const firstMedia = post.media?.[0];
  const isVideo    = firstMedia?.type === "video";

  /* Bottom safe inset as inline style value */
  const safeBottom = "env(safe-area-inset-bottom, 0px)";

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      className="fixed inset-0 bg-black"
      style={{ zIndex: 99999, touchAction: "none", overflow: "hidden" }}
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
            <ImmersiveVideo
              url={firstMedia!.url}
              active={true}
              muted={muted}
              onMuteToggle={() => setMuted((m) => !m)}
            />
          ) : (
            <ImmersiveImages
              media={post.media}
              onSwipeCapture={(c) => { swipeCaptured.current = c; }}
            />
          )}
        </motion.div>
      </AnimatePresence>

      {/* ── Gradient overlays ─────────────────────────────────────────── */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 z-10"
        style={{ height: 120, background: "linear-gradient(to bottom, rgba(0,0,0,0.6) 0%, transparent 100%)" }}
      />
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 z-10"
        style={{ height: 320, background: "linear-gradient(to top, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.5) 50%, transparent 100%)" }}
      />

      {/* ── Close button ──────────────────────────────────────────────── */}
      <button
        onClick={(e) => { e.stopPropagation(); onClose(); }}
        className="absolute z-30 grid place-items-center text-white"
        style={{ top: "env(safe-area-inset-top, 12px)", left: 12, width: 44, height: 44 }}
        aria-label="Close"
      >
        <X className="h-6 w-6 drop-shadow-md" />
      </button>

      {/* ── Right action bar — TikTok style ───────────────────────────── */}
      <div
        className="absolute right-3 z-30 flex flex-col items-center gap-5"
        style={{ bottom: `calc(${safeBottom} + 88px)` }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Profile avatar */}
        <button
          className="relative flex-shrink-0"
          onClick={() => { onClose(); navigate(`/profile/${author?.id}`); }}
          aria-label="View profile"
        >
          {author?.avatar_url ? (
            <img
              src={author.avatar_url}
              alt=""
              className="rounded-full object-cover"
              style={{ width: 44, height: 44, border: "1.5px solid rgba(255,255,255,0.45)" }}
            />
          ) : (
            <div
              className="rounded-full grid place-items-center text-sm font-bold text-white"
              style={{
                width: 44, height: 44,
                background: "linear-gradient(135deg,var(--accent-primary),var(--accent-secondary))",
              }}
            >
              {(author?.name || "?").charAt(0).toUpperCase()}
            </div>
          )}
        </button>

        {/* Like */}
        <motion.button
          whileTap={{ scale: 0.8 }}
          onClick={() => onLike(post.id)}
          className="flex flex-col items-center gap-1"
          aria-label="Like"
        >
          <Heart
            className="h-7 w-7 drop-shadow-lg transition-all"
            style={{
              fill: post.has_liked ? "#f43f5e" : "transparent",
              color: post.has_liked ? "#f43f5e" : "white",
              filter: post.has_liked ? "drop-shadow(0 0 8px #f43f5e80)" : undefined,
            }}
          />
          <span className="text-[11px] font-semibold text-white drop-shadow leading-none">
            {fmtCount(post.like_count ?? 0)}
          </span>
        </motion.button>

        {/* Comment */}
        <motion.button
          whileTap={{ scale: 0.8 }}
          onClick={() => { onClose(); onComment(post.id); }}
          className="flex flex-col items-center gap-1"
          aria-label="Comment"
        >
          <MessageCircle className="h-7 w-7 text-white drop-shadow-lg" />
          <span className="text-[11px] font-semibold text-white drop-shadow leading-none">
            {fmtCount(post.comment_count ?? 0)}
          </span>
        </motion.button>

        {/* Save */}
        <motion.button
          whileTap={{ scale: 0.8 }}
          onClick={() => onSave(post.id)}
          className="flex flex-col items-center gap-1"
          aria-label={post.has_saved ? "Unsave" : "Save"}
        >
          <Bookmark
            className="h-7 w-7 drop-shadow-lg transition-all"
            style={{
              fill: post.has_saved ? "#a855f7" : "transparent",
              color: post.has_saved ? "#a855f7" : "white",
              filter: post.has_saved ? "drop-shadow(0 0 8px #a855f780)" : undefined,
            }}
          />
          <span className="text-[11px] font-semibold text-white drop-shadow leading-none">
            {post.has_saved ? "Saved" : "Save"}
          </span>
        </motion.button>

        {/* Share */}
        <motion.button
          whileTap={{ scale: 0.8 }}
          onClick={() => {
            if (navigator.share) {
              navigator.share({
                title: post.caption ?? "Check this out on Socia",
                url: `${window.location.origin}/post/${post.id}`,
              }).catch(() => {});
            }
          }}
          className="flex flex-col items-center gap-1"
          aria-label="Share"
        >
          <Share2 className="h-6 w-6 text-white drop-shadow-lg" />
          <span className="text-[11px] font-semibold text-white drop-shadow leading-none">Share</span>
        </motion.button>
      </div>

      {/* ── Bottom-left overlay — author + caption ─────────────────────── */}
      <div
        className="absolute left-0 z-20 flex flex-col gap-2"
        style={{
          bottom: 0,
          right: 80,
          paddingLeft: 16,
          paddingRight: 12,
          paddingBottom: `calc(${safeBottom} + 24px)`,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Author row */}
        <div className="flex items-center gap-2.5">
          {author?.avatar_url ? (
            <img
              src={author.avatar_url}
              alt=""
              className="rounded-full object-cover flex-shrink-0 cursor-pointer"
              style={{ width: 38, height: 38, border: "1.5px solid rgba(255,255,255,0.35)" }}
              onClick={() => { onClose(); navigate(`/profile/${author.id}`); }}
            />
          ) : (
            <div
              className="rounded-full grid place-items-center text-sm font-bold text-white flex-shrink-0 cursor-pointer"
              style={{
                width: 38, height: 38,
                background: "linear-gradient(135deg,var(--accent-primary),var(--accent-secondary))",
              }}
              onClick={() => { onClose(); navigate(`/profile/${author?.id}`); }}
            >
              {(author?.name || "?").charAt(0).toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-1 flex-wrap">
              <span
                className="text-[14px] font-bold text-white cursor-pointer leading-tight"
                onClick={() => { onClose(); navigate(`/profile/${author?.id}`); }}
              >
                {author?.name || author?.username || "Creator"}
              </span>
              {(author?.is_owner ||
                (author?.is_verified &&
                  (author?.subscription_status === "active" ||
                   author?.subscription_status === "owner"))) && (
                <BadgeCheck className="h-4 w-4 flex-shrink-0" style={{ color: "var(--accent-primary)" }} />
              )}
            </div>
            {author?.username && (
              <p className="text-[11px] text-white/60 leading-tight">@{author.username}</p>
            )}
          </div>
        </div>

        {/* Caption */}
        {post.caption && <CaptionText caption={post.caption} />}

        {/* View count */}
        <div className="flex items-center gap-1.5">
          <Eye className="h-3.5 w-3.5 text-white/45 flex-shrink-0" />
          <span className="text-[11px] text-white/45">{fmtCount(post.view_count ?? 0)} views</span>
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
    </motion.div>
  );
}

/* ── Caption with "see more" expand ─────────────────────────────────────── */
function CaptionText({ caption }: { caption: string }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = caption.length > 90;

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
        <button
          onClick={(e) => { e.stopPropagation(); setExpanded(true); }}
          className="text-[12px] text-white/55 mt-0.5"
        >
          see more
        </button>
      )}
    </div>
  );
}
