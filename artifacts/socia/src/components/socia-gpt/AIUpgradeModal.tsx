import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, Sparkles, Zap, Flame, Crown, Check, ChevronRight,
  Loader2, ArrowLeft, Copy, CheckCircle2,
} from "lucide-react";
import {
  AI_PLAN_OPTIONS, subscribeAIPlan, useAIPlanStore,
  type AIPlanCode, type AIPlanOption,
} from "@/lib/aiPlanClient";

interface AIUpgradeModalProps {
  open:           boolean;
  onClose:        () => void;
  currentPlan:    AIPlanCode;
  highlightPlan?: AIPlanCode;
}

type Step = "plans" | "checkout" | "submitted";

const PLAN_ICONS: Record<AIPlanCode, React.ElementType> = {
  free:          Sparkles,
  premium:       Zap,
  elite:         Flame,
  "super-elite": Crown,
};

const PLAN_COLORS: Record<AIPlanCode, { accent: string; glow: string; border: string; text: string }> = {
  free:          { accent: "rgba(255,255,255,0.1)",   glow: "none",                           border: "rgba(255,255,255,0.12)", text: "rgba(255,255,255,0.5)" },
  premium:       { accent: "rgba(168,85,247,0.15)",   glow: "0 0 24px rgba(168,85,247,0.2)",  border: "rgba(168,85,247,0.4)",  text: "rgba(216,180,254,1)"   },
  elite:         { accent: "rgba(249,115,22,0.13)",   glow: "0 0 24px rgba(249,115,22,0.2)",  border: "rgba(249,115,22,0.4)",  text: "rgba(253,186,116,1)"   },
  "super-elite": { accent: "rgba(234,179,8,0.15)",    glow: "0 0 28px rgba(234,179,8,0.22)",  border: "rgba(234,179,8,0.45)",  text: "rgba(253,224,71,1)"    },
};

const PAYMENT_ACCOUNTS = [
  { method: "GCash",  number: "09XX-XXX-XXXX", name: "Socia Inc." },
  { method: "Maya",   number: "09XX-XXX-XXXX", name: "Socia Inc." },
];

export function AIUpgradeModal({ open, onClose, currentPlan, highlightPlan }: AIUpgradeModalProps) {
  const paidPlans = AI_PLAN_OPTIONS.filter((p) => p.code !== "free");

  const [step,      setStep]      = useState<Step>("plans");
  const [selected,  setSelected]  = useState<Exclude<AIPlanCode,"free">>(
    (highlightPlan && highlightPlan !== "free" ? highlightPlan : "premium") as Exclude<AIPlanCode,"free">
  );
  const [payRef,    setPayRef]    = useState("");
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState<string | null>(null);
  const [copied,    setCopied]    = useState<string | null>(null);
  const refresh = useAIPlanStore((s) => s.refresh);

  function handleClose() {
    onClose();
    setTimeout(() => { setStep("plans"); setPayRef(""); setError(null); }, 400);
  }

  function copyToClipboard(text: string, key: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(null), 1800);
    });
  }

  async function handleSubmit() {
    if (!payRef.trim()) { setError("Please enter your payment reference number."); return; }
    setLoading(true); setError(null);
    const result = await subscribeAIPlan(selected, payRef.trim());
    setLoading(false);
    if (result.ok) {
      setStep("submitted");
      useAIPlanStore.setState({ lastFetched: null });
      setTimeout(() => refresh(), 2000);
    } else {
      setError(result.error ?? "Submission failed. Please try again.");
    }
  }

  const selectedOption = paidPlans.find((p) => p.code === selected)!;

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 z-50"
            style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(6px)" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
          />

          {/* Sheet */}
          <motion.div
            className="fixed inset-x-0 bottom-0 z-50 mx-auto max-w-[480px] rounded-t-[28px] overflow-hidden"
            style={{
              background: "rgba(9,5,20,0.98)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderBottom: "none",
              boxShadow: "0 -24px 80px rgba(0,0,0,0.7)",
              backdropFilter: "blur(32px)",
              maxHeight: "92dvh",
            }}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 320 }}
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="h-1 w-10 rounded-full" style={{ background: "rgba(255,255,255,0.15)" }} />
            </div>

            <div className="overflow-y-auto" style={{ maxHeight: "calc(92dvh - 20px)", paddingBottom: "max(env(safe-area-inset-bottom), 24px)" }}>

              {/* ── STEP: Plans ── */}
              {step === "plans" && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  {/* Header */}
                  <div className="flex items-center justify-between px-5 py-4">
                    <div>
                      <h2 className="font-display text-[17px] font-bold text-white tracking-tight">
                        Upgrade Socia <span className="text-gradient">GPT</span>
                      </h2>
                      <p className="mt-0.5 text-[11px]" style={{ color: "rgba(255,255,255,0.35)" }}>
                        More power. More intelligence. More creative control.
                      </p>
                    </div>
                    <button onClick={handleClose}
                      className="grid h-8 w-8 place-items-center rounded-full transition-colors"
                      style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.5)" }}>
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  {/* Plan list */}
                  <div className="space-y-2.5 px-5 pb-4">
                    {paidPlans.map((plan) => {
                      const isSel     = selected === plan.code;
                      const isCurrent = currentPlan === plan.code;
                      const colors    = PLAN_COLORS[plan.code];
                      const Icon      = PLAN_ICONS[plan.code];

                      return (
                        <motion.button
                          key={plan.code}
                          whileTap={{ scale: 0.985 }}
                          onClick={() => setSelected(plan.code as Exclude<AIPlanCode,"free">)}
                          className="relative w-full rounded-2xl p-4 text-left transition-all"
                          style={{
                            background: isSel ? colors.accent : "rgba(255,255,255,0.03)",
                            border: `1.5px solid ${isSel ? colors.border : "rgba(255,255,255,0.07)"}`,
                            boxShadow: isSel ? colors.glow : "none",
                          }}
                        >
                          {plan.highlight && (
                            <span className="absolute right-3 top-3 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider"
                              style={{ background: isSel ? colors.border : "rgba(255,255,255,0.08)", color: isSel ? colors.text : "rgba(255,255,255,0.4)" }}>
                              {plan.highlight}
                            </span>
                          )}
                          {isCurrent && (
                            <span className="absolute right-3 top-3 rounded-full px-2 py-0.5 text-[9px] font-semibold"
                              style={{ background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.4)" }}>
                              Current
                            </span>
                          )}

                          <div className="flex items-start gap-3">
                            {/* Icon */}
                            <div className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-[13px]"
                              style={{ background: isSel ? colors.border : "rgba(255,255,255,0.06)" }}>
                              <Icon className="h-4 w-4" style={{ color: isSel ? colors.text : "rgba(255,255,255,0.45)" }} />
                            </div>

                            {/* Text */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-baseline gap-2">
                                <span className="font-display text-[14px] font-bold" style={{ color: isSel ? "#fff" : "rgba(255,255,255,0.75)" }}>
                                  {plan.label}
                                </span>
                                <span className="text-[10.5px] font-medium" style={{ color: isSel ? colors.text : "rgba(255,255,255,0.3)" }}>
                                  {plan.brandedModel}
                                </span>
                              </div>

                              {/* Top 2 features */}
                              <div className="mt-1.5 space-y-0.5">
                                {plan.features.slice(0, 3).map((f) => (
                                  <div key={f} className="flex items-center gap-1.5 text-[11px]"
                                    style={{ color: isSel ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.35)" }}>
                                    <Check className="h-2.5 w-2.5 shrink-0" style={{ color: isSel ? colors.text : "rgba(255,255,255,0.25)" }} />
                                    {f}
                                  </div>
                                ))}
                              </div>
                            </div>

                            {/* Price */}
                            <div className="shrink-0 text-right">
                              <div className="font-display text-[15px] font-bold text-white">
                                ₱{plan.price_php.toLocaleString()}
                              </div>
                              <div className="text-[9.5px]" style={{ color: "rgba(255,255,255,0.3)" }}>/month</div>
                              <div className="mt-0.5 text-[9px]" style={{ color: "rgba(255,255,255,0.2)" }}>
                                ~${plan.price_usd}
                              </div>
                            </div>
                          </div>
                        </motion.button>
                      );
                    })}
                  </div>

                  {/* Selected features full list */}
                  <div className="mx-5 mb-4 rounded-2xl p-4"
                    style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
                    <p className="mb-2.5 text-[10px] font-semibold uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.3)" }}>
                      {selectedOption.label} includes
                    </p>
                    <div className="grid grid-cols-1 gap-1">
                      {selectedOption.features.map((f) => (
                        <div key={f} className="flex items-start gap-2 text-[11.5px]" style={{ color: "rgba(255,255,255,0.6)" }}>
                          <Check className="mt-0.5 h-3 w-3 shrink-0" style={{ color: PLAN_COLORS[selected].text }} />
                          {f}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* CTA */}
                  <div className="px-5">
                    <motion.button
                      whileTap={{ scale: currentPlan === selected ? 1 : 0.97 }}
                      onClick={() => currentPlan !== selected && setStep("checkout")}
                      disabled={currentPlan === selected}
                      className="flex h-14 w-full items-center justify-center gap-2.5 rounded-2xl font-display text-[15px] font-bold text-white transition-all disabled:opacity-40"
                      style={currentPlan !== selected ? {
                        background: `linear-gradient(135deg, ${
                          selected === "premium"     ? "#a855f7, #ec4899" :
                          selected === "elite"       ? "#f97316, #ef4444" :
                                                       "#eab308, #a855f7"
                        })`,
                        boxShadow: `0 8px 28px -6px ${PLAN_COLORS[selected].border}`,
                      } : { background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)" }}
                    >
                      {currentPlan === selected ? (
                        "Current Plan"
                      ) : (
                        <>
                          Upgrade to {selectedOption.label}
                          <ChevronRight className="h-4 w-4" />
                        </>
                      )}
                    </motion.button>

                    <p className="mt-3 text-center text-[10px]" style={{ color: "rgba(255,255,255,0.2)" }}>
                      Manual activation via GCash · Maya · Bank Transfer · Contact support
                    </p>
                  </div>
                </motion.div>
              )}

              {/* ── STEP: Checkout ── */}
              {step === "checkout" && (
                <motion.div initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}>
                  {/* Header */}
                  <div className="flex items-center gap-3 px-5 py-4">
                    <button onClick={() => setStep("plans")}
                      className="grid h-8 w-8 shrink-0 place-items-center rounded-full"
                      style={{ background: "rgba(255,255,255,0.06)" }}>
                      <ArrowLeft className="h-4 w-4 text-white/60" />
                    </button>
                    <div className="flex-1 min-w-0">
                      <h2 className="font-display text-[15px] font-bold text-white">
                        Activate {selectedOption.label}
                      </h2>
                      <p className="text-[10.5px]" style={{ color: "rgba(255,255,255,0.35)" }}>
                        ₱{selectedOption.price_php.toLocaleString()}/month · {selectedOption.brandedModel}
                      </p>
                    </div>
                    <button onClick={handleClose}
                      className="grid h-8 w-8 shrink-0 place-items-center rounded-full"
                      style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.4)" }}>
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="px-5 pb-4 space-y-4">
                    {/* Payment instructions */}
                    <div className="rounded-2xl p-4 space-y-3"
                      style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
                      <p className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.3)" }}>
                        Send Payment To
                      </p>
                      {PAYMENT_ACCOUNTS.map((acc) => (
                        <div key={acc.method} className="flex items-center justify-between rounded-xl p-3"
                          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}>
                          <div>
                            <p className="text-[11px] font-semibold text-white/80">{acc.method}</p>
                            <p className="font-mono text-[13px] font-bold text-white mt-0.5">{acc.number}</p>
                            <p className="text-[10px]" style={{ color: "rgba(255,255,255,0.4)" }}>{acc.name}</p>
                          </div>
                          <button
                            onClick={() => copyToClipboard(acc.number, acc.method)}
                            className="grid h-8 w-8 place-items-center rounded-xl transition-colors"
                            style={{ background: copied === acc.method ? "rgba(34,197,94,0.15)" : "rgba(255,255,255,0.05)" }}>
                            {copied === acc.method
                              ? <Check className="h-3.5 w-3.5 text-green-400" />
                              : <Copy className="h-3.5 w-3.5 text-white/40" />}
                          </button>
                        </div>
                      ))}
                      <p className="text-[10.5px] leading-relaxed" style={{ color: "rgba(255,255,255,0.35)" }}>
                        Send exactly <span className="font-semibold text-white/60">₱{selectedOption.price_php.toLocaleString()}</span>.
                        Include your username or email in the remarks if possible.
                      </p>
                    </div>

                    {/* Reference input */}
                    <div>
                      <label className="mb-2 block text-[11px] font-semibold uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.35)" }}>
                        Payment Reference Number
                      </label>
                      <input
                        value={payRef}
                        onChange={(e) => { setPayRef(e.target.value); setError(null); }}
                        placeholder="e.g. 1234567890"
                        className="w-full rounded-2xl px-4 py-3.5 text-[14px] font-medium text-white placeholder-white/20 outline-none"
                        style={{
                          background: "rgba(255,255,255,0.05)",
                          border: `1.5px solid ${error ? "rgba(239,68,68,0.5)" : payRef ? PLAN_COLORS[selected].border : "rgba(255,255,255,0.09)"}`,
                          caretColor: PLAN_COLORS[selected].text,
                        }}
                      />
                      <p className="mt-1.5 text-[10.5px]" style={{ color: "rgba(255,255,255,0.3)" }}>
                        Found in your GCash / Maya receipt after sending payment.
                      </p>
                    </div>

                    {/* Error */}
                    {error && (
                      <div className="rounded-xl px-3.5 py-3 text-[12px]"
                        style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.22)", color: "rgba(252,165,165,0.9)" }}>
                        {error}
                      </div>
                    )}

                    {/* Submit */}
                    <motion.button
                      whileTap={{ scale: loading ? 1 : 0.97 }}
                      onClick={handleSubmit}
                      disabled={loading || !payRef.trim()}
                      className="flex h-14 w-full items-center justify-center gap-2.5 rounded-2xl font-display text-[15px] font-bold text-white disabled:opacity-40 transition-all"
                      style={{
                        background: `linear-gradient(135deg, ${
                          selected === "premium"     ? "#a855f7, #ec4899" :
                          selected === "elite"       ? "#f97316, #ef4444" :
                                                       "#eab308, #a855f7"
                        })`,
                        boxShadow: payRef.trim() ? `0 8px 28px -6px ${PLAN_COLORS[selected].border}` : "none",
                      }}
                    >
                      {loading ? (
                        <><Loader2 className="h-4 w-4 animate-spin" /> Submitting…</>
                      ) : (
                        <>Submit for Activation</>
                      )}
                    </motion.button>

                    <p className="text-center text-[10px]" style={{ color: "rgba(255,255,255,0.2)" }}>
                      Our team verifies payments within 24 hours. You'll receive a notification when your plan is activated.
                    </p>
                  </div>
                </motion.div>
              )}

              {/* ── STEP: Submitted ── */}
              {step === "submitted" && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="flex flex-col items-center justify-center px-8 py-12 text-center"
                >
                  <div className="relative mb-6">
                    <div className="absolute inset-0 rounded-full blur-3xl opacity-50"
                      style={{ background: `radial-gradient(circle, ${PLAN_COLORS[selected].border}, transparent 70%)`, transform: "scale(2.5)" }} />
                    <motion.div
                      initial={{ scale: 0.5, rotate: -15 }}
                      animate={{ scale: 1, rotate: 0 }}
                      transition={{ type: "spring", stiffness: 360, damping: 18 }}
                      className="relative grid h-20 w-20 place-items-center rounded-[28px]"
                      style={{
                        background: `linear-gradient(135deg, ${
                          selected === "premium"     ? "#a855f7, #ec4899" :
                          selected === "elite"       ? "#f97316, #ef4444" :
                                                       "#eab308, #a855f7"
                        })`,
                        boxShadow: `0 20px 50px -8px ${PLAN_COLORS[selected].border}`,
                      }}
                    >
                      <CheckCircle2 className="h-10 w-10 text-white" strokeWidth={2} />
                    </motion.div>
                  </div>

                  <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
                    <h2 className="font-display text-[20px] font-bold text-white tracking-tight">
                      Request Submitted
                    </h2>
                    <p className="mx-auto mt-3 max-w-[260px] text-[13px] leading-relaxed" style={{ color: "rgba(255,255,255,0.45)" }}>
                      We've received your {selectedOption.label} subscription request. Our team will verify your payment and activate your plan within 24 hours.
                    </p>
                    <p className="mt-4 text-[11.5px] font-semibold" style={{ color: PLAN_COLORS[selected].text }}>
                      Reference: {payRef}
                    </p>
                  </motion.div>

                  <motion.button
                    whileTap={{ scale: 0.97 }}
                    onClick={handleClose}
                    initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
                    className="mt-8 rounded-2xl px-8 py-3 text-[13.5px] font-semibold text-white"
                    style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)" }}
                  >
                    Done
                  </motion.button>
                </motion.div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
