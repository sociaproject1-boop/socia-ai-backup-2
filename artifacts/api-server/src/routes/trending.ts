/**
 * routes/trending.ts — Real Trending Engine
 *
 * GET /api/trending
 *   Returns posts ranked by a 7-signal composite score with time decay.
 *   Only posts that have cleared the minimum engagement threshold are
 *   included — meaning zero-engagement posts are never surfaced.
 *
 * Signals (all server-side, from real DB rows):
 *   1. Likes          — intent to endorse
 *   2. Comments       — high-effort engagement
 *   3. Shares         — virality / distribution signal
 *   4. Saves          — interest / return-value signal
 *   5. Views          — reach (discounted — passive signal)
 *   6. Avg retention  — video quality proxy (0-100 %, from posts.avg_retention_pct)
 *   7. Watch time     — depth-of-interest proxy   (from posts.total_watch_ms)
 *
 * Score formula (Hacker News gravity with engagement weights):
 *   raw  = likes×4 + comments×6 + shares×8 + saves×5
 *          + views×0.3 + retention×0.12 + watch_min×0.3
 *   age  = hours since created_at
 *   score = raw / (age + 2)^1.8
 *
 * Threshold: score must be >= SCORE_THRESHOLD (currently 0.3) — this
 * naturally excludes brand-new posts with 0 engagement and old posts
 * whose momentum has fully decayed.
 *
 * Cache: 3-minute in-memory cache keyed by viewer id (or "guest") so
 * repeated page loads don't hammer the DB while still feeling fresh.
 */

import { Router, type IRouter } from "express";
import { createClient } from "../lib/dbCompat.js";
import { logger } from "../lib/logger.js";
import { getAuthedUser } from "../lib/replitAuth.js";

const router: IRouter = Router();

// ── Constants ────────────────────────────────────────────────────────────────
const CANDIDATE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const CANDIDATE_LIMIT      = 300;   // pre-filter pool size
const RESULT_LIMIT         = 40;    // max returned posts
const SCORE_THRESHOLD      = 0.01;  // min score to appear in trending
const GRAVITY              = 1.8;   // time-decay exponent (HN = 1.8)
const CACHE_TTL_MS         = 3 * 60 * 1000; // 3 minutes

// ── Weights ──────────────────────────────────────────────────────────────────
const W_LIKE       = 4.0;
const W_COMMENT    = 6.0;
const W_SHARE      = 8.0;
const W_SAVE       = 5.0;
const W_VIEW       = 0.3;
const W_RETENTION  = 0.12;  // multiplied by avg_retention_pct (0-100)
const W_WATCH_MIN  = 0.3;   // multiplied by total watch-time in minutes

// ── In-memory cache ──────────────────────────────────────────────────────────
interface CacheEntry { ts: number; data: unknown }
const cache = new Map<string, CacheEntry>();

function cacheGet(key: string): unknown | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL_MS) { cache.delete(key); return null; }
  return entry.data;
}
function cacheSet(key: string, data: unknown) {
  cache.set(key, { ts: Date.now(), data });
}

// ── Supabase client factory ──────────────────────────────────────────────────
function db() {
  const url = process.env["VITE_SUPABASE_URL"] ?? process.env["SUPABASE_URL"] ?? "";
  const key = process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? process.env["SUPABASE_ANON_KEY"] ?? "";
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Read authenticated viewer ID without throwing. */
function tryGetViewer(req: any): string | null {
  try { return getAuthedUser(req).id; } catch { return null; }
}

// ── Trending score ───────────────────────────────────────────────────────────
function computeScore(p: {
  created_at: string;
  view_count: number;
  avg_retention_pct: number;
  total_watch_ms: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
}): number {
  const age_ms    = Date.now() - new Date(p.created_at).getTime();
  const age_hours = Math.max(0, age_ms / 3_600_000);

  const raw =
    p.likes    * W_LIKE       +
    p.comments * W_COMMENT    +
    p.shares   * W_SHARE      +
    p.saves    * W_SAVE       +
    p.view_count * W_VIEW     +
    (p.avg_retention_pct ?? 0) * W_RETENTION +
    ((p.total_watch_ms ?? 0) / 60_000) * W_WATCH_MIN;

  const decay = Math.pow(age_hours + 2, GRAVITY);
  return raw / decay;
}

// ── POST_SELECT ──────────────────────────────────────────────────────────────
// NOTE: share_count / total_watch_ms / avg_retention_pct are added by
// migration 60. If the migration hasn't run yet the columns don't exist —
// we read them defensively from the enrichment step instead.
const POST_SELECT = `
  id, author_id, caption, type,
  view_count, created_at, sound_id,
  author:users!posts_author_id_fkey(id, name, username, avatar_url, is_verified, is_owner, subscription_status),
  media:post_media(id, url, type, width, height, duration, position)
`;

// Extra columns added by migration 60. We try to include them in a
// separate select and merge — falls back to 0 if columns are absent.
const POST_SELECT_EXTRA = `
  id, share_count, total_watch_ms, avg_retention_pct
`;

// ── GET /api/trending ────────────────────────────────────────────────────────
router.get("/trending", async (req, res) => {
  try {
    const viewerId = tryGetViewer(req);
    const cacheKey = `trending:${viewerId ?? "guest"}`;
    const cached   = cacheGet(cacheKey);
    if (cached) return res.json(cached) as any;

    const svc   = db();
    const since = new Date(Date.now() - CANDIDATE_WINDOW_MS).toISOString();

    // 1. Pull candidate posts from the last 7 days
    const { data: rawPosts, error: postsErr } = await svc
      .from("posts")
      .select(POST_SELECT)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(CANDIDATE_LIMIT);

    if (postsErr) throw postsErr;
    if (!rawPosts || rawPosts.length === 0) {
      const empty = {
        posts: [],
        meta: { total_candidates: 0, qualified: 0, threshold: SCORE_THRESHOLD, window_days: 7 },
      };
      cacheSet(cacheKey, empty);
      return res.json(empty) as any;
    }

    const postIds = rawPosts.map((p: any) => p.id);

    // 2. Bulk-fetch engagement counts + viewer context + shares in parallel
    //    Shares are always queried live from the shares table (works pre-migration).
    //    Extra watch-time/retention columns are attempted opportunistically.
    const baseQueries: Promise<any>[] = [
      svc.from("likes").select("post_id").in("post_id", postIds),
      svc.from("comments").select("post_id").in("post_id", postIds),
      svc.from("saves").select("post_id").in("post_id", postIds),
      svc.from("shares").select("post_id").in("post_id", postIds),
      // Migration-60 extras — returns error rows if columns absent; handled below
      svc.from("posts").select(POST_SELECT_EXTRA).in("id", postIds),
    ];
    if (viewerId) {
      baseQueries.push(
        svc.from("likes").select("post_id").in("post_id", postIds).eq("user_id", viewerId),
        svc.from("saves").select("post_id").in("post_id", postIds).eq("user_id", viewerId),
      );
    }

    const [likesRes, commentsRes, savesRes, sharesRes, extrasRes, vLikesRes, vSavesRes] =
      await Promise.all(baseQueries);

    // Build count maps
    const likeMap     = new Map<string, number>();
    const commentMap  = new Map<string, number>();
    const saveMap     = new Map<string, number>();
    const shareMap    = new Map<string, number>();
    const retentionMap= new Map<string, number>();
    const watchMsMap  = new Map<string, number>();
    const likedSet    = new Set<string>();
    const savedSet    = new Set<string>();

    (likesRes.data    ?? []).forEach((r: any) => likeMap.set(r.post_id,    (likeMap.get(r.post_id)    ?? 0) + 1));
    (commentsRes.data ?? []).forEach((r: any) => commentMap.set(r.post_id, (commentMap.get(r.post_id) ?? 0) + 1));
    (savesRes.data    ?? []).forEach((r: any) => saveMap.set(r.post_id,    (saveMap.get(r.post_id)    ?? 0) + 1));
    (sharesRes.data   ?? []).forEach((r: any) => shareMap.set(r.post_id,   (shareMap.get(r.post_id)   ?? 0) + 1));

    // Migration-60 extras — only populated if columns exist
    if (!extrasRes.error && extrasRes.data) {
      (extrasRes.data as any[]).forEach((r) => {
        if (r.avg_retention_pct != null) retentionMap.set(r.id, r.avg_retention_pct);
        if (r.total_watch_ms    != null) watchMsMap.set(r.id,   r.total_watch_ms);
      });
    }

    if (viewerId) {
      (vLikesRes?.data ?? []).forEach((r: any) => likedSet.add(r.post_id));
      (vSavesRes?.data ?? []).forEach((r: any) => savedSet.add(r.post_id));
    }

    // 3. Sound metadata
    const soundIds = [...new Set(rawPosts.map((p: any) => p.sound_id).filter(Boolean))];
    const soundMap = new Map<string, any>();
    if (soundIds.length > 0) {
      const { data: soundData } = await svc
        .from("sounds")
        .select("id, title, cover_image, audio_url, usage_count, creator_id")
        .in("id", soundIds);
      (soundData ?? []).forEach((s: any) => soundMap.set(s.id, s));
    }

    // 4. Score, threshold-filter, sort, cap
    const scored = rawPosts
      .map((p: any) => {
        const likes    = likeMap.get(p.id)    ?? 0;
        const comments = commentMap.get(p.id) ?? 0;
        const saves    = saveMap.get(p.id)    ?? 0;
        const shares   = shareMap.get(p.id)   ?? 0;

        const score = computeScore({
          created_at:        p.created_at,
          view_count:        p.view_count ?? 0,
          avg_retention_pct: retentionMap.get(p.id) ?? 0,
          total_watch_ms:    watchMsMap.get(p.id)   ?? 0,
          likes,
          comments,
          shares,
          saves,
        });

        return {
          ...p,
          like_count:      likes,
          comment_count:   comments,
          save_count:      saves,
          share_count:     shares,
          has_liked:       likedSet.has(p.id),
          has_saved:       savedSet.has(p.id),
          sound:           p.sound_id ? (soundMap.get(p.sound_id) ?? null) : null,
          _trending_score: Math.round(score * 1000) / 1000,
        };
      })
      .filter((p: any) => p._trending_score >= SCORE_THRESHOLD)
      .sort((a: any, b: any) => b._trending_score - a._trending_score)
      .slice(0, RESULT_LIMIT);

    const result = {
      posts: scored,
      meta: {
        total_candidates: rawPosts.length,
        qualified:        scored.length,
        threshold:        SCORE_THRESHOLD,
        window_days:      7,
        cached_until:     new Date(Date.now() + CACHE_TTL_MS).toISOString(),
        signals_active:   retentionMap.size > 0 ? 7 : 5, // 5 until migration 60 runs
      },
    };

    cacheSet(cacheKey, result);
    logger.info({ qualified: scored.length, candidates: rawPosts.length }, "[trending] ranked");
    res.json(result);
  } catch (err: any) {
    logger.error({ err }, "[trending] failed");
    res.status(500).json({ error: "Failed to load trending feed" });
  }
});

export default router;
