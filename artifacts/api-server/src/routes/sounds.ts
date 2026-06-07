/**
 * routes/sounds.ts — Socia Sound Ecosystem
 *
 * §1  List / search sounds
 * §2  Get single sound + stats
 * §3  Get posts using a sound
 * §4  Create a sound
 * §5  Increment usage (called when associating sound with a post)
 * §6  Trending sounds
 */
import { Router, type IRouter } from "express";
import { createClient } from "@supabase/supabase-js";
import { requireAuth, getAuthedUser } from "../lib/supabaseAuth.js";
import { logger } from "../lib/logger.js";

const SUPABASE_URL = process.env["VITE_SUPABASE_URL"] ?? process.env["SUPABASE_URL"] ?? "";
const SUPABASE_SVC_KEY = process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "";
const SUPABASE_ANON   = process.env["VITE_SUPABASE_ANON_KEY"] ?? "";

function db() {
  const key = SUPABASE_SVC_KEY || SUPABASE_ANON;
  return createClient(SUPABASE_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function userDb(req: any) {
  const token = ((req.headers["authorization"] as string) ?? "").replace(/^Bearer\s+/i, "");
  return createClient(SUPABASE_URL, SUPABASE_ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

const SOUND_SELECT = `
  id, title, cover_image, audio_url, source_type, duration_seconds, usage_count, created_at, creator_id,
  creator:users!sounds_creator_id_fkey(id, name, username, avatar_url)
`;

const router: IRouter = Router();

/* ── §1  List / search ─────────────────────────────────────────────────── */

router.get("/api/sounds", async (req, res) => {
  try {
    const svc    = db();
    const q      = (req.query["q"] as string | undefined)?.trim();
    const limit  = Math.min(Number(req.query["limit"] ?? 30), 100);
    const offset = Number(req.query["offset"] ?? 0);

    let query = svc
      .from("sounds")
      .select(SOUND_SELECT)
      .eq("is_active", true)
      .order("usage_count", { ascending: false })
      .range(offset, offset + limit - 1);

    if (q) {
      query = query.ilike("title", `%${q}%`);
    }

    const { data, error } = await query;
    if (error) throw error;

    res.json({ sounds: data ?? [] });
  } catch (err) {
    logger.error({ err }, "[sounds] list error");
    res.status(500).json({ error: "Failed to load sounds" });
  }
});

/* ── §6  Trending (by usage_count) ────────────────────────────────────── */

router.get("/api/sounds/trending", async (_req, res) => {
  try {
    const { data, error } = await db()
      .from("sounds")
      .select(SOUND_SELECT)
      .eq("is_active", true)
      .order("usage_count", { ascending: false })
      .limit(20);

    if (error) throw error;
    res.json({ sounds: data ?? [] });
  } catch (err) {
    logger.error({ err }, "[sounds] trending error");
    res.status(500).json({ error: "Failed to load trending sounds" });
  }
});

/* ── §2  Get single sound ──────────────────────────────────────────────── */

router.get("/api/sounds/:id", async (req, res) => {
  try {
    const { id } = req.params as { id: string };
    const { data, error } = await db()
      .from("sounds")
      .select(SOUND_SELECT)
      .eq("id", id)
      .single();

    if (error || !data) {
      res.status(404).json({ error: "Sound not found" });
      return;
    }

    res.json(data);
  } catch (err) {
    logger.error({ err }, "[sounds] get error");
    res.status(500).json({ error: "Failed to get sound" });
  }
});

/* ── §3  Posts using a sound ───────────────────────────────────────────── */

router.get("/api/sounds/:id/videos", async (req, res) => {
  try {
    const { id } = req.params as { id: string };
    const limit  = Math.min(Number(req.query["limit"] ?? 30), 60);
    const offset = Number(req.query["offset"] ?? 0);

    const { data, error } = await db()
      .from("sound_usage")
      .select(`
        post_id,
        post:posts!sound_usage_post_id_fkey(
          id, caption, type, view_count, created_at,
          author:users!posts_author_id_fkey(id, name, username, avatar_url),
          media:post_media(id, url, type, width, height, duration, position)
        )
      `)
      .eq("sound_id", id)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    const posts = (data ?? [])
      .map((r: any) => r.post)
      .filter(Boolean)
      .map((p: any) => ({
        ...p,
        media: (p.media ?? []).sort((a: any, b: any) => a.position - b.position),
      }));

    res.json({ posts, has_more: posts.length === limit });
  } catch (err) {
    logger.error({ err }, "[sounds] videos error");
    res.status(500).json({ error: "Failed to load sound videos" });
  }
});

/* ── §4  Create a sound ────────────────────────────────────────────────── */

router.post("/api/sounds", requireAuth, async (req, res) => {
  try {
    const { id: userId } = getAuthedUser(req);
    const { title, cover_image, audio_url, source_type, duration_seconds } =
      req.body as Record<string, any>;

    if (!title?.trim() || !audio_url?.trim()) {
      res.status(400).json({ error: "title and audio_url are required" });
      return;
    }

    const udb = userDb(req);
    const { data, error } = await udb
      .from("sounds")
      .insert({
        title: title.trim(),
        cover_image:      cover_image      ?? null,
        audio_url:        audio_url.trim(),
        creator_id:       userId,
        source_type:      source_type      ?? "user_upload",
        duration_seconds: duration_seconds ?? null,
      })
      .select(SOUND_SELECT)
      .single();

    if (error) {
      logger.error({ err: error, userId }, "[sounds] create DB error");
      const code = (error as any).code as string | undefined;
      if (code === "42P01") {
        res.status(500).json({ error: "Sounds table not created — run migration 53 in Supabase SQL editor." });
      } else {
        res.status(500).json({ error: error.message ?? "Failed to create sound" });
      }
      return;
    }

    logger.info({ soundId: data.id, userId }, "[sounds] created");
    res.status(201).json(data);
  } catch (err) {
    logger.error({ err }, "[sounds] create error");
    res.status(500).json({ error: "Failed to create sound" });
  }
});

/* ── §5  Record usage (post → sound association) ───────────────────────── */

router.post("/api/sounds/:id/use", requireAuth, async (req, res) => {
  try {
    const { id: soundId } = req.params as { id: string };
    const { id: userId }  = getAuthedUser(req);
    const { post_id }     = req.body as { post_id?: string };

    if (!post_id) {
      res.status(400).json({ error: "post_id is required" });
      return;
    }

    const svc = db();

    // Upsert usage record
    const { error: usageErr } = await svc
      .from("sound_usage")
      .upsert(
        { sound_id: soundId, post_id, user_id: userId },
        { onConflict: "sound_id,post_id" }
      );
    if (usageErr) throw usageErr;

    // Increment usage_count (best-effort)
    try {
      const { data: s } = await svc.from("sounds").select("usage_count").eq("id", soundId).single();
      if (s) {
        await svc.from("sounds").update({ usage_count: ((s as any).usage_count ?? 0) + 1 }).eq("id", soundId);
      }
    } catch { /* non-critical */ }

    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "[sounds] use error");
    res.status(500).json({ error: "Failed to record sound usage" });
  }
});

export default router;
