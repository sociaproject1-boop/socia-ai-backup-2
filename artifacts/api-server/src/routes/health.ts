/**
 * /healthz — runtime liveness + dependency probe.
 */
import { Router, type IRouter } from "express";
import { pool } from "../lib/db.js";
import { logger } from "../lib/logger.js";

const router: IRouter = Router();

const DB_PROBE_TIMEOUT_MS = 1_000;

async function withTimeout<T>(p: Promise<T>, ms: number, onTimeout: T): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((resolve) => setTimeout(() => resolve(onTimeout), ms)),
  ]);
}

async function probeDb(): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
  if (!process.env["DATABASE_URL"]) return { ok: false, latencyMs: 0, error: "missing_credentials" };
  const t0 = Date.now();
  try {
    const result = await withTimeout(
      pool.query("SELECT 1"),
      DB_PROBE_TIMEOUT_MS,
      null,
    );
    const latencyMs = Date.now() - t0;
    if (!result) return { ok: false, latencyMs, error: "timeout" };
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
    DATABASE_URL:                  !!process.env["DATABASE_URL"],
    SESSION_SECRET:                !!process.env["SESSION_SECRET"],
    FAL_KEY:                       !!process.env["FAL_KEY"],
    AI_INTEGRATIONS_OPENAI_API_KEY:
                                   !!process.env["AI_INTEGRATIONS_OPENAI_API_KEY"]
                                || !!process.env["OPENAI_API_KEY"],
    XAI_API_KEY:                   !!process.env["XAI_API_KEY"],
    PAYMONGO_SECRET_KEY:           !!process.env["PAYMONGO_SECRET_KEY"],
    PAYMONGO_WEBHOOK_SECRET:       !!process.env["PAYMONGO_WEBHOOK_SECRET"],
  };

  const db = await probeDb();

  const required = env.DATABASE_URL && env.SESSION_SECRET;
  const optional = env.FAL_KEY && env.AI_INTEGRATIONS_OPENAI_API_KEY
                 && env.XAI_API_KEY && env.PAYMONGO_SECRET_KEY && env.PAYMONGO_WEBHOOK_SECRET;

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
    checks: { db, env },
    workerId: process.pid,
    uptime:   Math.floor(process.uptime()),
  });
});

export default router;
