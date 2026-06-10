/**
 * Auth routes — Supabase Auth integration.
 *
 * Authentication is handled natively by the Supabase JS client on the frontend.
 * The backend validates Supabase JWTs via the requireAuth middleware.
 *
 * Routes:
 *   GET  /api/auth/session   — return current user from validated JWT
 *   GET  /api/auth/user      — return full profile from public.users
 *   POST /api/auth/callback  — called after OAuth to ensure profile row exists
 *   POST /api/auth/logout    — clear any legacy cookies (Supabase handles actual sign-out)
 */
import { Router } from "express";
import { requireAuth, getAuthedUser, ensureUserRow } from "../lib/replitAuth.js";
import { logger } from "../lib/logger.js";
import { db, schema } from "../lib/db.js";
import { eq } from "drizzle-orm";

const router = Router();

/** GET /api/auth/session — return current user session from validated JWT */
router.get("/session", requireAuth, (req, res) => {
  const user = getAuthedUser(req);
  res.json({
    user: { id: user.id, email: user.email ?? null, name: user.name ?? null },
    access_token: user.jwt,
  });
});

/** GET /api/auth/user — return full profile from public.users */
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

/**
 * POST /api/auth/callback — called by the frontend after OAuth sign-in
 * to ensure a profile row exists in public.users for the authenticated user.
 * The Supabase JWT is verified by requireAuth; this route just seeds the row.
 */
router.post("/callback", requireAuth, async (req, res) => {
  try {
    const user = getAuthedUser(req);
    const { name, avatar_url } = req.body as { name?: string; avatar_url?: string };
    await ensureUserRow(user.id, {
      email:     user.email,
      name:      name ?? user.name ?? undefined,
      avatarUrl: avatar_url,
    });
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "[auth] /callback failed");
    res.status(500).json({ error: "Internal server error" });
  }
});

/** POST /api/auth/logout — clear any legacy session cookies */
router.post("/logout", (_req, res) => {
  res.clearCookie("socia_session");
  res.json({ ok: true });
});

/**
 * GET /api/auth/login — placeholder for OAuth entry point.
 * With native Supabase Auth, OAuth is initiated client-side via
 * supabase.auth.signInWithOAuth(). This route exists for legacy redirects.
 */
router.get("/login", (_req, res) => {
  res.status(410).json({
    error: "Direct OAuth login via this endpoint is no longer supported.",
    message: "Use the Supabase Auth client (signInWithOAuth) from the frontend.",
  });
});

export default router;
