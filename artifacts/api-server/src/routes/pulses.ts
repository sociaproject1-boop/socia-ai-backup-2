/**
 * routes/pulses.ts — PULSE system (global stories).
 *
 * §1  Feed: grouped by user, sorted unviewed-first
 * §2  User pulses: all active pulses for a specific user
 * §3  Create pulse  ← uses user JWT so RLS auth.uid() works without service-role key
 * §4  Delete pulse (owner or admin)
 * §5  Record view + realtime viewer count
 * §6  Get views (owner only)
 * §7  React to pulse
 * §8  Report pulse
 * §9  Admin: get reported pulses / remove any pulse
 */
import { Router, type IRouter } from "express";
import { createClient } from "@supabase/supabase-js";
import { requireAuth, getAuthedUser } from "../lib/supabaseAuth.js";
import { getIo } from "../lib/ioInstance.js";
import { logger } from "../lib/logger.js";

const SUPABASE_URL     = process.env["VITE_SUPABASE_URL"]        ?? process.env["SUPABASE_URL"]        ?? "";
const SUPABASE_SVC_KEY = process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "";
const SUPABASE_ANON    = process.env["VITE_SUPABASE_ANON_KEY"]   ?? "";
const OWNER_EMAIL      = (process.env["OWNER_EMAIL"] ?? "allanalbacen5@gmail.com").toLowerCase();

/** Service-role client — bypasses RLS. Used for READ-only feed/view queries. */
function db() {
  const key = SUPABASE_SVC_KEY || SUPABASE_ANON;
  return createClient(SUPABASE_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * User-context client — passes the caller's JWT so Supabase RLS sees auth.uid().
 * Used for INSERT / DELETE operations that must satisfy row-level security.
 * Works even when SUPABASE_SERVICE_ROLE_KEY is not set.
 */
function userDb(req: any) {
  const token = ((req.headers["authorization"] as string) ?? "").replace(/^Bearer\s+/i, "");
  return createClient(SUPABASE_URL, SUPABASE_ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

function isAdmin(req: any): boolean {
  try { return (getAuthedUser(req).email ?? "").toLowerCase() === OWNER_EMAIL; } catch { return false; }
}

const router: IRouter = Router();

/* ── §1  Feed ──────────────────────────────────────────────────────────── */

router.get("/pulses/feed", requireAuth, async (req, res) => {
  try {
    const viewerId = getAuthedUser(req).id;
    const svc = db();
    const now = new Date().toISOString();

    const { data: pulses, error } = await svc
      .from("pulses")
      .select("*, user:users!pulses_user_id_fkey(id, name, username, avatar_url)")
      .gt("expires_at", now)
      .neq("visibility", "private")
      .order("created_at", { ascending: false });

    if (error) throw error;

    const pulseIds = (pulses ?? []).map((p: any) => p.id);
    let viewedSet = new Set<string>();
    if (pulseIds.length > 0) {
      const { data: views } = await svc
        .from("pulse_views")
        .select("pulse_id")
        .eq("viewer_id", viewerId)
        .in("pulse_id", pulseIds);
      (views ?? []).forEach((v: any) => viewedSet.add(v.pulse_id));
    }

    const groups = new Map<string, any>();
    for (const pulse of pulses ?? []) {
      const uid = pulse.user_id;
      if (!groups.has(uid)) {
        groups.set(uid, { user: pulse.user, pulses: [], has_unviewed: false });
      }
      const g = groups.get(uid);
      const p = { ...pulse, user: undefined, is_viewed: viewedSet.has(pulse.id) };
      delete p.user;
      g.pulses.push(p);
      if (!p.is_viewed) g.has_unviewed = true;
    }

    const sorted = Array.from(groups.values()).sort((a, b) => {
      if (a.user.id === viewerId) return -1;
      if (b.user.id === viewerId) return 1;
      if (a.has_unviewed && !b.has_unviewed) return -1;
      if (!a.has_unviewed && b.has_unviewed) return 1;
      return 0;
    });

    res.json(sorted);
  } catch (err) {
    logger.error({ err }, "[pulses] feed error");
    res.status(500).json({ error: "Failed to load pulse feed" });
  }
});

/* ── §2  User pulses ───────────────────────────────────────────────────── */

router.get("/pulses/user/:userId", requireAuth, async (req, res) => {
  try {
    const viewerId = getAuthedUser(req).id;
    const { userId } = req.params as { userId: string };
    const svc = db();

    const { data: pulses, error } = await svc
      .from("pulses")
      .select("*")
      .eq("user_id", userId)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: true });

    if (error) throw error;

    const pulseIds = (pulses ?? []).map((p: any) => p.id);
    let viewedSet = new Set<string>();
    if (pulseIds.length > 0) {
      const { data: views } = await svc
        .from("pulse_views")
        .select("pulse_id")
        .eq("viewer_id", viewerId)
        .in("pulse_id", pulseIds);
      (views ?? []).forEach((v: any) => viewedSet.add(v.pulse_id));
    }

    res.json((pulses ?? []).map((p: any) => ({ ...p, is_viewed: viewedSet.has(p.id) })));
  } catch (err) {
    logger.error({ err }, "[pulses] user pulses error");
    res.status(500).json({ error: "Failed to load user pulses" });
  }
});

/* ── §3  Create ────────────────────────────────────────────────────────── */
/*
 * Uses userDb() (anon key + caller JWT) so that Supabase RLS evaluates
 * auth.uid() correctly.  This works WITHOUT SUPABASE_SERVICE_ROLE_KEY.
 */
router.post("/pulses", requireAuth, async (req, res) => {
  try {
    const { id: userId } = getAuthedUser(req);
    const {
      type, media_url, text_content, text_bg, text_color,
      music_url, music_name, visibility,
    } = req.body as Record<string, string>;

    if (!type || !["image", "video", "text"].includes(type)) {
      res.status(400).json({ error: "Invalid pulse type" });
      return;
    }
    if (type !== "text" && !media_url) {
      res.status(400).json({ error: "media_url required for image/video pulses" });
      return;
    }
    if (type === "text" && !text_content?.trim()) {
      res.status(400).json({ error: "text_content required for text pulses" });
      return;
    }

    // Use user-context client so RLS "Owner full access" WITH CHECK passes
    const udb = userDb(req);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const { data, error } = await udb
      .from("pulses")
      .insert({
        user_id:      userId,
        type,
        media_url:    media_url    ?? null,
        text_content: text_content ?? null,
        text_bg:      text_bg      ?? "#0f0f23",
        text_color:   text_color   ?? "#ffffff",
        music_url:    music_url    ?? null,
        music_name:   music_name   ?? null,
        visibility:   visibility   ?? "public",
        expires_at:   expiresAt,
      })
      .select()
      .single();

    if (error) {
      logger.error({ err: error, userId, type, code: error.code }, "[pulses] create DB error");
      // Provide actionable error messages to the client
      const code = (error as any).code as string | undefined;
      if (code === "42P01") {
        res.status(500).json({ error: "Pulse tables not yet created — run migration 52 in Supabase SQL editor." });
      } else if (code === "42501" || error.message?.includes("row-level security")) {
        res.status(403).json({ error: "Permission denied. Please sign out and back in." });
      } else {
        res.status(500).json({ error: error.message ?? "Failed to create pulse" });
      }
      return;
    }

    getIo()?.emit("pulse:new", { userId, pulseId: data.id });
    logger.info({ userId, type }, "[pulses] created");
    res.status(201).json(data);
  } catch (err) {
    logger.error({ err }, "[pulses] create error");
    res.status(500).json({ error: "Failed to create pulse" });
  }
});

/* ── §4  Delete ────────────────────────────────────────────────────────── */

router.delete("/pulses/:id", requireAuth, async (req, res) => {
  try {
    const { id: userId } = getAuthedUser(req);
    const { id } = req.params as { id: string };

    // Use userDb for delete so RLS owner check applies (or service role for admin)
    const client = isAdmin(req) ? db() : userDb(req);
    const q = client.from("pulses").delete().eq("id", id);
    const { error } = await (isAdmin(req) ? q : q.eq("user_id", userId));

    if (error) throw error;

    getIo()?.emit("pulse:deleted", { pulseId: id, userId });
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "[pulses] delete error");
    res.status(500).json({ error: "Failed to delete pulse" });
  }
});

/* ── §5  Record view ───────────────────────────────────────────────────── */

router.post("/pulses/:id/view", requireAuth, async (req, res) => {
  try {
    const { id: viewerId } = getAuthedUser(req);
    const { id: pulseId } = req.params as { id: string };

    // Use user JWT so "Insert own views" WITH CHECK passes
    const udb = userDb(req);
    await udb
      .from("pulse_views")
      .upsert({ pulse_id: pulseId, viewer_id: viewerId }, { onConflict: "pulse_id,viewer_id" });

    const { count } = await db()
      .from("pulse_views")
      .select("*", { count: "exact", head: true })
      .eq("pulse_id", pulseId);

    getIo()?.emit("pulse:viewed", { pulseId, viewerId, viewCount: count ?? 0 });
    res.json({ ok: true, view_count: count ?? 0 });
  } catch (err) {
    logger.error({ err }, "[pulses] view error");
    res.status(500).json({ error: "Failed to record view" });
  }
});

/* ── §6  Get views (owner only) ────────────────────────────────────────── */

router.get("/pulses/:id/views", requireAuth, async (req, res) => {
  try {
    const { id: userId } = getAuthedUser(req);
    const { id: pulseId } = req.params as { id: string };
    const svc = db();

    const { data: pulse } = await svc.from("pulses").select("user_id").eq("id", pulseId).single();
    if (!pulse || (pulse.user_id !== userId && !isAdmin(req))) {
      res.status(403).json({ error: "Not authorized" });
      return;
    }

    const { data, count } = await svc
      .from("pulse_views")
      .select("*, viewer:users!pulse_views_viewer_id_fkey(id, name, username, avatar_url)", { count: "exact" })
      .eq("pulse_id", pulseId)
      .order("viewed_at", { ascending: false })
      .limit(50);

    res.json({ views: data ?? [], count: count ?? 0 });
  } catch (err) {
    logger.error({ err }, "[pulses] views list error");
    res.status(500).json({ error: "Failed to get views" });
  }
});

/* ── §7  React ─────────────────────────────────────────────────────────── */

router.post("/pulses/:id/react", requireAuth, async (req, res) => {
  try {
    const { id: userId } = getAuthedUser(req);
    const { id: pulseId } = req.params as { id: string };
    const { emoji } = req.body as { emoji?: string };

    if (!emoji || typeof emoji !== "string" || emoji.length > 8) {
      res.status(400).json({ error: "Invalid emoji" });
      return;
    }

    const udb = userDb(req);
    const { data, error } = await udb
      .from("pulse_reactions")
      .upsert({ pulse_id: pulseId, user_id: userId, emoji }, { onConflict: "pulse_id,user_id" })
      .select()
      .single();

    if (error) throw error;

    getIo()?.emit("pulse:reaction", { pulseId, userId, emoji });
    res.json(data);
  } catch (err) {
    logger.error({ err }, "[pulses] react error");
    res.status(500).json({ error: "Failed to react" });
  }
});

/* ── §8  Report ────────────────────────────────────────────────────────── */

router.post("/pulses/:id/report", requireAuth, async (req, res) => {
  try {
    const { id: reporterId } = getAuthedUser(req);
    const { id: pulseId } = req.params as { id: string };
    const { reason } = req.body as { reason?: string };

    const udb = userDb(req);
    await udb
      .from("pulse_reports")
      .upsert(
        { pulse_id: pulseId, reporter_id: reporterId, reason: reason ?? "Inappropriate content" },
        { onConflict: "pulse_id,reporter_id" },
      );

    await db()
      .from("pulses")
      .update({ is_reported: true })
      .eq("id", pulseId);

    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "[pulses] report error");
    res.status(500).json({ error: "Failed to report" });
  }
});

/* ── §9  Admin ─────────────────────────────────────────────────────────── */

router.get("/pulses/admin/reported", requireAuth, async (req, res) => {
  if (!isAdmin(req)) { res.status(403).json({ error: "Forbidden" }); return; }
  try {
    const svc = db();
    const { data, error } = await svc
      .from("pulses")
      .select("*, user:users!pulses_user_id_fkey(id, name, username, avatar_url)")
      .eq("is_reported", true)
      .order("created_at", { ascending: false });

    if (error) throw error;
    res.json(data ?? []);
  } catch (err) {
    logger.error({ err }, "[pulses] admin reported error");
    res.status(500).json({ error: "Failed to get reported pulses" });
  }
});

router.delete("/pulses/admin/:id", requireAuth, async (req, res) => {
  if (!isAdmin(req)) { res.status(403).json({ error: "Forbidden" }); return; }
  try {
    const svc = db();
    const { id } = req.params as { id: string };
    const { error } = await svc.from("pulses").delete().eq("id", id);
    if (error) throw error;
    getIo()?.emit("pulse:deleted", { pulseId: id, adminAction: true });
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "[pulses] admin delete error");
    res.status(500).json({ error: "Failed to delete pulse" });
  }
});

export default router;
