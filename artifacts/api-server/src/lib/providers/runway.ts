/**
 * Runway image-to-video provider adapter.
 *
 * Supports BOTH Gen-3 Alpha Turbo (`gen3a_turbo`) and Gen-4 Turbo
 * (`gen4_turbo`). The studio surfaces these as two separate engine IDs
 * (`runway-gen3` and `runway-gen4`) so users see + are charged per
 * model.
 *
 * STATUS: gated on `RUNWAY_API_KEY` in env. When the key is absent the
 * adapter throws `PROVIDER_NOT_CONFIGURED` (refundable). When present
 * the request is real and billable on the operator's Runway account.
 *
 * Provider docs:  https://docs.dev.runwayml.com/api/
 * Endpoint:       POST https://api.dev.runwayml.com/v1/image_to_video
 * Polling:        GET  https://api.dev.runwayml.com/v1/tasks/{id}
 *
 * Text-to-video is exposed as a separate helper (`runwayTextToVideo`)
 * but is NOT used by the storyboard pipeline — every storyboard segment
 * has a real source keyframe.
 */
import { FalError } from "../fal.js";
import { logger } from "../logger.js";
import type { ProviderResult } from "./types.js";

const RUNWAY_BASE = "https://api.dev.runwayml.com/v1";
const RUNWAY_API_VERSION = "2024-11-06";
const POLL_INTERVAL_MS = 4_000;
const TIMEOUT_MS = 300_000;

export type RunwayModel = "gen3a_turbo" | "gen4_turbo";

function runwayKey(): string {
  const k = (process.env["RUNWAY_API_KEY"] || "").trim();
  if (!k) {
    throw new FalError(
      "PROVIDER_NOT_CONFIGURED",
      "Runway is not yet configured on this server. No credits were charged.",
    );
  }
  return k;
}

function authHeaders(): Record<string, string> {
  return {
    "Authorization":   `Bearer ${runwayKey()}`,
    "Content-Type":    "application/json",
    "X-Runway-Version": RUNWAY_API_VERSION,
  };
}

function ratioForModel(model: RunwayModel, aspect: string): string {
  // Gen-3 accepts a smaller set of preset ratios; Gen-4 accepts arbitrary
  // pixel ratios. Use the closest preset for safety.
  if (aspect === "16:9") return "1280:720";
  if (aspect === "1:1")  return model === "gen3a_turbo" ? "960:960" : "960:960";
  return "720:1280"; // 9:16 default
}

/** Map Runway HTTP errors to typed FalError codes. */
function rethrow(status: number, body: string, op: string): never {
  if (status === 401 || status === 403) {
    throw new FalError("FAL_AUTH",     `Runway rejected the API key during ${op} (HTTP ${status}).`);
  }
  if (status === 429) {
    throw new FalError("FAL_RATE_LIMITED", `Runway rate limit during ${op} (HTTP 429).`);
  }
  if (status >= 500) {
    throw new FalError("FAL_UNAVAILABLE", `Runway upstream error during ${op} (HTTP ${status}).`);
  }
  if (status === 400 || status === 422) {
    throw new FalError("FAL_INVALID_INPUT", `Runway rejected the request payload during ${op} (HTTP ${status}): ${body.slice(0, 300)}`);
  }
  throw new FalError("FAL_FAILED", `Runway ${op} failed (HTTP ${status}): ${body.slice(0, 300)}`);
}

/**
 * Poll a Runway task until it reaches a terminal state.
 * Returns the first output URL on SUCCEEDED; throws on FAILED/timeout.
 */
async function pollTask(taskId: string): Promise<string> {
  const deadline = Date.now() + TIMEOUT_MS;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
    const sRes = await fetch(`${RUNWAY_BASE}/tasks/${taskId}`, {
      headers: { "Authorization": `Bearer ${runwayKey()}`, "X-Runway-Version": RUNWAY_API_VERSION },
    });
    if (!sRes.ok) {
      // Transient — keep polling unless auth fails permanently.
      if (sRes.status === 401 || sRes.status === 403) {
        const t = await sRes.text().catch(() => "");
        rethrow(sRes.status, t, "task-poll");
      }
      continue;
    }
    const s = await sRes.json() as { status?: string; output?: string[]; failure?: string };
    if (s.status === "SUCCEEDED" && Array.isArray(s.output) && s.output[0]) {
      return s.output[0];
    }
    if (s.status === "FAILED") {
      throw new FalError("FAL_FAILED", `Runway task ${taskId} failed: ${s.failure || "unknown"}`);
    }
  }
  throw new FalError("FAL_TIMEOUT", `Runway task ${taskId} timed out after ${TIMEOUT_MS}ms.`);
}

/**
 * Runway image-to-video. Used by the storyboard dispatcher.
 *
 * @param model       which Runway model to call (gen3a_turbo | gen4_turbo).
 * @param frame0Url   public http(s) URL for the keyframe.
 * @param prompt      cinematic motion prompt.
 * @param aspect      "9:16" | "16:9" | "1:1".
 */
export async function runwayImageToVideo(
  model:     RunwayModel,
  frame0Url: string,
  prompt:    string,
  aspect:    string = "9:16",
): Promise<ProviderResult> {
  if (!frame0Url || !/^https?:\/\//.test(frame0Url)) {
    throw new FalError("FAL_INVALID_INPUT", "Runway: keyframe URL must be a public http(s) URL.");
  }
  const ratio = ratioForModel(model, aspect);
  const duration = 5;

  const submitRes = await fetch(`${RUNWAY_BASE}/image_to_video`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      model,
      promptImage: frame0Url,
      promptText:  prompt,
      ratio,
      duration,
    }),
  });

  if (!submitRes.ok) {
    const t = await submitRes.text().catch(() => "");
    rethrow(submitRes.status, t, "image_to_video submit");
  }
  const submit = await submitRes.json() as { id?: string };
  const taskId = submit.id;
  if (!taskId) throw new FalError("FAL_NO_OUTPUT", "Runway did not return a task id.");

  logger.info({ provider: "runway", model, taskId }, "[providers/runway] submitted image_to_video");
  const videoUrl = await pollTask(taskId);
  logger.info({ provider: "runway", model, taskId }, "[providers/runway] completed");

  return {
    videoUrl,
    provider: "runway",
    duration,
    status:   "succeeded",
    metadata: { model, taskId, mode: "image_to_video", ratio },
  };
}

/**
 * Runway text-to-video. NOT wired into the storyboard pipeline (the
 * pipeline always provides a keyframe), but exposed for callers that
 * want pure text→video generation later.
 */
export async function runwayTextToVideo(
  model:  RunwayModel,
  prompt: string,
  aspect: string = "9:16",
): Promise<ProviderResult> {
  const ratio = ratioForModel(model, aspect);
  const duration = 5;

  const submitRes = await fetch(`${RUNWAY_BASE}/text_to_video`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ model, promptText: prompt, ratio, duration }),
  });
  if (!submitRes.ok) {
    const t = await submitRes.text().catch(() => "");
    rethrow(submitRes.status, t, "text_to_video submit");
  }
  const submit = await submitRes.json() as { id?: string };
  const taskId = submit.id;
  if (!taskId) throw new FalError("FAL_NO_OUTPUT", "Runway did not return a task id.");

  logger.info({ provider: "runway", model, taskId }, "[providers/runway] submitted text_to_video");
  const videoUrl = await pollTask(taskId);
  logger.info({ provider: "runway", model, taskId }, "[providers/runway] completed");

  return {
    videoUrl,
    provider: "runway",
    duration,
    status:   "succeeded",
    metadata: { model, taskId, mode: "text_to_video", ratio },
  };
}

/**
 * Storyboard-dispatcher entrypoint. Defaults to Gen-4 Turbo for
 * back-compat with the original engine ID `runway-gen4`.
 */
export async function interpolateRunway(
  frame0Url: string,
  _frame1Url: string,
  prompt: string,
  aspect: string = "9:16",
  model:  RunwayModel = "gen4_turbo",
): Promise<ProviderResult> {
  return runwayImageToVideo(model, frame0Url, prompt, aspect);
}
