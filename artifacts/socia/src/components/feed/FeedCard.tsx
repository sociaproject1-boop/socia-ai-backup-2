/**
 * FeedCard.tsx — X (Twitter) style flat feed item.
 *
 * Layout:
 *   [Avatar]  [Name] [verified] @username · timestamp  [...]
 *             Caption text
 *   [Media — full width, rounded-2xl, slight margin]
 *   [💬 Comment][🔁 Repost][♥ Like][📊 Analytics]  [🔖][↗]
 */
import { useState, useRef, useCallback, memo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useLocation } from "wouter";
import {
  Heart, MessageCircle, Bookmark, Share2, BarChart2,
  MoreHorizontal, BadgeCheck, Flag, Music2,
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
  onGuestAction?: (label?: string) => void;
}

/* ── Repost / retweet icon ─────────────────────────────────────────────── */
function RetweetIcon({ size = 19, color = "currentColor" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 1l4 4-4 4" />
      <path d="M3 11V9a4 4 0 014-4h14" />
      <path d="M7 23l-4-4 4-4" />
      <path d="M21 13v2a4 4 0 01-4 4H3" />
    </svg>
  );
}

/* ── Spinning music disc ──────────────────────────────────────────────── */
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
      <span className="absolute inset-0 rounded-full"
        style={{ border: "2px solid rgba(255,255,255,0.18)" }} />
      <span
        className="absolute inset-[3px] rounded-full overflow-hidden grid place-items-center"
        style={{ background: "#111", ...DISC_SPIN_STYLE }}
      >
        {sound?.cover_image ? (
          <img src={sound.cover_image} alt={sound.title ?? "Sound"}
            className="h-full w-full object-cover rounded-full" draggable={false} />
        ) : (
          <Music2 className="text-[#71767B]" style={{ width: size * 0.38, height: size * 0.38 }} />
        )}
      </span>
      <span
        className="absolute rounded-full"
        style={{
          width: size * 0.24, height: size * 0.24,
          top: "50%", left: "50%",
          transform: "translate(-50%,-50%)",
          background: "#000",
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

export const FeedCard = memo(function FeedCard({
  post, onLike, onSave, onComment, onDelete, onOpenViewer, onCommentCountChange, onGuestAction,
}: Props) {
  const [, navigate]    = useLocation();
  const me              = useAppStore((s) => s.user);
  const isAuthenticated = useAppStore((s) => s.isAuthenticated);
  const followedIds     = useAppStore((s) => s.followedUserIds);
  const setFollowedIds  = useAppStore((s) => s.setFollowedUserIds);

  const [mediaIndex,    setMediaIndex]    = useState(0);
  const [captionExpand, setCaptionExpand] = useState(false);
  const [showMenu,      setShowMenu]      = useState(false);
  const [followWorking, setFollowWorking] = useState(false);
  const [heartBurst,    setHeartBurst]    = useState(false);

  const lastTap     = useRef(0);
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);

  const isMe               = me?.id === post.author_id;
  const isOwner            = me?.isOwner === true;
  const isFollowing        = followedIds.includes(post.author_id);
  const authorSupporterTier = getSupporterTier(post.author as unknown as Record<string, unknown>);

  const media        = post.media ?? [];
  const currentMedia = media[mediaIndex];
  const hasMulti     = media.length > 1;

  const requireAuth = useCallback((action: () => void, label?: string) => {
    if (isAuthenticated) action();
    else onGuestAction?.(label);
  }, [isAuthenticated, onGuestAction]);

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

  /* ── Action button helper ─────────────────────────────────────────────── */
  const ActionBtn = ({
    children, onClick, count, active, activeColor,
  }: {
    children: React.ReactNode;
    onClick?: (e: React.MouseEvent) => void;
    count?: number;
    active?: boolean;
    activeColor?: string;
  }) => (
    <motion.button
      whileTap={{ scale: 0.82 }}
      transition={{ type: "spring", stiffness: 600, damping: 30 }}
      onClick={onClick}
      className="flex items-center gap-1.5 py-2.5 min-w-0"
      style={{ color: active ? activeColor : "#71767B" }}
    >
      {children}
      {count != null && count > 0 && (
        <span style={{ fontSize: 12, fontWeight: 500, color: active ? activeColor : "#71767B" }}>
          {fmtCount(count)}
        </span>
      )}
    </motion.button>
  );

  return (
    <article
      className="w-full overflow-hidden"
      style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}
    >
      {/* ── Header: Avatar + Name/handle/time + menu ───────────────────── */}
      <div className="flex items-start gap-3 px-4 pt-3 pb-0">
        {/* Avatar */}
        <motion.button
          whileTap={{ scale: 0.92 }}
          onClick={() => navigate(isMe ? "/profile" : `/profile/${post.author_id}`)}
          className="flex-shrink-0"
        >
          {post.author?.avatar_url ? (
            <img
              src={post.author.avatar_url}
              alt=""
              className="h-10 w-10 rounded-full object-cover"
            />
          ) : (
            <div className="h-10 w-10 rounded-full grid place-items-center text-sm font-bold text-white bg-[#1D9BF0]">
              {(post.author?.name || post.author?.username || "?").charAt(0).toUpperCase()}
            </div>
          )}
        </motion.button>

        {/* Name row + menu */}
        <div className="flex-1 min-w-0 flex items-center justify-between gap-2">
          <div className="min-w-0">
            {/* Display name + verified + @username + dot + time — all one line */}
            <div className="flex items-center gap-1 flex-wrap leading-none">
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={() => navigate(isMe ? "/profile" : `/profile/${post.author_id}`)}
                className="text-[14px] font-bold text-[#E7E9EA] leading-none"
              >
                {post.author?.name || post.author?.username || "User"}
              </motion.button>
              {authorSupporterTier
                ? <FoundingSupporterBadge tier={authorSupporterTier} size={14} showGlow={false} />
                : (post.author?.is_verified &&
                    (post.author?.subscription_status === "active" ||
                     post.author?.subscription_status === "owner")) && (
                  <BadgeCheck className="h-3.5 w-3.5 flex-shrink-0 text-[#1D9BF0]" />
                )
              }
            </div>
            <div className="flex items-center gap-1 mt-0.5 flex-wrap">
              {post.author?.username && (
                <span className="text-[13px] text-[#71767B]">@{post.author.username}</span>
              )}
              <span className="text-[13px] text-[#71767B]">·</span>
              <span className="text-[13px] text-[#71767B]">{relTime(post.created_at)}</span>
            </div>
          </div>

          {/* More menu */}
          <div className="relative flex-shrink-0">
            <motion.button
              whileTap={{ scale: 0.88 }}
              onClick={() => setShowMenu((v) => !v)}
              className="grid h-8 w-8 place-items-center rounded-full -mr-1"
              style={{ color: "#71767B" }}
            >
              <MoreHorizontal className="h-4 w-4" />
            </motion.button>

            <AnimatePresence>
              {showMenu && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setShowMenu(false)} />
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9, y: -4 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.9, y: -4 }}
                    className="absolute right-0 top-9 z-40 min-w-[160px] rounded-2xl overflow-hidden shadow-xl"
                    style={{ background: "#1C1F23", border: "1px solid rgba(255,255,255,0.08)" }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {!isMe && (
                      <button
                        onClick={handleFollow}
                        disabled={followWorking}
                        className="flex w-full items-center gap-2.5 px-4 py-3 text-sm font-medium text-[#E7E9EA] hover:bg-white/5"
                      >
                        {isFollowing ? "Unfollow" : "Follow"} @{post.author?.username}
                      </button>
                    )}
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
                        className="flex w-full items-center gap-2.5 px-4 py-3 text-sm font-medium text-[#71767B] hover:bg-white/5"
                      >
                        <Flag className="h-4 w-4" />
                        Report
                      </button>
                    )}
                    <button
                      onClick={() => setShowMenu(false)}
                      className="flex w-full items-center gap-2.5 px-4 py-3 text-sm font-medium text-[#71767B] hover:bg-white/5"
                      style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}
                    >
                      Cancel
                    </button>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* ── Caption — full width below header ─────────────────────────── */}
      {post.caption && (
        <div className="px-4 pt-2 pb-2" style={{ paddingLeft: 68 }}>
          <p
            className="text-[14px] leading-[1.5] text-[#E7E9EA]"
            style={{
              textAlign: "left",
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
              onClick={() => setCaptionExpand(true)}
              className="text-sm mt-0.5 text-[#1D9BF0]"
            >
              Show more
            </button>
          )}
        </div>
      )}

      {/* ── Media — full width, rounded-2xl, slight horizontal margin ───── */}
      {media.length > 0 && (
        <div
          className="relative mt-2 mx-4"
          style={{ borderRadius: 16, overflow: "hidden" }}
          onClick={handleMediaTap}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          {currentMedia?.type === "video" ? (
            <VideoPostPlayer url={currentMedia.url} aspectRatio="16/9" sound={post.sound} />
          ) : (
            <div className="relative overflow-hidden" style={{ borderRadius: 16, background: "#111" }}>
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.img
                  key={`${post.id}-${mediaIndex}`}
                  src={currentMedia?.url}
                  alt={post.caption ?? ""}
                  className="w-full object-cover"
                  style={{ maxHeight: 520, minHeight: 200 }}
                  loading="lazy"
                  draggable={false}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                />
              </AnimatePresence>
            </div>
          )}

          {/* Multi-media navigation zones */}
          {hasMulti && (
            <>
              {mediaIndex > 0 && (
                <button aria-label="Previous"
                  onClick={(e) => { e.stopPropagation(); setMediaIndex((i) => i - 1); }}
                  className="absolute left-0 top-0 h-full w-1/4 z-10 opacity-0" />
              )}
              {mediaIndex < media.length - 1 && (
                <button aria-label="Next"
                  onClick={(e) => { e.stopPropagation(); setMediaIndex((i) => i + 1); }}
                  className="absolute right-0 top-0 h-full w-1/4 z-10 opacity-0" />
              )}
              <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1 pointer-events-none">
                {media.map((_, i) => (
                  <span key={i} className="rounded-full transition-all"
                    style={{ width: i === mediaIndex ? 14 : 5, height: 5,
                      background: i === mediaIndex ? "white" : "rgba(255,255,255,0.45)" }} />
                ))}
              </div>
            </>
          )}

          {/* Double-tap heart burst */}
          <AnimatePresence>
            {heartBurst && (
              <motion.div key="heart"
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: 1, scale: 1.3 }}
                exit={{ opacity: 0, scale: 1.8 }}
                transition={{ duration: 0.6, ease: "easeOut" }}
                className="pointer-events-none absolute inset-0 flex items-center justify-center"
              >
                <Heart className="h-20 w-20 fill-white text-white" />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Music disc overlay on photo */}
          {post.sound_id && currentMedia?.type !== "video" && (
            <div className="absolute right-3 bottom-3 z-20 flex flex-col items-center gap-1" style={{ pointerEvents: "auto" }}>
              <MusicDisc sound={post.sound} soundId={post.sound_id} navigate={navigate} size={40} />
            </div>
          )}
        </div>
      )}

      {/* ── Engagement bar: Comment | Repost | Like | Analytics  [Bookmark][Share] ── */}
      <div className="flex items-center justify-between px-3 pt-1 pb-1" style={{ paddingLeft: 58 }}>
        {/* Left group */}
        <div className="flex items-center gap-1">
          {/* Comment */}
          <ActionBtn onClick={handleCommentClick} count={post.comment_count ?? 0}>
            <MessageCircle className="h-[19px] w-[19px]" strokeWidth={1.75} />
          </ActionBtn>

          {/* Repost */}
          <ActionBtn
            onClick={(e) => { e.stopPropagation(); requireAuth(() => {}, "repost"); }}
            count={0}
          >
            <RetweetIcon size={19} color="#71767B" />
          </ActionBtn>

          {/* Like */}
          <ActionBtn
            onClick={(e) => { e.stopPropagation(); requireAuth(() => onLike(post.id), "like posts"); }}
            count={post.like_count ?? 0}
            active={post.has_liked}
            activeColor="#f91880"
          >
            <Heart
              className="h-[19px] w-[19px] transition-colors"
              style={{
                fill: post.has_liked ? "#f91880" : "none",
                color: post.has_liked ? "#f91880" : "#71767B",
              }}
              strokeWidth={1.75}
            />
          </ActionBtn>

          {/* Analytics / Views */}
          <ActionBtn>
            <BarChart2 className="h-[19px] w-[19px]" strokeWidth={1.75} />
            {(post.view_count ?? 0) > 0 && (
              <span style={{ fontSize: 12, fontWeight: 500, color: "#71767B" }}>
                {fmtCount(post.view_count ?? 0)}
              </span>
            )}
          </ActionBtn>
        </div>

        {/* Right group: Bookmark + Share */}
        <div className="flex items-center gap-1">
          {/* Music disc for text-only posts */}
          {post.sound_id && media.length === 0 && (
            <MusicDisc sound={post.sound} soundId={post.sound_id} navigate={navigate} size={32} />
          )}

          {/* Bookmark */}
          <ActionBtn
            onClick={(e) => { e.stopPropagation(); requireAuth(() => onSave(post.id), "save posts"); }}
            active={post.has_saved}
            activeColor="#1D9BF0"
          >
            <Bookmark
              className="h-[19px] w-[19px] transition-colors"
              style={{
                fill: post.has_saved ? "#1D9BF0" : "none",
                color: post.has_saved ? "#1D9BF0" : "#71767B",
              }}
              strokeWidth={1.75}
            />
          </ActionBtn>

          {/* Share */}
          <ActionBtn onClick={handleShare}>
            <Share2 className="h-[19px] w-[19px]" strokeWidth={1.75} />
          </ActionBtn>
        </div>
      </div>
    </article>
  );
});
