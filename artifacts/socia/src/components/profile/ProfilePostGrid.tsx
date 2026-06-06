/**
 * ProfilePostGrid.tsx — Reusable paginated post grid for profile tabs.
 * Handles photos, videos, and text-only (Moments) posts.
 */
import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useLocation } from "wouter";
import { Play, Images, MessageSquare, Heart, Bookmark } from "lucide-react";
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
      <div className="space-y-3">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="w-full rounded-[20px] shimmer" style={{ height: 120 }} />
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
      <div className="space-y-3">
        <AnimatePresence>
          {posts.map((post, i) => (
            <TextPostCard key={post.id} post={post} index={i} />
          ))}
        </AnimatePresence>
        {(hasMore || loadingMore) && (
          <div ref={sentinelRef} className="flex justify-center py-4">
            {loadingMore && <Spinner />}
          </div>
        )}
        {!hasMore && posts.length > 0 && (
          <p className="py-3 text-center text-[10px] text-white/20">All caught up</p>
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

function TextPostCard({ post, index }: { post: SocialPost; index: number }) {
  const [, navigate] = useLocation();
  const timeAgo = formatTimeAgo(post.created_at);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, delay: Math.min(index * 0.04, 0.2) }}
      whileTap={{ scale: 0.98 }}
      onClick={() => navigate(`/post/${post.id}`)}
      className="cursor-pointer rounded-[20px] p-4"
      style={{
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      <p className="text-[14px] leading-relaxed text-white/85 whitespace-pre-line line-clamp-6">
        {post.caption || "(no text)"}
      </p>
      <div className="mt-3 flex items-center gap-4 text-white/35">
        <span className="text-[11px]">{timeAgo}</span>
        <div className="flex items-center gap-1">
          <Heart className="h-3 w-3" />
          <span className="text-[11px]">{post.like_count ?? 0}</span>
        </div>
        <div className="flex items-center gap-1">
          <MessageSquare className="h-3 w-3" />
          <span className="text-[11px]">{post.comment_count ?? 0}</span>
        </div>
        <div className="flex items-center gap-1">
          <Bookmark className="h-3 w-3" />
          <span className="text-[11px]">{post.save_count ?? 0}</span>
        </div>
      </div>
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
