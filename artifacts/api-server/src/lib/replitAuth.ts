/**
 * replitAuth.ts — Auth middleware for api-server.
 *
 * Verifies Supabase Auth JWTs (primary) with a fallback to legacy
 * SESSION_SECRET-signed JWTs for backward compatibility.
 *
 * Priority:
 *   1. Authorization: Bearer <supabase_access_token>  (Supabase Auth — new)
 *   2. socia_session cookie with a Supabase JWT        (Supabase Auth via cookie)
 *   3. socia_session cookie with a legacy JWT          (old custom auth — fallback)
 *
 * After verification, attaches to req:
 *   req.authedUser — { id, email, name, jwt }
 *   req.supabase   — SupabaseClient scoped to the user's JWT (RLS applies)
 *
 * NOTE: The ws WebSocket polyfill must be installed on globalThis BEFORE the
 * first Supabase client is created. index.ts does this at process start-up.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Request, RequestHandler } from "express";
import jwt from "jsonwebtoken";
import { logger } from "./logger.js";
import { db, schema } from "./db.js";
import { eq } from "drizzle-orm";
import { verifySupabaseToken, isSupabaseAdminReady } from "./supabaseAdmin.js";

/* ── Supabase env (backend uses server-side keys) ─────────────────────── */
const SUPABASE_URL  = (process.env["SUPABASE_URL"] ?? "").replace(/\/$/, "");
const SUPABASE_ANON = process.env["SUPABASE_ANON_KEY"] ?? process.env["VITE_SUPABASE_ANON_KEY"] ?? "";

/** Create a Supabase client scoped to the user's JWT so RLS applies. */
function clientForJwt(userJwt: string): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_ANON, {
    global: { headers: { Authorization: `Bearer ${userJwt}` } },
    auth:   { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

/* ── Session secret (legacy JWT) ─────────────────────────────────────── */
const SESSION_SECRET    = process.env["SESSION_SECRET"] ?? "dev-only-insecure-secret";
const SESSION_TTL_HOURS = 24 * 7;

export interface AuthedUser {
  id:    string;
  email: string | null;
  name?: string | null;
  jwt:   string;
}

/* ── Legacy SESSION_SECRET token helpers ────────────────────────────── */
export function signSessionToken(
  userOrId: string | { id: string; email?: string | null; name?: string | null },
  emailArg?: string | null,
): string {
  const userId = typeof userOrId === "string" ? userOrId : userOrId.id;
  const email  = typeof userOrId === "string" ? (emailArg ?? null) : (userOrId.email ?? null);
  const name   = typeof userOrId === "string" ? null : (userOrId.name ?? null);
  return jwt.sign({ sub: userId, email, name }, SESSION_SECRET, {
    expiresIn: `${SESSION_TTL_HOURS}h`,
  });
}

export interface SessionClaims {
  sub:   string;
  email: string | null;
  name?: string | null;
  iat:   number;
  exp:   number;
}

export function verifySessionToken(token: string): SessionClaims | null {
  try {
    const decoded = jwt.verify(token, SESSION_SECRET);
    if (typeof decoded === "string") return null;
    return decoded as SessionClaims;
  } catch {
    return null;
  }
}

/* ── Convenience accessors ──────────────────────────────────────────── */
export function getAuthedUser(req: Request): AuthedUser {
  const u = (req as Request & { authedUser?: AuthedUser }).authedUser;
  if (!u) throw new Error("requireAuth middleware did not run before this handler");
  return u;
}

export function getRequestSupabase(req: Request): SupabaseClient {
  const sb = (req as Request & { supabase?: SupabaseClient }).supabase;
  if (!sb) throw new Error("requireAuth middleware did not run before this handler");
  return sb;
}

export function getDb() {
  return db;
}

/* ── In-memory token verification cache ─────────────────────────────── *
 * Avoids one Supabase REST round-trip per request for the same token.
 * Cache TTL is 5 minutes (tokens expire in ~1 hour — safe to cache).  */
interface CachedUser {
  user: AuthedUser;
  exp:  number;
}
const _tokenCache = new Map<string, CachedUser>();
const CACHE_TTL_MS = 5 * 60 * 1000;

function getCachedUser(token: string): AuthedUser | null {
  const cached = _tokenCache.get(token);
  if (!cached) return null;
  if (Date.now() > cached.exp) { _tokenCache.delete(token); return null; }
  return cached.user;
}

function setCachedUser(token: string, user: AuthedUser): void {
  if (_tokenCache.size > 2000) {
    const firstKey = _tokenCache.keys().next().value;
    if (firstKey) _tokenCache.delete(firstKey);
  }
  _tokenCache.set(token, { user, exp: Date.now() + CACHE_TTL_MS });
}

/* ── Auth middleware ─────────────────────────────────────────────────── */
function attachUser(req: Request, user: AuthedUser): void {
  const d = req as Request & { authedUser?: AuthedUser; supabase?: SupabaseClient };
  d.authedUser = user;
  d.supabase   = clientForJwt(user.jwt);
}

export const requireAuth: RequestHandler = async (req, res, next) => {
  const header      = req.header("authorization") ?? req.header("Authorization") ?? "";
  const headerMatch = /^Bearer\s+(.+)$/i.exec(header.trim());
  const cookieReq   = req as Request & { cookies?: Record<string, string> };
  const token       = headerMatch?.[1]?.trim() ?? cookieReq.cookies?.["socia_session"] ?? "";

  if (!token) {
    res.status(401).json({ error: "Not authenticated", code: "UNAUTHENTICATED" });
    return;
  }

  /* ── 1. Check in-memory cache ────────────────────────────────────── */
  const cached = getCachedUser(token);
  if (cached) {
    attachUser(req, cached);
    next();
    return;
  }

  /* ── 2. Verify as Supabase JWT via REST API ──────────────────────── */
  if (isSupabaseAdminReady) {
    try {
      const sbUser = await verifySupabaseToken(token);
      if (sbUser) {
        const authedUser: AuthedUser = {
          id:    sbUser.id,
          email: sbUser.email ?? null,
          name:  (sbUser.user_metadata?.["full_name"] ?? sbUser.user_metadata?.["name"] ?? null) as string | null,
          jwt:   token,
        };
        setCachedUser(token, authedUser);
        attachUser(req, authedUser);
        next();
        return;
      }
    } catch (err) {
      logger.debug({ err: (err as Error).message }, "[requireAuth] Supabase verification failed — trying legacy JWT");
    }
  }

  /* ── 3. Fall back to legacy SESSION_SECRET JWT ────────────────────── */
  const claims = verifySessionToken(token);
  if (claims) {
    const authedUser: AuthedUser = {
      id:    claims.sub,
      email: claims.email,
      name:  claims.name ?? null,
      jwt:   token,
    };
    setCachedUser(token, authedUser);
    attachUser(req, authedUser);
    next();
    return;
  }

  res.status(401).json({ error: "Invalid or expired session", code: "UNAUTHENTICATED" });
};

/* ── Quota helpers (API compatibility) ───────────────────────────────── */
export interface QuotaResult {
  allowed:   boolean;
  plan:      "free" | "active" | "owner";
  remaining: number;
  limit:     number;
  kind:      "image" | "video";
}

export async function consumeGenerationQuota(
  sb: SupabaseClient | null,
  kind: "image" | "video",
): Promise<QuotaResult> {
  try {
    if (!sb) throw new Error("No Supabase client — quota check skipped");
    const { data, error } = await sb.rpc("consume_generation_quota", { p_kind: kind });
    if (error) throw new Error(error.message);
    const r = data as Partial<QuotaResult> | null;
    if (r && typeof r.allowed === "boolean") {
      return {
        allowed:   r.allowed,
        plan:      (r.plan ?? "free") as QuotaResult["plan"],
        remaining: typeof r.remaining === "number" ? r.remaining : 0,
        limit:     typeof r.limit     === "number" ? r.limit     : 0,
        kind,
      };
    }
  } catch (err) {
    logger.warn({ err: (err as Error).message, kind }, "[consumeGenerationQuota] RPC failed — allowing (free tier)");
  }
  return { allowed: true, plan: "free", remaining: 5, limit: 5, kind };
}

/* ── User DB helpers ──────────────────────────────────────────────────── */

/**
 * Ensures a profile row exists in public.users for the given auth user ID.
 * Called after OAuth sign-in or sign-up to seed the profile if missing.
 * Does NOT store passwords — authentication is handled entirely by Supabase Auth.
 */
export async function ensureUserRow(userId: string, fields: {
  email?: string | null;
  name?: string;
  username?: string;
  avatarUrl?: string;
}): Promise<void> {
  try {
    const existing = await db.select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1);

    if (existing.length === 0) {
      const email    = fields.email ?? "";
      const name     = fields.name ?? email.split("@")[0] ?? "Socia User";
      const username = fields.username ?? email.split("@")[0] ?? userId.slice(0, 8);
      await db.insert(schema.users).values({
        id:        userId,
        email,
        name,
        username,
        avatarUrl: fields.avatarUrl,
      }).onConflictDoNothing();
      logger.info({ userId, email }, "[ensureUserRow] Created profile row for new Supabase Auth user");
    }
  } catch (err) {
    logger.warn({ err: (err as Error).message, userId }, "[ensureUserRow] Failed to ensure profile row");
  }
}
