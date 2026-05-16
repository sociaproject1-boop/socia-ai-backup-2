const CLOUD_NAME = "devyx5yyk";
const UPLOAD_PRESET = "socia_upload";

type ResourceType = "image" | "video";

function sanitizeName(raw: string): string {
  return raw
    .replace(/https?:\/\/[^/]+/g, "")
    .replace(/[/\\]/g, "_")
    .replace(/\s+/g, "_")
    .replace(/[^\w-]/g, "")
    .slice(0, 60);
}

function safePublicId(prefix: string, hint = ""): string {
  const slug = sanitizeName(hint);
  return `socia/${prefix}_${Date.now()}${slug ? `_${slug}` : ""}`;
}

function safeFilename(prefix: string, hint = ""): string {
  const slug = sanitizeName(hint);
  const candidate = `${prefix}_${Date.now()}${slug ? `_${slug}` : ""}`;
  const cleaned = candidate.replace(/[/\\]/g, "_");
  return cleaned || `${prefix}_${Date.now()}`;
}

async function postUpload(
  resourceType: ResourceType,
  file: string,
  hint: string,
): Promise<string> {
  const endpoint = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/${resourceType}/upload`;
  // Cloudinary auto-derives display_name from the LAST segment of public_id.
  // Our public_id is `socia/<prefix>_<ts>_<slug>` and the slug is sanitized
  // by `sanitizeName()` (slashes → `_`, only word chars + `-` survive), so
  // the last segment is guaranteed slash-free.
  // We do NOT send `display_name` — unsigned upload presets reject it.
  const publicId = safePublicId(resourceType, hint);
  const filename = safeFilename(resourceType, hint);

  const body = new URLSearchParams({
    file,
    upload_preset: UPLOAD_PRESET,
    public_id: publicId,
    filename_override: filename,
  });

  const res = await fetch(endpoint, { method: "POST", body });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const msg =
      (err as { error?: { message?: string } }).error?.message ??
      `HTTP ${res.status}`;
    throw new Error(msg);
  }

  const data = await res.json();
  return (data as { secure_url: string }).secure_url;
}

async function uploadWithRetry(
  resourceType: ResourceType,
  file: string,
  hint: string,
): Promise<string> {
  try {
    return await postUpload(resourceType, file, hint);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // One automatic retry — drop the user-supplied hint entirely so any
    // exotic characters in it can't poison the second attempt.
    try {
      return await postUpload(resourceType, file, "");
    } catch (err2) {
      const msg2 = err2 instanceof Error ? err2.message : String(err2);
      throw new Error(
        `Cloudinary ${resourceType} upload failed (after retry): ${msg2} (initial: ${msg})`,
      );
    }
  }
}

/**
 * Uploads a remote URL to Cloudinary (unsigned preset).
 * All identifiers are sanitized — display_name / public_id / filename never
 * contain slashes, so we cannot trip Cloudinary's
 * "Display name cannot contain slashes" validator.
 */
export async function uploadUrlToCloudinary(
  remoteUrl: string,
  resourceType: ResourceType = "image",
  hint = "",
): Promise<string> {
  return uploadWithRetry(resourceType, remoteUrl, hint);
}

/**
 * Uploads a Node.js Buffer to Cloudinary via base64 data URL.
 * Used for OpenAI gpt-image-1 PNG buffers.
 */
export async function uploadBufferToCloudinary(
  buffer: Buffer,
  resourceType: ResourceType = "image",
  hint = "",
): Promise<string> {
  const mime = resourceType === "video" ? "video/mp4" : "image/png";
  const dataUrl = `data:${mime};base64,${buffer.toString("base64")}`;
  return uploadWithRetry(resourceType, dataUrl, hint);
}
