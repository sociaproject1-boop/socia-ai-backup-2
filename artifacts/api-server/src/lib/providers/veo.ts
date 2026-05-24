/**
 * Google Veo via Vertex AI image-to-video provider adapter.
 *
 * Uses Vertex AI's `predictLongRunning` endpoint for Veo. Auth is via a
 * Google service account; credentials are resolved by `google-auth-
 * library` from either:
 *   1. `GOOGLE_APPLICATION_CREDENTIALS` — file path to the SA JSON (the
 *      standard Application Default Credentials path), OR
 *   2. `GOOGLE_VERTEX_CREDENTIALS_JSON` — inline JSON, for env-only
 *      environments (e.g. Replit secrets).
 *
 * Project + location come from:
 *   - `GOOGLE_VERTEX_PROJECT`   (required)
 *   - `GOOGLE_VERTEX_LOCATION`  (optional, defaults to `us-central1`)
 *
 * STATUS: gated on the env above. Without it the adapter throws
 * `PROVIDER_NOT_CONFIGURED` (refundable) so users are never charged.
 *
 * Docs: https://cloud.google.com/vertex-ai/generative-ai/docs/video/generate-videos
 */
import { GoogleAuth, type JWTInput } from "google-auth-library";
import { FalError } from "../fal.js";
import { logger } from "../logger.js";
import type { ProviderResult } from "./types.js";

const POLL_INTERVAL_MS = 5_000;
const TIMEOUT_MS = 360_000;
const DEFAULT_LOCATION = "us-central1";
const VEO_MODEL = "veo-2.0-generate-001";

/**
 * Reject URLs that point at private/internal hosts BEFORE we fetch them.
 *
 * The Veo adapter has to download the user-supplied keyframe and inline
 * it as base64 in the request body (Vertex AI accepts bytesBase64Encoded
 * but not arbitrary external URLs). Without this guard, an attacker
 * could submit `http://169.254.169.254/latest/meta-data/...` and our
 * server would happily fetch cloud metadata. Block obvious private
 * ranges by literal/hostname pattern.
 *
 * Defense-in-depth on top of the existing `/^https?:\/\//` validation.
 * Does NOT resolve DNS, so a public hostname pointing at a private IP
 * can still bypass it; the network egress policy of the host is the
 * second layer.
 */
function assertPublicUrl(u: string): void {
  let parsed: URL;
  try { parsed = new URL(u); }
  catch { throw new FalError("FAL_INVALID_INPUT", "Veo: keyframe URL is not parseable."); }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new FalError("FAL_INVALID_INPUT", "Veo: only http(s) keyframe URLs are accepted.");
  }
  // Normalize: Node's URL.hostname returns bracketed IPv6 literals on
  // some platforms (`[fc00::1]`). Strip brackets before pattern checks
  // so SSRF rules cannot be bypassed via the bracketed form.
  const host = parsed.hostname.toLowerCase().replace(/^\[/, "").replace(/\]$/, "");
  const isPrivate =
    host === "localhost" ||
    host === "0.0.0.0" ||
    host === "::1" ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    /^fe80:/i.test(host) ||
    // IPv6 Unique Local Addresses — full fc00::/7 range = fc00..fdff.
    /^f[cd][0-9a-f]{2}:/i.test(host) ||
    host.endsWith(".internal") || host.endsWith(".local");
  if (isPrivate) {
    throw new FalError("FAL_INVALID_INPUT", "Veo: keyframe URL points at a private/internal host.");
  }
}

/**
 * Build a GoogleAuth client. Throws PROVIDER_NOT_CONFIGURED if neither
 * a credentials file path nor inline JSON is present, or if the project
 * id is missing.
 */
function buildAuth(): { auth: GoogleAuth; project: string; location: string } {
  const project = (process.env["GOOGLE_VERTEX_PROJECT"] || "").trim();
  if (!project) {
    throw new FalError(
      "PROVIDER_NOT_CONFIGURED",
      "Veo (Vertex) is not yet configured: GOOGLE_VERTEX_PROJECT is missing. No credits were charged.",
    );
  }
  const location = (process.env["GOOGLE_VERTEX_LOCATION"] || DEFAULT_LOCATION).trim();
  const inlineJson = (process.env["GOOGLE_VERTEX_CREDENTIALS_JSON"] || "").trim();
  const filePath   = (process.env["GOOGLE_APPLICATION_CREDENTIALS"]   || "").trim();
  if (!inlineJson && !filePath) {
    throw new FalError(
      "PROVIDER_NOT_CONFIGURED",
      "Veo (Vertex) is not yet configured: provide GOOGLE_APPLICATION_CREDENTIALS (file path) or GOOGLE_VERTEX_CREDENTIALS_JSON (inline). No credits were charged.",
    );
  }
  const scopes = ["https://www.googleapis.com/auth/cloud-platform"];
  if (inlineJson) {
    let credentials: JWTInput;
    try { credentials = JSON.parse(inlineJson) as JWTInput; }
    catch {
      throw new FalError(
        "PROVIDER_NOT_CONFIGURED",
        "Veo (Vertex) credentials JSON is not parseable. No credits were charged.",
      );
    }
    return { auth: new GoogleAuth({ credentials, scopes, projectId: project }), project, location };
  }
  // ADC will read GOOGLE_APPLICATION_CREDENTIALS automatically.
  return { auth: new GoogleAuth({ scopes, projectId: project }), project, location };
}

async function getAccessToken(auth: GoogleAuth): Promise<string> {
  try {
    const client = await auth.getClient();
    const t = await client.getAccessToken();
    const token = typeof t === "string" ? t : t.token;
    if (!token) throw new Error("empty token");
    return token;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new FalError("FAL_AUTH", `Veo (Vertex) token mint failed: ${msg}`);
  }
}

/** Try every shape the Vertex Veo `response` field is known to take. */
function extractVideoUri(response: unknown): string | null {
  if (!response || typeof response !== "object") return null;
  const r = response as Record<string, unknown>;

  // Shape A — { videos: [{ gcsUri | uri | bytesBase64Encoded }] }
  const videos = r["videos"];
  if (Array.isArray(videos) && videos.length > 0 && typeof videos[0] === "object" && videos[0] !== null) {
    const v = videos[0] as Record<string, unknown>;
    const uri = (v["gcsUri"] || v["uri"]) as string | undefined;
    if (typeof uri === "string" && uri.length > 0) return uri;
  }

  // Shape B — { predictions: [{ gcsUri | videoUri | bytesBase64Encoded }] }
  const preds = r["predictions"];
  if (Array.isArray(preds) && preds.length > 0 && typeof preds[0] === "object" && preds[0] !== null) {
    const p = preds[0] as Record<string, unknown>;
    const uri = (p["gcsUri"] || p["videoUri"] || p["uri"]) as string | undefined;
    if (typeof uri === "string" && uri.length > 0) return uri;
  }

  // Shape C — { generatedSamples: [{ video: { uri | gcsUri } }] }
  const samples = r["generatedSamples"];
  if (Array.isArray(samples) && samples.length > 0 && typeof samples[0] === "object" && samples[0] !== null) {
    const s = samples[0] as Record<string, unknown>;
    const vid = s["video"] as Record<string, unknown> | undefined;
    const uri = vid && (vid["uri"] || vid["gcsUri"]) as string | undefined;
    if (typeof uri === "string" && uri.length > 0) return uri;
  }

  return null;
}

export async function interpolateVeo(
  frame0Url:  string,
  _frame1Url: string,
  prompt:     string,
  aspect:     string = "9:16",
): Promise<ProviderResult> {
  const { auth, project, location } = buildAuth();
  const token = await getAccessToken(auth);
  const ratio = aspect === "16:9" ? "16:9" : aspect === "1:1" ? "1:1" : "9:16";
  const duration = 5;

  // SSRF defense: refuse private hosts BEFORE the fetch.
  assertPublicUrl(frame0Url);

  // Fetch the keyframe and base64-encode it as Vertex Veo requires
  // inline image data (it does not accept arbitrary external URLs).
  const imgRes = await fetch(frame0Url, { signal: AbortSignal.timeout(30_000) });
  if (!imgRes.ok) throw new FalError("FAL_INVALID_INPUT", `Veo: keyframe fetch HTTP ${imgRes.status}`);
  const mime = imgRes.headers.get("content-type") || "image/jpeg";
  const buf  = Buffer.from(await imgRes.arrayBuffer());
  const b64  = buf.toString("base64");

  const base = `https://${location}-aiplatform.googleapis.com/v1/projects/${project}/locations/${location}/publishers/google/models/${VEO_MODEL}`;

  const submitRes = await fetch(`${base}:predictLongRunning`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type":  "application/json",
    },
    body: JSON.stringify({
      instances: [{
        prompt,
        image: { bytesBase64Encoded: b64, mimeType: mime },
      }],
      parameters: {
        aspectRatio:     ratio,
        durationSeconds: duration,
        sampleCount:     1,
      },
    }),
  });
  if (!submitRes.ok) {
    const t = await submitRes.text().catch(() => "");
    if (submitRes.status === 401 || submitRes.status === 403) {
      throw new FalError("FAL_AUTH", `Veo (Vertex) rejected the credentials (HTTP ${submitRes.status}).`);
    }
    if (submitRes.status === 429) {
      throw new FalError("FAL_RATE_LIMITED", `Veo (Vertex) rate-limited (HTTP 429).`);
    }
    if (submitRes.status >= 500) {
      throw new FalError("FAL_UNAVAILABLE", `Veo (Vertex) upstream error (HTTP ${submitRes.status}).`);
    }
    throw new FalError("FAL_FAILED", `Veo (Vertex) submit failed (HTTP ${submitRes.status}): ${t.slice(0, 300)}`);
  }
  const submit = await submitRes.json() as { name?: string };
  const opName = submit.name;
  if (!opName) throw new FalError("FAL_NO_OUTPUT", "Veo (Vertex) did not return an operation name.");

  logger.info({ provider: "veo", opName, project, location }, "[providers/veo] submitted predictLongRunning");

  // Poll the operation. Vertex uses fetchPredictOperation to surface
  // the long-running result.
  const fetchOpUrl = `${base}:fetchPredictOperation`;
  const deadline = Date.now() + TIMEOUT_MS;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
    // Re-mint the token defensively — long polls can outlive the 1h
    // default access-token lifetime.
    const t2 = await getAccessToken(auth);
    const sRes = await fetch(fetchOpUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${t2}`,
        "Content-Type":  "application/json",
      },
      body: JSON.stringify({ operationName: opName }),
    });
    if (!sRes.ok) {
      // Surface auth/permission failures immediately — silently retrying
      // a 401/403 would turn a clear credential error into a misleading
      // FAL_TIMEOUT at the deadline.
      if (sRes.status === 401 || sRes.status === 403) {
        const t = await sRes.text().catch(() => "");
        throw new FalError("FAL_AUTH", `Veo (Vertex) rejected polling credentials (HTTP ${sRes.status}): ${t.slice(0, 200)}`);
      }
      // 404 means the operation name is unknown — treat as failure, not
      // a transient blip, otherwise we'll loop until the timeout.
      if (sRes.status === 404) {
        throw new FalError("FAL_FAILED", `Veo (Vertex) operation ${opName} not found (HTTP 404).`);
      }
      // 5xx / 429 are transient — keep polling.
      continue;
    }
    const s = await sRes.json() as {
      done?:     boolean;
      response?: unknown;
      error?:    { message?: string; code?: number };
    };
    if (s.error) {
      throw new FalError("FAL_FAILED", `Veo (Vertex) op failed: ${s.error.message || "unknown"}`);
    }
    if (s.done) {
      const uri = extractVideoUri(s.response);
      if (!uri) throw new FalError("FAL_NO_OUTPUT", "Veo (Vertex) op completed without a video URI.");
      logger.info({ provider: "veo", opName }, "[providers/veo] completed");
      return {
        videoUrl: uri,
        provider: "veo",
        duration,
        status:   "succeeded",
        metadata: { opName, project, location, model: VEO_MODEL, ratio },
      };
    }
  }
  throw new FalError("FAL_TIMEOUT", `Veo (Vertex) operation ${opName} timed out after ${TIMEOUT_MS}ms.`);
}
