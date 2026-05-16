import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Buffer } from "node:buffer";

export interface DownloadedImage {
  filePath: string;
  cleanup: () => Promise<void>;
}

/**
 * SSRF defense — strict hostname allowlist of known public image hosts that the
 * frontend actually uploads to. Anything else is rejected before any network
 * I/O, so the server cannot be tricked into fetching internal services,
 * cloud-metadata endpoints, file://, or arbitrary third-party hosts.
 *
 * Currently allowed:
 *   - Supabase Storage public URLs:   `<project>.supabase.co`
 *   - Cloudinary delivery URLs:       `res.cloudinary.com`
 */
const ALLOWED_HOST_SUFFIXES = [".supabase.co", "res.cloudinary.com"];

function assertHostAllowed(hostname: string): void {
  const h = hostname.toLowerCase();
  const ok = ALLOWED_HOST_SUFFIXES.some((suf) =>
    suf.startsWith(".") ? h.endsWith(suf) : h === suf,
  );
  if (!ok) {
    throw new Error(
      `Image host not allowed: ${hostname}. Upload to Supabase Storage first.`,
    );
  }
}

/**
 * Download a public image URL to a temp PNG file for use with gpt-image-1's
 * edit endpoint (which requires a file-like input). Caller MUST call cleanup()
 * in a finally block.
 *
 * Hard rules:
 *   - https only (no http, no file:, no data:, no ftp:)
 *   - hostname must be on the SSRF allowlist above
 *   - response must be image/* and ≤ 25 MB
 */
export async function downloadImageToTempFile(url: string): Promise<DownloadedImage> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("imageUrl must be a valid URL");
  }
  if (parsed.protocol !== "https:") {
    throw new Error("imageUrl must use https://");
  }
  assertHostAllowed(parsed.hostname);

  const res = await fetch(parsed.toString(), { redirect: "manual" });
  // Reject any redirect — would let an attacker bypass the host allowlist.
  if (res.status >= 300 && res.status < 400) {
    throw new Error("Image URL must not redirect");
  }
  if (!res.ok) {
    throw new Error(`Failed to download image (${res.status})`);
  }
  const ct = res.headers.get("content-type") || "";
  if (!ct.startsWith("image/")) {
    throw new Error(`URL did not return an image (content-type: ${ct || "unknown"})`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length === 0) {
    throw new Error("Downloaded image is empty");
  }
  if (buf.length > 25 * 1024 * 1024) {
    throw new Error("Image is larger than 25MB");
  }
  const dir = await mkdtemp(join(tmpdir(), "preset-img-"));
  const filePath = join(dir, "input.png");
  await writeFile(filePath, buf);
  return {
    filePath,
    cleanup: () => rm(dir, { recursive: true, force: true }),
  };
}
