/**
 * ImmersiveViewer.tsx — TikTok-grade fullscreen media viewer.
 *
 * Swipe system (3-slot sliding window — zero black screen):
 *  - A 300dvh container holds 3 cards: prev | current | next
 *  - Container starts at -100dvh (showing current in center)
 *  - Finger drag moves the ENTIRE container — no React re-renders during drag
 *  - On commit: container snaps to -200dvh (next) or 0dvh (prev)
 *  - flushSync + instant container reset = atomic swap, no flash
 *  - Spring-back if gesture cancelled
 *
 * Double-tap hearts:
 *  - Detected in onTouchEnd (small movement + fast timing + repeat)
 *  - Each heart spawns at exact tap coordinates (clientX/Y)
 *  - Multiple independent hearts supported
 *  - Hearts are fixed-position so they're never clipped by slot overflow:hidden
 */
import {
  useState, useRef, useCallback, useEffect, memo,
} from "react";
import { flushSync } from "react-dom";
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

/* ── Heart item for floating tap-position hearts ─────────────────────────── */
interface HeartItem {
  id:   number;
  x:    number; /* clientX of double-tap */
  y:    number; /* clientY of double-tap */
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
───────────────────────────────────────────────────────────────────────── */
const ImmersiveVideo = memo(function ImmersiveVideo({ url }: { url: string }) {
  const videoRef    = useRef<HTMLVideoElement>(null);
  const [playing,   setPlaying]   = useState(false);
  const [buffering, setBuffering] = useState(true);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = 0;
    const tryPlay = () => {
      v.muted = false;
      return v.play().catch(() => { v.muted = true; return v.play().catch(() => {}); });
    };
    tryPlay();
    return () => { v.pause(); v.removeAttribute("src"); v.load(); };
  }, [url]);

  const togglePlay = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) v.play().catch(() => {}); else v.pause();
  }, []);

  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black" onClick={togglePlay}>
      <video
        ref={videoRef}
        src={url}
        loop
        playsInline
        preload="auto"
        disablePictureInPicture
        controlsList="nodownload noplaybackrate nofullscreen"
        onContextMenu={(e) => e.preventDefault()}
        style={{ width: "100%", height: "100%", objectFit: "contain", display: "block", background: "black" }}
        onWaiting={() => setBuffering(true)}
        onCanPlay={() => setBuffering(false)}
        onPlay={() => { setPlaying(true); setBuffering(false); }}
        onPause={() => setPlaying(false)}
      />
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
          style={{ maxWidth: "100%", maxHeight: "100%", width: "auto", height: "auto", objectFit: "contain", display: "block" }}
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
   Fills its slot container (absolute inset-0).
   The parent container handles all motion — no enter/exit animations here.
───────────────────────────────────────────────────────────────────────── */
interface PostCardProps {
  post:         SocialPost;
  commentCount: number;
  onLike:       () => void;
  onSave:       () => void;
  onComment:    () => void;
  onShare:      () => void;
  onClose:      () => void;
  onHSwipe:     (v: boolean) => void;
  navigate:     (path: string) => void;
}

const PostCard = memo(function PostCard({
  post, commentCount, onLike, onSave, onComment, onShare, onClose,
  onHSwipe, navigate,
}: PostCardProps) {
  const author     = post.author;
  const firstMedia = post.media?.[0];
  const isVideo    = firstMedia?.type === "video";
  const safeBottom = "env(safe-area-inset-bottom, 0px)";

  return (
    <div className="absolute inset-0" style={{ background: "black" }}>
      {/* ── Media layer ─────────────────────────────────────────────── */}
      {isVideo
        ? <ImmersiveVideo url={firstMedia!.url} />
        : <ImmersiveImages media={post.media} onHorizontalSwipe={onHSwipe} />}

      {/* ── Bottom gradient ──────────────────────────────────────────── */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 z-10"
        style={{ height: 380, background: "linear-gradient(to top, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.55) 45%, transparent 100%)" }}
      />

      {/* ── Top gradient ─────────────────────────────────────────────── */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 z-10"
        style={{ height: 120, background: "linear-gradient(to bottom, rgba(0,0,0,0.55) 0%, transparent 100%)" }}
      />

      {/* ── Close button ─────────────────────────────────────────────── */}
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
              style={{ width: 46, height: 46, background: "linear-gradient(135deg,var(--accent-primary),var(--accent-secondary))" }}
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
        style={{ bottom: 0, right: 78, paddingLeft: 14, paddingRight: 10, paddingBottom: `calc(${safeBottom} + 20px)` }}
        onClick={(e) => e.stopPropagation()}
      >
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
              style={{ width: 36, height: 36, background: "linear-gradient(135deg,var(--accent-primary),var(--accent-secondary))" }}
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
        {post.caption && <CaptionText caption={post.caption} />}
        <div className="flex items-center gap-1.5">
          <Eye className="h-3 w-3 text-white/40 flex-shrink-0" />
          <span className="text-[11px] text-white/40">{fmtCount(post.view_count ?? 0)} views</span>
        </div>
      </div>
    </div>
  );
});

/* ─────────────────────────────────────────────────────────────────────────
   FloatingHeart — a single heart that appears at tap coords and fades out.
   Uses position:fixed so it's never clipped by slot overflow:hidden.
───────────────────────────────────────────────────────────────────────── */
function FloatingHeart({ x, y, onDone }: { x: number; y: number; onDone: () => void }) {
  return (
    <motion.div
      className="pointer-events-none"
      style={{
        position: "fixed",
        left:     x - 56, /* center 112px heart on tap point */
        top:      y - 56,
        zIndex:   999999,
      }}
      initial={{ opacity: 0, scale: 0.2 }}
      animate={{
        opacity: [0, 1,   1,   1,   0],
        scale:   [0.2, 1.5, 1.2, 1.2, 1.4],
      }}
      transition={{ duration: 0.85, ease: "easeOut", times: [0, 0.2, 0.35, 0.6, 1] }}
      onAnimationComplete={onDone}
    >
      <Heart className="h-28 w-28 fill-rose-500 text-rose-500 drop-shadow-2xl" />
    </motion.div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   ImmersiveViewer — main orchestrator.

   3-slot sliding-window approach (zero black screen):
   ┌─────────────┐ ← slot 0: prev post (above viewport)
   │  prev post  │
   ├─────────────┤ ← container held at -100dvh → slot 1 always on screen
   │ curr post ✓ │
   ├─────────────┤
   │  next post  │ ← slot 2: next post (below viewport)
   └─────────────┘

   Double-tap hearts:
   - Detected inside onTouchEnd (small dy + fast timing + quick repeat)
   - Spawned at exact (clientX, clientY) of the tap
   - Rendered as fixed-position FloatingHeart elements
   - Multiple hearts supported (rapid double-taps each spawn a new one)
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
  const [hearts, setHearts]         = useState<HeartItem[]>([]);
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>({});

  const containerRef    = useRef<HTMLDivElement>(null);
  const touchStartY     = useRef<number | null>(null);
  const touchStartTime  = useRef<number>(0);
  const touchStartX     = useRef<number | null>(null);
  const hSwipeCaptured  = useRef(false);
  const navigating      = useRef(false);
  /* Double-tap detection */
  const lastTapTime     = useRef(0);
  const lastTapX        = useRef(0);
  const lastTapY        = useRef(0);

  const prevPost = posts[postIdx - 1] ?? null;
  const currPost = posts[postIdx];
  const nextPost = posts[postIdx + 1] ?? null;

  const commentCount = (currPost?.comment_count ?? 0) + (commentCounts[currPost?.id] ?? 0);

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

  /* ── Spawn a floating heart at tap coords ──────────────────────────── */
  const spawnHeart = useCallback((x: number, y: number) => {
    const id = Date.now() + Math.random();
    setHearts((h) => [...h, { id, x, y }]);
  }, []);

  const removeHeart = useCallback((id: number) => {
    setHearts((h) => h.filter((item) => item.id !== id));
  }, []);

  /* ── Touch: start ──────────────────────────────────────────────────── */
  const onTouchStart = useCallback((e: React.TouchEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest("button") || target.closest("[data-no-swipe]")) return;

    touchStartY.current    = e.touches[0].clientY;
    touchStartX.current    = e.touches[0].clientX;
    touchStartTime.current = Date.now();
    hSwipeCaptured.current = false;

    const c = containerRef.current;
    if (c) c.style.transition = "none";
  }, []);

  /* ── Touch: move — translate the whole 3-slot container ────────────── */
  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (touchStartY.current === null || hSwipeCaptured.current || navigating.current) return;

    const dy = e.touches[0].clientY - touchStartY.current;
    const dx = Math.abs(e.touches[0].clientX - (touchStartX.current ?? 0));

    if (dx > Math.abs(dy) * 1.5 && dx > 20) {
      hSwipeCaptured.current = true;
      const c = containerRef.current;
      if (c) {
        c.style.transition = "transform 0.18s ease-out";
        c.style.transform  = `translate3d(0, ${-window.innerHeight}px, 0)`;
      }
      return;
    }

    const c = containerRef.current;
    if (!c) return;

    let resistedDy = dy;
    if (dy < 0 && postIdx >= posts.length - 1) resistedDy = dy * 0.18;
    if (dy > 0 && postIdx <= 0)               resistedDy = dy * 0.18;

    c.style.transform = `translate3d(0, ${-window.innerHeight + resistedDy}px, 0)`;
  }, [postIdx, posts.length]);

  /* ── Touch: end — snap, spring-back, or double-tap ────────────────── */
  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    if (touchStartY.current === null || hSwipeCaptured.current || navigating.current) return;

    const endX  = e.changedTouches[0].clientX;
    const endY  = e.changedTouches[0].clientY;
    const dy    = endY - touchStartY.current;
    const dx    = endX - (touchStartX.current ?? 0);
    const dt    = Date.now() - touchStartTime.current;
    const velocity = Math.abs(dy) / Math.max(dt, 1);
    const c     = containerRef.current;

    const isTap   = Math.abs(dy) < 18 && Math.abs(dx) < 18 && dt < 220;
    const shouldNav = !isTap &&
                      (Math.abs(dy) > 80 || velocity > 0.35) &&
                      Math.abs(dy) > Math.abs(dx);

    const startX = touchStartX.current;
    const startY = touchStartY.current;
    touchStartY.current = null;
    touchStartX.current = null;

    /* ── Double-tap detection ──────────────────────────────────────── */
    if (isTap) {
      const now   = Date.now();
      const tapX  = (startX ?? endX + endX) / 2; /* midpoint of touch */
      const tapY  = (startY ?? endY + endY) / 2;

      if (now - lastTapTime.current < 320 &&
          Math.abs(tapX - lastTapX.current) < 60 &&
          Math.abs(tapY - lastTapY.current) < 60) {
        /* Double-tap! */
        spawnHeart(endX, endY);
        if (currPost && !currPost.has_liked) {
          onLike(currPost.id);
        }
        lastTapTime.current = 0; /* reset so triple-tap doesn't re-trigger */
      } else {
        lastTapTime.current = now;
        lastTapX.current    = tapX;
        lastTapY.current    = tapY;
      }
      return;
    }

    /* ── Spring-back ───────────────────────────────────────────────── */
    if (!shouldNav) {
      if (c) {
        c.style.transition = "transform 0.32s cubic-bezier(0.34, 1.56, 0.64, 1)";
        c.style.transform  = `translate3d(0, ${-window.innerHeight}px, 0)`;
      }
      return;
    }

    /* ── Commit navigation ─────────────────────────────────────────── */
    const goingToNext = dy < 0;
    const nextIdx     = goingToNext ? postIdx + 1 : postIdx - 1;

    if (nextIdx < 0) {
      /* Swipe past first → close */
      if (c) {
        c.style.transition = "transform 0.22s cubic-bezier(0.25, 0.46, 0.45, 0.94)";
        c.style.transform  = `translate3d(0, 0, 0)`;
      }
      setTimeout(onClose, 220);
      return;
    }

    if (nextIdx >= posts.length) {
      /* Can't go past last post — spring back */
      if (c) {
        c.style.transition = "transform 0.32s cubic-bezier(0.34, 1.56, 0.64, 1)";
        c.style.transform  = `translate3d(0, ${-window.innerHeight}px, 0)`;
      }
      return;
    }

    navigating.current = true;

    const targetY = goingToNext ? -2 * window.innerHeight : 0;
    if (c) {
      c.style.transition = "transform 0.26s cubic-bezier(0.25, 0.46, 0.45, 0.94)";
      c.style.transform  = `translate3d(0, ${targetY}px, 0)`;
    }

    /* flushSync: React re-renders synchronously → slot 1 has correct post
       before container resets → zero black screen / zero flash           */
    setTimeout(() => {
      flushSync(() => setPostIdx(nextIdx));
      const c2 = containerRef.current;
      if (c2) {
        c2.style.transition = "none";
        c2.style.transform  = `translate3d(0, ${-window.innerHeight}px, 0)`;
      }
      navigating.current = false;
    }, 280);
  }, [postIdx, posts.length, onClose, currPost, onLike, spawnHeart]);

  if (!currPost) { onClose(); return null; }

  const handleShare = () => {
    if (navigator.share) {
      navigator.share({
        title: currPost.caption ?? "Check this out on Socia",
        url:   `${window.location.origin}/post/${currPost.id}`,
      }).catch(() => {});
    }
  };

  const makeCardProps = (post: SocialPost, isCurrent: boolean): PostCardProps => ({
    post,
    commentCount: (post.comment_count ?? 0) + (commentCounts[post.id] ?? 0),
    onLike:    () => onLike(post.id),
    onSave:    () => onSave(post.id),
    onComment: () => onComment(post.id),
    onShare:   isCurrent ? handleShare : () => {},
    onClose,
    onHSwipe:  (v: boolean) => { hSwipeCaptured.current = v; },
    navigate,
  });

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      className="fixed inset-0 bg-black overflow-hidden"
      style={{ zIndex: 99999, touchAction: "none" }}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      {/* ── 3-slot sliding container ──────────────────────────────────── */}
      <div
        ref={containerRef}
        style={{
          position:   "absolute",
          top:        0,
          left:       0,
          width:      "100%",
          height:     "300dvh",
          transform:  `translate3d(0, ${-window.innerHeight}px, 0)`,
          willChange: "transform",
        }}
      >
        {/* Slot 0 — previous post */}
        <div style={{ position: "relative", height: "100dvh", overflow: "hidden" }}>
          {prevPost && <PostCard key={`prev-${prevPost.id}`} {...makeCardProps(prevPost, false)} />}
        </div>

        {/* Slot 1 — current post */}
        <div style={{ position: "relative", height: "100dvh", overflow: "hidden" }}>
          <PostCard key={`curr-${currPost.id}`} {...makeCardProps(currPost, true)} />
        </div>

        {/* Slot 2 — next post */}
        <div style={{ position: "relative", height: "100dvh", overflow: "hidden" }}>
          {nextPost && <PostCard key={`next-${nextPost.id}`} {...makeCardProps(nextPost, false)} />}
        </div>
      </div>

      {/* ── Floating hearts — fixed-position, never clipped ──────────── */}
      <AnimatePresence>
        {hearts.map((heart) => (
          <FloatingHeart
            key={heart.id}
            x={heart.x}
            y={heart.y}
            onDone={() => removeHeart(heart.id)}
          />
        ))}
      </AnimatePresence>

      {/* ── Hidden preloaders (±2 from current) ──────────────────────── */}
      {[-2, 2].map((offset) => {
        const adj      = posts[postIdx + offset];
        const adjMedia = adj?.media?.[0];
        if (!adj || !adjMedia) return null;
        return adjMedia.type === "video" ? (
          <video
            key={`preload-${adj.id}`}
            src={adjMedia.url}
            preload="metadata"
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
    </motion.div>
  );
}
