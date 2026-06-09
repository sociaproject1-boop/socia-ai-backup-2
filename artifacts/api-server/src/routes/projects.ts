/**
 * Studio Projects — persist timeline/scene/config data for the Film Director Studio.
 *
 * POST /api/projects          — create a new project
 * PUT  /api/projects/:id      — update an existing project
 * GET  /api/projects          — list user's projects (lightweight)
 * GET  /api/projects/:id      — single project (full payload)
 * DELETE /api/projects/:id    — delete project
 */
import { Router } from "express";
import { requireAuth, getAuthedUser } from "../lib/replitAuth.js";
import { logger } from "../lib/logger.js";
import { getServiceClient } from "../lib/renderJobsDb.js";

const router = Router();

/* ── Create ──────────────────────────────────────────────────────────── */
router.post("/projects", requireAuth, async (req, res) => {
  const user = getAuthedUser(req);
  const { title = "Untitled Project", frames = [], config = {} } = req.body as {
    title?: string; frames?: unknown[]; config?: unknown;
  };

  const sb = getServiceClient();
  const { data, error } = await sb
    .from("studio_projects")
    .insert({ user_id: user.id, title, frames, config })
    .select("id, title, created_at")
    .single();

  if (error) {
    logger.error({ err: error.message, userId: user.id }, "[projects] Create failed");
    return res.status(500).json({ error: error.message });
  }

  return res.status(201).json({ projectId: (data as { id: string }).id, ...data });
});

/* ── Update (auto-save debounce is on frontend) ──────────────────────── */
router.put("/projects/:id", requireAuth, async (req, res) => {
  const user = getAuthedUser(req);
  const { title, frames, config } = req.body as {
    title?: string; frames?: unknown[]; config?: unknown;
  };

  const patch: Record<string, unknown> = {};
  if (title !== undefined) patch.title = title;
  if (frames !== undefined) patch.frames = frames;
  if (config !== undefined) patch.config = config;
  patch.version = (req.body.version ?? 1) + 1;

  const sb = getServiceClient();
  const { data, error } = await sb
    .from("studio_projects")
    .update(patch)
    .eq("id", req.params.id)
    .eq("user_id", user.id)
    .select("id, title, version, updated_at")
    .single();

  if (error || !data) return res.status(404).json({ error: "Project not found or access denied." });
  return res.json({ projectId: (data as { id: string }).id, ...data });
});

/* ── List ────────────────────────────────────────────────────────────── */
router.get("/projects", requireAuth, async (req, res) => {
  const user  = getAuthedUser(req);
  const limit = Math.min(50, Number(req.query.limit) || 20);
  const sb    = getServiceClient();

  const { data, error } = await sb
    .from("studio_projects")
    .select("id, title, version, created_at, updated_at")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (error) return res.status(500).json({ error: error.message });
  return res.json({ projects: data ?? [] });
});

/* ── Single ──────────────────────────────────────────────────────────── */
router.get("/projects/:id", requireAuth, async (req, res) => {
  const user = getAuthedUser(req);
  const sb   = getServiceClient();

  const { data, error } = await sb
    .from("studio_projects")
    .select("*")
    .eq("id", req.params.id)
    .eq("user_id", user.id)
    .single();

  if (error || !data) return res.status(404).json({ error: "Project not found." });
  return res.json(data);
});

/* ── Delete ──────────────────────────────────────────────────────────── */
router.delete("/projects/:id", requireAuth, async (req, res) => {
  const user = getAuthedUser(req);
  const sb   = getServiceClient();

  await sb
    .from("studio_projects")
    .delete()
    .eq("id", req.params.id)
    .eq("user_id", user.id);

  return res.json({ deleted: true });
});

export default router;
