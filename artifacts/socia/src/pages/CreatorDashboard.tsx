/**
 * CreatorDashboard.tsx — Phase 18: Creator Tools.
 * Post analytics, engagement tracking, audience insights,
 * top content, and growth metrics for creators.
 */
import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import {
  ArrowLeft, TrendingUp, Heart, MessageCircle, Eye,
  Sparkles, BarChart2, Grid3x3, Users, Share2,
  ChevronRight, RefreshCw,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAppStore } from "@/lib/store";

const API = import.meta.env.BASE_URL.replace(/\/$/, "");

interface PostStat {
  id: string;
  caption: string | null;
  type: string;
  view_count: number;
  like_count: number;
  comment_count: number;
  save_count: number;
  created_at: string;
  media_url: string | null;
  thumbnail_url: string | null;
}

interface Analytics {
  totalViews: number;
  totalLikes: number;
  totalComments: number;
  totalPosts: number;
  totalFollowers: number;
  engagementRate: number;
  topPosts: PostStat[];
  recentPosts: PostStat[];
  monthlyViews: { month: string; views: number }[];
}

function StatCard({
  icon, label, value, sub, color,
}: { icon: React.ReactNode; label: string; value: string | number; sub?: string; color: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex-1 rounded-2xl p-4"
      style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}
    >
      <div className="flex items-center gap-2 mb-2">
        <div className="h-8 w-8 rounded-xl flex items-center justify-center" style={{ background: color + "22" }}>
          <div style={{ color }}>{icon}</div>
        </div>
        <span className="text-[11px] text-white/40 font-medium">{label}</span>
      </div>
      <div className="text-[22px] font-bold text-white">{value}</div>
      {sub && <div className="text-[11px] text-white/30 mt-0.5">{sub}</div>}
    </motion.div>
  );
}

function MiniBarChart({ data }: { data: { label: string; value: number }[] }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="flex items-end gap-1 h-20">
      {data.map((d, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-1">
          <motion.div
            initial={{ scaleY: 0 }}
            animate={{ scaleY: 1 }}
            transition={{ delay: i * 0.05, duration: 0.4, ease: "easeOut" }}
            className="w-full rounded-t-sm origin-bottom"
            style={{
              height: `${Math.max(4, (d.value / max) * 64)}px`,
              background: `linear-gradient(to top, #a855f7, #ec4899)`,
              opacity: d.value === max ? 1 : 0.5,
            }}
          />
          <span className="text-[8px] text-white/30 truncate w-full text-center">{d.label}</span>
        </div>
      ))}
    </div>
  );
}

function PostRow({ post, rank }: { post: PostStat; rank: number }) {
  const [, navigate] = useLocation();
  const engagement = post.view_count > 0
    ? (((post.like_count + post.comment_count) / post.view_count) * 100).toFixed(1)
    : "0";

  return (
    <motion.button
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: rank * 0.04 }}
      onClick={() => navigate(`/post/${post.id}`)}
      className="flex items-center gap-3 w-full py-3 border-b border-white/5 last:border-0 text-left active:bg-white/3 transition-colors"
    >
      <span className="text-[12px] font-bold text-white/25 w-5 shrink-0 text-center">#{rank + 1}</span>

      <div
        className="h-11 w-11 rounded-xl shrink-0 bg-white/6 overflow-hidden"
        style={{ background: "rgba(255,255,255,0.06)" }}
      >
        {post.media_url && (
          <img src={post.media_url} alt="" className="h-full w-full object-cover" loading="lazy" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="text-[13px] text-white font-medium truncate">
          {post.caption ? post.caption.slice(0, 50) : `${post.type} post`}
        </div>
        <div className="flex items-center gap-3 mt-0.5">
          <span className="flex items-center gap-1 text-[10.5px] text-white/35">
            <Eye className="h-3 w-3" />
            {post.view_count >= 1000 ? `${(post.view_count / 1000).toFixed(1)}k` : post.view_count}
          </span>
          <span className="flex items-center gap-1 text-[10.5px] text-white/35">
            <Heart className="h-3 w-3" />
            {post.like_count}
          </span>
          <span className="text-[10.5px] text-purple-400/70">{engagement}% eng.</span>
        </div>
      </div>

      <ChevronRight className="h-4 w-4 text-white/20 shrink-0" />
    </motion.button>
  );
}

export default function CreatorDashboard() {
  const [, navigate]   = useLocation();
  const myId           = useAppStore((s) => s.user?.id ?? null);
  const [analytics,  setAnalytics]  = useState<Analytics | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [activeView, setActiveView] = useState<"overview" | "posts" | "audience">("overview");

  const load = useCallback(async () => {
    if (!myId) return;
    setLoading(true);
    try {
      /* Fetch user's posts with stats */
      const { data: posts, error: postErr } = await supabase
        .from("posts")
        .select(`
          id, caption, type, view_count, like_count, comment_count,
          created_at,
          media:post_media(url, position)
        `)
        .eq("author_id", myId)
        .order("created_at", { ascending: false })
        .limit(100);

      if (postErr) throw postErr;

      /* Fetch follower count */
      const { count: followerCount } = await supabase
        .from("follows")
        .select("*", { count: "exact", head: true })
        .eq("following_id", myId);

      const postList = (posts ?? []) as any[];

      /* Flatten media url for thumbnail */
      const enriched: PostStat[] = postList.map((p: any) => {
        const sorted = (p.media ?? []).sort((a: any, b: any) => a.position - b.position);
        return {
          id:            p.id,
          caption:       p.caption,
          type:          p.type,
          view_count:    p.view_count ?? 0,
          like_count:    p.like_count ?? 0,
          comment_count: p.comment_count ?? 0,
          save_count:    p.save_count ?? 0,
          created_at:    p.created_at,
          media_url:     sorted[0]?.url ?? null,
          thumbnail_url: sorted[0]?.url ?? null,
        };
      });

      const totalViews    = enriched.reduce((s, p) => s + p.view_count,    0);
      const totalLikes    = enriched.reduce((s, p) => s + p.like_count,    0);
      const totalComments = enriched.reduce((s, p) => s + p.comment_count, 0);
      const engagementRate = totalViews > 0
        ? ((totalLikes + totalComments) / totalViews) * 100
        : 0;

      /* Top 5 posts by view count */
      const topPosts = [...enriched].sort((a, b) => b.view_count - a.view_count).slice(0, 5);

      /* Recent 10 posts */
      const recentPosts = enriched.slice(0, 10);

      /* Monthly views (last 6 months) */
      const monthMap = new Map<string, number>();
      const now = new Date();
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        monthMap.set(
          d.toLocaleString("en-US", { month: "short" }),
          0,
        );
      }
      enriched.forEach((p) => {
        const d   = new Date(p.created_at);
        const key = d.toLocaleString("en-US", { month: "short" });
        if (monthMap.has(key)) {
          monthMap.set(key, (monthMap.get(key) ?? 0) + p.view_count);
        }
      });
      const monthlyViews = [...monthMap.entries()].map(([month, views]) => ({ month, views }));

      setAnalytics({
        totalViews,
        totalLikes,
        totalComments,
        totalPosts:   enriched.length,
        totalFollowers: followerCount ?? 0,
        engagementRate,
        topPosts,
        recentPosts,
        monthlyViews,
      });
    } catch (e) {
      console.error("[CreatorDashboard] load:", e);
    } finally {
      setLoading(false);
    }
  }, [myId]);

  useEffect(() => { load(); }, [load]);

  function fmt(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}k`;
    return String(n);
  }

  const TABS = [
    { id: "overview" as const, label: "Overview", icon: <BarChart2 className="h-3.5 w-3.5" /> },
    { id: "posts"    as const, label: "Posts",    icon: <Grid3x3   className="h-3.5 w-3.5" /> },
    { id: "audience" as const, label: "Audience", icon: <Users     className="h-3.5 w-3.5" /> },
  ];

  return (
    <div className="flex flex-col h-full app-bg">

      {/* Header */}
      <div
        className="flex items-center gap-3 px-4 pt-4 pb-3 shrink-0"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
      >
        <button onClick={() => navigate("/profile")} className="p-1">
          <ArrowLeft className="h-5 w-5 text-white/70" />
        </button>
        <div className="flex-1">
          <h1 className="text-[17px] font-bold text-white">Creator Studio</h1>
          <p className="text-[11px] text-white/35">Analytics &amp; insights</p>
        </div>
        <button onClick={load} disabled={loading} className="p-2">
          <RefreshCw className={"h-4 w-4 text-white/40 " + (loading ? "animate-spin" : "")} />
        </button>
      </div>

      {/* Tabs */}
      <div
        className="flex shrink-0"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
      >
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveView(tab.id)}
            className="flex-1 flex items-center justify-center gap-1.5 py-3 text-[12.5px] font-semibold relative transition-colors"
            style={{ color: activeView === tab.id ? "#a855f7" : "rgba(255,255,255,0.35)" }}
          >
            {tab.icon}
            {tab.label}
            {activeView === tab.id && (
              <motion.div
                layoutId="dashTabLine"
                className="absolute bottom-0 left-1/4 right-1/4 h-0.5 rounded-full"
                style={{ background: "#a855f7" }}
              />
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto pb-24" style={{ scrollbarWidth: "none" }}>

        {loading ? (
          <div className="flex flex-col gap-3 p-4 animate-pulse">
            <div className="flex gap-3">
              <div className="flex-1 h-24 rounded-2xl bg-white/5" />
              <div className="flex-1 h-24 rounded-2xl bg-white/5" />
            </div>
            <div className="h-32 rounded-2xl bg-white/5" />
            <div className="h-48 rounded-2xl bg-white/5" />
          </div>
        ) : !analytics ? (
          <div className="flex flex-col items-center justify-center py-20 px-8 text-center">
            <Sparkles className="h-12 w-12 text-white/10 mb-4" />
            <p className="text-[14px] text-white/30">Start creating to see your analytics</p>
          </div>
        ) : (

          /* ═══ OVERVIEW ═══════════════════════════════════════════════ */
          activeView === "overview" ? (
            <div className="p-4 space-y-4">

              {/* Primary stats row */}
              <div className="flex gap-3">
                <StatCard
                  icon={<Eye className="h-4 w-4" />}
                  label="Total Views"
                  value={fmt(analytics.totalViews)}
                  color="#a855f7"
                />
                <StatCard
                  icon={<Heart className="h-4 w-4" />}
                  label="Total Likes"
                  value={fmt(analytics.totalLikes)}
                  color="#ec4899"
                />
              </div>

              <div className="flex gap-3">
                <StatCard
                  icon={<MessageCircle className="h-4 w-4" />}
                  label="Comments"
                  value={fmt(analytics.totalComments)}
                  color="#60a5fa"
                />
                <StatCard
                  icon={<Users className="h-4 w-4" />}
                  label="Followers"
                  value={fmt(analytics.totalFollowers)}
                  color="#34d399"
                />
              </div>

              {/* Engagement rate */}
              <div
                className="rounded-2xl p-4"
                style={{ background: "linear-gradient(135deg, rgba(168,85,247,0.12), rgba(236,72,153,0.08))", border: "1px solid rgba(168,85,247,0.2)" }}
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-purple-400" />
                    <span className="text-[13px] font-semibold text-white">Engagement Rate</span>
                  </div>
                  <span
                    className="text-[18px] font-bold"
                    style={{ color: analytics.engagementRate >= 5 ? "#34d399" : analytics.engagementRate >= 2 ? "#fbbf24" : "#f87171" }}
                  >
                    {analytics.engagementRate.toFixed(2)}%
                  </span>
                </div>
                <div className="text-[11px] text-white/35">
                  {analytics.engagementRate >= 5
                    ? "Excellent! Your content resonates strongly."
                    : analytics.engagementRate >= 2
                      ? "Good engagement — keep creating consistently."
                      : "Growing — try shorter captions and trending hashtags."}
                </div>

                {/* Engagement bar */}
                <div className="mt-3 h-1.5 rounded-full bg-white/8 overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min(analytics.engagementRate * 10, 100)}%` }}
                    transition={{ duration: 0.8, ease: "easeOut" }}
                    className="h-full rounded-full"
                    style={{ background: "linear-gradient(90deg, #a855f7, #ec4899)" }}
                  />
                </div>
              </div>

              {/* Monthly views chart */}
              <div
                className="rounded-2xl p-4"
                style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}
              >
                <div className="flex items-center gap-2 mb-4">
                  <BarChart2 className="h-4 w-4 text-purple-400" />
                  <span className="text-[13px] font-semibold text-white">Monthly Views</span>
                </div>
                <MiniBarChart
                  data={analytics.monthlyViews.map((m) => ({ label: m.month, value: m.views }))}
                />
              </div>

              {/* Top posts preview */}
              <div
                className="rounded-2xl p-4"
                style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[13px] font-semibold text-white">Top Posts</span>
                  <button onClick={() => setActiveView("posts")} className="text-[11.5px] text-purple-400">
                    See all
                  </button>
                </div>
                {analytics.topPosts.length === 0
                  ? <p className="text-[12px] text-white/25 text-center py-4">No posts yet</p>
                  : analytics.topPosts.map((p, i) => <PostRow key={p.id} post={p} rank={i} />)}
              </div>
            </div>
          ) :

          /* ═══ POSTS ══════════════════════════════════════════════════ */
          activeView === "posts" ? (
            <div className="p-4">
              <div className="flex items-center gap-2 mb-4">
                <Grid3x3 className="h-4 w-4 text-purple-400" />
                <span className="text-[14px] font-semibold text-white">All Posts</span>
                <span className="text-[11px] text-white/30">({analytics.totalPosts})</span>
              </div>

              {analytics.recentPosts.length === 0 ? (
                <div className="text-center py-12">
                  <Grid3x3 className="h-10 w-10 text-white/10 mx-auto mb-3" />
                  <p className="text-[13px] text-white/30">No posts yet — start creating!</p>
                  <button
                    onClick={() => navigate("/create")}
                    className="mt-4 rounded-full px-5 py-2.5 text-[13px] font-semibold text-white"
                    style={{ background: "linear-gradient(135deg,#a855f7,#ec4899)" }}
                  >
                    Create your first post
                  </button>
                </div>
              ) : (
                <div
                  className="rounded-2xl overflow-hidden"
                  style={{ border: "1px solid rgba(255,255,255,0.07)" }}
                >
                  {analytics.recentPosts.map((p, i) => <PostRow key={p.id} post={p} rank={i} />)}
                </div>
              )}
            </div>
          ) :

          /* ═══ AUDIENCE ═══════════════════════════════════════════════ */
          (
            <div className="p-4 space-y-4">
              <div
                className="rounded-2xl p-5 text-center"
                style={{ background: "linear-gradient(135deg, rgba(168,85,247,0.1), rgba(236,72,153,0.06))", border: "1px solid rgba(168,85,247,0.2)" }}
              >
                <Users className="h-10 w-10 text-purple-400 mx-auto mb-3" />
                <div className="text-[32px] font-black text-white">{fmt(analytics.totalFollowers)}</div>
                <div className="text-[13px] text-white/45 mt-1">Total Followers</div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div
                  className="rounded-2xl p-4 text-center"
                  style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}
                >
                  <div className="text-[22px] font-bold text-white">{analytics.totalPosts}</div>
                  <div className="text-[11px] text-white/35 mt-0.5">Posts</div>
                </div>
                <div
                  className="rounded-2xl p-4 text-center"
                  style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}
                >
                  <div className="text-[22px] font-bold text-white">
                    {analytics.totalPosts > 0 ? fmt(Math.round(analytics.totalViews / analytics.totalPosts)) : "0"}
                  </div>
                  <div className="text-[11px] text-white/35 mt-0.5">Avg Views/Post</div>
                </div>
              </div>

              <div
                className="rounded-2xl p-4"
                style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}
              >
                <h3 className="text-[13px] font-semibold text-white mb-3">Engagement Breakdown</h3>
                {[
                  { label: "Likes",     value: analytics.totalLikes,    color: "#ec4899", icon: <Heart className="h-3.5 w-3.5" /> },
                  { label: "Comments",  value: analytics.totalComments, color: "#60a5fa", icon: <MessageCircle className="h-3.5 w-3.5" /> },
                ].map(({ label, value, color, icon }) => {
                  const total = analytics.totalLikes + analytics.totalComments || 1;
                  const pct = (value / total) * 100;
                  return (
                    <div key={label} className="mb-3 last:mb-0">
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-1.5 text-[12px] text-white/60" style={{ color }}>
                          {icon}{label}
                        </div>
                        <span className="text-[12px] font-semibold text-white">{fmt(value)}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-white/8 overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${pct}%` }}
                          transition={{ duration: 0.6, delay: 0.1 }}
                          className="h-full rounded-full"
                          style={{ background: color }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              <div
                className="rounded-2xl p-4"
                style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}
              >
                <h3 className="text-[13px] font-semibold text-white mb-2">Grow your audience</h3>
                {[
                  "Post consistently — aim for 3–5 times per week",
                  "Use trending hashtags in your captions",
                  "Reply to every comment in the first hour",
                  "Share posts to drive discovery",
                ].map((tip, i) => (
                  <div key={i} className="flex items-start gap-2.5 py-2 border-b border-white/5 last:border-0">
                    <Sparkles className="h-3.5 w-3.5 text-purple-400 mt-0.5 shrink-0" />
                    <span className="text-[12px] text-white/55">{tip}</span>
                  </div>
                ))}
              </div>
            </div>
          )
        )}
      </div>
    </div>
  );
}
