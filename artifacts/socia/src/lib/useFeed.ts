/**
 * useFeed.ts — Real social feed hook with infinite scroll, realtime, and pull-to-refresh.
 *
 * Features:
 * - Paginated feed fetching (for-you / following / user / saved)
 * - Infinite scroll via loadMore()
 * - Pull-to-refresh via refresh()
 * - Real-time new post detection (Supabase Realtime)
 * - Realtime like/comment/save count sync across ALL clients (no polling)
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

  /* Track which post IDs are currently in the feed for targeted realtime updates */
  const postIdsRef = useRef<Set<string>>(new Set());
  // Own optimistic changes are echoed by Supabase Realtime. Ignore that
  // single echo so the displayed count cannot jump by +2/-2.
  const pendingLikeEvents = useRef(new Map<string, "insert" | "delete">());

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

      setPosts((prev) => {
        const next = isReset ? deduped : [...prev, ...deduped];
        postIdsRef.current = new Set(next.map((p) => p.id));
        return next;
      });
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
    postIdsRef.current.clear();
    setPosts([]);
    setHasMore(true);
    setNewPostsAvailable(false);
    void load(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, viewerId]);

  /* ── Realtime: detect new posts ────────────────────────────────────── */
  useEffect(() => {
    if (mode === "saved") return;

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
            seenIds.current.add(post.id);
            setPosts((prev) => {
              const next = [post, ...prev];
              postIdsRef.current = new Set(next.map((p) => p.id));
              return next;
            });
            offsetRef.current += 1;
          } catch {
            setNewPostsAvailable(true);
          }
        },
      )
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, [mode, viewerId]);

  /* ── Realtime: cross-client LIKES ──────────────────────────────────── */
  useEffect(() => {
    if (mode === "saved") return;

    const channel = supabase
      .channel(`feed-likes-${mode}-${viewerId ?? "anon"}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "likes" },
        (payload) => {
          const { post_id, user_id } = payload.new as { post_id: string; user_id: string };
          if (!postIdsRef.current.has(post_id)) return;
          const ownPending = user_id === viewerId && pendingLikeEvents.current.get(post_id) === "insert";
          if (ownPending) {
            pendingLikeEvents.current.delete(post_id);
            return;
          }
          setPosts((prev) => prev.map((p) => {
            if (p.id !== post_id) return p;
            const isViewer = user_id === viewerId;
            return {
              ...p,
              like_count: p.like_count + 1,
              has_liked: isViewer ? true : p.has_liked,
            };
          }));
        },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "likes" },
        (payload) => {
          const { post_id, user_id } = payload.old as { post_id: string; user_id: string };
          if (!postIdsRef.current.has(post_id)) return;
          const ownPending = user_id === viewerId && pendingLikeEvents.current.get(post_id) === "delete";
          if (ownPending) {
            pendingLikeEvents.current.delete(post_id);
            return;
          }
          setPosts((prev) => prev.map((p) => {
            if (p.id !== post_id) return p;
            const isViewer = user_id === viewerId;
            return {
              ...p,
              like_count: Math.max(0, p.like_count - 1),
              has_liked: isViewer ? false : p.has_liked,
            };
          }));
        },
      )
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, [mode, viewerId]);

  /* ── Realtime: cross-client SAVES ──────────────────────────────────── */
  useEffect(() => {
    if (mode === "saved") return;

    const channel = supabase
      .channel(`feed-saves-${mode}-${viewerId ?? "anon"}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "saves" },
        (payload) => {
          const { post_id, user_id } = payload.new as { post_id: string; user_id: string };
          if (!postIdsRef.current.has(post_id)) return;
          setPosts((prev) => prev.map((p) => {
            if (p.id !== post_id) return p;
            const isViewer = user_id === viewerId;
            return {
              ...p,
              save_count: (p.save_count ?? 0) + 1,
              has_saved: isViewer ? true : p.has_saved,
            };
          }));
        },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "saves" },
        (payload) => {
          const { post_id, user_id } = payload.old as { post_id: string; user_id: string };
          if (!postIdsRef.current.has(post_id)) return;
          setPosts((prev) => prev.map((p) => {
            if (p.id !== post_id) return p;
            const isViewer = user_id === viewerId;
            return {
              ...p,
              save_count: Math.max(0, (p.save_count ?? 0) - 1),
              has_saved: isViewer ? false : p.has_saved,
            };
          }));
        },
      )
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, [mode, viewerId]);

  /* ── Realtime: cross-client COMMENT COUNTS ─────────────────────────── */
  useEffect(() => {
    if (mode === "saved") return;

    const channel = supabase
      .channel(`feed-comments-${mode}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "comments" },
        (payload) => {
          const { post_id } = payload.new as { post_id: string; parent_comment_id?: string | null };
          if (!postIdsRef.current.has(post_id)) return;
          /* Count all comments including replies */
          setPosts((prev) => prev.map((p) =>
            p.id === post_id ? { ...p, comment_count: p.comment_count + 1 } : p,
          ));
        },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "comments" },
        (payload) => {
          const { post_id } = payload.old as { post_id: string };
          if (!postIdsRef.current.has(post_id)) return;
          setPosts((prev) => prev.map((p) =>
            p.id === post_id ? { ...p, comment_count: Math.max(0, p.comment_count - 1) } : p,
          ));
        },
      )
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, [mode]);

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
    setPosts((prev) => {
      const next = [post, ...prev];
      postIdsRef.current = new Set(next.map((p) => p.id));
      return next;
    });
    offsetRef.current += 1;
  }, []);

  /** Optimistic like toggle — syncs to backend; realtime will echo back */
  const handleLike = useCallback(async (postId: string) => {
    let previousLiked = false;
    let optimisticLiked = false;
    setPosts((prev) => prev.map((p) => {
      if (p.id !== postId) return p;
      previousLiked = !!p.has_liked;
      optimisticLiked = !previousLiked;
      return { ...p, has_liked: optimisticLiked, like_count: Math.max(0, p.like_count + (optimisticLiked ? 1 : -1)) };
    }));
    if (viewerId) pendingLikeEvents.current.set(postId, optimisticLiked ? "insert" : "delete");
    try {
      const result = await toggleLike(postId);
      if (viewerId && pendingLikeEvents.current.get(postId) === (result.liked ? "insert" : "delete")) {
        // If Realtime has not echoed yet, leave the pending marker briefly;
        // the event handler will consume it.
        window.setTimeout(() => pendingLikeEvents.current.delete(postId), 1500);
      }
      setPosts((prev) => prev.map((p) => p.id === postId ? { ...p, has_liked: result.liked } : p));
    } catch {
      pendingLikeEvents.current.delete(postId);
      setPosts((prev) => prev.map((p) => {
        if (p.id !== postId) return p;
        const current = !!p.has_liked;
        const delta = current === previousLiked ? 0 : (previousLiked ? 1 : -1);
        return { ...p, has_liked: previousLiked, like_count: Math.max(0, p.like_count + delta) };
      }));
    }
  }, []);

  /** Optimistic save toggle — syncs to backend; realtime will echo back */
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

  /** Update a single post's comment count (used by CommentsSheet) */
  const updateCommentCount = useCallback((postId: string, delta: number) => {
    setPosts((prev) => prev.map((p) =>
      p.id === postId ? { ...p, comment_count: Math.max(0, p.comment_count + delta) } : p,
    ));
  }, []);

  /** Remove a post from the feed (after owner deletion) */
  const removePost = useCallback((postId: string) => {
    setPosts((prev) => {
      const next = prev.filter((p) => p.id !== postId);
      postIdsRef.current = new Set(next.map((p) => p.id));
      return next;
    });
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
    updateCommentCount,
    removePost,
  };
}
