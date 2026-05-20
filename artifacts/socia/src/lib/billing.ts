/**
 * Client billing layer — typed RPC wrappers + Zustand store + helpers.
 *
 * IMPORTANT:
 *   - All sensitive ops (submit/approve/reject/adjust) live in SECURITY DEFINER
 *     Postgres functions; the client only invokes them. RLS on the underlying
 *     tables enforces self-only / admin-only reads.
 *   - SHA256 of the receipt file is computed in-browser via SubtleCrypto; it
 *     deduplicates uploads and lets the admin dashboard see flagged orders.
 */
import { create } from "zustand";
import { supabase } from "./supabase";

export type PlanCode = "free" | "p15" | "p30";

export interface Plan {
  code:           PlanCode;
  name:           string;
  price_php:      number;
  credits:        number;
  duration_days:  number;
  hd_enabled:     boolean;
  watermark:      boolean;
  is_active:      boolean;
  sort:           number;
}

export interface TopupPackage {
  code:        string;
  label:       string;
  credits:     number;
  price_php:   number;
  bonus_label: string | null;
  is_active:   boolean;
  sort:        number;
}

export interface BillingSummary {
  is_owner:        boolean;
  plan_code:       PlanCode;
  credits:         number;
  plan_credits:    number;
  plan_started_at: string | null;
  plan_expires_at: string | null;
  smart_saver:     boolean;
  cooldown_until:  string | null;
  total_spent_php: number;
}

export interface PaymentMethodsConfig {
  gcash_name:        string | null;
  gcash_number:      string | null;
  gcash_qr_url:      string | null;
  maya_name:         string | null;
  maya_number:       string | null;
  maya_qr_url:       string | null;
  bank_name:         string | null;
  bank_account_name: string | null;
  bank_account_no:   string | null;
  notes:             string | null;
}

export interface PaymentOrder {
  id:                string;
  user_id:           string;
  kind:              "subscription" | "topup";
  plan_code:         PlanCode | null;
  topup_code:        string | null;
  amount_php:        number;
  credits_to_grant:  number;
  payment_method:    "gcash" | "maya" | "bank";
  reference_no:      string;
  sender_name:       string | null;
  receipt_path:      string;
  receipt_sha256:    string;
  status:            "pending" | "approved" | "rejected" | "expired";
  rejection_reason:  string | null;
  reviewed_at:       string | null;
  flagged:           boolean;
  flag_reason:       string | null;
  created_at:        string;
  /** Joined fields when listed by admin_list_orders */
  username?:     string | null;
  display_name?: string | null;
  email?:        string | null;
}

/* ─── Timeout guard ──────────────────────────────────────────────────────── *
 * Races any Supabase PromiseLike against a hard wall-clock timeout so that
 * a slow/unreachable DB never leaves a loading spinner stuck forever.
 * 8 s is generous on mobile while still resolving before browser fetch limits.
 */
const QUERY_TIMEOUT_MS = 8_000;
function withTimeout<T>(p: PromiseLike<T>, ms = QUERY_TIMEOUT_MS): Promise<T> {
  let tid: ReturnType<typeof setTimeout>;
  const guard = new Promise<T>((_, reject) => {
    tid = setTimeout(() => reject(new Error("Request timed out")), ms);
  });
  return Promise.race([Promise.resolve(p), guard]).finally(() => clearTimeout(tid!));
}

/* ─────────────── reads ─────────────── */
export async function fetchPlans(): Promise<Plan[]> {
  const { data, error } = await withTimeout(
    supabase.from("plans").select("*").eq("is_active", true).order("sort"),
  );
  if (error) throw error;
  return (data ?? []) as Plan[];
}
export async function fetchTopups(): Promise<TopupPackage[]> {
  const { data, error } = await withTimeout(
    supabase.from("topup_packages").select("*").eq("is_active", true).order("sort"),
  );
  if (error) throw error;
  return (data ?? []) as TopupPackage[];
}
export async function fetchPaymentMethods(): Promise<PaymentMethodsConfig | null> {
  const { data, error } = await withTimeout(
    supabase.from("payment_methods_config").select("*").eq("id", 1).maybeSingle(),
  );
  if (error) throw error;
  return (data ?? null) as PaymentMethodsConfig | null;
}

export interface PaymentSettings {
  gcash_enabled:     boolean;
  gcash_name:        string | null;
  gcash_number:      string | null;
  gcash_qr_url:      string | null;
  maya_enabled:      boolean;
  maya_name:         string | null;
  maya_number:       string | null;
  maya_qr_url:       string | null;
  bank_enabled:      boolean;
  bank_name:         string | null;
  bank_account_name: string | null;
  bank_account_no:   string | null;
  bank_qr_url:       string | null;
  notes:             string | null;
}

/**
 * Fetches active payment settings from the payment_settings table (admin-managed).
 * Falls back to payment_methods_config (with all methods treated as enabled)
 * if the SQL migration for payment_settings hasn't been run yet.
 */
export async function fetchPaymentSettings(): Promise<PaymentSettings | null> {
  const { data, error } = await withTimeout(
    supabase.from("payment_settings").select("*").eq("id", 1).maybeSingle(),
  );
  if (!error && data) return data as PaymentSettings;
  // Fallback: legacy table — treat all three methods as enabled
  const legacy = await fetchPaymentMethods().catch(() => null);
  if (!legacy) return null;
  return {
    gcash_enabled:     true,
    gcash_name:        legacy.gcash_name,
    gcash_number:      legacy.gcash_number,
    gcash_qr_url:      legacy.gcash_qr_url,
    maya_enabled:      true,
    maya_name:         legacy.maya_name,
    maya_number:       legacy.maya_number,
    maya_qr_url:       legacy.maya_qr_url,
    bank_enabled:      true,
    bank_name:         legacy.bank_name,
    bank_account_name: legacy.bank_account_name,
    bank_account_no:   legacy.bank_account_no,
    bank_qr_url:       null,
    notes:             legacy.notes,
  };
}
export async function fetchMyBilling(): Promise<BillingSummary> {
  const { data, error } = await withTimeout(supabase.rpc("my_billing_summary"));
  if (error) throw error;
  return data as BillingSummary;
}
export async function fetchMyOrders(limit = 20): Promise<PaymentOrder[]> {
  const { data, error } = await withTimeout(
    supabase
      .from("payment_orders")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit),
  );
  if (error) throw error;
  return (data ?? []) as PaymentOrder[];
}
export interface LedgerEntry {
  id: number;
  delta: number;
  reason: string;
  ref_id: string | null;
  balance_after: number;
  created_at: string;
}
export async function fetchMyLedger(limit = 50): Promise<LedgerEntry[]> {
  const { data, error } = await withTimeout(
    supabase
      .from("credit_ledger")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit),
  );
  if (error) throw error;
  return (data ?? []) as LedgerEntry[];
}
export async function fetchAmIAdmin(): Promise<boolean> {
  const u = (await supabase.auth.getUser()).data.user;
  if (!u) return false;
  const { data, error } = await withTimeout(
    supabase.from("admins").select("user_id").eq("user_id", u.id).maybeSingle(),
  );
  if (error) return false;
  return !!data;
}

/* ─────────────── PayMongo automated checkout ─────────────── */

/**
 * Creates a PayMongo checkout session on the backend and returns the
 * hosted checkout_url. The caller should `window.location.assign(url)` to
 * redirect the user to GCash/Maya/Card selection.
 *
 * Backend stores a pending row in `paymongo_payments`; the webhook flips
 * status to 'paid' and credits the user atomically.
 */
export async function createPaymongoCheckout(
  plan: PlanCode,
): Promise<{ ref: string; checkout_url: string }> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error("Not signed in.");

  const r = await fetch("/api/paymongo/checkout-session", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ plan }),
  });
  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    throw new Error((body as { code?: string; error?: string }).code ?? body.error ?? `Checkout failed (${r.status})`);
  }
  const j = await r.json() as { ref: string; checkout_url: string };
  if (!j.checkout_url) throw new Error("Missing checkout URL from server.");
  return j;
}

export interface PaymongoPaymentStatus {
  id:               string;
  status:           "pending" | "paid" | "failed" | "cancelled" | "expired";
  plan_code:        string;
  credits_added:    number;
  amount_centavos:  number;
  paid_at:          string | null;
}

export async function fetchPaymongoPayment(ref: string): Promise<PaymongoPaymentStatus> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error("Not signed in.");

  const r = await fetch(`/api/paymongo/payment/${encodeURIComponent(ref)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    throw new Error((body as { code?: string }).code ?? `Lookup failed (${r.status})`);
  }
  const j = await r.json() as { payment: PaymongoPaymentStatus };
  return j.payment;
}

/* ─────────────── writes (RPCs) ─────────────── */
export async function submitPayment(args: {
  kind:           "subscription" | "topup";
  plan_code:      PlanCode | null;
  topup_code:     string | null;
  payment_method: "gcash" | "maya" | "bank";
  reference_no:   string;
  sender_name:    string | null;
  receipt_path:   string;
  receipt_sha256: string;
}): Promise<{ id: string; flagged: boolean; flag_reason: string | null }> {
  const { data, error } = await supabase.rpc("submit_payment", {
    p_kind:           args.kind,
    p_plan_code:      args.plan_code,
    p_topup_code:     args.topup_code,
    p_payment_method: args.payment_method,
    p_reference_no:   args.reference_no,
    p_sender_name:    args.sender_name,
    p_receipt_path:   args.receipt_path,
    p_receipt_sha256: args.receipt_sha256,
  });
  if (error) throw new Error(error.message);
  return data as { id: string; flagged: boolean; flag_reason: string | null };
}

export async function adminListOrders(status: "pending" | "approved" | "rejected" | null = "pending", limit = 100): Promise<PaymentOrder[]> {
  const { data, error } = await supabase.rpc("admin_list_orders", { p_status: status, p_limit: limit });
  if (error) throw error;
  return (data ?? []) as PaymentOrder[];
}
export async function adminApprove(id: string) {
  const { data, error } = await supabase.rpc("approve_payment", { p_order_id: id });
  if (error) throw new Error(error.message);
  return data;
}
export async function adminReject(id: string, reason: string) {
  const { data, error } = await supabase.rpc("reject_payment", { p_order_id: id, p_reason: reason });
  if (error) throw new Error(error.message);
  return data;
}
export async function adminAdjustCredits(userId: string, delta: number, reason: string) {
  const { data, error } = await supabase.rpc("admin_adjust_credits", { p_user: userId, p_delta: delta, p_reason: reason });
  if (error) throw new Error(error.message);
  return data;
}

/* ─────────────── helpers ─────────────── */

/** Compute SHA-256 (hex) of a File via the browser SubtleCrypto. */
export async function sha256OfFile(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Upload a receipt to the private 'payment-receipts' bucket. */
export async function uploadReceipt(file: File): Promise<{ path: string; sha256: string }> {
  const u = (await supabase.auth.getUser()).data.user;
  if (!u) throw new Error("Not signed in");
  const sha256 = await sha256OfFile(file);
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 6) || "jpg";
  const path = `${u.id}/${Date.now()}_${sha256.slice(0, 12)}.${ext}`;
  const { error } = await supabase.storage.from("payment-receipts").upload(path, file, {
    contentType: file.type || "image/jpeg",
    upsert:      false,
  });
  if (error) throw new Error(`Receipt upload failed: ${error.message}`);
  return { path, sha256 };
}

/* ─────────────── store ─────────────── */

/* How long (ms) to wait before allowing another billing refresh.
 * Prevents spamming the my_billing_summary RPC on every tab-focus event
 * on mobile, where switching apps triggers visibility changes constantly. */
const BILLING_REFRESH_DEBOUNCE_MS = 5 * 60_000; // 5 minutes

interface BillingStore {
  summary:         BillingSummary | null;
  loading:         boolean;
  lastRefreshedAt: number;
  setSummary:      (s: BillingSummary | null) => void;
  setLoading:      (b: boolean) => void;
  refresh:         () => Promise<void>;
  /** Force a refresh regardless of debounce (e.g. after a payment action). */
  forceRefresh:    () => Promise<void>;
}

export const useBillingStore = create<BillingStore>((set, get) => ({
  summary:         null,
  loading:         false,
  lastRefreshedAt: 0,

  setSummary: (s) => set({ summary: s }),
  setLoading: (b) => set({ loading: b }),

  refresh: async () => {
    const { lastRefreshedAt, loading } = get();
    // Skip if already loading or refreshed recently
    if (loading) return;
    if (lastRefreshedAt > 0 && Date.now() - lastRefreshedAt < BILLING_REFRESH_DEBOUNCE_MS) return;
    set({ loading: true, lastRefreshedAt: Date.now() });
    try {
      const s = await fetchMyBilling();
      set({ summary: s });
    } catch (e) {
      console.warn("[billing] refresh failed:", e);
    } finally {
      set({ loading: false });
    }
  },

  forceRefresh: async () => {
    set({ loading: true, lastRefreshedAt: Date.now() });
    try {
      const s = await fetchMyBilling();
      set({ summary: s });
    } catch (e) {
      console.warn("[billing] forceRefresh failed:", e);
    } finally {
      set({ loading: false });
    }
  },
}));

/** Format a "X days, Y hours" remaining string from an ISO expiry. */
export function formatRemaining(expiresIso: string | null | undefined): string {
  if (!expiresIso) return "—";
  const ms = new Date(expiresIso).getTime() - Date.now();
  if (ms <= 0) return "expired";
  const days = Math.floor(ms / 86_400_000);
  const hrs  = Math.floor((ms % 86_400_000) / 3_600_000);
  if (days >= 1) return `${days}d ${hrs}h`;
  const mins = Math.floor((ms % 3_600_000) / 60_000);
  return `${hrs}h ${mins}m`;
}
