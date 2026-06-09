/**
 * Presence routes — online status + owner badge.
 */
import { Router } from "express";
import { requireAuth, getAuthedUser } from "../lib/replitAuth.js";
import { db, schema } from "../lib/db.js";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger.js";

const router = Router();

/** POST /api/presence */
router.post("/", requireAuth, async (req, res) => {
  const user = getAuthedUser(req);
  const { online } = req.body as { online?: boolean };
  try {
    await db
      .update(schema.users)
      .set({ isOnline: Boolean(online), updatedAt: new Date() })
      .where(eq(schema.users.id, user.id));
    res.json({ ok: true });
  } catch (err) {
    logger.warn({ err }, "[presence] update failed");
    res.json({ ok: false });
  }
});

/** GET /api/users/search — search users by name/username */
router.get("/users/search", async (req, res) => {
  const q = (req.query.q as string ?? "").trim();
  const limit = Math.min(Number(req.query.limit ?? 20), 50);
  if (!q) { res.json([]); return; }
  try {
    const { createDbClient } = await import("../lib/dbCompat.js");
    const db = createDbClient();
    const result = await db
      .from("users")
      .select("id, name, username, avatar_url")
      .or(`username.ilike.%${q}%,name.ilike.%${q}%`)
      .limit(limit);
    res.json((result as any).data ?? []);
  } catch (err) {
    logger.warn({ err }, "[presence] search failed");
    res.json([]);
  }
});

/** GET /api/users/:id — get user profile */
router.get("/users/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const rows = await db.select().from(schema.users).where(eq(schema.users.id, id!)).limit(1);
    if (!rows.length) { res.status(404).json({ error: "User not found" }); return; }
    res.json(rows[0]);
  } catch (err) {
    logger.warn({ err }, "[presence] user fetch failed");
    res.status(500).json({ error: "Internal server error" });
  }
});

/** PATCH /api/users/:id — update user profile */
router.patch("/users/:id", requireAuth, async (req, res) => {
  const user = getAuthedUser(req);
  const { id } = req.params;
  if (user.id !== id) { res.status(403).json({ error: "Forbidden" }); return; }
  const allowed = [
    "name", "username", "bio", "website", "location", "gender", "birthday",
    "relationship_status", "work", "work_previous", "education", "school", "college",
    "social_facebook", "social_instagram", "social_tiktok", "social_x", "social_youtube",
    "social_linkedin", "public_email", "public_phone", "privacy_settings",
    "avatar_url", "cover_photo_url",
  ];
  const fields: Record<string, unknown> = {};
  for (const k of allowed) {
    if (k in req.body) fields[k as keyof typeof fields] = (req.body as Record<string, unknown>)[k];
  }
  try {
    await db.update(schema.users).set({ ...fields as any, updatedAt: new Date() }).where(eq(schema.users.id, id!));
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "[presence] user update failed");
    res.status(500).json({ error: "Internal server error" });
  }
});

/** POST /api/owner/claim — claim owner badge */
router.post("/owner/claim", requireAuth, async (req, res) => {
  const user = getAuthedUser(req);
  try {
    const existing = await db.select({ isOwner: schema.users.isOwner }).from(schema.users).where(eq(schema.users.id, user.id)).limit(1);
    if (existing[0]?.isOwner) { res.json({ claimed: true }); return; }
    const others = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.isOwner, true)).limit(1);
    if (others.length) { res.json({ claimed: false, reason: "Owner badge already taken" }); return; }
    await db.update(schema.users).set({ isOwner: true, updatedAt: new Date() }).where(eq(schema.users.id, user.id));
    res.json({ claimed: true });
  } catch (err) {
    logger.error({ err }, "[owner] claim failed");
    res.status(500).json({ error: "Internal server error" });
  }
});

/** POST /api/rpc/:fn — RPC stub */
router.post("/rpc/:fn", requireAuth, async (req, res) => {
  const { fn } = req.params;
  const user = getAuthedUser(req);
  logger.info({ fn, userId: user.id }, "[rpc] called");

  if (fn === "set_online") {
    const { p_online } = req.body as { p_online?: boolean };
    await db.update(schema.users).set({ isOnline: Boolean(p_online), updatedAt: new Date() }).where(eq(schema.users.id, user.id)).catch(() => {});
    res.json({ data: null, error: null });
    return;
  }

  if (fn === "claim_owner_badge") {
    const existing = await db.select({ isOwner: schema.users.isOwner }).from(schema.users).where(eq(schema.users.id, user.id)).limit(1).catch(() => []);
    if (existing[0]?.isOwner) { res.json({ data: true, error: null }); return; }
    const others = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.isOwner, true)).limit(1).catch(() => []);
    if (others.length) { res.json({ data: false, error: null }); return; }
    await db.update(schema.users).set({ isOwner: true, updatedAt: new Date() }).where(eq(schema.users.id, user.id)).catch(() => {});
    res.json({ data: true, error: null });
    return;
  }

  res.json({ data: null, error: null });
});

export default router;
