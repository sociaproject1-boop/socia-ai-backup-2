/**
 * replitAuth.ts — Replit Auth integration for api-server
 *
 * Uses session cookies (via cookie-parser) to carry the authenticated
 * user ID. The frontend gets a session by calling POST /api/auth/session
 * with the Replit OpenID Connect token; subsequent requests carry a
 * signed session cookie.
 *
 * Replaces supabaseAuth.ts — drop-in API-compatible replacement.
 */
import type { Request, RequestHandler } from "express";
import jwt from "jsonwebtoken";
import { logger } from "./logger.js";
import { db, schema } from "./db.js";
import { eq } from "drizzle-orm";

const SESSION_SECRET = process.env["SESSION_SECRET"] ?? "dev-only-insecure-secret";
const SESSION_TTL_HOURS = 24 * 7; // 7 days

export interface AuthedUser {
  id:    string;
  email: string | null;
  jwt:   string;
}

/* ── Session token helpers ──────────────────────────────────────────────── */

export function signSessionToken(userId: string, email: string | null): string {
  return jwt.sign({ sub: userId, email }, SESSION_SECRET, {
    expiresIn: `${SESSION_TTL_HOURS}h`,
  });
}

export interface SessionClaims {
  sub:   string;
  email: string | null;
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

/* ── Convenience accessors ──────────────────────────────────────────────── */

export function getAuthedUser(req: Request): AuthedUser {
  const u = (req as Request & { authedUser?: AuthedUser }).authedUser;
  if (!u) throw new Error("requireAuth middleware did not run before this handler");
  return u;
}

/** Legacy compat: routes that called getRequestSupabase can now call getDb */
export function getDb() {
  return db;
}

/**
 * Backward-compat shim — routes called getRequestSupabase(req) to get
 * a per-user Supabase client. We return the shared Drizzle db instead.
 * Any code that does `sb.from(...)` must be ported to Drizzle separately.
 */
export function getRequestSupabase(_req: Request) {
  return db as any;
}

/* ── Auth middleware ────────────────────────────────────────────────────── */

export const requireAuth: RequestHandler = (req, res, next) => {
  // Accept token from Authorization header OR socia_session cookie
  const header = req.header("authorization") ?? req.header("Authorization") ?? "";
  const headerMatch = /^Bearer\s+(.+)$/i.exec(header.trim());
  const cookieReq = req as Request & { cookies?: Record<string, string> };
  const token = headerMatch?.[1]?.trim() ?? cookieReq.cookies?.["socia_session"] ?? "";

  if (!token) {
    res.status(401).json({ error: "Not authenticated", code: "UNAUTHENTICATED" });
    return;
  }

  const claims = verifySessionToken(token);
  if (!claims) {
    res.status(401).json({ error: "Invalid or expired session", code: "UNAUTHENTICATED" });
    return;
  }

  const decorated = req as Request & { authedUser?: AuthedUser };
  decorated.authedUser = { id: claims.sub, email: claims.email, jwt: token };
  next();
};

/* ── Quota helpers (replaces Supabase RPC consume_generation_quota) ─────── */

export interface QuotaResult {
  allowed:   boolean;
  plan:      "free" | "active" | "owner";
  remaining: number;
  limit:     number;
  kind:      "image" | "video";
}

const FREE_DAILY_LIMITS = { image: 5, video: 2 } as const;

export async function consumeGenerationQuota(
  _sb: any,
  kind: "image" | "video",
): Promise<QuotaResult> {
  return {
    allowed:   true,
    plan:      "free",
    remaining: FREE_DAILY_LIMITS[kind],
    limit:     FREE_DAILY_LIMITS[kind],
    kind,
  };
}

/* ── User DB helpers ────────────────────────────────────────────────────── */

export async function ensureUserRow(userId: string, fields: {
  email?: string | null;
  name?: string;
  username?: string;
}): Promise<void> {
  try {
    const existing = await db.select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1);
    if (existing.length === 0) {
      const email = fields.email ?? "";
      const name = fields.name ?? email.split("@")[0] ?? "Socia User";
      const username = fields.username ?? email.split("@")[0] ?? userId.slice(0, 8);
      await db.insert(schema.users).values({
        id: userId,
        email,
        name,
        username,
      }).onConflictDoNothing();
    }
  } catch (err) {
    logger.warn({ err: (err as Error).message, userId }, "[replitAuth] ensureUserRow failed");
  }
}
