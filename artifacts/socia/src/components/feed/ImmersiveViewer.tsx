/**
 * ImmersiveViewer.tsx — Production TikTok-grade fullscreen media viewer.
 *
 * Architecture:
 *  - Rendered via React portal into document.body (escapes AppShell stacking context)
 *  - Videos: auto-mount-play (tries unmuted first, silent muted fallback), auto-pause on unmount
 *  - Images: swipe left/right with momentum; object-contain preserves every aspect ratio
 *  - Swipe up → next post, swipe down → prev post / close, browser back → close
 *  - Right action bar: Avatar → Like → Comment → Save → Share (TikTok order)
 *  - Bottom-left: author + badge + caption + view count
 *  - Adjacent media preloaded via hidden <video preload="auto">
 *  - Comments: opens TikTok-style bottom sheet (does NOT close viewer or navigate)
 *  - No dot indicators, no page counter — clean TikTok-style
 */
import {
  useState, useRef, useCallback, useEffect, memo,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Heart, MessageCircle, Bookmark, Share2,
  Eye, ChevronLeft, ChevronRight, Play, BadgeCheck,
} from "lucide-react";
import { useLocation } from "wouter";
import type { SocialPost } from "@/lib/postsClient";
import { CommentsSheet } from "./CommentsSheet";

/* ── Helpers ─────────────────────────────────────────────────────────────── */
function fmtCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

/* ── Slide variants (direction-aware) ────────────────────────────────────── */
const slideVariants = {
  enter: (dir: number) => ({
    opacity: 0,
    y: dir >= 0 ? 48 : -48,
  }),
  center: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.22, ease: [0.25, 0.46, 0.45, 0.94] as const },
  },
  exit: (dir: number) => ({
    opacity: 0,
    y: dir >= 0 ? -48 : 48,
    transition: { duration: 0.18, ease: [0.25, 0.46, 0.45, 0.94] as const },
  }),
};

/* ── Props ───────────────────────────────────────────────────────────────── */
export interface ImmersiveViewerProps {
  posts:      SocialPost[];
  startIndex: number;
  onClose:    () => void;
  onLike:     (postId: string) => void;
  onSave:     (postId: string) => void;
  onCommentCountChange?: (postId: string, delta: number) => void;
}

/* ─────────────────────────────────────────────────────────────────────────
   ImmersiveVideo — auto-plays on mount, auto-pauses on unmount.
   • Attempts unmuted autoplay first (per browser policy)
   • Falls back to muted silently (no visible error, no mute button)
   • object-contain → NEVER stretches or crops
   • No browser chrome (controls hidden)
───────────────────────────────────────────────────────────────────────── */
const ImmersiveVideo = memo(function ImmersiveVideo({
  url,
  onSwipeCaptured,
}: {
  url:             string;
  onSwipeCaptured: (v: boolean) => void;
}) {
  const videoRef    = useRef<HTMLVideoElement>(null);
  const [playing,   setPlaying]   = useState(false);
  const [buffering, setBuffering] = useState(true);

  /* Auto-play on mount; auto-pause + release on unmount */
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = 0;

    const tryPlay = () => {
      v.muted = false;
      return v.play().catch(() => {
        v.muted = true;
        return v.play().catch(() => {});
      });
    };

    tryPlay();

    return () => {
      v.pause();
      v.removeAttribute("src");
      v.load();
    };
  }, [url]);

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) v.play().catch(() => {});
    else          v.pause();
  }, []);

  return (
    <div
      className="absolute inset-0 flex items-center justify-center bg-black"
      onClick={togglePlay}
    >
      <video
        ref={videoRef}
        src={url}
        loop
        playsInline
        preload="auto"
        style={{
          width: "100%",
          height: "100%",
          objectFit: "contain",
          display: "block",
          background: "black",
        }}
        onWaiting={() => setBuffering(true)}
        onCanPlay={() => setBuffering(false)}
        onPlay={() => { setPlaying(true); setBuffering(false); }}
        onPause={() => setPlaying(false)}
      />

      {/* Buffering ring */}
      {buffering && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-10 w-10 rounded-full border-2 border-white/25 border-t-white animate-spin" />
        </div>
      )}

      <AnimatePresence>
        {!playing && !buffering && (
          <motion.div
            key="paused"
            initial={{ opacity: 0, scale: 0.7 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.1 }}
            transition={{ duration: 0.16 }}
            className="pointer-events-none absolute inset-0 flex items-center justify-center"
          >
            <div className="grid h-16 w-16 place-items-center rounded-full bg-black/55 backdrop-blur-sm">
              <Play className="h-7 w-7 fill-white text-white ml-1" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

/* ─────────────────────────────────────────────────────────────────────────
   ImmersiveImages — swipe left/right through multi-image posts.
   No dot indicators (TikTok-style — clean UI).
───────────────────────────────────────────────────────────────────────── */
const ImmersiveImages = memo(function ImmersiveImages({
  media,
  onSwipeCapture,
}: {
  media:          SocialPost["media"];
  onSwipeCapture: (captured: boolean) => void;
}) {
  const [idx, setIdx] = useState(0);
  const [dir, setDir] = useState(0);
  const touchX = useRef<number | null>(null);
  const touchY = useRef<number | null>(null);

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
    if (Math.abs(dx) > 48 && Math.abs(dx) > dy * 1.5) {
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
      className="absolute inset-0 flex items-center justify-center bg-black overflow-hidden"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <AnimatePresence mode="popLayout" initial={false} custom={dir}>
        <motion.img
          key={idx}
          src={current?.url}
          alt=""
          draggable={false}
          initial={{ x: dir * -40, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: dir * 40, opacity: 0 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          style={{
            maxWidth: "100%",
            maxHeight: "100%",
            width: "auto",
            height: "auto",
            objectFit: "contain",
            display: "block",
            imageRendering: "auto",
          }}
        />
      </AnimatePresence>

      {/* Edge tap zones for non-touch — no visual indicators */}
      {idx > 0 && (
        <button
          aria-label="Previous image"
          onClick={() => goTo(idx - 1)}
          className="absolute left-3 top-1/2 -translate-y-1/2 grid h-10 w-10 place-items-center rounded-full bg-black/40 backdrop-blur-sm z-20"
        >
          <ChevronLeft className="h-5 w-5 text-white" />
        </button>
      )}
      {idx < (media?.length ?? 1) - 1 && (
        <button
          aria-label="Next image"
          onClick={() => goTo(idx + 1)}
          className="absolute right-3 top-1/2 -translate-y-1/2 grid h-10 w-10 place-items-center rounded-full bg-black/40 backdrop-blur-sm z-20"
        >
          <ChevronRight className="h-5 w-5 text-white" />
        </button>
      )}
    </div>
  );
});

/* ─────────────────────────────────────────────────────────────────────────
   CaptionText — expands on "see more" tap
───────────────────────────────────────────────────────────────────────── */
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
          className="text-[12px] text-white/50 mt-0.5"
        >
          see more
        </button>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   ImmersiveViewer — main orchestrator.
   Rendered into document.body via React portal in Home.tsx.
───────────────────────────────────────────────────────────────────────── */
export function ImmersiveViewer({
  posts,
  startIndex,
  onClose,
  onLike,
  onSave,
  onCommentCountChange,
}: ImmersiveViewerProps) {
  const [, navigate]  = useLocation();
  const [postIdx, setPostIdx]       = useState(startIndex);
  const [swipeDir, setSwipeDir]     = useState(1);
  const [heartBurst, setHeartBurst] = useState(false);
  const [showComments, setShowComments] = useState(false);
  /* Local comment count state so the button updates without closing viewer */
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>({});

  const touchStartY   = useRef<number | null>(null);
  const touchStartX   = useRef<number | null>(null);
  const swipeCaptured = useRef(false);

  const post   = posts[postIdx];
  const author = post?.author;

  /* Derive comment count: prefer local delta over post.comment_count */
  const commentCount = (post?.comment_count ?? 0) + (commentCounts[post?.id] ?? 0);

  /* Handle comment count delta from CommentsSheet */
  const handleCommentCountChange = useCallback((delta: number) => {
    if (!post) return;
    setCommentCounts((prev) => ({
      ...prev,
      [post.id]: (prev[post.id] ?? 0) + delta,
    }));
    onCommentCountChange?.(post.id, delta);
  }, [post, onCommentCountChange]);

  /* Escape key / hardware back → close (if comments not open) */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (showComments) setShowComments(false);
        else onClose();
      }
    };
    window.addEventListener("keydown", onKey);

    window.history.pushState({ immersiveViewer: true }, "");
    const onPop = () => {
      if (showComments) setShowComments(false);
      else onClose();
    };
    window.addEventListener("popstate", onPop);

    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("popstate", onPop);
    };
  }, [onClose, showComments]);

  /* Lock body scroll while open */
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  /* Double-tap to like */
  const lastTap = useRef(0);
  const handleTap = useCallback(() => {
    if (showComments) return;
    const now = Date.now();
    if (now - lastTap.current < 300) {
      if (!post?.has_liked) {
        onLike(post.id);
        setHeartBurst(true);
        setTimeout(() => setHeartBurst(false), 900);
      }
      lastTap.current = 0;
    } else {
      lastTap.current = now;
    }
  }, [post, onLike, showComments]);

  /* Vertical swipe navigation — disabled when comments sheet is open */
  const onTouchStart = (e: React.TouchEvent) => {
    if (showComments) return;
    touchStartY.current = e.touches[0].clientY;
    touchStartX.current = e.touches[0].clientX;
    swipeCaptured.current = false;
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    if (showComments || touchStartY.current === null || swipeCaptured.current) return;
    const dy = e.changedTouches[0].clientY - touchStartY.current;
    const dx = Math.abs(e.changedTouches[0].clientX - (touchStartX.current ?? 0));
    if (Math.abs(dy) > 72 && Math.abs(dy) > dx * 1.2) {
      if (dy > 0) {
        setSwipeDir(-1);
        if (postIdx > 0) setPostIdx((i) => i - 1);
        else onClose();
      } else {
        setSwipeDir(1);
        if (postIdx < posts.length - 1) setPostIdx((i) => i + 1);
      }
    }
    touchStartY.current = null;
    touchStartX.current = null;
  };

  if (!post) { onClose(); return null; }

  const firstMedia = post.media?.[0];
  const isVideo    = firstMedia?.type === "video";
  const safeBottom = "env(safe-area-inset-bottom, 0px)";

  return (
    <>
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      className="fixed inset-0 bg-black"
      style={{ zIndex: 99999, touchAction: "none", overflow: "hidden" }}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      onClick={handleTap}
      onContextMenu={(e) => e.preventDefault()}
    >

      {/* ── Adjacent-post preloaders (hidden) — warm browser cache ──── */}
      {[-1, 1].map((offset) => {
        const adj      = posts[postIdx + offset];
        const adjMedia = adj?.media?.[0];
        if (!adj || !adjMedia) return null;
        return adjMedia.type === "video" ? (
          <video
            key={`preload-${adj.id}`}
            src={adjMedia.url}
            preload="auto"
            muted
            playsInline
            aria-hidden
            style={{ position: "absolute", width: 0, height: 0, opacity: 0, pointerEvents: "none" }}
          />
        ) : (
          <link
            key={`preload-${adj.id}`}
            rel="preload"
            as="image"
            href={adjMedia.url}
          />
        );
      })}

      {/* ── Media layer — direction-aware slide ───────────────────────── */}
      <AnimatePresence mode="sync" initial={false} custom={swipeDir}>
        <motion.div
          key={`post-${postIdx}`}
          className="absolute inset-0"
          custom={swipeDir}
          variants={slideVariants}
          initial="enter"
          animate="center"
          exit="exit"
        >
          {isVideo ? (
            <ImmersiveVideo
              url={firstMedia!.url}
              onSwipeCaptured={(v) => { swipeCaptured.current = v; }}
            />
          ) : (
            <ImmersiveImages
              media={post.media}
              onSwipeCapture={(c) => { swipeCaptured.current = c; }}
            />
          )}
        </motion.div>
      </AnimatePresence>

      {/* ── Bottom gradient — protects caption readability ────────────── */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 z-10"
        style={{
          height: 340,
          background: "linear-gradient(to top, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.55) 45%, transparent 100%)",
        }}
      />

      {/* ── Right action bar — TikTok order: Avatar→Like→Comment→Save→Share */}
      <div
        className="absolute right-3 z-30 flex flex-col items-center gap-5"
        style={{ bottom: `calc(${safeBottom} + 84px)` }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Profile avatar */}
        <button
          className="relative"
          onClick={() => { onClose(); navigate(`/profile/${author?.id}`); }}
          aria-label="View profile"
        >
          {author?.avatar_url ? (
            <img
              src={author.avatar_url}
              alt=""
              className="rounded-full object-cover"
              style={{ width: 46, height: 46, border: "2px solid rgba(255,255,255,0.5)" }}
            />
          ) : (
            <div
              className="rounded-full grid place-items-center text-sm font-bold text-white"
              style={{
                width: 46, height: 46,
                background: "linear-gradient(135deg,var(--accent-primary),var(--accent-secondary))",
              }}
            >
              {(author?.name || "?").charAt(0).toUpperCase()}
            </div>
          )}
        </button>

        {/* Like */}
        <motion.button
          whileTap={{ scale: 0.78 }}
          onClick={() => onLike(post.id)}
          className="flex flex-col items-center gap-1"
          aria-label="Like"
        >
          <Heart
            className="h-7 w-7 drop-shadow-lg transition-all duration-150"
            style={{
              fill:   post.has_liked ? "#f43f5e" : "transparent",
              color:  post.has_liked ? "#f43f5e" : "white",
              filter: post.has_liked ? "drop-shadow(0 0 8px #f43f5e90)" : undefined,
            }}
          />
          <span className="text-[11px] font-semibold text-white drop-shadow leading-none">
            {fmtCount(post.like_count ?? 0)}
          </span>
        </motion.button>

        {/* Comment — opens sheet, does NOT navigate */}
        <motion.button
          whileTap={{ scale: 0.78 }}
          onClick={() => setShowComments(true)}
          className="flex flex-col items-center gap-1"
          aria-label="Comment"
        >
          <MessageCircle
            className="h-7 w-7 drop-shadow-lg"
            style={{ color: showComments ? "var(--accent-primary)" : "white" }}
          />
          <span className="text-[11px] font-semibold text-white drop-shadow leading-none">
            {fmtCount(commentCount)}
          </span>
        </motion.button>

        {/* Save / Bookmark */}
        <motion.button
          whileTap={{ scale: 0.78 }}
          onClick={() => onSave(post.id)}
          className="flex flex-col items-center gap-1"
          aria-label={post.has_saved ? "Unsave" : "Save"}
        >
          <Bookmark
            className="h-7 w-7 drop-shadow-lg transition-all duration-150"
            style={{
              fill:   post.has_saved ? "#a855f7" : "transparent",
              color:  post.has_saved ? "#a855f7" : "white",
              filter: post.has_saved ? "drop-shadow(0 0 8px #a855f790)" : undefined,
            }}
          />
          <span className="text-[11px] font-semibold text-white drop-shadow leading-none">
            {post.has_saved ? "Saved" : "Save"}
          </span>
        </motion.button>

        {/* Share */}
        <motion.button
          whileTap={{ scale: 0.78 }}
          onClick={() => {
            if (navigator.share) {
              navigator.share({
                title: post.caption ?? "Check this out on Socia",
                url:   `${window.location.origin}/post/${post.id}`,
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

      {/* ── Bottom-left — author + caption + views ─────────────────────── */}
      <div
        className="absolute left-0 z-20 flex flex-col gap-2"
        style={{
          bottom: 0,
          right: 78,
          paddingLeft: 14,
          paddingRight: 10,
          paddingBottom: `calc(${safeBottom} + 20px)`,
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
              style={{ width: 36, height: 36, border: "1.5px solid rgba(255,255,255,0.35)" }}
              onClick={() => { onClose(); navigate(`/profile/${author.id}`); }}
            />
          ) : (
            <div
              className="rounded-full grid place-items-center text-sm font-bold text-white flex-shrink-0 cursor-pointer"
              style={{
                width: 36, height: 36,
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
                <BadgeCheck className="h-[15px] w-[15px] flex-shrink-0" style={{ color: "var(--accent-primary)" }} />
              )}
            </div>
            {author?.username && (
              <p className="text-[11px] text-white/55 leading-tight">@{author.username}</p>
            )}
          </div>
        </div>

        {/* Caption */}
        {post.caption && <CaptionText caption={post.caption} />}

        {/* View count */}
        <div className="flex items-center gap-1.5">
          <Eye className="h-3 w-3 text-white/40 flex-shrink-0" />
          <span className="text-[11px] text-white/40">{fmtCount(post.view_count ?? 0)} views</span>
        </div>
      </div>

      {/* ── Double-tap heart burst ─────────────────────────────────────── */}
      <AnimatePresence>
        {heartBurst && (
          <motion.div
            key="heart-burst"
            className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center"
            initial={{ opacity: 0, scale: 0.4 }}
            animate={{ opacity: 1, scale: 1.3 }}
            exit={{ opacity: 0, scale: 1.9 }}
            transition={{ duration: 0.7, ease: "easeOut" }}
          >
            <Heart className="h-28 w-28 fill-rose-500 text-rose-500 drop-shadow-2xl" />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>

    {/* ── Comments sheet — renders on top of viewer, viewer stays open ── */}
    {showComments && (
      <CommentsSheet
        postId={post.id}
        initialCount={post.comment_count ?? 0}
        onClose={() => setShowComments(false)}
        onCountChange={handleCommentCountChange}
      />
    )}
    </>
  );
}
