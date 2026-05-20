/**
 * Studio model configuration — DB-backed.
 *
 * GET   /admin/studio/models      — list all model configs
 * PATCH /admin/studio/models/:id  — update single model (validated)
 *
 * Replaces the localStorage-only prototype. Source of truth is now the
 * `studio_model_config` table (see migration 32).
 */
import { Router } from "express";
import { requireAdmin, getServiceClient, type AdminClaims } from "../lib/adminAuth.js";
import { broadcastAuditEvent } from "../lib/adminSocket.js";

const router = Router();

const VALID_PLANS = ["free", "p15", "p30"] as const;
type Plan = typeof VALID_PLANS[number];

router.get("/admin/studio/models", requireAdmin(), async (_req, res) => {
  const sb = getServiceClient();
  if (!sb) return res.status(503).json({ code: "NO_SERVICE_CLIENT" });

  try {
    const { data, error } = await sb
      .from("studio_model_config")
      .select("id,name,enabled,credits_per_seg,min_plan,max_frames,updated_at,updated_by")
      .order("id");
    if (error) return res.status(500).json({ code: "DB_ERROR", message: error.message });
    return res.json({ models: data ?? [] });
  } catch (e) {
    return res.status(500).json({ code: "DB_ERROR", message: (e as Error).message });
  }
});

router.patch("/admin/studio/models/:id", requireAdmin(), async (req, res) => {
  const sb = getServiceClient();
  if (!sb) return res.status(503).json({ code: "NO_SERVICE_CLIENT" });
  const claims = (req as typeof req & { adminClaims: AdminClaims }).adminClaims;

  const { id } = req.params;
  const body = (req.body ?? {}) as {
    enabled?: unknown; credits_per_seg?: unknown;
    min_plan?: unknown; max_frames?: unknown;
  };

  /* Server-side validation — never trust the client */
  const patch: Record<string, unknown> = {};

  if (typeof body.enabled === "boolean") {
    patch["enabled"] = body.enabled;
  }
  if (typeof body.credits_per_seg === "number" && Number.isFinite(body.credits_per_seg)) {
    if (body.credits_per_seg < 1 || body.credits_per_seg > 500)
      return res.status(400).json({ code: "VALIDATION", message: "credits_per_seg must be between 1 and 500" });
    patch["credits_per_seg"] = Math.round(body.credits_per_seg);
  }
  if (typeof body.min_plan === "string") {
    if (!VALID_PLANS.includes(body.min_plan as Plan))
      return res.status(400).json({ code: "VALIDATION", message: `min_plan must be one of: ${VALID_PLANS.join(", ")}` });
    patch["min_plan"] = body.min_plan;
  }
  if (typeof body.max_frames === "number" && Number.isFinite(body.max_frames)) {
    if (body.max_frames < 2 || body.max_frames > 20)
      return res.status(400).json({ code: "VALIDATION", message: "max_frames must be between 2 and 20" });
    patch["max_frames"] = Math.round(body.max_frames);
  }

  if (Object.keys(patch).length === 0)
    return res.status(400).json({ code: "VALIDATION", message: "no valid fields to update" });

  patch["updated_at"] = new Date().toISOString();
  patch["updated_by"] = claims.username;

  try {
    const { data, error } = await sb
      .from("studio_model_config")
      .update(patch)
      .eq("id", id)
      .select()
      .single();
    if (error) return res.status(500).json({ code: "DB_ERROR", message: error.message });
    if (!data) return res.status(404).json({ code: "NOT_FOUND" });

    broadcastAuditEvent({
      type: "admin_action",
      severity: "info",
      message: `Studio model "${id}" updated`,
      adminUsername: claims.username,
    });

    return res.json({ model: data });
  } catch (e) {
    return res.status(500).json({ code: "DB_ERROR", message: (e as Error).message });
  }
});

export default router;
