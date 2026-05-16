/**
 * Admin Render Jobs — monitoring and control routes.
 *
 * GET  /api/admin/render/stats     — queue stats + worker status
 * GET  /api/admin/render/jobs      — full job list (filterable)
 * GET  /api/admin/render/job/:id   — single job detail
 * POST /api/admin/render/job/:id/cancel — force-cancel any job
 * POST /api/admin/render/job/:id/retry  — requeue a failed job
 */
import { Router, type Request, type Response } from "express";
import { requireAdmin } from "../lib/adminAuth.js";
import { logger } from "../lib/logger.js";
import { getAdminQueueStats, updateJobProgress, getServiceClient } from "../lib/renderJobsDb.js";
import { WORKER_ID } from "../lib/renderWorker.js";

const router = Router();

/* ── Stats ───────────────────────────────────────────────────────────── */
router.get("/admin/render/stats", requireAdmin, async (_req: Request, res: Response) => {
  const stats = await getAdminQueueStats();
  return res.json({
    worker: {
      id:     WORKER_ID,
      status: "running",
    },
    queue:  stats,
    updatedAt: new Date().toISOString(),
  });
});

/* ── Job list ─────────────────────────────────────────────────────────── */
router.get("/admin/render/jobs", requireAdmin, async (req: Request, res: Response) => {
  const { status, limit = "50", offset = "0" } = req.query as Record<string, string>;
  const sb = getServiceClient();

  let query = sb
    .from("render_jobs")
    .select("id,user_id,status,stage,progress,priority,retry_count,failure_reason,render_engine,output_url,thumbnail_url,duration_sec,worker_id,worker_heartbeat,queued_at,started_at,completed_at,created_at")
    .order("created_at", { ascending: false })
    .limit(Number(limit))
    .range(Number(offset), Number(offset) + Number(limit) - 1);

  if (status) query = query.eq("status", status);

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ jobs: data ?? [], total: (data ?? []).length });
});

/* ── Single job detail ───────────────────────────────────────────────── */
router.get("/admin/render/job/:id", requireAdmin, async (req: Request, res: Response) => {
  const jobId = String(req.params.id);
  const sb = getServiceClient();
  const { data, error } = await sb
    .from("render_jobs")
    .select("*")
    .eq("id", jobId)
    .single();
  if (error || !data) return res.status(404).json({ error: "Job not found" });
  return res.json(data);
});

/* ── Force-cancel any job ────────────────────────────────────────────── */
router.post("/admin/render/job/:id/cancel", requireAdmin, async (req: Request, res: Response) => {
  await updateJobProgress(String(req.params.id), {
    status:        "cancelled" as const,
    stage:         "cancelled",
    failure_reason: "Force-cancelled by admin",
    completed_at:  new Date().toISOString(),
  });
  logger.info({ jobId: String(req.params.id) }, "[adminRender] Job force-cancelled");
  return res.json({ jobId: String(req.params.id), status: "cancelled" });
});

/* ── Requeue a failed job ────────────────────────────────────────────── */
router.post("/admin/render/job/:id/retry", requireAdmin, async (req: Request, res: Response) => {
  const jobId = String(req.params.id);
  const sb = getServiceClient();
  const { data: job } = await sb
    .from("render_jobs")
    .select("status, retry_count")
    .eq("id", jobId)
    .single();

  if (!job) return res.status(404).json({ error: "Job not found" });
  if (!["failed", "cancelled"].includes((job as { status: string }).status)) {
    return res.status(409).json({ error: "Only failed or cancelled jobs can be retried." });
  }

  await updateJobProgress(jobId, {
    status:   "queued" as const,
    stage:    "queued",
    progress: 0,
  });

  logger.info({ jobId }, "[adminRender] Job re-queued by admin");
  return res.json({ jobId, status: "queued" });
});

export default router;
