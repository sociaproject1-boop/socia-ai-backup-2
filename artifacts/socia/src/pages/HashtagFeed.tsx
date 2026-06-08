/**
 * HashtagFeed.tsx — Public hashtag feed page.
 * Route: /hashtag/:tag
 */
import { useEffect, useState, useCallback } from "react";
import { useRoute, useLocation } from "wouter";
import { motion } from "framer-motion";
import { ArrowLeft, Hash, TrendingUp } from "lucide-react";
import { FeedCard } from "@/components/feed/FeedCard";
import { useGuestGate } from "@/lib/useGuestGate";
import { useAppStore } from "@/lib/store";
import type { SocialPost } from "@/lib/postsClient";

function fmtCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function ShimmerCard() {
  return (
    <div className="border-b px-4 py-4 space-y-3" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-full shimmer" />
        <div className="flex-1 space-y-1.5">
          <div className="h-3.5 w-28 rounded shimmer" />
          <div className="h-3 w-20 rounded shimmer" />
        </div>
      </div>
      <div className="h-56 w-full rounded-2xl shimmer" />
    </div>
  );
}

export default function HashtagFeed() {
  const [, params] = useRoute("/hashtag/:tag");
  const [, navigate] = useLocation();
  const tag = params?.tag ?? "";

  const isAuthenticated = useAppStore((s) => s.isAuthenticated);
  const { gateAction, GuestModalPortal } = useGuestGate();

  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [total, setTotal] = useState(0);

  const load = useCallback(async () => {
    if (!tag) return;
    setLoading(true);
    setError(false);
    try {
      const res = await fetch(`/api/explore/hashtag/${encodeURIComponent(tag)}?limit=50`);
      if (!res.ok) throw new Error("failed");
      const data = await res.json();
      setPosts(data.posts ?? []);
      setTotal(data.posts?.length ?? 0);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [tag]);

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

  return (
    <div className="h-full overflow-y-auto app-bg">
      {/* ── Header ────────────────────────────────────────────────────── */}
      <div
        className="sticky top-0 z-20 flex items-center gap-3 px-4 py-3"
        style={{
          background: "rgba(10,10,14,0.92)",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          backdropFilter: "blur(12px)",
        }}
      >
        <motion.button
          whileTap={{ scale: 0.88 }}
          onClick={() => navigate(-1 as any)}
          className="grid h-9 w-9 place-items-center rounded-full"
          style={{ background: "rgba(255,255,255,0.07)" }}
        >
          <ArrowLeft className="h-4 w-4 text-white" />
        </motion.button>
        <div className="flex items-center gap-2">
          <div
            className="grid h-9 w-9 place-items-center rounded-xl"
            style={{ background: "rgba(168,85,247,0.15)", border: "1px solid rgba(168,85,247,0.3)" }}
          >
            <Hash className="h-4 w-4" style={{ color: "var(--accent-primary)" }} />
          </div>
          <div>
            <h1 className="text-[15px] font-bold text-white">#{tag}</h1>
            {!loading && (
              <p className="text-[11px]" style={{ color: "rgba(255,255,255,0.4)" }}>
                {fmtCount(total)} posts
              </p>
            )}
          </div>
        </div>
        {!isAuthenticated && (
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={() => navigate("/auth?mode=signup")}
            className="ml-auto rounded-full px-3 py-1.5 text-[12px] font-bold text-white"
            style={{ background: "linear-gradient(135deg,#a855f7,#ec4899)" }}
          >
            Sign Up
          </motion.button>
        )}
      </div>

      {loading && (
        <div>
          {[1, 2, 3].map((i) => <ShimmerCard key={i} />)}
        </div>
      )}

      {error && !loading && (
        <div className="flex flex-col items-center gap-3 py-12">
          <p className="text-[14px]" style={{ color: "rgba(255,255,255,0.4)" }}>
            Couldn't load #{tag}
          </p>
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={load}
            className="rounded-full px-4 py-2 text-[13px] font-bold text-white"
            style={{ background: "linear-gradient(135deg,#a855f7,#ec4899)" }}
          >
            Retry
          </motion.button>
        </div>
      )}

      {!loading && !error && posts.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-16">
          <Hash className="h-12 w-12" style={{ color: "rgba(255,255,255,0.12)" }} />
          <p className="text-[15px] font-semibold text-white">#{tag}</p>
          <p className="text-[13px]" style={{ color: "rgba(255,255,255,0.4)" }}>
            No posts with this hashtag yet
          </p>
          {!isAuthenticated && (
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => navigate("/auth?mode=signup")}
              className="mt-2 rounded-full px-5 py-2.5 text-[13px] font-bold text-white"
              style={{ background: "linear-gradient(135deg,#a855f7,#ec4899)" }}
            >
              Be the first to post
            </motion.button>
          )}
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

      <div className="h-24" />
      {GuestModalPortal}
    </div>
  );
}
