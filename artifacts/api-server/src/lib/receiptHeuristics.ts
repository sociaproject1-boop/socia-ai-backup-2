/**
 * Receipt Heuristics — OCR text analysis for fake / test / low-quality receipts.
 *
 * These checks are pure JavaScript and operate only on the OCR result.
 * No image decoding or external APIs required.
 *
 * Exported functions:
 *   computeBlurScore     — estimates how blurry/unreadable the image is (0–100)
 *   analyzeSuspiciousText — detects test/fake/voided receipt patterns in OCR text
 */

import type { OcrResult } from "./ocrService.js";

/* ── Known plan amounts (Philippines) — not considered suspicious rounds ── */
const VALID_PLAN_AMOUNTS = new Set([299, 499, 699, 999, 1200, 1700, 2000]);

/* ── Suspicious keywords ────────────────────────────────────────────────── */
const SUSPICIOUS_KEYWORDS: readonly string[] = [
  "sample",
  "demo",
  "test receipt",
  "example",
  "void",
  "voided",
  "cancelled transaction",
  "invalid",
  "fake",
  "trial",
  "dummy",
  "placeholder",
  "lorem ipsum",
  "not a receipt",
  "specimen",
  "this is not",
  "for display only",
  "test only",
];

/* ── Blur score ─────────────────────────────────────────────────────────── */

/**
 * Compute a blur/readability score (0–100) from OCR output.
 *  0  = crystal clear image, OCR had no trouble
 *  100 = totally unreadable
 *
 * Sources of signal (additive, capped at 100):
 *   - OCR not configured (no key)           → 0  (no signal at all)
 *   - OCR API failed with network error      → 20 (technical failure, not blur)
 *   - OCR ran but returned empty string      → 85 (almost certainly blurry)
 *   - OCR ran, very short text (<15 chars)   → 70
 *   - Low OCR confidence (<40)              → scales from 40 → 65
 *   - Short text density (<100 chars total)  → +15 penalty
 */
export function computeBlurScore(ocr: OcrResult): number {
  if (ocr.error === "OCR_NOT_CONFIGURED") return 0;

  // Technical API failure (not related to image quality)
  if (!ocr.success && ocr.error && ocr.error !== "EMPTY_TEXT") return 20;

  // OCR ran but extracted nothing — image is unreadable
  if (ocr.success && !ocr.raw_text) return 85;

  // Very sparse text output
  if (ocr.raw_text.length < 15) return 70;

  // Scale from confidence: confidence 80→blur 20; confidence 30→blur 55; confidence 0→blur 70
  const fromConfidence = Math.round(20 + (1 - ocr.confidence / 100) * 50);

  // Low text density penalty (receipts should have many fields)
  const densityPenalty =
    ocr.raw_text.length < 50  ? 15 :
    ocr.raw_text.length < 100 ? 8  : 0;

  return Math.min(100, fromConfidence + densityPenalty);
}

/* ── Receipt structure / layout analysis ────────────────────────────────── */

export interface StructureAnalysisResult {
  structure_score: number;   // 0–100 (higher = more suspicious)
  field_count:     number;   // identifiable receipt fields detected
  suspicious:      boolean;
  reasons:         string[];
}

const RECEIPT_STATUS_WORDS = [
  "success", "successful", "paid", "completed", "approved",
  "verified", "received", "sent", "transferred", "done",
  "transaction complete", "payment sent",
];

const RECEIPT_NAME_INDICATORS = [
  "sender", "receiver", "from", "to:", "account name",
  "account holder", "recipient", "beneficiary",
];

/**
 * Analyse OCR text structure for signs of a fake, minimal, or edited receipt.
 *
 * Real Philippine e-wallet receipts always contain:
 *   ✓ Amount (₱)          ✓ Reference / transaction number
 *   ✓ Date + time         ✓ Status (Success / Paid / Completed)
 *   ✓ Sender/receiver     ✓ At least 8–30 lines of text
 *
 * Missing or inconsistent fields raise the structure_score.
 */
export function analyzeReceiptStructure(
  rawText:              string,
  candidates:           string[],
  extractedAmount:      number | null,
  extractedDate:        string | null,
  extractedPaymentMethod: string | null,
): StructureAnalysisResult {
  const reasons: string[] = [];
  let score = 0;

  // No text at all — cannot assess structure; neutral (blur check handles this)
  if (!rawText || rawText.length < 10) {
    return { structure_score: 0, field_count: 0, suspicious: false, reasons: [] };
  }

  const lower = rawText.toLowerCase();
  const lines  = rawText.split(/\r?\n/).filter((l) => l.trim().length > 0);

  /* ── Count identifiable receipt fields ─────────────────────────────── */
  let fieldCount = 0;
  if (extractedAmount !== null)        fieldCount++;            // ₱ amount
  if (candidates.length > 0)           fieldCount++;            // reference number
  if (extractedDate !== null)          fieldCount++;            // date / time
  if (extractedPaymentMethod !== null) fieldCount++;            // GCash / Maya / etc.
  if (RECEIPT_STATUS_WORDS.some((w) => lower.includes(w))) fieldCount++;  // status
  if (RECEIPT_NAME_INDICATORS.some((w) => lower.includes(w))) fieldCount++; // name

  /* ── 1. Missing critical fields ─────────────────────────────────────── */
  if (rawText.length > 30 && fieldCount < 2) {
    score += 45;
    reasons.push(
      `Only ${fieldCount} payment field(s) detected — real receipts show amount, reference, date, and status. ` +
      "This may be a fabricated or heavily cropped image.",
    );
  } else if (rawText.length > 60 && fieldCount < 3) {
    score += 25;
    reasons.push(
      `Fewer payment fields than expected (${fieldCount} detected). ` +
      "A valid receipt should include at least an amount, reference number, and date.",
    );
  }

  /* ── 2. Too few lines for a payment receipt ────────────────────────── */
  if (lines.length < 3 && rawText.length > 25) {
    score += 25;
    reasons.push(
      `Receipt has only ${lines.length} line(s). Payment receipts typically contain 10–30 lines of fields.`,
    );
  } else if (lines.length < 6 && rawText.length > 60) {
    score += 10;
    reasons.push(
      `Receipt appears compressed into ${lines.length} lines — may have been cropped or edited.`,
    );
  }

  /* ── 3. Only a reference number — no other receipt content ─────────── */
  const stripped = rawText.replace(/[^A-Za-z0-9]/g, "");
  if (stripped.length < 35 && candidates.length > 0 && extractedAmount === null && extractedDate === null) {
    score += 35;
    reasons.push(
      "Receipt contains only a reference number with no other payment details. " +
      "This is a common pattern in fabricated receipts.",
    );
  }

  /* ── 4. High digit density (number-only fake) ───────────────────────── */
  const digits    = (rawText.match(/\d/g) ?? []).length;
  const alphaDig  = (rawText.match(/[A-Za-z0-9]/g) ?? []).length;
  if (alphaDig > 15 && digits / alphaDig > 0.82) {
    score += 20;
    reasons.push(
      "Receipt text is predominantly numeric — real receipts mix labels, names, and digits.",
    );
  }

  /* ── 5. Amount plausibility ─────────────────────────────────────────── */
  if (extractedAmount !== null) {
    if (extractedAmount <= 0) {
      score += 30;
      reasons.push(`Extracted amount ₱${extractedAmount} is not a valid payment amount.`);
    } else if (extractedAmount > 500_000) {
      score += 15;
      reasons.push(
        `Extracted amount ₱${extractedAmount.toLocaleString()} is unusually large — please verify this is correct.`,
      );
    }
  }

  /* ── 6. Irregular line-width variance (pasted text regions) ─────────── */
  if (lines.length >= 6) {
    const widths  = lines.map((l) => l.trim().length);
    const mean    = widths.reduce((a, b) => a + b, 0) / widths.length;
    const stdDev  = Math.sqrt(widths.reduce((s, w) => s + Math.pow(w - mean, 2), 0) / widths.length);
    const cv      = mean > 0 ? stdDev / mean : 0;
    if (cv > 1.6 && lines.length > 8) {
      score += 15;
      reasons.push(
        "Receipt has highly irregular line widths — may indicate pasted or overlaid text regions.",
      );
    }
  }

  /* ── 7. No recognisable payment-app branding in a long receipt ──────── */
  const BRAND_WORDS = [
    "gcash", "maya", "paymaya", "grabpay", "shopeepay", "bdo", "bpi",
    "unionbank", "metrobank", "landbank", "cimb", "rcbc",
  ];
  const hasBranding = BRAND_WORDS.some((b) => lower.includes(b));
  if (!hasBranding && rawText.length > 100 && extractedPaymentMethod === null) {
    score += 10;
    reasons.push(
      "No payment provider name detected — real receipts always show the app or bank name.",
    );
  }

  score = Math.min(100, score);

  return {
    structure_score: score,
    field_count:     fieldCount,
    suspicious:      score >= 40,
    reasons,
  };
}

/* ── Suspicious text analysis ───────────────────────────────────────────── */

export interface SuspiciousTextResult {
  suspicious:     boolean;
  keywords_found: string[];
  score:          number;   // 0–100 additional fraud points
  reasons:        string[];
}

/**
 * Analyse OCR text for patterns that suggest a fake, test, or voided receipt.
 *
 * @param rawText         — full OCR text blob
 * @param extractedAmount — amount parsed from OCR (null if not found)
 */
export function analyzeSuspiciousText(
  rawText:         string,
  extractedAmount: number | null,
): SuspiciousTextResult {
  const lower   = rawText.toLowerCase();
  const reasons: string[] = [];
  let score = 0;

  // 1. Suspicious keywords
  const found = SUSPICIOUS_KEYWORDS.filter((kw) => lower.includes(kw));
  if (found.length > 0) {
    // Each additional keyword after the first adds weight
    score += 20 + Math.min(found.length - 1, 3) * 10;
    reasons.push(
      `Suspicious keywords detected in receipt text: ${found.slice(0, 3).map((k) => `"${k}"`).join(", ")}.`,
    );
  }

  // 2. Unrealistically short for any payment receipt
  if (rawText.length > 0 && rawText.length < 30) {
    score += 15;
    reasons.push("Receipt text is unusually short — may be a fabricated or low-quality image.");
  }

  // 3. Suspiciously perfect round amount (not a real plan price)
  if (extractedAmount !== null) {
    const isKnownPlan = VALID_PLAN_AMOUNTS.has(extractedAmount);
    if (!isKnownPlan && extractedAmount > 0 && extractedAmount % 500 === 0) {
      score += 10;
      reasons.push(
        `Amount ₱${extractedAmount.toLocaleString()} is an unusually round number — please verify this matches your actual payment.`,
      );
    }
  }

  // 4. Repeating character blocks (machine-generated / copy-paste artifacts)
  const repeatPattern = rawText.match(/(.{6,})\1{2,}/g);
  if (repeatPattern && repeatPattern.length > 0) {
    score += 20;
    reasons.push("Unusual repeating text patterns detected — possible template or generated receipt.");
  }

  // 5. All-caps or all-lowercase single-line "receipt" (often fake screenshots)
  const lines = rawText.trim().split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 1 && rawText.length > 20) {
    score += 10;
    reasons.push("Receipt appears to contain only a single line of text — real receipts have multiple fields.");
  }

  score = Math.min(100, score);

  return {
    suspicious:     score >= 20,
    keywords_found: found,
    score,
    reasons,
  };
}
