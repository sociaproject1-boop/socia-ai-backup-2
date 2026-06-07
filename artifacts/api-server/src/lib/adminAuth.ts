/**
 * Super-admin authentication for the api-server.
 *
 * Admins are entirely separate from Supabase auth users. They authenticate
 * with username + bcrypt password and receive a short-lived JWT signed with
 * SESSION_SECRET. All privileged DB operations use the service-role Supabase
 * client which bypasses RLS.
 *
 * 2FA-ready: super_admins.totp_secret/totp_enabled exist — verify step is a
 * one-line addition before signAdminToken().
 */
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Request, RequestHandler } from "express";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { logger } from "./logger.js";

const JWT_SECRET = process.env["SESSION_SECRET"] || "dev-only-insecure-secret-change-me";
const ADMIN_TTL_HOURS = 8;

/* ── Service-role key resolution ──────────────────────────────────────────
 * Tries (in order):
 *   1. process.env.SUPABASE_SERVICE_ROLE_KEY  (Replit Secrets — preferred)
 *   2. ./.local/secrets/SUPABASE_SERVICE_ROLE_KEY  (file-based fallback for
 *      mobile / when the Secrets panel is stuck — gitignored)
 * The file fallback exists so admins can still bootstrap the system from a
 * mobile editor where the Secrets UI is unreliable. */
function getSupabaseUrl(): string {
  return process.env["VITE_SUPABASE_URL"] ?? process.env["SUPABASE_URL"] ?? "";
}

function resolveServiceRole(): string | undefined {
  const fromEnv = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (fromEnv && fromEnv.trim()) return fromEnv.trim();
  try {
    const candidates = [
      resolve(process.cwd(), ".local/secrets/SUPABASE_SERVICE_ROLE_KEY"),
      resolve(process.cwd(), "../../.local/secrets/SUPABASE_SERVICE_ROLE_KEY"),
    ];
    for (const p of candidates) {
      if (existsSync(p)) {
        const v = readFileSync(p, "utf8").trim();
        if (v) {
          logger.info({ path: p }, "[admin] loaded SUPABASE_SERVICE_ROLE_KEY from file fallback");
          return v;
        }
      }
    }
  } catch (e) {
    logger.warn({ err: (e as Error).message }, "[admin] file-fallback read failed");
  }
  return undefined;
}
let _service: SupabaseClient | null = null;
/** Service-role Supabase client (bypasses RLS). Lazy-initialised so the
 *  server still boots if SUPABASE_SERVICE_ROLE_KEY hasn't been added yet —
 *  admin routes will return 503 in that case. */
export function getServiceClient(): SupabaseClient | null {
  if (_service) return _service;
  const url = getSupabaseUrl();
  const role = resolveServiceRole();
  if (!url || !role) return null;
  _service = createClient(url, role, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _service;
}

export function isAdminSystemReady(): boolean {
  return Boolean(getSupabaseUrl() && resolveServiceRole());
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

/** Express middleware — requires a valid admin JWT in `Authorization: Bearer`
 *  or in the `socia_admin_token` cookie. Optionally restrict by role. */
export function requireAdmin(allowedRoles?: AdminClaims["role"][]): RequestHandler {
  return (req, res, next): void => {
    if (!isAdminSystemReady()) {
      res.status(503).json({
        code: "ADMIN_NOT_CONFIGURED",
        message: "SUPABASE_SERVICE_ROLE_KEY missing on server.",
      });
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
  const sb = getServiceClient();
  if (!sb) return;
  const ip =
    ctx.req?.header("cf-connecting-ip") ||
    ctx.req?.header("x-forwarded-for")?.split(",")[0]?.trim() ||
    ctx.req?.socket?.remoteAddress ||
    null;
  const ua = ctx.req?.header("user-agent") ?? null;
  await sb.from("admin_audit_log").insert({
    admin_id:    claims?.adminId ?? null,
    username:    claims?.username ?? null,
    action,
    target_type: ctx.targetType ?? null,
    target_id:   ctx.targetId   ?? null,
    meta:        ctx.meta ? (ctx.meta as object) : null,
    ip,
    user_agent:  ua,
  }).then(({ error }) => {
    if (error) logger.warn({ err: error, action }, "admin audit insert failed");
  });
}
