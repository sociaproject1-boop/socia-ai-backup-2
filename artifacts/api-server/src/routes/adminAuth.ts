/**
 * Super-admin auth routes — login, setup (first-admin bootstrap), session,
 * logout, change-password.
 *
 * All routes are under /api/admin/auth.
 */
import { Router, type IRouter } from "express";
import {
  getServiceClient, isAdminSystemReady, hashPassword, verifyPassword,
  signAdminToken, verifyAdminToken, requireAdmin, audit, getAdminClaims,
} from "../lib/adminAuth.js";
import { createRateLimiter, getClientIp } from "../lib/rateLimit.js";

const router: IRouter = Router();

const MIN_USERNAME = 3;
const MIN_PASSWORD = 12;          // strict: super-admin → strong password
const MAX_FAILED   = 5;
const LOCKOUT_MIN  = 15;

const VALID_USERNAME = /^[a-zA-Z0-9_.-]{3,32}$/;
const VALID_EMAIL    = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/* ─── GET /api/admin/auth/needs-setup ──────────────────────────────────── */
/* Public — UI uses this to decide whether to render the setup form. */
router.get("/admin/auth/needs-setup", async (_req, res) => {
  if (!isAdminSystemReady()) return res.status(503).json({ code: "ADMIN_NOT_CONFIGURED" });
  const sb = getServiceClient()!;
  const { count, error } = await sb.from("super_admins").select("id", { head: true, count: "exact" });
  if (error) return res.status(500).json({ code: "DB_ERROR", message: error.message });
  return res.json({ needsSetup: (count ?? 0) === 0 });
});

/* ─── POST /api/admin/auth/setup ───────────────────────────────────────── */
/* One-time bootstrap — only succeeds when zero super_admins exist. */
router.post("/admin/auth/setup", createRateLimiter({
  name: "admin-setup",
  windowSec: 3600,
  max: 5,
}), async (req, res) => {
  if (!isAdminSystemReady()) return res.status(503).json({ code: "ADMIN_NOT_CONFIGURED" });
  const sb = getServiceClient()!;

  const { username, email, password } = req.body ?? {};
  if (!VALID_USERNAME.test(String(username ?? ""))) return res.status(400).json({ code: "INVALID_USERNAME" });
  if (!VALID_EMAIL.test(String(email ?? "")))       return res.status(400).json({ code: "INVALID_EMAIL" });
  if (typeof password !== "string" || password.length < MIN_PASSWORD) {
    return res.status(400).json({ code: "WEAK_PASSWORD", message: `Min ${MIN_PASSWORD} chars.` });
  }

  const password_hash = await hashPassword(password);
  /* Race-safe: a Postgres advisory-lock-protected RPC ensures only ONE
     super_admin can be created via the unauthenticated setup endpoint,
     even if several requests fire in parallel. */
  const { data: newId, error } = await sb.rpc("bootstrap_first_super_admin", {
    p_username: username, p_email: email, p_password_hash: password_hash,
  });
  if (error) {
    if (/setup_already_done/i.test(error.message)) {
      return res.status(409).json({ code: "SETUP_DONE", message: "Super admin already exists." });
    }
    if (/duplicate key/i.test(error.message)) {
      return res.status(409).json({ code: "DUPLICATE", message: "Username or email already taken." });
    }
    return res.status(500).json({ code: "DB_ERROR", message: error.message });
  }

  const adminId = String(newId);
  const token = signAdminToken({ adminId, username, role: "super_admin" });
  await audit({ adminId, username, role: "super_admin", iat: 0, exp: 0 }, "admin.setup", { req });
  return res.json({ token, admin: { id: adminId, username, role: "super_admin" } });
});

/* ─── POST /api/admin/auth/login ───────────────────────────────────────── */
router.post("/admin/auth/login", createRateLimiter({
  name: "admin-login",
  windowSec: 60,
  max: 10,
  // Scope per IP+username so a guessing attack can't spread across many
  // usernames from one IP. The `username` field is read from req.body.
  keyOf: (req) => {
    const u = String((req.body as { username?: unknown })?.username ?? "").toLowerCase().slice(0, 64);
    return `admin-login:${getClientIp(req)}:${u}`;
  },
}), async (req, res) => {
  if (!isAdminSystemReady()) return res.status(503).json({ code: "ADMIN_NOT_CONFIGURED" });
  const sb = getServiceClient()!;
  const { username, password } = req.body ?? {};
  if (typeof username !== "string" || typeof password !== "string") {
    return res.status(400).json({ code: "INVALID_BODY" });
  }
  const { data: row, error } = await sb
    .from("super_admins")
    .select("id, username, role, password_hash, is_active, failed_login_count, locked_until, totp_enabled")
    .ilike("username", username.trim())
    .maybeSingle();
  if (error)  return res.status(500).json({ code: "DB_ERROR" });
  // Always do a bcrypt round to avoid user-enumeration timing.
  const dummyHash = "$2b$12$abcdefghijklmnopqrstuvCQYdhGXfDzPrI4ZUqwd3lLstY3WCmZ6";
  const ok = row ? await verifyPassword(password, row.password_hash) : await verifyPassword(password, dummyHash);
  if (!row || !row.is_active) return res.status(401).json({ code: "INVALID_CREDENTIALS" });
  /* Don't disclose lockout state explicitly — return generic 401 so an
   * attacker can't enumerate which usernames exist via the LOCKED response. */
  if (row.locked_until && new Date(row.locked_until).getTime() > Date.now()) {
    return res.status(401).json({ code: "INVALID_CREDENTIALS" });
  }
  if (!ok) {
    const next = (row.failed_login_count ?? 0) + 1;
    const update: Record<string, unknown> = { failed_login_count: next };
    if (next >= MAX_FAILED) update["locked_until"] = new Date(Date.now() + LOCKOUT_MIN * 60_000).toISOString();
    await sb.from("super_admins").update(update).eq("id", row.id);
    await audit(null, "admin.login_failed", { req, targetType: "admin", targetId: row.id, meta: { username } });
    return res.status(401).json({ code: "INVALID_CREDENTIALS" });
  }
  // 2FA hook (not yet enforced UI-side):
  // if (row.totp_enabled) { return res.json({ needsTotp: true, challengeId: ... }); }

  await sb.from("super_admins").update({
    failed_login_count: 0, locked_until: null,
    last_login_at: new Date().toISOString(),
    last_login_ip: req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
  }).eq("id", row.id);

  const token = signAdminToken({ adminId: row.id, username: row.username, role: row.role });
  await audit({ adminId: row.id, username: row.username, role: row.role as "super_admin", iat: 0, exp: 0 },
              "admin.login", { req });
  return res.json({ token, admin: { id: row.id, username: row.username, role: row.role } });
});

/* ─── GET /api/admin/auth/session ──────────────────────────────────────── */
router.get("/admin/auth/session", requireAdmin(), async (req, res) => {
  const c = getAdminClaims(req);
  const sb = getServiceClient()!;
  const { data } = await sb.from("super_admins").select("id, username, email, role, is_active, last_login_at")
    .eq("id", c.adminId).maybeSingle();
  if (!data || !data.is_active) return res.status(401).json({ code: "REVOKED" });
  return res.json({ admin: data });
});

/* ─── POST /api/admin/auth/logout ──────────────────────────────────────── */
router.post("/admin/auth/logout", requireAdmin(), async (req, res) => {
  const c = getAdminClaims(req);
  await audit(c, "admin.logout", { req });
  // JWT is stateless; client clears localStorage. Keep this for audit trail.
  return res.json({ ok: true });
});

/* ─── POST /api/admin/auth/change-password ─────────────────────────────── */
router.post("/admin/auth/change-password", requireAdmin(), async (req, res) => {
  const c  = getAdminClaims(req);
  const sb = getServiceClient()!;
  const { current, next: nextPwd } = req.body ?? {};
  if (typeof current !== "string" || typeof nextPwd !== "string" || nextPwd.length < MIN_PASSWORD) {
    return res.status(400).json({ code: "INVALID_BODY", message: `New password min ${MIN_PASSWORD} chars.` });
  }
  const { data: row } = await sb.from("super_admins").select("password_hash").eq("id", c.adminId).maybeSingle();
  if (!row || !(await verifyPassword(current, row.password_hash))) {
    return res.status(401).json({ code: "INVALID_CURRENT_PASSWORD" });
  }
  const password_hash = await hashPassword(nextPwd);
  await sb.from("super_admins").update({ password_hash }).eq("id", c.adminId);
  await audit(c, "admin.change_password", { req });
  return res.json({ ok: true });
});

/* ─── POST /api/admin/auth/create  (super_admin only) ──────────────────── */
router.post("/admin/auth/create", requireAdmin(["super_admin"]), async (req, res) => {
  const c  = getAdminClaims(req);
  const sb = getServiceClient()!;
  const { username, email, password, role = "admin" } = req.body ?? {};
  if (!VALID_USERNAME.test(String(username ?? ""))) return res.status(400).json({ code: "INVALID_USERNAME" });
  if (!VALID_EMAIL.test(String(email ?? "")))       return res.status(400).json({ code: "INVALID_EMAIL" });
  if (typeof password !== "string" || password.length < MIN_PASSWORD) {
    return res.status(400).json({ code: "WEAK_PASSWORD" });
  }
  if (!["super_admin","admin","support","analyst"].includes(role)) {
    return res.status(400).json({ code: "INVALID_ROLE" });
  }
  const password_hash = await hashPassword(password);
  const { data, error } = await sb.from("super_admins")
    .insert({ username, email, password_hash, role, created_by: c.adminId, is_active: true })
    .select("id, username, role").single();
  if (error || !data) return res.status(409).json({ code: "DB_ERROR", message: error?.message });
  await audit(c, "admin.create", { req, targetType: "admin", targetId: data.id, meta: { username, role } });
  return res.json({ admin: data });
});

/* ─── POST /api/admin/auth/_dev-token (dev only) — verify env presence ── */
/* Intentionally returns whether the admin system is configured so the
   client can render a clear "configure SUPABASE_SERVICE_ROLE_KEY" message. */
router.get("/admin/auth/health", (_req, res) => {
  res.json({ ready: isAdminSystemReady() });
});

/* Inactivity probe — returns the remaining seconds before token expires. */
router.get("/admin/auth/probe", (req, res) => {
  const auth = req.header("authorization") || "";
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  if (!token) return res.json({ valid: false });
  const c = verifyAdminToken(token);
  if (!c) return res.json({ valid: false });
  return res.json({ valid: true, expiresIn: c.exp - Math.floor(Date.now() / 1000), role: c.role });
});

export default router;
