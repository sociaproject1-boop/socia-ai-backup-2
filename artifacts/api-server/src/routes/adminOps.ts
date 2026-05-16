/**
 * Super-admin privileged operations — payment approvals, user management,
 * credit adjustments, plan / settings management, analytics, audit log.
 *
 * All routes require a valid admin JWT and use the service-role Supabase
 * client (RLS bypassed). Every mutating call is recorded in admin_audit_log.
 */
import { Router, type IRouter } from "express";
import {
  getServiceClient, requireAdmin, getAdminClaims, audit,
} from "../lib/adminAuth.js";

const router: IRouter = Router();

/* ─── User enrichment helper ─────────────────────────────────────────── */
/**
 * Supabase's relational join syntax (.select("*, users:user_id(...)")) only
 * follows FK relationships. payment_orders and refund_requests were originally
 * created with user_id REFERENCES auth.users — not public.users — so the join
 * throws a schema-cache error in every admin query.
 *
 * This helper does a safe two-step batch lookup that works immediately,
 * before the FK migration (migration 16) is run.
 */
async function enrichWithUsers<T extends { user_id: string }>(
  sb: ReturnType<typeof getServiceClient>,
  rows: T[],
): Promise<Array<T & { users: { username: string; name: string; email: string } | null }>> {
  if (!sb || rows.length === 0) return rows.map((r) => ({ ...r, users: null }));
  const ids = [...new Set(rows.map((r) => r.user_id))];
  const { data: users } = await sb
    .from("users")
    .select("id, username, name, email")
    .in("id", ids);
  const byId = new Map(
    ((users ?? []) as Array<{ id: string; username: string; name: string; email: string }>)
      .map((u) => [u.id, { username: u.username, name: u.name, email: u.email }]),
  );
  return rows.map((r) => ({ ...r, users: byId.get(r.user_id) ?? null }));
}

/* ─── Payment orders ─────────────────────────────────────────────────── */
router.get("/admin/orders", requireAdmin(), async (req, res) => {
  const sb = getServiceClient()!;
  const status = (req.query["status"] as string) || "pending";
  const limit  = Math.min(Number(req.query["limit"] ?? 100), 500);
  const valid  = ["pending","approved","rejected","expired","all"] as const;
  if (!valid.includes(status as typeof valid[number])) return res.status(400).json({ code: "INVALID_STATUS" });
  let q = sb.from("payment_orders")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (status !== "all") q = q.eq("status", status);
  const { data: rows, error } = await q;
  if (error) return res.status(500).json({ code: "DB_ERROR", message: error.message });
  const orders = await enrichWithUsers(sb, rows ?? []);
  return res.json({ orders });
});

router.get("/admin/orders/:id/receipt", requireAdmin(), async (req, res) => {
  const sb = getServiceClient()!;
  const { data: o, error } = await sb.from("payment_orders").select("receipt_path").eq("id", String(req.params["id"])).maybeSingle();
  if (error || !o) return res.status(404).json({ code: "NOT_FOUND" });
  const { data: signed, error: e2 } = await sb.storage.from("payment-receipts")
    .createSignedUrl(o.receipt_path, 60 * 30);
  if (e2 || !signed) return res.status(500).json({ code: "SIGN_FAILED", message: e2?.message });
  return res.json({ url: signed.signedUrl });
});

router.post("/admin/orders/:id/approve", requireAdmin(), async (req, res) => {
  const c  = getAdminClaims(req);
  const sb = getServiceClient()!;
  const { data, error } = await sb.rpc("admin_v2_approve_payment", { p_order_id: String(req.params["id"]), p_admin_id: c.adminId });
  if (error) return res.status(400).json({ code: "RPC_ERROR", message: error.message });
  await audit(c, "order.approve", { req, targetType: "payment_order", targetId: String(req.params["id"]) });
  return res.json({ ok: true, result: data });
});

router.post("/admin/orders/:id/reject", requireAdmin(), async (req, res) => {
  const c  = getAdminClaims(req);
  const sb = getServiceClient()!;
  const reason = String(req.body?.reason ?? "").trim();
  if (reason.length < 3) return res.status(400).json({ code: "REASON_REQUIRED" });
  const { error } = await sb.rpc("admin_v2_reject_payment", { p_order_id: String(req.params["id"]), p_reason: reason, p_admin_id: c.adminId });
  if (error) return res.status(400).json({ code: "RPC_ERROR", message: error.message });
  await audit(c, "order.reject", { req, targetType: "payment_order", targetId: String(req.params["id"]), meta: { reason } });
  return res.json({ ok: true });
});

/* ─── Users ──────────────────────────────────────────────────────────── */
router.get("/admin/users", requireAdmin(), async (req, res) => {
  const sb = getServiceClient()!;
  const search = String(req.query["q"] ?? "").trim();
  const limit  = Math.min(Number(req.query["limit"] ?? 50), 200);
  let q = sb.from("users")
    .select("id, username, name, email, subscription_status, is_owner, is_verified, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (search) q = q.or(`username.ilike.%${search}%,name.ilike.%${search}%,email.ilike.%${search}%`);
  const { data, error } = await q;
  if (error) return res.status(500).json({ code: "DB_ERROR", message: error.message });
  const users = data ?? [];
  if (users.length === 0) return res.json({ users });
  const ids = users.map((u: { id: string }) => u.id);
  const { data: billing } = await sb.from("user_billing")
    .select("user_id, credits, plan_code, plan_credits, plan_expires_at")
    .in("user_id", ids);
  const byId = new Map((billing ?? []).map((b: { user_id: string }) => [b.user_id, b]));
  return res.json({
    users: users.map((u: { id: string }) => ({ ...u, ...(byId.get(u.id) ?? {
      credits: 0, plan_code: "free", plan_credits: 0, plan_expires_at: null,
    }) })),
  });
});

router.post("/admin/users/:id/credits", requireAdmin(), async (req, res) => {
  const c  = getAdminClaims(req);
  const sb = getServiceClient()!;
  const delta  = Math.trunc(Number(req.body?.delta));
  const reason = String(req.body?.reason ?? "admin_adjust").slice(0, 200);
  if (!Number.isFinite(delta) || delta === 0) return res.status(400).json({ code: "INVALID_DELTA" });
  const { data, error } = await sb.rpc("admin_v2_adjust_credits", {
    p_user: String(req.params["id"]), p_delta: delta, p_reason: reason, p_admin_id: c.adminId,
  });
  if (error) return res.status(400).json({ code: "RPC_ERROR", message: error.message });
  await audit(c, "user.adjust_credits", { req, targetType: "user", targetId: String(req.params["id"]), meta: { delta, reason } });
  return res.json({ ok: true, balance: data });
});

router.post("/admin/users/:id/subscription", requireAdmin(), async (req, res) => {
  const c  = getAdminClaims(req);
  const sb = getServiceClient()!;
  const uid = String(req.params["id"]);
  const planCode = String(req.body?.plan_code ?? "free");
  const days     = Math.max(0, Math.trunc(Number(req.body?.days ?? 0)));
  if (!["free","p15","p30"].includes(planCode)) return res.status(400).json({ code: "INVALID_PLAN" });

  /* Ensure billing row, then update plan + expiry on user_billing. */
  await sb.from("user_billing").upsert({ user_id: uid, plan_code: "free" }, { onConflict: "user_id" });
  const expires = days > 0 ? new Date(Date.now() + days * 86_400_000).toISOString() : null;
  const billingPatch: Record<string, unknown> = { plan_code: planCode, updated_at: new Date().toISOString() };
  if (planCode === "free") {
    billingPatch["plan_expires_at"] = null;
    billingPatch["plan_credits"]    = 0;
    billingPatch["plan_started_at"] = null;
  } else {
    billingPatch["plan_expires_at"] = expires;
    billingPatch["plan_started_at"] = new Date().toISOString();
  }
  const { error: bErr } = await sb.from("user_billing").update(billingPatch).eq("user_id", uid);
  if (bErr) return res.status(400).json({ code: "DB_ERROR", message: bErr.message });

  /* Mirror badge state on public.users (existing columns). */
  const { error: uErr } = await sb.from("users").update({
    subscription_status: planCode === "free" ? "free" : "active",
    is_verified:         planCode !== "free",
  }).eq("id", uid);
  if (uErr) return res.status(400).json({ code: "DB_ERROR", message: uErr.message });

  await audit(c, "user.set_subscription", { req, targetType: "user", targetId: uid, meta: { planCode, days } });
  return res.json({ ok: true });
});

router.post("/admin/users/:id/active", requireAdmin(["super_admin","admin"]), async (req, res) => {
  const c  = getAdminClaims(req);
  const sb = getServiceClient()!;
  const banned = Boolean(req.body?.banned);
  const { error } = await sb.from("users").update({ is_banned: banned }).eq("id", String(req.params["id"]));
  if (error && !error.message.includes("is_banned")) {
    return res.status(400).json({ code: "DB_ERROR", message: error.message });
  }
  await audit(c, banned ? "user.ban" : "user.unban", { req, targetType: "user", targetId: String(req.params["id"]) });
  return res.json({ ok: true });
});

/* ─── Plans / Top-ups / Payment methods ──────────────────────────────── */
router.get("/admin/plans", requireAdmin(), async (_req, res) => {
  const sb = getServiceClient()!;
  const { data, error } = await sb.from("plans").select("*").order("sort");
  if (error) return res.status(500).json({ code: "DB_ERROR", message: error.message });
  return res.json({ plans: data ?? [] });
});
router.post("/admin/plans/:code", requireAdmin(["super_admin","admin"]), async (req, res) => {
  const c  = getAdminClaims(req);
  const sb = getServiceClient()!;
  const allowed = ["name","price_php","credits","duration_days","hd_enabled","watermark","is_active","sort"];
  const updates: Record<string, unknown> = {};
  for (const k of allowed) if (k in (req.body ?? {})) updates[k] = req.body[k];
  if (Object.keys(updates).length === 0) return res.status(400).json({ code: "EMPTY_BODY" });
  const { error } = await sb.from("plans").update(updates).eq("code", String(req.params["code"]));
  if (error) return res.status(400).json({ code: "DB_ERROR", message: error.message });
  await audit(c, "plan.update", { req, targetType: "plan", targetId: String(req.params["code"]), meta: updates });
  return res.json({ ok: true });
});

router.get("/admin/topups", requireAdmin(), async (_req, res) => {
  const sb = getServiceClient()!;
  const { data, error } = await sb.from("topup_packages").select("*").order("sort");
  if (error) return res.status(500).json({ code: "DB_ERROR", message: error.message });
  return res.json({ topups: data ?? [] });
});
router.post("/admin/topups/:code", requireAdmin(["super_admin","admin"]), async (req, res) => {
  const c  = getAdminClaims(req);
  const sb = getServiceClient()!;
  const allowed = ["label","credits","price_php","bonus_label","is_active","sort"];
  const updates: Record<string, unknown> = {};
  for (const k of allowed) if (k in (req.body ?? {})) updates[k] = req.body[k];
  if (Object.keys(updates).length === 0) return res.status(400).json({ code: "EMPTY_BODY" });
  const { error } = await sb.from("topup_packages").update(updates).eq("code", String(req.params["code"]));
  if (error) return res.status(400).json({ code: "DB_ERROR", message: error.message });
  await audit(c, "topup.update", { req, targetType: "topup", targetId: String(req.params["code"]), meta: updates });
  return res.json({ ok: true });
});

router.get("/admin/payment-methods", requireAdmin(), async (_req, res) => {
  const sb = getServiceClient()!;
  const { data, error } = await sb.from("payment_methods_config").select("*").eq("id", 1).maybeSingle();
  if (error) return res.status(500).json({ code: "DB_ERROR", message: error.message });
  return res.json({ config: data ?? null });
});
router.post("/admin/payment-methods", requireAdmin(["super_admin","admin"]), async (req, res) => {
  const c  = getAdminClaims(req);
  const sb = getServiceClient()!;
  const allowed = ["gcash_name","gcash_number","gcash_qr_url","maya_name","maya_number","maya_qr_url",
                   "bank_name","bank_account_name","bank_account_no","notes"];
  const updates: Record<string, unknown> = { id: 1 };
  for (const k of allowed) if (k in (req.body ?? {})) updates[k] = req.body[k];
  const { error } = await sb.from("payment_methods_config").upsert(updates, { onConflict: "id" });
  if (error) return res.status(400).json({ code: "DB_ERROR", message: error.message });
  await audit(c, "payment_methods.update", { req, meta: updates });
  return res.json({ ok: true });
});

/* ─── Payment settings (payment_settings table) ─────────────────────── */
router.get("/admin/payment-settings", requireAdmin(), async (_req, res) => {
  const sb = getServiceClient()!;
  const { data, error } = await sb.from("payment_settings").select("*").eq("id", 1).maybeSingle();
  if (error) return res.status(500).json({ code: "DB_ERROR", message: error.message });
  return res.json({ settings: data ?? null });
});

router.post("/admin/payment-settings", requireAdmin(["super_admin", "admin"]), async (req, res) => {
  const c  = getAdminClaims(req);
  const sb = getServiceClient()!;
  const allowed = [
    "gcash_enabled", "gcash_name", "gcash_number", "gcash_qr_url",
    "maya_enabled",  "maya_name",  "maya_number",  "maya_qr_url",
    "bank_enabled",  "bank_name",  "bank_account_name", "bank_account_no", "bank_qr_url",
    "notes",
  ];
  const updates: Record<string, unknown> = {
    id: 1,
    updated_by: c.adminId,
    updated_at: new Date().toISOString(),
  };
  for (const k of allowed) if (k in (req.body ?? {})) updates[k] = req.body[k];
  const { error } = await sb.from("payment_settings").upsert(updates, { onConflict: "id" });
  if (error) return res.status(400).json({ code: "DB_ERROR", message: error.message });
  await audit(c, "payment_settings.update", { req, meta: updates });
  return res.json({ ok: true });
});

/* ─── Engine settings (cooldowns, smart-saver, AI models) ───────────── */
router.get("/admin/settings", requireAdmin(), async (_req, res) => {
  const sb = getServiceClient()!;
  const { data, error } = await sb.from("admin_settings").select("*").eq("id", 1).maybeSingle();
  if (error) return res.status(500).json({ code: "DB_ERROR", message: error.message });
  return res.json({ settings: data });
});
router.post("/admin/settings", requireAdmin(["super_admin","admin"]), async (req, res) => {
  const c  = getAdminClaims(req);
  const sb = getServiceClient()!;
  const allowed = [
    "cooldown_threshold_1","cooldown_window_1_min","cooldown_duration_1_min",
    "cooldown_threshold_2","cooldown_window_2_min","cooldown_duration_2_min",
    "smart_saver_threshold_pct","default_image_model","default_video_model",
    "free_daily_image_limit","ai_features_enabled","registration_enabled",
  ];
  const updates: Record<string, unknown> = { id: 1, updated_by: c.adminId, updated_at: new Date().toISOString() };
  for (const k of allowed) if (k in (req.body ?? {})) updates[k] = req.body[k];
  const { error } = await sb.from("admin_settings").upsert(updates, { onConflict: "id" });
  if (error) return res.status(400).json({ code: "DB_ERROR", message: error.message });
  await audit(c, "settings.update", { req, meta: updates });
  return res.json({ ok: true });
});

/* ─── Analytics & abuse monitoring ───────────────────────────────────── */
router.get("/admin/metrics", requireAdmin(), async (_req, res) => {
  const sb = getServiceClient()!;
  const { data, error } = await sb.from("admin_metrics").select("*").maybeSingle();
  if (error) return res.status(500).json({ code: "DB_ERROR", message: error.message });
  return res.json({ metrics: data });
});

router.get("/admin/abuse/flagged", requireAdmin(), async (_req, res) => {
  const sb = getServiceClient()!;
  const { data: rows, error } = await sb.from("payment_orders")
    .select("*")
    .eq("flagged", true)
    .order("created_at", { ascending: false }).limit(100);
  if (error) return res.status(500).json({ code: "DB_ERROR", message: error.message });
  const flagged = await enrichWithUsers(sb, rows ?? []);
  return res.json({ flagged });
});

router.get("/admin/audit", requireAdmin(), async (req, res) => {
  const sb = getServiceClient()!;
  const limit = Math.min(Number(req.query["limit"] ?? 100), 500);
  const { data, error } = await sb.from("admin_audit_log")
    .select("*").order("created_at", { ascending: false }).limit(limit);
  if (error) return res.status(500).json({ code: "DB_ERROR", message: error.message });
  return res.json({ entries: data ?? [] });
});

/* ═══════════════════════════════════════════════════════════════════════
 * USER DETAILS / MODERATION / RECOVERY / SUPPORT TOOLS
 * ═══════════════════════════════════════════════════════════════════════ */

/* Full user dossier: profile + recent orders + ledger + login events + AI usage. */
router.get("/admin/users/:id/details", requireAdmin(), async (req, res) => {
  const sb = getServiceClient()!;
  const uid = String(req.params["id"]);
  const [u, billing, orders, ledger, logins, usage] = await Promise.all([
    sb.from("users").select("*").eq("id", uid).maybeSingle(),
    sb.from("user_billing").select("*").eq("user_id", uid).maybeSingle(),
    sb.from("payment_orders").select("*").eq("user_id", uid).order("created_at",{ascending:false}).limit(50),
    sb.from("credit_ledger").select("*").eq("user_id", uid).order("created_at",{ascending:false}).limit(100),
    sb.from("user_login_events").select("*").eq("user_id", uid).order("created_at",{ascending:false}).limit(50),
    sb.from("generation_usage").select("*").eq("user_id", uid).order("day",{ascending:false}).limit(30),
  ]);
  if (u.error || !u.data) return res.status(404).json({ code: "NOT_FOUND" });
  /* Merge billing fields into the user object so the dashboard can read
     credits / plan_code / plan_expires_at at the top level (matches the
     shape it had before the schema split). */
  const b = billing.data ?? { credits: 0, plan_code: "free", plan_credits: 0, plan_expires_at: null, plan_started_at: null };
  return res.json({
    user:     { ...u.data, credits: b.credits, plan_code: b.plan_code, plan_credits: b.plan_credits, plan_expires_at: b.plan_expires_at, plan_started_at: b.plan_started_at },
    orders:   orders.data ?? [],
    ledger:   ledger.data ?? [],
    logins:   logins.data ?? [],
    usage:    usage.data  ?? [],
  });
});

/* Generic moderation: ban, suspend, freeze credits, abuse score, support notes. */
router.post("/admin/users/:id/flags", requireAdmin(["super_admin","admin"]), async (req, res) => {
  const c  = getAdminClaims(req);
  const sb = getServiceClient()!;
  const uid = String(req.params["id"]);
  const allowed = ["is_banned","is_suspended","suspension_reason","credits_frozen","support_notes","abuse_score"];
  const patch: Record<string, unknown> = {};
  for (const k of allowed) if (k in (req.body ?? {})) patch[k] = req.body[k];
  if (Object.keys(patch).length === 0) return res.status(400).json({ code: "EMPTY_PATCH" });
  const { error } = await sb.rpc("admin_v2_set_user_flags", {
    p_user: uid, p_patch: patch, p_admin_id: c.adminId,
  });
  if (error) return res.status(400).json({ code: "RPC_ERROR", message: error.message });
  await audit(c, "user.flags_update", { req, targetType: "user", targetId: uid, meta: patch });
  return res.json({ ok: true });
});

/* Force every active session for this user to sign out on next ping. */
router.post("/admin/users/:id/force-logout", requireAdmin(["super_admin","admin"]), async (req, res) => {
  const c  = getAdminClaims(req);
  const sb = getServiceClient()!;
  const uid = String(req.params["id"]);
  const { error } = await sb.rpc("admin_v2_force_logout", { p_user: uid, p_admin_id: c.adminId });
  if (error) return res.status(400).json({ code: "RPC_ERROR", message: error.message });
  /* Best-effort: also revoke Supabase server-side refresh tokens so the
     account can't silently mint new access tokens. Falls through quietly
     on clients that don't support the admin namespace. */
  try { await sb.auth.admin.signOut(uid, "global" as never); } catch { /* ignore */ }
  await audit(c, "user.force_logout", { req, targetType: "user", targetId: uid });
  return res.json({ ok: true });
});

/* Reset password: admin chooses a new strong password (or we generate one).
   Returned exactly ONCE so the admin can hand it to the user out-of-band. */
router.post("/admin/users/:id/password-reset", requireAdmin(["super_admin","admin"]), async (req, res) => {
  const c  = getAdminClaims(req);
  const sb = getServiceClient()!;
  const uid = String(req.params["id"]);
  let pwd = String(req.body?.password ?? "").trim();
  if (!pwd) {
    /* generate cryptographically random temporary password (mixed alphanumeric) */
    const bytes = new Uint8Array(18);
    (globalThis.crypto as Crypto).getRandomValues(bytes);
    pwd = Buffer.from(bytes).toString("base64url").slice(0, 18);
  }
  if (pwd.length < 8) return res.status(400).json({ code: "WEAK_PASSWORD" });
  const { error } = await sb.auth.admin.updateUserById(uid, { password: pwd });
  if (error) return res.status(400).json({ code: "AUTH_ERROR", message: error.message });
  await audit(c, "user.password_reset", { req, targetType: "user", targetId: uid });
  return res.json({ ok: true, temporary_password: pwd });
});

/* Change a user's email (admin override — for hacked-account recovery). */
router.post("/admin/users/:id/change-email", requireAdmin(["super_admin","admin"]), async (req, res) => {
  const c  = getAdminClaims(req);
  const sb = getServiceClient()!;
  const uid = String(req.params["id"]);
  const email = String(req.body?.email ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ code: "INVALID_EMAIL" });
  const { error } = await sb.auth.admin.updateUserById(uid, { email, email_confirm: true });
  if (error) return res.status(400).json({ code: "AUTH_ERROR", message: error.message });
  /* Mirror into public.users so feeds/badges show the new email immediately. */
  await sb.from("users").update({ email }).eq("id", uid);
  await audit(c, "user.change_email", { req, targetType: "user", targetId: uid, meta: { email } });
  return res.json({ ok: true });
});

/* Extend a user's subscription by N days (does NOT charge them). */
router.post("/admin/users/:id/extend-subscription", requireAdmin(["super_admin","admin"]), async (req, res) => {
  const c  = getAdminClaims(req);
  const sb = getServiceClient()!;
  const uid  = String(req.params["id"]);
  const days = Math.trunc(Number(req.body?.days));
  if (!Number.isFinite(days) || days <= 0 || days > 3650) return res.status(400).json({ code: "INVALID_DAYS" });
  const { data, error } = await sb.rpc("admin_v2_extend_subscription", {
    p_user: uid, p_days: days, p_admin_id: c.adminId,
  });
  if (error) return res.status(400).json({ code: "RPC_ERROR", message: error.message });
  await audit(c, "user.extend_subscription", { req, targetType: "user", targetId: uid, meta: { days } });
  return res.json({ ok: true, new_expires_at: data });
});

/* Compensation: like adjust-credits but always positive + tagged in ledger. */
router.post("/admin/users/:id/compensate", requireAdmin(["super_admin","admin"]), async (req, res) => {
  const c  = getAdminClaims(req);
  const sb = getServiceClient()!;
  const uid     = String(req.params["id"]);
  const credits = Math.trunc(Number(req.body?.credits));
  const note    = String(req.body?.note ?? "").trim().slice(0, 200);
  if (!Number.isFinite(credits) || credits <= 0) return res.status(400).json({ code: "INVALID_CREDITS" });
  if (note.length < 3) return res.status(400).json({ code: "NOTE_REQUIRED" });
  const { data, error } = await sb.rpc("admin_v2_adjust_credits", {
    p_user: uid, p_delta: credits, p_reason: "compensation: " + note, p_admin_id: c.adminId,
  });
  if (error) return res.status(400).json({ code: "RPC_ERROR", message: error.message });
  await audit(c, "user.compensate", { req, targetType: "user", targetId: uid, meta: { credits, note } });
  return res.json({ ok: true, balance: data });
});

/* Refund an APPROVED order (subtracts granted credits, marks order rejected/REFUND). */
router.post("/admin/orders/:id/refund", requireAdmin(["super_admin","admin"]), async (req, res) => {
  const c  = getAdminClaims(req);
  const sb = getServiceClient()!;
  const oid    = String(req.params["id"]);
  const reason = String(req.body?.reason ?? "").trim();
  if (reason.length < 3) return res.status(400).json({ code: "REASON_REQUIRED" });
  const { data, error } = await sb.rpc("admin_v2_refund_order", {
    p_order_id: oid, p_reason: reason, p_admin_id: c.adminId,
  });
  if (error) return res.status(400).json({ code: "RPC_ERROR", message: error.message });
  await audit(c, "order.refund", { req, targetType: "payment_order", targetId: oid, meta: { reason } });
  return res.json({ ok: true, result: data });
});

/* Suspicious-users feed: high abuse_score / banned / suspended / frozen. */
router.get("/admin/abuse/suspicious", requireAdmin(), async (_req, res) => {
  const sb = getServiceClient()!;
  const { data, error } = await sb.from("admin_suspicious_users").select("*").limit(200);
  if (error) return res.status(500).json({ code: "DB_ERROR", message: error.message });
  return res.json({ users: data ?? [] });
});

/* AI usage rollup over the last N days (default 14). */
router.get("/admin/usage/generation", requireAdmin(), async (req, res) => {
  const sb = getServiceClient()!;
  const days = Math.min(Math.max(Number(req.query["days"] ?? 14), 1), 90);
  const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
  const { data, error } = await sb.from("generation_usage")
    .select("day, image_count, video_count")
    .gte("day", since);
  if (error) return res.status(500).json({ code: "DB_ERROR", message: error.message });
  /* Roll up to per-day totals server-side so the client just renders. */
  const byDay = new Map<string, { day: string; images: number; videos: number }>();
  for (const r of data ?? []) {
    const k = String(r.day);
    const cur = byDay.get(k) ?? { day: k, images: 0, videos: 0 };
    cur.images += Number(r.image_count) || 0;
    cur.videos += Number(r.video_count) || 0;
    byDay.set(k, cur);
  }
  const series = [...byDay.values()].sort((a,b) => a.day.localeCompare(b.day));
  return res.json({ days, series });
});

export default router;
