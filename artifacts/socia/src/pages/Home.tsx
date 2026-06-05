/**
 * Home.tsx — Real social feed with infinite scroll, real-time updates, and tabs.
 *
 * Layout (Phase 1 redesign):
 * 1. Sticky For You / Following tabs
 * 2. "New posts" banner (realtime)
 * 3. Feed posts appear IMMEDIATELY — content first
 * 4. Trending prompts strip (compact, above first post)
 * 5. Compact SupportSociaCard (after posts, not blocking feed)
 */
import { useEffect, useRef, useState, useCallback } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Flame, Sparkles, RefreshCw, ArrowUp, WifiOff, Radio } from "lucide-react";
import { FeedCard } from "@/components/feed/FeedCard";
import { SupportSociaCard } from "@/components/home/SupportSociaCard";
import { ImmersiveViewer } from "@/components/feed/ImmersiveViewer";
import { LiveNowSection } from "@/components/live/LiveNowSection";
import { useFeed, type FeedMode } from "@/lib/useFeed";
import { useAppStore } from "@/lib/store";
import { deletePost, type SocialPost } from "@/lib/postsClient";

const TRENDING_PROMPTS = [
  "Neon city at midnight",
  "Anime warrior queen",
  "Surreal dreamscape forest",
  "Glitchcore portrait",
  "Cinematic ocean sunset",
  "3D abstract orb",
];

/* ── Feed skeleton loader ────────────────────────────────────────────────── */
function FeedSkeleton() {
  return (
    <div className="space-y-0">
      {[1, 2, 3].map((i) => (
        <div key={i} className="border-b" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
          <div className="flex items-center gap-3 px-4 py-3">
            <div className="h-10 w-10 rounded-full shimmer flex-shrink-0" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3 w-24 rounded-full shimmer" />
              <div className="h-2.5 w-16 rounded-full shimmer" />
            </div>
          </div>
          <div className="shimmer" style={{ aspectRatio: "4/5" }} />
          <div className="flex items-center gap-4 px-4 py-3">
            <div className="h-8 w-16 rounded-full shimmer" />
            <div className="h-8 w-16 rounded-full shimmer" />
            <div className="h-8 w-8 rounded-full shimmer" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function Home() {
  const [, navigate]     = useLocation();
  const me               = useAppStore((s) => s.user);
  const setActivePrompt  = useAppStore((s) => s.setActivePrompt);

  const [feedTab, setFeedTab] = useState<FeedMode>("for-you");
  const [viewerIdx, setViewerIdx] = useState<number | null>(null);

  const {
    posts,
    loading,
    loadingMore,
    hasMore,
    error,
    newPostsAvailable,
    refresh,
    loadMore,
    handleLike,
    handleSave,
    removePost,
  } = useFeed({ mode: feedTab, viewerId: me?.id });

  /* ── Infinite scroll sentinel ────────────────────────────────────────── */
  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) loadMore(); },
      { rootMargin: "300px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [loadMore]);

  /* ── Delete post ─────────────────────────────────────────────────────── */
  const handleDelete = useCallback(async (postId: string) => {
    try {
      await deletePost(postId);
      removePost(postId);
    } catch (e) {
      console.error("Delete failed:", e);
    }
  }, [removePost]);

  /* ── Open immersive viewer ───────────────────────────────────────────── */
  const handleOpenViewer = useCallback((post: SocialPost) => {
    const idx = posts.findIndex((p) => p.id === post.id);
    setViewerIdx(idx >= 0 ? idx : 0);
  }, [posts]);

  /* ── Navigate to post detail / comment ──────────────────────────────── */
  const handleComment = useCallback((postId: string) => {
    navigate(`/post/${postId}`);
  }, [navigate]);

  const handlePromptTap = (p: string) => {
    setActivePrompt(p);
    navigate("/create/prompt-image");
  };

  return (
    <>
    <div className="app-bg pb-28 scroll-native h-full overflow-y-auto hide-scrollbar">

      {/* ── Sticky tab header ─────────────────────────────────────────── */}
      <div className="app-header sticky top-0 z-20 flex items-center gap-1 px-4 py-2">
        {(["for-you", "following"] as FeedMode[]).map((t) => (
          <motion.button
            key={t}
            whileTap={{ scale: 0.95 }}
            onClick={() => setFeedTab(t)}
            className="relative rounded-full px-4 py-1.5 text-[12px] font-semibold"
            style={{ color: feedTab === t ? "hsl(var(--foreground))" : "var(--s-text-muted)" }}
          >
            {feedTab === t && (
              <motion.span
                layoutId="feedTab"
                className="absolute inset-0 rounded-full app-surface"
                transition={{ type: "spring", stiffness: 480, damping: 34 }}
              />
            )}
            <span className="relative">{t === "for-you" ? "For You" : "Following"}</span>
          </motion.button>
        ))}

        <div className="flex-1" />

        {/* Go Live shortcut */}
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={() => navigate("/go-live")}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 5,
            background: "rgba(239,68,68,0.14)",
            border: "1px solid rgba(239,68,68,0.35)",
            borderRadius: 20,
            padding: "4px 10px 4px 8px",
            cursor: "pointer",
            marginRight: 4,
          }}
          aria-label="Go Live"
        >
          <Radio style={{ width: 11, height: 11, color: "#f87171" }} />
          <span style={{ fontSize: 11, fontWeight: 700, color: "#f87171", letterSpacing: "0.02em" }}>Live</span>
        </motion.button>

        <motion.button
          whileTap={{ scale: 0.85 }}
          onClick={refresh}
          className="grid h-8 w-8 place-items-center rounded-full app-surface"
        >
          <RefreshCw className="h-3.5 w-3.5 app-text-muted" />
        </motion.button>
      </div>

      {/* ── New posts banner ──────────────────────────────────────────── */}
      <AnimatePresence>
        {newPostsAvailable && (
          <motion.button
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            onClick={refresh}
            className="sticky top-12 z-10 mx-auto mt-2 flex items-center gap-2 rounded-full px-4 py-2 text-xs font-bold text-white shadow-lg"
            style={{ background: "linear-gradient(135deg,var(--accent-primary),var(--accent-secondary))", display: "flex", width: "fit-content", marginLeft: "auto", marginRight: "auto" }}
          >
            <ArrowUp className="h-3.5 w-3.5" />
            New posts
          </motion.button>
        )}
      </AnimatePresence>

      {/* ── Live Now section ──────────────────────────────────────────── */}
      <LiveNowSection />

      {/* ── Trending prompts (compact strip) ──────────────────────────── */}
      <div className="px-4 pt-3 pb-1">
        <div className="mb-2 flex items-center gap-1.5 px-0.5">
          <Flame style={{ width: 12, height: 12, color: "var(--accent-primary)" }} />
          <h3 className="text-[10px] font-semibold uppercase tracking-[0.09em] app-text-muted">Trending</h3>
          <div className="flex-1" />
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={() => navigate("/create")}
            className="flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-semibold text-white"
            style={{ background: "linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))" }}
          >
            <Sparkles style={{ width: 9, height: 9 }} /> Create
          </motion.button>
        </div>
        <div className="hide-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
          {TRENDING_PROMPTS.map((p, i) => (
            <motion.button
              key={p}
              whileTap={{ scale: 0.91 }}
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.018, type: "spring", stiffness: 380, damping: 28 }}
              onClick={() => handlePromptTap(p)}
              className="app-surface shrink-0 rounded-full px-3 py-1.5 text-xs app-text"
              style={{ whiteSpace: "nowrap" }}
            >
              {p}
            </motion.button>
          ))}
        </div>
      </div>

      {/* ── Feed content — posts appear immediately ───────────────────── */}
      {loading ? (
        <FeedSkeleton />
      ) : error ? (
        <div className="grid place-items-center py-20 text-center px-6">
          <div className="grid h-14 w-14 place-items-center rounded-full app-surface mb-4">
            <WifiOff className="h-6 w-6 app-text-muted" />
          </div>
          <p className="font-semibold app-text text-sm">Couldn't load feed</p>
          <p className="text-xs app-text-muted mt-1 mb-4">{error}</p>
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={refresh}
            className="rounded-full px-5 py-2 text-sm font-semibold text-white"
            style={{ background: "linear-gradient(135deg,var(--accent-primary),var(--accent-secondary))" }}
          >
            Try again
          </motion.button>
        </div>
      ) : posts.length === 0 ? (
        <div className="grid place-items-center py-20 text-center px-6">
          <div className="float grid h-16 w-16 place-items-center rounded-full app-surface mb-4">
            <Sparkles className="app-text-muted" style={{ width: 26, height: 26 }} />
          </div>
          <p className="font-display text-base font-semibold app-text">
            {feedTab === "following" ? "No posts from people you follow" : "No posts yet"}
          </p>
          <p className="mt-1 text-xs app-text-muted">
            {feedTab === "following"
              ? "Follow creators to see their work here."
              : "Be the first to create something beautiful."}
          </p>
          {feedTab === "following" && (
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => setFeedTab("for-you")}
              className="mt-4 rounded-full px-5 py-2 text-sm font-semibold text-white"
              style={{ background: "linear-gradient(135deg,var(--accent-primary),var(--accent-secondary))" }}
            >
              Browse For You
            </motion.button>
          )}
          {/* Show support card even when no posts */}
          <div className="mt-8 w-full">
            <SupportSociaCard />
          </div>
        </div>
      ) : (
        <>
          <div>
            {posts.map((post) => (
              <FeedCard
                key={post.id}
                post={post}
                onLike={handleLike}
                onSave={handleSave}
                onComment={handleComment}
                onDelete={handleDelete}
                onOpenViewer={handleOpenViewer}
              />
            ))}
          </div>

          {/* Infinite scroll sentinel */}
          <div ref={sentinelRef} className="h-1" />

          {/* Loading more indicator */}
          {loadingMore && (
            <div className="flex justify-center py-6">
              <div className="h-6 w-6 rounded-full border-2 border-white/20 border-t-white/60 animate-spin" />
            </div>
          )}

          {/* End of feed — show compact support card */}
          {!hasMore && !loadingMore && posts.length > 0 && (
            <div className="py-6">
              <p className="text-xs app-text-muted text-center mb-4">You're all caught up ✨</p>
              <SupportSociaCard />
            </div>
          )}
        </>
      )}
    </div>

    {/* ── Immersive fullscreen viewer overlay ───────────────────────── */}
    <AnimatePresence>
      {viewerIdx !== null && (
        <ImmersiveViewer
          posts={posts}
          startIndex={viewerIdx}
          onClose={() => setViewerIdx(null)}
          onLike={handleLike}
          onSave={handleSave}
          onComment={(postId) => { setViewerIdx(null); navigate(`/post/${postId}`); }}
        />
      )}
    </AnimatePresence>
    </>
  );
}
