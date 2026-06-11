/**
 * FeedCard.tsx — Full-width social feed card.
 *
 * Facebook-standard layout:
 *   Header (avatar, name, username, timestamp, follow)
 *   Caption / text content  ← ALWAYS above media & actions
 *   Media (if any)
 *   Action bar: Like · Comment · Share · Save  (standardised)
 *   View count (inline, right-aligned)
 *
 * Guest gate: onGuestAction prop intercepts engagement for non-logged-in users.
 */
import { useState, useRef, useCallback, memo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useLocation } from "wouter";
import {
  Heart, MessageCircle, Bookmark, Share2, Eye, MoreHorizontal, BadgeCheck, Flag, Music2,
} from "lucide-react";
import { VideoPostPlayer } from "./VideoPostPlayer";
import { RichCaption } from "./RichCaption";
import { reportPost } from "@/lib/postsClient";
import type { SocialPost } from "@/lib/postsClient";
import { useAppStore } from "@/lib/store";
import { supabase } from "@/lib/supabase";
import {
  FoundingSupporterBadge, getSupporterTier,
} from "@/components/profile/FoundingSupporterBadge";

interface Props {
  post: SocialPost;
  onLike: (postId: string) => void;
  onSave: (postId: string) => void;
  onComment?: (postId: string) => void;
  onDelete?: (postId: string) => void;
  onCommentCountChange?: (postId: string, delta: number) => void;
  onOpenViewer?: (post: SocialPost) => void;
  /** Called when a guest taps an engagement action — shows auth modal */
  onGuestAction?: (label?: string) => void;
}

/* ── Spinning music disc — TikTok-style ───────────────────────────────── */
/* H-4: keyframe lives in index.css as @keyframes feedcard-disc-spin — no inline <style> */
const DISC_SPIN_STYLE: React.CSSProperties = {
  animation: "feedcard-disc-spin 4s linear infinite",
  willChange: "transform",
};

function MusicDisc({ sound, soundId, navigate, size = 44 }: {
  sound?: { cover_image?: string | null; title?: string } | null;
  soundId: string;
  navigate: (to: string) => void;
  size?: number;
}) {
  return (
    <motion.button
        whileTap={{ scale: 0.88 }}
        onClick={(e) => { e.stopPropagation(); navigate(`/sounds/${soundId}`); }}
        aria-label="View sound"
        style={{ width: size, height: size, borderRadius: "50%", flexShrink: 0 }}
        className="relative"
      >
        {/* outer ring */}
        <span
          className="absolute inset-0 rounded-full"
          style={{ border: "2px solid rgba(255,255,255,0.22)", boxShadow: "0 0 8px rgba(168,85,247,0.4)" }}
        />
        {/* spinning thumbnail / fallback */}
        <span
          className="absolute inset-[3px] rounded-full overflow-hidden grid place-items-center"
          style={{ background: "linear-gradient(135deg,#1a1a2e,#2d0a5e)", ...DISC_SPIN_STYLE }}
        >
          {sound?.cover_image ? (
            <img
              src={sound.cover_image}
              alt={sound.title ?? "Sound"}
              className="h-full w-full object-cover rounded-full"
              draggable={false}
            />
          ) : (
            <Music2 className="text-purple-300" style={{ width: size * 0.38, height: size * 0.38 }} />
          )}
        </span>
        {/* centre hole — static */}
        <span
          className="absolute rounded-full"
          style={{
            width: size * 0.24, height: size * 0.24,
            top: "50%", left: "50%",
            transform: "translate(-50%,-50%)",
            background: "#111",
            border: "1.5px solid rgba(255,255,255,0.18)",
          }}
        />
      </motion.button>
  );
}

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return "now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`;
  if (diff < 604_800_000) return `${Math.floor(diff / 86_400_000)}d`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function fmtCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

/* H-1: memo prevents re-renders when post data and callbacks haven't changed */
export const FeedCard = memo(function FeedCard({ post, onLike, onSave, onComment, onDelete, onOpenViewer, onCommentCountChange, onGuestAction }: Props) {
  const [, navigate]   = useLocation();
  const me             = useAppStore((s) => s.user);
  const isAuthenticated = useAppStore((s) => s.isAuthenticated);
  const followedIds    = useAppStore((s) => s.followedUserIds);
  const setFollowedIds = useAppStore((s) => s.setFollowedUserIds);

  const [mediaIndex,    setMediaIndex]    = useState(0);
  const [captionExpand, setCaptionExpand] = useState(false);
  const [showMenu,      setShowMenu]      = useState(false);
  const [followWorking, setFollowWorking] = useState(false);
  const [heartBurst,    setHeartBurst]    = useState(false);

  const lastTap      = useRef(0);
  const touchStartX  = useRef<number | null>(null);
  const touchStartY  = useRef<number | null>(null);
  const isOwner            = me?.isOwner === true;
  const isMe               = me?.id === post.author_id;
  const authorSupporterTier = getSupporterTier(post.author as unknown as Record<string, unknown>);
  const isFollowing = followedIds.includes(post.author_id);

  const media = post.media ?? [];
  const currentMedia = media[mediaIndex];
  const hasMulti = media.length > 1;

  /* ── Guest gate helper ───────────────────────────────────────────── */
  const requireAuth = useCallback((action: () => void, label?: string) => {
    if (isAuthenticated) {
      action();
    } else {
      onGuestAction?.(label);
    }
  }, [isAuthenticated, onGuestAction]);

  /* ── Swipe left/right to change media frame ─────────────────────────── */
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0]?.clientX ?? null;
    touchStartY.current = e.touches[0]?.clientY ?? null;
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (touchStartX.current === null || !hasMulti) return;
    const dx = (e.changedTouches[0]?.clientX ?? 0) - touchStartX.current;
    const dy = Math.abs((e.changedTouches[0]?.clientY ?? 0) - (touchStartY.current ?? 0));
    if (Math.abs(dx) > 48 && Math.abs(dx) > dy) {
      if (dx < 0) setMediaIndex((i) => Math.min(i + 1, media.length - 1));
      else         setMediaIndex((i) => Math.max(i - 1, 0));
    }
    touchStartX.current = null;
    touchStartY.current = null;
  }, [hasMulti, media.length]);

  /* ── Double-tap to like; single-tap opens immersive viewer ──────────── */
  const handleMediaTap = useCallback(() => {
    const now = Date.now();
    if (now - lastTap.current < 300) {
      if (!post.has_liked) {
        requireAuth(() => {
          onLike(post.id);
          setHeartBurst(true);
          setTimeout(() => setHeartBurst(false), 900);
        }, "like posts");
      }
      lastTap.current = 0;
    } else {
      lastTap.current = now;
      setTimeout(() => {
        if (lastTap.current === now) {
          if (onOpenViewer) onOpenViewer(post);
          else navigate(`/post/${post.id}`);
          lastTap.current = 0;
        }
      }, 310);
    }
  }, [post, onLike, onOpenViewer, navigate, requireAuth]);

  const handleCommentClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    requireAuth(() => onComment?.(post.id), "comment on posts");
  }, [onComment, post.id, requireAuth]);

  const handleShare = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    const url = `${window.location.origin}/post/${post.id}`;
    if (navigator.share) {
      try { await navigator.share({ url, title: post.caption ?? "Post" }); return; }
      catch { /* fall through */ }
    }
    navigator.clipboard?.writeText(url);
  }, [post]);

  const handleFollow = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    requireAuth(async () => {
      if (followWorking || isMe) return;
      setFollowWorking(true);
      try {
        if (isFollowing) {
          const { error } = await supabase.rpc("unfollow_user", { target_id: post.author_id });
          if (!error) setFollowedIds(followedIds.filter((id) => id !== post.author_id));
        } else {
          const { error } = await supabase.rpc("follow_user", { target_id: post.author_id });
          if (!error) setFollowedIds([...followedIds, post.author_id]);
        }
      } finally {
        setFollowWorking(false);
      }
    }, "follow creators");
  }, [followWorking, isMe, isFollowing, post.author_id, followedIds, setFollowedIds, requireAuth]);

  const handleReport = useCallback(async () => {
    setShowMenu(false);
    try { await reportPost(post.id, "inappropriate"); } catch { /* silent */ }
  }, [post.id]);

  const CAPTION_LIMIT = media.length > 0 ? 160 : 400;

  return (
    <article
      className="mx-3 my-2 overflow-hidden rounded-[18px]"
      style={{ background: "rgba(14,14,14,1)", border: "1px solid rgba(255,255,255,0.07)" }}
    >
      {/* ── Header ────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-4 pt-3 pb-2">
        <motion.button
          whileTap={{ scale: 0.92 }}
          onClick={() => navigate(isMe ? "/profile" : `/profile/${post.author_id}`)}
          className="relative flex-shrink-0"
        >
          {post.author?.avatar_url ? (
            <img
              src={post.author.avatar_url}
              alt=""
              className="h-10 w-10 rounded-full object-cover"
              style={{ border: "1.5px solid rgba(255,255,255,0.12)" }}
            />
          ) : (
            <div
              className="h-10 w-10 rounded-full grid place-items-center text-sm font-bold text-white"
              style={{ background: "linear-gradient(135deg,var(--accent-primary),var(--accent-secondary))" }}
            >
              {(post.author?.name || post.author?.username || "?").charAt(0).toUpperCase()}
            </div>
          )}
        </motion.button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1 flex-wrap">
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={() => navigate(isMe ? "/profile" : `/profile/${post.author_id}`)}
              className="text-[14px] font-bold app-text leading-tight"
            >
              {post.author?.name || post.author?.username || "User"}
            </motion.button>
            {authorSupporterTier
              ? <FoundingSupporterBadge tier={authorSupporterTier} size={14} showGlow={false} />
              : (post.author?.is_verified &&
                  (post.author?.subscription_status === "active" ||
                   post.author?.subscription_status === "owner")) && (
                <BadgeCheck className="h-3.5 w-3.5 flex-shrink-0" style={{ color: "var(--accent-primary)" }} />
              )
            }
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            {post.author?.username && (
              <span className="text-[11px] app-text-muted">@{post.author.username}</span>
            )}
            <span className="text-[10px] app-text-muted opacity-60">·</span>
            <span className="text-[11px] app-text-muted">{relTime(post.created_at)}</span>
          </div>
        </div>

        {!isMe && (
          <motion.button
            whileTap={{ scale: 0.93 }}
            onClick={handleFollow}
            disabled={followWorking}
            className="rounded-full px-3 py-1 text-[11px] font-bold transition disabled:opacity-50 flex-shrink-0"
            style={isFollowing
              ? { background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.6)", border: "1px solid rgba(255,255,255,0.12)" }
              : { background: "linear-gradient(135deg,var(--accent-primary),var(--accent-secondary))", color: "white" }
            }
          >
            {isFollowing ? "Following" : "Follow"}
          </motion.button>
        )}

        <div className="relative flex-shrink-0">
          <motion.button
            whileTap={{ scale: 0.88 }}
            onClick={() => setShowMenu((v) => !v)}
            className="grid h-8 w-8 place-items-center rounded-full"
          >
            <MoreHorizontal className="h-4 w-4 app-text-muted" />
          </motion.button>

          <AnimatePresence>
            {showMenu && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setShowMenu(false)} />
                <motion.div
                  initial={{ opacity: 0, scale: 0.9, y: -4 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9, y: -4 }}
                  className="absolute right-0 top-9 z-40 min-w-[150px] rounded-2xl border shadow-xl overflow-hidden"
                  style={{ background: "rgba(18,18,18,0.97)", borderColor: "rgba(255,255,255,0.1)" }}
                  onClick={(e) => e.stopPropagation()}
                >
                  {(isMe || isOwner) && onDelete && (
                    <button
                      onClick={() => { setShowMenu(false); onDelete(post.id); }}
                      className="flex w-full items-center gap-2.5 px-4 py-3 text-sm font-medium text-rose-400 hover:bg-white/5"
                    >
                      Delete post
                    </button>
                  )}
                  {!isMe && (
                    <button
                      onClick={handleReport}
                      className="flex w-full items-center gap-2.5 px-4 py-3 text-sm font-medium app-text-muted hover:bg-white/5"
                    >
                      <Flag className="h-4 w-4" />
                      Report
                    </button>
                  )}
                  <button
                    onClick={() => setShowMenu(false)}
                    className="flex w-full items-center gap-2.5 px-4 py-3 text-sm font-medium app-text-muted hover:bg-white/5 border-t"
                    style={{ borderColor: "rgba(255,255,255,0.06)" }}
                  >
                    Cancel
                  </button>
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* ── Caption — ALWAYS above media ─────────────────────────────── */}
      {post.caption && (
        <div className="px-4 pb-2">
          <p
            className="text-[14px] leading-relaxed app-text"
            style={{
              textAlign: "left",
              display: captionExpand ? "block" : "-webkit-box",
              WebkitLineClamp: captionExpand ? undefined : (media.length > 0 ? 3 : 8),
              WebkitBoxOrient: "vertical",
              overflow: captionExpand ? "visible" : "hidden",
            } as React.CSSProperties}
          >
            <RichCaption text={post.caption} />
          </p>
          {post.caption.length > CAPTION_LIMIT && !captionExpand && (
            <button
              onClick={() => setCaptionExpand(true)}
              className="text-xs mt-0.5"
              style={{ color: "var(--accent-primary)" }}
            >
              more
            </button>
          )}
        </div>
      )}

      {/* ── Media ─────────────────────────────────────────────────────── */}
      {media.length > 0 && (
        <div
          className="relative"
          onClick={handleMediaTap}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          {currentMedia?.type === "video" ? (
            <VideoPostPlayer url={currentMedia.url} aspectRatio="4/5" sound={post.sound} />
          ) : (
            <div className="relative overflow-hidden" style={{ aspectRatio: "4/5", background: "#0a0a0a" }}>
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.img
                  key={`${post.id}-${mediaIndex}`}
                  src={currentMedia?.url}
                  alt={post.caption ?? ""}
                  className="absolute inset-0 h-full w-full object-cover"
                  loading="lazy"
                  draggable={false}
                  initial={{ opacity: 0, x: 30 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -30 }}
                  transition={{ duration: 0.18, ease: "easeOut" }}
                />
              </AnimatePresence>
            </div>
          )}

          {/* Multi-media: invisible edge-tap zones */}
          {hasMulti && (
            <>
              {mediaIndex > 0 && (
                <button
                  aria-label="Previous"
                  onClick={(e) => { e.stopPropagation(); setMediaIndex((i) => i - 1); }}
                  className="absolute left-0 top-0 h-full w-1/4 z-10 opacity-0"
                />
              )}
              {mediaIndex < media.length - 1 && (
                <button
                  aria-label="Next"
                  onClick={(e) => { e.stopPropagation(); setMediaIndex((i) => i + 1); }}
                  className="absolute right-0 top-0 h-full w-1/4 z-10 opacity-0"
                />
              )}
              {/* Dot indicators */}
              <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1 pointer-events-none">
                {media.map((_, i) => (
                  <span
                    key={i}
                    className="rounded-full transition-all"
                    style={{
                      width: i === mediaIndex ? 14 : 5,
                      height: 5,
                      background: i === mediaIndex ? "white" : "rgba(255,255,255,0.45)",
                    }}
                  />
                ))}
              </div>
            </>
          )}

          <AnimatePresence>
            {heartBurst && (
              <motion.div
                key="heart"
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: 1, scale: 1.3 }}
                exit={{ opacity: 0, scale: 1.8 }}
                transition={{ duration: 0.6, ease: "easeOut" }}
                className="pointer-events-none absolute inset-0 flex items-center justify-center"
              >
                <Heart className="h-20 w-20 fill-white text-white drop-shadow-2xl" />
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── TikTok music disc — photo/multi only; video handled by VideoPostPlayer ── */}
          {post.sound_id && currentMedia?.type !== "video" && (
            <div
              className="absolute right-3 bottom-3 z-20 flex flex-col items-center gap-1"
              style={{ pointerEvents: "auto" }}
            >
              <MusicDisc
                sound={post.sound}
                soundId={post.sound_id}
                navigate={navigate}
                size={46}
              />
              {post.sound?.title && (
                <span
                  className="text-white font-medium px-1.5 py-0.5 rounded text-[9px] max-w-[72px] truncate"
                  style={{ background: "rgba(0,0,0,0.55)" }}
                >
                  {post.sound.title}
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Action bar: Like · Comment · Share · Save + view count ───── */}
      <div
        className="flex items-center px-2 pt-1 pb-2"
        style={{ borderTop: media.length === 0 ? "1px solid rgba(255,255,255,0.05)" : undefined }}
      >
        {/* Like */}
        <motion.button
          whileTap={{ scale: 0.82 }}
          onClick={() => requireAuth(() => onLike(post.id), "like posts")}
          className="flex items-center gap-1.5 rounded-full px-3 py-2.5 min-w-[52px]"
        >
          <Heart
            className="h-[19px] w-[19px] transition-colors flex-shrink-0"
            style={{ fill: post.has_liked ? "#f43f5e" : "none", color: post.has_liked ? "#f43f5e" : "rgba(255,255,255,0.65)" }}
          />
          {(post.like_count ?? 0) > 0 && (
            <span className="text-[12px] font-semibold" style={{ color: post.has_liked ? "#f43f5e" : "rgba(255,255,255,0.65)" }}>
              {fmtCount(post.like_count ?? 0)}
            </span>
          )}
        </motion.button>

        {/* Comment */}
        <motion.button
          whileTap={{ scale: 0.82 }}
          onClick={handleCommentClick}
          className="flex items-center gap-1.5 rounded-full px-3 py-2.5 min-w-[52px]"
        >
          <MessageCircle className="h-[19px] w-[19px] flex-shrink-0" style={{ color: "rgba(255,255,255,0.65)" }} />
          {(post.comment_count ?? 0) > 0 && (
            <span className="text-[12px] font-semibold" style={{ color: "rgba(255,255,255,0.65)" }}>
              {fmtCount(post.comment_count ?? 0)}
            </span>
          )}
        </motion.button>

        {/* Share — always allowed */}
        <motion.button
          whileTap={{ scale: 0.82 }}
          onClick={handleShare}
          className="flex items-center gap-1.5 rounded-full px-3 py-2.5"
        >
          <Share2 className="h-[19px] w-[19px]" style={{ color: "rgba(255,255,255,0.65)" }} />
        </motion.button>

        {/* Save */}
        <motion.button
          whileTap={{ scale: 0.82 }}
          onClick={() => requireAuth(() => onSave(post.id), "save posts")}
          className="flex items-center gap-1.5 rounded-full px-3 py-2.5"
        >
          <Bookmark
            className="h-[19px] w-[19px] transition-colors flex-shrink-0"
            style={{ fill: post.has_saved ? "#a855f7" : "none", color: post.has_saved ? "#a855f7" : "rgba(255,255,255,0.65)" }}
          />
        </motion.button>

        {/* View count right-aligned */}
        <div className="flex-1" />
        <div className="flex items-center gap-2 px-2">
          <div className="flex items-center gap-1 opacity-50">
            <Eye className="h-3.5 w-3.5" style={{ color: "rgba(255,255,255,0.45)" }} />
            <span className="text-[11px]" style={{ color: "rgba(255,255,255,0.45)" }}>
              {fmtCount(post.view_count ?? 0)}
            </span>
          </div>
          {/* Music disc for text-only posts (media posts show it overlaid on media) */}
          {post.sound_id && media.length === 0 && (
            <MusicDisc
              sound={post.sound}
              soundId={post.sound_id}
              navigate={navigate}
              size={36}
            />
          )}
        </div>
      </div>
    </article>
  );
});
