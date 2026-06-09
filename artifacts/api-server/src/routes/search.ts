/**
 * routes/search.ts — Advanced search endpoint.
 *
 * GET /api/search?q=&type=users|posts|all&offset=&limit=
 *   → searches users (name/username/bio) and posts (caption)
 *   → when q is empty, returns trending posts + suggested users
 *
 * GET /api/search/trending
 *   → top hashtags extracted from post captions + top users
 */
import { Router, type IRouter } from "express";
import { createClient } from "../lib/dbCompat.js";
import { logger } from "../lib/logger.js";

function db() {
  const url = process.env["VITE_SUPABASE_URL"] ?? process.env["SUPABASE_URL"] ?? "";
  const key = process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? process.env["SUPABASE_ANON_KEY"] ?? "";
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

const router: IRouter = Router();

const POST_SELECT = `
  id, author_id, caption, type, view_count, created_at,
  author:users!posts_author_id_fkey(id, name, username, avatar_url, is_verified, is_owner),
  media:post_media(id, url, type, position)
`;

/** Sanitise a user-supplied search term — strip PostgREST-special chars. */
function sanitise(q: string): string {
  return q.replace(/[%_\\]/g, "\\$&").slice(0, 100);
}

/* ── GET /api/search/trending ───────────────────────────────────────────── */
router.get("/search/trending", async (_req, res) => {
  try {
    const [postsRes, usersRes] = await Promise.all([
      db()
        .from("posts")
        .select("caption")
        .not("caption", "is", null)
        .order("view_count", { ascending: false })
        .limit(60),
      db()
        .from("users")
        .select("id, name, username, avatar_url, is_verified, is_owner")
        .limit(8),
    ]);

    const hashtags: Map<string, number> = new Map();
    for (const p of postsRes.data ?? []) {
      const tags = ((p as any).caption ?? "").match(/#[\w\u00C0-\u017E]+/g) ?? [];
      for (const tag of tags) {
        const lower = (tag as string).toLowerCase();
        hashtags.set(lower, (hashtags.get(lower) ?? 0) + 1);
      }
    }

    const topTags = [...hashtags.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([tag, count]) => ({ tag, count }));

    res.json({ hashtags: topTags, suggestedUsers: usersRes.data ?? [] });
  } catch (err) {
    logger.error({ err }, "[search/trending]");
    res.status(500).json({ error: "search_error" });
  }
});

/* ── GET /api/search ────────────────────────────────────────────────────── */
router.get("/search", async (req, res) => {
  const raw    = ((req.query.q as string) ?? "").trim();
  const type   = (req.query.type as string) ?? "all";
  const offset = Math.max(0, parseInt(req.query.offset as string) || 0);
  const limit  = Math.min(parseInt(req.query.limit  as string) || 20, 40);

  /* ── Empty query → discovery mode ────────────────────────────────────── */
  if (!raw) {
    try {
      const [postsRes, usersRes] = await Promise.all([
        db()
          .from("posts")
          .select(POST_SELECT)
          .order("view_count", { ascending: false })
          .limit(12),
        db()
          .from("users")
          .select("id, name, username, avatar_url, bio, is_verified, is_owner")
          .limit(8),
      ]);
      return res.json({
        users:   usersRes.data ?? [],
        posts:   postsRes.data ?? [],
        hasMore: false,
        trending: true,
      });
    } catch (err) {
      logger.error({ err }, "[search] discovery");
      return res.status(500).json({ error: "search_error" });
    }
  }

  const q       = sanitise(raw);
  const pattern = `%${q}%`;

  try {
    const [postsRes, usersRes] = await Promise.all([
      (type === "posts" || type === "all")
        ? db()
            .from("posts")
            .select(POST_SELECT)
            .ilike("caption", pattern)
            .range(offset, offset + limit - 1)
            .order("created_at", { ascending: false })
        : Promise.resolve({ data: [] as any[], error: null }),

      (type === "users" || type === "all")
        ? db()
            .from("users")
            .select("id, name, username, avatar_url, bio, is_verified, is_owner")
            .or(`name.ilike.${pattern},username.ilike.${pattern},bio.ilike.${pattern}`)
            .range(offset, offset + limit - 1)
        : Promise.resolve({ data: [] as any[], error: null }),
    ]);

    const posts = (postsRes.data ?? []) as any[];
    const users = (usersRes.data ?? []) as any[];

    res.json({
      posts,
      users,
      hasMore: Math.max(posts.length, users.length) >= limit,
      trending: false,
    });
  } catch (err) {
    logger.error({ err }, "[search]");
    res.status(500).json({ error: "search_error" });
  }
});

export default router;
