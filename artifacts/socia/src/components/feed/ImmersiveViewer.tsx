/**
 * ImmersiveViewer.tsx — TikTok-grade fullscreen media viewer.
 *
 * Swipe system:
 *  - Finger drag moves the ENTIRE card (media + all overlays) in real time
 *  - Uses direct DOM style.transform — zero React re-renders during drag
 *  - Velocity-based snap: fast flick OR 80px threshold commits navigation
 *  - Spring-back if gesture cancelled
 *  - Next/prev card enters from below/above with CSS transition
 *
 * Video:
 *  - Auto-plays on mount, auto-pauses on unmount
 *  - object-contain: never stretches or crops any aspect ratio
 *  - No controls, no mute button, no chrome — tap to pause/resume
 *
 * Overlays (username, caption, like, comment, share) are INSIDE the card
 * wrapper so they translate with the card during swipe.
 */
import {
  useState, useRef, useCallback, useEffect, memo,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Heart, MessageCircle, Bookmark, Share2,
  Eye, ChevronLeft, ChevronRight, Play, BadgeCheck, X,
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
  posts:      SocialPost[];
  startIndex: number;
  onClose:    () => void;
  onLike:     (postId: string) => void;
  onSave:     (postId: string) => void;
  onComment:  (postId: string) => void;
  onCommentCountChange?: (postId: string, delta: number) => void;
}

/* ─────────────────────────────────────────────────────────────────────────
   ImmersiveVideo — auto-plays on mount, auto-pauses on unmount.
   • Attempts unmuted autoplay first; falls back to muted silently
   • object-contain → NEVER stretches or crops
   • No browser chrome, no controls
   • Tap anywhere on video to pause/resume
───────────────────────────────────────────────────────────────────────── */
const ImmersiveVideo = memo(function ImmersiveVideo({
  url,
}: {
  url: string;
}) {
  const videoRef    = useRef<HTMLVideoElement>(null);
  const [playing,   setPlaying]   = useState(false);
  const [buffering, setBuffering] = useState(true);

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

  const togglePlay = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
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
        disablePictureInPicture
        controlsList="nodownload noplaybackrate nofullscreen"
        onContextMenu={(e) => e.preventDefault()}
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

      {/* Buffering spinner */}
      {buffering && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-10 w-10 rounded-full border-2 border-white/25 border-t-white animate-spin" />
        </div>
      )}

      {/* Paused indicator */}
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
───────────────────────────────────────────────────────────────────────── */
const ImmersiveImages = memo(function ImmersiveImages({
  media,
  onHorizontalSwipe,
}: {
  media: SocialPost["media"];
  onHorizontalSwipe: (captured: boolean) => void;
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
      onHorizontalSwipe(true);
      if (dx < 0 && idx < media.length - 1) goTo(idx + 1);
      if (dx > 0 && idx > 0)               goTo(idx - 1);
    } else {
      onHorizontalSwipe(false);
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
          }}
        />
      </AnimatePresence>

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
   CaptionText — expands on tap
───────────────────────────────────────────────────────────────────────── */
function CaptionText({ caption }: { caption: string }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = caption.length > 90;

  return (
    <div onClick={(e) => e.stopPropagation()}>
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
   PostCard — one full-screen card.
   Contains media + gradient + all overlays.
   enterFrom: "bottom" | "top" | "none" — for enter animation
───────────────────────────────────────────────────────────────────────── */
interface PostCardProps {
  post:           SocialPost;
  enterFrom:      "bottom" | "top" | "none";
  cardRef:        React.RefObject<HTMLDivElement | null>;
  heartBurst:     boolean;
  commentCount:   number;
  onLike:         () => void;
  onSave:         () => void;
  onComment:      () => void;
  onShare:        () => void;
  onClose:        () => void;
  onDoubleTap:    () => void;
  onHSwipe:       (v: boolean) => void;
  navigate:       (path: string) => void;
}

const PostCard = memo(function PostCard({
  post, enterFrom, cardRef, heartBurst,
  commentCount, onLike, onSave, onComment, onShare, onClose,
  onDoubleTap, onHSwipe, navigate,
}: PostCardProps) {
  const author     = post.author;
  const firstMedia = post.media?.[0];
  const isVideo    = firstMedia?.type === "video";
  const safeBottom = "env(safe-area-inset-bottom, 0px)";

  /* Enter animation via CSS: start translated off-screen, then transition to 0 */
  useEffect(() => {
    const el = cardRef.current;
    if (!el || enterFrom === "none") return;
    const startY = enterFrom === "bottom" ? "100%" : "-100%";
    el.style.transform = `translate3d(0, ${startY}, 0)`;
    el.style.transition = "none";
    /* Force reflow before animating */
    void el.offsetHeight;
    el.style.transition = "transform 0.28s cubic-bezier(0.25, 0.46, 0.45, 0.94)";
    el.style.transform  = "translate3d(0, 0, 0)";
    const cleanup = () => {
      if (el) el.style.transition = "";
    };
    const t = setTimeout(cleanup, 300);
    return () => clearTimeout(t);
  }, []); // run once on mount

  return (
    <div
      ref={cardRef}
      className="absolute inset-0 will-change-transform"
      style={{ background: "black" }}
    >
      {/* ── Media layer ─────────────────────────────────────────────── */}
      {isVideo ? (
        <ImmersiveVideo url={firstMedia!.url} />
      ) : (
        <ImmersiveImages media={post.media} onHorizontalSwipe={onHSwipe} />
      )}

      {/* ── Bottom gradient — protects readability ───────────────────── */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 z-10"
        style={{
          height: 380,
          background: "linear-gradient(to top, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.55) 45%, transparent 100%)",
        }}
      />

      {/* ── Top gradient — for close button ─────────────────────────── */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 z-10"
        style={{
          height: 120,
          background: "linear-gradient(to bottom, rgba(0,0,0,0.55) 0%, transparent 100%)",
        }}
      />

      {/* ── Close button ────────────────────────────────────────────── */}
      <button
        className="absolute top-4 left-4 z-40 grid h-9 w-9 place-items-center rounded-full bg-black/40 backdrop-blur-sm"
        onClick={(e) => { e.stopPropagation(); onClose(); }}
        aria-label="Close"
      >
        <X className="h-5 w-5 text-white" />
      </button>

      {/* ── Right action bar ─────────────────────────────────────────── */}
      <div
        className="absolute right-3 z-30 flex flex-col items-center gap-5"
        style={{ bottom: `calc(${safeBottom} + 84px)` }}
        onClick={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
        onTouchEnd={(e) => e.stopPropagation()}
      >
        {/* Avatar */}
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
          onClick={onLike}
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

        {/* Comment */}
        <motion.button
          whileTap={{ scale: 0.78 }}
          onClick={onComment}
          className="flex flex-col items-center gap-1"
          aria-label="Comment"
        >
          <MessageCircle className="h-7 w-7 drop-shadow-lg text-white" />
          <span className="text-[11px] font-semibold text-white drop-shadow leading-none">
            {fmtCount(commentCount)}
          </span>
        </motion.button>

        {/* Save */}
        <motion.button
          whileTap={{ scale: 0.78 }}
          onClick={onSave}
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
          onClick={onShare}
          className="flex flex-col items-center gap-1"
          aria-label="Share"
        >
          <Share2 className="h-6 w-6 text-white drop-shadow-lg" />
          <span className="text-[11px] font-semibold text-white drop-shadow leading-none">Share</span>
        </motion.button>
      </div>

      {/* ── Bottom-left — author + caption + views ───────────────────── */}
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

      {/* ── Double-tap heart burst ────────────────────────────────────── */}
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

      {/* ── Tap capture for double-tap-to-like ──────────────────────── */}
      <div
        className="absolute inset-0 z-[5]"
        onClick={onDoubleTap}
        onTouchStart={(e) => e.stopPropagation()}
        onTouchEnd={(e) => e.stopPropagation()}
        style={{ pointerEvents: "none" }}
      />
    </div>
  );
});

/* ─────────────────────────────────────────────────────────────────────────
   ImmersiveViewer — main orchestrator.
   Renders via portal into document.body.

   Swipe system:
    - touchstart: capture y0, timestamp
    - touchmove: directly update cardRef.current.style.transform (no setState)
    - touchend: velocity = dy/dt
        • if |dy|>80 or velocity>0.35 → commit navigation
        • else → CSS spring back to 0
───────────────────────────────────────────────────────────────────────── */
export function ImmersiveViewer({
  posts,
  startIndex,
  onClose,
  onLike,
  onSave,
  onComment,
  onCommentCountChange,
}: ImmersiveViewerProps) {
  const [, navigate]  = useLocation();
  const [postIdx, setPostIdx]       = useState(startIndex);
  const [enterFrom, setEnterFrom]   = useState<"bottom" | "top" | "none">("none");
  const [heartBurst, setHeartBurst] = useState(false);
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>({});

  const cardRef         = useRef<HTMLDivElement>(null);
  const touchStartY     = useRef<number | null>(null);
  const touchStartTime  = useRef<number>(0);
  const touchStartX     = useRef<number | null>(null);
  const hSwipeCaptured  = useRef(false);
  const navigating      = useRef(false);

  const post         = posts[postIdx];
  const commentCount = (post?.comment_count ?? 0) + (commentCounts[post?.id] ?? 0);

  /* ── Escape + browser back ─────────────────────────────────────────── */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    window.history.pushState({ immersiveViewer: true }, "");
    const onPop = () => onClose();
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("popstate", onPop);
    };
  }, [onClose]);

  /* ── Lock body scroll ──────────────────────────────────────────────── */
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  /* ── Double-tap to like ────────────────────────────────────────────── */
  const lastTap = useRef(0);
  const handleDoubleTap = useCallback(() => {
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
  }, [post, onLike]);

  /* ── Navigate to a post index ──────────────────────────────────────── */
  const navigateTo = useCallback((nextIdx: number, direction: "bottom" | "top") => {
    if (nextIdx < 0) { onClose(); return; }
    if (nextIdx >= posts.length) return;
    setEnterFrom(direction);
    setPostIdx(nextIdx);
    navigating.current = false;
  }, [posts.length, onClose]);

  /* ── Touch handlers — real-time drag + velocity snap ──────────────── */
  const onTouchStart = useCallback((e: React.TouchEvent) => {
    /* Don't intercept touches on interactive overlays */
    const target = e.target as HTMLElement;
    if (target.closest("button") || target.closest("[data-no-swipe]")) return;

    touchStartY.current    = e.touches[0].clientY;
    touchStartX.current    = e.touches[0].clientX;
    touchStartTime.current = Date.now();
    hSwipeCaptured.current = false;
    navigating.current     = false;

    const el = cardRef.current;
    if (el) {
      el.style.transition = "none";
    }
  }, []);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (touchStartY.current === null || hSwipeCaptured.current || navigating.current) return;

    const dy = e.touches[0].clientY - touchStartY.current;
    const dx = Math.abs(e.touches[0].clientX - (touchStartX.current ?? 0));

    /* If clearly a horizontal swipe (for image carousels), don't move card */
    if (dx > Math.abs(dy) * 1.5 && dx > 20) {
      hSwipeCaptured.current = true;
      return;
    }

    const el = cardRef.current;
    if (!el) return;

    /* Add resistance at the edges */
    let resistedDy = dy;
    if ((dy < 0 && postIdx >= posts.length - 1) ||
        (dy > 0 && postIdx <= 0)) {
      resistedDy = dy * 0.25;
    }

    el.style.transform = `translate3d(0, ${resistedDy}px, 0)`;
  }, [postIdx, posts.length]);

  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    if (touchStartY.current === null || hSwipeCaptured.current || navigating.current) return;

    const dy        = e.changedTouches[0].clientY - touchStartY.current;
    const dt        = Date.now() - touchStartTime.current;
    const velocity  = Math.abs(dy) / Math.max(dt, 1); /* px/ms */
    const el        = cardRef.current;

    const shouldNav = (Math.abs(dy) > 80 || velocity > 0.35) &&
                      Math.abs(dy) > Math.abs(e.changedTouches[0].clientX - (touchStartX.current ?? 0));

    touchStartY.current = null;
    touchStartX.current = null;

    if (!shouldNav || !el) {
      /* Spring back */
      if (el) {
        el.style.transition = "transform 0.32s cubic-bezier(0.34, 1.56, 0.64, 1)";
        el.style.transform  = "translate3d(0, 0, 0)";
      }
      return;
    }

    navigating.current = true;

    /* Snap card off-screen in the swipe direction */
    const targetY = dy > 0 ? window.innerHeight : -window.innerHeight;
    el.style.transition = "transform 0.22s cubic-bezier(0.25, 0.46, 0.45, 0.94)";
    el.style.transform  = `translate3d(0, ${targetY}px, 0)`;

    /* After snap animation, switch post */
    setTimeout(() => {
      if (dy > 0) {
        /* Swipe down → previous post */
        navigateTo(postIdx - 1, "top");
      } else {
        /* Swipe up → next post */
        navigateTo(postIdx + 1, "bottom");
      }
    }, 200);
  }, [postIdx, navigateTo]);

  if (!post) { onClose(); return null; }

  const handleShare = () => {
    if (navigator.share) {
      navigator.share({
        title: post.caption ?? "Check this out on Socia",
        url:   `${window.location.origin}/post/${post.id}`,
      }).catch(() => {});
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      className="fixed inset-0 bg-black overflow-hidden"
      style={{ zIndex: 99999, touchAction: "pan-x" }}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      {/* Adjacent post preloaders */}
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
          <img
            key={`preload-${adj.id}`}
            src={adjMedia.url}
            aria-hidden
            style={{ position: "absolute", width: 0, height: 0, opacity: 0, pointerEvents: "none" }}
          />
        );
      })}

      {/* The card — remounts on postIdx change, enters from correct direction */}
      <PostCard
        key={`card-${postIdx}`}
        post={post}
        enterFrom={enterFrom}
        cardRef={cardRef}
        heartBurst={heartBurst}
        commentCount={commentCount}
        onLike={() => onLike(post.id)}
        onSave={() => onSave(post.id)}
        onComment={() => onComment(post.id)}
        onShare={handleShare}
        onClose={onClose}
        onDoubleTap={handleDoubleTap}
        onHSwipe={(v) => { hSwipeCaptured.current = v; }}
        navigate={navigate}
      />
    </motion.div>
  );
}
