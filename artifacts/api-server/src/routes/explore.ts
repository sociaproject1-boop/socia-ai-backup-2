/**
 * routes/explore.ts — Public Explore API (no auth required).
 *
 * GET /api/explore            — trending posts + popular creators + trending hashtags
 * GET /api/explore/hashtag/:tag — posts matching a hashtag (case-insensitive)
 */
import { Router, type IRouter } from "express";
import { createClient } from "../lib/dbCompat.js";
import { logger } from "../lib/logger.js";
import { getAuthedUser } from "../lib/replitAuth.js";

/** Read authenticated viewer ID without throwing (returns null for guests). */
function tryGetViewer(req: any): string | null {
  try { return getAuthedUser(req).id; } catch { return null; }
}

const router: IRouter = Router();

function db() {
  const url = process.env["VITE_SUPABASE_URL"] ?? process.env["SUPABASE_URL"] ?? "";
  const key = process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? process.env["SUPABASE_ANON_KEY"] ?? "";
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

const POST_SELECT = `
  id, author_id, caption, type, view_count, created_at, sound_id,
  author:users!posts_author_id_fkey(id, name, username, avatar_url, is_verified, is_owner, subscription_status),
  media:post_media(id, url, type, width, height, duration, position)
`;

/** Extract hashtags from a list of captions */
function extractHashtags(captions: string[]): Map<string, number> {
  const tagMap = new Map<string, number>();
  for (const cap of captions) {
    const tags = cap.match(/#[\w\u0080-\uffff]+/g) ?? [];
    for (const tag of tags) {
      const lower = tag.toLowerCase();
      tagMap.set(lower, (tagMap.get(lower) ?? 0) + 1);
    }
  }
  return tagMap;
}

/** Score a post for trending rank (view_count is the reliable server-side signal) */
function trendingScore(p: any, likeCount: number, commentCount: number): number {
  const age_hours = (Date.now() - new Date(p.created_at).getTime()) / 3_600_000;
  const decay = Math.max(0.1, 1 / (1 + age_hours / 48));
  return (likeCount * 3 + commentCount * 5 + (p.view_count ?? 0) * 0.1) * decay;
}

/* ── GET /api/explore ───────────────────────────────────────────────────── */
router.get("/explore", async (req, res) => {
  try {
    const viewerId = tryGetViewer(req);
    const svc = db();

    const [trendingPostsRes, creatorsRes, hashtagPostsRes] = await Promise.all([
      /* Trending posts: take recent 200 and score them */
      svc
        .from("posts")
        .select(POST_SELECT)
        .order("created_at", { ascending: false })
        .limit(200),

      /* Popular creators: most followed + verified */
      svc
        .from("users")
        .select("id, name, username, avatar_url, is_verified, followers, subscription_status")
        .order("followers", { ascending: false })
        .limit(12),

      /* Hashtag source: recent 500 captions for tag extraction */
      svc
        .from("posts")
        .select("caption")
        .order("created_at", { ascending: false })
        .limit(500),
    ]);

    const rawPosts = trendingPostsRes.data ?? [];

    /* Enrich with real like/comment counts + viewer like/save status */
    let likeMap = new Map<string, number>();
    let commentMap = new Map<string, number>();
    let likedSet = new Set<string>();
    let savedSet = new Set<string>();
    if (rawPosts.length > 0) {
      const postIds = rawPosts.map((p: any) => p.id);
      const parallelQueries: Promise<any>[] = [
        svc.from("likes").select("post_id").in("post_id", postIds),
        svc.from("comments").select("post_id").in("post_id", postIds),
      ];
      if (viewerId) {
        parallelQueries.push(
          svc.from("likes").select("post_id").in("post_id", postIds).eq("user_id", viewerId),
          svc.from("saves").select("post_id").in("post_id", postIds).eq("user_id", viewerId),
        );
      }
      const [likesRes, commentsRes, vLikesRes, vSavesRes] = await Promise.all(parallelQueries);
      (likesRes.data ?? []).forEach((r: any) => likeMap.set(r.post_id, (likeMap.get(r.post_id) ?? 0) + 1));
      (commentsRes.data ?? []).forEach((r: any) => commentMap.set(r.post_id, (commentMap.get(r.post_id) ?? 0) + 1));
      if (viewerId) {
        (vLikesRes?.data ?? []).forEach((r: any) => likedSet.add(r.post_id));
        (vSavesRes?.data ?? []).forEach((r: any) => savedSet.add(r.post_id));
      }
    }

    /* Fetch sound metadata for posts that have a sound_id */
    const soundIds = [...new Set(rawPosts.map((p: any) => p.sound_id).filter(Boolean))];
    const soundMap = new Map<string, any>();
    if (soundIds.length > 0) {
      const { data: soundData } = await svc
        .from("sounds")
        .select("id, title, cover_image, audio_url, usage_count, creator_id")
        .in("id", soundIds);
      (soundData ?? []).forEach((s: any) => soundMap.set(s.id, s));
    }

    /* Rank posts by trending score */
    const rankedPosts = rawPosts
      .map((p: any) => ({
        ...p,
        like_count:    likeMap.get(p.id) ?? 0,
        comment_count: commentMap.get(p.id) ?? 0,
        has_liked:     likedSet.has(p.id),
        has_saved:     savedSet.has(p.id),
        sound:         p.sound_id ? (soundMap.get(p.sound_id) ?? null) : null,
      }))
      .sort((a: any, b: any) => trendingScore(b, likeMap.get(b.id) ?? 0, commentMap.get(b.id) ?? 0) - trendingScore(a, likeMap.get(a.id) ?? 0, commentMap.get(a.id) ?? 0))
      .slice(0, 40);

    /* Extract trending hashtags */
    const captions = (hashtagPostsRes.data ?? []).map((r: any) => r.caption ?? "");
    const tagMap = extractHashtags(captions);
    const trendingHashtags = [...tagMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([tag, count]) => ({ tag, count }));

    res.json({
      posts: rankedPosts,
      creators: creatorsRes.data ?? [],
      hashtags: trendingHashtags,
    });
  } catch (err: any) {
    logger.error({ err }, "[explore] failed");
    res.status(500).json({ error: "Failed to load explore feed" });
  }
});

/* ── GET /api/explore/hashtag/:tag ─────────────────────────────────────── */
router.get("/explore/hashtag/:tag", async (req, res) => {
  try {
    const tag = (req.params["tag"] ?? "").replace(/^#/, "").trim().slice(0, 80);
    if (!tag) return res.status(400).json({ error: "tag required" }) as any;

    const offset = parseInt(String(req.query["offset"] ?? "0"), 10);
    const limit  = Math.min(parseInt(String(req.query["limit"] ?? "30"), 10), 50);

    const { data, error } = await db()
      .from("posts")
      .select(POST_SELECT)
      .ilike("caption", `%#${tag}%`)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    res.json({ posts: data ?? [], tag, offset, limit });
  } catch (err: any) {
    logger.error({ err }, "[explore/hashtag] failed");
    res.status(500).json({ error: "Failed to load hashtag feed" });
  }
});

export default router;
