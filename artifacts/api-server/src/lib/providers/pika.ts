/**
 * Pika Labs image-to-video provider adapter.
 *
 * STATUS: scaffolded but not exercised — there is no PIKA_API_KEY
 * configured in this environment. The adapter checks for the key on
 * every call and throws `PROVIDER_NOT_CONFIGURED` if missing. The billing
 * layer classifies that error as refundable so users are NEVER charged.
 *
 * Pika does not currently publish a stable public REST API; this adapter
 * targets their documented developer endpoint. Confirm the request shape
 * against their current docs before flipping the engine to `available:
 * true` in the studio.
 */
import { FalError } from "../fal.js";
import { logger } from "../logger.js";

const PIKA_BASE = "https://api.pika.art/v1";
const POLL_INTERVAL_MS = 4_000;
const TIMEOUT_MS = 300_000;

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
  frame0Url: string,
  _frame1Url: string,
  prompt: string,
  aspect: string = "9:16",
): Promise<string> {
  const key = pikaKey();
  const ratio = aspect === "16:9" ? "16:9" : aspect === "1:1" ? "1:1" : "9:16";

  const submitRes = await fetch(`${PIKA_BASE}/generate`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model:        "pika-2.2",
      prompt,
      image_url:    frame0Url,
      aspect_ratio: ratio,
      duration:     5,
    }),
  });

  if (!submitRes.ok) {
    const t = await submitRes.text().catch(() => "");
    if (submitRes.status === 401 || submitRes.status === 403) {
      throw new FalError("FAL_AUTH", `Pika rejected the API key (HTTP ${submitRes.status}).`);
    }
    throw new FalError("FAL_FAILED", `Pika submit failed (HTTP ${submitRes.status}): ${t.slice(0, 300)}`);
  }
  const submit = await submitRes.json() as { id?: string };
  const jobId = submit.id;
  if (!jobId) throw new FalError("FAL_NO_OUTPUT", "Pika did not return a job id.");

  logger.info({ provider: "pika", jobId }, "[providers/pika] submitted");

  const deadline = Date.now() + TIMEOUT_MS;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
    const sRes = await fetch(`${PIKA_BASE}/jobs/${jobId}`, {
      headers: { "Authorization": `Bearer ${key}` },
    });
    if (!sRes.ok) continue;
    const s = await sRes.json() as { status?: string; video?: { url?: string } };
    if (s.status === "completed" && s.video?.url) {
      logger.info({ provider: "pika", jobId }, "[providers/pika] completed");
      return s.video.url;
    }
    if (s.status === "failed") {
      throw new FalError("FAL_FAILED", `Pika job ${jobId} failed.`);
    }
  }
  throw new FalError("FAL_TIMEOUT", `Pika job ${jobId} timed out after ${TIMEOUT_MS}ms.`);
}
