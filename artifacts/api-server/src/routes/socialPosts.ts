/**
 * routes/socialPosts.ts — Social post CRUD: create, feed, like, save, comment.
 *
 * Endpoints:
 *   GET  /api/posts              — public feed (newest first, paginated)
 *   GET  /api/posts/user/:uid    — posts by a specific user
 *   GET  /api/posts/:id          — single post with media, likes, comments
 *   POST /api/posts              — create post (auth required)
 *   DELETE /api/posts/:id        — delete post (owner only)
 *   POST /api/posts/:id/like     — toggle like
 *   POST /api/posts/:id/save     — toggle save
 *   GET  /api/posts/:id/comments — list comments
 *   POST /api/posts/:id/comments — add comment
 *   DELETE /api/posts/:id/comments/:cid — delete comment
 *   POST /api/posts/:id/view     — increment view count
 */
import { Router, type IRouter } from "express";
import { createClient } from "@supabase/supabase-js";
import { requireAuth, getAuthedUser } from "../lib/supabaseAuth.js";
import { logger } from "../lib/logger.js";

const SUPABASE_URL = process.env["VITE_SUPABASE_URL"] ?? process.env["SUPABASE_URL"] ?? "";
const SUPABASE_SERVICE_KEY = process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "";

function serviceDb() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

const router: IRouter = Router();

/* ── GET /api/posts — public feed ───────────────────────────────────────── */
router.get("/posts", async (req, res) => {
  try {
    const db = serviceDb();
    const limit = Math.min(Number(req.query["limit"] ?? 20), 50);
    const offset = Number(req.query["offset"] ?? 0);
    const userId = req.query["userId"] as string | undefined;

    let query = db
      .from("posts")
      .select(`
        *,
        author:users!posts_author_id_fkey(id, name, username, avatar_url, is_verified, is_owner),
        media:post_media(id, url, type, width, height, duration, position),
        like_count:likes(count),
        comment_count:comments(count),
        save_count:saves(count)
      `)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (userId) query = query.eq("author_id", userId);

    const { data, error } = await query;

    if (error) {
      logger.warn({ err: error.message }, "[posts] feed error");
      res.status(500).json({ error: error.message });
      return;
    }

    const posts = (data ?? []).map((p: any) => ({
      ...p,
      like_count:    p.like_count?.[0]?.count ?? 0,
      comment_count: p.comment_count?.[0]?.count ?? 0,
      save_count:    p.save_count?.[0]?.count ?? 0,
      media: (p.media ?? []).sort((a: any, b: any) => a.position - b.position),
    }));

    res.json({ posts });
  } catch (err) {
    logger.error({ err }, "[posts] feed error");
    res.status(500).json({ error: "Internal error" });
  }
});

/* ── GET /api/posts/user/:uid ─────────────────────────────────────────── */
router.get("/posts/user/:uid", async (req, res) => {
  try {
    const db = serviceDb();
    const { uid } = req.params;
    const limit = Math.min(Number(req.query["limit"] ?? 20), 50);
    const offset = Number(req.query["offset"] ?? 0);

    const { data, error } = await db
      .from("posts")
      .select(`
        *,
        author:users!posts_author_id_fkey(id, name, username, avatar_url, is_verified, is_owner),
        media:post_media(id, url, type, width, height, duration, position),
        like_count:likes(count),
        comment_count:comments(count)
      `)
      .eq("author_id", uid)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) { res.status(500).json({ error: error.message }); return; }

    const posts = (data ?? []).map((p: any) => ({
      ...p,
      like_count:    p.like_count?.[0]?.count ?? 0,
      comment_count: p.comment_count?.[0]?.count ?? 0,
      media: (p.media ?? []).sort((a: any, b: any) => a.position - b.position),
    }));

    res.json({ posts });
  } catch (err) {
    res.status(500).json({ error: "Internal error" });
  }
});

/* ── GET /api/posts/:id — single post ─────────────────────────────────── */
router.get("/posts/:id", async (req, res) => {
  try {
    const db = serviceDb();
    const { data, error } = await db
      .from("posts")
      .select(`
        *,
        author:users!posts_author_id_fkey(id, name, username, avatar_url, is_verified, is_owner),
        media:post_media(id, url, type, width, height, duration, position),
        like_count:likes(count),
        comment_count:comments(count)
      `)
      .eq("id", req.params["id"])
      .single();

    if (error) { res.status(404).json({ error: "Not found" }); return; }

    res.json({
      post: {
        ...data,
        like_count:    (data as any).like_count?.[0]?.count ?? 0,
        comment_count: (data as any).comment_count?.[0]?.count ?? 0,
        media: ((data as any).media ?? []).sort((a: any, b: any) => a.position - b.position),
      },
    });
  } catch (err) {
    res.status(500).json({ error: "Internal error" });
  }
});

/* ── POST /api/posts — create ─────────────────────────────────────────── */
router.post("/posts", requireAuth as any, async (req, res) => {
  try {
    const user = getAuthedUser(req as any);
    const db = serviceDb();
    const { caption, type = "photo", media = [] } = req.body ?? {};

    if (!media || media.length === 0) {
      res.status(400).json({ error: "At least one media item is required" });
      return;
    }

    const { data: post, error: postErr } = await db
      .from("posts")
      .insert({ author_id: user.id, caption: caption ?? null, type })
      .select()
      .single();

    if (postErr) { res.status(500).json({ error: postErr.message }); return; }

    if (media.length > 0) {
      const mediaRows = media.map((m: { url: string; type: string; width?: number; height?: number; duration?: number }, i: number) => ({
        post_id:  (post as any).id,
        url:      m.url,
        type:     m.type,
        width:    m.width ?? null,
        height:   m.height ?? null,
        duration: m.duration ?? null,
        position: i,
      }));
      const { error: mediaErr } = await db.from("post_media").insert(mediaRows);
      if (mediaErr) logger.warn({ err: mediaErr.message }, "[posts] media insert error");
    }

    logger.info({ postId: (post as any).id, userId: user.id }, "[posts] created");
    res.status(201).json({ post });
  } catch (err) {
    logger.error({ err }, "[posts] create error");
    res.status(500).json({ error: "Internal error" });
  }
});

/* ── DELETE /api/posts/:id ────────────────────────────────────────────── */
router.delete("/posts/:id", requireAuth as any, async (req, res) => {
  try {
    const user = getAuthedUser(req as any);
    const db = serviceDb();

    const { data: post } = await db.from("posts").select("author_id").eq("id", req.params["id"]).single();
    if (!post) { res.status(404).json({ error: "Not found" }); return; }
    if ((post as any).author_id !== user.id) { res.status(403).json({ error: "Forbidden" }); return; }

    await db.from("posts").delete().eq("id", req.params["id"]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Internal error" });
  }
});

/* ── POST /api/posts/:id/like — toggle ───────────────────────────────── */
router.post("/posts/:id/like", requireAuth as any, async (req, res) => {
  try {
    const user = getAuthedUser(req as any);
    const db = serviceDb();
    const postId = req.params["id"];

    const { data: existing } = await db.from("likes").select("post_id").eq("post_id", postId).eq("user_id", user.id).maybeSingle();

    if (existing) {
      await db.from("likes").delete().eq("post_id", postId).eq("user_id", user.id);
      res.json({ liked: false });
    } else {
      await db.from("likes").insert({ post_id: postId, user_id: user.id });
      res.json({ liked: true });
    }
  } catch (err) {
    res.status(500).json({ error: "Internal error" });
  }
});

/* ── POST /api/posts/:id/save — toggle ───────────────────────────────── */
router.post("/posts/:id/save", requireAuth as any, async (req, res) => {
  try {
    const user = getAuthedUser(req as any);
    const db = serviceDb();
    const postId = req.params["id"];

    const { data: existing } = await db.from("saves").select("post_id").eq("post_id", postId).eq("user_id", user.id).maybeSingle();

    if (existing) {
      await db.from("saves").delete().eq("post_id", postId).eq("user_id", user.id);
      res.json({ saved: false });
    } else {
      await db.from("saves").insert({ post_id: postId, user_id: user.id });
      res.json({ saved: true });
    }
  } catch (err) {
    res.status(500).json({ error: "Internal error" });
  }
});

/* ── GET /api/posts/:id/comments ─────────────────────────────────────── */
router.get("/posts/:id/comments", async (req, res) => {
  try {
    const db = serviceDb();
    const { data, error } = await db
      .from("comments")
      .select("*, author:users!comments_author_id_fkey(id, name, username, avatar_url)")
      .eq("post_id", req.params["id"])
      .order("created_at", { ascending: true });

    if (error) { res.status(500).json({ error: error.message }); return; }
    res.json({ comments: data ?? [] });
  } catch (err) {
    res.status(500).json({ error: "Internal error" });
  }
});

/* ── POST /api/posts/:id/comments ────────────────────────────────────── */
router.post("/posts/:id/comments", requireAuth as any, async (req, res) => {
  try {
    const user = getAuthedUser(req as any);
    const db = serviceDb();
    const { content } = req.body ?? {};

    if (!content?.trim()) { res.status(400).json({ error: "Content required" }); return; }

    const { data, error } = await db
      .from("comments")
      .insert({ post_id: req.params["id"], author_id: user.id, content: content.trim() })
      .select("*, author:users!comments_author_id_fkey(id, name, username, avatar_url)")
      .single();

    if (error) { res.status(500).json({ error: error.message }); return; }
    res.status(201).json({ comment: data });
  } catch (err) {
    res.status(500).json({ error: "Internal error" });
  }
});

/* ── DELETE /api/posts/:id/comments/:cid ─────────────────────────────── */
router.delete("/posts/:id/comments/:cid", requireAuth as any, async (req, res) => {
  try {
    const user = getAuthedUser(req as any);
    const db = serviceDb();

    const { data: comment } = await db.from("comments").select("author_id").eq("id", req.params["cid"]).single();
    if (!comment) { res.status(404).json({ error: "Not found" }); return; }
    if ((comment as any).author_id !== user.id) { res.status(403).json({ error: "Forbidden" }); return; }

    await db.from("comments").delete().eq("id", req.params["cid"]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Internal error" });
  }
});

/* ── POST /api/posts/:id/view ─────────────────────────────────────────── */
router.post("/posts/:id/view", async (req, res) => {
  try {
    const db = serviceDb();
    const postId = req.params["id"];
    const { error } = await db.rpc("increment_post_views", { post_id: postId });
    if (error) {
      await db.rpc("increment" as any, {}).catch(() => {});
    }
    res.json({ ok: true });
  } catch {
    res.json({ ok: true });
  }
});

export default router;
