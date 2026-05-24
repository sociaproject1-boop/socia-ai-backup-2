/**
 * Runway Gen-4 image-to-video provider adapter.
 *
 * STATUS: scaffolded but not exercised — there is no RUNWAY_API_KEY
 * configured in this environment. The adapter checks for the key on
 * every call and throws `PROVIDER_NOT_CONFIGURED` if missing. The
 * billing layer classifies that error as refundable so a user who
 * somehow reaches this code path is NEVER charged.
 *
 * Provider docs: https://docs.dev.runwayml.com/api/
 * Endpoint:      POST https://api.dev.runwayml.com/v1/image_to_video
 *
 * When a key lands, set `RUNWAY_API_KEY` in production secrets and the
 * engine becomes live. No other change required.
 */
import { FalError } from "../fal.js";
import { logger } from "../logger.js";

const RUNWAY_BASE = "https://api.dev.runwayml.com/v1";
const POLL_INTERVAL_MS = 4_000;
const TIMEOUT_MS = 300_000;

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

/**
 * Runway Gen-4 image-to-video.
 * @param frame0Url   public http(s) URL for the keyframe.
 * @param frame1Url   ignored (Runway Gen-4 takes a single source image).
 * @param prompt      cinematic motion prompt.
 * @param aspect      "9:16" | "16:9" | "1:1".
 * @returns final MP4 URL.
 */
export async function interpolateRunway(
  frame0Url: string,
  _frame1Url: string,
  prompt: string,
  aspect: string = "9:16",
): Promise<string> {
  const key = runwayKey(); // throws PROVIDER_NOT_CONFIGURED if missing

  const ratio =
    aspect === "16:9" ? "1280:720" :
    aspect === "1:1"  ? "960:960"  : "720:1280";

  const submitRes = await fetch(`${RUNWAY_BASE}/image_to_video`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${key}`,
      "Content-Type":  "application/json",
      "X-Runway-Version": "2024-11-06",
    },
    body: JSON.stringify({
      model:     "gen4_turbo",
      promptImage: frame0Url,
      promptText:  prompt,
      ratio,
      duration:    5,
    }),
  });

  if (!submitRes.ok) {
    const t = await submitRes.text().catch(() => "");
    if (submitRes.status === 401 || submitRes.status === 403) {
      throw new FalError("FAL_AUTH", `Runway rejected the API key (HTTP ${submitRes.status}).`);
    }
    throw new FalError("FAL_FAILED", `Runway submit failed (HTTP ${submitRes.status}): ${t.slice(0, 300)}`);
  }
  const submit = await submitRes.json() as { id?: string };
  const taskId = submit.id;
  if (!taskId) throw new FalError("FAL_NO_OUTPUT", "Runway did not return a task id.");

  logger.info({ provider: "runway", taskId }, "[providers/runway] submitted image_to_video");

  // Poll for completion
  const deadline = Date.now() + TIMEOUT_MS;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
    const sRes = await fetch(`${RUNWAY_BASE}/tasks/${taskId}`, {
      headers: { "Authorization": `Bearer ${key}`, "X-Runway-Version": "2024-11-06" },
    });
    if (!sRes.ok) continue;
    const s = await sRes.json() as { status?: string; output?: string[] };
    if (s.status === "SUCCEEDED" && Array.isArray(s.output) && s.output[0]) {
      logger.info({ provider: "runway", taskId, outputs: s.output.length }, "[providers/runway] completed");
      return s.output[0];
    }
    if (s.status === "FAILED") {
      throw new FalError("FAL_FAILED", `Runway task ${taskId} failed.`);
    }
  }
  throw new FalError("FAL_TIMEOUT", `Runway task ${taskId} timed out after ${TIMEOUT_MS}ms.`);
}
