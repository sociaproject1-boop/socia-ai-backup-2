/**
 * ProfilePostGrid.tsx — X (Twitter) style post cards for profile feed.
 *
 * XFeedPostCard: Two-column layout (avatar left, all content right).
 * MediaThumbnail: kept for backward compat (masonry grids if needed).
 */
import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { useLocation } from "wouter";
import { MoreHorizontal } from "lucide-react";
import type { SocialPost } from "@/lib/postsClient";

/* ── Helpers ─────────────────────────────────────────────────────────── */
function compact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function timeAgo(dateStr?: string): string {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  return new Date(dateStr).toLocaleDateString([], { month: "short", day: "numeric" });
}

/* ── SVG icon helpers ────────────────────────────────────────────────── */
function Icon({ path, size = 18, color = "rgba(113,118,123,1)", fill = "none", strokeWidth = 1.7 }: {
  path: string; size?: number; color?: string; fill?: string; strokeWidth?: number;
}) {
  return (
    <svg viewBox="0 0 24 24" fill={fill} stroke={color} strokeWidth={strokeWidth}
      strokeLinecap="round" strokeLinejoin="round" style={{ width: size, height: size, flexShrink: 0 }}>
      <path d={path} />
    </svg>
  );
}

/* ── X-style feed post card ─────────────────────────────────────────── */
export function XFeedPostCard({ post, index }: { post: SocialPost; index: number }) {
  const [, navigate] = useLocation();
  const hasMedia = (post.media?.length ?? 0) > 0;
  const mediaItems = post.media ?? [];
  const firstMedia = mediaItems[0];
  const isVideo = firstMedia?.type === "video";
  const ago = timeAgo(post.created_at);

  const authorName     = post.author?.name || post.author?.username || "User";
  const authorHandle   = post.author?.username || post.author?.name || "user";
  const authorAvatar   = post.author?.avatar_url;
  const authorInitial  = authorName.charAt(0).toUpperCase();

  const likeCount    = post.like_count ?? 0;
  const commentCount = post.comment_count ?? 0;
  const shareCount   = (post as any).share_count ?? 0;
  const viewCount    = (post as any).view_count ?? 0;

  return (
    <motion.article
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.15, delay: Math.min(index * 0.025, 0.15) }}
      style={{
        display: "flex",
        gap: 12,
        padding: "12px 16px",
        borderBottom: "1px solid rgba(255,255,255,0.08)",
        background: "transparent",
        cursor: "pointer",
      }}
      onClick={() => navigate(`/post/${post.id}`)}
    >
      {/* Left column: avatar */}
      <div style={{ flexShrink: 0, paddingTop: 2 }}>
        {authorAvatar ? (
          <img
            src={authorAvatar}
            alt={authorName}
            loading="lazy"
            style={{
              width: 40, height: 40,
              borderRadius: "50%",
              objectFit: "cover",
              border: "1.5px solid rgba(255,255,255,0.1)",
            }}
          />
        ) : (
          <div
            style={{
              width: 40, height: 40,
              borderRadius: "50%",
              background: "linear-gradient(135deg,#1D9BF0,#6a5acd)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 16, fontWeight: 700, color: "#fff",
            }}
          >
            {authorInitial}
          </div>
        )}
      </div>

      {/* Right column: everything */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Header row — ONE LINE: name · @handle · time · ··· */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            flexWrap: "nowrap",
            overflow: "hidden",
          }}
        >
          {/* Name */}
          <span
            style={{
              fontSize: 14, fontWeight: 700, color: "#E7E9EA",
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
              maxWidth: "40%", flexShrink: 0,
            }}
          >
            {authorName}
          </span>

          {/* @handle */}
          <span
            style={{
              fontSize: 14, color: "#71767B",
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
              flexShrink: 1, minWidth: 0,
            }}
          >
            @{authorHandle}
          </span>

          {/* dot + time */}
          {ago && (
            <>
              <span style={{ color: "#71767B", fontSize: 14, flexShrink: 0 }}>·</span>
              <span style={{ fontSize: 14, color: "#71767B", whiteSpace: "nowrap", flexShrink: 0 }}>
                {ago}
              </span>
            </>
          )}

          {/* spacer */}
          <div style={{ flex: 1 }} />

          {/* more button */}
          <motion.button
            whileTap={{ scale: 0.85 }}
            onClick={e => { e.stopPropagation(); }}
            style={{ flexShrink: 0, color: "#71767B", display: "flex", alignItems: "center", padding: 2 }}
          >
            <MoreHorizontal style={{ width: 18, height: 18 }} />
          </motion.button>
        </div>

        {/* Caption */}
        {post.caption && (
          <p
            style={{
              fontSize: 14, color: "#E7E9EA", lineHeight: 1.5,
              marginTop: 4, whiteSpace: "pre-line",
            }}
          >
            {post.caption}
          </p>
        )}

        {/* Media */}
        {hasMedia && (
          <div style={{ marginTop: 10 }}>
            {mediaItems.length === 1 ? (
              /* Single image/video */
              <div
                style={{
                  borderRadius: 14, overflow: "hidden",
                  border: "1px solid rgba(255,255,255,0.1)",
                  background: "#111",
                  maxHeight: 520,
                }}
              >
                {isVideo ? (
                  <video
                    src={firstMedia.url}
                    style={{ width: "100%", maxHeight: 520, objectFit: "cover", display: "block" }}
                    muted playsInline preload="metadata"
                  />
                ) : (
                  <img
                    src={firstMedia.url}
                    alt={post.caption ?? ""}
                    style={{ width: "100%", maxHeight: 520, objectFit: "cover", display: "block" }}
                    loading="lazy"
                  />
                )}
              </div>
            ) : (
              /* Multiple images — 2-col grid like X */
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: mediaItems.length === 2 ? "1fr 1fr"
                    : mediaItems.length === 3 ? "1fr 1fr" : "1fr 1fr",
                  gridTemplateRows: mediaItems.length === 3 ? "auto auto" : "auto",
                  gap: 2,
                  borderRadius: 14, overflow: "hidden",
                  border: "1px solid rgba(255,255,255,0.1)",
                  aspectRatio: "16/10",
                }}
              >
                {mediaItems.slice(0, 4).map((m, i) => (
                  <div
                    key={i}
                    style={{
                      overflow: "hidden",
                      gridRow: mediaItems.length === 3 && i === 0 ? "1 / span 2" : undefined,
                    }}
                  >
                    {m.type === "video" ? (
                      <video
                        src={m.url}
                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
                        muted playsInline preload="metadata"
                      />
                    ) : (
                      <img
                        src={m.url}
                        alt=""
                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
                        loading="lazy"
                      />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Engagement bar */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            marginTop: 12,
            gap: 0,
          }}
        >
          {/* Comment */}
          <EngagementBtn
            icon={<Icon path="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />}
            count={commentCount}
          />

          {/* Repost */}
          <EngagementBtn
            icon={
              <svg viewBox="0 0 24 24" fill="none" stroke="rgba(113,118,123,1)" strokeWidth="1.7"
                strokeLinecap="round" strokeLinejoin="round" style={{ width: 18, height: 18, flexShrink: 0 }}>
                <path d="M17 1l4 4-4 4" />
                <path d="M3 11V9a4 4 0 014-4h14" />
                <path d="M7 23l-4-4 4-4" />
                <path d="M21 13v2a4 4 0 01-4 4H3" />
              </svg>
            }
            count={shareCount}
          />

          {/* Like */}
          <EngagementBtn
            icon={
              <Icon
                path="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"
                fill={post.has_liked ? "#f43f5e" : "none"}
                color={post.has_liked ? "#f43f5e" : "rgba(113,118,123,1)"}
              />
            }
            count={likeCount}
            active={post.has_liked}
            activeColor="#f43f5e"
          />

          {/* Analytics/Views */}
          <EngagementBtn
            icon={<Icon path="M2 20h.01M7 20v-4M12 20v-8M17 20V8M22 4l-10 9-4-4-6 6" />}
            count={viewCount}
          />

          {/* Spacer */}
          <div style={{ flex: 1 }} />

          {/* Bookmark */}
          <EngagementBtn
            icon={
              <Icon
                path="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"
                fill={post.has_saved ? "#1D9BF0" : "none"}
                color={post.has_saved ? "#1D9BF0" : "rgba(113,118,123,1)"}
              />
            }
          />

          {/* Share */}
          <EngagementBtn
            icon={<Icon path="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8M16 6l-4-4-4 4M12 2v13" />}
          />
        </div>
      </div>
    </motion.article>
  );
}

/* ── Engagement button ───────────────────────────────────────────────── */
function EngagementBtn({
  icon, count, active, activeColor, onClick,
}: {
  icon: React.ReactNode;
  count?: number;
  active?: boolean;
  activeColor?: string;
  onClick?: (e: React.MouseEvent) => void;
}) {
  return (
    <motion.button
      whileTap={{ scale: 0.85 }}
      onClick={e => { e.stopPropagation(); onClick?.(e); }}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 4,
        padding: "4px 8px 4px 4px",
        background: "transparent",
        border: "none",
        cursor: "pointer",
        color: active ? activeColor : "rgba(113,118,123,1)",
      }}
    >
      {icon}
      {count != null && count > 0 && (
        <span style={{ fontSize: 13, color: active ? activeColor : "rgba(113,118,123,1)", lineHeight: 1 }}>
          {compact(count)}
        </span>
      )}
    </motion.button>
  );
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
