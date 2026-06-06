/**
 * FeedCard.tsx — Full-width social feed card.
 *
 * Shows all social metadata: author, verified badge, timestamp, media,
 * caption, like/save/comment counts. Backend-connected interactions.
 *
 * Phase 2: removed dot indicators and frame counter badge (TikTok-style).
 * Phase 4: comments open a bottom sheet instead of navigating.
 *
 * Used in Home.tsx. Profile grids use PostThumbnail.tsx instead.
 */
import { useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useLocation } from "wouter";
import {
  Heart, MessageCircle, Bookmark, Eye, MoreHorizontal, BadgeCheck, Flag,
} from "lucide-react";
import { VideoPostPlayer } from "./VideoPostPlayer";
import { CommentsSheet } from "./CommentsSheet";
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
  /** If provided, single-tap on media opens the immersive viewer instead of navigating */
  onOpenViewer?: (post: SocialPost) => void;
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

export function FeedCard({ post, onLike, onSave, onComment, onDelete, onOpenViewer, onCommentCountChange }: Props) {
  const [, navigate]   = useLocation();
  const me             = useAppStore((s) => s.user);
  const followedIds    = useAppStore((s) => s.followedUserIds);
  const setFollowedIds = useAppStore((s) => s.setFollowedUserIds);

  const [mediaIndex,    setMediaIndex]    = useState(0);
  const [captionExpand, setCaptionExpand] = useState(false);
  const [showMenu,      setShowMenu]      = useState(false);
  const [followWorking, setFollowWorking] = useState(false);
  const [heartBurst,    setHeartBurst]    = useState(false);
  const [showComments,  setShowComments]  = useState(false);

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
      /* Double-tap → like */
      if (!post.has_liked) {
        onLike(post.id);
        setHeartBurst(true);
        setTimeout(() => setHeartBurst(false), 900);
      }
      lastTap.current = 0;
    } else {
      lastTap.current = now;
      setTimeout(() => {
        if (lastTap.current === now) {
          /* Single-tap → immersive viewer (or fall back to post detail) */
          if (onOpenViewer) onOpenViewer(post);
          else navigate(`/post/${post.id}`);
          lastTap.current = 0;
        }
      }, 310);
    }
  }, [post, onLike, onOpenViewer, navigate]);

  /* ── Open comments sheet ─────────────────────────────────────────────── */
  const handleCommentClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setShowComments(true);
    /* Also call external callback if provided (e.g. ImmersiveViewer) */
    onComment?.(post.id);
  }, [onComment, post.id]);

  /* ── Follow / unfollow ──────────────────────────────────────────────── */
  const handleFollow = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
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
  }, [followWorking, isMe, isFollowing, post.author_id, followedIds, setFollowedIds]);

  /* ── Report ─────────────────────────────────────────────────────────── */
  const handleReport = useCallback(async () => {
    setShowMenu(false);
    try { await reportPost(post.id, "inappropriate"); } catch { /* silent */ }
  }, [post.id]);

  return (
    <>
    <div className="border-b" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
      {/* ── Header ───────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-4 py-3">
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
          <div className="flex items-center gap-1">
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={() => navigate(isMe ? "/profile" : `/profile/${post.author_id}`)}
              className="text-sm font-bold app-text truncate max-w-[140px]"
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
            <span className="text-[11px] app-text-muted ml-1">{relTime(post.created_at)}</span>
          </div>
          {post.author?.username && (
            <div className="text-[11px] app-text-muted">@{post.author.username}</div>
          )}
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

      {/* ── Media ────────────────────────────────────────────────────── */}
      {media.length > 0 && (
        <div
          className="relative"
          onClick={handleMediaTap}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          {currentMedia?.type === "video" ? (
            <VideoPostPlayer
              url={currentMedia.url}
              aspectRatio="4/5"
            />
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

          {/* Multi-media: invisible edge-tap zones only (no dots, no counter) */}
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
        </div>
      )}

      {/* ── Actions ──────────────────────────────────────────────────── */}
      <div className="flex items-center gap-1 px-3 pt-3 pb-1">
        <motion.button
          whileTap={{ scale: 0.82 }}
          onClick={() => onLike(post.id)}
          className="flex items-center gap-1.5 rounded-full px-3 py-2"
        >
          <Heart
            className="h-5 w-5 transition-colors"
            style={{ fill: post.has_liked ? "#f43f5e" : "none", color: post.has_liked ? "#f43f5e" : "rgba(255,255,255,0.7)" }}
          />
          <span className="text-xs font-semibold" style={{ color: post.has_liked ? "#f43f5e" : "rgba(255,255,255,0.7)" }}>
            {fmtCount(post.like_count ?? 0)}
          </span>
        </motion.button>

        <motion.button
          whileTap={{ scale: 0.82 }}
          onClick={handleCommentClick}
          className="flex items-center gap-1.5 rounded-full px-3 py-2"
        >
          <MessageCircle className="h-5 w-5" style={{ color: "rgba(255,255,255,0.7)" }} />
          <span className="text-xs font-semibold" style={{ color: "rgba(255,255,255,0.7)" }}>
            {fmtCount(post.comment_count ?? 0)}
          </span>
        </motion.button>

        <motion.button
          whileTap={{ scale: 0.82 }}
          onClick={() => onSave(post.id)}
          className="flex items-center gap-1.5 rounded-full px-3 py-2"
        >
          <Bookmark
            className="h-5 w-5 transition-colors"
            style={{ fill: post.has_saved ? "#a855f7" : "none", color: post.has_saved ? "#a855f7" : "rgba(255,255,255,0.7)" }}
          />
        </motion.button>

        <div className="flex-1" />

        <div className="flex items-center gap-1 px-3">
          <Eye className="h-4 w-4" style={{ color: "rgba(255,255,255,0.3)" }} />
          <span className="text-[11px]" style={{ color: "rgba(255,255,255,0.35)" }}>
            {fmtCount(post.view_count ?? 0)}
          </span>
        </div>
      </div>

      {/* ── Caption ──────────────────────────────────────────────────── */}
      {post.caption && (
        <div className="px-4 pb-4">
          <p
            className="text-sm leading-relaxed app-text"
            style={{
              display: captionExpand ? "block" : "-webkit-box",
              WebkitLineClamp: captionExpand ? undefined : 2,
              WebkitBoxOrient: "vertical",
              overflow: captionExpand ? "visible" : "hidden",
            } as React.CSSProperties}
          >
            {post.caption}
          </p>
          {post.caption.length > 100 && !captionExpand && (
            <button
              onClick={() => setCaptionExpand(true)}
              className="text-xs app-text-muted mt-0.5"
            >
              more
            </button>
          )}
        </div>
      )}
    </div>

    {/* ── TikTok-style comments bottom sheet ───────────────────────── */}
    {showComments && (
      <CommentsSheet
        postId={post.id}
        initialCount={post.comment_count ?? 0}
        onClose={() => setShowComments(false)}
        onCountChange={(delta) => onCommentCountChange?.(post.id, delta)}
      />
    )}
    </>
  );
}
