/**
 * Trending.tsx — Real-time trending feed powered by the 7-signal ranking engine.
 *
 * Fetches GET /api/trending — posts scored by likes, comments, shares, saves,
 * views, watch-time, and retention rate with Hacker News-style time decay.
 * Only posts that cleared the minimum engagement threshold are shown.
 */
import { useEffect, useState, useCallback, useRef } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { TrendingUp, Flame, ArrowLeft, RefreshCw } from "lucide-react";
import { FeedCard } from "@/components/feed/FeedCard";
import { useGuestGate } from "@/lib/useGuestGate";
import { useNavHide } from "@/hooks/useNavHide";
import { useAppStore } from "@/lib/store";
import { supabase } from "@/lib/supabase";
import type { SocialPost } from "@/lib/postsClient";

interface TrendingMeta {
  total_candidates: number;
  qualified: number;
  threshold: number;
  window_days: number;
  cached_until: string;
}

interface TrendingResponse {
  posts: (SocialPost & { _trending_score?: number })[];
  meta: TrendingMeta;
}

async function fetchTrending(): Promise<TrendingResponse> {
  const { data: session } = await supabase.auth.getSession();
  const jwt = session.session?.access_token;
  const headers: Record<string, string> = {};
  if (jwt) headers["Authorization"] = `Bearer ${jwt}`;

  const res = await fetch("/api/trending", { headers });
  if (!res.ok) throw new Error("Failed to load trending");
  return res.json();
}

function ShimmerCard() {
  return (
    <div
      className="mx-3 my-2 overflow-hidden rounded-[18px] px-4 py-4 space-y-3"
      style={{ background: "rgba(14,14,14,1)", border: "1px solid rgba(255,255,255,0.07)" }}
    >
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

/** Small rank badge shown on each post card */
function RankBadge({ rank, score }: { rank: number; score?: number }) {
  const isTop3 = rank <= 3;
  return (
    <div className="flex items-center justify-between px-4 pt-3 pb-0">
      <div className="flex items-center gap-2">
        <span
          className="flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-black"
          style={{
            background: isTop3
              ? "linear-gradient(135deg,#f59e0b,#ef4444)"
              : "rgba(255,255,255,0.08)",
            color: isTop3 ? "#fff" : "rgba(255,255,255,0.5)",
          }}
        >
          {rank}
        </span>
        <div className="flex items-center gap-1">
          <Flame
            className="h-3 w-3"
            style={{ color: isTop3 ? "#f59e0b" : "rgba(255,255,255,0.25)" }}
          />
          <span className="text-[11px] font-semibold" style={{ color: "rgba(255,255,255,0.35)" }}>
            Trending
          </span>
        </div>
      </div>
      {score !== undefined && (
        <span className="text-[10px] font-mono" style={{ color: "rgba(255,255,255,0.2)" }}>
          {score.toFixed(2)}
        </span>
      )}
    </div>
  );
}

export default function Trending() {
  const [, navigate] = useLocation();
  const isAuthenticated = useAppStore((s) => s.isAuthenticated);
  const { gateAction, GuestModalPortal } = useGuestGate();

  const [posts, setPosts] = useState<(SocialPost & { _trending_score?: number })[]>([]);
  const [meta, setMeta] = useState<TrendingMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  useNavHide(containerRef);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const data = await fetchTrending();
      setPosts(data.posts);
      setMeta(data.meta);
      setLastRefresh(new Date());
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
        const { data: session } = await supabase.auth.getSession();
        const jwt = session.session?.access_token;
        await fetch(`/api/posts/${postId}/like`, {
          method: "POST",
          headers: jwt ? { Authorization: `Bearer ${jwt}` } : {},
        });
        setPosts((prev) =>
          prev.map((p) =>
            p.id === postId
              ? { ...p, has_liked: !p.has_liked, like_count: (p.like_count ?? 0) + (p.has_liked ? -1 : 1) }
              : p
          )
        );
      } catch { /* silent */ }
    }, "like posts");
  }, [gateAction]);

  const handleSave = useCallback((postId: string) => {
    gateAction(async () => {
      try {
        const { data: session } = await supabase.auth.getSession();
        const jwt = session.session?.access_token;
        await fetch(`/api/posts/${postId}/save`, {
          method: "POST",
          headers: jwt ? { Authorization: `Bearer ${jwt}` } : {},
        });
        setPosts((prev) =>
          prev.map((p) => p.id === postId ? { ...p, has_saved: !p.has_saved } : p)
        );
      } catch { /* silent */ }
    }, "save posts");
  }, [gateAction]);

  const handleComment = useCallback((postId: string) => {
    gateAction(() => navigate(`/post/${postId}`), "comment on posts");
  }, [gateAction, navigate]);

  return (
    <div ref={containerRef} className="h-full overflow-y-auto app-bg">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div
        className="sticky top-0 z-10 flex items-center justify-between px-4 py-3"
        style={{
          background: "rgba(0,0,0,0.85)",
          backdropFilter: "blur(12px)",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        <div className="flex items-center gap-3">
          <motion.button
            whileTap={{ scale: 0.88 }}
            onClick={() => navigate("/explore")}
            className="grid h-8 w-8 place-items-center rounded-full"
            style={{ background: "rgba(255,255,255,0.07)" }}
          >
            <ArrowLeft className="h-4 w-4 text-white" />
          </motion.button>
          <div className="flex items-center gap-2">
            <Flame className="h-4 w-4" style={{ color: "#f59e0b" }} />
            <h1 className="text-[16px] font-bold text-white">Trending Now</h1>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {meta && (
            <span
              className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
              style={{
                background: "rgba(245,158,11,0.12)",
                color: "#f59e0b",
                border: "1px solid rgba(245,158,11,0.2)",
              }}
            >
              {meta.qualified} posts
            </span>
          )}
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

      {/* ── Algorithm info strip ───────────────────────────────────────── */}
      {!loading && meta && (
        <div
          className="mx-3 mt-3 mb-1 rounded-2xl px-4 py-3"
          style={{ background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.12)" }}
        >
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="h-3.5 w-3.5" style={{ color: "#f59e0b" }} />
            <span className="text-[12px] font-bold" style={{ color: "#f59e0b" }}>
              7-Signal Ranking Engine
            </span>
          </div>
          <p className="text-[11px] leading-relaxed" style={{ color: "rgba(255,255,255,0.4)" }}>
            Ranked by likes · comments · shares · saves · views · watch time · retention
            {" "}with time decay.{" "}
            {meta.total_candidates} candidates from the last {meta.window_days} days →{" "}
            <span style={{ color: "rgba(255,255,255,0.6)" }}>{meta.qualified} truly trending.</span>
          </p>
          {lastRefresh && (
            <p className="text-[10px] mt-1" style={{ color: "rgba(255,255,255,0.2)" }}>
              Updated {lastRefresh.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              {" · "}cache refreshes every 3 min
            </p>
          )}
        </div>
      )}

      {/* ── Loading shimmer ────────────────────────────────────────────── */}
      {loading && (
        <div className="pt-2">
          {[1, 2, 3].map((i) => <ShimmerCard key={i} />)}
        </div>
      )}

      {/* ── Error state ───────────────────────────────────────────────── */}
      {error && !loading && (
        <div className="flex flex-col items-center gap-3 py-16">
          <Flame className="h-12 w-12" style={{ color: "rgba(255,255,255,0.1)" }} />
          <p className="text-[14px]" style={{ color: "rgba(255,255,255,0.4)" }}>
            Couldn't load trending posts
          </p>
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={load}
            className="rounded-full px-5 py-2.5 text-[13px] font-semibold text-white"
            style={{ background: "linear-gradient(135deg,#f59e0b,#ef4444)" }}
          >
            Retry
          </motion.button>
        </div>
      )}

      {/* ── Empty — nothing cleared the threshold ─────────────────────── */}
      {!loading && !error && posts.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-20">
          <div
            className="grid h-16 w-16 place-items-center rounded-3xl"
            style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.15)" }}
          >
            <Flame className="h-8 w-8" style={{ color: "rgba(245,158,11,0.4)" }} />
          </div>
          <p className="text-[15px] font-semibold" style={{ color: "rgba(255,255,255,0.6)" }}>
            Nothing trending yet
          </p>
          <p className="text-[13px] text-center px-8" style={{ color: "rgba(255,255,255,0.3)" }}>
            Posts need real engagement to rank.{"\n"}Check back after more activity builds up.
          </p>
        </div>
      )}

      {/* ── Ranked feed ───────────────────────────────────────────────── */}
      <AnimatePresence>
        {!loading && posts.map((post, idx) => (
          <motion.div
            key={post.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: Math.min(idx * 0.04, 0.4), duration: 0.3 }}
          >
            <RankBadge rank={idx + 1} score={post._trending_score} />
            <FeedCard
              post={post}
              onLike={handleLike}
              onSave={handleSave}
              onComment={handleComment}
              onGuestAction={(label) => gateAction(() => {}, label)}
            />
          </motion.div>
        ))}
      </AnimatePresence>

      <div className="h-24" />
      {GuestModalPortal}
    </div>
  );
}
