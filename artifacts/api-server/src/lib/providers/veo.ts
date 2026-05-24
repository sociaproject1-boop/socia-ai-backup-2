/**
 * Google Veo (Vertex AI) image-to-video provider adapter.
 *
 * STATUS: scaffolded but not exercised — there is no
 * GOOGLE_VEO_API_KEY / VERTEX_AI_CREDENTIALS configured in this
 * environment. The adapter checks for the key on every call and throws
 * `PROVIDER_NOT_CONFIGURED` if missing. The billing layer classifies that
 * error as refundable so users are NEVER charged.
 *
 * Provider docs: https://ai.google.dev/gemini-api/docs/video
 * Endpoint:      POST https://generativelanguage.googleapis.com/v1beta/models/veo-2.0-generate-001:generateContent
 *
 * When a key lands, set `GOOGLE_VEO_API_KEY` in production secrets.
 */
import { FalError } from "../fal.js";
import { logger } from "../logger.js";

/**
 * Reject URLs that point at private/internal hosts BEFORE we fetch them.
 *
 * The Veo adapter has to download the user-supplied keyframe and inline
 * it as base64 in the request body (the API doesn't accept external
 * image URLs). Without this guard, an attacker could submit
 * `http://169.254.169.254/latest/meta-data/...` and our server would
 * happily fetch cloud metadata or an internal service. Block obvious
 * private ranges by literal/hostname pattern — fast, no DNS roundtrip.
 *
 * Note: this is a defense-in-depth check on top of the existing
 * `/^https?:\/\//` validation. It does NOT resolve DNS, so a public
 * hostname pointing at a private IP can still bypass it; the network
 * egress policy of the host is the second layer.
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

const VEO_BASE = "https://generativelanguage.googleapis.com/v1beta";
const VEO_MODEL = "models/veo-2.0-generate-001";
const POLL_INTERVAL_MS = 5_000;
const TIMEOUT_MS = 360_000;

function veoKey(): string {
  const k = (process.env["GOOGLE_VEO_API_KEY"] || process.env["GOOGLE_GENAI_API_KEY"] || "").trim();
  if (!k) {
    throw new FalError(
      "PROVIDER_NOT_CONFIGURED",
      "Veo is not yet configured on this server. No credits were charged.",
    );
  }
  return k;
}

export async function interpolateVeo(
  frame0Url: string,
  _frame1Url: string,
  prompt: string,
  aspect: string = "9:16",
): Promise<string> {
  const key = veoKey();
  const ratio = aspect === "16:9" ? "16:9" : aspect === "1:1" ? "1:1" : "9:16";

  // SSRF defense: refuse private hosts BEFORE the fetch.
  assertPublicUrl(frame0Url);

  // Fetch the keyframe and base64-encode it as Veo requires inline image data.
  const imgRes = await fetch(frame0Url, { signal: AbortSignal.timeout(30_000) });
  if (!imgRes.ok) throw new FalError("FAL_INVALID_INPUT", `Veo: keyframe fetch HTTP ${imgRes.status}`);
  const mime = imgRes.headers.get("content-type") || "image/jpeg";
  const buf  = Buffer.from(await imgRes.arrayBuffer());
  const b64  = buf.toString("base64");

  const submitRes = await fetch(
    `${VEO_BASE}/${VEO_MODEL}:generateContent?key=${encodeURIComponent(key)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }, { inlineData: { mimeType: mime, data: b64 } }] }],
        generationConfig: { aspectRatio: ratio, durationSeconds: 5 },
      }),
    },
  );
  if (!submitRes.ok) {
    const t = await submitRes.text().catch(() => "");
    if (submitRes.status === 401 || submitRes.status === 403) {
      throw new FalError("FAL_AUTH", `Veo rejected the API key (HTTP ${submitRes.status}).`);
    }
    throw new FalError("FAL_FAILED", `Veo submit failed (HTTP ${submitRes.status}): ${t.slice(0, 300)}`);
  }
  const submit = await submitRes.json() as { name?: string };
  const opName = submit.name;
  if (!opName) throw new FalError("FAL_NO_OUTPUT", "Veo did not return an operation name.");

  logger.info({ provider: "veo", opName }, "[providers/veo] submitted");

  const deadline = Date.now() + TIMEOUT_MS;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
    const sRes = await fetch(`${VEO_BASE}/${opName}?key=${encodeURIComponent(key)}`);
    if (!sRes.ok) continue;
    const s = await sRes.json() as {
      done?: boolean;
      response?: { candidates?: Array<{ content?: { parts?: Array<{ fileData?: { fileUri?: string } }> } }> };
      error?: { message?: string };
    };
    if (s.error) throw new FalError("FAL_FAILED", `Veo op failed: ${s.error.message}`);
    if (s.done) {
      const uri = s.response?.candidates?.[0]?.content?.parts?.find(p => p.fileData?.fileUri)?.fileData?.fileUri;
      if (!uri) throw new FalError("FAL_NO_OUTPUT", "Veo op completed without a video URI.");
      logger.info({ provider: "veo", opName }, "[providers/veo] completed");
      return uri;
    }
  }
  throw new FalError("FAL_TIMEOUT", `Veo operation ${opName} timed out after ${TIMEOUT_MS}ms.`);
}
