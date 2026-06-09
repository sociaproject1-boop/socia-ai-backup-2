/**
 * Fraud Detection Engine — scores a receipt verification request against
 * multiple independent signals and returns a composite fraud score.
 *
 * Score thresholds (updated per v2 spec):
 *   <  50  → allow   (normal submission)
 *   50–99  → review  (flagged for manual review, submission accepted)
 *   ≥ 100  → block   (submission rejected, fraud suspected)
 *
 * Signal weights (v2):
 *   duplicate_image_hash          +100 critical — same receipt reused cross-user
 *   duplicate_image_hash_own       +30 medium   — own receipt reused
 *   duplicate_extracted_reference +100 critical — same extracted ref used before
 *   cross_user_reference           +70 critical — ref belongs to different account
 *   reference_in_other_refund      +40 high     — ref already in another request
 *   ocr_mismatch                   +50 high     — manual ref ≠ OCR extracted ref
 *   blur_score                     +30 medium   — image too blurry (score ≥ 60)
 *   suspicious_ocr_text            +20 low      — fake/test receipt keywords
 *   tampering                      +80 high     — editing software / recompression
 *   velocity_abuse                 +30 medium   — ≥2 refund requests in 30 days
 */


import { referencesMatch, normaliseRef } from "./ocrService.js";
import { logger } from "./logger.js";

export type FraudSeverity = "low" | "medium" | "high" | "critical";
export type FraudAction   = "allow" | "review" | "block";

export interface FraudFlag {
  type:      string;
  severity:  FraudSeverity;
  points:    number;
  detail:    string;
  metadata?: Record<string, unknown>;
}

export interface FraudResult {
  score:   number;
  flags:   FraudFlag[];
  action:  FraudAction;
  blocked: boolean;
}

export interface FraudCheckInput {
  userId:              string;
  imageHash:           string | null;
  manualReference:     string;
  extractedReference:  string | null;
  extractedCandidates: string[];
  ocrSuccess:          boolean;
  ocrRawText:          string;
  extractedAmount:     number | null;
  blurScore:           number;    // 0–100 from computeBlurScore()
  tamperScore:         number;    // 0–100 from analyzeImageTampering()
  structureScore:      number;    // 0–100 from analyzeReceiptStructure()
  orderId?:            string;
}

const BLOCK_THRESHOLD  = 100;
const REVIEW_THRESHOLD = 50;

function action(score: number): FraudAction {
  if (score >= BLOCK_THRESHOLD)  return "block";
  if (score >= REVIEW_THRESHOLD) return "review";
  return "allow";
}

/**
 * Run all fraud checks in parallel and return a composite FraudResult.
 *
 * @param userClient    — Supabase client scoped to the authenticated user (RLS enforced)
 * @param serviceClient — Supabase service-role client for cross-user checks (may be null)
 * @param input         — data gathered during receipt processing
 */
export async function runFraudChecks(
  userClient:    any,
  serviceClient: any,
  input:         FraudCheckInput,
): Promise<FraudResult> {
  const flags: FraudFlag[] = [];
  const checks = await Promise.allSettled([
    checkDuplicateHash(userClient, serviceClient, input),
    checkDuplicateExtractedReference(userClient, serviceClient, input),
    checkReferenceInOtherRefund(userClient, serviceClient, input),
    checkCrossUserReference(serviceClient, input),
    checkOcrMismatch(input),
    checkBlurScore(input),
    checkSuspiciousOcrText(input),
    checkTampering(input),
    checkFakeStructure(input),
    checkVelocity(userClient, input),
  ]);

  for (const result of checks) {
    if (result.status === "fulfilled" && result.value) {
      flags.push(result.value);
    } else if (result.status === "rejected") {
      logger.warn({ err: result.reason }, "[fraud] check threw unexpectedly");
    }
  }

  const score = flags.reduce((sum, f) => sum + f.points, 0);
  return { score, flags, action: action(score), blocked: score >= BLOCK_THRESHOLD };
}

/* ── Individual checks ────────────────────────────────────────────────── */

async function checkDuplicateHash(
  userClient:    any,
  serviceClient: any,
  { userId, imageHash }: FraudCheckInput,
): Promise<FraudFlag | null> {
  if (!imageHash) return null;

  const client = serviceClient ?? userClient;

  const { data: crossUser } = await client
    .from("payment_receipts")
    .select("id, user_id")
    .eq("image_hash", imageHash)
    .neq("user_id", userId)
    .limit(1)
    .maybeSingle();

  if (crossUser) {
    return {
      type:     "duplicate_image_hash",
      severity: "critical",
      points:   100,
      detail:   "This receipt image has already been used in another user's refund request.",
      metadata: { image_hash: imageHash, other_user_id: (crossUser as { user_id: string }).user_id },
    };
  }

  const { data: ownData } = await userClient
    .from("payment_receipts")
    .select("id")
    .eq("image_hash", imageHash)
    .limit(1)
    .maybeSingle();

  if (ownData) {
    return {
      type:     "duplicate_image_hash_own",
      severity: "medium",
      points:   30,
      detail:   "Identical receipt image was previously submitted by this account.",
      metadata: { image_hash: imageHash },
    };
  }

  return null;
}

/**
 * Check whether the OCR-extracted reference number already exists in
 * another user's payment receipt. Prevents submitting a different image
 * of the exact same underlying transaction.
 */
async function checkDuplicateExtractedReference(
  userClient:    any,
  serviceClient: any,
  { userId, extractedReference }: FraudCheckInput,
): Promise<FraudFlag | null> {
  if (!extractedReference) return null;

  const client = serviceClient ?? userClient;
  const normRef = normaliseRef(extractedReference);

  const { data } = await client
    .from("payment_receipts")
    .select("id, user_id, extracted_reference")
    .neq("user_id", userId)
    .not("extracted_reference", "is", null)
    .limit(20); // fetch recent batch and compare locally (normalised)

  if (!data) return null;

  const duplicate = (data as Array<{ id: string; user_id: string; extracted_reference: string | null }>)
    .find((row) => row.extracted_reference && normaliseRef(row.extracted_reference) === normRef);

  if (!duplicate) return null;

  return {
    type:     "duplicate_extracted_reference",
    severity: "critical",
    points:   100,
    detail:   `The reference number extracted from this receipt (${extractedReference}) has already been used in another submission.`,
    metadata: { extracted_reference: extractedReference, existing_receipt_id: duplicate.id },
  };
}

async function checkReferenceInOtherRefund(
  userClient:    any,
  serviceClient: any,
  { userId, manualReference }: FraudCheckInput,
): Promise<FraudFlag | null> {
  if (!manualReference) return null;

  const client = serviceClient ?? userClient;
  const ref    = manualReference.trim();

  const { data } = await client
    .from("refund_requests")
    .select("id, user_id, status")
    .eq("payment_reference", ref)
    .neq("user_id", userId)
    .limit(1)
    .maybeSingle();

  if (!data) return null;

  return {
    type:     "reference_in_other_refund",
    severity: "high",
    points:   40,
    detail:   "This payment reference number was used in another user's refund request.",
    metadata: { reference: ref },
  };
}

async function checkCrossUserReference(
  serviceClient: any,
  { userId, manualReference }: FraudCheckInput,
): Promise<FraudFlag | null> {
  if (!serviceClient || !manualReference) return null;

  const ref = manualReference.trim();

  const { data } = await serviceClient
    .from("payment_orders")
    .select("id, user_id")
    .eq("reference_no", ref)
    .neq("user_id", userId)
    .limit(1)
    .maybeSingle();

  if (!data) return null;

  return {
    type:     "cross_user_reference",
    severity: "critical",
    points:   70,
    detail:   "The payment reference number belongs to a different account.",
    metadata: { reference: ref },
  };
}

function checkOcrMismatch(
  { manualReference, extractedReference, ocrSuccess }: FraudCheckInput,
): FraudFlag | null {
  if (!ocrSuccess || !extractedReference) return null;

  if (referencesMatch(manualReference, extractedReference)) return null;

  return {
    type:     "ocr_mismatch",
    severity: "high",
    points:   50,
    detail:   `OCR detected reference "${extractedReference}" does not match the manually entered reference "${manualReference}".`,
    metadata: { manual: manualReference, ocr: extractedReference },
  };
}

/**
 * Flag if the image is too blurry to read reliably.
 * blur_score is computed externally (computeBlurScore from receiptHeuristics).
 */
function checkBlurScore({ blurScore }: FraudCheckInput): FraudFlag | null {
  if (blurScore < 60) return null;

  return {
    type:     "blurry_image",
    severity: "medium",
    points:   30,
    detail:   `Image quality is low (blur score: ${blurScore}/100). Receipt may be too blurry to verify accurately.`,
    metadata: { blur_score: blurScore },
  };
}

/**
 * Flag suspicious OCR text patterns: test/sample/voided receipt keywords,
 * single-line outputs, repeating patterns.
 * suspicious_text result is computed inline to avoid a circular import.
 */
function checkSuspiciousOcrText(
  { ocrRawText }: FraudCheckInput,
): FraudFlag | null {
  if (!ocrRawText || ocrRawText.length < 5) return null;

  const lower = ocrRawText.toLowerCase();
  const SUSPICIOUS_KW = [
    "sample", "demo", "test receipt", "example", "void", "voided",
    "cancelled transaction", "invalid", "fake", "trial", "dummy",
    "for display only", "not a receipt", "specimen",
  ];

  const found = SUSPICIOUS_KW.filter((kw) => lower.includes(kw));
  if (found.length === 0) return null;

  return {
    type:     "suspicious_ocr_text",
    severity: "low",
    points:   20,
    detail:   `Suspicious keyword(s) detected in receipt text: ${found.slice(0, 3).join(", ")}.`,
    metadata: { keywords: found },
  };
}

/**
 * Flag image tampering detected by binary analysis.
 * tamper_score is computed externally (analyzeImageTampering).
 */
function checkTampering({ tamperScore }: FraudCheckInput): FraudFlag | null {
  if (tamperScore < 60) return null;

  return {
    type:     "image_tampering",
    severity: "high",
    points:   80,
    detail:   `Image tampering signals detected (score: ${tamperScore}/100). The receipt image may have been edited.`,
    metadata: { tamper_score: tamperScore },
  };
}

/**
 * Flag fake / minimalist receipt layouts detected by structural text analysis.
 * structureScore is computed externally (analyzeReceiptStructure).
 *
 * Thresholds:
 *   ≥ 55 → fake_structure flag (+40 points)
 *   40–54 → low-confidence structure flag (+20 points)
 */
function checkFakeStructure({ structureScore }: FraudCheckInput): FraudFlag | null {
  if (structureScore < 40) return null;

  if (structureScore >= 55) {
    return {
      type:     "fake_structure",
      severity: "high",
      points:   40,
      detail:   `Receipt layout analysis raised concerns (score: ${structureScore}/100). ` +
                "The receipt may be fabricated, heavily cropped, or missing key payment fields.",
      metadata: { structure_score: structureScore },
    };
  }

  return {
    type:     "suspicious_structure",
    severity: "medium",
    points:   20,
    detail:   `Receipt layout has fewer fields than expected (score: ${structureScore}/100).`,
    metadata: { structure_score: structureScore },
  };
}

async function checkVelocity(
  userClient: any,
  { userId }: FraudCheckInput,
): Promise<FraudFlag | null> {
  const since30d = new Date(Date.now() - 30 * 86_400_000).toISOString();

  const { data } = await userClient
    .from("refund_requests")
    .select("id")
    .eq("user_id", userId)
    .gte("created_at", since30d);

  const count = (data ?? []).length;
  if (count < 2) return null;

  return {
    type:     "velocity_abuse",
    severity: count >= 4 ? "high" : "medium",
    points:   30,
    detail:   `${count} refund-related requests submitted in the last 30 days.`,
    metadata: { request_count: count },
  };
}
