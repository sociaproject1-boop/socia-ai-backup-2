/**
 * SociaGPT AI Billing page — completely separate from creator subscriptions.
 *
 * Shows:
 *   - Current AI plan badge + model
 *   - AI usage progress bar (daily/monthly)
 *   - Plan comparison cards (Free / Premium ₱299 / Ultra ₱999)
 *   - Subscribe / upgrade / cancel buttons
 *
 * Does NOT link to or touch creator billing (/billing, /billing/upgrade, etc.).
 */
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import {
  ArrowLeft, Sparkles, Zap, Crown, Check, Loader2, AlertCircle,
  RefreshCw, ChevronRight, RotateCcw, History, ChevronDown, HelpCircle,
} from "lucide-react";
import { RefundStatusBadge } from "@/components/billing/RefundStatusBadge";
import {
  useAIPlanStore, AI_PLAN_OPTIONS, subscribeAIPlan, cancelAIPlan,
  type AIPlanCode,
} from "@/lib/aiPlanClient";
import { AIPlanBadge } from "@/components/socia-gpt/AIPlanBadge";
import { AIUsageBar } from "@/components/socia-gpt/AIUsageBar";
import { RefundModal } from "@/components/billing/RefundModal";
import { supabase } from "@/lib/supabase";

const BASE_URL = import.meta.env.BASE_URL.replace(/\/$/, "");

interface AIRefundRow {
  id: string; order_id: string | null; subscription_type: string; plan_code: string;
  payment_amount_php: number; estimated_refundable_php: number;
  approved_amount_php: number | null; reason: string; status: string;
  admin_notes: string | null; created_at: string;
}

async function fetchAIRefunds(): Promise<AIRefundRow[]> {
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token ?? "";
    const res = await fetch(`${BASE_URL}/api/refunds/my`, {
      credentials: "include",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return [];
    const json = await res.json() as { requests?: AIRefundRow[] };
    return (json.requests ?? []).filter((r) => r.subscription_type === "ai");
  } catch {
    return [];
  }
}

const PLAN_ICONS: Record<AIPlanCode, React.ElementType> = {
  free:    Sparkles,
  premium: Zap,
  ultra:   Crown,
};

const PLAN_COLORS: Record<AIPlanCode, string> = {
  free:    "#6b7280",
  premium: "#a855f7",
  ultra:   "#8b5cf6",
};

export default function SociaGptBilling() {
  const [, navigate] = useLocation();
  const { plan, usage, loading, refresh } = useAIPlanStore();
  const [subscribing, setSubscribing]   = useState<AIPlanCode | null>(null);
  const [cancelling,  setCancelling]    = useState(false);
  const [feedback,    setFeedback]      = useState<{ ok: boolean; msg: string } | null>(null);
  const [refundOpen,   setRefundOpen]   = useState(false);
  const [aiRefunds,    setAIRefunds]    = useState<AIRefundRow[]>([]);
  const [historyOpen,  setHistoryOpen]  = useState(false);

  useEffect(() => {
    useAIPlanStore.setState({ lastFetched: null });
    void refresh();
    fetchAIRefunds().then(setAIRefunds).catch(() => {});
  }, [refresh]);

  async function handleSubscribe(code: "premium" | "ultra") {
    setFeedback(null);
    setSubscribing(code);
    const result = await subscribeAIPlan(code);
    setSubscribing(null);
    if (result.ok) {
      setFeedback({ ok: true, msg: `${code === "ultra" ? "Ultra Pro" : "Premium AI"} activated!` });
      useAIPlanStore.setState({ lastFetched: null });
      await refresh();
    } else {
      setFeedback({ ok: false, msg: result.error ?? "Subscription failed." });
    }
  }

  async function handleCancel() {
    if (!confirm("Cancel your AI subscription? You'll revert to Free AI immediately.")) return;
    setFeedback(null);
    setCancelling(true);
    const result = await cancelAIPlan();
    setCancelling(false);
    if (result.ok) {
      setFeedback({ ok: true, msg: "Subscription cancelled. You're on Free AI." });
      useAIPlanStore.setState({ lastFetched: null });
      await refresh();
    } else {
      setFeedback({ ok: false, msg: result.error ?? "Cancellation failed." });
    }
  }

  const currentCode = plan?.code ?? "free";
  const PlanIcon    = PLAN_ICONS[currentCode];

  return (
    <div className="flex min-h-[100dvh] flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-white/5 px-4 py-3">
        <button
          onClick={() => navigate("/socia-gpt")}
          className="grid h-9 w-9 place-items-center rounded-full bg-white/5 text-white/80 hover:bg-white/10"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="flex-1">
          <h1 className="font-display text-[16px] font-bold text-white">
            AI <span className="text-gradient">Subscription</span>
          </h1>
          <p className="text-[10.5px] text-white/45">Manage your SociaGPT AI plan</p>
        </div>
        <button
          onClick={() => { useAIPlanStore.setState({ lastFetched: null }); void refresh(); }}
          className="grid h-9 w-9 place-items-center rounded-full bg-white/5 text-white/60 hover:bg-white/10"
          aria-label="Refresh"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto pb-8">
        {/* Current plan card */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="mx-4 mt-5"
        >
          <div
            className="rounded-3xl border border-white/8 p-5"
            style={{
              background: currentCode === "ultra"
                ? "linear-gradient(135deg,rgba(124,58,237,0.15),rgba(99,102,241,0.08))"
                : currentCode === "premium"
                ? "linear-gradient(135deg,rgba(168,85,247,0.15),rgba(236,72,153,0.08))"
                : "rgba(255,255,255,0.03)",
            }}
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div
                  className="grid h-12 w-12 place-items-center rounded-2xl"
                  style={{ background: `${PLAN_COLORS[currentCode]}25`, border: `1px solid ${PLAN_COLORS[currentCode]}40` }}
                >
                  <PlanIcon className="h-5 w-5" style={{ color: PLAN_COLORS[currentCode] }} />
                </div>
                <div>
                  <AIPlanBadge code={currentCode} size="md" />
                  <div className="mt-1 text-[11.5px] text-white/50">
                    Model: {plan?.model ?? "GPT-4o Mini"}
                  </div>
                </div>
              </div>
              {loading && <Loader2 className="h-4 w-4 animate-spin text-white/30" />}
            </div>

            {usage && (
              <div className="mt-4">
                <AIUsageBar code={currentCode} usage={usage} />
              </div>
            )}

            {currentCode !== "free" && (
              <div className="mt-4">
                <button
                  onClick={handleCancel}
                  disabled={cancelling}
                  className="w-full rounded-xl border border-white/8 py-2 text-[11.5px] text-white/40 hover:text-white/60 hover:border-white/12 transition disabled:opacity-40"
                >
                  {cancelling ? <Loader2 className="mx-auto h-3.5 w-3.5 animate-spin" /> : "Cancel subscription"}
                </button>
              </div>
            )}
          </div>
        </motion.div>

        {/* Feedback banner */}
        {feedback && (
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            className={`mx-4 mt-3 rounded-xl border px-4 py-2.5 text-[12.5px] font-medium flex items-center gap-2 ${
              feedback.ok
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                : "border-red-500/30 bg-red-500/10 text-red-300"
            }`}
          >
            {feedback.ok ? <Check className="h-3.5 w-3.5" /> : <AlertCircle className="h-3.5 w-3.5" />}
            {feedback.msg}
          </motion.div>
        )}

        {/* Note: completely separate from creator billing */}
        <div className="mx-4 mt-4 rounded-2xl border border-amber-500/15 bg-amber-500/5 px-4 py-2.5 text-[11px] text-amber-300/70">
          <strong className="text-amber-300">Note:</strong> AI subscriptions are separate from your
          Creator subscription. You can have both, either, or neither independently.{" "}
          <button
            onClick={() => navigate("/billing")}
            className="underline decoration-dashed hover:text-amber-300 transition"
          >
            View Creator Billing →
          </button>
        </div>

        {/* Plan cards */}
        <div className="px-4 mt-6">
          <h2 className="font-display text-[13px] font-bold text-white/70 mb-3">AI Plans</h2>
          <div className="space-y-3">
            {AI_PLAN_OPTIONS.map((planOpt, i) => {
              const isCurrent = currentCode === planOpt.code;
              const isPaid    = planOpt.code !== "free";
              const Icon      = PLAN_ICONS[planOpt.code];
              const color     = PLAN_COLORS[planOpt.code];

              return (
                <motion.div
                  key={planOpt.code}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.06 }}
                  className={`rounded-3xl border p-5 ${
                    isCurrent ? "border-white/15" : "border-white/6"
                  }`}
                  style={{
                    background:
                      planOpt.code === "ultra"
                        ? "linear-gradient(135deg,rgba(124,58,237,0.12),rgba(15,10,28,0.8))"
                        : planOpt.code === "premium"
                        ? "linear-gradient(135deg,rgba(168,85,247,0.12),rgba(15,10,28,0.8))"
                        : "rgba(255,255,255,0.02)",
                  }}
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div
                        className="grid h-10 w-10 place-items-center rounded-xl"
                        style={{ background: `${color}22`, border: `1px solid ${color}35` }}
                      >
                        <Icon className="h-4.5 w-4.5" style={{ color }} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-display text-[14px] font-bold text-white">{planOpt.label}</span>
                          {isCurrent && (
                            <span className="rounded-full bg-emerald-500/15 border border-emerald-500/25 px-1.5 py-0.5 text-[9.5px] font-semibold text-emerald-400">
                              Current
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-white/45">{planOpt.model}</div>
                      </div>
                    </div>
                    <div className="text-right">
                      {planOpt.price_php === 0 ? (
                        <span className="text-[16px] font-bold text-white">Free</span>
                      ) : (
                        <>
                          <span className="text-[18px] font-bold text-white">₱{planOpt.price_php}</span>
                          <span className="text-[10.5px] text-white/40">/mo</span>
                        </>
                      )}
                    </div>
                  </div>

                  <ul className="space-y-1.5 mb-4">
                    {planOpt.features.map((f) => (
                      <li key={f} className="flex items-start gap-2 text-[11.5px] text-white/65">
                        <Check className="mt-0.5 h-3 w-3 shrink-0" style={{ color }} />
                        {f}
                      </li>
                    ))}
                  </ul>

                  {isPaid && !isCurrent && (
                    <button
                      onClick={() => handleSubscribe(planOpt.code as "premium" | "ultra")}
                      disabled={subscribing !== null}
                      className="w-full rounded-2xl py-3 text-[13px] font-semibold text-white disabled:opacity-50 transition flex items-center justify-center gap-2"
                      style={{
                        background: planOpt.code === "ultra"
                          ? "linear-gradient(135deg,#7c3aed,#6366f1)"
                          : "linear-gradient(135deg,#a855f7,#ec4899)",
                        boxShadow: planOpt.code === "ultra"
                          ? "0 8px 20px -6px rgba(124,58,237,0.45)"
                          : "0 8px 20px -6px rgba(168,85,247,0.45)",
                      }}
                    >
                      {subscribing === planOpt.code ? (
                        <><Loader2 className="h-4 w-4 animate-spin" /> Processing…</>
                      ) : (
                        <>
                          Upgrade to {planOpt.label}
                          <ChevronRight className="h-4 w-4" />
                        </>
                      )}
                    </button>
                  )}

                  {isPaid && isCurrent && (
                    <div className="w-full rounded-2xl border border-white/8 py-2.5 text-center text-[12px] text-white/40">
                      Active Plan
                    </div>
                  )}
                </motion.div>
              );
            })}
          </div>
        </div>

        {/* Payment methods notice */}
        <div className="mx-4 mt-5 rounded-2xl border border-white/6 bg-white/[0.02] px-4 py-3.5">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-white/30 mb-2">
            Payment Methods (Coming Soon)
          </div>
          <div className="flex flex-wrap gap-2 text-[11.5px] text-white/50">
            {["GCash", "Maya", "PayMongo", "Stripe"].map((m) => (
              <span key={m} className="rounded-lg border border-white/8 bg-white/[0.03] px-2.5 py-1">
                {m}
              </span>
            ))}
          </div>
          <p className="mt-2 text-[10.5px] text-white/35">
            Currently using mock subscriptions for development. Production payment integration coming soon.
          </p>
        </div>

        {/* AI Billing support history — collapsible, hidden by default */}
        {aiRefunds.length > 0 && (
          <div className="mx-4 mt-5 rounded-2xl border border-white/[0.07] bg-white/[0.02] overflow-hidden">
            <button
              onClick={() => setHistoryOpen((v) => !v)}
              className="flex w-full items-center gap-2 px-4 pt-3 pb-3 hover:bg-white/[0.02] transition"
            >
              <History className="h-3.5 w-3.5 text-white/35" />
              <div className="text-[11px] font-bold uppercase tracking-wider text-white/35 flex-1 text-left">
                Billing support history
                <span className="ml-1.5 rounded-full bg-white/[0.08] px-1.5 py-0.5 text-[9px] font-semibold">
                  {aiRefunds.length}
                </span>
              </div>
              <ChevronDown className={`h-3.5 w-3.5 text-white/30 transition-transform ${historyOpen ? "rotate-180" : ""}`} />
            </button>
            {historyOpen && (
              <ul className="divide-y divide-white/[0.05] border-t border-white/[0.05]">
                {aiRefunds.map((r) => (
                  <li key={r.id} className="px-4 py-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[12px] font-medium text-white/80">
                            {r.plan_code.toUpperCase()} AI Plan
                          </span>
                          <RefundStatusBadge
                            status={r.status as "pending"|"reviewing"|"approved"|"partial"|"rejected"}
                            approvedAmountPhp={r.approved_amount_php}
                          />
                        </div>
                        <div className="text-[10px] text-white/35 mt-0.5 capitalize">
                          {r.reason.replace(/_/g, " ")} · {new Date(r.created_at).toLocaleDateString()}
                        </div>
                        {r.admin_notes && (
                          <div className="text-[10.5px] text-amber-300/60 mt-1">Note: {r.admin_notes}</div>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-[9.5px] text-white/30">Amount</div>
                        <div className="text-[12px] font-semibold text-white/70">
                          ₱{r.estimated_refundable_php.toLocaleString()}
                        </div>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Subtle billing support link */}
        <div className="mx-4 mt-5 mb-2 text-center">
          {currentCode !== "free" && (
            <button
              onClick={() => setRefundOpen(true)}
              className="inline-flex items-center gap-1.5 text-[10.5px] text-white/20 hover:text-white/40 transition"
            >
              <HelpCircle className="h-3 w-3" />
              Billing issue with your AI subscription?
            </button>
          )}
        </div>
      </div>

      <RefundModal
        open={refundOpen}
        onClose={() => {
          setRefundOpen(false);
          fetchAIRefunds().then(setAIRefunds).catch(() => {});
        }}
        subscriptionType="ai"
      />
    </div>
  );
}
