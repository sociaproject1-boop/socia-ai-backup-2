/**
 * storageCleanup.ts — Background storage cleanup and maintenance
 *
 * Responsibilities:
 * 1. Clean stale socia-encode-* / socia-stitch-* temp dirs in /tmp (>1 h old)
 * 2. Recover abandoned render jobs (no heartbeat for >2 h) → mark failed
 * 3. Compute storage tier expiry based on plan_code
 *
 * Storage tiers:
 *   Free / unknown → 7-day retention
 *   p15 (Pro)      → 30-day retention
 *   p30 (Ultimate) → permanent (null)
 */

import { readdir, stat, rm } from "node:fs/promises";
import { join }               from "node:path";
import { tmpdir }             from "node:os";
import { logger }             from "./logger.js";
import { getServiceClient }   from "./renderJobsDb.js";

const STALE_TEMP_MS    = 60 * 60 * 1_000;         // 1 h
const ABANDONED_JOB_MS = 2  * 60 * 60 * 1_000;   // 2 h
const CLEANUP_INTERVAL = 30 * 60 * 1_000;          // 30 min

/* ── Active statuses that should have a recent heartbeat ────────── */
const ACTIVE_STATUSES = [
  "preparing_assets", "building_prompt_graph", "generating_motion",
  "voice_synthesis",  "transition_rendering",   "scene_blending",
  "color_grading",    "audio_mixing",           "encoding",   "uploading",
];

/* ── Retention periods ───────────────────────────────────────────── */
const RETENTION_DAYS: Record<string, number | null> = {
  p30: null,   // permanent
  p15: 30,
};

/* ─────────────────────────────────────────────────────────────────
   1. Stale temp directory cleanup
───────────────────────────────────────────────────────────────── */
async function cleanStaleTempDirs(): Promise<number> {
  const tmp = tmpdir();
  let cleaned = 0;
  try {
    const entries = await readdir(tmp);
    const socia   = entries.filter(e =>
      e.startsWith("socia-encode-") || e.startsWith("socia-stitch-"),
    );
    await Promise.all(
      socia.map(async (entry) => {
        const full = join(tmp, entry);
        try {
          const info = await stat(full);
          if (Date.now() - info.mtimeMs > STALE_TEMP_MS) {
            await rm(full, { recursive: true, force: true });
            cleaned++;
          }
        } catch { /* entry already gone */ }
      }),
    );
  } catch (err) {
    logger.warn({ err }, "[storageCleanup] Error scanning tmpdir");
  }
  return cleaned;
}

/* ─────────────────────────────────────────────────────────────────
   2. Abandoned job recovery
───────────────────────────────────────────────────────────────── */
async function recoverAbandonedJobs(): Promise<number> {
  const sb     = getServiceClient();
  const cutoff = new Date(Date.now() - ABANDONED_JOB_MS).toISOString();

  const { data: abandoned } = await sb
    .from("render_jobs")
    .select("id")
    .in("status", ACTIVE_STATUSES)
    .lt("worker_heartbeat", cutoff)
    .is("completed_at", null);

  if (!abandoned?.length) return 0;

  await Promise.all(
    (abandoned as { id: string }[]).map(({ id }) =>
      sb.from("render_jobs").update({
        status:         "failed",
        failure_reason: "Job abandoned — worker lost connection",
        completed_at:   new Date().toISOString(),
      }).eq("id", id),
    ),
  );

  logger.warn({ count: abandoned.length }, "[storageCleanup] Recovered abandoned jobs");
  return abandoned.length;
}

/* ─────────────────────────────────────────────────────────────────
   3. Storage tier helpers (exported for use in renderWorker)
───────────────────────────────────────────────────────────────── */

/**
 * Returns an ISO timestamp for when the render job output should expire,
 * or null if the plan includes permanent storage.
 */
export function computeExpiresAt(planCode: string | null | undefined): string | null {
  if (!planCode) return new Date(Date.now() + 7 * 86_400_000).toISOString();
  const days = RETENTION_DAYS[planCode];
  if (days === null) return null; // permanent
  return new Date(Date.now() + (days ?? 7) * 86_400_000).toISOString();
}

/**
 * Returns the human-readable tier name and retention description.
 */
export function storageTierInfo(planCode: string | null | undefined): { tier: string; description: string } {
  if (planCode === "p30") return { tier: "3T Archive",  description: "Permanent cinematic archive" };
  if (planCode === "p15") return { tier: "Pro Storage", description: "30-day HD backup" };
  return                         { tier: "Free",        description: "7-day temporary storage" };
}

/* ─────────────────────────────────────────────────────────────────
   4. Orchestrator
───────────────────────────────────────────────────────────────── */
async function runStorageCleanup(): Promise<void> {
  logger.info("[storageCleanup] Cleanup cycle starting");
  const [tmpResult, jobResult] = await Promise.allSettled([
    cleanStaleTempDirs(),
    recoverAbandonedJobs(),
  ]);
  logger.info({
    tempDirsCleaned: tmpResult.status === "fulfilled" ? tmpResult.value : 0,
    abandonedJobs:   jobResult.status === "fulfilled" ? jobResult.value : 0,
  }, "[storageCleanup] Cycle complete");
}

/**
 * startStorageCleanup — call once from server startup.
 * Runs immediately, then every 30 minutes.
 */
export function startStorageCleanup(): void {
  runStorageCleanup().catch(err => {
    logger.error({ err }, "[storageCleanup] Startup cleanup failed");
  });
  setInterval(() => {
    runStorageCleanup().catch(err => {
      logger.error({ err }, "[storageCleanup] Periodic cleanup failed");
    });
  }, CLEANUP_INTERVAL).unref();
}
