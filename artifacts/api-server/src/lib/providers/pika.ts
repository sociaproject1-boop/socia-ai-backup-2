/**
 * Pika image-to-video provider adapter.
 *
 * Supports cinematic motion presets via the `motion_preset` field on
 * Pika's generate endpoint. Common preset names: "cinematic", "anime",
 * "subtle", "intense" — passed through verbatim so new presets land
 * without code changes. Defaults to "cinematic" for the studio pipeline
 * since the dispatcher only enters this adapter for cinematic engines.
 *
 * STATUS: gated on `PIKA_API_KEY` in env. Without it the adapter throws
 * `PROVIDER_NOT_CONFIGURED` (refundable) so users are never charged.
 *
 * Pika's public REST surface is evolving; the request shape below
 * targets their documented developer endpoint. Confirm against current
 * docs before rolling out to production traffic.
 */
import { FalError } from "../fal.js";
import { logger } from "../logger.js";
import type { ProviderResult } from "./types.js";

const PIKA_BASE = "https://api.pika.art/v1";
const POLL_INTERVAL_MS = 4_000;
const TIMEOUT_MS = 300_000;

export interface PikaOptions {
  /** Cinematic motion preset (e.g. "cinematic", "anime", "subtle"). */
  motionPreset?: string;
  /** Negative prompt (things the model should avoid). */
  negativePrompt?: string;
  /** Style override (e.g. "cinematic", "stylized"). */
  style?: string;
  /** Clip length in seconds; Pika supports 3–5s typically. */
  duration?: number;
}

function pikaKey(): string {
  const k = (process.env["PIKA_API_KEY"] || "").trim();
  if (!k) {
    throw new FalError(
      "PROVIDER_NOT_CONFIGURED",
      "Pika is not yet configured on this server. No credits were charged.",
    );
  }
  return k;
}

export async function interpolatePika(
  frame0Url:  string,
  _frame1Url: string,
  prompt:     string,
  aspect:     string = "9:16",
  opts:       PikaOptions = {},
): Promise<ProviderResult> {
  const key = pikaKey();
  const ratio = aspect === "16:9" ? "16:9" : aspect === "1:1" ? "1:1" : "9:16";
  const duration = opts.duration ?? 5;
  const motionPreset = opts.motionPreset ?? "cinematic";

  const submitRes = await fetch(`${PIKA_BASE}/generate`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model:          "pika-2.2",
      prompt,
      image_url:      frame0Url,
      aspect_ratio:   ratio,
      duration,
      motion_preset:  motionPreset,
      ...(opts.negativePrompt ? { negative_prompt: opts.negativePrompt } : {}),
      ...(opts.style          ? { style:           opts.style          } : {}),
    }),
  });

  if (!submitRes.ok) {
    const t = await submitRes.text().catch(() => "");
    if (submitRes.status === 401 || submitRes.status === 403) {
      throw new FalError("FAL_AUTH", `Pika rejected the API key (HTTP ${submitRes.status}).`);
    }
    if (submitRes.status === 429) {
      throw new FalError("FAL_RATE_LIMITED", `Pika rate-limited (HTTP 429).`);
    }
    if (submitRes.status >= 500) {
      throw new FalError("FAL_UNAVAILABLE", `Pika upstream error (HTTP ${submitRes.status}).`);
    }
    throw new FalError("FAL_FAILED", `Pika submit failed (HTTP ${submitRes.status}): ${t.slice(0, 300)}`);
  }
  const submit = await submitRes.json() as { id?: string };
  const jobId = submit.id;
  if (!jobId) throw new FalError("FAL_NO_OUTPUT", "Pika did not return a job id.");

  logger.info({ provider: "pika", jobId, motionPreset }, "[providers/pika] submitted");

  const deadline = Date.now() + TIMEOUT_MS;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
    const sRes = await fetch(`${PIKA_BASE}/jobs/${jobId}`, {
      headers: { "Authorization": `Bearer ${key}` },
    });
    if (!sRes.ok) {
      if (sRes.status === 401 || sRes.status === 403) {
        throw new FalError("FAL_AUTH", `Pika rejected the API key during polling (HTTP ${sRes.status}).`);
      }
      continue;
    }
    const s = await sRes.json() as { status?: string; video?: { url?: string }; error?: string };
    if (s.status === "completed" && s.video?.url) {
      logger.info({ provider: "pika", jobId }, "[providers/pika] completed");
      return {
        videoUrl: s.video.url,
        provider: "pika",
        duration,
        status:   "succeeded",
        metadata: { jobId, model: "pika-2.2", motionPreset, ratio },
      };
    }
    if (s.status === "failed") {
      throw new FalError("FAL_FAILED", `Pika job ${jobId} failed: ${s.error || "unknown"}`);
    }
  }
  throw new FalError("FAL_TIMEOUT", `Pika job ${jobId} timed out after ${TIMEOUT_MS}ms.`);
}
