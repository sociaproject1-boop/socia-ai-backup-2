/**
 * Render Jobs — user-facing REST routes.
 *
 * POST /api/render/submit          — submit a new async render job
 * GET  /api/render/job/:id         — poll a specific job (fallback to HTTP polling)
 * GET  /api/render/my-jobs         — list user's render history
 * POST /api/render/job/:id/cancel  — cancel a queued/in-progress job
 */
import { Router } from "express";
import { createRateLimiter } from "../lib/rateLimit.js";
import { requireAuth, getAuthedUser } from "../lib/supabaseAuth.js";
import { gateAndConsume } from "../lib/billing.js";
import { isMockMode } from "../lib/fal.js";
import { getRequestSupabase } from "../lib/supabaseAuth.js";
import { logger } from "../lib/logger.js";
import {
  createRenderJob, getJobForUser, getUserJobs, updateJobProgress,
  getQueuePosition, deleteJobForUser, retryJobForUser,
} from "../lib/renderJobsDb.js";

const router = Router();

const MIN_FRAMES = 2;
const MAX_FRAMES = 10;

/** Map plan code to queue priority (lower = higher priority) */
function planToPriority(planCode: string): number {
  if (planCode === "p30") return 1;
  if (planCode === "p15") return 2;
  return 3; // free — blocked at gate, shouldn't reach here
}

/* ─────────────────────────────────────────────────────────────────────
   POST /api/render/submit
   Validate inputs, gate credits, create job in DB, return job ID.
───────────────────────────────────────────────────────────────────── */
router.post("/render/submit", createRateLimiter({ name: "render-submit", windowSec: 60, max: 6 }), requireAuth, async (req, res) => {
  const user = getAuthedUser(req);
  const sb   = getRequestSupabase(req);

  const {
    images         = [],
    framePrompts   = [],
    globalPrompt   = "",
    aspect         = "9:16",
    renderEngine   = "luma",
    projectId,
    quality        = "1080p",
    format         = "mp4",
    codec          = "h264",
    transition     = "fade",
    soundtrackType    = "none",
    frameVoiceTracks  = [],
  } = req.body as {
    images?:              string[];
    framePrompts?:        string[];
    globalPrompt?:        string;
    aspect?:              string;
    renderEngine?:        string;
    projectId?:           string;
    quality?:             string;
    format?:              string;
    codec?:               string;
    transition?:          string;
    soundtrackType?:      string;
    frameVoiceTracks?:    Array<{
      sceneIndex:   number;
      dialogueText: string;
      voiceType:    string;
      emotion:      string;
      language?:    string;
    }>;
  };

  // Validate frames
  if (!Array.isArray(images) || images.length < MIN_FRAMES || images.length > MAX_FRAMES) {
    return res.status(400).json({
      error: `Provide ${MIN_FRAMES}–${MAX_FRAMES} frames.`,
      code: "INVALID_FRAME_COUNT",
    });
  }
  for (let i = 0; i < images.length; i++) {
    if (typeof images[i] !== "string" || !/^https?:\/\//.test(images[i])) {
      return res.status(400).json({
        error: `Frame ${i + 1} must be a valid public URL.`,
        code: "INVALID_FRAME_URL",
      });
    }
  }

  // Engine allow-list (CRITICAL): reject unsupported engines BEFORE the
  // credit gate. Phase 4 disabled runway-gen4 / veo-ultra / pika in the UI
  // and removed their silent aliases in fal.ts — but a stale client or a
  // direct API caller could still submit with one of those IDs. The worker
  // would then fail with FAL_INVALID_INPUT, which is classified as
  // user-attributable + non-refundable in billing.ts. Block it here so no
  // credit is ever consumed for an engine we do not actually run.
  const SUPPORTED_ENGINES = new Set(["luma", "kling", "kling-pro"]);
  const requestedEngine = String(renderEngine || "luma");
  if (!SUPPORTED_ENGINES.has(requestedEngine)) {
    logger.warn({ userId: user.id, requestedEngine }, "[renderJobs] Rejecting unsupported engine before credit gate");
    return res.status(400).json({
      error: `Engine '${requestedEngine}' is not currently available. No credits were charged.`,
      code:  "ENGINE_UNAVAILABLE",
    });
  }

  // FAL mock-mode guard (CRITICAL): if FAL_KEY is missing in production,
  // refuse the cinematic render BEFORE consuming credits. The worker would
  // otherwise charge 60 credits and silently return demo MP4s. Mirrors the
  // guard in /generate-video. Dev is permitted so the queue stays testable.
  if (isMockMode() && process.env["NODE_ENV"] === "production") {
    logger.error({ userId: user.id }, "[renderJobs] Refusing submit — FAL_KEY missing in production");
    return res.status(503).json({
      error: "Cinematic rendering is temporarily unavailable. No credits were charged.",
      code:  "PROVIDER_NOT_CONFIGURED",
    });
  }

  // Credit gate (same as synchronous route)
  const gate = await gateAndConsume(req, sb, {
    freeKind:   "video",
    pickAction: () => "multi_frame",
  });
  if (!gate.ok) return res.status(gate.status).json(gate.body);

  const priority = planToPriority(gate.plan === "active" ? "p15" : gate.plan === "owner" ? "p30" : "free");

  try {
    const job = await createRenderJob({
      userId:       user.id,
      projectId:    projectId ?? undefined,
      priority,
      renderEngine: renderEngine || "luma",
      planCode:     gate.plan,
      // charged_credits is stashed here so renderWorker can refund the
      // EXACT amount the gate consumed (post smart-saver, post plan logic)
      // when an async render fails with a refundable provider error. Without
      // this the worker would have to guess the cost from the action map
      // and might refund the wrong amount.
      inputPayload: { images, framePrompts, globalPrompt, aspect, quality, format, codec, transition, soundtrackType, frameVoiceTracks, charged_credits: gate.cost },
      thumbnailUrl: images[0],
    });

    logger.info(
      { jobId: job.id, userId: user.id, plan: gate.plan, priority, frames: images.length },
      "[renderJobs] Job submitted",
    );

    return res.status(201).json({
      jobId:    job.id,
      status:   job.status,
      priority,
      billing: {
        plan:      gate.plan,
        cost:      gate.cost,
        balance:   gate.balance,
        remaining: gate.remaining,
        limit:     gate.limit,
      },
    });
  } catch (err) {
    // Credit was consumed — attempt refund
    await gate.refund("submit_failed").catch(() => {});
    const msg = err instanceof Error ? err.message : "Failed to create render job";
    logger.error({ err: msg, userId: user.id }, "[renderJobs] Job creation failed");
    return res.status(500).json({ error: msg, code: "SUBMIT_FAILED" });
  }
});

/* ─────────────────────────────────────────────────────────────────────
   GET /api/render/job/:id
   HTTP polling fallback (frontend uses Socket.IO for live updates).
───────────────────────────────────────────────────────────────────── */
router.get("/render/job/:id", requireAuth, async (req, res) => {
  const user = getAuthedUser(req);
  const job  = await getJobForUser(String(req.params.id), user.id);
  if (!job) return res.status(404).json({ error: "Job not found", code: "NOT_FOUND" });
  return res.json({
    jobId:         job.id,
    status:        job.status,
    stage:         job.stage,
    progress:      job.progress,
    retryCount:    job.retry_count,
    failureReason: job.failure_reason,
    outputUrl:     job.output_url,
    thumbnailUrl:  job.thumbnail_url,
    durationSec:   job.duration_sec,
    startedAt:     job.started_at,
    completedAt:   job.completed_at,
  });
});

/* ─────────────────────────────────────────────────────────────────────
   GET /api/render/my-jobs
   User's render history (lightweight list).
───────────────────────────────────────────────────────────────────── */
router.get("/render/my-jobs", requireAuth, async (req, res) => {
  const user  = getAuthedUser(req);
  const limit = Math.min(50, Math.max(1, Number(String(req.query.limit ?? "20")) || 20));
  const jobs  = await getUserJobs(user.id, limit);
  return res.json({ jobs });
});

/* ─────────────────────────────────────────────────────────────────────
   POST /api/render/job/:id/cancel
───────────────────────────────────────────────────────────────────── */
router.post("/render/job/:id/cancel", requireAuth, async (req, res) => {
  const user = getAuthedUser(req);
  const job  = await getJobForUser(String(req.params.id), user.id);
  if (!job) return res.status(404).json({ error: "Job not found", code: "NOT_FOUND" });

  const cancellable: string[] = ["queued", "preparing_assets", "building_prompt_graph"];
  if (!cancellable.includes(job.status)) {
    return res.status(409).json({
      error: `Cannot cancel a job in status '${job.status}'.`,
      code: "NOT_CANCELLABLE",
    });
  }

  await updateJobProgress(job.id, {
    status:        "cancelled" as const,
    stage:         "cancelled",
    failure_reason: "Cancelled by user",
    completed_at:  new Date().toISOString(),
  });

  logger.info({ jobId: job.id, userId: user.id }, "[renderJobs] Job cancelled");
  return res.json({ jobId: job.id, status: "cancelled" });
});

/* ─────────────────────────────────────────────────────────────────────
   GET /api/render/queue-position/:id
   Returns how many jobs are ahead in the queue (1-indexed position).
───────────────────────────────────────────────────────────────────── */
router.get("/render/queue-position/:id", requireAuth, async (req, res) => {
  const user = getAuthedUser(req);
  const job  = await getJobForUser(String(req.params.id), user.id);
  if (!job) return res.status(404).json({ error: "Job not found", code: "NOT_FOUND" });

  if (job.status !== "queued") {
    return res.json({ jobId: job.id, position: 0, status: job.status });
  }

  const position = await getQueuePosition(job.id, job.priority);
  return res.json({ jobId: job.id, position, status: job.status });
});

/* ─────────────────────────────────────────────────────────────────────
   POST /api/render/job/:id/retry
   Re-queues a failed or cancelled job owned by the user.
───────────────────────────────────────────────────────────────────── */
router.post("/render/job/:id/retry", createRateLimiter({ name: "render-retry", windowSec: 60, max: 10 }), requireAuth, async (req, res) => {
  const user    = getAuthedUser(req);
  const jobId   = String(req.params.id);
  const updated = await retryJobForUser(jobId, user.id);

  if (!updated) {
    return res.status(409).json({
      error: "Job cannot be retried — it must be in failed or cancelled status and owned by you.",
      code:  "NOT_RETRYABLE",
    });
  }

  logger.info({ jobId, userId: user.id }, "[renderJobs] Job retried by user");
  return res.json({ jobId, status: "queued" });
});

/* ─────────────────────────────────────────────────────────────────────
   DELETE /api/render/job/:id
   Deletes a completed/failed/cancelled job owned by the user.
───────────────────────────────────────────────────────────────────── */
router.delete("/render/job/:id", requireAuth, async (req, res) => {
  const user    = getAuthedUser(req);
  const jobId   = String(req.params.id);
  const deleted = await deleteJobForUser(jobId, user.id);

  if (!deleted) {
    return res.status(409).json({
      error: "Job cannot be deleted — it must be completed, failed, or cancelled and owned by you.",
      code:  "NOT_DELETABLE",
    });
  }

  logger.info({ jobId, userId: user.id }, "[renderJobs] Job deleted by user");
  return res.json({ jobId, deleted: true });
});

export default router;
