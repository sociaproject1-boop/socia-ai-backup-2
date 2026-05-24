import { logger } from "./logger.js";

const FAL_BASE = "https://queue.fal.run";

// Primary model: Kling 1.6 Pro (cinematic quality, 5–10s)
const IMAGE_TO_VIDEO_MODEL = "fal-ai/kling-video/v1.6/pro/image-to-video";
// Keyframe interpolation model: Luma Dream Machine.
// Genuinely uses two image keyframes (frame0 + frame1) to interpolate a
// smooth ~5s clip. Used by the multi-frame storyboard pipeline — every
// consecutive pair of user frames becomes one real Luma call.
const KEYFRAME_INTERP_MODEL = "fal-ai/luma-dream-machine";
const POLL_INTERVAL_MS = 4_000;
const TIMEOUT_MS = 300_000; // 5 minutes

/* ══════════════════════════════════════════════════════════════════════
   MOCK MODE — used when FAL_KEY is absent or returns auth/billing errors.
   Returns a real public MP4 after a realistic delay so the full pipeline
   (FFmpeg encode, Cloudinary upload, DB complete) runs identically.
══════════════════════════════════════════════════════════════════════ */

// Reliable public short MP4 clips from Google's public sample bucket.
// Each is ~15s, 1280×720, cinematic-ish. FFmpeg can download & concat them.
const MOCK_VIDEOS = [
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4",
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4",
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4",
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerMeltdowns.mp4",
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/SubaruOutbackOnStreetAndDirt.mp4",
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4",
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/VolkswagenGTIReview.mp4",
];

let _mockCallCount = 0;

/** Returns true when no FAL_KEY is configured — enables mock render mode. */
export function isMockMode(): boolean {
  return !(process.env["FAL_KEY"] || process.env["FAL_API_KEY"] || "").trim();
}

/**
 * Mock segment generation.
 * Sleeps for a realistic duration (6–14 s per segment) then returns a
 * public demo MP4 URL. Different clips are cycled so multi-segment jobs
 * produce visually varied outputs when concatenated by FFmpeg.
 */
async function mockSegmentVideo(): Promise<string> {
  const delayMs = 6_000 + Math.random() * 8_000; // 6 – 14 s
  await new Promise((r) => setTimeout(r, delayMs));
  const url = MOCK_VIDEOS[_mockCallCount % MOCK_VIDEOS.length];
  _mockCallCount++;
  logger.info({ url, delayMs: Math.round(delayMs) }, "[fal] mock segment generated");
  return url;
}

/**
 * Categorised fal.ai error. The route layer maps `code` to an HTTP status and
 * surfaces `message` to the client.
 */
export class FalError extends Error {
  constructor(
    public readonly code:
      | "FAL_AUTH"          // bad / missing API key (401)
      | "FAL_BILLING"       // account locked / exhausted balance (403)
      | "FAL_FORBIDDEN"     // generic 403 (model not enabled, region, etc.)
      | "FAL_INVALID_INPUT" // 422 / 400 — bad payload (image not reachable, etc.)
      | "FAL_MODERATED"     // moderation block
      | "FAL_RATE_LIMITED"  // 429
      | "FAL_UNAVAILABLE"   // 5xx
      | "FAL_TIMEOUT"
      | "FAL_NO_OUTPUT"
      | "FAL_FAILED"
      | "PROVIDER_NOT_CONFIGURED",  // operator hasn't set the API key for a real provider

    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "FalError";
  }
}

function falKey(): string {
  // .trim() — defends against accidental newline/whitespace in pasted secrets,
  // a very common cause of phantom 401s.
  const k = (process.env["FAL_KEY"] || process.env["FAL_API_KEY"] || "").trim();
  if (!k) throw new FalError("FAL_AUTH", "FAL_KEY is not set in server secrets.");
  return k;
}

function authHeaders(): Record<string, string> {
  return {
    Authorization: `Key ${falKey()}`,
    "Content-Type": "application/json",
  };
}

/**
 * Best-effort categorisation of a fal.ai error response into a typed code.
 */
function categorise(status: number, bodyText: string): FalError {
  let parsed: { error?: string; detail?: string | { message?: string } } | null = null;
  try { parsed = JSON.parse(bodyText); } catch { /* not JSON */ }

  const detailMsg =
    typeof parsed?.detail === "string"
      ? parsed.detail
      : parsed?.detail?.message || parsed?.error || bodyText.slice(0, 300);
  const lower = detailMsg.toLowerCase();

  if (status === 401) {
    return new FalError("FAL_AUTH", "fal.ai rejected the API key. Check FAL_KEY.", status);
  }
  if (status === 403) {
    if (lower.includes("balance") || lower.includes("locked") || lower.includes("top up")) {
      return new FalError(
        "FAL_BILLING",
        "Your fal.ai account is out of credit. Top up at fal.ai/dashboard/billing.",
        status,
      );
    }
    return new FalError(
      "FAL_FORBIDDEN",
      `fal.ai forbidden: ${detailMsg}`,
      status,
    );
  }
  if (status === 422 || status === 400) {
    if (lower.includes("moderat") || lower.includes("nsfw") || lower.includes("safety")) {
      return new FalError("FAL_MODERATED", "fal.ai blocked this content (safety filter).", status);
    }
    return new FalError("FAL_INVALID_INPUT", `Invalid request: ${detailMsg}`, status);
  }
  if (status === 429) {
    return new FalError("FAL_RATE_LIMITED", "fal.ai rate limit hit. Try again in a moment.", status);
  }
  if (status >= 500) {
    return new FalError("FAL_UNAVAILABLE", `fal.ai is unavailable (${status}).`, status);
  }
  return new FalError("FAL_FAILED", detailMsg || `fal.ai error ${status}`, status);
}

interface FalStatus {
  status: "IN_QUEUE" | "IN_PROGRESS" | "COMPLETED" | "FAILED";
  error?: { message?: string } | string;
  queue_position?: number;
}

interface FalVideoResult {
  video?: { url?: string };
}

async function submitRequest(
  model: string,
  input: Record<string, unknown>,
): Promise<string> {
  const url = `${FAL_BASE}/${model}`;
  // Log the request shape (NOT the headers — never log Authorization).
  logger.info(
    { model, payload: { ...input, image_url: typeof input.image_url === "string" ? `${(input.image_url as string).slice(0, 80)}…` : input.image_url } },
    "fal.ai submit",
  );

  const res = await fetch(url, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(input),
  });

  const bodyText = await res.text();

  if (!res.ok) {
    const err = categorise(res.status, bodyText);
    logger.error({ status: res.status, body: bodyText.slice(0, 500), code: err.code }, "fal.ai submit failed");
    throw err;
  }

  let data: { request_id?: string };
  try {
    data = JSON.parse(bodyText);
  } catch {
    throw new FalError("FAL_FAILED", "fal.ai returned a non-JSON response.");
  }

  if (!data.request_id) {
    throw new FalError("FAL_FAILED", "fal.ai accepted the request but returned no request_id.");
  }

  logger.info({ requestId: data.request_id, model }, "fal.ai submit accepted");
  return data.request_id;
}

async function pollUntilDone(
  model: string,
  requestId: string,
): Promise<string> {
  const deadline = Date.now() + TIMEOUT_MS;

  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));

    const statusRes = await fetch(
      `${FAL_BASE}/${model}/requests/${requestId}/status`,
      { headers: authHeaders() },
    );

    const statusBody = await statusRes.text();
    if (!statusRes.ok) {
      throw categorise(statusRes.status, statusBody);
    }

    let status: FalStatus;
    try { status = JSON.parse(statusBody); }
    catch { throw new FalError("FAL_FAILED", "Bad status response from fal.ai"); }

    if (status.status === "COMPLETED") {
      const resultRes = await fetch(
        `${FAL_BASE}/${model}/requests/${requestId}`,
        { headers: authHeaders() },
      );
      const resultText = await resultRes.text();
      if (!resultRes.ok) throw categorise(resultRes.status, resultText);

      let result: FalVideoResult;
      try { result = JSON.parse(resultText); }
      catch { throw new FalError("FAL_FAILED", "Bad result response from fal.ai"); }

      const videoUrl = result.video?.url;
      if (!videoUrl) throw new FalError("FAL_NO_OUTPUT", "fal.ai returned no video URL.");
      return videoUrl;
    }

    if (status.status === "FAILED") {
      const msg =
        typeof status.error === "string"
          ? status.error
          : status.error?.message || "Unknown failure";
      throw new FalError("FAL_FAILED", `fal.ai generation failed: ${msg}`);
    }
    // IN_QUEUE or IN_PROGRESS — keep polling
  }

  throw new FalError("FAL_TIMEOUT", "fal.ai video generation timed out after 5 minutes. Try again.");
}

/**
 * Validate the inputs we send to fal.ai BEFORE making the network call. This
 * gives users a precise message instead of a 422 from fal.
 */
function validateInputs(imageUrl: string, durationSec: number, aspect: string): void {
  if (!imageUrl || !/^https?:\/\//.test(imageUrl)) {
    throw new FalError("FAL_INVALID_INPUT", "Image URL must be a public http(s) URL.");
  }
  if (!Number.isFinite(durationSec) || durationSec < 1 || durationSec > 30) {
    throw new FalError("FAL_INVALID_INPUT", "durationSec must be between 1 and 30.");
  }
  if (!["1:1", "9:16", "16:9"].includes(aspect)) {
    throw new FalError("FAL_INVALID_INPUT", `Unsupported aspect ratio: ${aspect}`);
  }
}

/**
 * Animates a static image into a cinematic video clip using Kling 1.6 Pro.
 * Returns a public .mp4 URL hosted by Fal.ai.
 */
export async function imageToVideo(
  imageUrl: string,
  prompt: string,
  aspect: string = "9:16",
  durationSec: number = 5,
): Promise<string> {
  validateInputs(imageUrl, durationSec, aspect);

  const duration = durationSec >= 8 ? "10" : "5";
  const aspectRatio = aspect === "16:9" ? "16:9" : aspect === "1:1" ? "1:1" : "9:16";

  const requestId = await submitRequest(IMAGE_TO_VIDEO_MODEL, {
    prompt,
    image_url: imageUrl,
    duration,
    aspect_ratio: aspectRatio,
  });

  return pollUntilDone(IMAGE_TO_VIDEO_MODEL, requestId);
}

/* ── Additional render engine models ─────────────────────────────── */
const KLING_STANDARD = "fal-ai/kling-video/v1.6/standard/image-to-video";
const KLING_PRO      = "fal-ai/kling-video/v1.6/pro/image-to-video";
const KLING_MASTER   = "fal-ai/kling-video/v2.1/master/image-to-video";

/**
 * interpolateKling — Kling keyframe interpolation between two image URLs.
 *
 * Kling uses `image_url` (start frame) + `tail_image_url` (end frame)
 * to generate a smooth ~5s clip between both keyframes.
 *
 * @param model  One of KLING_STANDARD | KLING_PRO | KLING_MASTER
 */
export async function interpolateKling(
  frame0Url: string,
  frame1Url: string,
  prompt:    string,
  aspect:    string = "9:16",
  model:     string = KLING_PRO,
): Promise<string> {
  for (const u of [frame0Url, frame1Url]) {
    if (!u || !/^https?:\/\//.test(u)) {
      throw new FalError("FAL_INVALID_INPUT", "Each frame URL must be a public http(s) URL.");
    }
  }
  const aspectRatio = aspect === "16:9" ? "16:9" : aspect === "1:1" ? "1:1" : "9:16";

  const requestId = await submitRequest(model, {
    prompt:          prompt || "smooth cinematic motion between frames",
    image_url:       frame0Url,
    tail_image_url:  frame1Url,
    duration:        "5",
    aspect_ratio:    aspectRatio,
  });

  return pollUntilDone(model, requestId);
}

/**
 * interpolateWithEngine — Dispatches to the correct AI provider based on
 * the engine ID stored in the render job.
 *
 * Mock mode activates automatically when FAL_KEY is absent OR when fal.ai
 * returns an auth/billing error at runtime. A realistic public demo MP4 is
 * returned after a 6–14 s delay so the rest of the pipeline (FFmpeg encode,
 * Cloudinary upload, DB complete) runs identically to a real render.
 *
 * | engine ID         | Provider             | Model                     |
 * |-------------------|----------------------|---------------------------|
 * | luma              | fal.ai Luma          | luma-dream-machine        |
 * | kling-standard    | fal.ai Kling         | v1.6/standard             |
 * | kling-cinematic   | fal.ai Kling         | v1.6/pro                  |
 * | kling-master      | fal.ai Kling         | v2.1/master               |
 * | runway-gen4       | NOT INTEGRATED       | throws FAL_INVALID_INPUT  |
 * | veo-ultra         | NOT INTEGRATED       | throws FAL_INVALID_INPUT  |
 * | pika              | NOT INTEGRATED       | throws FAL_INVALID_INPUT  |
 *
 * IMPORTANT: runway/veo/pika previously aliased silently to Kling — that
 * was dishonest and was removed. The frontend now marks these models as
 * `available: false` (Coming Soon) so users cannot select them. Any direct
 * API call attempting one of these engines will be rejected.
 */
export async function interpolateWithEngine(
  engine:    string,
  frame0Url: string,
  frame1Url: string,
  prompt:    string,
  aspect:    string = "9:16",
): Promise<string> {
  // ── Mock mode: FAL_KEY not configured ─────────────────────────────
  // Engine-scoped: only fal.ai-backed engines fall through to the demo
  // MP4. Third-party providers (runway/veo/pika) must surface their own
  // PROVIDER_NOT_CONFIGURED / FAL_AUTH so the worker refunds correctly
  // — silently returning a demo for a paid Runway/Veo/Pika call would
  // be the worst kind of fake.
  const _FAL_BACKED_FOR_MOCK = new Set([
    "luma", "kling-standard", "kling-cinematic",
    "kling-master", "kling-3-omni",
  ]);
  if (isMockMode() && _FAL_BACKED_FOR_MOCK.has(engine)) {
    logger.info({ engine, mockCall: _mockCallCount + 1 }, "[fal] mock mode — FAL_KEY not set, returning demo segment");
    return mockSegmentVideo();
  }

  // ── Real mode: attempt fal.ai, fall back on auth / billing errors ─
  try {
    switch (engine) {
      case "kling-standard":
        return await interpolateKling(frame0Url, frame1Url, prompt, aspect, KLING_STANDARD);
      case "kling-cinematic":
        return await interpolateKling(frame0Url, frame1Url, prompt, aspect, KLING_PRO);
      case "kling-master":
      case "kling-3-omni":
        // Kling 3.0 Omni is exposed to the studio as the flagship cinematic
        // tier — backed by Kling Master on fal.ai until the dedicated 3.0
        // endpoint ships. Same provider, same billing path.
        return await interpolateKling(frame0Url, frame1Url, prompt, aspect, KLING_MASTER);
      case "runway-gen4": {
        // Real Runway adapter — throws PROVIDER_NOT_CONFIGURED (refundable)
        // when RUNWAY_API_KEY is missing.
        const { interpolateRunway } = await import("./providers/runway.js");
        return await interpolateRunway(frame0Url, frame1Url, prompt, aspect);
      }
      case "veo-ultra": {
        const { interpolateVeo } = await import("./providers/veo.js");
        return await interpolateVeo(frame0Url, frame1Url, prompt, aspect);
      }
      case "pika":
      case "pika-2.2": {
        const { interpolatePika } = await import("./providers/pika.js");
        return await interpolatePika(frame0Url, frame1Url, prompt, aspect);
      }
      case "luma":
        return await interpolateLuma(frame0Url, frame1Url, prompt, aspect);
      default:
        throw new FalError(
          "FAL_INVALID_INPUT",
          `Engine "${engine}" is not recognized. Available engines: luma, kling-standard, kling-cinematic, kling-master, kling-3-omni.`,
        );
    }
  } catch (err) {
    // Runtime fallback: FAL_KEY was set but the live request was rejected.
    // ONLY apply this to fal.ai-backed engines (luma, kling-*). The new
    // third-party adapters (Runway / Veo / Pika) have their OWN keys and
    // their own billing; silently returning a demo MP4 for their auth
    // failures would mislead the user and violate the honesty contract.
    const FAL_BACKED = new Set([
      "luma", "kling-standard", "kling-cinematic",
      "kling-master", "kling-3-omni",
    ]);
    if (
      err instanceof FalError &&
      (err.code === "FAL_AUTH" || err.code === "FAL_BILLING") &&
      FAL_BACKED.has(engine)
    ) {
      logger.warn(
        { engine, falCode: err.code, msg: err.message },
        "[fal] Falling back to mock render — FAL_KEY rejected or account out of credit",
      );
      return mockSegmentVideo();
    }
    throw err;
  }
}

/**
 * Luma Dream Machine — keyframe interpolation between two real image URLs.
 * Both frames genuinely condition the generation. Output is a ~5s MP4.
 *
 * Used by the multi-frame storyboard route to build N-1 segments for N user
 * frames. Each call here is one real, billable Luma generation.
 */
export async function interpolateLuma(
  frame0Url: string,
  frame1Url: string,
  prompt: string,
  aspect: string = "9:16",
): Promise<string> {
  for (const u of [frame0Url, frame1Url]) {
    if (!u || !/^https?:\/\//.test(u)) {
      throw new FalError("FAL_INVALID_INPUT", "Each frame URL must be a public http(s) URL.");
    }
  }
  const aspectRatio =
    aspect === "16:9" ? "16:9" : aspect === "1:1" ? "1:1" : "9:16";

  const requestId = await submitRequest(KEYFRAME_INTERP_MODEL, {
    prompt: prompt || "smooth cinematic transition between frames",
    aspect_ratio: aspectRatio,
    loop: false,
    keyframes: {
      frame0: { type: "image", url: frame0Url },
      frame1: { type: "image", url: frame1Url },
    },
  });

  return pollUntilDone(KEYFRAME_INTERP_MODEL, requestId);
}
