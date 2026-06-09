/**
 * Auth routes — Replit Auth integration.
 * Provides session endpoint, signin/signup, and logout.
 */
import { Router } from "express";
import { requireAuth, getAuthedUser, signSessionToken, ensureUserRow } from "../lib/replitAuth.js";
import { logger } from "../lib/logger.js";
import { db, schema } from "../lib/db.js";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";

const router = Router();

/** GET /api/auth/session — return current user session */
router.get("/session", async (req, res) => {
  try {
    const user = getAuthedUser(req);
    res.json({
      user: { id: user.id, email: user.email ?? null, name: user.name ?? null },
      access_token: req.cookies?.["socia_session"] ?? "",
    });
  } catch {
    res.status(401).json({ user: null, access_token: null });
  }
});

/** GET /api/auth/user — return current user profile */
router.get("/user", requireAuth, async (req, res) => {
  try {
    const user = getAuthedUser(req);
    const rows = await db.select().from(schema.users).where(eq(schema.users.id, user.id)).limit(1);
    if (!rows.length) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    res.json(rows[0]);
  } catch (err) {
    logger.error({ err }, "[auth] /user failed");
    res.status(500).json({ error: "Internal server error" });
  }
});

/** POST /api/auth/signin — email/password sign-in */
router.post("/signin", async (req, res) => {
  const { email, password } = req.body as { email?: string; password?: string };
  if (!email || !password) {
    res.status(400).json({ error: "Email and password are required" });
    return;
  }
  try {
    const rows = await db
      .select({ id: schema.users.id, email: schema.users.email, name: schema.users.name, passwordHash: schema.users.passwordHash })
      .from(schema.users)
      .where(eq(schema.users.email, email.trim().toLowerCase()))
      .limit(1);

    if (!rows.length) {
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }
    const user = rows[0]!;
    if (!user.passwordHash) {
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }

    const token = signSessionToken({ id: user.id, email: user.email, name: user.name ?? "" });
    res.cookie("socia_session", token, {
      httpOnly: true, secure: true, sameSite: "lax", maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    res.json({ user: { id: user.id, email: user.email, name: user.name }, access_token: token });
  } catch (err) {
    logger.error({ err }, "[auth] signin failed");
    res.status(500).json({ error: "Internal server error" });
  }
});

/** POST /api/auth/signup — email/password sign-up */
router.post("/signup", async (req, res) => {
  const { email, password, display_name, name } = req.body as { email?: string; password?: string; display_name?: string; name?: string };
  if (!email || !password) {
    res.status(400).json({ error: "Email and password are required" });
    return;
  }
  try {
    const existing = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.email, email.trim().toLowerCase()))
      .limit(1);
    if (existing.length) {
      res.status(400).json({ error: "An account with this email already exists" });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const userId = randomUUID();
    const displayName = (display_name || name || email.split("@")[0] || "Socia User").slice(0, 50);
    const username = displayName.toLowerCase().replace(/[^a-z0-9_]/g, "_").slice(0, 30) + "_" + userId.slice(0, 6);

    await db.insert(schema.users).values({
      id:           userId,
      email:        email.trim().toLowerCase(),
      name:         displayName,
      username,
      passwordHash,
    });

    const token = signSessionToken({ id: userId, email: email.trim().toLowerCase(), name: displayName });
    res.cookie("socia_session", token, {
      httpOnly: true, secure: true, sameSite: "lax", maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    res.json({ user: { id: userId, email: email.trim().toLowerCase(), name: displayName }, access_token: token });
  } catch (err) {
    logger.error({ err }, "[auth] signup failed");
    res.status(500).json({ error: "Internal server error" });
  }
});

/** GET /api/auth/login — redirect to Replit OAuth (for OAuth flow) */
router.get("/login", (_req, res) => {
  res.redirect("/api/auth/replit/start");
});

/** POST /api/auth/logout */
router.post("/logout", (_req, res) => {
  res.clearCookie("socia_session");
  res.json({ ok: true });
});

export default router;
