/**
 * Client-side super-admin auth + API helpers.
 *
 * The admin token is stored in localStorage under `socia_admin_token` and
 * sent on every admin API call as `Authorization: Bearer`. This is fully
 * separate from the Supabase user session — a normal user can be signed in
 * (or not) without affecting admin access, and vice-versa.
 */
import { create } from "zustand";

const TOKEN_KEY = "socia_admin_token";

export type AdminRole = "super_admin" | "admin" | "support" | "analyst";

export interface AdminProfile {
  id:       string;
  username: string;
  email:    string;
  role:     AdminRole;
  is_active?: boolean;
  last_login_at?: string | null;
}

const API = (path: string) => `${import.meta.env.BASE_URL}api${path}`.replace(/\/{2,}/g, "/");

function getToken(): string | null {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}
export function setToken(t: string | null) {
  try {
    if (t) localStorage.setItem(TOKEN_KEY, t);
    else   localStorage.removeItem(TOKEN_KEY);
  } catch { /* ignore */ }
}

export async function adminFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const res = await fetch(API(path), { ...init, headers });
  let body: unknown = null;
  try { body = await res.json(); } catch { /* no json */ }
  if (!res.ok) {
    const msg = (body as { message?: string; code?: string } | null)?.message
            ?? (body as { code?: string } | null)?.code
            ?? `HTTP ${res.status}`;
    if (res.status === 401 || res.status === 403) {
      // session expired or revoked — wipe token so the guard kicks the user back to /sys-admin/login
      setToken(null);
      useAdminStore.getState().setProfile(null);
    }
    throw new Error(msg);
  }
  return body as T;
}

/* ─── Auth ──────────────────────────────────────────────────────────── */
export async function adminNeedsSetup(): Promise<boolean> {
  const r = await adminFetch<{ needsSetup: boolean }>("/admin/auth/needs-setup");
  return r.needsSetup;
}
export async function adminSetup(args: { username: string; email: string; password: string }): Promise<AdminProfile> {
  const r = await adminFetch<{ token: string; admin: AdminProfile }>("/admin/auth/setup", {
    method: "POST", body: JSON.stringify(args),
  });
  setToken(r.token);
  useAdminStore.getState().setProfile(r.admin);
  return r.admin;
}
export async function adminLogin(args: { username: string; password: string }): Promise<AdminProfile> {
  const r = await adminFetch<{ token: string; admin: AdminProfile }>("/admin/auth/login", {
    method: "POST", body: JSON.stringify(args),
  });
  setToken(r.token);
  useAdminStore.getState().setProfile(r.admin);
  return r.admin;
}
export async function adminLogout(): Promise<void> {
  try { await adminFetch("/admin/auth/logout", { method: "POST" }); } catch { /* ignore */ }
  setToken(null);
  useAdminStore.getState().setProfile(null);
}
/** Returns true if the api-server has SUPABASE_SERVICE_ROLE_KEY configured.
 *  Used by the SysAdminLogin page to show a clear "configure secret" banner
 *  instead of a generic 503. Never throws. */
export async function adminCheckHealth(): Promise<{ ready: boolean }> {
  try {
    const r = await fetch("/api/admin/auth/health", { credentials: "include" });
    if (!r.ok) return { ready: false };
    return await r.json() as { ready: boolean };
  } catch { return { ready: false }; }
}

export async function adminFetchSession(): Promise<AdminProfile | null> {
  if (!getToken()) return null;
  try {
    const r = await adminFetch<{ admin: AdminProfile }>("/admin/auth/session");
    useAdminStore.getState().setProfile(r.admin);
    return r.admin;
  } catch {
    return null;
  }
}
export async function adminChangePassword(current: string, next: string) {
  return adminFetch<{ ok: true }>("/admin/auth/change-password", {
    method: "POST", body: JSON.stringify({ current, next }),
  });
}

/* ─── Privileged ops ────────────────────────────────────────────────── */
export interface AdminOrder {
  id: string; user_id: string; kind: "subscription"|"topup";
  plan_code: string|null; topup_code: string|null;
  amount_php: number; credits_to_grant: number;
  payment_method: string; reference_no: string; sender_name: string|null;
  receipt_path: string; receipt_sha256: string;
  status: "pending"|"approved"|"rejected"|"expired";
  rejection_reason: string|null; reviewed_at: string|null;
  flagged: boolean; flag_reason: string|null;
  created_at: string;
  users?: { username: string|null; name: string|null; email: string|null } | null;
}
export const adminListOrders = (status: string = "pending", limit = 100) =>
  adminFetch<{ orders: AdminOrder[] }>(`/admin/orders?status=${encodeURIComponent(status)}&limit=${limit}`).then((r) => r.orders);
export const adminGetReceiptUrl = (id: string) =>
  adminFetch<{ url: string }>(`/admin/orders/${id}/receipt`).then((r) => r.url);
export const adminApproveOrder = (id: string) =>
  adminFetch<{ ok: true }>(`/admin/orders/${id}/approve`, { method: "POST" });
export const adminRejectOrder = (id: string, reason: string) =>
  adminFetch<{ ok: true }>(`/admin/orders/${id}/reject`, { method: "POST", body: JSON.stringify({ reason }) });

export interface AdminUserRow {
  id: string; username: string|null; name: string|null; email: string|null;
  credits: number|null; plan_code: string|null; plan_credits: number|null;
  plan_expires_at: string|null; subscription_status: string|null;
  is_owner: boolean; is_verified: boolean; created_at: string;
}
export const adminListUsers = (q = "", limit = 50) =>
  adminFetch<{ users: AdminUserRow[] }>(`/admin/users?q=${encodeURIComponent(q)}&limit=${limit}`).then((r) => r.users);
export const adminAdjustCredits = (userId: string, delta: number, reason: string) =>
  adminFetch<{ ok: true; balance: number }>(`/admin/users/${userId}/credits`, {
    method: "POST", body: JSON.stringify({ delta, reason }),
  });
export const adminSetSubscription = (userId: string, planCode: "free"|"p15"|"p30", days: number) =>
  adminFetch<{ ok: true }>(`/admin/users/${userId}/subscription`, {
    method: "POST", body: JSON.stringify({ plan_code: planCode, days }),
  });

export interface AdminMetrics {
  total_users: number; active_subs: number; verified_users: number;
  pending_orders: number; approved_30d: number; revenue_30d_php: number;
  flagged_pending: number;
}
export const adminGetMetrics = () =>
  adminFetch<{ metrics: AdminMetrics }>("/admin/metrics").then((r) => r.metrics);

export interface AdminSettings {
  cooldown_threshold_1: number; cooldown_window_1_min: number; cooldown_duration_1_min: number;
  cooldown_threshold_2: number; cooldown_window_2_min: number; cooldown_duration_2_min: number;
  smart_saver_threshold_pct: number;
  default_image_model: string; default_video_model: string;
  free_daily_image_limit: number;
  ai_features_enabled: boolean; registration_enabled: boolean;
}
export const adminGetSettings = () =>
  adminFetch<{ settings: AdminSettings }>("/admin/settings").then((r) => r.settings);
export const adminSaveSettings = (patch: Partial<AdminSettings>) =>
  adminFetch<{ ok: true }>("/admin/settings", { method: "POST", body: JSON.stringify(patch) });

export const adminGetPaymentMethods = () =>
  adminFetch<{ config: Record<string, string|null> | null }>("/admin/payment-methods").then((r) => r.config);
export const adminSavePaymentMethods = (patch: Record<string, string|null>) =>
  adminFetch<{ ok: true }>("/admin/payment-methods", { method: "POST", body: JSON.stringify(patch) });

export interface PaymentSettings {
  gcash_enabled:    boolean;
  gcash_name:       string | null;
  gcash_number:     string | null;
  gcash_qr_url:     string | null;
  maya_enabled:     boolean;
  maya_name:        string | null;
  maya_number:      string | null;
  maya_qr_url:      string | null;
  bank_enabled:     boolean;
  bank_name:        string | null;
  bank_account_name: string | null;
  bank_account_no:  string | null;
  bank_qr_url:      string | null;
  notes:            string | null;
  updated_at?:      string | null;
  updated_by?:      string | null;
}
export const adminGetPaymentSettings = () =>
  adminFetch<{ settings: PaymentSettings | null }>("/admin/payment-settings").then((r) => r.settings);
export const adminSavePaymentSettings = (patch: Partial<PaymentSettings>) =>
  adminFetch<{ ok: true }>("/admin/payment-settings", { method: "POST", body: JSON.stringify(patch) });

export const adminListPlans = () =>
  adminFetch<{ plans: unknown[] }>("/admin/plans").then((r) => r.plans);
export const adminUpdatePlan = (code: string, patch: Record<string, unknown>) =>
  adminFetch<{ ok: true }>(`/admin/plans/${code}`, { method: "POST", body: JSON.stringify(patch) });

export interface AdminAuditEntry {
  id: number; admin_id: string|null; username: string|null;
  action: string; target_type: string|null; target_id: string|null;
  meta: unknown; ip: string|null; created_at: string;
}
export const adminGetAudit = (limit = 100) =>
  adminFetch<{ entries: AdminAuditEntry[] }>(`/admin/audit?limit=${limit}`).then((r) => r.entries);

/* ─── Moderation, recovery, support ─────────────────────────────────── */
export interface AdminUserDetails {
  user: AdminUserRow & {
    is_banned?: boolean; is_suspended?: boolean; suspension_reason?: string|null;
    credits_frozen?: boolean; support_notes?: string|null; abuse_score?: number;
    force_logout_at?: string|null; bio?: string|null; followers?: number; following?: number;
  };
  orders: AdminOrder[];
  ledger: { id: number; delta: number; reason: string; balance_after: number; created_at: string }[];
  logins: { id: number; ip: string|null; user_agent: string|null; country: string|null; created_at: string }[];
  usage:  { day: string; image_count: number; video_count: number }[];
}
export const adminGetUserDetails = (uid: string) =>
  adminFetch<AdminUserDetails>(`/admin/users/${uid}/details`);

export const adminSetUserFlags = (uid: string, patch: Partial<{
  is_banned: boolean; is_suspended: boolean; suspension_reason: string|null;
  credits_frozen: boolean; support_notes: string|null; abuse_score: number;
}>) => adminFetch<{ ok: true }>(`/admin/users/${uid}/flags`, {
  method: "POST", body: JSON.stringify(patch),
});

export const adminForceLogout = (uid: string) =>
  adminFetch<{ ok: true }>(`/admin/users/${uid}/force-logout`, { method: "POST" });

export const adminResetUserPassword = (uid: string, password?: string) =>
  adminFetch<{ ok: true; temporary_password: string }>(`/admin/users/${uid}/password-reset`, {
    method: "POST", body: JSON.stringify(password ? { password } : {}),
  });

export const adminChangeUserEmail = (uid: string, email: string) =>
  adminFetch<{ ok: true }>(`/admin/users/${uid}/change-email`, {
    method: "POST", body: JSON.stringify({ email }),
  });

export const adminExtendSubscription = (uid: string, days: number) =>
  adminFetch<{ ok: true; new_expires_at: string }>(`/admin/users/${uid}/extend-subscription`, {
    method: "POST", body: JSON.stringify({ days }),
  });

export const adminCompensateUser = (uid: string, credits: number, note: string) =>
  adminFetch<{ ok: true; balance: number }>(`/admin/users/${uid}/compensate`, {
    method: "POST", body: JSON.stringify({ credits, note }),
  });

export const adminRefundOrder = (orderId: string, reason: string) =>
  adminFetch<{ ok: true }>(`/admin/orders/${orderId}/refund`, {
    method: "POST", body: JSON.stringify({ reason }),
  });

export interface AdminSuspiciousUser {
  id: string; username: string|null; email: string|null; name: string|null;
  abuse_score: number; is_banned: boolean; is_suspended: boolean; credits_frozen: boolean;
  is_owner?: boolean; is_verified?: boolean;
  credits: number|null; plan_code: string|null; plan_expires_at: string|null; created_at: string;
}
export const adminGetSuspiciousUsers = () =>
  adminFetch<{ users: AdminSuspiciousUser[] }>(`/admin/abuse/suspicious`).then((r) => r.users);

export interface AdminUsageDay { day: string; images: number; videos: number }
export const adminGetGenerationUsage = (days = 14) =>
  adminFetch<{ days: number; series: AdminUsageDay[] }>(`/admin/usage/generation?days=${days}`).then((r) => r.series);

/* ─── Store ─────────────────────────────────────────────────────────── */
interface AdminStore {
  profile: AdminProfile | null;
  hydrated: boolean;
  setProfile: (p: AdminProfile | null) => void;
  setHydrated: (b: boolean) => void;
}
export const useAdminStore = create<AdminStore>((set) => ({
  profile: null,
  hydrated: false,
  setProfile: (p) => set({ profile: p }),
  setHydrated: (b) => set({ hydrated: b }),
}));

export function hasAdminToken(): boolean { return Boolean(getToken()); }

/* ─── Refund management ──────────────────────────────────────────────── */
export interface AdminRefundRequest {
  id:                      string;
  user_id:                 string;
  subscription_type:       "creator" | "ai";
  plan_code:               string;
  payment_amount_php:      number;
  estimated_used_php:      number;
  estimated_refundable_php: number;
  requested_amount_php:    number | null;
  approved_amount_php:     number | null;
  credits_total:           number;
  credits_used:            number;
  credits_remaining:       number;
  ai_requests_used:        number;
  ai_requests_limit:       number;
  reason:                  string;
  description:             string;
  screenshot_url:          string | null;
  payment_reference:       string | null;
  status:                  "pending" | "reviewing" | "approved" | "partial" | "rejected";
  payout_status:           "queued" | "processing" | "sent" | "failed" | null;
  payout_ref:              string | null;
  payout_at:               string | null;
  abuse_score:             number;
  is_flagged:              boolean;
  flag_reason:             string | null;
  admin_notes:             string | null;
  reviewed_by:             string | null;
  reviewed_at:             string | null;
  created_at:              string;
  updated_at:              string;
  users?: { username: string | null; name: string | null; email: string | null } | null;
}

export interface AdminRefundStats {
  total:               number;
  pending:             number;
  reviewing:           number;
  approved:            number;
  partial:             number;
  rejected:            number;
  total_approved_php:  number;
  creator_pending:     number;
  ai_pending:          number;
}

export const adminListRefunds = (
  status = "pending",
  type   = "all",
  limit  = 100,
) =>
  adminFetch<{ requests: AdminRefundRequest[] }>(
    `/admin/refunds?status=${encodeURIComponent(status)}&type=${encodeURIComponent(type)}&limit=${limit}`,
  ).then((r) => r.requests);

export const adminGetRefundStats = () =>
  adminFetch<{ stats: AdminRefundStats }>("/admin/refunds/stats").then((r) => r.stats);

export const adminGetRefundDetail = (id: string) =>
  adminFetch<{ request: AdminRefundRequest; decisions: unknown[] }>(`/admin/refunds/${id}`);

export const adminDecideRefund = (
  id:         string,
  action:     "approve" | "partial" | "reject" | "review",
  notes?:     string,
  amount_php?: number,
) =>
  adminFetch<{ ok: true; status: string; approved_amount_php: number | null }>(
    `/admin/refunds/${id}/decide`,
    { method: "POST", body: JSON.stringify({ action, notes, amount_php }) },
  );

export const adminFlagRefund = (id: string, reason: string) =>
  adminFetch<{ ok: true }>(`/admin/refunds/${id}/flag`, {
    method: "POST", body: JSON.stringify({ reason }),
  });

/* ─── Community Funding ─────────────────────────────────────────────── */

export interface AdminFundingDonation {
  id:             string;
  user_id:        string;
  amount:         number;
  payment_method: string;
  reference_no:   string | null;
  screenshot_url: string | null;
  status:         "pending" | "approved" | "rejected";
  admin_notes:    string | null;
  created_at:     string;
  approved_at:    string | null;
  profiles?: { username: string | null; display_name: string | null; email: string | null } | null;
}

export interface AdminFundingStats {
  funding: {
    target_amount:    number;
    current_amount:   number;
    supporters_count: number;
    is_goal_reached:  boolean;
    unlock_phase:     number;
  } | null;
  pending:  number;
  approved: number;
  rejected: number;
  total:    number;
}

export const adminGetFundingStats = () =>
  adminFetch<AdminFundingStats>("/admin/funding/stats");

export const adminListFundingDonations = (status = "pending", limit = 100) =>
  adminFetch<{ donations: AdminFundingDonation[] }>(
    `/admin/funding/donations?status=${encodeURIComponent(status)}&limit=${limit}`,
  ).then((r) => r.donations);

export const adminApproveFunding = (id: string, notes?: string) =>
  adminFetch<{ ok: true }>(`/admin/funding/donations/${id}/approve`, {
    method: "POST", body: JSON.stringify({ notes }),
  });

export const adminRejectFunding = (id: string, notes?: string) =>
  adminFetch<{ ok: true }>(`/admin/funding/donations/${id}/reject`, {
    method: "POST", body: JSON.stringify({ notes }),
  });

export const adminUpdateFundingGoal = (patch: Record<string, unknown>) =>
  adminFetch<{ ok: true }>("/admin/funding/goal", {
    method: "POST", body: JSON.stringify(patch),
  });

/* ── Refund Thread (admin message helpers) ───────────────────────────── */

export interface AdminRefundMessage {
  id: string;
  sender_id: string | null;
  sender_role: "user" | "admin" | "system";
  message: string;
  attachment_url: string | null;
  is_internal_note: boolean;
  created_at: string;
}

export const adminListRefundMessages = (refundId: string) =>
  adminFetch<{ messages: AdminRefundMessage[] }>(
    `/admin/refunds/${encodeURIComponent(refundId)}/messages`,
  ).then((r) => r.messages);

export const adminSendRefundMessage = (
  refundId: string, message: string, isInternal = false,
) =>
  adminFetch<{ ok: true }>(
    `/admin/refunds/${encodeURIComponent(refundId)}/messages`,
    { method: "POST", body: JSON.stringify({ message, is_internal_note: isInternal }) },
  );

export const adminRequestProof = (refundId: string, note?: string) =>
  adminFetch<{ ok: true }>(
    `/admin/refunds/${encodeURIComponent(refundId)}/proof-request`,
    { method: "POST", body: JSON.stringify({ note }) },
  );

export const adminUpdatePayout = (
  refundId: string, payoutStatus: string, payoutRef?: string,
) =>
  adminFetch<{ ok: true; payout_status: string }>(
    `/admin/refunds/${encodeURIComponent(refundId)}/payout`,
    { method: "PATCH", body: JSON.stringify({ payout_status: payoutStatus, payout_ref: payoutRef }) },
  );

/* ── Admin Receipt Review Center ─────────────────────────────────────── */

export interface AdminReceiptStats {
  total:            number;
  pending_review:   number;
  suspicious:       number;
  blocked:          number;
  approved:         number;
  rejected:         number;
  proof_requested:  number;
  avg_fraud_score:  number;
}

export interface AdminReceiptRow {
  id:                       string;
  user_id:                  string;
  image_url:                string;
  manual_reference:         string;
  extracted_reference:      string | null;
  verification_status:      string;
  review_status:            string | null;
  fraud_score:              number;
  blur_score:               number | null;
  tamper_score:             number | null;
  tamper_detected:          boolean | null;
  ai_detection_score:       number | null;
  structure_score:          number | null;
  receipt_field_count:      number | null;
  extracted_amount:         number | null;
  extracted_payment_method: string | null;
  extracted_date:           string | null;
  ocr_engine:               string | null;
  block_code:               string | null;
  proof_requested:          boolean | null;
  reviewed_by:              string | null;
  reviewed_at:              string | null;
  fraud_reasons:            { type: string; detail: string; points: number }[] | null;
  created_at:               string;
  user:                     { username: string; name: string; email: string } | null;
}

export interface AdminReceiptNote {
  id:          string;
  admin_id:    string;
  admin_name:  string | null;
  note:        string;
  is_internal: boolean;
  created_at:  string;
}

export interface AdminReceiptDetail extends AdminReceiptRow {
  ocr_raw_text:           string | null;
  review_notes:           string | null;
  notes:                  AdminReceiptNote[];
  user_receipt_history:   {
    id: string;
    manual_reference: string;
    fraud_score: number;
    verification_status: string;
    review_status: string | null;
    created_at: string;
  }[];
}

export const adminGetReceiptStats = () =>
  adminFetch<AdminReceiptStats>("/admin/receipts/stats");

export const adminListReceipts = (
  status = "needs_review",
  search = "",
  limit  = 100,
) =>
  adminFetch<{ receipts: AdminReceiptRow[] }>(
    `/admin/receipts?status=${encodeURIComponent(status)}&search=${encodeURIComponent(search)}&limit=${limit}`,
  ).then((r) => r.receipts);

export const adminGetReceiptDetail = (id: string) =>
  adminFetch<{ receipt: AdminReceiptDetail }>(`/admin/receipts/${encodeURIComponent(id)}`)
    .then((r) => r.receipt);

export const adminDecideReceipt = (
  id:     string,
  action: "approved" | "rejected" | "suspicious",
  notes?: string,
) =>
  adminFetch<{ ok: true; review_status: string }>(
    `/admin/receipts/${encodeURIComponent(id)}/decide`,
    { method: "POST", body: JSON.stringify({ action, notes }) },
  );

export const adminRequestReceiptProof = (id: string, note?: string) =>
  adminFetch<{ ok: true }>(
    `/admin/receipts/${encodeURIComponent(id)}/proof`,
    { method: "POST", body: JSON.stringify({ note }) },
  );

export const adminAddReceiptNote = (id: string, note: string) =>
  adminFetch<{ ok: true; note: AdminReceiptNote }>(
    `/admin/receipts/${encodeURIComponent(id)}/notes`,
    { method: "POST", body: JSON.stringify({ note }) },
  );

/* ── Admin Analytics (Enterprise Dashboard) ──────────────────────────── */

export interface AnalyticsTotals {
  total:          number;
  verified:       number;
  suspicious:     number;
  blocked:        number;
  pending_review: number;
  ai_alerts:      number;
  duplicates:     number;
  tampered:       number;
}

export interface AnalyticsDayPoint {
  date:       string;
  label:      string;
  total:      number;
  verified:   number;
  suspicious: number;
  blocked:    number;
}

export interface AnalyticsScoreBucket {
  range: string;
  count: number;
}

export interface AnalyticsBreakdownSlice {
  name:  string;
  value: number;
  color: string;
}

export interface AnalyticsAlert {
  id:                       string;
  user_id:                  string;
  user:                     { username: string; name: string } | null;
  verification_status:      string;
  fraud_score:              number;
  blur_score:               number;
  tamper_detected:          boolean;
  ai_detection_score:       number;
  manual_reference:         string;
  image_url:                string;
  extracted_amount:         number | null;
  extracted_payment_method: string | null;
  created_at:               string;
}

export interface AnalyticsOverview {
  totals:                 AnalyticsTotals;
  dailyTrend:             AnalyticsDayPoint[];
  scoreDistribution:      AnalyticsScoreBucket[];
  verificationBreakdown:  AnalyticsBreakdownSlice[];
  recentAlerts:           AnalyticsAlert[];
}

export const adminGetAnalytics = () =>
  adminFetch<AnalyticsOverview>("/admin/analytics/overview");

/* ── Fraud Analytics — Phase 3 ───────────────────────────────────────── */

export interface FraudDayPoint {
  date:       string;
  label:      string;
  count:      number;
  avg_score:  number;
  blocked:    number;
  approved:   number;
  rejected:   number;
  suspicious: number;
  flagged:    number;
}

export interface FraudSignal {
  type:       string;
  count:      number;
  avg_points: number;
}

export interface HourlyPoint {
  hour:    number;
  count:   number;
  flagged: number;
}

export interface FraudAnalyticsSummary {
  total:         number;
  auto_blocked:  number;
  tampered:      number;
  high_ai_score: number;
  fraud_rate:    number;
  reviewed:      number;
  review_rate:   number;
}

export interface FraudAnalyticsData {
  daily_trends:         FraudDayPoint[];
  risk_distribution:    { low: number; medium: number; high: number; critical: number };
  outcome_distribution: { approved: number; rejected: number; suspicious: number; blocked: number; pending: number };
  top_signals:          FraudSignal[];
  hourly_distribution:  HourlyPoint[];
  summary:              FraudAnalyticsSummary;
}

export const adminGetFraudAnalytics = () =>
  adminFetch<FraudAnalyticsData>("/admin/analytics/fraud");

/* ── Audit log ─────────────────────────────────────────────────────────── */
export const adminFetchAuditLog = (params: {
  limit?:  number;
  offset?: number;
  action?: string;
  admin?:  string;
  since?:  string;
  stats?:  boolean;
}) => {
  const { stats, ...rest } = params;
  const qs = new URLSearchParams(
    Object.fromEntries(
      Object.entries(rest)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => [k, String(v)]),
    ),
  ).toString();
  const path = stats ? "/admin/audit-log/stats" : `/admin/audit-log${qs ? `?${qs}` : ""}`;
  return adminFetch<{
    entries?: unknown[];
    total?:   number;
    logins?:  number;
    fraud?:   number;
    events?:  unknown[];
    _fallback?: boolean;
    _schema_warning?: boolean;
  }>(path);
};
