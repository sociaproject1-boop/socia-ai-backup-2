/**
 * ProfilePostGrid.tsx — Reusable paginated post grid for profile tabs.
 *
 * Layouts:
 *   masonry  — 2-column masonry for photos/videos (Spotlight, Gallery, Motion)
 *   feed     — Facebook-style vertical cards (All, Moments)
 */
import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useLocation } from "wouter";
import { Play, Images, MessageSquare, Heart, Bookmark, Share2 } from "lucide-react";
import type { SocialPost } from "@/lib/postsClient";

interface Props {
  posts: SocialPost[];
  loading: boolean;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  emptyTitle: string;
  emptySub: string;
  emptyIcon?: React.ReactNode;
  layout?: "masonry" | "grid" | "feed";
}

function fmtCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export function ProfilePostGrid({
  posts,
  loading,
  hasMore,
  loadingMore,
  onLoadMore,
  emptyTitle,
  emptySub,
  emptyIcon,
  layout = "masonry",
}: Props) {
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting && hasMore && !loadingMore) onLoadMore(); },
      { threshold: 0.1 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [hasMore, loadingMore, onLoadMore]);

  if (loading) {
    return layout === "feed" ? (
      <div className="space-y-3 px-4 pt-2">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="w-full rounded-[20px] shimmer" style={{ height: 130 }} />
        ))}
      </div>
    ) : (
      <div className="columns-2 gap-3">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="break-inside-avoid mb-3">
            <div className="w-full rounded-[16px] shimmer"
              style={{ aspectRatio: i % 5 === 0 ? "3/4" : i % 7 === 0 ? "1/1" : "9/13" }} />
          </div>
        ))}
      </div>
    );
  }

  if (posts.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 px-8 py-16 text-center">
        <div className="grid h-16 w-16 place-items-center rounded-[20px] float"
          style={{ background: "rgba(168,85,247,0.1)", border: "1px solid rgba(168,85,247,0.2)" }}>
          {emptyIcon ?? <MessageSquare className="h-7 w-7 text-purple-400" />}
        </div>
        <p className="font-display text-[15px] font-bold text-white">{emptyTitle}</p>
        <p className="text-[12px] text-white/40 max-w-[200px]">{emptySub}</p>
      </div>
    );
  }

  if (layout === "feed") {
    return (
      <div>
        <AnimatePresence>
          {posts.map((post, i) => (
            <FeedPostCard key={post.id} post={post} index={i} />
          ))}
        </AnimatePresence>
        {(hasMore || loadingMore) && (
          <div ref={sentinelRef} className="flex justify-center py-6">
            {loadingMore && <Spinner />}
          </div>
        )}
        {!hasMore && posts.length > 0 && (
          <p className="py-4 text-center text-[11px] text-white/20">You're all caught up ✨</p>
        )}
      </div>
    );
  }

  return (
    <>
      <div className="columns-2 gap-3">
        {posts.map((post, i) => (
          <MediaThumbnail key={post.id} post={post} index={i} />
        ))}
      </div>
      {(hasMore || loadingMore) && (
        <div ref={sentinelRef} className="flex justify-center py-6">
          {loadingMore && <Spinner />}
        </div>
      )}
      {!hasMore && posts.length > 0 && (
        <p className="py-3 text-center text-[10px] text-white/20">All {posts.length} items loaded</p>
      )}
    </>
  );
}

/* ── Feed-style card (used for All tab and Moments) ──────────────────────── */
function FeedPostCard({ post, index }: { post: SocialPost; index: number }) {
  const [, navigate] = useLocation();
  const hasMedia = (post.media?.length ?? 0) > 0;
  const firstMedia = post.media?.[0];
  const isVideo = firstMedia?.type === "video";
  const timeAgo = formatTimeAgo(post.created_at);

  return (
    <motion.article
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, delay: Math.min(index * 0.03, 0.18) }}
      className="border-b"
      style={{ borderColor: "rgba(255,255,255,0.06)" }}
    >
      {/* Author row */}
      <div className="flex items-center gap-3 px-4 pt-3.5 pb-2">
        <motion.div
          whileTap={{ scale: 0.92 }}
          onClick={() => navigate(`/post/${post.id}`)}
          className="flex-shrink-0 cursor-pointer"
        >
          {post.author?.avatar_url ? (
            <img src={post.author.avatar_url} alt="" className="h-9 w-9 rounded-full object-cover"
              style={{ border: "1.5px solid rgba(255,255,255,0.1)" }} />
          ) : (
            <div className="h-9 w-9 rounded-full grid place-items-center text-xs font-bold text-white"
              style={{ background: "linear-gradient(135deg,var(--accent-primary),var(--accent-secondary))" }}>
              {(post.author?.name || post.author?.username || "?").charAt(0).toUpperCase()}
            </div>
          )}
        </motion.div>
        <div className="flex-1 min-w-0 cursor-pointer" onClick={() => navigate(`/post/${post.id}`)}>
          <p className="text-[13px] font-bold app-text leading-tight">
            {post.author?.name || post.author?.username || "User"}
          </p>
          <p className="text-[11px] app-text-muted mt-0.5">{timeAgo}</p>
        </div>
      </div>

      {/* Caption — always above media */}
      {post.caption && (
        <div
          className="px-4 pb-2 cursor-pointer"
          onClick={() => navigate(`/post/${post.id}`)}
        >
          <p className="text-[14px] leading-relaxed app-text line-clamp-5 whitespace-pre-line">
            {post.caption}
          </p>
        </div>
      )}

      {/* Media thumbnail */}
      {hasMedia && firstMedia && (
        <div
          className="cursor-pointer overflow-hidden"
          style={{ maxHeight: 320, background: "#0a0a0a" }}
          onClick={() => navigate(`/post/${post.id}`)}
        >
          {isVideo ? (
            <video src={firstMedia.url} className="w-full object-cover" style={{ maxHeight: 320 }}
              muted playsInline preload="metadata" />
          ) : (
            <img src={firstMedia.url} alt={post.caption ?? ""} className="w-full object-cover"
              style={{ maxHeight: 320 }} loading="lazy" />
          )}
        </div>
      )}

      {/* Engagement stats + action strip */}
      <div className="px-4 pt-2 pb-1">
        {/* Counts row */}
        {((post.like_count ?? 0) > 0 || (post.comment_count ?? 0) > 0) && (
          <div
            className="flex items-center gap-3 pb-2 mb-1"
            style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}
          >
            {(post.like_count ?? 0) > 0 && (
              <span className="text-[12px] app-text-muted">
                <span className="font-semibold app-text">{fmtCount(post.like_count ?? 0)}</span> likes
              </span>
            )}
            {(post.comment_count ?? 0) > 0 && (
              <span className="text-[12px] app-text-muted">
                <span className="font-semibold app-text">{fmtCount(post.comment_count ?? 0)}</span> comments
              </span>
            )}
          </div>
        )}

        {/* Action buttons */}
        <div className="flex items-center gap-0 -mx-2 pb-1">
          <ActionBtn
            icon={<Heart className="h-4 w-4" style={{ fill: post.has_liked ? "#f43f5e" : "none", color: post.has_liked ? "#f43f5e" : "rgba(255,255,255,0.55)" }} />}
            label="Like"
            active={post.has_liked}
            onClick={() => navigate(`/post/${post.id}`)}
          />
          <ActionBtn
            icon={<MessageSquare className="h-4 w-4" style={{ color: "rgba(255,255,255,0.55)" }} />}
            label="Comment"
            onClick={() => navigate(`/post/${post.id}`)}
          />
          <ActionBtn
            icon={<Share2 className="h-4 w-4" style={{ color: "rgba(255,255,255,0.55)" }} />}
            label="Share"
            onClick={() => navigate(`/post/${post.id}`)}
          />
          <ActionBtn
            icon={<Bookmark className="h-4 w-4" style={{ fill: post.has_saved ? "#a855f7" : "none", color: post.has_saved ? "#a855f7" : "rgba(255,255,255,0.55)" }} />}
            label="Save"
            active={post.has_saved}
            onClick={() => navigate(`/post/${post.id}`)}
          />
        </div>
      </div>
    </motion.article>
  );
}

function ActionBtn({
  icon, label, active, onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <motion.button
      whileTap={{ scale: 0.88 }}
      onClick={onClick}
      className="flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-[12px] font-semibold"
      style={{ color: active ? undefined : "rgba(255,255,255,0.55)" }}
    >
      {icon}
      {label}
    </motion.button>
  );
}

/* ── Masonry thumbnail (Spotlight / Gallery / Motion) ───────────────────── */
function MediaThumbnail({ post, index }: { post: SocialPost; index: number }) {
  const [, navigate] = useLocation();
  const firstMedia = post.media?.[0];
  const isVideo = firstMedia?.type === "video";
  const isMulti = (post.media?.length ?? 0) > 1;
  const thumbUrl = firstMedia?.url ?? "";
  const aspect = index % 5 === 0 ? "3/4" : index % 7 === 0 ? "1/1" : "9/13";

  if (!thumbUrl) return null;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.22, delay: Math.min(index * 0.02, 0.18) }}
      className="break-inside-avoid mb-3"
    >
      <motion.div
        whileTap={{ scale: 0.95 }}
        onClick={() => navigate(`/post/${post.id}`)}
        className="relative overflow-hidden rounded-[16px] cursor-pointer"
        style={{ aspectRatio: aspect, background: "rgba(255,255,255,0.04)" }}
      >
        {isVideo ? (
          <video src={thumbUrl} className="h-full w-full object-cover" muted playsInline preload="metadata" />
        ) : (
          <img src={thumbUrl} alt={post.caption ?? ""} className="h-full w-full object-cover" loading="lazy" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-transparent" />
        {isVideo && (
          <div className="absolute left-2 top-2 grid h-6 w-6 place-items-center rounded-full bg-black/60 backdrop-blur-sm">
            <Play className="h-3 w-3 fill-white text-white" />
          </div>
        )}
        {isMulti && !isVideo && (
          <div className="absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-full bg-black/60 backdrop-blur-sm">
            <Images className="h-3 w-3 text-white" />
          </div>
        )}
        {(post.like_count ?? 0) > 0 && (
          <div className="absolute bottom-2 left-2 flex items-center gap-1">
            <Heart className="h-3 w-3 fill-white text-white" />
            <span className="text-[10px] font-semibold text-white">
              {post.like_count > 999 ? `${(post.like_count / 1000).toFixed(1)}k` : post.like_count}
            </span>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

function Spinner() {
  return <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/15 border-t-purple-400" />;
}

function formatTimeAgo(dateStr?: string): string {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(dateStr).toLocaleDateString([], { month: "short", day: "numeric" });
}
