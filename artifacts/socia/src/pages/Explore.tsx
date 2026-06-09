/**
 * Explore.tsx — Public guest-accessible explore feed.
 *
 * Shows trending posts, popular creators, and trending hashtags.
 * No authentication required. Engagement actions show GuestAuthModal.
 */
import { useEffect, useState, useCallback, useRef } from "react";
import { useNavHide } from "@/hooks/useNavHide";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { TrendingUp, Hash, Users, RefreshCw, Search, ChevronRight } from "lucide-react";
import { FeedCard } from "@/components/feed/FeedCard";
import { useGuestGate } from "@/lib/useGuestGate";
import { useAppStore } from "@/lib/store";
import type { SocialPost } from "@/lib/postsClient";

interface Creator {
  id: string;
  name: string;
  username: string;
  avatar_url: string | null;
  is_verified: boolean;
  followers: number;
  subscription_status: string | null;
}

interface HashtagItem {
  tag: string;
  count: number;
}

interface ExploreData {
  posts: SocialPost[];
  creators: Creator[];
  hashtags: HashtagItem[];
}

async function fetchExplore(): Promise<ExploreData> {
  const res = await fetch("/api/explore");
  if (!res.ok) throw new Error("Failed to load explore");
  return res.json();
}

function fmtCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function CreatorCard({ creator }: { creator: Creator }) {
  const [, navigate] = useLocation();
  const isAuthenticated = useAppStore((s) => s.isAuthenticated);

  return (
    <motion.button
      whileTap={{ scale: 0.95 }}
      onClick={() => navigate(`/user/${creator.username}`)}
      className="flex flex-col items-center gap-2 rounded-2xl p-3 flex-shrink-0"
      style={{
        width: 100,
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.07)",
      }}
    >
      {creator.avatar_url ? (
        <img
          src={creator.avatar_url}
          alt=""
          className="h-12 w-12 rounded-full object-cover"
          style={{ border: "1.5px solid rgba(255,255,255,0.12)" }}
          loading="lazy"
        />
      ) : (
        <div
          className="h-12 w-12 rounded-full grid place-items-center text-lg font-bold text-white"
          style={{ background: "linear-gradient(135deg,var(--accent-primary),var(--accent-secondary))" }}
        >
          {(creator.name || creator.username || "?").charAt(0).toUpperCase()}
        </div>
      )}
      <div className="w-full text-center">
        <p className="truncate text-[12px] font-bold text-white leading-tight">
          {creator.name || creator.username}
        </p>
        {creator.followers > 0 && (
          <p className="text-[10px] mt-0.5" style={{ color: "rgba(255,255,255,0.4)" }}>
            {fmtCount(creator.followers)}
          </p>
        )}
      </div>
    </motion.button>
  );
}

function HashtagChip({ tag, count }: { tag: string; count: number }) {
  const [, navigate] = useLocation();
  return (
    <motion.button
      whileTap={{ scale: 0.95 }}
      onClick={() => navigate(`/hashtag/${tag.replace(/^#/, "")}`)}
      className="flex items-center gap-1.5 rounded-full px-3 py-1.5 flex-shrink-0"
      style={{
        background: "rgba(168,85,247,0.12)",
        border: "1px solid rgba(168,85,247,0.25)",
      }}
    >
      <Hash className="h-3 w-3" style={{ color: "var(--accent-primary)" }} />
      <span className="text-[12px] font-semibold" style={{ color: "var(--accent-primary)" }}>
        {tag.replace(/^#/, "")}
      </span>
      <span className="text-[10px]" style={{ color: "rgba(255,255,255,0.35)" }}>
        {fmtCount(count)}
      </span>
    </motion.button>
  );
}

function ShimmerCard() {
  return (
    <div className="mx-3 my-2 overflow-hidden rounded-[18px] px-4 py-4 space-y-3"
      style={{ background: "rgba(14,14,14,1)", border: "1px solid rgba(255,255,255,0.07)" }}>
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-full shimmer" />
        <div className="flex-1 space-y-1.5">
          <div className="h-3.5 w-28 rounded shimmer" />
          <div className="h-3 w-20 rounded shimmer" />
        </div>
      </div>
      <div className="h-56 w-full rounded-2xl shimmer" />
      <div className="flex gap-3">
        <div className="h-7 w-16 rounded-full shimmer" />
        <div className="h-7 w-16 rounded-full shimmer" />
        <div className="h-7 w-10 rounded-full shimmer" />
      </div>
    </div>
  );
}

export default function Explore() {
  const [, navigate]     = useLocation();
  const isAuthenticated  = useAppStore((s) => s.isAuthenticated);
  const { gateAction, GuestModalPortal } = useGuestGate();

  const [data, setData]       = useState<ExploreData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(false);
  const [posts, setPosts]     = useState<SocialPost[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const d = await fetchExplore();
      setData(d);
      setPosts(d.posts);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleLike = useCallback((postId: string) => {
    gateAction(async () => {
      try {
        await fetch(`/api/posts/${postId}/like`, { method: "POST" });
        setPosts((prev) => prev.map((p) =>
          p.id === postId
            ? { ...p, has_liked: !p.has_liked, like_count: (p.like_count ?? 0) + (p.has_liked ? -1 : 1) }
            : p
        ));
      } catch { /* silent */ }
    }, "like posts");
  }, [gateAction]);

  const handleSave = useCallback((postId: string) => {
    gateAction(async () => {
      try {
        await fetch(`/api/posts/${postId}/save`, { method: "POST" });
        setPosts((prev) => prev.map((p) =>
          p.id === postId ? { ...p, has_saved: !p.has_saved } : p
        ));
      } catch { /* silent */ }
    }, "save posts");
  }, [gateAction]);

  const handleComment = useCallback((postId: string) => {
    gateAction(() => navigate(`/post/${postId}`), "comment on posts");
  }, [gateAction, navigate]);

  const containerRef = useRef<HTMLDivElement>(null);
  useNavHide(containerRef);

  return (
    <div ref={containerRef} className="h-full overflow-y-auto app-bg">
      {/* ── Search bar shortcut (authenticated users only) ─────────────── */}
      {isAuthenticated && (
        <div className="px-4 pt-4 pb-2">
          <motion.button
            whileTap={{ scale: 0.98 }}
            onClick={() => navigate("/search")}
            className="w-full flex items-center gap-3 rounded-2xl px-4 py-3"
            style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
          >
            <Search className="h-4 w-4" style={{ color: "rgba(255,255,255,0.4)" }} />
            <span className="text-[14px]" style={{ color: "rgba(255,255,255,0.35)" }}>
              Search posts, creators, hashtags…
            </span>
          </motion.button>
        </div>
      )}

      {/* ── Trending hashtags ─────────────────────────────────────────── */}
      {!loading && data?.hashtags && data.hashtags.length > 0 && (
        <div className="mb-4">
          <div className="flex items-center justify-between px-4 pb-2">
            <div className="flex items-center gap-1.5">
              <TrendingUp className="h-4 w-4" style={{ color: "var(--accent-primary)" }} />
              <h2 className="text-[14px] font-bold text-white">Trending</h2>
            </div>
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => navigate("/search")}
              className="flex items-center gap-0.5 text-[12px]"
              style={{ color: "var(--accent-primary)" }}
            >
              See all <ChevronRight className="h-3 w-3" />
            </motion.button>
          </div>
          <div className="flex gap-2 overflow-x-auto px-4 pb-1 scrollbar-none" style={{ scrollbarWidth: "none" }}>
            {data.hashtags.map((h) => (
              <HashtagChip key={h.tag} tag={h.tag} count={h.count} />
            ))}
          </div>
        </div>
      )}

      {/* ── Popular creators ──────────────────────────────────────────── */}
      {!loading && data?.creators && data.creators.length > 0 && (
        <div className="mb-4">
          <div className="flex items-center justify-between px-4 pb-2">
            <div className="flex items-center gap-1.5">
              <Users className="h-4 w-4" style={{ color: "#60a5fa" }} />
              <h2 className="text-[14px] font-bold text-white">Popular Creators</h2>
            </div>
          </div>
          <div className="flex gap-3 overflow-x-auto px-4 pb-2 scrollbar-none" style={{ scrollbarWidth: "none" }}>
            {data.creators.map((c) => (
              <CreatorCard key={c.id} creator={c} />
            ))}
          </div>
        </div>
      )}

      {/* ── Trending posts ────────────────────────────────────────────── */}
      <div className="px-4 pb-2">
        <div className="flex items-center justify-between">
          <h2 className="text-[14px] font-bold text-white">Trending Posts</h2>
          {!loading && (
            <motion.button
              whileTap={{ scale: 0.88 }}
              onClick={load}
              className="grid h-8 w-8 place-items-center rounded-full"
              style={{ background: "rgba(255,255,255,0.05)" }}
            >
              <RefreshCw className="h-3.5 w-3.5" style={{ color: "rgba(255,255,255,0.5)" }} />
            </motion.button>
          )}
        </div>
      </div>

      {loading && (
        <div>
          {[1, 2, 3].map((i) => <ShimmerCard key={i} />)}
        </div>
      )}

      {error && !loading && (
        <div className="flex flex-col items-center gap-3 py-12">
          <p className="text-[14px]" style={{ color: "rgba(255,255,255,0.4)" }}>
            Couldn't load explore feed
          </p>
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={load}
            className="rounded-full px-4 py-2 text-[13px] font-semibold text-white"
            style={{ background: "linear-gradient(135deg,#a855f7,#ec4899)" }}
          >
            Retry
          </motion.button>
        </div>
      )}

      {!loading && !error && posts.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-16">
          <TrendingUp className="h-12 w-12" style={{ color: "rgba(255,255,255,0.12)" }} />
          <p className="text-[14px]" style={{ color: "rgba(255,255,255,0.4)" }}>
            No trending posts yet
          </p>
        </div>
      )}

      {!loading && posts.map((post) => (
        <FeedCard
          key={post.id}
          post={post}
          onLike={handleLike}
          onSave={handleSave}
          onComment={handleComment}
          onGuestAction={(label) => gateAction(() => {}, label)}
        />
      ))}

      {/* bottom padding for nav */}
      <div className="h-24" />

      {GuestModalPortal}
    </div>
  );
}
