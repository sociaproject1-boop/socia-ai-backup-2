/**
 * GET /api/health — Production health check
 *
 * Probes (all run in parallel, 3 s timeout each):
 *   database   — pg pool SELECT 1
 *   supabase   — Supabase REST API (public users count)
 *   storage    — Supabase Storage list buckets
 *   auth       — Supabase Auth service reachability
 *
 * Environment variables checked (required vs optional buckets).
 * Response-time measured for every probe.
 *
 * Does NOT modify /healthz — that route is untouched.
 */
import { Router } from "express";
import { pool }   from "../lib/db.js";
import { logger } from "../lib/logger.js";

const router = Router();

const PROBE_TIMEOUT_MS = 3_000;

/* ── helpers ─────────────────────────────────────────────────────────────── */

function timedPromise<T>(
  p: Promise<T>,
  timeoutMs: number,
): Promise<{ ok: boolean; latencyMs: number; error?: string; detail?: unknown }> {
  const t0 = Date.now();
  return Promise.race([
    p.then((detail) => ({ ok: true,  latencyMs: Date.now() - t0, detail }))
     .catch((err)   => ({ ok: false, latencyMs: Date.now() - t0, error: String(err?.message ?? err) })),
    new Promise<{ ok: false; latencyMs: number; error: string }>((resolve) =>
      setTimeout(() => resolve({ ok: false, latencyMs: timeoutMs, error: "timeout" }), timeoutMs),
    ),
  ]);
}

/* ── individual probes ───────────────────────────────────────────────────── */

async function probeDatabase() {
  if (!process.env["DATABASE_URL"]) {
    return { ok: false, latencyMs: 0, error: "DATABASE_URL not set" };
  }
  return timedPromise(
    pool.query("SELECT 1 AS ping").then((r: any) => ({ rows: r.rowCount })),
    PROBE_TIMEOUT_MS,
  );
}

async function probeSupabase() {
  const url  = process.env["SUPABASE_URL"] ?? process.env["VITE_SUPABASE_URL"] ?? "";
  const anon = process.env["SUPABASE_ANON_KEY"] ?? process.env["VITE_SUPABASE_ANON_KEY"] ?? "";
  if (!url || !anon) {
    return { ok: false, latencyMs: 0, error: "SUPABASE_URL or SUPABASE_ANON_KEY not set" };
  }
  return timedPromise(
    fetch(`${url}/rest/v1/users?select=count&limit=1`, {
      headers: {
        apikey:        anon,
        Authorization: `Bearer ${anon}`,
        "Content-Type": "application/json",
      },
    }).then(async (res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return { httpStatus: res.status };
    }),
    PROBE_TIMEOUT_MS,
  );
}

async function probeStorage() {
  const url     = process.env["SUPABASE_URL"] ?? process.env["VITE_SUPABASE_URL"] ?? "";
  const svcKey  = process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "";
  const anonKey = process.env["SUPABASE_ANON_KEY"] ?? process.env["VITE_SUPABASE_ANON_KEY"] ?? "";
  const key     = svcKey || anonKey;
  if (!url || !key) {
    return { ok: false, latencyMs: 0, error: "Supabase credentials not set" };
  }
  return timedPromise(
    fetch(`${url}/storage/v1/bucket`, {
      headers: {
        apikey:        key,
        Authorization: `Bearer ${key}`,
      },
    }).then(async (res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buckets = await res.json() as unknown[];
      return { buckets: Array.isArray(buckets) ? buckets.length : "unknown" };
    }),
    PROBE_TIMEOUT_MS,
  );
}

async function probeAuth() {
  const url  = process.env["SUPABASE_URL"] ?? process.env["VITE_SUPABASE_URL"] ?? "";
  const anon = process.env["SUPABASE_ANON_KEY"] ?? process.env["VITE_SUPABASE_ANON_KEY"] ?? "";
  if (!url || !anon) {
    return { ok: false, latencyMs: 0, error: "SUPABASE_URL or SUPABASE_ANON_KEY not set" };
  }
  // GET /auth/v1/settings — public, returns server capabilities
  return timedPromise(
    fetch(`${url}/auth/v1/settings`, {
      headers: {
        apikey:        anon,
        Authorization: `Bearer ${anon}`,
      },
    }).then(async (res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.json() as Record<string, unknown>;
      return {
        providers: Array.isArray(body["external"]) ? body["external"] : "unknown",
        httpStatus: res.status,
      };
    }),
    PROBE_TIMEOUT_MS,
  );
}

/* ── env inventory ───────────────────────────────────────────────────────── */

function checkEnv() {
  const required: Record<string, boolean> = {
    DATABASE_URL:       !!process.env["DATABASE_URL"],
    SUPABASE_URL:       !!(process.env["SUPABASE_URL"] ?? process.env["VITE_SUPABASE_URL"]),
    SUPABASE_ANON_KEY:  !!(process.env["SUPABASE_ANON_KEY"] ?? process.env["VITE_SUPABASE_ANON_KEY"]),
    SESSION_SECRET:     !!process.env["SESSION_SECRET"],
  };
  const optional: Record<string, boolean> = {
    SUPABASE_SERVICE_ROLE_KEY:     !!process.env["SUPABASE_SERVICE_ROLE_KEY"],
    FAL_KEY:                       !!process.env["FAL_KEY"],
    AI_INTEGRATIONS_OPENAI_API_KEY:
      !!(process.env["AI_INTEGRATIONS_OPENAI_API_KEY"] ?? process.env["OPENAI_API_KEY"]),
    XAI_API_KEY:                   !!process.env["XAI_API_KEY"],
    PAYMONGO_SECRET_KEY:           !!process.env["PAYMONGO_SECRET_KEY"],
    PAYMONGO_WEBHOOK_SECRET:       !!process.env["PAYMONGO_WEBHOOK_SECRET"],
  };
  const requiredOk  = Object.values(required).every(Boolean);
  const optionalCount = Object.values(optional).filter(Boolean).length;
  return { required, optional, requiredOk, optionalCount, optionalTotal: Object.keys(optional).length };
}

/* ── GET /api/health ─────────────────────────────────────────────────────── */

router.get("/health", async (_req, res) => {
  const startMs = Date.now();

  const [database, supabase, storage, auth] = await Promise.all([
    probeDatabase(),
    probeSupabase(),
    probeStorage(),
    probeAuth(),
  ]);

  const env = checkEnv();
  const totalMs = Date.now() - startMs;

  const checks = { database, supabase, storage, auth } as Record<string, { ok: boolean }>;
  const allCriticalUp = database.ok && supabase.ok && env.requiredOk;
  const anyDown       = Object.values(checks).some((c) => !c.ok);

  let status: "healthy" | "degraded" | "unhealthy";
  let httpStatus: 200 | 503;

  if (!allCriticalUp) {
    status     = "unhealthy";
    httpStatus = 503;
  } else if (anyDown) {
    status     = "degraded";
    httpStatus = 200;
  } else {
    status     = "healthy";
    httpStatus = 200;
  }

  if (status !== "healthy") {
    logger.warn({ status, checks, env }, "[health] non-healthy status");
  }

  const body = {
    status,
    timestamp:    new Date().toISOString(),
    responseTime: { totalMs },
    checks: {
      database: {
        ok:        database.ok,
        latencyMs: database.latencyMs,
        ...(database.ok ? {} : { error: (database as any).error }),
      },
      supabase: {
        ok:        supabase.ok,
        latencyMs: supabase.latencyMs,
        ...(supabase.ok ? {} : { error: (supabase as any).error }),
      },
      storage: {
        ok:        storage.ok,
        latencyMs: storage.latencyMs,
        ...(storage.ok ? { buckets: (storage as any).detail?.buckets } : { error: (storage as any).error }),
      },
      auth: {
        ok:        auth.ok,
        latencyMs: auth.latencyMs,
        ...(auth.ok ? {} : { error: (auth as any).error }),
      },
    },
    environment: {
      required:      env.required,
      optional:      env.optional,
      requiredOk:    env.requiredOk,
      optionalReady: `${env.optionalCount}/${env.optionalTotal}`,
    },
    process: {
      pid:          process.pid,
      uptimeSeconds: Math.floor(process.uptime()),
      nodeVersion:  process.version,
      memoryMb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
    },
  };

  res.status(httpStatus).json(body);
});

export default router;
