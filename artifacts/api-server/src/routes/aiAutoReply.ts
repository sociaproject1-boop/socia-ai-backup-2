/**
 * aiAutoReply.ts — toggle and status endpoints for the AI auto-reply feature.
 *
 * Only accessible to the owner account (allanalbacen5@gmail.com).
 *
 * GET  /api/ai-auto-reply/status  — returns { enabled, mode }
 * POST /api/ai-auto-reply/toggle  — body: { enabled: boolean, mode?: "online"|"offline" }
 */
import { Router } from "express";
import { requireAuth, getAuthedUser } from "../lib/replitAuth.js";
import {
  ADMIN_EMAIL, aiState, type AiReplyMode,
  setOwnerOnline, isOwnerEffectivelyOnline,
} from "../lib/aiAutoReplyState.js";

const router = Router();

function requireOwner(req: Parameters<typeof getAuthedUser>[0], res: { status: (n: number) => { json: (b: unknown) => void } }): boolean {
  const user = getAuthedUser(req);
  if (user.email !== ADMIN_EMAIL) {
    res.status(403).json({ error: "Forbidden — admin only", code: "NOT_ADMIN" });
    return false;
  }
  return true;
}

/* ── GET /api/ai-auto-reply/status ─────────────────────────────────────── */

router.get("/ai-auto-reply/status", requireAuth, (req, res): void => {
  if (!requireOwner(req, res)) return;
  res.json({
    enabled:      aiState.enabled,
    mode:         aiState.mode,
    ownerOnline:  isOwnerEffectivelyOnline(),
  });
});

/* ── POST /api/ai-auto-reply/toggle ────────────────────────────────────── */

router.post("/ai-auto-reply/toggle", requireAuth, (req, res): void => {
  if (!requireOwner(req, res)) return;

  const body = (req.body ?? {}) as Record<string, unknown>;

  if (typeof body["enabled"] !== "boolean") {
    res.status(400).json({ error: "'enabled' must be a boolean", code: "BAD_REQUEST" });
    return;
  }

  aiState.enabled = body["enabled"];

  const mode = body["mode"];
  if (mode === "online" || mode === "offline") {
    aiState.mode = mode as AiReplyMode;
  }

  res.json({ ok: true, enabled: aiState.enabled, mode: aiState.mode });
});

export default router;
