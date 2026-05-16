/**
 * Save a remote URL to the user's device at original quality.
 *
 * Strategy (in order):
 *
 *   1. Capacitor native (the Android APK):
 *      - Fetch as blob → base64.
 *      - Write to the app's CACHE directory via @capacitor/filesystem.
 *      - Open the native Android share sheet via @capacitor/share with the
 *        real `file://` URI. The user taps "Save to Photos" / "Save to Files"
 *        and Android's MediaStore writes it into the Gallery / Downloads.
 *      - This is the ONLY reliable path to the gallery from inside a WebView.
 *        `<a download>` is silently ignored by Android WebView.
 *
 *   2. Browser (Android Chrome, desktop, PWA, iOS Safari):
 *      - blob + anchor `download` attribute. Writes to Downloads/.
 *      - On Android, MediaStore scans Downloads/ and surfaces images/videos
 *        in the Gallery automatically.
 *
 * The Web Share API path was deliberately removed: when the user dismissed
 * the share sheet it threw `AbortError`, which we incorrectly treated as
 * success — so the success animation showed without anything being saved.
 * That was the root cause of "Save doesn't actually save".
 */

export type SaveResult = "shared" | "downloaded";

interface SaveOptions {
  /** Used to derive the filename. Will be sanitized + truncated. */
  filename?: string;
  kind: "image" | "video";
}

function pickExtension(blob: Blob, fallbackUrl: string, kind: "image" | "video"): string {
  const m = blob.type.toLowerCase();
  if (m.includes("png")) return "png";
  if (m.includes("jpeg") || m.includes("jpg")) return "jpg";
  if (m.includes("webp")) return "webp";
  if (m.includes("gif")) return "gif";
  if (m.includes("mp4")) return "mp4";
  if (m.includes("webm")) return "webm";
  if (m.includes("quicktime") || m.includes("mov")) return "mov";

  const u = fallbackUrl.toLowerCase();
  const match = u.match(/\.(png|jpe?g|webp|gif|mp4|webm|mov)(?:[?#]|$)/);
  if (match) return match[1].replace("jpeg", "jpg");

  return kind === "video" ? "mp4" : "jpg";
}

function buildFilename(hint: string | undefined, ext: string, kind: "image" | "video"): string {
  const slug = (hint || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 32);
  const prefix = kind === "video" ? "socia_video" : "socia_image";
  const stem = slug ? `${prefix}_${slug}` : prefix;
  return `${stem}_${Date.now()}.${ext}`;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error("Read failed"));
    reader.onload = () => {
      const result = reader.result as string;
      // result === "data:<mime>;base64,<payload>" — Filesystem wants the payload only
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.readAsDataURL(blob);
  });
}

interface CapacitorGlobal {
  isNativePlatform?: () => boolean;
}

function isNativeCapacitor(): boolean {
  if (typeof window === "undefined") return false;
  const cap = (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor;
  return Boolean(cap?.isNativePlatform?.());
}

async function saveViaCapacitor(blob: Blob, filename: string): Promise<SaveResult> {
  // Both imports are dynamic so a future browser-only build won't drag the
  // native plugin code into the main bundle.
  const { Filesystem, Directory } = await import("@capacitor/filesystem");
  const { Share } = await import("@capacitor/share");

  const base64 = await blobToBase64(blob);
  const written = await Filesystem.writeFile({
    path: filename,
    data: base64,
    directory: Directory.Cache,
    recursive: true,
  });

  // The Android share sheet shows "Save to Photos", "Save to Files", Drive,
  // WhatsApp, etc. Picking "Save to Photos" goes straight into Gallery.
  await Share.share({
    title: filename,
    url: written.uri,
    dialogTitle: "Save to device",
  });
  return "shared";
}

async function saveViaAnchor(blob: Blob, filename: string): Promise<SaveResult> {
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = filename;
  a.rel = "noopener";
  // Some Android browsers won't trigger download for anchors not in the DOM.
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    a.remove();
    URL.revokeObjectURL(objectUrl);
  }, 1500);
  return "downloaded";
}

export async function saveToDevice(url: string, opts: SaveOptions): Promise<SaveResult> {
  const res = await fetch(url, { credentials: "omit", mode: "cors" });
  if (!res.ok) throw new Error(`Download failed (HTTP ${res.status})`);
  const blob = await res.blob();

  const ext = pickExtension(blob, url, opts.kind);
  const filename = buildFilename(opts.filename, ext, opts.kind);

  if (isNativeCapacitor()) {
    return saveViaCapacitor(blob, filename);
  }
  return saveViaAnchor(blob, filename);
}
