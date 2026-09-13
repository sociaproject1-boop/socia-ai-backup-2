/**
 * FeedCard.tsx — THE single feed card component used everywhere.
 *
 * Layout (Profile page is the canonical reference):
 *   [40px Avatar] | [Right column]
 *                    Name · @handle · time · ···
 *                    Caption
 *                    Media (inside right column, not full-width)
 *                    💬 Comment  🔁 Repost  ♥ Like  📊 Analytics  🔖  ↗
 *
 * ONE component, used on: Home, For You, Following, Explore, Trending,
 * Hashtag feeds, Profile Posts/Replies/Likes/Saved, UserProfile, Admin.
 */
import { useState, useRef, useCallback, memo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useLocation } from "wouter";
import {
  Heart, MessageCircle, Bookmark, Share2, BarChart2,
  MoreHorizontal, Flag,
} from "lucide-react";
import { VideoPostPlayer } from "./VideoPostPlayer";
import { RichCaption } from "./RichCaption";
import { reportPost, toggleLike } from "@/lib/postsClient";
import type { SocialPost } from "@/lib/postsClient";
import { useAppStore } from "@/lib/store";
import { supabase } from "@/lib/supabase";
import {
  FoundingSupporterBadge, getSupporterTier,
} from "@/components/profile/FoundingSupporterBadge";

/* ─────────────────────────────────────────────────────────────────────────── */
/*  Types                                                                       */
/* ─────────────────────────────────────────────────────────────────────────── */

interface Props {
  post: SocialPost;
  /** Called when user taps Like. Provide for feeds that manage their own state. */
  onLike?: (postId: string) => void;
  /** Called when user taps Bookmark. Provide for feeds that manage their own state. */
  onSave?: (postId: string) => void;
  onComment?: (postId: string) => void;
  onDelete?: (postId: string) => void;
  onCommentCountChange?: (postId: string, delta: number) => void;
  onOpenViewer?: (post: SocialPost) => void;
  onGuestAction?: (label?: string) => void;
  /** Post index — used for staggered entrance animation */
  index?: number;
}

/* ─────────────────────────────────────────────────────────────────────────── */
/*  Helpers                                                                     */
/* ─────────────────────────────────────────────────────────────────────────── */

function RetweetIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.0" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 1l4 4-4 4" />
      <path d="M3 11V9a4 4 0 014-4h14" />
      <path d="M7 23l-4-4 4-4" />
      <path d="M21 13v2a4 4 0 01-4 4H3" />
    </svg>
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

/* ─────────────────────────────────────────────────────────────────────────── */
/*  Action button                                                               */
/* ─────────────────────────────────────────────────────────────────────────── */

function ActionBtn({
  children,
  onClick,
  count,
  active,
  activeColor = "#1D9BF0",
  minW,
}: {
  children: React.ReactNode;
  onClick?: (e: React.MouseEvent) => void;
  count?: number;
  active?: boolean;
  activeColor?: string;
  minW?: number;
}) {
  return (
    <motion.button
      whileTap={{ scale: 0.82 }}
      transition={{ type: "spring", stiffness: 600, damping: 30 }}
      onClick={(e) => { e.stopPropagation(); onClick?.(e); }}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 5,
        height: 34,
        padding: "0 2px",
        minWidth: minW,
        background: "transparent",
        border: "none",
        cursor: "pointer",
        color: active ? activeColor : "#71767B",
      }}
    >
      {children}
      {count != null && count > 0 && (
        <span style={{ fontSize: 12, fontWeight: 500, color: active ? activeColor : "#71767B", lineHeight: 1 }}>
          {fmtCount(count)}
        </span>
      )}
    </motion.button>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */
/*  FeedCard                                                                    */
/* ─────────────────────────────────────────────────────────────────────────── */

export const FeedCard = memo(function FeedCard({
  post,
  onLike,
  onSave,
  onComment,
  onDelete,
  onOpenViewer,
  onCommentCountChange,
  onGuestAction,
  index = 0,
}: Props) {
  const [, navigate]    = useLocation();
  const me              = useAppStore((s) => s.user);
  const isAuthenticated = useAppStore((s) => s.isAuthenticated);
  const followedIds     = useAppStore((s) => s.followedUserIds);
  const setFollowedIds  = useAppStore((s) => s.setFollowedUserIds);

  /* Local optimistic state (used when parent doesn't provide callbacks) */
  const [localLiked,     setLocalLiked]     = useState(post.has_liked ?? false);
  const [localSaved,     setLocalSaved]     = useState(post.has_saved ?? false);
  const [localLikeCount, setLocalLikeCount] = useState(post.like_count ?? 0);

  const [mediaIndex,    setMediaIndex]    = useState(0);
  const [captionExpand, setCaptionExpand] = useState(false);
  const [showMenu,      setShowMenu]      = useState(false);
  const [followWorking, setFollowWorking] = useState(false);
  const [likeWorking, setLikeWorking] = useState(false);
  const [heartBurst,    setHeartBurst]    = useState(false);

  const lastTap     = useRef(0);
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);

  const isMe                = me?.id === post.author_id;
  const isOwner             = me?.isOwner === true;
  const isFollowing         = followedIds.includes(post.author_id);
  const authorSupporterTier = getSupporterTier(post.author as unknown as Record<string, unknown>);

  const media        = post.media ?? [];
  const currentMedia = media[mediaIndex];
  const hasMulti     = media.length > 1;

  /* Derived display values (local overrides parent when no callbacks given) */
  const displayLiked  = onLike ? (post.has_liked ?? false) : localLiked;
  const displaySaved  = onSave ? (post.has_saved ?? false) : localSaved;
  const displayLikeCount = onLike ? (post.like_count ?? 0) : localLikeCount;

  const requireAuth = useCallback((action: () => void, label?: string) => {
    if (isAuthenticated) action();
    else onGuestAction?.(label);
  }, [isAuthenticated, onGuestAction]);

  /* ── Like ── */
  const handleLike = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    requireAuth(async () => {
      if (likeWorking) return;
      if (onLike) {
        onLike(post.id);
      } else {
        setLikeWorking(true);
        const previousLiked = localLiked;
        const nowLiked = !previousLiked;
        setLocalLiked(nowLiked);
        setLocalLikeCount((c) => Math.max(0, c + (nowLiked ? 1 : -1)));
        setHeartBurst(nowLiked);
        if (nowLiked) setTimeout(() => setHeartBurst(false), 900);
        try {
          const result = await toggleLike(post.id);
          setLocalLiked(result.liked);
        } catch {
          setLocalLiked(previousLiked);
          setLocalLikeCount((c) => Math.max(0, c + (nowLiked ? -1 : 1)));
        } finally {
          setLikeWorking(false);
        }
      }
    }, "like posts");
  }, [onLike, post.id, localLiked, likeWorking, requireAuth]);

  /* ── Save / bookmark ── */
  const handleSave = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    requireAuth(async () => {
      if (onSave) {
        onSave(post.id);
      } else {
        const nowSaved = !localSaved;
        setLocalSaved(nowSaved);
        try {
          if (nowSaved) await supabase.rpc("save_post" as any, { post_id: post.id });
          else           await supabase.rpc("unsave_post" as any, { post_id: post.id });
        } catch {
          setLocalSaved(!nowSaved);
        }
      }
    }, "save posts");
  }, [onSave, post.id, localSaved, requireAuth]);

  /* ── Touch / swipe ── */
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

  /* ── Double-tap to like ── */
  const handleMediaTap = useCallback(() => {
    const now = Date.now();
    if (now - lastTap.current < 300) {
      if (!displayLiked) {
        requireAuth(() => {
          if (onLike) {
            onLike(post.id);
          } else if (!likeWorking) {
            setLikeWorking(true);
            setLocalLiked(true);
            setLocalLikeCount((c) => c + 1);
            toggleLike(post.id).then((result) => {
              setLocalLiked(result.liked);
            }).catch(() => {
              setLocalLiked(false);
              setLocalLikeCount((c) => Math.max(0, c - 1));
            }).finally(() => setLikeWorking(false));
          }
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
  }, [displayLiked, post, onLike, onOpenViewer, navigate, requireAuth, likeWorking]);

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

  const handleReport = useCallback(async () => {
    setShowMenu(false);
    try { await reportPost(post.id, "inappropriate"); } catch { /* silent */ }
  }, [post.id]);

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
      } finally { setFollowWorking(false); }
    }, "follow creators");
  }, [followWorking, isMe, isFollowing, post.author_id, followedIds, setFollowedIds, requireAuth]);

  const CAPTION_LIMIT = media.length > 0 ? 160 : 400;

  /* ════════════════════════════════════════════════════════════════════════ */
  /*  Render                                                                   */
  /* ════════════════════════════════════════════════════════════════════════ */
  return (
    <motion.article
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.15, delay: Math.min(index * 0.02, 0.12) }}
      style={{
        display: "flex",
        gap: 12,
        padding: "12px 16px 8px",
        borderBottom: "1px solid rgba(255,255,255,0.08)",
        background: "transparent",
        width: "100%",
        boxSizing: "border-box",
      }}
    >
      {/* ── LEFT COLUMN: Avatar ──────────────────────────────────────────── */}
      <div style={{ flexShrink: 0, paddingTop: 2 }}>
        <motion.button
          whileTap={{ scale: 0.92 }}
          onClick={(e) => {
            e.stopPropagation();
            navigate(isMe ? "/profile" : `/profile/${post.author_id}`);
          }}
          style={{ display: "block" }}
        >
          {post.author?.avatar_url ? (
            <img
              src={post.author.avatar_url}
              alt={post.author?.name ?? ""}
              loading="lazy"
              style={{
                width: 40, height: 40,
                borderRadius: "50%",
                objectFit: "cover",
                border: "1.5px solid rgba(255,255,255,0.1)",
                display: "block",
              }}
            />
          ) : (
            <div
              style={{
                width: 40, height: 40,
                borderRadius: "50%",
                background: "#1D9BF0",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 16, fontWeight: 700, color: "#fff",
                flexShrink: 0,
              }}
            >
              {(post.author?.name || post.author?.username || "?").charAt(0).toUpperCase()}
            </div>
          )}
        </motion.button>
      </div>

      {/* ── RIGHT COLUMN: All content ────────────────────────────────────── */}
      <div style={{ flex: 1, minWidth: 0 }}>

        {/* Header row: Name · @handle · time · ··· — never wraps */}
        <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "nowrap", overflow: "hidden" }}>
          {/* Display name */}
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={(e) => {
              e.stopPropagation();
              navigate(isMe ? "/profile" : `/profile/${post.author_id}`);
            }}
            style={{
              fontSize: 14, fontWeight: 700, color: "#E7E9EA",
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
              maxWidth: "40%", flexShrink: 0, background: "none", border: "none",
              cursor: "pointer", padding: 0,
            }}
          >
            {post.author?.name || post.author?.username || "User"}
          </motion.button>

          {/* Verified / supporter badge */}
          {authorSupporterTier ? (
            <FoundingSupporterBadge tier={authorSupporterTier} size={13} showGlow={false} />
          ) : (
            post.author?.is_verified &&
            (post.author?.subscription_status === "active" || post.author?.subscription_status === "owner") && (
              <svg width={14} height={14} viewBox="0 0 24 24" fill="#1D9BF0" style={{ flexShrink: 0 }}>
                <path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            )
          )}

          {/* @handle */}
          {post.author?.username && (
            <span style={{
              fontSize: 14, color: "#71767B",
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
              flexShrink: 1, minWidth: 0,
            }}>
              @{post.author.username}
            </span>
          )}

          {/* dot · time */}
          <span style={{ color: "#71767B", fontSize: 14, flexShrink: 0 }}>·</span>
          <span style={{ fontSize: 14, color: "#71767B", whiteSpace: "nowrap", flexShrink: 0 }}>
            {relTime(post.created_at)}
          </span>

          {/* Spacer */}
          <div style={{ flex: 1, minWidth: 0 }} />

          {/* ··· menu */}
          <div style={{ position: "relative", flexShrink: 0 }}>
            <motion.button
              whileTap={{ scale: 0.88 }}
              onClick={(e) => { e.stopPropagation(); setShowMenu((v) => !v); }}
              style={{
                display: "grid", placeItems: "center",
                width: 32, height: 32, borderRadius: "50%",
                background: "transparent", border: "none", cursor: "pointer",
                color: "#71767B", marginRight: -4,
              }}
            >
              <MoreHorizontal style={{ width: 16, height: 16 }} />
            </motion.button>

            <AnimatePresence>
              {showMenu && (
                <>
                  <div style={{ position: "fixed", inset: 0, zIndex: 30 }} onClick={() => setShowMenu(false)} />
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9, y: -4 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.9, y: -4 }}
                    style={{
                      position: "absolute", right: 0, top: 36, zIndex: 40,
                      minWidth: 160, borderRadius: 16, overflow: "hidden",
                      boxShadow: "0 4px 24px rgba(0,0,0,0.5)",
                      background: "#1C1F23", border: "1px solid rgba(255,255,255,0.08)",
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {!isMe && (
                      <button
                        onClick={handleFollow}
                        disabled={followWorking}
                        style={{ display: "flex", width: "100%", alignItems: "center", gap: 10, padding: "12px 16px", fontSize: 14, fontWeight: 500, color: "#E7E9EA", background: "none", border: "none", cursor: "pointer", textAlign: "left" }}
                      >
                        {isFollowing ? "Unfollow" : "Follow"} @{post.author?.username}
                      </button>
                    )}
                    {(isMe || isOwner) && onDelete && (
                      <button
                        onClick={() => { setShowMenu(false); onDelete(post.id); }}
                        style={{ display: "flex", width: "100%", alignItems: "center", gap: 10, padding: "12px 16px", fontSize: 14, fontWeight: 500, color: "#f87171", background: "none", border: "none", cursor: "pointer", textAlign: "left" }}
                      >
                        Delete post
                      </button>
                    )}
                    {!isMe && (
                      <button
                        onClick={handleReport}
                        style={{ display: "flex", width: "100%", alignItems: "center", gap: 10, padding: "12px 16px", fontSize: 14, fontWeight: 500, color: "#71767B", background: "none", border: "none", cursor: "pointer", textAlign: "left" }}
                      >
                        <Flag style={{ width: 14, height: 14 }} />
                        Report
                      </button>
                    )}
                    <button
                      onClick={() => setShowMenu(false)}
                      style={{ display: "flex", width: "100%", alignItems: "center", padding: "12px 16px", fontSize: 14, color: "#71767B", background: "none", border: "none", borderTop: "1px solid rgba(255,255,255,0.06)", cursor: "pointer", textAlign: "left" }}
                    >
                      Cancel
                    </button>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* ── Caption ── */}
        {post.caption && (
          <div style={{ marginTop: 4 }}>
            <p
              style={{
                fontSize: 14,
                lineHeight: 1.5,
                color: "#E7E9EA",
                whiteSpace: "pre-line",
                display: captionExpand ? "block" : "-webkit-box",
                WebkitLineClamp: captionExpand ? undefined : (media.length > 0 ? 4 : 10),
                WebkitBoxOrient: "vertical",
                overflow: captionExpand ? "visible" : "hidden",
              } as React.CSSProperties}
            >
              <RichCaption text={post.caption} />
            </p>
            {post.caption.length > CAPTION_LIMIT && !captionExpand && (
              <button
                onClick={(e) => { e.stopPropagation(); setCaptionExpand(true); }}
                style={{ fontSize: 14, marginTop: 2, color: "#1D9BF0", background: "none", border: "none", cursor: "pointer", padding: 0 }}
              >
                Show more
              </button>
            )}
          </div>
        )}

        {/* ── Media (inside right column, X-profile width) ── */}
        {media.length > 0 && (
          <div
            style={{ marginTop: 10 }}
            onClick={handleMediaTap}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
          >
            {media.length === 1 ? (
              /* Single image / video */
              <div style={{ position: "relative", borderRadius: 14, overflow: "hidden", border: "1px solid rgba(255,255,255,0.1)", background: "#111" }}>
                {currentMedia?.type === "video" ? (
                  <VideoPostPlayer url={currentMedia.url} sound={post.sound} />
                ) : (
                  <AnimatePresence mode="popLayout" initial={false}>
                    <motion.img
                      key={`${post.id}-${mediaIndex}`}
                      src={currentMedia?.url}
                      alt={post.caption ?? ""}
                      loading="lazy"
                      draggable={false}
                      style={{ width: "100%", height: "auto", display: "block", objectFit: "contain", maxHeight: 480 }}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.15 }}
                    />
                  </AnimatePresence>
                )}

                {/* Double-tap heart burst */}
                <AnimatePresence>
                  {heartBurst && (
                    <motion.div
                      key="heart"
                      initial={{ opacity: 0, scale: 0.5 }}
                      animate={{ opacity: 1, scale: 1.3 }}
                      exit={{ opacity: 0, scale: 1.8 }}
                      transition={{ duration: 0.6, ease: "easeOut" }}
                      style={{ pointerEvents: "none", position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}
                    >
                      <Heart style={{ width: 72, height: 72, fill: "white", color: "white" }} />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ) : (
              /* Multiple images — 2-column grid */
              <div
                style={{
                  position: "relative",
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 2,
                  borderRadius: 14,
                  overflow: "hidden",
                  border: "1px solid rgba(255,255,255,0.1)",
                  aspectRatio: "16/10",
                }}
              >
                {media.slice(0, 4).map((m, i) => (
                  <div
                    key={i}
                    style={{
                      overflow: "hidden",
                      gridRow: media.length === 3 && i === 0 ? "1 / span 2" : undefined,
                    }}
                  >
                    {m.type === "video" ? (
                      <video src={m.url} style={{ width: "100%", height: "100%", objectFit: "cover" }} muted playsInline preload="metadata" />
                    ) : (
                      <img src={m.url} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    )}
                  </div>
                ))}

                {/* Swipe dots */}
                {hasMulti && (
                  <div style={{ position: "absolute", bottom: 8, left: "50%", transform: "translateX(-50%)", display: "flex", gap: 4, pointerEvents: "none" }}>
                    {media.map((_, i) => (
                      <span key={i} style={{
                        borderRadius: 999,
                        width: i === mediaIndex ? 14 : 5, height: 5,
                        background: i === mediaIndex ? "white" : "rgba(255,255,255,0.45)",
                        transition: "width 0.2s",
                      }} />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Swipe zone buttons (single media) */}
            {hasMulti && media.length === 1 && (
              <>
                {mediaIndex > 0 && (
                  <button aria-label="Previous" onClick={(e) => { e.stopPropagation(); setMediaIndex((i) => i - 1); }}
                    style={{ position: "absolute", left: 0, top: 0, width: "25%", height: "100%", zIndex: 10, opacity: 0, cursor: "pointer" }} />
                )}
                {mediaIndex < media.length - 1 && (
                  <button aria-label="Next" onClick={(e) => { e.stopPropagation(); setMediaIndex((i) => i + 1); }}
                    style={{ position: "absolute", right: 0, top: 0, width: "25%", height: "100%", zIndex: 10, opacity: 0, cursor: "pointer" }} />
                )}
              </>
            )}
          </div>
        )}

        {/* ── Engagement bar ─────────────────────────────────────────────
             Global order: ❤️ Like · 💬 Comment · 📈 Analytics (left)
                           🔖 Bookmark · 🔁 Repost · 📤 Share (right)
             strokeWidth 2.0 on all icons for a slightly stronger visual weight. */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            marginTop: 10,
          }}
        >
          {/* Left group: Like · Comment · Analytics */}
          <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
            {/* Like */}
            <ActionBtn
              onClick={handleLike}
              count={displayLikeCount}
              active={displayLiked}
              activeColor="#f91880"
              minW={48}
            >
              <Heart
                style={{
                  width: 18, height: 18,
                  fill: displayLiked ? "#f91880" : "none",
                  color: displayLiked ? "#f91880" : "#71767B",
                  transition: "fill 0.15s, color 0.15s",
                }}
                strokeWidth={2.0}
              />
            </ActionBtn>

            {/* Comment */}
            <ActionBtn onClick={handleCommentClick} count={post.comment_count ?? 0} minW={48}>
              <MessageCircle style={{ width: 18, height: 18 }} strokeWidth={2.0} />
            </ActionBtn>

            {/* Analytics / Views */}
            <ActionBtn count={(post as any).view_count > 0 ? (post as any).view_count : undefined} minW={44}>
              <BarChart2 style={{ width: 18, height: 18 }} strokeWidth={2.0} />
            </ActionBtn>
          </div>

          {/* Right group: Bookmark · Repost · Share */}
          <div style={{ display: "flex", alignItems: "center", gap: 2, marginLeft: "auto" }}>
            {/* Bookmark */}
            <ActionBtn onClick={handleSave} active={displaySaved} activeColor="#1D9BF0">
              <Bookmark
                style={{
                  width: 18, height: 18,
                  fill: displaySaved ? "#1D9BF0" : "none",
                  color: displaySaved ? "#1D9BF0" : "#71767B",
                  transition: "fill 0.15s, color 0.15s",
                }}
                strokeWidth={2.0}
              />
            </ActionBtn>

            {/* Repost */}
            <ActionBtn onClick={(e) => { e.stopPropagation(); requireAuth(() => {}, "repost"); }}>
              <RetweetIcon size={18} />
            </ActionBtn>

            {/* Share */}
            <ActionBtn onClick={handleShare}>
              <Share2 style={{ width: 18, height: 18 }} strokeWidth={2.0} />
            </ActionBtn>
          </div>
        </div>

      </div>
    </motion.article>
  );
});
