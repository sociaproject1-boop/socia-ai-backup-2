/**
 * Receipt verification route.
 *
 * POST /api/receipts/verify
 *   — Accepts a Cloudinary image URL + manually-entered payment reference.
 *   — Downloads the image ONCE (hashImage) then runs OCR + tamper analysis
 *     in parallel using the cached buffer — no extra HTTP requests.
 *   — OCR engine priority: Tesseract.js (local, free, always on) → OCRSpace
 *     (cloud, optional, only used when OCR_SPACE_API_KEY is set and Tesseract
 *     returned empty text).
 *   — Stores a payment_receipts row with full fraud metadata.
 *   — Returns verification result + block_code for clear user-facing messages.
 *
 * Verification decision tree:
 *   OCR unavailable (no buffer + no key)  → pending  (manual review)
 *   OCR failed / returned empty text      → suspicious (manual review, NOT blocked)
 *   Structured ref found, match           → verified
 *   Structured ref found, mismatch        → mismatch → BLOCKED
 *   No structured ref, raw-text contains  → verified (raw_text_match)
 *   No structured ref, candidate fuzzy    → verified (candidate_match)
 *   No match found                        → suspicious (manual review)
 *   Duplicate image hash                  → BLOCKED (duplicate_receipt)
 *   Duplicate extracted reference         → BLOCKED (duplicate_reference)
 *   Tamper score ≥ 60                     → BLOCKED (tampered_receipt)
 *   Fraud score ≥ 100 (combined signals)  → BLOCKED (invalid_receipt)
 *
 * NOTE: Blurry / unreadable images are NOT auto-blocked. They go to
 * suspicious status for admin manual review per fraud prevention spec.
 */

import { Router } from "express";
import { requireAuth, getAuthedUser, getRequestSupabase } from "../lib/supabaseAuth.js";
import { getServiceClient }    from "../lib/adminAuth.js";
import {
  hashImage,
  runOcr,
  referencesMatch,
  anyCandidateMatches,
  rawTextContainsRef,
  normaliseRef,
} from "../lib/ocrService.js";
import { runFraudChecks }          from "../lib/fraudDetection.js";
import { analyzeImageTampering }   from "../lib/imageTamperDetection.js";
import { broadcastFraudEvent }     from "../lib/adminSocket.js";
import { computeBlurScore, analyzeSuspiciousText, analyzeReceiptStructure } from "../lib/receiptHeuristics.js";

const router = Router();

/* ── POST /api/receipts/verify ────────────────────────────────────────── */
router.post("/receipts/verify", requireAuth, async (req, res): Promise<void> => {
  const supabase      = getRequestSupabase(req);
  const serviceClient = getServiceClient();
  const user          = getAuthedUser(req);

  const { image_url, manual_reference, order_id } = req.body ?? {};

  /* ── Input validation ──────────────────────────────────────────────── */
  if (!image_url || typeof image_url !== "string" || !image_url.startsWith("http")) {
    res.status(400).json({ code: "INVALID_IMAGE_URL", message: "A valid image URL is required." });
    return;
  }

  const manualRef = typeof manual_reference === "string" ? manual_reference.trim() : "";
  if (!manualRef || manualRef.length < 5) {
    res.status(400).json({ code: "REFERENCE_REQUIRED", message: "Payment reference number is required (min 5 characters)." });
    return;
  }

  /* ── 1. Download image once (hash + buffer for all downstream steps) ── */
  // One HTTP request for the entire pipeline — buffer reused by Tesseract,
  // tamper analysis, and SHA-256 deduplication.
  const hashResult = await hashImage(image_url);
  const imageHash  = hashResult.sha256;

  /* ── 2. OCR + tamper analysis in parallel (share the cached buffer) ── */
  const [ocr, tamper] = await Promise.all([
    runOcr(image_url, hashResult.buffer),
    analyzeImageTampering(image_url, hashResult.buffer),
  ]);

  const blurScore      = computeBlurScore(ocr);
  const suspiciousText = analyzeSuspiciousText(ocr.raw_text, ocr.extracted_amount);
  const structureResult = analyzeReceiptStructure(
    ocr.raw_text,
    ocr.extracted_candidates,
    ocr.extracted_amount,
    ocr.extracted_date,
    ocr.extracted_payment_method,
  );

  req.log.info({
    ocrEngine:      ocr.engine,
    ocrSuccess:     ocr.success,
    ocrError:       ocr.error,
    rawTextLength:  ocr.raw_text.length,
    rawTextSample:  ocr.raw_text.slice(0, 400),
    candidateCount: ocr.extracted_candidates.length,
    candidates:     ocr.extracted_candidates.slice(0, 10),
    extractedRef:   ocr.extracted_reference,
    paymentMethod:  ocr.extracted_payment_method,
    extractedDate:  ocr.extracted_date,
    manualRef,
    normalisedManual: normaliseRef(manualRef),
    blurScore,
    tamperScore:    tamper.tamper_score,
    tamperDetected: tamper.tamper_detected,
  }, "[receipt] analysis complete");

  /* ── 3. Reference validation ───────────────────────────────────────── */
  type VerifStatus = "pending" | "verified" | "suspicious" | "blocked";
  type RefCode     = "verified" | "mismatch" | "undetected" | "skipped" | "raw_text_match" | "candidate_match";

  let verificationStatus:      VerifStatus = "pending";
  let referenceValidationCode: RefCode     = "skipped";
  let matchDetail                          = "";

  // No OCR available at all (no buffer downloaded and no OCRSpace key)
  const ocrUnavailable = ocr.engine === "none" && ocr.error === "OCR_NOT_CONFIGURED";

  if (ocrUnavailable) {
    // Falls to manual review — admin will verify the reference manually
    verificationStatus      = "pending";
    referenceValidationCode = "skipped";

  } else if (!ocr.success || !ocr.raw_text) {
    // OCR ran (at least one engine attempted) but returned nothing.
    // Could be: blurry image, corrupt file, Tesseract timeout, OCRSpace error.
    // Per spec: DO NOT auto-reject. Flag for manual review.
    verificationStatus      = "suspicious";
    referenceValidationCode = "undetected";
    matchDetail             = `OCR returned empty (engine: ${ocr.engine}, error: ${ocr.error ?? "none"})`;

  } else if (ocr.extracted_reference && referencesMatch(manualRef, ocr.extracted_reference)) {
    verificationStatus      = "verified";
    referenceValidationCode = "verified";
    matchDetail             = `structured ref "${ocr.extracted_reference}" matched "${manualRef}"`;

  } else if (ocr.extracted_reference && !referencesMatch(manualRef, ocr.extracted_reference)) {
    // Structured ref found but doesn't match — try broader methods before blocking
    if (anyCandidateMatches(manualRef, ocr.extracted_candidates)) {
      verificationStatus      = "verified";
      referenceValidationCode = "candidate_match";
      matchDetail             = `candidate match among ${ocr.extracted_candidates.length} candidates`;
    } else if (rawTextContainsRef(ocr.raw_text, manualRef)) {
      verificationStatus      = "verified";
      referenceValidationCode = "raw_text_match";
      matchDetail             = "manual ref found verbatim in OCR text";
    } else {
      // Definitive mismatch: OCR found a reference but it's different from the user's entry
      verificationStatus      = "blocked";
      referenceValidationCode = "mismatch";
      matchDetail             = `OCR extracted "${ocr.extracted_reference}" vs manual "${manualRef}"`;
    }

  } else {
    // No structured reference extracted — try broader matches
    if (anyCandidateMatches(manualRef, ocr.extracted_candidates)) {
      verificationStatus      = "verified";
      referenceValidationCode = "candidate_match";
      matchDetail             = `matched among ${ocr.extracted_candidates.length} broad candidates`;
    } else if (rawTextContainsRef(ocr.raw_text, manualRef)) {
      verificationStatus      = "verified";
      referenceValidationCode = "raw_text_match";
      matchDetail             = "manual ref found verbatim in OCR text";
    } else {
      // No match found anywhere — accept but flag for review
      verificationStatus      = "suspicious";
      referenceValidationCode = "undetected";
      matchDetail             = `no ref match found; ${ocr.extracted_candidates.length} candidates checked`;
    }
  }

  req.log.info({
    manualRef,
    verificationStatus,
    referenceValidationCode,
    matchDetail,
  }, "[receipt] reference validation decision");

  /* ── 4. Fraud checks ───────────────────────────────────────────────── */
  const fraud = await runFraudChecks(supabase, serviceClient, {
    userId:              user.id,
    imageHash,
    manualReference:     manualRef,
    extractedReference:  ocr.extracted_reference,
    extractedCandidates: ocr.extracted_candidates,
    ocrSuccess:          ocr.success,
    ocrRawText:          ocr.raw_text,
    extractedAmount:     ocr.extracted_amount,
    blurScore,
    tamperScore:         tamper.tamper_score,
    structureScore:      structureResult.structure_score,
    orderId:             typeof order_id === "string" ? order_id : undefined,
  });

  /* ── 4b. Block code determination ─────────────────────────────────── */
  // Hard-block only on signals that are definitively fraudulent.
  // Blurry / unreadable images are NOT hard-blocked — they go to manual review.
  type BlockCode =
    | "mismatch"
    | "duplicate_receipt"
    | "duplicate_reference"
    | "tampered_receipt"
    | "invalid_receipt";

  const hasDuplicateReceipt = fraud.flags.some(
    (f) => f.type === "duplicate_image_hash" || f.type === "duplicate_image_hash_own",
  );
  const hasDuplicateRef = fraud.flags.some(
    (f) =>
      f.type === "duplicate_extracted_reference" ||
      f.type === "reference_in_other_refund"     ||
      f.type === "cross_user_reference",
  );
  const hasTampering = tamper.tamper_detected;

  let blockCode: BlockCode | null = null;

  if (referenceValidationCode === "mismatch") {
    // Already set verificationStatus = "blocked" above
    blockCode = "mismatch";
  } else if (hasDuplicateRef) {
    verificationStatus = "blocked";
    blockCode          = "duplicate_reference";
  } else if (hasDuplicateReceipt) {
    verificationStatus = "blocked";
    blockCode          = "duplicate_receipt";
  } else if (hasTampering) {
    verificationStatus = "blocked";
    blockCode          = "tampered_receipt";
  } else if (fraud.blocked) {
    // Fraud score ≥ 100 from combined signals (blur + suspicious text + velocity…)
    verificationStatus = "blocked";
    blockCode          = "invalid_receipt";
  } else if (fraud.action === "review" && verificationStatus === "pending") {
    verificationStatus = "suspicious";
  }

  /* ── Block reason messages ─────────────────────────────────────────── */
  const BLOCK_MESSAGES: Record<BlockCode, string> = {
    mismatch:
      "The reference number on your receipt doesn't match what you entered. " +
      "Please double-check the exact reference number on your GCash/Maya/bank screenshot.",
    duplicate_receipt:
      "This receipt image has already been used in a previous refund request. " +
      "Please upload a different payment screenshot.",
    duplicate_reference:
      "This payment reference number is already linked to another account or refund request. " +
      "Contact support if you believe this is an error.",
    tampered_receipt:
      "Your receipt image appears to have been modified or edited. " +
      "Please upload an unaltered screenshot directly from your GCash/Maya/bank app.",
    invalid_receipt:
      "Your receipt could not be verified. Please upload a clear screenshot where the payment reference number is visible, or contact support.",
  };

  /* ── 5. Compute composite AI detection score (0–100) ───────────────── */
  const aiDetectionScore = Math.min(
    100,
    Math.round(
      blurScore              * 0.25 +
      tamper.tamper_score    * 0.35 +
      suspiciousText.score   * 0.20 +
      Math.min(fraud.score, 100) * 0.20,
    ),
  );

  const fraudReasons = [
    ...fraud.flags.map((f) => ({ type: f.type, detail: f.detail, points: f.points })),
    ...tamper.reasons.map((r) => ({ type: "tamper_analysis", detail: r, points: 0 })),
    ...suspiciousText.reasons.map((r) => ({ type: "heuristic", detail: r, points: 0 })),
    ...structureResult.reasons.map((r) => ({ type: "structure_analysis", detail: r, points: 0 })),
  ];

  /* ── 6. Store payment_receipts row (v3 = v2 + payment method/date) ── */
  const blocked     = verificationStatus === "blocked";
  const blockReason = blockCode ? BLOCK_MESSAGES[blockCode] : undefined;

  // Attempt 1: full insert with v2 + v3 columns (migrations 22 + 23 applied)
  const { data: receiptRow, error: receiptErr } = await supabase
    .from("payment_receipts")
    .insert({
      user_id:                  user.id,
      image_url,
      image_hash:               imageHash,
      extracted_reference:      ocr.extracted_reference,
      extracted_amount:         ocr.extracted_amount,
      ocr_confidence:           ocr.confidence,
      ocr_raw_text:             ocr.raw_text || null,
      fraud_score:              fraud.score,
      verification_status:      verificationStatus,
      block_code:               blockCode,
      // v2 columns (migration 22)
      blur_score:               blurScore,
      tamper_detected:          tamper.tamper_detected,
      tamper_score:             tamper.tamper_score,
      tamper_software:          tamper.software ?? null,
      heuristic_score:          suspiciousText.score,
      manual_review_required:   fraud.action === "review" || fraud.action === "block",
      ai_detection_score:       aiDetectionScore,
      fraud_reasons:            fraudReasons,
      // v3 columns (migration 23)
      extracted_payment_method: ocr.extracted_payment_method,
      extracted_date:           ocr.extracted_date,
      ocr_engine:               ocr.engine,
      // v4 columns (migration 24)
      structure_score:          structureResult.structure_score,
      receipt_field_count:      structureResult.field_count,
      // v5 column (migration 26)
      manual_reference:         manualRef || null,
    })
    .select("id")
    .single();

  if (receiptErr) {
    req.log.warn({ err: receiptErr }, "payment_receipts v3 insert failed — retrying base insert");

    // Attempt 2: base columns only (migrations 22/23 not yet applied)
    const { data: fallbackRow, error: fallbackErr } = await supabase
      .from("payment_receipts")
      .insert({
        user_id:             user.id,
        image_url,
        image_hash:          imageHash,
        extracted_reference: ocr.extracted_reference,
        extracted_amount:    ocr.extracted_amount,
        ocr_confidence:      ocr.confidence,
        ocr_raw_text:        ocr.raw_text || null,
        fraud_score:         fraud.score,
        verification_status: verificationStatus,
        block_code:          blockCode,
      })
      .select("id")
      .single();

    if (fallbackErr) {
      req.log.error({ err: fallbackErr }, "payment_receipts insert failed (all attempts)");
      res.status(500).json({ code: "RECEIPT_STORE_ERROR", message: "Could not store receipt. Please try again." });
      return;
    }

    const receiptId = (fallbackRow as { id: string }).id;
    req.log.info({ receiptId }, "receipt stored (base columns — migrations 22/23 pending)");
    await storeFraudFlags(supabase, user.id, fraud.flags);
    return sendResponse(res, receiptId, verificationStatus, referenceValidationCode,
      matchDetail, ocr, fraud, tamper, blurScore, suspiciousText.score, aiDetectionScore,
      blocked, blockCode, blockReason, manualRef, structureResult);
  }

  const receiptId = (receiptRow as { id: string }).id;

  /* ── 7. Store fraud_flags ──────────────────────────────────────────── */
  await storeFraudFlags(supabase, user.id, fraud.flags);

  req.log.info({
    userId: user.id,
    receiptId,
    fraudScore:         fraud.score,
    fraudAction:        fraud.action,
    verificationStatus,
    referenceValidationCode,
    blockCode,
    blurScore,
    tamperScore:        tamper.tamper_score,
    aiDetectionScore,
    ocrEngine:          ocr.engine,
    paymentMethod:      ocr.extracted_payment_method,
    extractedDate:      ocr.extracted_date,
    matchDetail,
  }, "receipt verified");

  /* Broadcast to admin live feed when fraud threshold is exceeded */
  if (fraud.score >= 50) {
    broadcastFraudEvent({
      type:      verificationStatus === "blocked" ? "receipt_blocked" : "high_score",
      severity:  fraud.score >= 100 ? "critical" : "high",
      message:   verificationStatus === "blocked"
        ? `Receipt blocked — score ${fraud.score}${blockCode ? ` (${blockCode})` : ""}`
        : `High-risk receipt submitted — score ${fraud.score}`,
      score:     fraud.score,
      userId:    user.id,
      reference: manualRef || ocr.extracted_reference || undefined,
      details: {
        receiptId,
        verificationStatus,
        blockCode,
        tamperDetected: tamper.tamper_detected,
        ocrEngine:      ocr.engine,
        paymentMethod:  ocr.extracted_payment_method,
      },
    });
  }

  return sendResponse(res, receiptId, verificationStatus, referenceValidationCode,
    matchDetail, ocr, fraud, tamper, blurScore, suspiciousText.score, aiDetectionScore,
    blocked, blockCode, blockReason, manualRef, structureResult);
});

/* ── Helpers ─────────────────────────────────────────────────────────── */

async function storeFraudFlags(
  supabase: ReturnType<typeof import("../lib/supabaseAuth.js").getRequestSupabase>,
  userId:   string,
  flags:    Awaited<ReturnType<typeof import("../lib/fraudDetection.js").runFraudChecks>>["flags"],
): Promise<void> {
  if (flags.length === 0) return;
  const rows = flags.map((f) => ({
    user_id:  userId,
    type:     f.type,
    severity: f.severity,
    points:   f.points,
    metadata: { ...f.metadata, detail: f.detail },
  }));
  const { error } = await supabase.from("fraud_flags").insert(rows);
  if (error) {
    // Non-fatal — log and continue
  }
}

/* ── Response helper ─────────────────────────────────────────────────── */

function sendResponse(
  res:                     import("express").Response,
  receiptId:               string,
  verificationStatus:      string,
  referenceValidationCode: string,
  matchDetail:             string,
  ocr:                     Awaited<ReturnType<typeof import("../lib/ocrService.js").runOcr>>,
  fraud:                   Awaited<ReturnType<typeof import("../lib/fraudDetection.js").runFraudChecks>>,
  tamper:                  Awaited<ReturnType<typeof import("../lib/imageTamperDetection.js").analyzeImageTampering>>,
  blurScore:               number,
  heuristicScore:          number,
  aiDetectionScore:        number,
  blocked:                 boolean,
  blockCode:               string | null,
  blockReason:             string | undefined,
  manualRef:               string,
  structureResult:         Awaited<ReturnType<typeof import("../lib/receiptHeuristics.js").analyzeReceiptStructure>>,
): void {
  const matchSummary =
    referenceValidationCode === "verified"        ? "Reference matched (exact)" :
    referenceValidationCode === "candidate_match" ? "Reference matched (pattern scan)" :
    referenceValidationCode === "raw_text_match"  ? "Reference found in receipt text" :
    referenceValidationCode === "undetected"      ? "Reference not detected — pending manual review" :
    referenceValidationCode === "mismatch"        ? "Reference mismatch — please re-check the reference number" :
    referenceValidationCode === "skipped"         ? "OCR unavailable — pending manual review" :
    referenceValidationCode;

  res.status(blocked ? 422 : 200).json({
    receipt_id:               receiptId,
    verification_status:      verificationStatus,
    reference_validation:     referenceValidationCode,
    match_summary:            matchSummary,
    // OCR extractions
    extracted_reference:      ocr.extracted_reference,
    extracted_candidates:     ocr.extracted_candidates.slice(0, 5),
    extracted_amount:         ocr.extracted_amount,
    extracted_payment_method: ocr.extracted_payment_method,
    extracted_date:           ocr.extracted_date,
    ocr_confidence:           ocr.confidence,
    ocr_engine:               ocr.engine,
    // Fraud / quality signals
    blur_score:               blurScore,
    tamper_score:             tamper.tamper_score,
    tamper_detected:          tamper.tamper_detected,
    tamper_reasons:           tamper.reasons,
    heuristic_score:          heuristicScore,
    ai_detection_score:       aiDetectionScore,
    structure_score:          structureResult.structure_score,
    receipt_field_count:      structureResult.field_count,
    structure_suspicious:     structureResult.suspicious,
    fraud_score:              fraud.score,
    fraud_action:             fraud.action,
    fraud_flags:              fraud.flags.map((f) => ({ type: f.type, severity: f.severity, points: f.points })),
    // Decision
    blocked,
    block_code:               blockCode,
    block_reason:             blockReason,
    manual_review_required:   fraud.action === "review" || fraud.action === "block" || verificationStatus === "suspicious",
    normalised_reference:     normaliseRef(manualRef),
  });
}

export default router;
