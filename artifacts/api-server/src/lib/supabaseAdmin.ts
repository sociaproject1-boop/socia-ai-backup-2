/**
 * supabaseAdmin.ts — Lightweight Supabase Auth verifier for the backend.
 *
 * Instead of using the full @supabase/supabase-js client (which requires
 * WebSocket/ws on Node 20), this module calls Supabase Auth's REST API
 * directly via fetch. Only the auth.getUser() use-case is needed here.
 *
 * DO NOT expose the service role key to the frontend.
 */
import { logger } from "./logger.js";

const SUPABASE_URL  = (process.env["SUPABASE_URL"] ?? "").replace(/\/$/, "");
const SERVICE_KEY   = process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "";

export const isSupabaseAdminReady = Boolean(SUPABASE_URL && SERVICE_KEY);

if (!isSupabaseAdminReady) {
  logger.warn("[supabaseAdmin] SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set — Supabase JWT verification unavailable");
}

export interface SupabaseAuthUser {
  id:             string;
  email?:         string;
  user_metadata?: Record<string, unknown>;
  app_metadata?:  Record<string, unknown>;
}

/**
 * Verify a Supabase user access token and return the user, or null if invalid.
 * Calls GET /auth/v1/user with the token as a Bearer header.
 */
export async function verifySupabaseToken(token: string): Promise<SupabaseAuthUser | null> {
  if (!isSupabaseAdminReady) return null;
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        "Authorization": `Bearer ${token}`,
        "apikey":        SERVICE_KEY,
      },
    });
    if (!res.ok) return null;
    return await res.json() as SupabaseAuthUser;
  } catch (err) {
    logger.debug({ err: (err as Error).message }, "[supabaseAdmin] verifySupabaseToken fetch failed");
    return null;
  }
}
