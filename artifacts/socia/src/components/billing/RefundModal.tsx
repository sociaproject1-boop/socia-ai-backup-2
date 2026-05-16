/**
 * RefundModal — shared modal for requesting refunds on either
 * creator subscriptions or SociaGPT AI subscriptions.
 *
 * Usage:
 *   <RefundModal
 *     open={open}
 *     onClose={() => setOpen(false)}
 *     subscriptionType="creator"   // or "ai"
 *   />
 */
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, AlertTriangle, Loader2, CheckCircle2, ChevronRight,
  Shield, Info, Receipt,
} from "lucide-react";
import { supabase } from "@/lib/supabase";

export type SubscriptionType = "creator" | "ai";

interface RefundEstimate {
  plan_code:               string;
  payment_amount_php:      number;
  usage_pct:               number;
  estimated_used_php:      number;
  estimated_refundable_php: number;
  refund_eligible:         boolean;
  ineligible_reason?:      string;
  credits_total?:          number;
  credits_used?:           number;
  ai_requests_used?:       number;
  ai_requests_limit?:      number;
}

interface RefundModalProps {
  open:             boolean;
  onClose:          () => void;
  subscriptionType: SubscriptionType;
}

const REASONS = [
  { value: "unused",        label: "Subscription not used",    desc: "I never used the plan after subscribing." },
  { value: "partial",       label: "Partially used",           desc: "I used some features but want a refund for the rest." },
  { value: "technical",     label: "Technical issues",         desc: "I experienced bugs or service outages." },
  { value: "billing_error", label: "Billing error",            desc: "I was charged incorrectly." },
  { value: "other",         label: "Other reason",             desc: "My reason isn't listed above." },
] as const;

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const api  = (path: string) => `${BASE}/api${path}`;

async function getBearer(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ? `Bearer ${data.session.access_token}` : "";
}

async function fetchEstimate(type: SubscriptionType): Promise<RefundEstimate | null> {
  const auth = await getBearer();
  const res = await fetch(api(`/refunds/estimate?type=${type}`), {
    credentials: "include",
    headers: { Authorization: auth },
  });
  if (!res.ok) return null;
  const json = await res.json() as { estimate?: RefundEstimate };
  return json.estimate ?? null;
}

async function submitRefundRequest(payload: {
  subscription_type:    SubscriptionType;
  reason:               string;
  description:          string;
  payment_reference?:   string;
  screenshot_url?:      string;
  requested_amount_php?: number;
}): Promise<{ ok: boolean; message?: string; code?: string }> {
  const auth = await getBearer();
  const res = await fetch(api("/refunds/request"), {
    method:      "POST",
    credentials: "include",
    headers:     { "Content-Type": "application/json", Authorization: auth },
    body:        JSON.stringify(payload),
  });
  const json = await res.json() as { ok?: boolean; message?: string; code?: string };
  if (!res.ok) return { ok: false, message: json.message ?? `Error ${res.status}`, code: json.code };
  return { ok: true, message: json.message };
}

export function RefundModal({ open, onClose, subscriptionType }: RefundModalProps) {
  const [step, setStep] = useState<"estimate" | "form" | "success" | "ineligible">("estimate");
  const [estimate, setEstimate]   = useState<RefundEstimate | null>(null);
  const [loadingEst, setLoadingEst] = useState(false);
  const [estError, setEstError]   = useState<string | null>(null);

  const [reason, setReason]           = useState("");
  const [description, setDescription] = useState("");
  const [payRef, setPayRef]           = useState("");
  const [submitting, setSubmitting]   = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg]   = useState("");

  // Reset & fetch estimate each time modal opens
  useEffect(() => {
    if (!open) return;
    setStep("estimate");
    setEstimate(null);
    setReason("");
    setDescription("");
    setPayRef("");
    setSubmitError(null);
    setEstError(null);

    setLoadingEst(true);
    fetchEstimate(subscriptionType)
      .then((est) => {
        setEstimate(est);
        if (!est) {
          setEstError("Could not load your usage data. Please try again.");
        } else if (!est.refund_eligible) {
          setStep("ineligible");
        }
      })
      .catch(() => setEstError("Network error — please try again."))
      .finally(() => setLoadingEst(false));
  }, [open, subscriptionType]);

  async function handleSubmit() {
    if (!reason) { setSubmitError("Please select a reason."); return; }
    if (description.trim().length < 10) { setSubmitError("Please write at least 10 characters describing your issue."); return; }
    setSubmitError(null);
    setSubmitting(true);
    const result = await submitRefundRequest({
      subscription_type: subscriptionType,
      reason,
      description: description.trim(),
      payment_reference: payRef.trim() || undefined,
    });
    setSubmitting(false);
    if (result.ok) {
      setSuccessMsg(result.message ?? "Refund request submitted.");
      setStep("success");
    } else {
      setSubmitError(result.message ?? "Submission failed. Please try again.");
    }
  }

  const typeLabel = subscriptionType === "ai" ? "AI Subscription" : "Creator Subscription";

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
          style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}
          onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
          <motion.div
            initial={{ opacity: 0, y: 32 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 32 }}
            className="w-full max-w-lg rounded-t-3xl sm:rounded-3xl overflow-hidden"
            style={{ background: "#0f0f1a", border: "1px solid rgba(255,255,255,0.08)" }}
          >
            {/* Header */}
            <div className="flex items-center gap-3 px-5 pt-5 pb-4 border-b border-white/5">
              <div className="grid h-9 w-9 place-items-center rounded-xl"
                   style={{ background: "linear-gradient(135deg,#a855f7,#ec4899)" }}>
                <Receipt className="h-4 w-4 text-white" />
              </div>
              <div className="flex-1">
                <div className="font-bold text-white text-[14px]">Request Refund</div>
                <div className="text-[10.5px] text-white/40">{typeLabel}</div>
              </div>
              <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-full bg-white/5 text-white/50 hover:bg-white/10">
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Body */}
            <div className="px-5 py-5 max-h-[75dvh] overflow-y-auto space-y-4">

              {/* ── Loading estimate ── */}
              {loadingEst && (
                <div className="flex flex-col items-center gap-3 py-8 text-white/50">
                  <Loader2 className="h-6 w-6 animate-spin" />
                  <div className="text-sm">Loading your usage data…</div>
                </div>
              )}

              {/* ── Estimate error ── */}
              {!loadingEst && estError && (
                <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-[12.5px] text-rose-300">
                  {estError}
                </div>
              )}

              {/* ── Ineligible ── */}
              {step === "ineligible" && estimate && (
                <>
                  <div className="rounded-xl border border-amber-500/20 bg-amber-500/8 px-4 py-3 flex gap-3">
                    <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-amber-400" />
                    <div className="text-[12.5px] text-amber-200">
                      <div className="font-semibold mb-1">Not eligible for refund</div>
                      <div>{estimate.ineligible_reason}</div>
                    </div>
                  </div>
                  <UsageSummary estimate={estimate} subscriptionType={subscriptionType} />
                  <div className="text-[11px] text-white/35 text-center pt-1">
                    If you believe this is an error, please{" "}
                    <button className="underline text-white/50" onClick={onClose}>contact support</button>.
                  </div>
                </>
              )}

              {/* ── Estimate card + proceed to form ── */}
              {step === "estimate" && !loadingEst && estimate && estimate.refund_eligible && (
                <>
                  {/* Warning */}
                  <div className="rounded-xl border border-white/8 bg-white/[0.03] px-4 py-3 flex gap-2.5">
                    <Info className="h-4 w-4 mt-0.5 shrink-0 text-white/40" />
                    <div className="text-[11.5px] text-white/50">
                      Refund requests are reviewed manually and may be partially approved depending on usage. You will receive a decision via the admin team.
                    </div>
                  </div>

                  {/* Usage summary */}
                  <UsageSummary estimate={estimate} subscriptionType={subscriptionType} />

                  {/* Estimated refundable */}
                  <div className="rounded-2xl p-4 text-center"
                       style={{ background: "linear-gradient(135deg,rgba(168,85,247,0.12),rgba(236,72,153,0.08))", border: "1px solid rgba(168,85,247,0.2)" }}>
                    <div className="text-[10.5px] uppercase tracking-wider text-white/40 mb-1">Estimated refundable</div>
                    <div className="text-3xl font-black text-white">₱{estimate.estimated_refundable_php.toLocaleString()}</div>
                    <div className="text-[11px] text-white/35 mt-1">Admin decides the final amount</div>
                  </div>

                  <button
                    onClick={() => setStep("form")}
                    className="w-full rounded-2xl py-3 text-[13px] font-semibold text-white flex items-center justify-center gap-2"
                    style={{ background: "linear-gradient(135deg,#a855f7,#ec4899)" }}
                  >
                    Continue to request form <ChevronRight className="h-4 w-4" />
                  </button>
                </>
              )}

              {/* ── Refund request form ── */}
              {step === "form" && (
                <>
                  {/* Warning banner */}
                  <div className="rounded-xl border border-amber-500/20 bg-amber-500/8 px-4 py-3 flex gap-2.5">
                    <Shield className="h-4 w-4 mt-0.5 shrink-0 text-amber-400" />
                    <div className="text-[11.5px] text-amber-200/80">
                      <strong className="text-amber-300">Important:</strong> Refund requests are reviewed manually. Abuse of this system may result in account restrictions.
                    </div>
                  </div>

                  {/* Reason picker */}
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-white/40 mb-2">Reason for refund</div>
                    <div className="space-y-2">
                      {REASONS.map((r) => (
                        <button key={r.value} onClick={() => setReason(r.value)}
                                className={`w-full rounded-xl border px-3 py-2.5 text-left transition ${
                                  reason === r.value
                                    ? "border-purple-500/50 bg-purple-500/15"
                                    : "border-white/8 bg-white/[0.02] hover:bg-white/[0.04]"
                                }`}>
                          <div className="text-[12.5px] font-semibold text-white">{r.label}</div>
                          <div className="text-[10.5px] text-white/40">{r.desc}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Description */}
                  <div>
                    <label className="text-[11px] font-semibold uppercase tracking-wider text-white/40 mb-1.5 block">
                      Issue description *
                    </label>
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Describe your issue in detail (minimum 10 characters)…"
                      rows={4}
                      className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-[12.5px] text-white placeholder:text-white/25 resize-none focus:outline-none focus:border-purple-500/40"
                    />
                    <div className="text-[10px] text-white/25 text-right mt-0.5">{description.length} / 2000</div>
                  </div>

                  {/* Payment reference (optional) */}
                  <div>
                    <label className="text-[11px] font-semibold uppercase tracking-wider text-white/40 mb-1.5 block">
                      Payment reference <span className="normal-case text-white/25">(optional — GCash / Maya ref no.)</span>
                    </label>
                    <input
                      type="text"
                      value={payRef}
                      onChange={(e) => setPayRef(e.target.value)}
                      placeholder="e.g. 2025-GCASH-XXXXXX"
                      className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-[12.5px] text-white placeholder:text-white/25 focus:outline-none focus:border-purple-500/40"
                    />
                  </div>

                  {submitError && (
                    <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2.5 text-[12px] text-rose-300">
                      {submitError}
                    </div>
                  )}

                  <div className="flex gap-2 pt-1">
                    <button onClick={() => setStep("estimate")}
                            className="flex-1 rounded-2xl border border-white/10 py-3 text-[12.5px] text-white/60 hover:bg-white/5">
                      Back
                    </button>
                    <button
                      onClick={handleSubmit}
                      disabled={submitting}
                      className="flex-1 rounded-2xl py-3 text-[13px] font-semibold text-white disabled:opacity-50 flex items-center justify-center gap-2"
                      style={{ background: "linear-gradient(135deg,#a855f7,#ec4899)" }}
                    >
                      {submitting ? <><Loader2 className="h-4 w-4 animate-spin" /> Submitting…</> : "Submit request"}
                    </button>
                  </div>
                </>
              )}

              {/* ── Success ── */}
              {step === "success" && (
                <div className="flex flex-col items-center gap-4 py-6 text-center">
                  <div className="grid h-16 w-16 place-items-center rounded-full"
                       style={{ background: "linear-gradient(135deg,rgba(16,185,129,0.2),rgba(5,150,105,0.1))", border: "1px solid rgba(16,185,129,0.3)" }}>
                    <CheckCircle2 className="h-7 w-7 text-emerald-400" />
                  </div>
                  <div>
                    <div className="text-[16px] font-bold text-white mb-1">Request submitted</div>
                    <div className="text-[12.5px] text-white/50 max-w-xs">{successMsg}</div>
                  </div>
                  <div className="rounded-xl border border-white/8 bg-white/[0.03] px-4 py-3 text-[11.5px] text-white/45 text-left w-full">
                    <div className="font-semibold text-white/60 mb-1">What happens next:</div>
                    <ul className="space-y-1">
                      <li>• Our team will review your request within 1–3 business days</li>
                      <li>• We may contact you for additional information</li>
                      <li>• You'll receive a decision (approve / partial / reject)</li>
                      <li>• Approved refunds are processed within 5–7 business days</li>
                    </ul>
                  </div>
                  <button onClick={onClose}
                          className="w-full rounded-2xl py-3 text-[13px] font-semibold text-white"
                          style={{ background: "linear-gradient(135deg,#a855f7,#ec4899)" }}>
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

/* ── Internal: usage summary card ──────────────────────────────────────── */
function UsageSummary({ estimate, subscriptionType }: { estimate: RefundEstimate; subscriptionType: SubscriptionType }) {
  const rows: { label: string; value: string }[] = [];

  if (subscriptionType === "creator") {
    if (estimate.credits_total) {
      rows.push({ label: "Credits granted", value: estimate.credits_total.toLocaleString() });
      rows.push({ label: "Credits used",    value: (estimate.credits_used ?? 0).toLocaleString() });
      rows.push({ label: "Credits left",    value: ((estimate.credits_total ?? 0) - (estimate.credits_used ?? 0)).toLocaleString() });
    }
  } else {
    if (estimate.ai_requests_limit) {
      rows.push({ label: "Monthly limit",   value: estimate.ai_requests_limit.toLocaleString() });
      rows.push({ label: "Requests used",   value: (estimate.ai_requests_used ?? 0).toLocaleString() });
      rows.push({ label: "Requests left",   value: (estimate.ai_requests_limit - (estimate.ai_requests_used ?? 0)).toLocaleString() });
    }
  }

  rows.push({ label: "Plan paid",         value: `₱${estimate.payment_amount_php.toLocaleString()}` });
  rows.push({ label: "Estimated used",    value: `₱${estimate.estimated_used_php.toLocaleString()} (${estimate.usage_pct}%)` });

  return (
    <div className="rounded-xl border border-white/8 bg-white/[0.02] divide-y divide-white/5">
      {rows.map((r) => (
        <div key={r.label} className="flex items-center justify-between px-3 py-2 text-[11.5px]">
          <span className="text-white/45">{r.label}</span>
          <span className="font-semibold text-white">{r.value}</span>
        </div>
      ))}
    </div>
  );
}
