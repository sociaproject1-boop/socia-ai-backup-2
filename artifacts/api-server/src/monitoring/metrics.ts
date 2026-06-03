/**
 * monitoring/metrics.ts — REAL generation metrics for the AI Command Center,
 * read straight from existing tables (`render_jobs`, `usage_receipts`) via the
 * service client. NO schema changes, NO writes — pure counts.
 *
 * Failsafe contract: every query is wrapped so a missing table / RLS / network
 * error degrades to `null` ("not tracked") instead of throwing. The AI
 * dashboard renders "—" for any null rather than inventing numbers.
 */
import { getServiceClient } from "../lib/renderJobsDb.js";
import { logger } from "../lib/logger.js";

export interface GenerationMetrics {
  /** Render jobs created in the trailing 24h (videos/cinematic). */
  renderJobs24h: number | null;
  /** Render jobs that completed successfully in the trailing 24h. */
  renderSucceeded24h: number | null;
  /** Render jobs that failed in the trailing 24h. */
  renderFailed24h: number | null;
  /** Render jobs still queued/processing right now. */
  renderActive: number | null;
  /** Success rate 0–100 over the trailing 24h, or null if no data. */
  successRate: number | null;
  /** Generated at (ISO). */
  computedAt: string;
}

function since24h(): string {
  return new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
}

/** A render_jobs count query restricted to the trailing 24h window. */
function jobs24h() {
  return getServiceClient()
    .from("render_jobs")
    .select("id", { count: "exact", head: true })
    .gte("created_at", since24h());
}

/** Resolve a count query to a number; null on any failure. */
async function resolveCount(
  query: PromiseLike<{ count: number | null; error: unknown }>,
): Promise<number | null> {
  try {
    const { count, error } = await query;
    if (error) return null;
    return count ?? 0;
  } catch (err) {
    logger.warn({ err: (err as Error).message }, "[monitor] metrics count failed");
    return null;
  }
}

/**
 * Best-effort metrics snapshot. Statuses are matched leniently: the render
 * pipeline uses lower-case states ("queued" | "processing" | "completed" |
 * "failed"); if the column or values differ, the relevant fields come back
 * null and the UI shows "—".
 */
export async function getGenerationMetrics(): Promise<GenerationMetrics> {
  const [total, succeeded, failed, active] = await Promise.all([
    resolveCount(jobs24h()),
    resolveCount(jobs24h().eq("status", "completed")),
    resolveCount(jobs24h().eq("status", "failed")),
    resolveCount(
      getServiceClient()
        .from("render_jobs")
        .select("id", { count: "exact", head: true })
        .in("status", ["queued", "processing"]),
    ),
  ]);

  let successRate: number | null = null;
  if (succeeded !== null && failed !== null && succeeded + failed > 0) {
    successRate = Math.round((succeeded / (succeeded + failed)) * 100);
  }

  return {
    renderJobs24h: total,
    renderSucceeded24h: succeeded,
    renderFailed24h: failed,
    renderActive: active,
    successRate,
    computedAt: new Date().toISOString(),
  };
}
