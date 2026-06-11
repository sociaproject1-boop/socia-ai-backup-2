/**
 * routes/socialPosts.ts — Complete social feed system.
 *
 * Sections:
 *   §1  Feed endpoints: for-you, following, saved, user, single post
 *   §2  Post CRUD: create, delete (owner can delete any)
 *   §3  Like / save toggles with notification triggers
 *   §4  Comment CRUD: list, add, edit, delete, replies
 *   §5  Reports: post + comment
 *   §6  View counter
 *   §7  Notifications: list, mark read, unread count
 *   §8  Owner moderation: review reports, delete any post/comment
 *
 * All feed responses include `has_liked` and `has_saved` when an authenticated
 * viewer is present (optional auth via tryGetViewer).
 */
import { Router, type IRouter } from "express";
import { createClient } from "../lib/dbCompat.js";
import { requireAuth, getAuthedUser } from "../lib/replitAuth.js";
import { logger } from "../lib/logger.js";

const OWNER_EMAIL = (process.env["OWNER_EMAIL"] ?? "allanalbacen5@gmail.com").toLowerCase();

function db() {
  const url = process.env["VITE_SUPABASE_URL"] ?? process.env["SUPABASE_URL"] ?? "";
  const key = process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? process.env["SUPABASE_ANON_KEY"] ?? "";
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

const router: IRouter = Router();

/* ── Helpers ────────────────────────────────────────────────────────────── */

/** Read authenticated user ID without failing (returns null if no session). */
function tryGetViewer(req: any): string | null {
  try { return getAuthedUser(req).id; } catch { return null; }
}

function isOwnerUser(req: any): boolean {
  try { return (getAuthedUser(req).email ?? "").toLowerCase() === OWNER_EMAIL; } catch { return false; }
}

const BASE_POST_SELECT = `
  id, author_id, caption, type, view_count, created_at, updated_at,
  sound_id,
  author:users!posts_author_id_fkey(id, name, username, avatar_url, is_verified, is_owner, subscription_status),
  media:post_media(id, url, type, width, height, duration, position)
`;

/** Enrich posts with real aggregate counts + viewer like/save status + sound metadata. */
async function enrichPosts(posts: any[], viewerId: string | null) {
  if (!posts.length) return [];

  const svc = db();
  const postIds = posts.map((p: any) => p.id);

  /* Collect distinct sound IDs from this batch */
  const soundIds = [...new Set(posts.map((p: any) => p.sound_id).filter(Boolean))];

  /* Real aggregate counts (more accurate than cached, used for display) */
  const [likesRes, commentsRes, savesRes, soundsRes] = await Promise.all([
    svc.from("likes").select("post_id").in("post_id", postIds),
    svc.from("comments").select("post_id").in("post_id", postIds),
    svc.from("saves").select("post_id").in("post_id", postIds),
    soundIds.length > 0
      ? svc.from("sounds").select("id, title, cover_image, audio_url, usage_count, creator_id").in("id", soundIds)
      : Promise.resolve({ data: [] as any[] }),
  ]);

  /* Build sound lookup map */
  const soundMap = new Map<string, any>();
  (soundsRes.data ?? []).forEach((s: any) => soundMap.set(s.id, s));

  const likeMap = new Map<string, number>();
  const commentMap = new Map<string, number>();
  const saveMap = new Map<string, number>();
  (likesRes.data ?? []).forEach((r: any) => likeMap.set(r.post_id, (likeMap.get(r.post_id) ?? 0) + 1));
  (commentsRes.data ?? []).forEach((r: any) => commentMap.set(r.post_id, (commentMap.get(r.post_id) ?? 0) + 1));
  (savesRes.data ?? []).forEach((r: any) => saveMap.set(r.post_id, (saveMap.get(r.post_id) ?? 0) + 1));

  /* Viewer-specific like/save status */
  let likedSet = new Set<string>();
  let savedSet = new Set<string>();
  if (viewerId) {
    const [vLikes, vSaves] = await Promise.all([
      svc.from("likes").select("post_id").in("post_id", postIds).eq("user_id", viewerId),
      svc.from("saves").select("post_id").in("post_id", postIds).eq("user_id", viewerId),
    ]);
    (vLikes.data ?? []).forEach((r: any) => likedSet.add(r.post_id));
    (vSaves.data ?? []).forEach((r: any) => savedSet.add(r.post_id));
  }

  return posts.map((p: any) => ({
    ...p,
    like_count:    likeMap.get(p.id) ?? 0,
    comment_count: commentMap.get(p.id) ?? 0,
    save_count:    saveMap.get(p.id) ?? 0,
    has_liked:     likedSet.has(p.id),
    has_saved:     savedSet.has(p.id),
    media:         (p.media ?? []).sort((a: any, b: any) => a.position - b.position),
    sound:         p.sound_id ? (soundMap.get(p.sound_id) ?? null) : null,
  }));
}

/** Engagement score for trending sort (applied in Node, not in DB). */
function trendingScore(p: any): number {
  const likes    = Number(p.like_count ?? 0);
  const comments = Number(p.comment_count ?? 0);
  const saves    = Number(p.save_count ?? 0);
  const views    = Number(p.view_count ?? 0);
  const ageHours = (Date.now() - new Date(p.created_at).getTime()) / 3_600_000;
  const recency  = Math.max(0, 1 - ageHours / 168); // decay over 7 days
  return likes * 3 + comments * 5 + saves * 4 + Math.min(views / 100, 50) + recency * 20;
}

/** Fire a notification async — never blocks the response. */
async function fireNotification(payload: {
  user_id:    string;
  actor_id:   string;
  post_id?:   string;
  comment_id?: string;
  type:       "like" | "comment" | "reply" | "follow" | "mention" | "stars";
}) {
  /* Don't notify yourself */
  if (payload.user_id === payload.actor_id) return;
  try {
    await db().from("post_notifications").insert(payload);
  } catch (err) {
    logger.warn({ err }, "[notifications] insert failed (non-critical)");
  }
}

/* ════════════════════════════════════════════════════════════════════════════════
   §1  FEED ENDPOINTS
═════════════════════════════════════════════════════════════════════════════════ */

/* ── GET /api/posts — For You feed (public + optional viewer) ──────────────── */
router.get("/posts", async (req, res) => {
  try {
    const viewer = tryGetViewer(req);
    const limit  = Math.min(Number(req.query["limit"] ?? 15), 50);
    const offset = Number(req.query["offset"] ?? 0);
    const sort   = req.query["sort"] as string | undefined; // "trending" | "newest"
    const svc    = db();

    /* Fetch a larger set for trending sort (so scoring has more to rank) */
    const fetchLimit = sort === "trending" ? Math.min(limit * 5, 100) : limit;

    const { data, error } = await svc
      .from("posts")
      .select(BASE_POST_SELECT)
      .order("created_at", { ascending: false })
      .range(offset, offset + fetchLimit - 1);

    if (error) {
      logger.error({ err: error }, "[posts] select error");
      res.status(500).json({ error: error.message ?? "Database error" });
      return;
    }

    let posts = await enrichPosts(data ?? [], viewer);

    if (sort === "trending") {
      posts = posts.sort((a, b) => trendingScore(b) - trendingScore(a));
      posts = posts.slice(offset, offset + limit);
    }

    res.json({ posts });
  } catch (err) {
    logger.error({ err }, "[posts] feed error");
    res.status(500).json({ error: "Internal error" });
  }
});

/* ── GET /api/posts/feed/following — Following feed ────────────────────────── */
router.get("/posts/feed/following", requireAuth as any, async (req, res) => {
  try {
    const viewer = getAuthedUser(req as any);
    const limit  = Math.min(Number(req.query["limit"] ?? 15), 50);
    const offset = Number(req.query["offset"] ?? 0);
    const svc    = db();

    /* Get followed user IDs */
    const { data: follows } = await svc
      .from("follows")
      .select("following_id")
      .eq("follower_id", viewer.id);

    const followedIds = (follows ?? []).map((f: any) => f.following_id);

    if (followedIds.length === 0) {
      res.json({ posts: [] });
      return;
    }

    const { data, error } = await svc
      .from("posts")
      .select(BASE_POST_SELECT)
      .in("author_id", followedIds)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) { 
      logger.error({ err: error }, "[posts/following] select error");
      res.status(500).json({ error: error.message ?? "Database error" }); 
      return; 
    }

    const posts = await enrichPosts(data ?? [], viewer.id);
    res.json({ posts });
  } catch (err) {
    logger.error({ err }, "[posts/following] error");
    res.status(500).json({ error: "Internal error" });
  }
});

/* ── GET /api/posts/feed/saved — Saved posts ────────────────────────────────── */
router.get("/posts/feed/saved", requireAuth as any, async (req, res) => {
  try {
    const viewer = getAuthedUser(req as any);
    const limit  = Math.min(Number(req.query["limit"] ?? 15), 50);
    const offset = Number(req.query["offset"] ?? 0);
    const svc    = db();

    const { data: saves } = await svc
      .from("saves")
      .select("post_id")
      .eq("user_id", viewer.id)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    const savedIds = (saves ?? []).map((s: any) => s.post_id);
    if (savedIds.length === 0) { res.json({ posts: [] }); return; }

    const { data, error } = await svc
      .from("posts")
      .select(BASE_POST_SELECT)
      .in("id", savedIds);

    if (error) { 
      logger.error({ err: error }, "[posts/saved] select error");
      res.status(500).json({ error: error.message ?? "Database error" }); 
      return; 
    }

    const posts = await enrichPosts(data ?? [], viewer.id);
    /* Preserve save order */
    const ordered = savedIds
      .map((id) => posts.find((p) => p.id === id))
      .filter(Boolean);
    res.json({ posts: ordered });
  } catch (err) {
    logger.error({ err }, "[posts/saved] error");
    res.status(500).json({ error: "Internal error" });
  }
});

/* ── GET /api/posts/user/:uid — Posts by a specific user ───────────────── */
router.get("/posts/user/:uid", async (req, res) => {
  try {
    const viewer = tryGetViewer(req);
    const { uid } = req.params;
    const limit   = Math.min(Number(req.query["limit"] ?? 20), 50);
    const offset  = Number(req.query["offset"] ?? 0);
    const svc     = db();

    const { data, error } = await svc
      .from("posts")
      .select(BASE_POST_SELECT)
      .eq("author_id", uid)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) { 
      logger.error({ err: error }, "[posts/user] select error");
      res.status(500).json({ error: error.message ?? "Database error" }); 
      return; 
    }

    const posts = await enrichPosts(data ?? [], viewer);
    res.json({ posts });
  } catch (err) {
    logger.error({ err }, "[posts/user] error");
    res.status(500).json({ error: "Internal error" });
  }
});

/* ── GET /api/posts/:id — Single post ──────────────────────────────────── */
router.get("/posts/:id", async (req, res) => {
  try {
    const viewer = tryGetViewer(req);
    const svc    = db();

    const { data, error } = await svc
      .from("posts")
      .select(BASE_POST_SELECT)
      .eq("id", req.params["id"])
      .maybeSingle();

    if (error || !data) { 
      logger.warn({ err: error }, "[posts/:id] select error or not found");
      res.status(404).json({ error: "Not found" }); 
      return; 
    }

    const [enriched] = await enrichPosts([data], viewer);
    res.json({ post: enriched });
  } catch (err) {
    logger.error({ err }, "[posts/:id] error");
    res.status(500).json({ error: "Internal error" });
  }
});

/* ════════════════════════════════════════════════════════════════════════════════
   §2  POST CRUD
═════════════════════════════════════════════════════════════════════════════════ */

/* ── POST /api/posts — Create ──────────────────────────────────────────── */
router.post("/posts", requireAuth as any, async (req, res) => {
  try {
    const user = getAuthedUser(req as any);
    const svc  = db();
    const { caption, type = "photo", media = [], sound_id } = req.body ?? {};
    // sound_id requires migration 53 (sound_id column on posts). Tracked below in try/catch.

    const trimmedCaption = caption?.trim() ?? null;
    if ((!media || media.length === 0) && !trimmedCaption) {
      res.status(400).json({ error: "A caption or at least one media item is required" });
      return;
    }

    const { data: post, error: postErr } = await svc
      .from("posts")
      .insert({ author_id: user.id, caption: caption?.trim() ?? null, type })
      .select()
      .single();

    if (postErr) { 
      logger.error({ err: postErr }, "[posts] create insert error");
      res.status(500).json({ error: postErr.message }); 
      return; 
    }

    const mediaRows = (media as any[]).map((m, i) => ({
      post_id: (post as any).id, url: m.url, type: m.type,
      width: m.width ?? null, height: m.height ?? null,
      duration: m.duration ?? null, position: i,
    }));
    if (mediaRows.length > 0) {
      await svc.from("post_media").insert(mediaRows);
    }

    /* Track sound usage after post creation */
    if (sound_id && (post as any)?.id) {
      void (async () => {
        try {
          await svc.from("sound_usage").upsert(
            { sound_id, post_id: (post as any).id, user_id: user.id },
            { onConflict: "sound_id,post_id" }
          );
          const { data: s } = await svc.from("sounds").select("usage_count").eq("id", sound_id).single();
          if (s) await svc.from("sounds").update({ usage_count: ((s as any).usage_count ?? 0) + 1 }).eq("id", sound_id);
        } catch (e) { logger.warn({ e }, "[posts] sound usage track failed (non-critical)"); }
      })();
    }

    /* Fire mention notifications — non-blocking */
    if (trimmedCaption) {
      void (async () => {
        try {
          const handles = [
            ...new Set(
              (trimmedCaption.match(/@([\w.]+)/g) ?? []).map((m) =>
                m.slice(1).toLowerCase(),
              ),
            ),
          ];
          for (const handle of handles) {
            const { data: mu } = await svc
              .from("users")
              .select("id")
              .ilike("username", handle)
              .limit(1)
              .maybeSingle();
            if (mu) {
              void fireNotification({
                user_id:  (mu as any).id,
                actor_id: user.id,
                post_id:  (post as any).id,
                type:     "mention",
              });
            }
          }
        } catch (e) {
          logger.warn({ e }, "[posts] mention notifications failed (non-critical)");
        }
      })();
    }

    /* Return full enriched post */
    const { data: fullPost } = await svc
      .from("posts")
      .select(BASE_POST_SELECT)
      .eq("id", (post as any).id)
      .maybeSingle();

    const [enriched] = await enrichPosts([fullPost], user.id);
    logger.info({ postId: enriched.id, userId: user.id }, "[posts] created");
    res.status(201).json({ post: enriched });
  } catch (err) {
    logger.error({ err }, "[posts] create error");
    res.status(500).json({ error: "Internal error" });
  }
});

/* ── DELETE /api/posts/:id — Author or owner can delete ────────────────── */
router.delete("/posts/:id", requireAuth as any, async (req, res) => {
  try {
    const user = getAuthedUser(req as any);
    const svc  = db();
    const postId = req.params["id"];

    const { data: post } = await svc.from("posts").select("author_id").eq("id", postId).maybeSingle();
    if (!post) { res.status(404).json({ error: "Not found" }); return; }

    const canDelete = (post as any).author_id === user.id ||
      (user.email ?? "").toLowerCase() === OWNER_EMAIL;

    if (!canDelete) { res.status(403).json({ error: "Forbidden" }); return; }

    await svc.from("posts").delete().eq("id", postId);
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "[posts] delete error");
    res.status(500).json({ error: "Internal error" });
  }
});

/* ════════════════════════════════════════════════════════════════════════════════
   §3  LIKE / SAVE TOGGLES
═════════════════════════════════════════════════════════════════════════════════ */

/* ── POST /api/posts/:id/like — Toggle like ────────────────────────────── */
router.post("/posts/:id/like", requireAuth as any, async (req, res) => {
  try {
    const user   = getAuthedUser(req as any);
    const svc    = db();
    const postId = req.params["id"];

    const { data: existing } = await svc
      .from("likes")
      .select("post_id")
      .eq("post_id", postId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (existing) {
      await svc.from("likes").delete().eq("post_id", postId).eq("user_id", user.id);
      res.json({ liked: false });
    } else {
      await svc.from("likes").insert({ post_id: postId, user_id: user.id });

      /* Fire notification async */
      const { data: postRow } = await svc.from("posts").select("author_id").eq("id", postId).maybeSingle();
      if (postRow) {
        void fireNotification({ user_id: (postRow as any).author_id, actor_id: user.id, post_id: postId, type: "like" });
      }
      res.json({ liked: true });
    }
  } catch (err) {
    logger.error({ err }, "[posts/like] error");
    res.status(500).json({ error: "Internal error" });
  }
});

/* ── POST /api/posts/:id/save — Toggle save ────────────────────────────── */
router.post("/posts/:id/save", requireAuth as any, async (req, res) => {
  try {
    const user   = getAuthedUser(req as any);
    const svc    = db();
    const postId = req.params["id"];

    const { data: existing } = await svc
      .from("saves")
      .select("post_id")
      .eq("post_id", postId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (existing) {
      await svc.from("saves").delete().eq("post_id", postId).eq("user_id", user.id);
      res.json({ saved: false });
    } else {
      await svc.from("saves").insert({ post_id: postId, user_id: user.id });
      res.json({ saved: true });
    }
  } catch (err) {
    logger.error({ err }, "[posts/save] error");
    res.status(500).json({ error: "Internal error" });
  }
});

/* ════════════════════════════════════════════════════════════════════════════════
   §4  COMMENTS
═════════════════════════════════════════════════════════════════════════════════ */

const COMMENT_SELECT = "*, author:users!comments_author_id_fkey(id, name, username, avatar_url)";

/* ── GET /api/posts/:id/comments ───────────────────────────────────────── */
router.get("/posts/:id/comments", async (req, res) => {
  try {
    const svc    = db();
    const limit  = Math.min(Number(req.query["limit"] ?? 50), 100);
    const offset = Number(req.query["offset"] ?? 0);
    const parentId = req.query["parentId"] as string | undefined;

    let query = svc
      .from("comments")
      .select(COMMENT_SELECT)
      .eq("post_id", req.params["id"])
      .order("created_at", { ascending: true })
      .range(offset, offset + limit - 1);

    if (parentId) {
      query = query.eq("parent_comment_id", parentId);
    } else {
      query = query.is("parent_comment_id", null); // top-level only
    }

    const { data, error } = await query;
    if (error) { 
      logger.error({ err: error }, "[posts/comments] select error");
      res.status(500).json({ error: error.message }); 
      return; 
    }
    res.json({ comments: data ?? [] });
  } catch (err) {
    logger.error({ err }, "[posts/comments] error");
    res.status(500).json({ error: "Internal error" });
  }
});

/* ── POST /api/posts/:id/comments — Add comment or reply ──────────────── */
router.post("/posts/:id/comments", requireAuth as any, async (req, res) => {
  try {
    const user   = getAuthedUser(req as any);
    const svc    = db();
    const postId = req.params["id"];
    const { content, parent_comment_id } = req.body ?? {};

    if (!content?.trim()) { res.status(400).json({ error: "Content required" }); return; }
    if (content.trim().length > 2000) { res.status(422).json({ error: "Comment too long (max 2000 chars)" }); return; }

    const { data, error } = await svc
      .from("comments")
      .insert({
        post_id: postId,
        author_id: user.id,
        content: content.trim(),
        parent_comment_id: parent_comment_id ?? null,
      })
      .select(COMMENT_SELECT)
      .single();

    if (error) { 
      logger.error({ err: error }, "[posts/comments] insert error");
      res.status(500).json({ error: error.message }); 
      return; 
    }

    /* Notification async */
    const { data: postRow } = await svc.from("posts").select("author_id").eq("id", postId).maybeSingle();
    if (postRow) {
      if (parent_comment_id) {
        /* Reply notification to comment author */
        const { data: parentComment } = await svc.from("comments").select("author_id").eq("id", parent_comment_id).maybeSingle();
        if (parentComment) {
          void fireNotification({ user_id: (parentComment as any).author_id, actor_id: user.id, post_id: postId, comment_id: (data as any).id, type: "reply" });
        }
      } else {
        void fireNotification({ user_id: (postRow as any).author_id, actor_id: user.id, post_id: postId, comment_id: (data as any).id, type: "comment" });
      }
    }

    res.status(201).json({ comment: data });
  } catch (err) {
    logger.error({ err }, "[posts/comments] error");
    res.status(500).json({ error: "Internal error" });
  }
});

/* ── PUT /api/posts/:id/comments/:cid — Edit own comment ──────────────── */
router.put("/posts/:id/comments/:cid", requireAuth as any, async (req, res) => {
  try {
    const user = getAuthedUser(req as any);
    const svc  = db();
    const { cid } = req.params;
    const { content } = req.body ?? {};

    if (!content?.trim()) { res.status(400).json({ error: "Content required" }); return; }

    const { data: existing } = await svc.from("comments").select("author_id").eq("id", cid).maybeSingle();
    if (!existing) { res.status(404).json({ error: "Not found" }); return; }
    if ((existing as any).author_id !== user.id) { res.status(403).json({ error: "Forbidden" }); return; }

    const { data, error } = await svc
      .from("comments")
      .update({ content: content.trim() })
      .eq("id", cid)
      .select(COMMENT_SELECT)
      .single();

    if (error) { 
      logger.error({ err: error }, "[posts/comments/:cid] update error");
      res.status(500).json({ error: error.message }); 
      return; 
    }
    res.json({ comment: data });
  } catch (err) {
    logger.error({ err }, "[posts/comments/:cid] error");
    res.status(500).json({ error: "Internal error" });
  }
});

/* ── DELETE /api/posts/:id/comments/:cid — Author or owner ─────────────── */
router.delete("/posts/:id/comments/:cid", requireAuth as any, async (req, res) => {
  try {
    const user = getAuthedUser(req as any);
    const svc  = db();
    const { cid } = req.params;

    const { data: comment } = await svc.from("comments").select("author_id").eq("id", cid).maybeSingle();
    if (!comment) { res.status(404).json({ error: "Not found" }); return; }

    const canDelete = (comment as any).author_id === user.id ||
      (user.email ?? "").toLowerCase() === OWNER_EMAIL;
    if (!canDelete) { res.status(403).json({ error: "Forbidden" }); return; }

    await svc.from("comments").delete().eq("id", cid);
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "[posts/comments] delete error");
    res.status(500).json({ error: "Internal error" });
  }
});

/* ════════════════════════════════════════════════════════════════════════════════
   §5  REPORTS
═════════════════════════════════════════════════════════════════════════════════ */

const VALID_REASONS = ["spam","inappropriate","harassment","misinformation","other"] as const;

/* ── POST /api/posts/:id/report ─────────────────────────────────────────── */
router.post("/posts/:id/report", requireAuth as any, async (req, res) => {
  try {
    const user = getAuthedUser(req as any);
    const svc  = db();
    const { reason = "other", notes } = req.body ?? {};

    if (!VALID_REASONS.includes(reason)) {
      res.status(422).json({ error: `reason must be one of: ${VALID_REASONS.join(", ")}` });
      return;
    }

    const { error } = await svc.from("reports").insert({
      reporter_id: user.id,
      post_id: req.params["id"],
      reason,
      notes: notes?.trim()?.slice(0, 500) ?? null,
    });

    if (error) { 
      logger.error({ err: error }, "[posts/report] insert error");
      res.status(500).json({ error: error.message }); 
      return; 
    }
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "[posts/report] error");
    res.status(500).json({ error: "Internal error" });
  }
});

/* ── POST /api/posts/:id/comments/:cid/report ──────────────────────────── */
router.post("/posts/:id/comments/:cid/report", requireAuth as any, async (req, res) => {
  try {
    const user = getAuthedUser(req as any);
    const svc  = db();
    const { reason = "other", notes } = req.body ?? {};

    if (!VALID_REASONS.includes(reason)) {
      res.status(422).json({ error: `reason must be one of: ${VALID_REASONS.join(", ")}` });
      return;
    }

    const { error } = await svc.from("reports").insert({
      reporter_id: user.id,
      comment_id: req.params["cid"],
      reason,
      notes: notes?.trim()?.slice(0, 500) ?? null,
    });

    if (error) { 
      logger.error({ err: error }, "[posts/comments/report] insert error");
      res.status(500).json({ error: error.message }); 
      return; 
    }
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "[posts/comments/report] error");
    res.status(500).json({ error: "Internal error" });
  }
});

/* ════════════════════════════════════════════════════════════════════════════════
   §6  VIEW COUNTER
   Strategy:
   • Authenticated users → DB-backed (post_views table, migration 45).
     The record_post_view RPC atomically inserts and increments; the
     unique constraint prevents double-counting across restarts/replicas.
   • Anonymous users → in-memory 24 h fingerprint cache (IP + UA).
     No user identity to store, so DB dedup is not possible.
═════════════════════════════════════════════════════════════════════════════════ */

/* ── Anonymous fallback: in-memory cache (anon users only) ── */
const _anonSeen   = new Map<string, Set<string>>();
const _anonSeenAt = new Map<string, number>();
const ANON_TTL_MS = 24 * 60 * 60 * 1000;

function pruneAnonCache() {
  const now = Date.now();
  for (const [key, ts] of _anonSeenAt) {
    if (now - ts > ANON_TTL_MS) { _anonSeen.delete(key); _anonSeenAt.delete(key); }
  }
}
function anonHasSeen(fingerprint: string, postId: string): boolean {
  pruneAnonCache();
  return (_anonSeen.get(fingerprint) ?? new Set()).has(postId);
}
function anonMarkSeen(fingerprint: string, postId: string) {
  if (!_anonSeen.has(fingerprint)) _anonSeen.set(fingerprint, new Set());
  _anonSeen.get(fingerprint)!.add(postId);
  _anonSeenAt.set(fingerprint, Date.now());
}

router.post("/posts/:id/view", async (req, res) => {
  try {
    const svc    = db();
    const postId = req.params["id"];

    let authedUserId: string | null = null;
    try { authedUserId = getAuthedUser(req as any).id; } catch { /* anon */ }

    if (authedUserId) {
      /* ── Authenticated: DB-backed unique constraint ── */
      try {
        await svc.rpc("record_post_view", { p_post_id: postId, p_user_id: authedUserId });
      } catch {
        /* Graceful fallback if migration 45 hasn't run yet */
        try { await svc.rpc("increment_post_views", { post_id: postId }); } catch { /* ok */ }
      }
    } else {
      /* ── Anonymous: in-memory 24 h fingerprint ── */
      const ip = (req.headers["cf-connecting-ip"] as string)
        ?? (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim()
        ?? req.socket?.remoteAddress ?? "anon";
      const fingerprint = `${ip}:${(req.headers["user-agent"] ?? "").slice(0, 64)}`;

      if (!anonHasSeen(fingerprint, postId)) {
        anonMarkSeen(fingerprint, postId);
        try { await svc.rpc("increment_post_views", { post_id: postId }); } catch { /* ok */ }
      }
    }

    res.json({ ok: true });
  } catch {
    res.json({ ok: true }); /* never 500 the client for a view */
  }
});

/* ════════════════════════════════════════════════════════════════════════════════
   §7  NOTIFICATIONS
═════════════════════════════════════════════════════════════════════════════════ */

/* ── GET /api/notifications ─────────────────────────────────────────────── */
router.get("/notifications", requireAuth as any, async (req, res) => {
  try {
    const user  = getAuthedUser(req as any);
    const svc   = db();
    const limit = Math.min(Number(req.query["limit"] ?? 30), 50);
    const offset = Number(req.query["offset"] ?? 0);

    const { data, error } = await svc
      .from("post_notifications")
      .select(`
        id, type, read, created_at, post_id, comment_id,
        actor:users!post_notifications_actor_id_fkey(id, name, username, avatar_url)
      `)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      if ((error.message ?? "").includes("does not exist")) {
        res.json({ notifications: [], unread: 0 });
        return;
      }
      logger.error({ err: error }, "[notifications] select error");
      res.status(500).json({ error: error.message });
      return;
    }

    /* Separate COUNT query for total unread — not capped by page size */
    const { count: unreadCount } = await svc
      .from("post_notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("read", false);

    res.json({ notifications: data ?? [], unread: unreadCount ?? 0 });
  } catch (err) {
    logger.error({ err }, "[notifications] error");
    res.status(500).json({ error: "Internal error" });
  }
});

/* ── PUT /api/notifications/read-all ───────────────────────────────────── */
router.put("/notifications/read-all", requireAuth as any, async (req, res) => {
  try {
    const user = getAuthedUser(req as any);
    const svc  = db();
    await svc.from("post_notifications").update({ read: true }).eq("user_id", user.id).eq("read", false);
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "[notifications/read-all] error");
    res.status(500).json({ error: "Internal error" });
  }
});

/* ── PUT /api/notifications/:id/read ───────────────────────────────────── */
router.put("/notifications/:id/read", requireAuth as any, async (req, res) => {
  try {
    const user = getAuthedUser(req as any);
    const svc  = db();
    await svc.from("post_notifications").update({ read: true })
      .eq("id", req.params["id"]).eq("user_id", user.id);
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "[notifications/:id/read] error");
    res.status(500).json({ error: "Internal error" });
  }
});

/* ════════════════════════════════════════════════════════════════════════════════
   §8  OWNER MODERATION
═════════════════════════════════════════════════════════════════════════════════ */

/* ── GET /api/owner/reports — Review queue ──────────────────────────────── */
router.get("/owner/reports", requireAuth as any, async (req, res) => {
  try {
    if (!isOwnerUser(req)) { res.status(403).json({ error: "Owner only" }); return; }
    const svc    = db();
    const status = req.query["status"] as string ?? "pending";
    const limit  = Math.min(Number(req.query["limit"] ?? 50), 100);

    const { data, error } = await svc
      .from("reports")
      .select("*, reporter:users!reports_reporter_id_fkey(id, name, username, avatar_url)")
      .eq("status", status)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) { 
      logger.error({ err: error }, "[owner/reports] select error");
      res.status(500).json({ error: error.message }); 
      return; 
    }
    res.json({ reports: data ?? [] });
  } catch (err) {
    logger.error({ err }, "[owner/reports] error");
    res.status(500).json({ error: "Internal error" });
  }
});

/* ── PUT /api/owner/reports/:id — Update report status ──────────────────── */
router.put("/owner/reports/:id", requireAuth as any, async (req, res) => {
  try {
    if (!isOwnerUser(req)) { res.status(403).json({ error: "Owner only" }); return; }
    const svc  = db();
    const user = getAuthedUser(req as any);
    const { status } = req.body ?? {};

    if (!["reviewed","dismissed","actioned"].includes(status)) {
      res.status(422).json({ error: "Invalid status" }); return;
    }

    await svc.from("reports").update({
      status,
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
    }).eq("id", req.params["id"]);

    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "[owner/reports/:id] error");
    res.status(500).json({ error: "Internal error" });
  }
});

export default router;
