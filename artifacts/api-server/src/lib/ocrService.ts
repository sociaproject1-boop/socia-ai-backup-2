/**
 * OCR Service — extracts payment reference numbers, amounts, payment methods,
 * and transaction dates from receipt images.
 *
 * Engine priority:
 *   1. Tesseract.js (primary) — local WebAssembly, free, no API key required.
 *      A singleton worker is created lazily and re-used across requests.
 *   2. OCRSpace API (secondary) — cloud, better for low-resolution or damaged
 *      images. Only used when OCR_SPACE_API_KEY is set AND Tesseract returned
 *      empty text (or failed).
 *
 * Reference extraction covers the common Philippine e-wallet formats:
 *   • GCash / Maya: 13-digit numeric string
 *   • Labelled references: "Ref No", "Transaction ID", "Receipt No", etc.
 *   • Generic alphanumeric tokens with ≥2 digits
 *
 * Matching strategy (applied in order):
 *   1. Exact normalised match
 *   2. Substring containment (normalised)
 *   3. Raw-text scan — manual ref appears anywhere in the OCR text blob
 *   4. Fuzzy Levenshtein match (tolerates ≤ 2–3 char OCR noise)
 */

import { createHash } from "node:crypto";
import { logger } from "./logger.js";

/* ── Types ─────────────────────────────────────────────────────────────── */

export interface OcrResult {
  success:                  boolean;
  extracted_reference:      string | null;
  extracted_candidates:     string[];
  extracted_amount:         number | null;
  extracted_payment_method: string | null;
  extracted_date:           string | null;   // ISO 8601 string or null
  confidence:               number;          // 0–100
  raw_text:                 string;
  raw_text_match:           boolean;
  engine:                   "tesseract" | "ocrspace" | "none";
  error?:                   string;
}

export interface ImageHashResult {
  sha256:  string | null;
  buffer:  Buffer | null;
  error?:  string;
}

/* ── Payment provider patterns (Philippines) ───────────────────────────── */

const PAYMENT_METHOD_PATTERNS: Array<[RegExp, string]> = [
  [/\b(?:gcash|g-cash)\b/i,                        "GCash"],
  [/\b(?:maya|paymaya|pay[\s-]?maya)\b/i,           "Maya"],
  [/\b(?:grabpay|grab[\s-]?pay)\b/i,                "GrabPay"],
  [/\b(?:shopeepay|shopee[\s-]?pay)\b/i,            "ShopeePay"],
  [/\b(?:lazada[\s-]?wallet|lcash)\b/i,             "LazWallet"],
  [/\b(?:bdo|banco[\s-]?de[\s-]?oro)\b/i,           "BDO"],
  [/\b(?:bpi|bank[\s-]?of[\s-]?philippine)\b/i,     "BPI"],
  [/\b(?:unionbank|union[\s-]?bank)\b/i,            "UnionBank"],
  [/\b(?:security[\s-]?bank|securitybank)\b/i,      "SecurityBank"],
  [/\b(?:metrobank|metro[\s-]?bank)\b/i,            "Metrobank"],
  [/\b(?:landbank|land[\s-]?bank)\b/i,              "Landbank"],
  [/\b(?:pnb|philippine[\s-]?national[\s-]?bank)\b/i, "PNB"],
  [/\b(?:cimb)\b/i,                                 "CIMB"],
  [/\b(?:rcbc)\b/i,                                 "RCBC"],
  [/\b(?:eastwest|east[\s-]?west[\s-]?bank)\b/i,   "EastWest"],
  [/\b(?:psbank|philippine[\s-]?savings)\b/i,       "PSBank"],
  [/\b(?:palawan|palawan[\s-]?express)\b/i,         "Palawan Express"],
  [/\b(?:western[\s-]?union)\b/i,                   "Western Union"],
  [/\b(?:moneygram)\b/i,                            "MoneyGram"],
  [/\b(?:coins\.?ph|coinsph)\b/i,                   "Coins.ph"],
];

function extractPaymentMethod(text: string): string | null {
  for (const [pattern, name] of PAYMENT_METHOD_PATTERNS) {
    if (pattern.test(text)) return name;
  }
  return null;
}

/* ── Transaction date extraction ───────────────────────────────────────── */

const DATE_PATTERNS: RegExp[] = [
  // "Jan 15, 2025 10:30 PM" or "January 15, 2025"
  /\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)[.\s]+\d{1,2}[,\s]+\d{4}(?:\s+\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM)?)?\b/i,
  // "01/15/2025 10:30 AM" or "01-15-2025"
  /\b\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}(?:\s+\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM)?)?\b/,
  // ISO "2025-01-15" or "2025-01-15T10:30:00"
  /\b\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:?\d{2})?)?\b/,
  // "15 Jan 2025" (day-month-year)
  /\b\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4}\b/i,
];

function extractDate(text: string): string | null {
  for (const pattern of DATE_PATTERNS) {
    const m = text.match(pattern);
    if (!m) continue;
    try {
      const candidate = m[0];
      const d = new Date(candidate);
      if (!isNaN(d.getTime()) && d.getFullYear() >= 2020 && d.getFullYear() <= 2030) {
        return d.toISOString();
      }
    } catch {
      // skip unparseable match
    }
  }
  return null;
}

/* ── Reference extraction patterns (PH payment providers) ─────────────── */

const REF_PATTERNS: RegExp[] = [
  // 1. GCash / Maya exact 13-digit numeric
  /\b(\d{13})\b/g,
  // 2. Grouped digit blocks: 4-4-4 or 4-4-4-4 (dashes or spaces)
  /\b(\d{4}[-\s]\d{4}[-\s]\d{4}(?:[-\s]\d{4})?)\b/g,
  // 3. Known PH provider prefixes
  /\b((?:GCASH|MAYA|BDO|BPI|UB|SB|CIMB|RCBC|PAYMAYA)[-][A-Z0-9]{5,20})\b/gi,
  // 4. Labelled reference (colon or space after keyword)
  /(?:Ref(?:erence)?(?:\s*(?:No\.?|Number|#))?|Transaction\s*(?:No\.?|ID)|Receipt\s*(?:No\.?|#)|Order\s*(?:No\.?|ID)|Ref\.\s*No\.?|Confirmation\s*(?:No\.?|#|Code))\s*[:\s]\s*([A-Z0-9][A-Z0-9\-\.]{3,30})/gi,
  // 5. Any 8-24 char alphanumeric+dash token with at least 2 digits
  /\b([A-Z0-9][A-Z0-9\-]{7,23})\b(?!\s*:)/gi,
];

const AMT_PATTERN = /(?:₱|PHP|Php)\s*([0-9,]+(?:\.[0-9]{1,2})?)/i;

/* ── Normalisation ──────────────────────────────────────────────────────── */

/**
 * Normalise a reference for comparison:
 *  - upper-case
 *  - strip ALL non-alphanumeric characters
 *  - substitute common OCR misreads: O→0, l/I→1, S→5, B→8
 */
export function normaliseRef(ref: string | null | undefined): string {
  if (!ref) return "";
  return ref
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .replace(/O/g, "0")
    .replace(/[lI]/g, "1")
    .replace(/S/g, "5")
    .replace(/B/g, "8");
}

function normaliseForScan(text: string): string {
  return text.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/* ── Candidate extraction ───────────────────────────────────────────────── */

export function extractAllCandidates(text: string): string[] {
  const seen   = new Set<string>();
  const result: string[] = [];

  for (const pattern of REF_PATTERNS) {
    const re = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : pattern.flags + "g");
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const raw = (m[1] ?? m[0]).replace(/\s+/g, "").trim();
      if (raw.length < 6) continue;
      if (REF_PATTERNS.indexOf(pattern) === REF_PATTERNS.length - 1 && (raw.match(/\d/g) ?? []).length < 2) continue;
      const norm = normaliseRef(raw);
      if (!seen.has(norm)) {
        seen.add(norm);
        result.push(raw);
      }
    }
  }

  return result;
}

function extractAmount(text: string): number | null {
  const m = text.match(AMT_PATTERN);
  if (!m?.[1]) return null;
  const parsed = parseFloat(m[1].replace(/,/g, ""));
  return isNaN(parsed) ? null : parsed;
}

/* ── Levenshtein + fuzzy ────────────────────────────────────────────────── */

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const dp: number[] = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0]!;
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j]!;
      dp[j] = a[i - 1] === b[j - 1]
        ? prev
        : 1 + Math.min(prev, dp[j]!, dp[j - 1]!);
      prev = tmp;
    }
  }
  return dp[b.length]!;
}

function fuzzyMatch(a: string, b: string): boolean {
  if (!a || !b) return false;
  const maxLen  = Math.max(a.length, b.length);
  const allowed = maxLen >= 15 ? 3 : 2;
  return levenshtein(a, b) <= allowed;
}

/* ── Reference matching exports ─────────────────────────────────────────── */

export function rawTextContainsRef(rawText: string, manualRef: string): boolean {
  if (!rawText || !manualRef) return false;
  const haystack = normaliseForScan(rawText);
  const needle   = normaliseForScan(manualRef);
  if (needle.length < 6) return false;
  return haystack.includes(needle);
}

export function referencesMatch(manual: string, extracted: string): boolean {
  const a = normaliseRef(manual);
  const b = normaliseRef(extracted);
  if (!a || !b) return false;
  if (a === b)                         return true;
  if (a.includes(b) || b.includes(a)) return true;
  return fuzzyMatch(a, b);
}

export function anyCandidateMatches(manual: string, candidates: string[]): boolean {
  return candidates.some((c) => referencesMatch(manual, c));
}

/* ── SHA-256 image hash + buffer download ──────────────────────────────── */

export async function hashImage(url: string): Promise<ImageHashResult> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(12_000) });
    if (!res.ok) return { sha256: null, buffer: null, error: `HTTP ${res.status}` };
    const arrayBuf = await res.arrayBuffer();
    const buf      = Buffer.from(arrayBuf);
    const hash     = createHash("sha256").update(buf).digest("hex");
    return { sha256: hash, buffer: buf };
  } catch (err) {
    logger.warn({ err }, "[ocr] image hash fetch failed");
    return { sha256: null, buffer: null, error: String(err) };
  }
}

/* ── Cloudinary quality boost ───────────────────────────────────────────── */

function bestQualityUrl(url: string): string {
  try {
    const u = new URL(url);
    if (!u.hostname.endsWith("cloudinary.com")) return url;
    return url.replace(/\/upload\/(?!q_)/, "/upload/q_100,fl_lossless,c_limit,w_2048/");
  } catch {
    return url;
  }
}

/* ── Tesseract.js — local WASM OCR (primary engine) ────────────────────── */

type TesseractWorker = {
  recognize: (image: Buffer | string) => Promise<{ data: { text: string; confidence: number } }>;
  terminate: () => Promise<void>;
};

let _tesseractWorkerPromise: Promise<TesseractWorker> | null = null;

async function getSharedTesseractWorker(): Promise<TesseractWorker> {
  if (!_tesseractWorkerPromise) {
    _tesseractWorkerPromise = (async () => {
      // Dynamic import — tesseract.js is marked external in esbuild so it
      // resolves from node_modules at runtime, avoiding WASM path issues.
      const { createWorker } = await import("tesseract.js") as {
        createWorker: (lang: string, oem?: number, options?: Record<string, unknown>) => Promise<TesseractWorker>;
      };
      const worker = await createWorker("eng", 1, {
        logger:      () => {},   // suppress verbose progress logging
        cachePath:   "/tmp/tesseract-cache",
        cacheMethod: "write",
      });
      logger.info("[ocr/tesseract] worker ready");
      return worker;
    })().catch((err) => {
      _tesseractWorkerPromise = null; // allow retry on next call
      throw err;
    });
  }
  return _tesseractWorkerPromise;
}

/**
 * Pre-warm the Tesseract worker at server startup (non-blocking).
 * This downloads and caches the English language data in the background so
 * the first receipt verification request doesn't pay the cold-start penalty.
 */
export function prewarmTesseract(): void {
  setTimeout(() => {
    getSharedTesseractWorker()
      .then(() => logger.info("[ocr/tesseract] pre-warm complete"))
      .catch((err) => logger.warn({ err }, "[ocr/tesseract] pre-warm failed (non-fatal)"));
  }, 2_000);
}

async function runTesseractOcr(
  buffer: Buffer,
): Promise<{ text: string; confidence: number; ok: boolean; error?: string }> {
  try {
    const worker = await getSharedTesseractWorker();

    // 45-second timeout — Tesseract can be slow on large/complex images
    const result = await Promise.race([
      worker.recognize(buffer),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("TESSERACT_TIMEOUT")), 45_000),
      ),
    ]);

    const text       = result.data.text.trim();
    const confidence = Math.round(result.data.confidence);

    logger.info({
      textLength:  text.length,
      textSample:  text.slice(0, 300),
      confidence,
    }, "[ocr/tesseract] recognition complete");

    return { text, confidence, ok: true };
  } catch (err) {
    logger.warn({ err }, "[ocr/tesseract] recognition failed");
    return { text: "", confidence: 0, ok: false, error: String(err) };
  }
}

/* ── OCRSpace — cloud API (secondary engine) ────────────────────────────── */

const OCR_API_URL = "https://api.ocr.space/parse/imageurl";

async function callOcrSpace(
  imageUrl: string,
  engine: "1" | "2",
): Promise<{ text: string; ok: boolean; error?: string }> {
  const apiKey = process.env["OCR_SPACE_API_KEY"]!;
  const form   = new URLSearchParams();
  form.set("apikey",            apiKey);
  form.set("url",               imageUrl);
  form.set("language",          "eng");
  form.set("isOverlayRequired", "false");
  form.set("detectOrientation", "true");
  form.set("scale",             "true");
  form.set("OCREngine",         engine);
  form.set("filetype",          "auto");
  form.set("isTable",           "false");

  const res = await fetch(OCR_API_URL, {
    method:  "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body:    form.toString(),
    signal:  AbortSignal.timeout(25_000),
  });

  if (!res.ok) return { text: "", ok: false, error: `HTTP_${res.status}` };

  const json = await res.json() as {
    OCRExitCode:           number;
    IsErroredOnProcessing: boolean;
    ParsedResults?: Array<{ ParsedText: string; ErrorMessage?: string }>;
  };

  if (json.IsErroredOnProcessing || json.OCRExitCode !== 1) {
    return { text: "", ok: false, error: json.ParsedResults?.[0]?.ErrorMessage ?? "OCR_API_ERROR" };
  }

  const text = (json.ParsedResults ?? []).map((r) => r.ParsedText ?? "").join("\n").trim();
  return { text, ok: true };
}

async function runOcrSpace(
  imageUrl: string,
): Promise<{ text: string; confidence: number; ok: boolean; error?: string }> {
  const ocrUrl  = bestQualityUrl(imageUrl);

  let attempt = await callOcrSpace(ocrUrl, "2");
  if (!attempt.ok || !attempt.text) {
    logger.warn({ engine: 2, err: attempt.error }, "[ocr/ocrspace] Engine 2 failed — retrying with Engine 1");
    attempt = await callOcrSpace(ocrUrl, "1");
  }

  if (!attempt.ok) {
    return { text: "", confidence: 0, ok: false, error: attempt.error };
  }

  // OCRSpace doesn't report per-page confidence; estimate from text length
  const confidence = attempt.text.length > 50 ? 75 : attempt.text.length > 10 ? 50 : 30;
  return { text: attempt.text, confidence, ok: true };
}

/* ── Main export: runOcr ────────────────────────────────────────────────── */

/**
 * Run OCR on a receipt image.
 *
 * @param imageUrl  Original image URL (used for OCRSpace and logging)
 * @param buffer    Pre-downloaded image buffer from hashImage(). Passed to
 *                  Tesseract.js to avoid a second HTTP download. If null,
 *                  Tesseract will be skipped and OCRSpace used instead.
 */
export async function runOcr(imageUrl: string, buffer?: Buffer | null): Promise<OcrResult> {
  let rawText    = "";
  let confidence = 0;
  let engine:    OcrResult["engine"] = "none";
  let ocrError: string | undefined;

  /* ── 1. Try Tesseract.js (primary, always available) ─────────────────── */
  if (buffer) {
    const tesseract = await runTesseractOcr(buffer);
    if (tesseract.ok && tesseract.text) {
      rawText    = tesseract.text;
      confidence = tesseract.confidence;
      engine     = "tesseract";
    } else if (!tesseract.ok) {
      ocrError = tesseract.error;
      logger.warn({ err: ocrError }, "[ocr] Tesseract failed — trying OCRSpace");
    }
    // If Tesseract ok but empty text, fall through to OCRSpace
  } else {
    logger.warn("[ocr] no buffer available — skipping Tesseract, using OCRSpace");
  }

  /* ── 2. OCRSpace fallback (only if Tesseract empty/failed & key set) ─── */
  const ocrSpaceKey = process.env["OCR_SPACE_API_KEY"];
  if (!rawText && ocrSpaceKey) {
    try {
      const ocrSpace = await runOcrSpace(imageUrl);
      if (ocrSpace.ok && ocrSpace.text) {
        rawText    = ocrSpace.text;
        confidence = ocrSpace.confidence;
        engine     = "ocrspace";
        ocrError   = undefined; // clear Tesseract error — OCRSpace succeeded
      } else if (!ocrSpace.ok) {
        ocrError = ocrError
          ? `${ocrError}; OCRSpace: ${ocrSpace.error}`
          : `OCRSpace: ${ocrSpace.error}`;
      }
    } catch (err) {
      logger.warn({ err }, "[ocr] OCRSpace call threw unexpectedly");
    }
  }

  /* ── 3. Both engines unavailable or both returned empty ─────────────── */
  const neitherConfigured = !buffer && !ocrSpaceKey;
  if (neitherConfigured) {
    logger.warn("[ocr] no OCR engine available (no buffer, no OCR_SPACE_API_KEY)");
    return {
      success:                  false,
      extracted_reference:      null,
      extracted_candidates:     [],
      extracted_amount:         null,
      extracted_payment_method: null,
      extracted_date:           null,
      confidence:               0,
      raw_text:                 "",
      raw_text_match:           false,
      engine:                   "none",
      error:                    "OCR_NOT_CONFIGURED",
    };
  }

  if (!rawText) {
    // Engines ran but returned nothing — image is unreadable
    return {
      success:                  true,
      extracted_reference:      null,
      extracted_candidates:     [],
      extracted_amount:         null,
      extracted_payment_method: null,
      extracted_date:           null,
      confidence:               0,
      raw_text:                 "",
      raw_text_match:           false,
      engine,
      error:                    ocrError ?? "EMPTY_TEXT",
    };
  }

  /* ── 4. Extract structured fields from text ──────────────────────────── */
  const candidates             = extractAllCandidates(rawText);
  const extractedReference     = candidates[0] ?? null;
  const extractedAmount        = extractAmount(rawText);
  const extractedPaymentMethod = extractPaymentMethod(rawText);
  const extractedDate          = extractDate(rawText);

  // Confidence: high when structured ref found, medium when text exists
  const finalConfidence = extractedReference
    ? Math.max(confidence, 80)
    : candidates.length > 0
    ? Math.max(confidence, 50)
    : Math.min(confidence, 40);

  logger.info({
    engine,
    extractedReference,
    candidateCount:       candidates.length,
    candidates:           candidates.slice(0, 8),
    extractedAmount,
    extractedPaymentMethod,
    extractedDate,
    confidence:           finalConfidence,
    rawTextLength:        rawText.length,
    rawTextSample:        rawText.slice(0, 300),
  }, "[ocr] extraction complete");

  return {
    success:                  true,
    extracted_reference:      extractedReference,
    extracted_candidates:     candidates,
    extracted_amount:         extractedAmount,
    extracted_payment_method: extractedPaymentMethod,
    extracted_date:           extractedDate,
    confidence:               finalConfidence,
    raw_text:                 rawText.slice(0, 6_000),
    raw_text_match:           false,
    engine,
  };
}
