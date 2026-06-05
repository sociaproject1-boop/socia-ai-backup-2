/**
 * starsClient.ts — Creator Stars API client
 * Wraps all /api/stars/* and /api/admin/stars/* endpoints.
 */
import { supabase } from "./supabase";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const jwt = data.session?.access_token;
  if (!jwt) return {};
  return { Authorization: `Bearer ${jwt}` };
}

/* ─── Types ────────────────────────────────────────────────────────────────── */

export interface StarWallet {
  balance:           number;
  lifetime_received: number;
  lifetime_sent:     number;
  updated_at?:       string;
}

export interface StarUser {
  id:         string;
  name:       string | null;
  username:   string | null;
  avatar_url: string | null;
}

export interface StarTransaction {
  id:           string;
  sender_id:    string | null;
  receiver_id:  string;
  amount:       number;
  status:       "processing" | "completed" | "failed" | "refunded";
  reference_id: string | null;
  metadata:     Record<string, unknown>;
  created_at:   string;
  sender:       StarUser | null;
  receiver:     StarUser | null;
}

export interface AdminStarsOverview {
  stats: {
    total_stars_sent:   number;
    total_transactions: number;
  };
  top_creators:          Array<{ user_id: string; lifetime_received: number; users: StarUser }>;
  top_supporters:        Array<{ user_id: string; lifetime_sent:     number; users: StarUser }>;
  recent_transactions:   StarTransaction[];
  suspicious_sender_ids: string[];
}

/* ─── POST /api/stars/send ─────────────────────────────────────────────────── */
export async function sendStars(opts: {
  receiver_id:   string;
  amount:        number;
  reference_id?: string;
}): Promise<{ ok: true; transaction_id: string; sender_balance: number }> {
  const r = await fetch(`${BASE}/api/stars/send`, {
    method:  "POST",
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body:    JSON.stringify(opts),
  });
  const json = await r.json();
  if (!r.ok || !json.ok) throw new Error(json.error ?? "send_stars_failed");
  return json;
}

/* ─── GET /api/stars/balance ───────────────────────────────────────────────── */
export async function getStarBalance(): Promise<StarWallet> {
  const r = await fetch(`${BASE}/api/stars/balance`, {
    headers: await authHeaders(),
  });
  if (!r.ok) throw new Error("failed to load star balance");
  const { wallet } = await r.json();
  return wallet as StarWallet;
}

/* ─── GET /api/stars/history ───────────────────────────────────────────────── */
export async function getStarHistory(opts?: {
  limit?:     number;
  offset?:    number;
  direction?: "sent" | "received" | "all";
}): Promise<StarTransaction[]> {
  const params = new URLSearchParams();
  if (opts?.limit     != null) params.set("limit",     String(opts.limit));
  if (opts?.offset    != null) params.set("offset",    String(opts.offset));
  if (opts?.direction)         params.set("direction", opts.direction);
  const r = await fetch(`${BASE}/api/stars/history?${params}`, {
    headers: await authHeaders(),
  });
  if (!r.ok) throw new Error("failed to load star history");
  const { transactions } = await r.json();
  return transactions as StarTransaction[];
}

/* ─── GET /api/stars/creator-summary/:userId ───────────────────────────────── */
export async function getCreatorStarSummary(userId: string): Promise<{
  wallet:         StarWallet;
  top_supporters: Array<{ sender_id: string; amount: number; sender: StarUser }>;
}> {
  const r = await fetch(`${BASE}/api/stars/creator-summary/${userId}`, {
    headers: await authHeaders(),
  });
  if (!r.ok) throw new Error("failed to load creator summary");
  return r.json();
}

/* ─── Admin: GET /api/admin/stars/overview ─────────────────────────────────── */
export async function getAdminStarsOverview(): Promise<AdminStarsOverview> {
  const r = await fetch(`${BASE}/api/admin/stars/overview`, {
    headers: await authHeaders(),
  });
  if (!r.ok) throw new Error("failed to load admin stars overview");
  return r.json();
}

/* ─── Admin: POST /api/admin/stars/grant ───────────────────────────────────── */
export async function adminGrantStars(opts: {
  user_id: string;
  amount:  number;
  reason?: string;
}): Promise<{ ok: boolean; new_balance?: number; error?: string }> {
  const r = await fetch(`${BASE}/api/admin/stars/grant`, {
    method:  "POST",
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body:    JSON.stringify(opts),
  });
  return r.json();
}
