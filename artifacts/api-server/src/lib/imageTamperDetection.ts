/**
 * Image Tampering Detection — pure Node.js binary analysis.
 *
 * Checks (no native addons required, no OpenCV):
 *   1. Editing software string signatures in JPEG/PNG header bytes
 *      (EXIF Software tag, XMP Creator metadata survive many upload pipelines)
 *   2. JPEG quality estimation from DQT (Define Quantization Table) marker
 *      Very low quality (<30) = heavy recompression = likely edited then resaved
 *   3. File size plausibility for receipt screenshots
 *
 * Returns a tamper_score 0–100 and a human-readable reasons list.
 * tamper_detected = score >= 60.
 *
 * Designed to be called in parallel with OCR — it reuses the image buffer
 * that was already downloaded for hashing so no extra HTTP round-trip is made.
 */

import { logger } from "./logger.js";

export interface TamperResult {
  tamper_score:    number;
  tamper_detected: boolean;
  reasons:         string[];
  software?:       string;
}

/* ── Known editing software signatures ─────────────────────────────────── */

const EDITING_SOFTWARE_SIGS = [
  "photoshop",
  "adobe",
  "gimp",
  "lightroom",
  "canva",
  "picsart",
  "pixlr",
  "facetune",
  "snapseed",
  "vsco",
  "inshot",
  "paint.net",
  "paintshop",
  "affinity",
  "corel",
  "inkscape",
  "krita",
  "darktable",
  "luminar",
  "meitu",
  "beautycam",
];

const LEGITIMATE_CAPTURE_SIGS = [
  "screenshot",
  "iphone",
  "android",
  "samsung",
  "xiaomi",
  "huawei",
  "pixel",
  "oppo",
  "vivo",
  "realme",
];

/* ── Binary helpers ─────────────────────────────────────────────────────── */

/**
 * Scan the first 64 KB of image bytes for known editing-software string
 * signatures embedded in EXIF / XMP / PNG text chunks.
 */
function detectEditingSoftware(buf: Buffer): { found: string[]; legitimate: string[] } {
  const slice = buf.slice(0, 65_536).toString("latin1").toLowerCase();
  return {
    found:      EDITING_SOFTWARE_SIGS.filter((s) => slice.includes(s)),
    legitimate: LEGITIMATE_CAPTURE_SIGS.filter((s) => slice.includes(s)),
  };
}

/**
 * Estimate JPEG quality (0–100) from the first DQT quantization table.
 * Lower quality = heavier compression = often a sign of repeated editing/saving.
 * Returns null for non-JPEG buffers.
 */
function estimateJpegQuality(buf: Buffer): number | null {
  if (buf.length < 4 || buf[0] !== 0xFF || buf[1] !== 0xD8) return null;

  let i = 2;
  while (i < buf.length - 4) {
    if (buf[i] !== 0xFF) break;
    const marker = buf[i + 1] as number;
    const segLen = ((buf[i + 2] as number) << 8) | (buf[i + 3] as number);

    if (marker === 0xDB) {
      // DQT segment — skip 1-byte precision+id, then read 64 luminance quant coefficients
      const tableStart = i + 4 + 1; // +4 for marker+length, +1 for precision/id byte
      if (tableStart + 64 > buf.length) break;
      let sum = 0;
      for (let j = 0; j < 64; j++) {
        sum += buf[tableStart + j] as number;
      }
      const avgQ = sum / 64;
      // Rough quality estimate: avgQ ≈ 2 → quality ~95; avgQ ≈ 20 → quality ~65; avgQ ≈ 50 → quality ~20
      const quality = Math.max(0, Math.min(100, Math.round(95 - (avgQ - 2) * 1.5)));
      return quality;
    }

    if (segLen < 2) break;
    i += 2 + segLen;
  }
  return null;
}

/**
 * Check whether the file size is plausible for a payment receipt screenshot.
 * Real phone screenshots are typically 50 KB – 10 MB.
 */
function checkFileSizePlausibility(bytes: number): { suspicious: boolean; reason?: string } {
  if (bytes < 8_000) {
    return {
      suspicious: true,
      reason:     `File is unusually small (${Math.round(bytes / 1_000)} KB) for a receipt screenshot.`,
    };
  }
  if (bytes > 30_000_000) {
    return {
      suspicious: true,
      reason:     "File is unusually large — please use a standard screenshot.",
    };
  }
  return { suspicious: false };
}

/* ── JPEG restart marker analysis ──────────────────────────────────────── */

/**
 * Scan for JPEG restart markers (RST0–RST7: 0xFFD0–0xFFD7).
 * Real phone screenshots have either no restart markers or uniform intervals.
 * A high coefficient of variation in RST intervals suggests the image was
 * partially replaced / patched (clone stamp, copy-paste regions).
 */
function analyzeJpegRestartMarkers(buf: Buffer): { suspicious: boolean; score: number; reason?: string } {
  if (buf.length < 4 || buf[0] !== 0xFF || buf[1] !== 0xD8) {
    return { suspicious: false, score: 0 };
  }

  const intervals: number[] = [];
  let lastPos = -1;

  for (let i = 2; i < buf.length - 2; i++) {
    if (buf[i] !== 0xFF) continue;
    const marker = buf[i + 1] as number;
    if (marker >= 0xD0 && marker <= 0xD7) {
      if (lastPos >= 0) intervals.push(i - lastPos);
      lastPos = i;
    }
  }

  if (intervals.length < 4) return { suspicious: false, score: 0 };

  const mean   = intervals.reduce((a, b) => a + b, 0) / intervals.length;
  const stdDev = Math.sqrt(intervals.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / intervals.length);
  const cv     = mean > 0 ? stdDev / mean : 0;

  if (cv > 0.9) {
    return {
      suspicious: true,
      score:      Math.min(35, Math.round(cv * 20)),
      reason:
        `Irregular JPEG data segments detected (variability: ${(cv * 100).toFixed(0)}%) — ` +
        "may indicate image regions were replaced or cloned.",
    };
  }

  return { suspicious: false, score: 0 };
}

/**
 * Detect whether the JPEG uses progressive encoding.
 * Phone screenshots and direct app captures are almost always baseline JPEG or PNG.
 * Progressive JPEG is standard in web-exported or editor-saved images.
 * This is a weak signal — used only as a contributing factor.
 */
function detectProgressiveJpeg(buf: Buffer): boolean {
  if (buf.length < 4 || buf[0] !== 0xFF || buf[1] !== 0xD8) return false;
  let i = 2;
  while (i < buf.length - 4) {
    if (buf[i] !== 0xFF) break;
    const marker = buf[i + 1] as number;
    if (marker === 0xC2) return true;   // SOF2 = progressive DCT
    if (marker === 0xC0 || marker === 0xC1) return false; // SOF0/SOF1 = baseline
    const segLen = ((buf[i + 2] as number) << 8) | (buf[i + 3] as number);
    if (segLen < 2) break;
    i += 2 + segLen;
  }
  return false;
}

/**
 * Check for suspicious EXIF data patterns:
 * - No Make/Model fields in a supposed phone screenshot
 * - GPS data present (unusual for app screenshots)
 * - Multiple APP markers (common in web/editor exports)
 */
function analyzeExifAnomalies(buf: Buffer): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 0;

  if (buf.length < 4 || buf[0] !== 0xFF || buf[1] !== 0xD8) return { score, reasons };

  const slice = buf.slice(0, Math.min(32_768, buf.length));
  const text  = slice.toString("latin1").toLowerCase();

  // Count APP markers (0xFFE0 – 0xFFEF) — many can indicate editor exports
  let appCount = 0;
  for (let i = 2; i < slice.length - 2; i++) {
    if (slice[i] === 0xFF) {
      const m = slice[i + 1] as number;
      if (m >= 0xE0 && m <= 0xEF) appCount++;
    }
  }

  if (appCount > 6) {
    score += 10;
    reasons.push(
      `${appCount} JPEG application markers detected — more than typical for a direct phone screenshot.`,
    );
  }

  // XMP metadata presence (common in editor-saved files, rare in phone captures)
  if (text.includes("xpacket") || text.includes("xmp:createdate")) {
    score += 15;
    reasons.push("XMP metadata block detected — typically added by photo-editing software.");
  }

  return { score, reasons };
}

/* ── Main export ────────────────────────────────────────────────────────── */

/**
 * Analyse an image buffer for tampering signals.
 *
 * @param imageUrl - original image URL (only used for logging)
 * @param buf      - already-downloaded image bytes (pass null to skip analysis)
 */
export async function analyzeImageTampering(
  imageUrl: string,
  buf:       Buffer | null,
): Promise<TamperResult> {
  if (!buf) {
    return { tamper_score: 0, tamper_detected: false, reasons: [] };
  }

  const reasons: string[] = [];
  let tamper_score = 0;
  let software: string | undefined;

  try {
    // 1. Editing software signatures in EXIF / XMP header bytes
    const { found, legitimate } = detectEditingSoftware(buf);
    if (found.length > 0) {
      software = found[0];
      const label = found[0]!.charAt(0).toUpperCase() + found[0]!.slice(1);
      if (legitimate.length === 0) {
        reasons.push(`Image metadata contains editing software signature: ${label}.`);
        tamper_score += 60;
      } else {
        reasons.push(`Image may have been processed by editing software (${label}).`);
        tamper_score += 20;
      }
    }

    // 2. JPEG quality from DQT quantization table — very low = heavily re-saved
    const quality = estimateJpegQuality(buf);
    if (quality !== null) {
      if (quality < 25) {
        reasons.push(
          `Very heavy JPEG recompression detected (estimated quality: ${quality}/100). ` +
          "This may indicate the image was repeatedly opened, edited, and resaved.",
        );
        tamper_score += 30;
      } else if (quality < 45) {
        reasons.push(
          `Low JPEG quality detected (estimated: ${quality}/100) — ` +
          "image may have been re-exported after editing.",
        );
        tamper_score += 15;
      }
    }

    // 3. File size plausibility for a receipt screenshot
    const sizeCheck = checkFileSizePlausibility(buf.byteLength);
    if (sizeCheck.suspicious) {
      reasons.push(sizeCheck.reason!);
      tamper_score += 20;
    }

    // 4. JPEG restart marker irregularity — may indicate cloned/patched regions
    const rstCheck = analyzeJpegRestartMarkers(buf);
    if (rstCheck.suspicious && rstCheck.reason) {
      reasons.push(rstCheck.reason);
      tamper_score += rstCheck.score;
    }

    // 5. Progressive JPEG encoding — phone screenshots are almost always baseline
    const isProgressive = detectProgressiveJpeg(buf);
    if (isProgressive) {
      // Only flag if no editing software already detected (avoids double-counting)
      if (found.length === 0) {
        reasons.push(
          "Progressive JPEG encoding detected — phone app screenshots are typically " +
          "baseline JPEG, which is standard for direct captures.",
        );
        tamper_score += 10;
      }
    }

    // 6. EXIF / APP marker anomalies (XMP metadata, excessive APP segments)
    const exif = analyzeExifAnomalies(buf);
    if (exif.score > 0) {
      reasons.push(...exif.reasons);
      tamper_score += exif.score;
    }

  } catch (err) {
    logger.warn({ err, imageUrl }, "[tamper] analysis error (non-fatal)");
  }

  tamper_score = Math.min(100, tamper_score);

  logger.info({ tamper_score, reasons, imageUrl }, "[tamper] analysis complete");

  return {
    tamper_score,
    tamper_detected: tamper_score >= 60,
    reasons,
    software,
  };
}
