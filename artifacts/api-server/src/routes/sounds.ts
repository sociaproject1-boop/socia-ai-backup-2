/**
 * routes/sounds.ts — Socia Sound Ecosystem
 *
 * §1  List / search sounds
 * §2  Get single sound
 * §3  Get posts using a sound
 * §4  Create a sound
 * §5  Increment usage (called when associating sound with a post)
 * §6  Trending sounds
 *
 * NOTE: The sounds table has two possible schemas:
 *   OLD (pre-migration 54): id, title, url, artist, genre, created_at
 *   NEW (post-migration 54): id, title, audio_url, cover_image, creator_id,
 *                             source_type, duration_seconds, usage_count, is_active, created_at
 * This route normalises the response so the frontend always sees { audio_url, ... }
 * regardless of which schema version is running.
 */
import { Router, type IRouter } from "express";
import { createClient } from "../lib/dbCompat.js";
import { requireAuth, getAuthedUser } from "../lib/replitAuth.js";
import { logger } from "../lib/logger.js";

function db() {
  const url = process.env["VITE_SUPABASE_URL"] ?? process.env["SUPABASE_URL"] ?? "";
  const key = process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? process.env["SUPABASE_ANON_KEY"] ?? "";
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function userDb(req: any) {
  const token = ((req.headers["authorization"] as string) ?? "").replace(/^Bearer\s+/i, "");
  const url  = process.env["VITE_SUPABASE_URL"]      ?? process.env["SUPABASE_URL"]      ?? "";
  const anon = process.env["SUPABASE_ANON_KEY"] ?? process.env["VITE_SUPABASE_ANON_KEY"] ?? "";
  return createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

/**
 * Detects which schema version is active by probing for `audio_url`.
 * Cached after first call to avoid repeated probes.
 */
let _schemaVersion: "new" | "old" | null = null;
let _creatorJoinWorks: boolean | null = null;

async function getSchemaVersion(): Promise<"new" | "old"> {
  if (_schemaVersion) return _schemaVersion;
  const svc = db();
  const { error } = await svc.from("sounds").select("audio_url").limit(0);
  _schemaVersion = error ? "old" : "new";
  return _schemaVersion;
}

/** Check once whether a join to users works (FK may not exist). */
async function canJoinCreator(): Promise<boolean> {
  if (_creatorJoinWorks !== null) return _creatorJoinWorks;
  const svc = db();
  // Try plain join without FK hint — PostgREST auto-detects if FK exists
  const { error } = await svc
    .from("sounds")
    .select("id, creator:users(id)")
    .limit(0);
  _creatorJoinWorks = !error;
  return _creatorJoinWorks;
}

/** Build the correct SELECT string for the detected schema. */
async function soundSelect(): Promise<string> {
  const v = await getSchemaVersion();
  if (v === "new") {
    const joinOk = await canJoinCreator();
    const creatorSel = joinOk
      ? `, creator:users(id, name, username, avatar_url)`
      : ``;
    return `id, title, audio_url, cover_image, source_type, duration_seconds, usage_count, is_active, created_at, creator_id${creatorSel}`;
  }
  return `id, title, url, artist, genre, created_at`;
}

/** Normalise a raw sounds row to always expose { audio_url, cover_image, usage_count, ... } */
function normaliseSound(row: any): any {
  if (!row) return row;
  return {
    id:               row.id,
    title:            row.title,
    audio_url:        row.audio_url ?? row.url ?? null,
    cover_image:      row.cover_image ?? null,
    usage_count:      row.usage_count ?? 0,
    duration_seconds: row.duration_seconds ?? null,
    source_type:      row.source_type ?? "original",
    creator_id:       row.creator_id ?? null,
    creator:          row.creator ?? (row.artist ? { name: row.artist } : null),
    created_at:       row.created_at,
  };
}

const router: IRouter = Router();

/* ── §1  List / search ─────────────────────────────────────────────────── */

router.get("/sounds", async (req, res) => {
  try {
    const svc    = db();
    const q      = (req.query["q"] as string | undefined)?.trim();
    const limit  = Math.min(Number(req.query["limit"] ?? 30), 100);
    const offset = Number(req.query["offset"] ?? 0);
    const sel    = await soundSelect();
    const v      = await getSchemaVersion();

    let query = svc
      .from("sounds")
      .select(sel)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (v === "new") {
      query = (query as any).eq("is_active", true).order("usage_count", { ascending: false });
    }

    if (q) {
      query = query.ilike("title", `%${q}%`);
    }

    const { data, error } = await query;
    if (error) throw error;

    res.json({ sounds: (data ?? []).map(normaliseSound) });
  } catch (err) {
    logger.error({ err }, "[sounds] list error");
    res.status(500).json({ error: "Failed to load sounds" });
  }
});

/* ── §6  Trending (by usage_count) ────────────────────────────────────── */

router.get("/sounds/trending", async (_req, res) => {
  try {
    const svc = db();
    const sel = await soundSelect();
    const v   = await getSchemaVersion();

    let query = svc
      .from("sounds")
      .select(sel)
      .order("created_at", { ascending: false })
      .limit(20);

    if (v === "new") {
      query = (query as any).eq("is_active", true).order("usage_count", { ascending: false });
    }

    const { data, error } = await query;
    if (error) throw error;
    res.json({ sounds: (data ?? []).map(normaliseSound) });
  } catch (err) {
    logger.error({ err }, "[sounds] trending error");
    res.status(500).json({ error: "Failed to load trending sounds" });
  }
});

/* ── §2  Get single sound ──────────────────────────────────────────────── */

router.get("/sounds/:id", async (req, res) => {
  try {
    const { id } = req.params as { id: string };
    const sel    = await soundSelect();

    const { data, error } = await db()
      .from("sounds")
      .select(sel)
      .eq("id", id)
      .single();

    if (error || !data) {
      res.status(404).json({ error: "Sound not found" });
      return;
    }

    res.json(normaliseSound(data));
  } catch (err) {
    logger.error({ err }, "[sounds] get error");
    res.status(500).json({ error: "Failed to get sound" });
  }
});

/* ── §3  Posts using a sound ───────────────────────────────────────────── */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

router.get("/sounds/:id/videos", async (req, res) => {
  try {
    const { id } = req.params as { id: string };
    if (!UUID_RE.test(id)) {
      res.json({ posts: [], has_more: false });
      return;
    }
    const limit  = Math.min(Number(req.query["limit"] ?? 30), 60);
    const offset = Number(req.query["offset"] ?? 0);

    const { data, error } = await db()
      .from("sound_usage")
      .select(`
        post_id,
        post:posts(
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

router.post("/sounds", requireAuth, async (req, res) => {
  try {
    const { id: userId } = getAuthedUser(req);
    const { title, cover_image, audio_url, source_type, duration_seconds, artist, genre } =
      req.body as Record<string, any>;

    const audioValue = audio_url?.trim() ?? null;
    if (!title?.trim() || !audioValue) {
      res.status(400).json({ error: "title and audio_url are required" });
      return;
    }

    const udb = userDb(req);
    const v   = await getSchemaVersion();

    let insertData: Record<string, any>;
    if (v === "new") {
      insertData = {
        title:            title.trim(),
        cover_image:      cover_image      ?? null,
        audio_url:        audioValue,
        creator_id:       userId,
        source_type:      source_type      ?? "user_upload",
        duration_seconds: duration_seconds ?? null,
      };
    } else {
      insertData = {
        title:  title.trim(),
        url:    audioValue,
        artist: artist ?? null,
        genre:  genre  ?? null,
      };
    }

    const sel = await soundSelect();
    const { data, error } = await udb
      .from("sounds")
      .insert(insertData)
      .select(sel)
      .single();

    if (error) {
      logger.error({ err: error, userId }, "[sounds] create DB error");
      res.status(500).json({ error: error.message ?? "Failed to create sound" });
      return;
    }

    logger.info({ soundId: (data as any).id, userId }, "[sounds] created");
    res.status(201).json(normaliseSound(data));
  } catch (err) {
    logger.error({ err }, "[sounds] create error");
    res.status(500).json({ error: "Failed to create sound" });
  }
});

/* ── §5  Record usage (post → sound association) ───────────────────────── */

router.post("/sounds/:id/use", requireAuth, async (req, res) => {
  try {
    const { id: soundId } = req.params as { id: string };
    const { id: userId }  = getAuthedUser(req);
    const { post_id }     = req.body as { post_id?: string };

    if (!post_id) {
      res.status(400).json({ error: "post_id is required" });
      return;
    }

    const svc = db();
    const v   = await getSchemaVersion();

    const usageRow: Record<string, any> = { sound_id: soundId, post_id };
    if (v === "new") {
      usageRow["user_id"] = userId;
    }

    const { error: usageErr } = await svc
      .from("sound_usage")
      .upsert(usageRow, { onConflict: "sound_id,post_id" });

    if (usageErr) throw usageErr;

    if (v === "new") {
      try {
        const { data: s } = await svc.from("sounds").select("usage_count").eq("id", soundId).single();
        if (s) {
          await svc.from("sounds")
            .update({ usage_count: ((s as any).usage_count ?? 0) + 1 })
            .eq("id", soundId);
        }
      } catch { /* non-critical */ }
    }

    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "[sounds] use error");
    res.status(500).json({ error: "Failed to record sound usage" });
  }
});

export default router;
