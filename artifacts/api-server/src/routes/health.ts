/**
 * /healthz — runtime liveness + dependency probe.
 *
 * The platform load balancer uses this to decide if an instance is
 * eligible for traffic. Previously this endpoint always returned 200/ok
 * even when DB was unreachable or critical env vars were missing, so
 * broken instances kept receiving requests. It now does a real check:
 *
 *   - Supabase reachable (anon client SELECT 1 with 1 s budget)
 *   - Critical env vars present (FAL_KEY, OPENAI key, SERVICE_ROLE, PAYMONGO)
 *
 * Behavior:
 *   - 200 + { status: "ok",       checks: {...} } — everything green
 *   - 200 + { status: "degraded", checks: {...} } — optional providers missing
 *                                                   (server can still serve some routes)
 *   - 503 + { status: "down",     checks: {...} } — DB unreachable / hard fail
 *
 * The `HealthCheckResponse` Zod schema only requires `status`, so the
 * extra `checks` field is permitted (Zod object().parse drops unknowns
 * by default — we use spread to bypass that).
 */
import { Router, type IRouter } from "express";
import { createClient } from "@supabase/supabase-js";
import { logger } from "../lib/logger.js";

const router: IRouter = Router();

// Probe budget — keep tight so /healthz can never become slow itself.
const DB_PROBE_TIMEOUT_MS = 1_000;

/** Wrap a promise with a timeout that resolves to a sentinel on miss. */
async function withTimeout<T>(p: Promise<T>, ms: number, onTimeout: T): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((resolve) => setTimeout(() => resolve(onTimeout), ms)),
  ]);
}

/** Real DB probe via Supabase anon client. SELECT count on a tiny table. */
async function probeSupabase(): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
  const url     = process.env["SUPABASE_URL"];
  const anonKey = process.env["SUPABASE_ANON_KEY"];
  if (!url || !anonKey) return { ok: false, latencyMs: 0, error: "missing_credentials" };

  const t0 = Date.now();
  try {
    const sb = createClient(url, anonKey, { auth: { persistSession: false } });
    // Tiny query against a known-public-or-RLS-safe table. Using a row-count
    // on plans (which exists per migration 34) — RLS allows anon SELECT.
    const result = await withTimeout(
      Promise.resolve(sb.from("plans").select("code", { count: "exact", head: true })).then(r => ({ error: r.error ? { message: r.error.message } : null })),
      DB_PROBE_TIMEOUT_MS,
      { error: { message: "timeout" } },
    );
    const latencyMs = Date.now() - t0;
    if (result.error) return { ok: false, latencyMs, error: result.error.message };
    return { ok: true, latencyMs };
  } catch (err) {
    return {
      ok: false,
      latencyMs: Date.now() - t0,
      error: err instanceof Error ? err.message : "unknown",
    };
  }
}

router.get("/healthz", async (_req, res) => {
  const env = {
    SUPABASE_URL:              !!process.env["SUPABASE_URL"],
    SUPABASE_ANON_KEY:         !!process.env["SUPABASE_ANON_KEY"],
    SUPABASE_SERVICE_ROLE_KEY: !!process.env["SUPABASE_SERVICE_ROLE_KEY"],
    FAL_KEY:                   !!process.env["FAL_KEY"],
    AI_INTEGRATIONS_OPENAI_API_KEY:
                               !!process.env["AI_INTEGRATIONS_OPENAI_API_KEY"]
                            || !!process.env["OPENAI_API_KEY"],
    XAI_API_KEY:               !!process.env["XAI_API_KEY"],
    PAYMONGO_SECRET_KEY:       !!process.env["PAYMONGO_SECRET_KEY"],
    PAYMONGO_WEBHOOK_SECRET:   !!process.env["PAYMONGO_WEBHOOK_SECRET"],
  };

  const db = await probeSupabase();

  // Status decision matrix:
  //   - DB down → "down" (503). LB should drain this instance.
  //   - Any *required* env missing → "down" (503). Server cannot honor
  //     auth or persist anything, so it's no use serving traffic.
  //   - Any *optional* provider env missing → "degraded" (200, soft).
  //     We still serve, but advertise the gap so monitoring can alert.
  const required = env.SUPABASE_URL && env.SUPABASE_ANON_KEY && env.SUPABASE_SERVICE_ROLE_KEY;
  const optional = env.FAL_KEY && env.AI_INTEGRATIONS_OPENAI_API_KEY && env.XAI_API_KEY
                 && env.PAYMONGO_SECRET_KEY && env.PAYMONGO_WEBHOOK_SECRET;

  let status: "ok" | "degraded" | "down";
  let http:   200 | 503;
  if (!db.ok || !required) { status = "down";     http = 503; }
  else if (!optional)      { status = "degraded"; http = 200; }
  else                     { status = "ok";       http = 200; }

  if (status !== "ok") {
    logger.warn({ status, db, env }, "[healthz] non-ok status");
  }

  res.status(http).json({
    status,
    checks: {
      db,
      env,
    },
    workerId: process.pid,
    uptime:   Math.floor(process.uptime()),
  });
});

export default router;
