/**
 * OrderRefundModal — Professional multi-step billing support modal.
 *
 * Steps:
 *   1. reason      — select issue category
 *   2. receipt     — upload payment screenshot + OCR reference verification
 *   3. payout      — where to receive the refund (GCash / Maya / Bank / Other)
 *   4. details     — describe the issue + submit
 *   5. success     — confirmation
 *
 * Receipt verification calls POST /api/receipts/verify before the final
 * submission. The returned receipt_id is passed to POST /api/refunds/request
 * so the request is linked to the verified receipt row.
 */

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, Loader2, CheckCircle2, HelpCircle, AlertTriangle,
  Upload, ShieldCheck, ShieldAlert, ChevronRight, ChevronLeft,
  Eye, EyeOff,
} from "lucide-react";
import { supabase } from "@/lib/supabase";

/* ── Constants ─────────────────────────────────────────────────────────── */

const CLOUDINARY_URL    = "https://api.cloudinary.com/v1_1/devyx5yyk/image/upload";
const CLOUDINARY_PRESET = "socia_upload";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const api  = (path: string) => `${BASE}/api${path}`;

/* ── Types ─────────────────────────────────────────────────────────────── */

export interface OrderRefundTarget {
  id:           string;
  amount_php:   number;
  label:        string;
  reference_no: string;
}

interface Props {
  open:      boolean;
  order:     OrderRefundTarget | null;
  onClose:   () => void;
  onSuccess: (orderId: string) => void;
}

type Step = "reason" | "receipt" | "payout" | "details" | "success";

type PayoutMethod = "gcash" | "maya" | "bank" | "other";

interface VerificationResult {
  receipt_id:            string;
  verification_status:   "pending" | "verified" | "suspicious" | "blocked";
  reference_validation:  "verified" | "mismatch" | "undetected" | "skipped" | "raw_text_match" | "candidate_match";
  extracted_reference:   string | null;
  extracted_candidates?: string[];
  extracted_amount:      number | null;
  match_summary?:        string;
  fraud_action:          "allow" | "review" | "block";
  blocked:               boolean;
  block_code?:           "mismatch" | "duplicate_receipt" | "duplicate_reference" | "tampered_receipt" | "invalid_receipt" | null;
  extracted_payment_method?: string | null;
  extracted_date?:           string | null;
  ocr_engine?:               "tesseract" | "ocrspace" | "none";
  block_reason?:         string;
}

/* ── Reason options ─────────────────────────────────────────────────────── */

const REASONS = [
  { value: "accidental_payment",  label: "Accidental payment",   desc: "I did not intend to make this payment." },
  { value: "duplicate_payment",   label: "Duplicate payment",    desc: "I was charged more than once for the same order." },
  { value: "wrong_amount",        label: "Incorrect amount",     desc: "The amount charged differs from what I expected." },
  { value: "unauthorized",        label: "Unauthorized charge",  desc: "I did not authorize this transaction." },
  { value: "service_issue",       label: "Service not received", desc: "I completed payment but could not access the service." },
  { value: "other",               label: "Other",                desc: "My situation isn't listed above." },
] as const;

const PAYOUT_METHODS: { value: PayoutMethod; label: string; placeholder: string }[] = [
  { value: "gcash", label: "GCash",       placeholder: "09XXXXXXXXX" },
  { value: "maya",  label: "Maya",        placeholder: "09XXXXXXXXX" },
  { value: "bank",  label: "Bank",        placeholder: "Account number" },
  { value: "other", label: "Other",       placeholder: "Account number / details" },
];

/* ── Helpers ────────────────────────────────────────────────────────────── */

async function uploadToCloudinary(file: File): Promise<string> {
  const form = new FormData();
  form.append("file",          file);
  form.append("upload_preset", CLOUDINARY_PRESET);
  form.append("folder",        "refund-receipts");
  // Send at full quality so OCR can read fine text on receipts
  form.append("quality",       "100");
  form.append("resource_type", "image");
  const res  = await fetch(CLOUDINARY_URL, { method: "POST", body: form });
  if (!res.ok) throw new Error(`Upload failed (${res.status})`);
  const json = await res.json() as { secure_url: string };
  return json.secure_url;
}

/* ── Step progress indicator ────────────────────────────────────────────── */

const STEP_ORDER: Step[] = ["reason", "receipt", "payout", "details", "success"];
const STEP_LABELS = ["Reason", "Receipt", "Payout", "Details", "Done"];

function StepDots({ current }: { current: Step }) {
  const idx = STEP_ORDER.indexOf(current);
  return (
    <div className="flex items-center justify-center gap-1.5 pb-1">
      {STEP_ORDER.slice(0, 4).map((s, i) => (
        <div
          key={s}
          className={`h-1.5 rounded-full transition-all duration-300 ${
            i === idx   ? "w-5 bg-white/60" :
            i < idx     ? "w-1.5 bg-white/30" :
                          "w-1.5 bg-white/10"
          }`}
        />
      ))}
    </div>
  );
}

/* ── Main component ─────────────────────────────────────────────────────── */

export function OrderRefundModal({ open, order, onClose, onSuccess }: Props) {
  /* step state */
  const [step, setStep] = useState<Step>("reason");

  /* step 1 */
  const [reason, setReason] = useState("");

  /* step 2 */
  const fileRef                                     = useRef<HTMLInputElement>(null);
  const [receiptFile, setReceiptFile]               = useState<File | null>(null);
  const [receiptPreview, setReceiptPreview]         = useState<string | null>(null);
  const [receiptUrl, setReceiptUrl]                 = useState<string | null>(null);
  const [uploading, setUploading]                   = useState(false);
  const [uploadError, setUploadError]               = useState<string | null>(null);
  const [manualReference, setManualReference]       = useState("");
  const [verifying, setVerifying]                   = useState(false);
  const [verification, setVerification]             = useState<VerificationResult | null>(null);
  const [verifyError, setVerifyError]               = useState<string | null>(null);

  /* step 3 */
  const [payoutMethod,  setPayoutMethod]  = useState<PayoutMethod | "">("");
  const [payoutAccount, setPayoutAccount] = useState("");
  const [payoutName,    setPayoutName]    = useState("");
  const [showAccount,   setShowAccount]   = useState(false);

  /* step 4 */
  const [description,  setDescription]   = useState("");
  const [submitting,   setSubmitting]     = useState(false);
  const [submitError,  setSubmitError]    = useState<string | null>(null);
  const [successMsg,   setSuccessMsg]     = useState("");

  /* reset on open */
  useEffect(() => {
    if (!open) return;
    setStep("reason");
    setReason("");
    setReceiptFile(null);
    setReceiptPreview(null);
    setReceiptUrl(null);
    setUploading(false);
    setUploadError(null);
    setManualReference(order?.reference_no ?? "");
    setVerifying(false);
    setVerification(null);
    setVerifyError(null);
    setPayoutMethod("");
    setPayoutAccount("");
    setPayoutName("");
    setShowAccount(false);
    setDescription("");
    setSubmitting(false);
    setSubmitError(null);
    setSuccessMsg("");
  }, [open, order]);

  /* ── Cloudinary upload ──────────────────────────────────────────────── */

  async function handleFileSelect(file: File) {
    if (!file.type.startsWith("image/")) {
      setUploadError("Please select an image file (PNG, JPG, WEBP, etc.).");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setUploadError("File is too large. Please select an image under 10 MB.");
      return;
    }

    setReceiptFile(file);
    setReceiptPreview(URL.createObjectURL(file));
    setVerification(null);
    setVerifyError(null);
    setUploadError(null);
    setReceiptUrl(null);
    setUploading(true);

    try {
      const url = await uploadToCloudinary(file);
      setReceiptUrl(url);
    } catch {
      setUploadError("Upload failed — please check your connection and try again.");
      setReceiptFile(null);
      setReceiptPreview(null);
    } finally {
      setUploading(false);
    }
  }

  /* ── OCR receipt verification ───────────────────────────────────────── */

  async function handleVerify() {
    if (!receiptUrl)            { setVerifyError("Please upload your receipt first."); return; }
    if (manualReference.trim().length < 5) { setVerifyError("Enter your payment reference number (min 5 characters)."); return; }

    setVerifyError(null);
    setVerifying(true);
    setVerification(null);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token ?? "";
      const res   = await fetch(api("/receipts/verify"), {
        method:      "POST",
        credentials: "include",
        headers:     { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          image_url:        receiptUrl,
          manual_reference: manualReference.trim(),
          order_id:         order?.id,
        }),
      });
      const json = await res.json() as VerificationResult & { message?: string; code?: string };

      if (res.status === 400) {
        setVerifyError(json.message ?? "Invalid input — please check your reference number.");
        return;
      }
      if (res.status === 500) {
        setVerifyError("Verification service is temporarily unavailable. Please try again.");
        return;
      }

      setVerification(json as VerificationResult);
    } catch {
      setVerifyError("Network error — please check your connection and try again.");
    } finally {
      setVerifying(false);
    }
  }

  /* ── Final submit ────────────────────────────────────────────────────── */

  async function handleSubmit() {
    if (description.trim().length < 10) { setSubmitError("Please add at least 10 characters describing the issue."); return; }
    if (!order) return;

    setSubmitError(null);
    setSubmitting(true);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token ?? "";
      const res   = await fetch(api("/refunds/request"), {
        method:      "POST",
        credentials: "include",
        headers:     { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          order_id:             order.id,
          reason,
          description:          description.trim(),
          payment_reference:    manualReference.trim() || undefined,
          receipt_id:           verification?.receipt_id ?? undefined,
          payout_method:        payoutMethod || undefined,
          payout_account_number: payoutAccount.trim() || undefined,
          payout_account_name:   payoutName.trim()    || undefined,
        }),
      });
      const json = await res.json() as { ok?: boolean; message?: string; code?: string };

      if (!res.ok) {
        setSubmitError(json.message ?? `Something went wrong (${res.status}). Please try again.`);
      } else {
        setSuccessMsg(json.message ?? "Your billing issue has been submitted.");
        setStep("success");
        onSuccess(order.id);
      }
    } catch {
      setSubmitError("Network error — please check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  /* ── Derived state ───────────────────────────────────────────────────── */

  const canProceedFromReceipt =
    verification !== null && !verification.blocked;

  const payoutPlaceholder = PAYOUT_METHODS.find((m) => m.value === payoutMethod)?.placeholder ?? "Account number";

  /* ── Render ──────────────────────────────────────────────────────────── */

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
          style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)" }}
          onClick={(e) => { if (e.target === e.currentTarget && step !== "success") onClose(); }}
        >
          <motion.div
            initial={{ opacity: 0, y: 32 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 32 }}
            transition={{ type: "spring", stiffness: 370, damping: 36 }}
            className="w-full max-w-lg rounded-t-3xl sm:rounded-3xl overflow-hidden"
            style={{ background: "#0b0b18", border: "1px solid rgba(255,255,255,0.07)" }}
          >
            {/* ── Header ─────────────────────────────────────────────── */}
            {step !== "success" && (
              <div className="flex items-center gap-3 px-5 pt-5 pb-4 border-b border-white/[0.06]">
                <div className="grid h-9 w-9 place-items-center rounded-xl bg-white/[0.05] border border-white/[0.08]">
                  <HelpCircle className="h-4 w-4 text-white/50" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-white text-[13.5px]">Payment Issue</div>
                  <div className="text-[10px] text-white/35 truncate">
                    {order?.label} · ₱{order?.amount_php.toLocaleString()}
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="grid h-8 w-8 place-items-center rounded-full bg-white/[0.04] text-white/35 hover:bg-white/[0.08] hover:text-white/60 transition"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

            {/* ── Body ───────────────────────────────────────────────── */}
            <div className="px-5 py-5 max-h-[85dvh] overflow-y-auto">

              {/* step dots (skip on success) */}
              {step !== "success" && <StepDots current={step} />}

              {/* ══════════════════════════════════════════════════════
               *  STEP 1 — Reason
               * ════════════════════════════════════════════════════ */}
              {step === "reason" && (
                <div className="space-y-4 mt-3">
                  <div>
                    <div className="text-[10.5px] font-semibold uppercase tracking-wider text-white/30 mb-2">
                      What happened?
                    </div>
                    <div className="space-y-1.5">
                      {REASONS.map((r) => (
                        <button
                          key={r.value} type="button"
                          onClick={() => setReason(r.value)}
                          className={`w-full rounded-xl border px-3 py-2.5 text-left transition-all ${
                            reason === r.value
                              ? "border-white/20 bg-white/[0.06]"
                              : "border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04]"
                          }`}
                        >
                          <div className="text-[12.5px] font-medium text-white/85">{r.label}</div>
                          <div className="text-[10.5px] text-white/35">{r.desc}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={!reason}
                    onClick={() => setStep("receipt")}
                    className="w-full rounded-2xl py-2.5 text-[13px] font-medium text-white disabled:opacity-30 flex items-center justify-center gap-1.5 transition"
                    style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)" }}
                  >
                    Continue <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}

              {/* ══════════════════════════════════════════════════════
               *  STEP 2 — Receipt upload + verification
               * ════════════════════════════════════════════════════ */}
              {step === "receipt" && (
                <div className="space-y-4 mt-3">
                  <div>
                    <div className="text-[10.5px] font-semibold uppercase tracking-wider text-white/30 mb-1">
                      Upload your receipt
                    </div>
                    <p className="text-[10.5px] text-white/25 mb-3">
                      Take a screenshot of your GCash, Maya, or bank payment confirmation where the reference number is visible.
                    </p>

                    {/* Dropzone */}
                    <input
                      ref={fileRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileSelect(f); }}
                    />

                    <button
                      type="button"
                      onClick={() => fileRef.current?.click()}
                      disabled={uploading}
                      className={`w-full rounded-2xl border-2 border-dashed transition py-5 flex flex-col items-center gap-2 ${
                        receiptFile
                          ? "border-white/10 bg-white/[0.02]"
                          : "border-white/[0.10] bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/20"
                      }`}
                    >
                      {uploading ? (
                        <>
                          <Loader2 className="h-6 w-6 text-white/30 animate-spin" />
                          <span className="text-[11px] text-white/30">Uploading…</span>
                        </>
                      ) : receiptPreview ? (
                        <div className="relative">
                          <img
                            src={receiptPreview}
                            alt="Receipt preview"
                            className="max-h-40 max-w-full rounded-xl object-contain"
                          />
                          <div className="mt-2 text-[10.5px] text-white/35">
                            {receiptUrl ? "✓ Uploaded — tap to change" : "Uploading…"}
                          </div>
                        </div>
                      ) : (
                        <>
                          <Upload className="h-6 w-6 text-white/25" />
                          <span className="text-[12px] font-medium text-white/40">Tap to upload receipt</span>
                          <span className="text-[10.5px] text-white/20">PNG, JPG or WEBP · max 10 MB</span>
                        </>
                      )}
                    </button>

                    {uploadError && (
                      <div className="mt-2 rounded-xl border border-rose-500/20 bg-rose-500/[0.06] px-3 py-2 text-[11.5px] text-rose-300/80 flex items-start gap-2">
                        <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                        {uploadError}
                      </div>
                    )}
                  </div>

                  {/* Reference number + verify */}
                  {receiptUrl && (
                    <div>
                      <label className="text-[10.5px] font-semibold uppercase tracking-wider text-white/30 mb-1.5 block">
                        Payment reference number
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={manualReference}
                          onChange={(e) => { setManualReference(e.target.value); setVerification(null); setVerifyError(null); }}
                          placeholder="e.g. 0917-1234-56789"
                          className="flex-1 rounded-xl border border-white/[0.08] bg-white/[0.02] px-3 py-2.5 text-[12.5px] text-white placeholder:text-white/20 focus:outline-none focus:border-white/20 transition"
                        />
                        <button
                          type="button"
                          onClick={handleVerify}
                          disabled={verifying || !manualReference.trim()}
                          className="shrink-0 rounded-xl px-3.5 py-2.5 text-[12px] font-medium text-white/80 disabled:opacity-30 transition flex items-center gap-1.5"
                          style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.10)" }}
                        >
                          {verifying
                            ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Checking…</>
                            : "Verify"}
                        </button>
                      </div>
                      {verifyError && (
                        <p className="mt-1.5 text-[10.5px] text-rose-300/80">{verifyError}</p>
                      )}
                    </div>
                  )}

                  {/* Verification result */}
                  {verification && (
                    <VerificationCard v={verification} />
                  )}

                  {/* Navigation */}
                  <div className="flex gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setStep("reason")}
                      className="flex-1 rounded-2xl py-2.5 text-[12.5px] font-medium text-white/50 border border-white/[0.08] hover:bg-white/[0.04] transition flex items-center justify-center gap-1"
                    >
                      <ChevronLeft className="h-3.5 w-3.5" /> Back
                    </button>
                    <button
                      type="button"
                      disabled={!canProceedFromReceipt}
                      onClick={() => setStep("payout")}
                      className="flex-[2] rounded-2xl py-2.5 text-[13px] font-medium text-white disabled:opacity-30 flex items-center justify-center gap-1.5 transition"
                      style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)" }}
                    >
                      Continue <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  <p className="text-[9.5px] text-white/18 text-center">
                    Skip this step — <button type="button" onClick={() => setStep("payout")} className="underline underline-offset-2 opacity-60 hover:opacity-100">continue without receipt</button>
                  </p>
                </div>
              )}

              {/* ══════════════════════════════════════════════════════
               *  STEP 3 — Payout details
               * ════════════════════════════════════════════════════ */}
              {step === "payout" && (
                <div className="space-y-4 mt-3">
                  <div>
                    <div className="text-[10.5px] font-semibold uppercase tracking-wider text-white/30 mb-1">
                      Refund destination
                    </div>
                    <p className="text-[10.5px] text-white/25 mb-3">
                      If your billing issue is approved, we'll send the refund to the account below.
                    </p>

                    {/* Method selector */}
                    <div className="grid grid-cols-4 gap-1.5 mb-4">
                      {PAYOUT_METHODS.map((m) => (
                        <button
                          key={m.value}
                          type="button"
                          onClick={() => { setPayoutMethod(m.value); setPayoutAccount(""); }}
                          className={`rounded-xl py-2.5 text-[12px] font-medium transition-all ${
                            payoutMethod === m.value
                              ? "bg-white/[0.10] border border-white/20 text-white"
                              : "bg-white/[0.02] border border-white/[0.07] text-white/45 hover:bg-white/[0.05]"
                          }`}
                        >
                          {m.label}
                        </button>
                      ))}
                    </div>

                    {payoutMethod && (
                      <div className="space-y-3">
                        {/* Account number */}
                        <div>
                          <label className="text-[10.5px] font-semibold uppercase tracking-wider text-white/30 mb-1.5 block">
                            {payoutMethod === "bank" ? "Bank account number" : `${PAYOUT_METHODS.find((m) => m.value === payoutMethod)?.label} number`}
                          </label>
                          <div className="relative">
                            <input
                              type={showAccount ? "text" : "password"}
                              value={payoutAccount}
                              onChange={(e) => setPayoutAccount(e.target.value)}
                              placeholder={payoutPlaceholder}
                              className="w-full rounded-xl border border-white/[0.08] bg-white/[0.02] px-3 py-2.5 pr-10 text-[12.5px] text-white placeholder:text-white/20 focus:outline-none focus:border-white/20 transition"
                            />
                            <button
                              type="button"
                              onClick={() => setShowAccount((s) => !s)}
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-white/25 hover:text-white/50"
                            >
                              {showAccount ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                            </button>
                          </div>
                        </div>

                        {/* Account name */}
                        <div>
                          <label className="text-[10.5px] font-semibold uppercase tracking-wider text-white/30 mb-1.5 block">
                            Account name <span className="normal-case text-white/20 font-normal">(as registered)</span>
                          </label>
                          <input
                            type="text"
                            value={payoutName}
                            onChange={(e) => setPayoutName(e.target.value)}
                            placeholder="Full name on account"
                            className="w-full rounded-xl border border-white/[0.08] bg-white/[0.02] px-3 py-2.5 text-[12.5px] text-white placeholder:text-white/20 focus:outline-none focus:border-white/20 transition"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Navigation */}
                  <div className="flex gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setStep("receipt")}
                      className="flex-1 rounded-2xl py-2.5 text-[12.5px] font-medium text-white/50 border border-white/[0.08] hover:bg-white/[0.04] transition flex items-center justify-center gap-1"
                    >
                      <ChevronLeft className="h-3.5 w-3.5" /> Back
                    </button>
                    <button
                      type="button"
                      onClick={() => setStep("details")}
                      className="flex-[2] rounded-2xl py-2.5 text-[13px] font-medium text-white flex items-center justify-center gap-1.5 transition"
                      style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)" }}
                    >
                      Continue <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <p className="text-[9.5px] text-white/18 text-center">
                    Payout details are optional. You can provide them to support later.
                  </p>
                </div>
              )}

              {/* ══════════════════════════════════════════════════════
               *  STEP 4 — Details + Submit
               * ════════════════════════════════════════════════════ */}
              {step === "details" && (
                <div className="space-y-4 mt-3">
                  {/* Summary card */}
                  <div className="rounded-xl bg-white/[0.02] border border-white/[0.07] px-4 py-3 space-y-1.5 text-[11px]">
                    <div className="flex justify-between">
                      <span className="text-white/35">Payment</span>
                      <span className="text-white/70 font-medium">{order?.label}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-white/35">Amount</span>
                      <span className="text-white/70 font-medium">₱{order?.amount_php.toLocaleString()}</span>
                    </div>
                    {verification?.verification_status === "verified" && (
                      <div className="flex justify-between">
                        <span className="text-white/35">Receipt</span>
                        <span className="text-emerald-400/80 font-medium flex items-center gap-1">
                          <ShieldCheck className="h-3 w-3" /> Verified
                        </span>
                      </div>
                    )}
                    {payoutMethod && (
                      <div className="flex justify-between">
                        <span className="text-white/35">Refund to</span>
                        <span className="text-white/70 font-medium capitalize">{payoutMethod}</span>
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="text-[10.5px] font-semibold uppercase tracking-wider text-white/30 mb-1.5 block">
                      Describe the issue <span className="normal-case text-white/20 font-normal">(required)</span>
                    </label>
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Describe what happened and any steps you've already taken…"
                      rows={4}
                      className="w-full rounded-xl border border-white/[0.08] bg-white/[0.02] px-3 py-2.5 text-[12.5px] text-white placeholder:text-white/20 resize-none focus:outline-none focus:border-white/20 transition"
                    />
                    <div className="text-[9.5px] text-white/20 text-right mt-0.5">{description.length}/2000</div>
                  </div>

                  <p className="text-[10.5px] text-white/22 leading-relaxed">
                    All billing issues are reviewed manually by our team. Submitting a report does not guarantee a refund. We will review your case and respond within 1–3 business days.
                  </p>

                  {submitError && (
                    <div className="rounded-xl border border-rose-500/20 bg-rose-500/[0.06] px-3 py-2.5 text-[11.5px] text-rose-300/80 flex items-start gap-2">
                      <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                      {submitError}
                    </div>
                  )}

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setStep("payout")}
                      className="flex-1 rounded-2xl py-2.5 text-[12.5px] font-medium text-white/50 border border-white/[0.08] hover:bg-white/[0.04] transition flex items-center justify-center gap-1"
                    >
                      <ChevronLeft className="h-3.5 w-3.5" /> Back
                    </button>
                    <button
                      type="button"
                      onClick={handleSubmit}
                      disabled={submitting || description.trim().length < 10}
                      className="flex-[2] rounded-2xl py-2.5 text-[13px] font-medium text-white disabled:opacity-30 flex items-center justify-center gap-2 transition"
                      style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)" }}
                    >
                      {submitting
                        ? <><Loader2 className="h-4 w-4 animate-spin" /> Submitting…</>
                        : "Submit billing issue"}
                    </button>
                  </div>
                </div>
              )}

              {/* ══════════════════════════════════════════════════════
               *  STEP 5 — Success
               * ════════════════════════════════════════════════════ */}
              {step === "success" && (
                <div className="flex flex-col items-center gap-4 py-6 text-center">
                  <div
                    className="grid h-14 w-14 place-items-center rounded-full"
                    style={{ background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.25)" }}
                  >
                    <CheckCircle2 className="h-6 w-6 text-emerald-400" />
                  </div>
                  <div>
                    <div className="text-[15px] font-semibold text-white mb-1">Billing issue submitted</div>
                    <div className="text-[12px] text-white/40 max-w-xs mx-auto">{successMsg}</div>
                  </div>
                  <div className="w-full rounded-xl border border-white/[0.07] bg-white/[0.02] px-4 py-3 text-[11px] text-white/35 text-left space-y-1.5">
                    <div className="font-medium text-white/50 mb-2">What happens next</div>
                    <div>• Our team reviews your case within 1–3 business days</div>
                    <div>• We may follow up for additional information</div>
                    <div>• Approved cases are processed within 5–7 business days</div>
                    <div>• You can track the status in your billing history</div>
                  </div>
                  <button
                    onClick={onClose}
                    className="w-full rounded-2xl py-2.5 text-[13px] font-medium text-white/75 border border-white/10 hover:bg-white/[0.04] transition"
                  >
                    Done
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ── Verification result card ────────────────────────────────────────── */

const BLOCK_UI: Record<string, { title: string; detail: (v: VerificationResult) => string }> = {
  mismatch: {
    title: "Reference number mismatch",
    detail: (v) =>
      v.block_reason ??
      `The reference number detected on your receipt${v.extracted_reference ? ` (${v.extracted_reference})` : ""} doesn't match what you entered. ` +
      "Please double-check the exact reference number on your GCash/Maya/bank screenshot.",
  },
  duplicate_receipt: {
    title: "Receipt already used",
    detail: (v) =>
      v.block_reason ??
      "This receipt image has already been used in a previous refund request. Please upload a different payment screenshot.",
  },
  duplicate_reference: {
    title: "Reference number already used",
    detail: (v) =>
      v.block_reason ??
      "This payment reference number is already linked to another account or refund request. Contact support if you believe this is an error.",
  },
  tampered_receipt: {
    title: "Receipt appears modified",
    detail: (v) =>
      v.block_reason ??
      "Your receipt image appears to have been edited or modified. Please upload an unaltered screenshot directly from your GCash/Maya/bank app.",
  },
  invalid_receipt: {
    title: "Receipt not valid",
    detail: (v) =>
      v.block_reason ??
      "Your receipt could not be verified. Please upload a clear screenshot where the payment reference number is fully visible.",
  },
};

function VerificationCard({ v }: { v: VerificationResult }) {
  const isSuccess =
    !v.blocked &&
    ["verified", "raw_text_match", "candidate_match"].includes(v.reference_validation);
  const isPendingReview =
    !v.blocked &&
    ["skipped", "undetected"].includes(v.reference_validation);

  if (isSuccess) {
    const label =
      v.reference_validation === "verified"        ? "Reference verified" :
      v.reference_validation === "candidate_match" ? "Reference matched" :
      "Reference found in receipt";

    const detail =
      v.reference_validation === "verified"        ? "Your receipt matches the reference number you entered." :
      v.reference_validation === "candidate_match" ? "Your reference number was found among the values detected on your receipt." :
      "Your reference number was located in the receipt text.";

    return (
      <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/[0.06] px-4 py-3 flex items-start gap-3">
        <ShieldCheck className="h-4 w-4 text-emerald-400 mt-0.5 shrink-0" />
        <div>
          <div className="text-[12.5px] font-semibold text-emerald-300 mb-0.5">{label}</div>
          <div className="text-[11px] text-emerald-300/60">
            {detail}
            {v.extracted_amount != null && ` Amount detected: ₱${v.extracted_amount.toLocaleString()}.`}
          </div>
        </div>
      </div>
    );
  }

  if (isPendingReview) {
    const isOcrFailure = v.reference_validation === "undetected";
    return (
      <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.05] px-4 py-3 flex items-start gap-3">
        <ShieldAlert className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
        <div>
          <div className="text-[12.5px] font-semibold text-amber-300 mb-0.5">Receipt uploaded — pending review</div>
          <div className="text-[11px] text-amber-300/60">
            {isOcrFailure
              ? "Our automatic scanner couldn't pinpoint the reference number on your image, but your receipt has been saved. Our support team will verify it manually during review."
              : "Your receipt has been uploaded. Our team will verify the reference manually during review."}
          </div>
        </div>
      </div>
    );
  }

  if (v.blocked) {
    const code = v.block_code ?? "invalid_receipt";
    const ui   = BLOCK_UI[code] ?? BLOCK_UI["invalid_receipt"]!;
    return (
      <div className="rounded-xl border border-rose-500/25 bg-rose-500/[0.06] px-4 py-3 flex items-start gap-3">
        <AlertTriangle className="h-4 w-4 text-rose-400 mt-0.5 shrink-0" />
        <div>
          <div className="text-[12.5px] font-semibold text-rose-300 mb-0.5">{ui.title}</div>
          <div className="text-[11px] text-rose-300/60">{ui.detail(v)}</div>
        </div>
      </div>
    );
  }

  return null;
}
