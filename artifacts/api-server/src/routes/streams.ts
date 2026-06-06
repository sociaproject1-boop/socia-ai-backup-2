/**
 * routes/streams.ts — Live Streaming Foundation API
 *
 * POST   /api/streams                         — create stream session
 * GET    /api/streams/active                  — list active streams
 * GET    /api/streams/:id                     — get stream details
 * PATCH  /api/streams/:id/end                 — end stream (creator only)
 * POST   /api/streams/:id/join                — join stream (viewer)
 * POST   /api/streams/:id/leave               — leave stream (viewer)
 * GET    /api/streams/:id/comments            — get recent comments
 * POST   /api/streams/:id/comments            — post a comment
 * POST   /api/streams/:id/reactions           — send a reaction
 * DELETE /api/streams/:id/viewers/:viewerId   — remove viewer (creator/admin)
 * POST   /api/streams/:id/viewers/:viewerId/mute — mute viewer comments
 */
import { Router, type IRouter } from "express";
import { createClient } from "@supabase/supabase-js";
import { requireAuth, getAuthedUser } from "../lib/supabaseAuth.js";
import { logger } from "../lib/logger.js";

const SUPABASE_URL         = process.env["VITE_SUPABASE_URL"] ?? process.env["SUPABASE_URL"] ?? "";
const SUPABASE_SERVICE_KEY = process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "";

function admin() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

const VALID_CATEGORIES = [
  "general","gaming","music","art","fitness","cooking","chat","education","other"
] as const;

const VALID_REACTIONS = ["heart","like","fire","clap"] as const;

const router: IRouter = Router();

/* ── POST /api/streams — Create a new live stream session ─────────────────── */
router.post("/streams", requireAuth, async (req, res) => {
  const user = getAuthedUser(req);
  const { title, description, category = "general", thumbnail_url } = req.body as Record<string, string>;

  if (!title?.trim()) {
    res.status(400).json({ error: "title_required" });
    return;
  }
  if (title.trim().length > 120) {
    res.status(400).json({ error: "title_too_long" });
    return;
  }
  if (!VALID_CATEGORIES.includes(category as typeof VALID_CATEGORIES[number])) {
    res.status(400).json({ error: "invalid_category" });
    return;
  }

  try {
    // End any existing live session for this creator
    await admin()
      .from("stream_sessions")
      .update({ status: "ended", ended_at: new Date().toISOString() })
      .eq("creator_id", user.id)
      .eq("status", "live");

    const { data, error } = await admin()
      .from("stream_sessions")
      .insert({
        creator_id:    user.id,
        title:         title.trim(),
        description:   description?.trim() ?? null,
        category,
        thumbnail_url: thumbnail_url ?? null,
      })
      .select(`
        id, title, description, category, thumbnail_url, stream_key,
        status, viewer_count, peak_viewers, started_at,
        creator:users!stream_sessions_creator_id_fkey(
          id, name, username, avatar_url, is_verified, is_owner
        )
      `)
      .single();

    if (error) throw error;

    logger.info({ streamId: data.id, userId: user.id }, "[streams] stream created");
    res.status(201).json({ stream: data });
  } catch (err) {
    logger.error({ err }, "[streams] create failed");
    res.status(500).json({ error: "stream_create_failed" });
  }
});

/* ── GET /api/streams/active — List active live streams ──────────────────── */
router.get("/streams/active", requireAuth, async (_req, res) => {
  try {
    const { data, error } = await admin()
      .from("stream_sessions")
      .select(`
        id, title, category, thumbnail_url, viewer_count, peak_viewers, started_at,
        creator:users!stream_sessions_creator_id_fkey(
          id, name, username, avatar_url, is_verified, is_owner
        )
      `)
      .eq("status", "live")
      .order("viewer_count", { ascending: false })
      .limit(20);

    if (error) {
      /* PGRST205 = relation not found (migration not yet run) — return empty gracefully */
      const code = (error as { code?: string }).code;
      if (code === "PGRST205" || code === "42P01") {
        res.json({ streams: [] });
        return;
      }
      throw error;
    }
    res.json({ streams: data ?? [] });
  } catch (err) {
    logger.error({ err }, "[streams] list active failed");
    res.status(500).json({ error: "fetch_failed" });
  }
});

/* ── GET /api/streams/:id — Get stream details ───────────────────────────── */
router.get("/streams/:id", requireAuth, async (req, res) => {
  const { id } = req.params as { id: string };
  try {
    const { data, error } = await admin()
      .from("stream_sessions")
      .select(`
        id, title, description, category, thumbnail_url, stream_key,
        status, viewer_count, peak_viewers, total_viewers, started_at, ended_at,
        creator:users!stream_sessions_creator_id_fkey(
          id, name, username, avatar_url, is_verified, is_owner, followers
        )
      `)
      .eq("id", id)
      .single();

    if (error || !data) {
      res.status(404).json({ error: "stream_not_found" });
      return;
    }
    res.json({ stream: data });
  } catch (err) {
    logger.error({ err }, "[streams] get failed");
    res.status(500).json({ error: "fetch_failed" });
  }
});

/* ── PATCH /api/streams/:id/end — End a live stream (creator only) ────────── */
router.patch("/streams/:id/end", requireAuth, async (req, res) => {
  const user  = getAuthedUser(req);
  const { id } = req.params as { id: string };

  try {
    const { data: stream, error: fetchErr } = await admin()
      .from("stream_sessions")
      .select("id, creator_id, status")
      .eq("id", id)
      .single();

    if (fetchErr || !stream) {
      res.status(404).json({ error: "stream_not_found" });
      return;
    }
    if (stream.creator_id !== user.id) {
      res.status(403).json({ error: "not_creator" });
      return;
    }
    if (stream.status === "ended") {
      res.json({ ok: true, message: "already_ended" });
      return;
    }

    // Mark all active viewers as left
    await admin()
      .from("stream_viewers")
      .update({ left_at: new Date().toISOString() })
      .eq("stream_id", id)
      .is("left_at", null);

    const { data, error } = await admin()
      .from("stream_sessions")
      .update({ status: "ended", ended_at: new Date().toISOString(), viewer_count: 0 })
      .eq("id", id)
      .select("id, status, ended_at, peak_viewers, total_viewers")
      .single();

    if (error) throw error;
    logger.info({ streamId: id, userId: user.id }, "[streams] stream ended");
    res.json({ stream: data });
  } catch (err) {
    logger.error({ err }, "[streams] end failed");
    res.status(500).json({ error: "end_failed" });
  }
});

/* ── POST /api/streams/:id/join — Viewer joins stream ────────────────────── */
router.post("/streams/:id/join", requireAuth, async (req, res) => {
  const user  = getAuthedUser(req);
  const { id } = req.params as { id: string };

  try {
    const { data: stream, error: fetchErr } = await admin()
      .from("stream_sessions")
      .select("id, status, creator_id, viewer_count, peak_viewers, total_viewers")
      .eq("id", id)
      .single();

    if (fetchErr || !stream) {
      res.status(404).json({ error: "stream_not_found" });
      return;
    }
    if (stream.status !== "live") {
      res.status(410).json({ error: "stream_ended" });
      return;
    }

    // Upsert viewer record (re-join resets left_at)
    await admin()
      .from("stream_viewers")
      .upsert(
        { stream_id: id, user_id: user.id, joined_at: new Date().toISOString(), left_at: null },
        { onConflict: "stream_id,user_id" }
      );

    // Update viewer_count + peak_viewers + total_viewers
    const newCount    = stream.viewer_count + 1;
    const newPeak     = Math.max(stream.peak_viewers, newCount);
    const newTotal    = stream.total_viewers + 1;

    await admin()
      .from("stream_sessions")
      .update({ viewer_count: newCount, peak_viewers: newPeak, total_viewers: newTotal })
      .eq("id", id);

    res.json({ ok: true, viewer_count: newCount });
  } catch (err) {
    logger.error({ err }, "[streams] join failed");
    res.status(500).json({ error: "join_failed" });
  }
});

/* ── POST /api/streams/:id/leave — Viewer leaves stream ──────────────────── */
router.post("/streams/:id/leave", requireAuth, async (req, res) => {
  const user  = getAuthedUser(req);
  const { id } = req.params as { id: string };

  try {
    await admin()
      .from("stream_viewers")
      .update({ left_at: new Date().toISOString() })
      .eq("stream_id", id)
      .eq("user_id", user.id)
      .is("left_at", null);

    // Decrement viewer count (floor at 0)
    const { data: stream } = await admin()
      .from("stream_sessions")
      .select("viewer_count, status")
      .eq("id", id)
      .single();

    if (stream && (stream as Record<string, unknown>).status !== "ended") {
      const newCount = Math.max(0, (stream as Record<string, number>).viewer_count - 1);
      await admin()
        .from("stream_sessions")
        .update({ viewer_count: newCount })
        .eq("id", id);
    }

    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "[streams] leave failed");
    res.status(500).json({ error: "leave_failed" });
  }
});

/* ── GET /api/streams/:id/comments — Get recent comments ─────────────────── */
router.get("/streams/:id/comments", requireAuth, async (req, res) => {
  const { id }     = req.params as { id: string };
  const limit      = Math.min(parseInt(req.query.limit as string) || 50, 100);
  const before     = req.query.before as string | undefined;

  try {
    let query = admin()
      .from("stream_comments")
      .select(`
        id, content, is_muted, created_at,
        user:users!stream_comments_user_id_fkey(id, name, username, avatar_url, is_verified)
      `)
      .eq("stream_id", id)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (before) query = query.lt("created_at", before);

    const { data, error } = await query;
    if (error) throw error;
    res.json({ comments: (data ?? []).reverse() });
  } catch (err) {
    logger.error({ err }, "[streams] get comments failed");
    res.status(500).json({ error: "fetch_failed" });
  }
});

/* ── POST /api/streams/:id/comments — Add a comment ─────────────────────── */
router.post("/streams/:id/comments", requireAuth, async (req, res) => {
  const user  = getAuthedUser(req);
  const { id } = req.params as { id: string };
  const { content } = req.body as { content?: string };

  if (!content?.trim()) {
    res.status(400).json({ error: "content_required" });
    return;
  }
  if (content.trim().length > 300) {
    res.status(400).json({ error: "content_too_long" });
    return;
  }

  try {
    // Verify stream is live
    const { data: stream } = await admin()
      .from("stream_sessions")
      .select("id, status")
      .eq("id", id)
      .single();

    if (!stream || stream.status !== "live") {
      res.status(410).json({ error: "stream_ended" });
      return;
    }

    // Check if user is muted
    const { data: muted } = await admin()
      .from("stream_comments")
      .select("id")
      .eq("stream_id", id)
      .eq("user_id", user.id)
      .eq("is_muted", true)
      .limit(1);

    if (muted && muted.length > 0) {
      res.status(403).json({ error: "user_muted" });
      return;
    }

    const { data, error } = await admin()
      .from("stream_comments")
      .insert({ stream_id: id, user_id: user.id, content: content.trim() })
      .select(`
        id, content, is_muted, created_at,
        user:users!stream_comments_user_id_fkey(id, name, username, avatar_url, is_verified)
      `)
      .single();

    if (error) throw error;
    res.status(201).json({ comment: data });
  } catch (err) {
    logger.error({ err }, "[streams] add comment failed");
    res.status(500).json({ error: "comment_failed" });
  }
});

/* ── POST /api/streams/:id/reactions — Send a reaction ───────────────────── */
router.post("/streams/:id/reactions", requireAuth, async (req, res) => {
  const user  = getAuthedUser(req);
  const { id } = req.params as { id: string };
  const { type } = req.body as { type?: string };

  if (!type || !VALID_REACTIONS.includes(type as typeof VALID_REACTIONS[number])) {
    res.status(400).json({ error: "invalid_reaction_type" });
    return;
  }

  try {
    const { data, error } = await admin()
      .from("stream_reactions")
      .insert({ stream_id: id, user_id: user.id, type })
      .select("id, type, created_at")
      .single();

    if (error) throw error;
    res.status(201).json({ reaction: data });
  } catch (err) {
    logger.error({ err }, "[streams] add reaction failed");
    res.status(500).json({ error: "reaction_failed" });
  }
});

/* ── DELETE /api/streams/:id/viewers/:viewerId — Remove viewer (mod) ─────── */
router.delete("/streams/:id/viewers/:viewerId", requireAuth, async (req, res) => {
  const user       = getAuthedUser(req);
  const { id, viewerId } = req.params as { id: string; viewerId: string };

  try {
    // Must be stream creator
    const { data: stream } = await admin()
      .from("stream_sessions")
      .select("creator_id")
      .eq("id", id)
      .single();

    if (!stream || stream.creator_id !== user.id) {
      res.status(403).json({ error: "not_authorized" });
      return;
    }

    await admin()
      .from("stream_viewers")
      .update({ left_at: new Date().toISOString() })
      .eq("stream_id", id)
      .eq("user_id", viewerId);

    // Decrement viewer count
    const { data: s } = await admin()
      .from("stream_sessions")
      .select("viewer_count")
      .eq("id", id)
      .single();
    if (s) {
      await admin()
        .from("stream_sessions")
        .update({ viewer_count: Math.max(0, (s as Record<string, number>).viewer_count - 1) })
        .eq("id", id);
    }

    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "[streams] remove viewer failed");
    res.status(500).json({ error: "remove_failed" });
  }
});

/* ── POST /api/streams/:id/viewers/:viewerId/mute — Mute viewer (mod) ────── */
router.post("/streams/:id/viewers/:viewerId/mute", requireAuth, async (req, res) => {
  const user       = getAuthedUser(req);
  const { id, viewerId } = req.params as { id: string; viewerId: string };
  const { muted = true } = req.body as { muted?: boolean };

  try {
    const { data: stream } = await admin()
      .from("stream_sessions")
      .select("creator_id")
      .eq("id", id)
      .single();

    if (!stream || stream.creator_id !== user.id) {
      res.status(403).json({ error: "not_authorized" });
      return;
    }

    // Mark all of this user's comments in this stream as muted
    await admin()
      .from("stream_comments")
      .update({ is_muted: muted })
      .eq("stream_id", id)
      .eq("user_id", viewerId);

    res.json({ ok: true, muted });
  } catch (err) {
    logger.error({ err }, "[streams] mute viewer failed");
    res.status(500).json({ error: "mute_failed" });
  }
});

export default router;
