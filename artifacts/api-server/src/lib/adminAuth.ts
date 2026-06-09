/**
 * Super-admin authentication for the api-server.
 * Ported to Drizzle/PostgreSQL — no Supabase dependency.
 */
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import type { Request, RequestHandler } from "express";
import { logger } from "./logger.js";
import { db, schema } from "./db.js";
import { eq } from "drizzle-orm";
import { createDbClient } from "./dbCompat.js";

const JWT_SECRET = process.env["SESSION_SECRET"] || "dev-only-insecure-secret-change-me";
const ADMIN_TTL_HOURS = 8;

/** Returns a Supabase-compatible DB client backed by PostgreSQL. */
export function getServiceClient() {
  return createDbClient();
}

export function isAdminSystemReady(): boolean {
  return Boolean(process.env["DATABASE_URL"]);
}

export interface AdminClaims {
  adminId:  string;
  username: string;
  role:     "super_admin" | "admin" | "support" | "analyst";
  iat:      number;
  exp:      number;
}

export function signAdminToken(c: Pick<AdminClaims, "adminId" | "username" | "role">): string {
  return jwt.sign(c, JWT_SECRET, { expiresIn: `${ADMIN_TTL_HOURS}h` });
}

export function verifyAdminToken(token: string): AdminClaims | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (typeof decoded === "string") return null;
    return decoded as AdminClaims;
  } catch {
    return null;
  }
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 12);
}
export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

const ADMIN_FIELD = "__admin";
type AdminRequest = Request & { [ADMIN_FIELD]?: AdminClaims };

export function getAdminClaims(req: Request): AdminClaims {
  const claims = (req as AdminRequest)[ADMIN_FIELD];
  if (!claims) throw new Error("admin claims not attached — requireAdmin not in chain");
  return claims;
}

export function requireAdmin(allowedRoles?: AdminClaims["role"][]): RequestHandler {
  return (req, res, next): void => {
    if (!isAdminSystemReady()) {
      res.status(503).json({ code: "ADMIN_NOT_CONFIGURED", message: "DATABASE_URL missing on server." });
      return;
    }
    const auth = req.header("authorization") || "";
    let token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
    const cookieReq = req as Request & { cookies?: Record<string, string> };
    if (!token && cookieReq.cookies?.["socia_admin_token"]) token = String(cookieReq.cookies["socia_admin_token"]);
    if (!token) { res.status(401).json({ code: "UNAUTHENTICATED" }); return; }

    const claims = verifyAdminToken(token);
    if (!claims) { res.status(401).json({ code: "INVALID_TOKEN" }); return; }
    if (allowedRoles && !allowedRoles.includes(claims.role)) {
      res.status(403).json({ code: "FORBIDDEN", message: "Insufficient role." });
      return;
    }
    (req as AdminRequest)[ADMIN_FIELD] = claims;
    next();
  };
}

/** Best-effort audit log (never throws). */
export async function audit(
  claims: AdminClaims | null,
  action: string,
  ctx: { req?: Request; targetType?: string; targetId?: string; meta?: unknown } = {},
): Promise<void> {
  try {
    const ip =
      ctx.req?.header("cf-connecting-ip") ||
      ctx.req?.header("x-forwarded-for")?.split(",")[0]?.trim() ||
      ctx.req?.socket?.remoteAddress ||
      null;
    const ua = ctx.req?.header("user-agent") ?? null;
    await db.insert(schema.adminAuditLog).values({
      adminId:    claims?.adminId ?? null,
      username:   claims?.username ?? null,
      action,
      targetType: ctx.targetType ?? null,
      targetId:   ctx.targetId   ?? null,
      meta:       ctx.meta ? (ctx.meta as Record<string, unknown>) : null,
      ip,
      userAgent:  ua,
    });
  } catch (err) {
    logger.warn({ err, action }, "admin audit insert failed");
  }
}
