/**
 * Render Jobs Database — Drizzle/Postgres implementation.
 * Replaces the previous Supabase service-role client.
 */
import { eq, lte, inArray, and, ne, lt, count } from "drizzle-orm";
import { db, schema } from "./db.js";
import { logger } from "./logger.js";

const { renderJobs, studioProjects } = schema;

/* ── Types ──────────────────────────────────────────────────────────── */
export type RenderStatus =
  | "queued" | "preparing_assets" | "building_prompt_graph"
  | "generating_motion" | "voice_synthesis" | "transition_rendering"
  | "scene_blending" | "color_grading" | "audio_mixing"
  | "encoding" | "uploading"
  | "completed" | "failed" | "cancelled";

export interface RenderJob {
  id:               string;
  user_id:          string;
  project_id?:      string | null;
  status:           RenderStatus;
  stage:            string;
  progress:         number;
  priority:         number;
  retry_count:      number;
  max_retries:      number;
  failure_reason?:  string | null;
  last_error?:      string | null;
  worker_id?:       string | null;
  worker_heartbeat?: string | null;
  render_engine:    string;
  plan_code?:       string | null;
  output_url?:      string | null;
  thumbnail_url?:   string | null;
  preview_strip_url?: string | null;
  duration_sec?:    number | null;
  file_size_bytes?: number | null;
  completed_stages: string[];
  input_payload:    Record<string, unknown>;
  segment_meta:     unknown[];
  encoding_state:   Record<string, unknown>;
  queued_at:        string;
  started_at?:      string | null;
  completed_at?:    string | null;
  created_at:       string;
  updated_at:       string;
}

function rowToJob(row: typeof renderJobs.$inferSelect): RenderJob {
  return {
    id:               row.id,
    user_id:          row.userId,
    project_id:       row.projectId ?? null,
    status:           row.status as RenderStatus,
    stage:            row.stage,
    progress:         Number(row.progress ?? 0),
    priority:         row.priority,
    retry_count:      row.retryCount ?? 0,
    max_retries:      row.maxRetries ?? 3,
    failure_reason:   row.failureReason ?? null,
    last_error:       row.lastError ?? null,
    worker_id:        row.workerId ?? null,
    worker_heartbeat: row.workerHeartbeat?.toISOString() ?? null,
    render_engine:    row.renderEngine,
    plan_code:        row.planCode ?? null,
    output_url:       row.outputUrl ?? null,
    thumbnail_url:    row.thumbnailUrl ?? null,
    preview_strip_url: row.previewStripUrl ?? null,
    duration_sec:     row.durationSec ? Number(row.durationSec) : null,
    file_size_bytes:  row.fileSizeBytes ?? null,
    completed_stages: (row.completedStages as string[]) ?? [],
    input_payload:    (row.inputPayload as Record<string, unknown>) ?? {},
    segment_meta:     (row.segmentMeta as unknown[]) ?? [],
    encoding_state:   (row.encodingState as Record<string, unknown>) ?? {},
    queued_at:        row.queuedAt?.toISOString() ?? new Date().toISOString(),
    started_at:       row.startedAt?.toISOString() ?? null,
    completed_at:     row.completedAt?.toISOString() ?? null,
    created_at:       row.createdAt?.toISOString() ?? new Date().toISOString(),
    updated_at:       row.updatedAt?.toISOString() ?? new Date().toISOString(),
  };
}

/** Kept for backward compat — callers that imported getServiceClient() for other purposes */
export function getServiceClient() {
  return db;
}

/* ── Job creation ───────────────────────────────────────────────────── */
export async function createRenderJob(params: {
  userId:        string;
  projectId?:    string;
  priority:      number;
  renderEngine:  string;
  planCode:      string;
  inputPayload:  Record<string, unknown>;
  thumbnailUrl?: string;
}): Promise<RenderJob> {
  const [row] = await db.insert(renderJobs).values({
    userId:        params.userId,
    projectId:     params.projectId ?? null,
    priority:      params.priority,
    renderEngine:  params.renderEngine,
    planCode:      params.planCode,
    inputPayload:  params.inputPayload,
    thumbnailUrl:  params.thumbnailUrl ?? null,
    status:        "queued",
    stage:         "queued",
  }).returning();
  if (!row) throw new Error("createRenderJob: insert returned no row");
  return rowToJob(row);
}

/* ── Worker job claiming ─────────────────────────────────────────────── */
export async function claimNextJob(workerId: string): Promise<RenderJob | null> {
  const jobs = await db
    .select({ id: renderJobs.id, priority: renderJobs.priority, queuedAt: renderJobs.queuedAt })
    .from(renderJobs)
    .where(eq(renderJobs.status, "queued"))
    .orderBy(renderJobs.priority, renderJobs.queuedAt)
    .limit(1);

  if (!jobs || jobs.length === 0) return null;
  const job = jobs[0]!;

  const [claimed] = await db
    .update(renderJobs)
    .set({
      status:           "preparing_assets",
      stage:            "preparing_assets",
      workerId:         workerId,
      workerHeartbeat:  new Date(),
      startedAt:        new Date(),
    })
    .where(and(eq(renderJobs.id, job.id), eq(renderJobs.status, "queued")))
    .returning();

  if (!claimed) return null;
  return rowToJob(claimed);
}

/* ── Job progress update ─────────────────────────────────────────────── */
export async function updateJobProgress(
  jobId: string,
  patch: {
    status?:          RenderStatus;
    stage?:           string;
    progress?:        number;
    worker_heartbeat?: string;
    completed_stages?: string[];
    segment_meta?:    unknown[];
    encoding_state?:  Record<string, unknown>;
    output_url?:      string;
    thumbnail_url?:   string;
    preview_strip_url?: string;
    duration_sec?:    number;
    file_size_bytes?: number;
    failure_reason?:  string;
    last_error?:      string;
    completed_at?:    string;
    worker_id?:       string;
    started_at?:      string;
  },
): Promise<void> {
  const values: Partial<typeof renderJobs.$inferInsert> = {};
  if (patch.status          !== undefined) values.status           = patch.status;
  if (patch.stage           !== undefined) values.stage            = patch.stage;
  if (patch.progress        !== undefined) values.progress         = String(patch.progress);
  if (patch.worker_heartbeat!== undefined) values.workerHeartbeat  = new Date(patch.worker_heartbeat);
  if (patch.completed_stages!== undefined) values.completedStages  = patch.completed_stages;
  if (patch.segment_meta    !== undefined) values.segmentMeta      = patch.segment_meta;
  if (patch.encoding_state  !== undefined) values.encodingState    = patch.encoding_state;
  if (patch.output_url      !== undefined) values.outputUrl        = patch.output_url;
  if (patch.thumbnail_url   !== undefined) values.thumbnailUrl     = patch.thumbnail_url;
  if (patch.preview_strip_url !== undefined) values.previewStripUrl = patch.preview_strip_url;
  if (patch.duration_sec    !== undefined) values.durationSec      = String(patch.duration_sec);
  if (patch.file_size_bytes !== undefined) values.fileSizeBytes    = patch.file_size_bytes;
  if (patch.failure_reason  !== undefined) values.failureReason    = patch.failure_reason;
  if (patch.last_error      !== undefined) values.lastError        = patch.last_error;
  if (patch.completed_at    !== undefined) values.completedAt      = new Date(patch.completed_at);
  if (patch.worker_id       !== undefined) values.workerId         = patch.worker_id;
  if (patch.started_at      !== undefined) values.startedAt        = new Date(patch.started_at);
  values.updatedAt = new Date();

  try {
    await db.update(renderJobs).set(values).where(eq(renderJobs.id, jobId));
  } catch (err) {
    logger.warn({ jobId, err: (err as Error).message }, "[renderJobsDb] updateJobProgress failed");
  }
}

/* ── Heartbeat ───────────────────────────────────────────────────────── */
export async function heartbeat(jobId: string): Promise<void> {
  await updateJobProgress(jobId, { worker_heartbeat: new Date().toISOString() });
}

/* ── Mark failed / retry ─────────────────────────────────────────────── */
export async function failJob(
  job: RenderJob,
  reason: string,
  requeue = false,
): Promise<void> {
  const newRetry = job.retry_count + 1;
  const canRetry = requeue && newRetry <= job.max_retries;

  await updateJobProgress(job.id, {
    status:        canRetry ? "queued" : "failed",
    stage:         canRetry ? "queued" : "failed",
    failure_reason: reason,
    last_error:    reason,
    progress:      canRetry ? 0 : job.progress,
    ...(canRetry ? {} : { completed_at: new Date().toISOString() }),
  });

  if (canRetry) {
    await db.update(renderJobs).set({ retryCount: newRetry }).where(eq(renderJobs.id, job.id));
  }
}

/* ── Complete job ────────────────────────────────────────────────────── */
export async function completeJob(
  jobId: string,
  output: {
    outputUrl:        string;
    thumbnailUrl:     string;
    durationSec:      number;
    fileSizeBytes:    number;
    previewStripUrl?: string;
    encodingState?:   Record<string, unknown>;
  },
): Promise<void> {
  await updateJobProgress(jobId, {
    status:            "completed",
    stage:             "completed",
    progress:          100,
    output_url:        output.outputUrl,
    thumbnail_url:     output.thumbnailUrl,
    duration_sec:      output.durationSec,
    file_size_bytes:   output.fileSizeBytes,
    preview_strip_url: output.previewStripUrl ?? undefined,
    encoding_state:    output.encodingState ?? {},
    completed_at:      new Date().toISOString(),
  });
}

/* ── Recover stuck jobs on startup ──────────────────────────────────── */
export async function recoverStuckJobs(workerId: string): Promise<number> {
  const stuckCutoff = new Date(Date.now() - 12 * 60 * 1000);
  const activeStatuses: RenderStatus[] = [
    "preparing_assets", "building_prompt_graph", "generating_motion",
    "voice_synthesis", "transition_rendering", "scene_blending",
    "color_grading", "audio_mixing", "encoding", "uploading",
  ];

  const stuck = await db
    .select({ id: renderJobs.id, retryCount: renderJobs.retryCount, maxRetries: renderJobs.maxRetries })
    .from(renderJobs)
    .where(and(
      inArray(renderJobs.status, activeStatuses),
      lt(renderJobs.workerHeartbeat, stuckCutoff),
    ));

  if (!stuck || stuck.length === 0) return 0;

  for (const job of stuck) {
    const newRetry = (job.retryCount ?? 0) + 1;
    const canRetry = newRetry <= (job.maxRetries ?? 3);
    await db.update(renderJobs).set({
      status:        canRetry ? "queued" : "failed",
      stage:         canRetry ? "queued" : "failed",
      workerId:      null,
      retryCount:    newRetry,
      failureReason: "Worker timeout — auto-recovered",
      progress:      "0",
    }).where(eq(renderJobs.id, job.id));
  }

  logger.info({ count: stuck.length, workerId }, "[renderWorker] Recovered stuck jobs");
  return stuck.length;
}

/* ── User-facing queries ─────────────────────────────────────────────── */
export async function getJobForUser(jobId: string, userId: string): Promise<RenderJob | null> {
  const [row] = await db
    .select()
    .from(renderJobs)
    .where(and(eq(renderJobs.id, jobId), eq(renderJobs.userId, userId)))
    .limit(1);
  return row ? rowToJob(row) : null;
}

export async function getUserJobs(userId: string, limit = 30): Promise<RenderJob[]> {
  const rows = await db
    .select()
    .from(renderJobs)
    .where(eq(renderJobs.userId, userId))
    .orderBy(renderJobs.createdAt)
    .limit(limit);
  return rows.map(rowToJob);
}

/* ── Queue position ─────────────────────────────────────────────────── */
export async function getQueuePosition(jobId: string, priority: number): Promise<number> {
  const [result] = await db
    .select({ cnt: count() })
    .from(renderJobs)
    .where(and(
      eq(renderJobs.status, "queued"),
      ne(renderJobs.id, jobId),
      lte(renderJobs.priority, priority),
    ));
  return ((result?.cnt as unknown as number) ?? 0) + 1;
}

/* ── Delete job ─────────────────────────────────────────────────────── */
export async function deleteJobForUser(jobId: string, userId: string): Promise<boolean> {
  const terminal: RenderStatus[] = ["completed", "failed", "cancelled"];
  const [row] = await db
    .delete(renderJobs)
    .where(and(
      eq(renderJobs.id, jobId),
      eq(renderJobs.userId, userId),
      inArray(renderJobs.status, terminal),
    ))
    .returning({ id: renderJobs.id });
  return !!row;
}

/* ── Re-queue a failed job ───────────────────────────────────────────── */
export async function retryJobForUser(jobId: string, userId: string): Promise<RenderJob | null> {
  const [existing] = await db
    .select()
    .from(renderJobs)
    .where(and(
      eq(renderJobs.id, jobId),
      eq(renderJobs.userId, userId),
      inArray(renderJobs.status, ["failed", "cancelled"]),
    ))
    .limit(1);
  if (!existing) return null;

  const [updated] = await db
    .update(renderJobs)
    .set({
      status:        "queued",
      stage:         "queued",
      progress:      "0",
      failureReason: null,
      lastError:     null,
      workerId:      null,
      startedAt:     null,
      completedAt:   null,
      queuedAt:      new Date(),
    })
    .where(eq(renderJobs.id, jobId))
    .returning();
  if (!updated) return null;
  return rowToJob(updated);
}

/* ── Admin queries ───────────────────────────────────────────────────── */
export async function getAdminQueueStats(): Promise<{
  queued: number; active: number; completed: number; failed: number; cancelled: number;
}> {
  const rows = await db.select({ status: renderJobs.status }).from(renderJobs);

  const counts = { queued: 0, active: 0, completed: 0, failed: 0, cancelled: 0 };
  const activeStatuses = new Set([
    "preparing_assets","building_prompt_graph","generating_motion",
    "voice_synthesis","transition_rendering","scene_blending",
    "color_grading","audio_mixing","encoding","uploading",
  ]);
  for (const row of rows) {
    if (row.status === "queued") counts.queued++;
    else if (row.status === "completed") counts.completed++;
    else if (row.status === "failed") counts.failed++;
    else if (row.status === "cancelled") counts.cancelled++;
    else if (activeStatuses.has(row.status)) counts.active++;
  }
  return counts;
}
