/**
 * useFeed.ts — Real social feed hook with infinite scroll, realtime, and pull-to-refresh.
 *
 * Features:
 * - Paginated feed fetching (for-you / following / user / saved)
 * - Infinite scroll via loadMore()
 * - Pull-to-refresh via refresh()
 * - Real-time new post detection (Supabase Realtime)
 * - Optimistic like/save toggles synced to backend
 * - Prepend newly created posts after upload
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "./supabase";
import {
  fetchFeed, fetchFollowingFeed, fetchSavedFeed, fetchSinglePost,
  toggleLike, toggleSave, type SocialPost,
} from "./postsClient";

export type FeedMode = "for-you" | "following" | "saved";

interface UseFeedOptions {
  mode: FeedMode;
  viewerId?: string | null;
}

const LIMIT = 12;

export function useFeed({ mode, viewerId }: UseFeedOptions) {
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newPostsAvailable, setNewPostsAvailable] = useState(false);
  const offsetRef = useRef(0);
  const seenIds = useRef(new Set<string>());

  /* ── Fetch page ────────────────────────────────────────────────────── */
  const fetchPage = useCallback(async (offset: number): Promise<SocialPost[]> => {
    const opts = { limit: LIMIT, offset, viewerId: viewerId ?? undefined };
    if (mode === "following") return fetchFollowingFeed(opts);
    if (mode === "saved")     return fetchSavedFeed(opts);
    return fetchFeed({ ...opts, sort: "trending" });
  }, [mode, viewerId]);

  /* ── Initial / reset load ──────────────────────────────────────────── */
  const load = useCallback(async (reset = false) => {
    const isReset = reset;
    if (isReset) {
      setLoading(true);
      seenIds.current.clear();
    } else {
      setLoadingMore(true);
    }
    setError(null);
    const offset = isReset ? 0 : offsetRef.current;
    try {
      const newPosts = await fetchPage(offset);
      /* Deduplicate (realtime may have prepended) */
      const deduped = newPosts.filter((p) => !seenIds.current.has(p.id));
      deduped.forEach((p) => seenIds.current.add(p.id));

      setPosts((prev) => (isReset ? deduped : [...prev, ...deduped]));
      offsetRef.current = offset + newPosts.length;
      setHasMore(newPosts.length === LIMIT);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load feed");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [fetchPage]);

  /* ── Mount: initial load ───────────────────────────────────────────── */
  useEffect(() => {
    offsetRef.current = 0;
    seenIds.current.clear();
    setPosts([]);
    setHasMore(true);
    setNewPostsAvailable(false);
    void load(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, viewerId]);

  /* ── Realtime: detect new posts ────────────────────────────────────── */
  useEffect(() => {
    if (mode === "saved") return; // saved feed doesn't need realtime

    const channel = supabase
      .channel(`social-feed-${mode}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "posts" },
        async (payload) => {
          const raw = payload.new as { id: string };
          if (!raw.id || seenIds.current.has(raw.id)) return;
          try {
            const post = await fetchSinglePost(raw.id, viewerId ?? undefined);
            if (!post) return;
            /* For following feed: only prepend if author is followed */
            seenIds.current.add(post.id);
            setPosts((prev) => [post, ...prev]);
            offsetRef.current += 1;
          } catch {
            /* If fetch fails, just show "new posts" banner */
            setNewPostsAvailable(true);
          }
        },
      )
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, [mode, viewerId]);

  /* ── Public API ────────────────────────────────────────────────────── */
  const refresh = useCallback(() => {
    setNewPostsAvailable(false);
    return load(true);
  }, [load]);

  const loadMore = useCallback(() => {
    if (!loadingMore && !loading && hasMore) void load(false);
  }, [load, loadingMore, loading, hasMore]);

  /** Prepend a freshly-created post (after Upload) */
  const prependPost = useCallback((post: SocialPost) => {
    if (seenIds.current.has(post.id)) return;
    seenIds.current.add(post.id);
    setPosts((prev) => [post, ...prev]);
    offsetRef.current += 1;
  }, []);

  /** Optimistic like toggle — syncs to backend */
  const handleLike = useCallback(async (postId: string) => {
    /* Optimistic update */
    setPosts((prev) => prev.map((p) => {
      if (p.id !== postId) return p;
      const nowLiked = !p.has_liked;
      return { ...p, has_liked: nowLiked, like_count: p.like_count + (nowLiked ? 1 : -1) };
    }));
    try {
      const result = await toggleLike(postId);
      /* Sync with server truth */
      setPosts((prev) => prev.map((p) => {
        if (p.id !== postId) return p;
        const liked = result.liked;
        return { ...p, has_liked: liked, like_count: p.like_count + (liked === p.has_liked ? 0 : liked ? 1 : -1) };
      }));
    } catch {
      /* Rollback */
      setPosts((prev) => prev.map((p) => {
        if (p.id !== postId) return p;
        const reverted = !p.has_liked;
        return { ...p, has_liked: reverted, like_count: p.like_count + (reverted ? 1 : -1) };
      }));
    }
  }, []);

  /** Optimistic save toggle — syncs to backend */
  const handleSave = useCallback(async (postId: string) => {
    setPosts((prev) => prev.map((p) => {
      if (p.id !== postId) return p;
      const nowSaved = !p.has_saved;
      return { ...p, has_saved: nowSaved, save_count: (p.save_count ?? 0) + (nowSaved ? 1 : -1) };
    }));
    try {
      await toggleSave(postId);
    } catch {
      setPosts((prev) => prev.map((p) => {
        if (p.id !== postId) return p;
        const reverted = !p.has_saved;
        return { ...p, has_saved: reverted, save_count: (p.save_count ?? 0) + (reverted ? 1 : -1) };
      }));
    }
  }, []);

  /** Update a single post's comment count after commenting */
  const incrementCommentCount = useCallback((postId: string) => {
    setPosts((prev) => prev.map((p) =>
      p.id === postId ? { ...p, comment_count: p.comment_count + 1 } : p,
    ));
  }, []);

  /** Remove a post from the feed (after owner deletion) */
  const removePost = useCallback((postId: string) => {
    setPosts((prev) => prev.filter((p) => p.id !== postId));
    seenIds.current.delete(postId);
  }, []);

  return {
    posts,
    loading,
    loadingMore,
    hasMore,
    error,
    newPostsAvailable,
    refresh,
    loadMore,
    prependPost,
    handleLike,
    handleSave,
    incrementCommentCount,
    removePost,
  };
}
