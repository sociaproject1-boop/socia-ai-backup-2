/**
 * GET /api/engines/availability
 *
 * Single source of truth that the frontend engine picker consults to
 * decide which engines are pickable RIGHT NOW. Returns an array of
 * `{id, name, provider, available, requires, reason?}` records derived
 * from `ENGINE_REGISTRY` in `lib/engineRegistry.ts`.
 *
 * No auth — the list reveals nothing more than the engine names that
 * are publicly documented in the studio UI. The actual key values are
 * never leaked; only `available: boolean` and a generic reason string.
 */
import { Router, type IRouter } from "express";
import { buildAvailability } from "../lib/engineRegistry.js";
import { isMockMode } from "../lib/fal.js";

const router: IRouter = Router();

router.get("/engines/availability", (_req, res) => {
  const falPresent = !isMockMode();
  const engines = buildAvailability(falPresent);
  res.json({ engines });
});

export default router;
