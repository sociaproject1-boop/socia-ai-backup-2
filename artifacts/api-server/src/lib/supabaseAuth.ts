import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Request, RequestHandler } from "express";

function getSupabaseUrl(): string {
  return process.env["VITE_SUPABASE_URL"] ?? process.env["SUPABASE_URL"] ?? "";
}
function getSupabaseAnon(): string {
  return process.env["VITE_SUPABASE_ANON_KEY"] ?? process.env["SUPABASE_ANON_KEY"] ?? "";
}

export interface AuthedUser {
  id:    string;
  email: string | null;
  jwt:   string;
}

export interface QuotaResult {
  allowed:   boolean;
  plan:      "free" | "active" | "owner";
  remaining: number;
  limit:     number;
  kind:      "image" | "video";
}

/** Per-request Supabase client carrying the caller's JWT — RLS applies as that user. */
function clientForJwt(jwt: string): SupabaseClient {
  return createClient(getSupabaseUrl(), getSupabaseAnon(), {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth:   { persistSession: false, autoRefreshToken: false },
  });
}

/** Convenience accessors — read what `requireAuth` attached to the request. */
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

/** Verifies the bearer token. On success, attaches authedUser + supabase to req. */
export const requireAuth: RequestHandler = async (req, res, next) => {
  const header = req.header("authorization") ?? req.header("Authorization") ?? "";
  const match  = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!match) {
    res.status(401).json({ error: "Missing or malformed Authorization header", code: "UNAUTHENTICATED" });
    return;
  }
  const jwt = match[1]!.trim();

  const sb = clientForJwt(jwt);
  const { data, error } = await sb.auth.getUser(jwt);
  if (error || !data?.user) {
    res.status(401).json({ error: "Invalid or expired session", code: "UNAUTHENTICATED" });
    return;
  }

  const decorated = req as Request & { authedUser?: AuthedUser; supabase?: SupabaseClient };
  decorated.authedUser = { id: data.user.id, email: data.user.email ?? null, jwt };
  decorated.supabase   = sb;
  next();
};

/**
 * Calls the SECURITY DEFINER RPC `consume_generation_quota(p_kind)`.
 * The RPC derives the plan and limits server-side from `users.subscription_status`
 * — the client cannot spoof either.
 */
export async function consumeGenerationQuota(
  sb: SupabaseClient,
  kind: "image" | "video",
): Promise<QuotaResult> {
  const { data, error } = await sb.rpc("consume_generation_quota", { p_kind: kind });
  if (error) {
    throw new Error(`Quota check failed: ${error.message}`);
  }
  const r = data as Partial<QuotaResult> | null;
  if (!r || typeof r.allowed !== "boolean") {
    throw new Error("Quota RPC returned an unexpected payload");
  }
  return {
    allowed:   r.allowed,
    plan:      (r.plan ?? "free") as QuotaResult["plan"],
    remaining: typeof r.remaining === "number" ? r.remaining : 0,
    limit:     typeof r.limit     === "number" ? r.limit     : 0,
    kind,
  };
}
