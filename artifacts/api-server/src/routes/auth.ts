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
import { createClient } from "@supabase/supabase-js";
import { requireAuth, getAuthedUser, ensureUserRow } from "../lib/replitAuth.js";
import { logger } from "../lib/logger.js";
import { db, schema } from "../lib/db.js";
import { eq } from "drizzle-orm";

const router = Router();

/*
 * Browser password-auth proxy.
 *
 * The frontend normally talks directly to Supabase Auth.  This project is
 * also served from Render, however, and a browser can report a generic
 * "Failed to fetch" even when Supabase has completed the /token request.
 * Keeping email/password auth on the same origin removes that browser CORS
 * boundary while still using the normal Supabase Auth API server-side.
 * The anon/publishable key is safe to use for this operation.
 */
function serverSupabaseClient() {
  const url = (process.env["SUPABASE_URL"] ?? process.env["VITE_SUPABASE_URL"] ?? "").replace(/\/$/, "");
  const key = process.env["SUPABASE_ANON_KEY"] ?? process.env["VITE_SUPABASE_ANON_KEY"] ?? "";
  if (!url || !key) throw new Error("Supabase server configuration is missing");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

router.post("/password-signin", async (req, res) => {
  try {
    const { email, password } = req.body as { email?: string; password?: string };
    if (!email || !password) {
      res.status(400).json({ error: "Email and password are required" });
      return;
    }

    const { data, error } = await serverSupabaseClient().auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error) {
      res.status(error.status ?? 400).json({ error: error.message, code: error.code ?? null });
      return;
    }

    res.json({ user: data.user, session: data.session });
  } catch (err) {
    logger.error({ err }, "[auth] password sign-in proxy failed");
    res.status(500).json({ error: "Authentication service unavailable" });
  }
});

router.post("/password-signup", async (req, res) => {
  try {
    const { email, password, displayName } = req.body as {
      email?: string;
      password?: string;
      displayName?: string;
    };
    if (!email || !password) {
      res.status(400).json({ error: "Email and password are required" });
      return;
    }

    const { data, error } = await serverSupabaseClient().auth.signUp({
      email: email.trim(),
      password,
      options: { data: { full_name: (displayName ?? "").trim() } },
    });

    if (error) {
      res.status(error.status ?? 400).json({ error: error.message, code: error.code ?? null });
      return;
    }

    res.json({ user: data.user, session: data.session });
  } catch (err) {
    logger.error({ err }, "[auth] password sign-up proxy failed");
    res.status(500).json({ error: "Authentication service unavailable" });
  }
});


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
