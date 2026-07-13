/**
 * Home.tsx — X (Twitter)-style feed.
 *
 * Layout:
 *   TopBar  →  For You / Following tabs  →  Posts feed
 *
 * Removed: Stories, Trending, SupportSociaBanner, LiveNow, PulseBar.
 */
import { useEffect, useRef, useState, useCallback } from "react";
import { useNavHide } from "@/hooks/useNavHide";
import { createPortal } from "react-dom";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, ArrowUp, WifiOff, Feather } from "lucide-react";
import { FeedCard } from "@/components/feed/FeedCard";
import { PullToRefreshIndicator } from "@/components/feed/PullToRefreshIndicator";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { ImmersiveViewer } from "@/components/feed/ImmersiveViewer";
import { CommentsSheet } from "@/components/feed/CommentsSheet";
import { usePulseSocket } from "@/lib/usePulse";
import { useFeed, type FeedMode } from "@/lib/useFeed";
import { useAppStore } from "@/lib/store";
import { useDrawerStore } from "@/lib/drawerStore";
import { deletePost, type SocialPost } from "@/lib/postsClient";

/* ── Feed skeleton loader ────────────────────────────────────────────────── */
function FeedSkeleton() {
  return (
    <div className="space-y-0">
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          style={{ borderBottom: "1px solid #2F3336", padding: "12px 16px" }}
        >
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-full shimmer flex-shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-3 w-28 rounded-full shimmer" />
              <div className="h-3 w-full rounded-full shimmer" />
              <div className="h-3 w-4/5 rounded-full shimmer" />
              <div className="shimmer rounded-2xl" style={{ aspectRatio: "16/9" }} />
              <div className="flex gap-6">
                <div className="h-4 w-12 rounded-full shimmer" />
                <div className="h-4 w-12 rounded-full shimmer" />
                <div className="h-4 w-12 rounded-full shimmer" />
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── Floating compose button — X-style FAB, bottom-right above nav ───────── */
function ComposeFAB({ onClick }: { onClick: () => void }) {
  return (
    <motion.button
      whileTap={{ scale: 0.9 }}
      onClick={onClick}
      aria-label="Create post"
      style={{
        position: "fixed",
        right: 16,
        bottom: `calc(env(safe-area-inset-bottom, 0px) + 76px)`,
        width: 56,
        height: 56,
        borderRadius: "50%",
        display: "grid",
        placeItems: "center",
        background: "linear-gradient(135deg, var(--accent-primary, #a855f7), var(--accent-secondary, #3b82f6))",
        border: "none",
        boxShadow: "0 4px 14px rgba(0,0,0,0.4)",
        zIndex: 30,
        cursor: "pointer",
      }}
    >
      <Feather style={{ width: 22, height: 22, color: "#fff" }} strokeWidth={2} />
    </motion.button>
  );
}

export default function Home() {
  const [, navigate]    = useLocation();
  const me              = useAppStore((s) => s.user);
  const openDrawer      = useDrawerStore((s) => s.openDrawer);

  const [feedTab, setFeedTab]         = useState<FeedMode>("for-you");
  const [viewerIdx, setViewerIdx]     = useState<number | null>(null);
  const [commentPostId, setCommentPostId] = useState<string | null>(null);

  usePulseSocket();

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
    updateCommentCount,
    removePost,
  } = useFeed({ mode: feedTab, viewerId: me?.id });

  const commentPost = posts.find((p) => p.id === commentPostId) ?? null;

  /* ── Infinite scroll ─────────────────────────────────────────────────── */
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

  /* ── TopBar refresh event ─────────────────────────────────────────────── */
  useEffect(() => {
    const handler = () => refresh();
    window.addEventListener("socia:refresh-feed", handler);
    return () => window.removeEventListener("socia:refresh-feed", handler);
  }, [refresh]);

  /* ── Delete post ─────────────────────────────────────────────────────── */
  const handleDelete = useCallback(async (postId: string) => {
    try { await deletePost(postId); removePost(postId); }
    catch (e) { console.error("Delete failed:", e); }
  }, [removePost]);

  /* ── Open immersive viewer ───────────────────────────────────────────── */
  const handleOpenViewer = useCallback((post: SocialPost) => {
    const idx = posts.findIndex((p) => p.id === post.id);
    setViewerIdx(idx >= 0 ? idx : 0);
  }, [posts]);

  const feedRef   = useRef<HTMLDivElement>(null);
  const navHidden = useAppStore((s) => s.navHidden);
  useNavHide(feedRef);

  const { phase: ptrPhase, indicatorRef } = usePullToRefresh(feedRef, refresh);

  const slideTransition = "transform 0.3s cubic-bezier(0.25,0.46,0.45,0.94)";

  return (
    <>
      <PullToRefreshIndicator phase={ptrPhase} indicatorRef={indicatorRef} />
      <div
        ref={feedRef}
        className="app-bg h-full overflow-y-auto hide-scrollbar"
        style={{ overscrollBehaviorY: "contain", paddingBottom: 80 }}
      >
        {/* ── Simplified Home Header ───────────────────────────────────────
             Row 1: Avatar only (opens menu drawer). Center/right empty.
             Row 2: For You | Following — the primary navigation tabs. */}
        <div
          className="sticky top-0 z-20"
          style={{
            display: "grid",
            gridTemplateRows: navHidden ? "0fr" : "1fr",
            transition: slideTransition,
            background: "rgba(0,0,0,0.85)",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
          }}
        >
          <div style={{ overflow: "hidden" }}>
            <div
              style={{
                transform: navHidden ? "translateY(-100%)" : "translateY(0)",
                transition: slideTransition,
                willChange: "transform",
              }}
            >
              {/* ── Row 1: Avatar (opens drawer) ─────────────────────── */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  paddingTop: `calc(env(safe-area-inset-top, 0px) + 6px)`,
                  paddingLeft: 14,
                  paddingBottom: 8,
                }}
              >
                {me ? (
                  <motion.button
                    whileTap={{ scale: 0.88 }}
                    onClick={openDrawer}
                    aria-label="Open navigation menu"
                    style={{
                      width: 34, height: 34,
                      borderRadius: "50%",
                      overflow: "hidden",
                      border: "1.5px solid rgba(255,255,255,0.18)",
                      background: "#1D9BF0",
                      flexShrink: 0,
                      cursor: "pointer",
                      padding: 0,
                      display: "grid",
                      placeItems: "center",
                    }}
                  >
                    {me.avatar ? (
                      <img
                        src={me.avatar}
                        alt={me.name}
                        style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                      />
                    ) : (
                      <span style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>
                        {(me.name ?? "?").charAt(0).toUpperCase()}
                      </span>
                    )}
                  </motion.button>
                ) : (
                  <div style={{ width: 34 }} />
                )}
              </div>

              {/* ── Row 2: For You | Following ────────────────────────── */}
              <div
                style={{
                  display: "flex",
                  alignItems: "stretch",
                  borderBottom: "1px solid #2F3336",
                }}
              >
                {/* For You tab */}
                <button
                  onClick={() => setFeedTab("for-you")}
                  style={{
                    flex: 1,
                    position: "relative",
                    paddingTop: 10,
                    paddingBottom: 14,
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    WebkitTapHighlightColor: "transparent",
                  }}
                >
                  <span
                    style={{
                      fontSize: 15,
                      fontWeight: feedTab === "for-you" ? 700 : 500,
                      color: feedTab === "for-you" ? "#E7E9EA" : "#71767B",
                      letterSpacing: "-0.01em",
                      transition: "color 0.15s ease",
                    }}
                  >
                    For you
                  </span>
                  {feedTab === "for-you" && (
                    <motion.div
                      layoutId="xTabIndicator"
                      style={{
                        position: "absolute",
                        bottom: 0,
                        left: "50%",
                        transform: "translateX(-50%)",
                        width: 52,
                        height: 4,
                        borderRadius: 9999,
                        background: "#1D9BF0",
                      }}
                      transition={{ type: "spring", stiffness: 520, damping: 38 }}
                    />
                  )}
                </button>

                {/* Following tab */}
                <button
                  onClick={() => setFeedTab("following")}
                  style={{
                    flex: 1,
                    position: "relative",
                    paddingTop: 10,
                    paddingBottom: 14,
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    WebkitTapHighlightColor: "transparent",
                  }}
                >
                  <span
                    style={{
                      fontSize: 15,
                      fontWeight: feedTab === "following" ? 700 : 500,
                      color: feedTab === "following" ? "#E7E9EA" : "#71767B",
                      letterSpacing: "-0.01em",
                      transition: "color 0.15s ease",
                    }}
                  >
                    Following
                  </span>
                  {feedTab === "following" && (
                    <motion.div
                      layoutId="xTabIndicator"
                      style={{
                        position: "absolute",
                        bottom: 0,
                        left: "50%",
                        transform: "translateX(-50%)",
                        width: 64,
                        height: 4,
                        borderRadius: 9999,
                        background: "#1D9BF0",
                      }}
                      transition={{ type: "spring", stiffness: 520, damping: 38 }}
                    />
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ── New posts banner ──────────────────────────────────────────── */}
        <AnimatePresence>
          {newPostsAvailable && (
            <motion.button
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              onClick={refresh}
              style={{
                position:    "sticky",
                top:         48,
                zIndex:      10,
                display:     "flex",
                alignItems:  "center",
                gap:         6,
                margin:      "8px auto",
                padding:     "8px 16px",
                borderRadius: 9999,
                background:  "#1D9BF0",
                border:      "none",
                cursor:      "pointer",
                fontSize:    13,
                fontWeight:  700,
                color:       "#fff",
              }}
            >
              <ArrowUp style={{ width: 14, height: 14 }} />
              New posts
            </motion.button>
          )}
        </AnimatePresence>

        {/* ── Feed content — posts immediately below tabs ───────────────── */}
        {loading ? (
          <FeedSkeleton />
        ) : error ? (
          <div style={{ display: "grid", placeItems: "center", padding: "80px 24px", textAlign: "center" }}>
            <div style={{
              display: "grid", placeItems: "center",
              width: 56, height: 56, borderRadius: "50%",
              background: "rgba(255,255,255,0.05)",
              marginBottom: 16,
            }}>
              <WifiOff style={{ width: 24, height: 24, color: "#71767B" }} />
            </div>
            <p style={{ fontSize: 14, fontWeight: 600, color: "#E7E9EA", margin: "0 0 4px" }}>
              Couldn't load feed
            </p>
            <p style={{ fontSize: 13, color: "#71767B", margin: "0 0 16px" }}>{error}</p>
            <button
              onClick={refresh}
              style={{
                padding: "8px 20px", borderRadius: 9999,
                background: "#1D9BF0", border: "none",
                fontSize: 14, fontWeight: 700, color: "#fff", cursor: "pointer",
              }}
            >
              Try again
            </button>
          </div>
        ) : posts.length === 0 ? (
          <div style={{ display: "grid", placeItems: "center", padding: "80px 24px", textAlign: "center" }}>
            <Sparkles style={{ width: 32, height: 32, color: "#71767B", marginBottom: 16 }} />
            <p style={{ fontSize: 20, fontWeight: 800, color: "#E7E9EA", margin: "0 0 8px" }}>
              {feedTab === "following" ? "Nothing to see here — yet" : "No posts yet"}
            </p>
            <p style={{ fontSize: 14, color: "#71767B", margin: "0 0 20px", maxWidth: 280 }}>
              {feedTab === "following"
                ? "Follow some accounts to see their posts here."
                : "Be the first to create something beautiful."}
            </p>
            {feedTab === "following" && (
              <button
                onClick={() => setFeedTab("for-you")}
                style={{
                  padding: "8px 20px", borderRadius: 9999,
                  background: "#1D9BF0", border: "none",
                  fontSize: 14, fontWeight: 700, color: "#fff", cursor: "pointer",
                }}
              >
                Browse For you
              </button>
            )}
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
                  onDelete={handleDelete}
                  onOpenViewer={handleOpenViewer}
                  onComment={(postId) => setCommentPostId(postId)}
                  onCommentCountChange={updateCommentCount}
                />
              ))}
            </div>

            <div ref={sentinelRef} style={{ height: 1 }} />

            {loadingMore && (
              <div style={{ display: "flex", justifyContent: "center", padding: "24px 0" }}>
                <div style={{
                  width: 24, height: 24, borderRadius: "50%",
                  border: "2px solid rgba(255,255,255,0.15)",
                  borderTopColor: "#1D9BF0",
                  animation: "spin 0.8s linear infinite",
                }} />
              </div>
            )}

            {!hasMore && !loadingMore && posts.length > 0 && (
              <p style={{ padding: "24px 0", fontSize: 13, color: "#71767B", textAlign: "center" }}>
                You're all caught up ✨
              </p>
            )}
          </>
        )}
      </div>

      {/* ── Floating compose button (matches reference FAB placement) ──── */}
      {me && <ComposeFAB onClick={() => navigate("/upload")} />}

      {/* ── Immersive fullscreen viewer ─────────────────────────────────── */}
      {createPortal(
        <AnimatePresence>
          {viewerIdx !== null && (
            <ImmersiveViewer
              posts={posts}
              startIndex={viewerIdx}
              onClose={() => setViewerIdx(null)}
              onLike={handleLike}
              onSave={handleSave}
              onComment={(postId) => setCommentPostId(postId)}
              onCommentCountChange={updateCommentCount}
            />
          )}
        </AnimatePresence>,
        document.body,
      )}

      {/* ── Comments bottom sheet ─────────────────────────────────────── */}
      {commentPostId && (
        <CommentsSheet
          postId={commentPostId}
          initialCount={commentPost?.comment_count ?? 0}
          onClose={() => setCommentPostId(null)}
          onCountChange={(delta) => updateCommentCount(commentPostId, delta)}
        />
      )}
    </>
  );
}
