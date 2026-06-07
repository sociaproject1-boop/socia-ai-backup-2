/**
 * Render Jobs Database — service-role Supabase client for the worker.
 * All writes use the service-role key (bypasses RLS) so the background
 * worker can update any job regardless of who owns it.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { logger } from "./logger.js";

function getSupabaseUrl(): string {
  return process.env["VITE_SUPABASE_URL"] ?? process.env["SUPABASE_URL"] ?? "";
}

function resolveServiceRole(): string {
  const fromEnv = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (fromEnv && fromEnv.trim()) return fromEnv.trim();
  const candidates = [
    resolve(process.cwd(), ".local/secrets/SUPABASE_SERVICE_ROLE_KEY"),
    resolve(process.cwd(), "../../.local/secrets/SUPABASE_SERVICE_ROLE_KEY"),
  ];
  for (const p of candidates) {
    try {
      if (existsSync(p)) {
        const v = readFileSync(p, "utf8").trim();
        if (v) return v;
      }
    } catch { /* ignore */ }
  }
  return "";
}

let _serviceClient: SupabaseClient | null = null;

export function getServiceClient(): SupabaseClient {
  if (_serviceClient) return _serviceClient;
  const key = resolveServiceRole();
  if (!key) {
    logger.warn("[renderJobsDb] SUPABASE_SERVICE_ROLE_KEY missing — worker will degrade gracefully");
    // Return anon client as fallback (RLS will block most writes)
    _serviceClient = createClient(getSupabaseUrl(), process.env["VITE_SUPABASE_ANON_KEY"] ?? "");
  } else {
    _serviceClient = createClient(getSupabaseUrl(), key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return _serviceClient;
}

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
  const sb = getServiceClient();
  const { data, error } = await sb
    .from("render_jobs")
    .insert({
      user_id:       params.userId,
      project_id:    params.projectId ?? null,
      priority:      params.priority,
      render_engine: params.renderEngine,
      plan_code:     params.planCode,
      input_payload: params.inputPayload,
      thumbnail_url: params.thumbnailUrl ?? null,
      status:        "queued",
      stage:         "queued",
    })
    .select()
    .single();
  if (error) throw new Error(`createRenderJob: ${error.message}`);
  return data as RenderJob;
}

/* ── Worker job claiming ─────────────────────────────────────────────── */
export async function claimNextJob(workerId: string): Promise<RenderJob | null> {
  const sb = getServiceClient();
  // Claim oldest queued job with highest priority (lowest number)
  const { data: jobs } = await sb
    .from("render_jobs")
    .select("id, priority, queued_at")
    .eq("status", "queued")
    .order("priority", { ascending: true })
    .order("queued_at", { ascending: true })
    .limit(1);

  if (!jobs || jobs.length === 0) return null;
  const job = jobs[0] as { id: string; priority: number; queued_at: string };

  // Atomic claim — only update if still queued
  const { data: claimed, error } = await sb
    .from("render_jobs")
    .update({
      status:           "preparing_assets",
      stage:            "preparing_assets",
      worker_id:        workerId,
      worker_heartbeat: new Date().toISOString(),
      started_at:       new Date().toISOString(),
    })
    .eq("id", job.id)
    .eq("status", "queued")  // Guard against race
    .select()
    .single();

  if (error || !claimed) return null;
  return claimed as RenderJob;
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
  const sb = getServiceClient();
  const { error } = await sb.from("render_jobs").update(patch).eq("id", jobId);
  if (error) logger.warn({ jobId, error: error.message }, "[renderJobsDb] updateJobProgress failed");
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
    worker_id:     canRetry ? undefined : (job.worker_id ?? undefined),
    ...(canRetry ? {} : { completed_at: new Date().toISOString() }),
  });

  if (canRetry) {
    // Persist retry count separately
    const sb = getServiceClient();
    await sb
      .from("render_jobs")
      .update({ retry_count: newRetry })
      .eq("id", job.id);
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
  const sb = getServiceClient();
  const stuckCutoff = new Date(Date.now() - 12 * 60 * 1000).toISOString(); // 12 min
  const activeStatuses: RenderStatus[] = [
    "preparing_assets", "building_prompt_graph", "generating_motion",
    "voice_synthesis", "transition_rendering", "scene_blending",
    "color_grading", "audio_mixing", "encoding", "uploading",
  ];

  const { data: stuck } = await sb
    .from("render_jobs")
    .select("id, retry_count, max_retries, failure_reason")
    .in("status", activeStatuses)
    .lt("worker_heartbeat", stuckCutoff);

  if (!stuck || stuck.length === 0) return 0;

  for (const job of stuck as RenderJob[]) {
    const newRetry = job.retry_count + 1;
    const canRetry = newRetry <= job.max_retries;
    await sb.from("render_jobs").update({
      status:        canRetry ? "queued" : "failed",
      stage:         canRetry ? "queued" : "failed",
      worker_id:     null,
      retry_count:   newRetry,
      failure_reason: "Worker timeout — auto-recovered",
      progress:      0,
    }).eq("id", job.id);
  }

  logger.info({ count: stuck.length, workerId }, "[renderWorker] Recovered stuck jobs");
  return stuck.length;
}

/* ── User-facing queries (RLS) ───────────────────────────────────────── */
export async function getJobForUser(
  jobId: string,
  userId: string,
): Promise<RenderJob | null> {
  const sb = getServiceClient();
  const { data } = await sb
    .from("render_jobs")
    .select("*")
    .eq("id", jobId)
    .eq("user_id", userId)
    .single();
  return data as RenderJob | null;
}

export async function getUserJobs(
  userId: string,
  limit = 30,
): Promise<RenderJob[]> {
  const sb = getServiceClient();
  const { data } = await sb
    .from("render_jobs")
    .select("id,status,stage,progress,render_engine,priority,retry_count,max_retries,failure_reason,output_url,thumbnail_url,duration_sec,input_payload,segment_meta,queued_at,started_at,completed_at,created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as RenderJob[];
}

/* ── Queue position (jobs ahead with same or higher priority) ──────── */
export async function getQueuePosition(jobId: string, priority: number): Promise<number> {
  const sb = getServiceClient();
  const { count } = await sb
    .from("render_jobs")
    .select("id", { count: "exact", head: true })
    .eq("status", "queued")
    .neq("id", jobId)
    .lte("priority", priority);
  return (count ?? 0) + 1; // 1-indexed: "you're #1 in queue"
}

/* ── Delete job (user's own completed/failed/cancelled only) ────────── */
export async function deleteJobForUser(jobId: string, userId: string): Promise<boolean> {
  const sb = getServiceClient();
  const terminal: RenderStatus[] = ["completed", "failed", "cancelled"];
  const { data, error } = await sb
    .from("render_jobs")
    .delete()
    .eq("id", jobId)
    .eq("user_id", userId)
    .in("status", terminal)
    .select("id")
    .single();
  return !error && !!data;
}

/* ── Re-queue a failed job (user's own, failed only) ────────────────── */
export async function retryJobForUser(jobId: string, userId: string): Promise<RenderJob | null> {
  const sb = getServiceClient();
  // Verify ownership + failed status
  const { data: job } = await sb
    .from("render_jobs")
    .select("*")
    .eq("id", jobId)
    .eq("user_id", userId)
    .in("status", ["failed", "cancelled"])
    .single();
  if (!job) return null;

  const { data: updated, error } = await sb
    .from("render_jobs")
    .update({
      status:         "queued",
      stage:          "queued",
      progress:       0,
      failure_reason: null,
      last_error:     null,
      worker_id:      null,
      started_at:     null,
      completed_at:   null,
      queued_at:      new Date().toISOString(),
    })
    .eq("id", jobId)
    .select()
    .single();
  if (error || !updated) return null;
  return updated as RenderJob;
}

/* ── Admin queries ───────────────────────────────────────────────────── */
export async function getAdminQueueStats(): Promise<{
  queued: number; active: number; completed: number; failed: number; cancelled: number;
}> {
  const sb = getServiceClient();
  const { data } = await sb
    .from("render_jobs")
    .select("status");

  const counts = { queued: 0, active: 0, completed: 0, failed: 0, cancelled: 0 };
  const activeStatuses = new Set([
    "preparing_assets","building_prompt_graph","generating_motion",
    "voice_synthesis","transition_rendering","scene_blending",
    "color_grading","audio_mixing","encoding","uploading",
  ]);
  for (const row of (data ?? []) as { status: string }[]) {
    if (row.status === "queued") counts.queued++;
    else if (row.status === "completed") counts.completed++;
    else if (row.status === "failed") counts.failed++;
    else if (row.status === "cancelled") counts.cancelled++;
    else if (activeStatuses.has(row.status)) counts.active++;
  }
  return counts;
}
