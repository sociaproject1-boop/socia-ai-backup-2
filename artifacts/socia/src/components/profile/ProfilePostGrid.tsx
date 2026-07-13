/**
 * ProfilePostGrid.tsx — profile grid helpers.
 *
 * XFeedPostCard is now a re-export of the single global FeedCard.
 * MediaThumbnail: kept for backward compat (masonry/media grids).
 */
import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { useLocation } from "wouter";
import type { SocialPost } from "@/lib/postsClient";
import { FeedCard } from "@/components/feed/FeedCard";

/* Re-export the unified card so any remaining XFeedPostCard imports still work */
export function XFeedPostCard({ post, index }: { post: SocialPost; index: number }) {
  return <FeedCard post={post} index={index} />;
}

/* ── Legacy masonry thumbnail — kept for any remaining uses ─────────── */
export function MediaThumbnail({ post, index }: { post: SocialPost; index: number }) {
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
        className="relative overflow-hidden cursor-pointer"
        style={{
          aspectRatio: aspect,
          background: "rgba(255,255,255,0.04)",
          borderRadius: 12,
        }}
      >
        {isVideo ? (
          <video src={thumbUrl} className="h-full w-full object-cover" muted playsInline preload="metadata" />
        ) : (
          <img src={thumbUrl} alt={post.caption ?? ""} className="h-full w-full object-cover" loading="lazy" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
        {isVideo && (
          <div className="absolute left-2 top-2 grid h-6 w-6 place-items-center rounded-full"
            style={{ background: "rgba(0,0,0,0.6)" }}>
            <svg viewBox="0 0 16 16" fill="white" style={{ width: 10, height: 10 }}>
              <path d="M5 3l9 5-9 5V3z" />
            </svg>
          </div>
        )}
        {isMulti && !isVideo && (
          <div className="absolute right-2 top-2">
            <svg viewBox="0 0 20 20" fill="white" style={{ width: 16, height: 16, filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.5))" }}>
              <rect x="3" y="7" width="10" height="10" rx="2" fill="none" stroke="white" strokeWidth="1.5" />
              <rect x="7" y="3" width="10" height="10" rx="2" fill="none" stroke="white" strokeWidth="1.5" />
            </svg>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

/* ── Legacy ProfilePostGrid wrapper ─────────────────────────────────── */
interface LegacyProps {
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
  posts, loading, hasMore, loadingMore, onLoadMore,
  emptyTitle, emptySub, emptyIcon, layout = "masonry",
}: LegacyProps) {
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
      <div>
        {[...Array(3)].map((_, i) => (
          <div key={i} style={{ display: "flex", gap: 12, padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
            <div className="shimmer rounded-full" style={{ width: 40, height: 40, flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div className="shimmer rounded" style={{ height: 12, width: "60%", marginBottom: 8 }} />
              <div className="shimmer rounded" style={{ height: 12, width: "80%" }} />
            </div>
          </div>
        ))}
      </div>
    ) : (
      <div className="columns-2 gap-0.5">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="break-inside-avoid mb-0.5">
            <div className="shimmer" style={{ width: "100%", aspectRatio: i % 5 === 0 ? "3/4" : "9/13" }} />
          </div>
        ))}
      </div>
    );
  }

  if (posts.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 px-8 py-16 text-center">
        <div className="grid h-16 w-16 place-items-center rounded-[20px]"
          style={{ background: "rgba(168,85,247,0.1)", border: "1px solid rgba(168,85,247,0.2)" }}>
          {emptyIcon ?? (
            <svg viewBox="0 0 24 24" fill="none" stroke="rgba(168,85,247,0.8)" strokeWidth="1.5"
              style={{ width: 28, height: 28 }}>
              <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
            </svg>
          )}
        </div>
        <p style={{ fontSize: 15, fontWeight: 700, color: "#E7E9EA" }}>{emptyTitle}</p>
        <p style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", maxWidth: 200 }}>{emptySub}</p>
      </div>
    );
  }

  if (layout === "feed") {
    return (
      <div>
        {posts.map((post, i) => <XFeedPostCard key={post.id} post={post} index={i} />)}
        {(hasMore || loadingMore) && (
          <div ref={sentinelRef} className="flex justify-center py-6">
            {loadingMore && (
              <div className="animate-spin rounded-full border-2"
                style={{ width: 20, height: 20, borderColor: "rgba(255,255,255,0.15)", borderTopColor: "#1D9BF0" }} />
            )}
          </div>
        )}
        {!hasMore && posts.length > 0 && (
          <p className="py-4 text-center" style={{ fontSize: 11, color: "rgba(255,255,255,0.2)" }}>
            You're all caught up ✨
          </p>
        )}
      </div>
    );
  }

  return (
    <>
      <div className="columns-2 gap-3">
        {posts.map((post, i) => <MediaThumbnail key={post.id} post={post} index={i} />)}
      </div>
      {(hasMore || loadingMore) && (
        <div ref={sentinelRef} className="flex justify-center py-6">
          {loadingMore && (
            <div className="animate-spin rounded-full border-2"
              style={{ width: 20, height: 20, borderColor: "rgba(255,255,255,0.15)", borderTopColor: "#1D9BF0" }} />
          )}
        </div>
      )}
    </>
  );
}
