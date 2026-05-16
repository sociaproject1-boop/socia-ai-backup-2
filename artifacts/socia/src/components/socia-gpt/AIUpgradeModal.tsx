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

const PLAN_COLORS: Record<AIPlanCode, { accent: string; border: string; text: string; btnGrad: string }> = {
  free: {
    accent:  "rgba(255,255,255,0.07)",
    border:  "rgba(255,255,255,0.12)",
    text:    "rgba(255,255,255,0.4)",
    btnGrad: "rgba(255,255,255,0.07)",
  },
  premium: {
    accent:  "rgba(168,85,247,0.14)",
    border:  "rgba(168,85,247,0.42)",
    text:    "rgba(216,180,254,1)",
    btnGrad: "linear-gradient(135deg,#a855f7,#ec4899)",
  },
  elite: {
    accent:  "rgba(249,115,22,0.13)",
    border:  "rgba(249,115,22,0.42)",
    text:    "rgba(253,186,116,1)",
    btnGrad: "linear-gradient(135deg,#f97316,#ef4444)",
  },
  "super-elite": {
    accent:  "rgba(234,179,8,0.14)",
    border:  "rgba(234,179,8,0.45)",
    text:    "rgba(253,224,71,1)",
    btnGrad: "linear-gradient(135deg,#eab308,#a855f7)",
  },
};

const PAYMENT_ACCOUNTS = [
  { method: "GCash", number: "09XX-XXX-XXXX", name: "Socia Inc." },
  { method: "Maya",  number: "09XX-XXX-XXXX", name: "Socia Inc." },
];

export function AIUpgradeModal({ open, onClose, currentPlan, highlightPlan }: AIUpgradeModalProps) {
  const paidPlans = AI_PLAN_OPTIONS.filter((p) => p.code !== "free");

  const defaultSelected = (
    highlightPlan && highlightPlan !== "free" ? highlightPlan : "premium"
  ) as Exclude<AIPlanCode, "free">;

  const [step,     setStep]     = useState<Step>("plans");
  const [selected, setSelected] = useState<Exclude<AIPlanCode, "free">>(defaultSelected);
  const [payRef,   setPayRef]   = useState("");
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState<string | null>(null);
  const [copied,   setCopied]   = useState<string | null>(null);
  const refresh = useAIPlanStore((s) => s.refresh);

  function handleClose() {
    onClose();
    setTimeout(() => { setStep("plans"); setPayRef(""); setError(null); }, 400);
  }

  function copyNumber(text: string, key: string) {
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

  const selColors = PLAN_COLORS[selected];
  const selOption = paidPlans.find((p) => p.code === selected)!;

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 z-50"
            style={{ background: "rgba(0,0,0,0.85)" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
          />

          {/* Sheet */}
          <motion.div
            className="fixed inset-x-0 bottom-0 z-50 mx-auto max-w-[480px] rounded-t-[28px] overflow-hidden"
            style={{
              background: "#0a0a0a",
              border: "1px solid rgba(255,255,255,0.06)",
              borderBottom: "none",
              boxShadow: "0 -24px 80px rgba(0,0,0,0.75)",
              maxHeight: "92dvh",
            }}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 320 }}
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="h-1 w-10 rounded-full" style={{ background: "rgba(255,255,255,0.14)" }} />
            </div>

            <div className="overflow-y-auto" style={{ maxHeight: "calc(92dvh - 20px)", paddingBottom: "max(env(safe-area-inset-bottom), 24px)" }}>

              {/* ── STEP: Plans ── */}
              {step === "plans" && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>

                  {/* Header */}
                  <div className="flex items-center justify-between px-5 py-4">
                    <div>
                      <h2 className="font-display text-[17px] font-bold text-white tracking-tight">
                        Upgrade Socia <span className="text-gradient">GPT</span>
                      </h2>
                      <p className="mt-0.5 text-[11px]" style={{ color: "rgba(255,255,255,0.32)" }}>
                        More power. More intelligence. More creative control.
                      </p>
                    </div>
                    <button onClick={handleClose}
                      className="grid h-8 w-8 place-items-center rounded-full transition-colors"
                      style={{ background: "#141414", color: "rgba(255,255,255,0.45)" }}>
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
                          onClick={() => setSelected(plan.code as Exclude<AIPlanCode, "free">)}
                          className="w-full rounded-2xl p-4 text-left transition-all"
                          style={{
                            background: isSel ? colors.accent : "#000000",
                            border: `1.5px solid ${isSel ? colors.border : "rgba(255,255,255,0.06)"}`,
                            boxShadow: "none",
                          }}
                        >
                          {/* Top row: icon + name + badge + price — all in one flex row */}
                          <div className="flex items-center gap-3">
                            {/* Icon */}
                            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-[12px]"
                              style={{ background: isSel ? colors.border : "#141414" }}>
                              <Icon className="h-4 w-4" style={{ color: isSel ? colors.text : "rgba(255,255,255,0.4)" }} />
                            </div>

                            {/* Name + badges */}
                            <div className="flex flex-1 min-w-0 flex-col gap-0.5">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="font-display text-[14px] font-bold" style={{ color: isSel ? "#fff" : "rgba(255,255,255,0.7)" }}>
                                  {plan.label}
                                </span>
                                {plan.highlight && (
                                  <span className="rounded-full px-1.5 py-0.5 text-[8.5px] font-bold uppercase tracking-wide"
                                    style={{
                                      background: isSel ? `${colors.border}55` : "rgba(255,255,255,0.06)",
                                      color: isSel ? colors.text : "rgba(255,255,255,0.3)",
                                      border: `1px solid ${isSel ? `${colors.border}60` : "rgba(255,255,255,0.08)"}`,
                                    }}>
                                    {plan.highlight}
                                  </span>
                                )}
                                {isCurrent && (
                                  <span className="rounded-full px-1.5 py-0.5 text-[8.5px] font-semibold"
                                    style={{ background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.4)", border: "1px solid rgba(255,255,255,0.08)" }}>
                                    Active
                                  </span>
                                )}
                              </div>
                              <span className="text-[10px]" style={{ color: isSel ? `${colors.text}80` : "rgba(255,255,255,0.28)" }}>
                                {plan.brandedModel}
                              </span>
                            </div>

                            {/* Price — right side, never overlaps */}
                            <div className="shrink-0 text-right">
                              <div className="font-display text-[15px] font-bold text-white">
                                ₱{plan.price_php.toLocaleString()}
                              </div>
                              <div className="text-[9px]" style={{ color: "rgba(255,255,255,0.28)" }}>
                                /month
                              </div>
                            </div>
                          </div>

                          {/* Feature preview — top 3 */}
                          {isSel && (
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: "auto" }}
                              exit={{ opacity: 0, height: 0 }}
                              transition={{ duration: 0.18 }}
                              className="mt-3 space-y-1 overflow-hidden"
                            >
                              {plan.features.slice(0, 4).map((f) => (
                                <div key={f} className="flex items-center gap-1.5 text-[11px]"
                                  style={{ color: "rgba(255,255,255,0.6)" }}>
                                  <Check className="h-2.5 w-2.5 shrink-0" style={{ color: colors.text }} />
                                  {f}
                                </div>
                              ))}
                            </motion.div>
                          )}
                        </motion.button>
                      );
                    })}
                  </div>

                  {/* CTA */}
                  <div className="px-5">
                    <motion.button
                      whileTap={{ scale: currentPlan === selected ? 1 : 0.97 }}
                      onClick={() => currentPlan !== selected && setStep("checkout")}
                      disabled={currentPlan === selected}
                      className="flex h-14 w-full items-center justify-center gap-2.5 rounded-2xl font-display text-[15px] font-bold text-white transition-all disabled:opacity-40"
                      style={{
                        background: currentPlan !== selected ? selColors.btnGrad : "#141414",
                        border: currentPlan !== selected ? "none" : "1px solid rgba(255,255,255,0.06)",
                        boxShadow: "none",
                      }}
                    >
                      {currentPlan === selected ? "Current Plan" : (
                        <><span>Continue with {selOption.label}</span><ChevronRight className="h-4 w-4" /></>
                      )}
                    </motion.button>
                    <p className="mt-3 text-center text-[10px]" style={{ color: "rgba(255,255,255,0.18)" }}>
                      Manual activation via GCash · Maya · Bank · Contact support
                    </p>
                  </div>
                </motion.div>
              )}

              {/* ── STEP: Checkout ── */}
              {step === "checkout" && (
                <motion.div initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }}>
                  {/* Header */}
                  <div className="flex items-center gap-3 px-5 py-4">
                    <button onClick={() => setStep("plans")}
                      className="grid h-8 w-8 shrink-0 place-items-center rounded-full"
                      style={{ background: "#141414" }}>
                      <ArrowLeft className="h-4 w-4 text-white/55" />
                    </button>
                    <div className="flex-1 min-w-0">
                      <h2 className="font-display text-[15px] font-bold text-white">
                        Activate {selOption.label}
                      </h2>
                      <p className="text-[10.5px]" style={{ color: "rgba(255,255,255,0.32)" }}>
                        ₱{selOption.price_php.toLocaleString()}/month
                      </p>
                    </div>
                    <button onClick={handleClose}
                      className="grid h-8 w-8 shrink-0 place-items-center rounded-full"
                      style={{ background: "#141414", color: "rgba(255,255,255,0.4)" }}>
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="px-5 pb-4 space-y-4">
                    {/* Payment accounts */}
                    <div className="rounded-2xl p-4 space-y-3"
                      style={{ background: "#000000", border: "1px solid rgba(255,255,255,0.05)" }}>
                      <p className="text-[10.5px] font-semibold uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.28)" }}>
                        Send Payment To
                      </p>
                      {PAYMENT_ACCOUNTS.map((acc) => (
                        <div key={acc.method} className="flex items-center justify-between rounded-xl p-3"
                          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}>
                          <div>
                            <p className="text-[11px] font-semibold text-white/75">{acc.method}</p>
                            <p className="font-mono text-[14px] font-bold text-white mt-0.5">{acc.number}</p>
                            <p className="text-[10px]" style={{ color: "rgba(255,255,255,0.35)" }}>{acc.name}</p>
                          </div>
                          <button onClick={() => copyNumber(acc.number, acc.method)}
                            className="grid h-8 w-8 place-items-center rounded-xl transition-colors"
                            style={{ background: copied === acc.method ? "rgba(34,197,94,0.12)" : "#141414" }}>
                            {copied === acc.method
                              ? <Check className="h-3.5 w-3.5 text-green-400" />
                              : <Copy className="h-3.5 w-3.5 text-white/35" />}
                          </button>
                        </div>
                      ))}
                      <p className="text-[10.5px] leading-relaxed" style={{ color: "rgba(255,255,255,0.32)" }}>
                        Send exactly <span className="font-semibold text-white/55">₱{selOption.price_php.toLocaleString()}</span>.
                        Include your username in the remarks if possible.
                      </p>
                    </div>

                    {/* Reference input */}
                    <div>
                      <label className="mb-2 block text-[10.5px] font-semibold uppercase tracking-widest"
                        style={{ color: "rgba(255,255,255,0.32)" }}>
                        Payment Reference Number
                      </label>
                      <input
                        value={payRef}
                        onChange={(e) => { setPayRef(e.target.value); setError(null); }}
                        placeholder="e.g. 1234567890"
                        className="w-full rounded-2xl px-4 py-3.5 text-[14px] font-medium text-white placeholder-white/18 outline-none"
                        style={{
                          background: "#0a0a0a",
                          border: `1.5px solid ${error ? "rgba(239,68,68,0.45)" : payRef ? selColors.border : "rgba(255,255,255,0.07)"}`,
                          caretColor: selColors.text,
                        }}
                      />
                      <p className="mt-1.5 text-[10.5px]" style={{ color: "rgba(255,255,255,0.28)" }}>
                        Found in your GCash or Maya receipt after sending.
                      </p>
                    </div>

                    {error && (
                      <div className="rounded-xl px-3.5 py-3 text-[12px]"
                        style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", color: "rgba(252,165,165,0.9)" }}>
                        {error}
                      </div>
                    )}

                    <motion.button
                      whileTap={{ scale: loading ? 1 : 0.97 }}
                      onClick={handleSubmit}
                      disabled={loading || !payRef.trim()}
                      className="flex h-14 w-full items-center justify-center gap-2.5 rounded-2xl font-display text-[15px] font-bold text-white disabled:opacity-40 transition-all"
                      style={{
                        background: selColors.btnGrad,
                        boxShadow: payRef.trim() ? `0 8px 28px -6px ${selColors.border}` : "none",
                      }}
                    >
                      {loading
                        ? <><Loader2 className="h-4 w-4 animate-spin" />Submitting…</>
                        : "Submit for Activation"}
                    </motion.button>

                    <p className="text-center text-[10px]" style={{ color: "rgba(255,255,255,0.18)" }}>
                      Verified within 24 hours. You'll be notified when your plan is activated.
                    </p>
                  </div>
                </motion.div>
              )}

              {/* ── STEP: Submitted ── */}
              {step === "submitted" && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="flex flex-col items-center justify-center px-8 py-14 text-center"
                >
                  <div className="relative mb-6">
                    <div className="absolute inset-0 blur-3xl opacity-40 rounded-full"
                      style={{ background: `radial-gradient(circle, ${selColors.border}, transparent 70%)`, transform: "scale(3)" }} />
                    <motion.div
                      initial={{ scale: 0.5, rotate: -15 }}
                      animate={{ scale: 1, rotate: 0 }}
                      transition={{ type: "spring", stiffness: 360, damping: 18 }}
                      className="relative grid h-20 w-20 place-items-center rounded-[28px]"
                      style={{ background: selColors.btnGrad, boxShadow: `0 20px 50px -8px ${selColors.border}` }}
                    >
                      <CheckCircle2 className="h-10 w-10 text-white" strokeWidth={2} />
                    </motion.div>
                  </div>

                  <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
                    <h2 className="font-display text-[20px] font-bold text-white tracking-tight">
                      Request Submitted
                    </h2>
                    <p className="mx-auto mt-3 max-w-[260px] text-[13px] leading-relaxed" style={{ color: "rgba(255,255,255,0.42)" }}>
                      We've received your {selOption.label} subscription request.
                      Our team will verify and activate your plan within 24 hours.
                    </p>
                    <p className="mt-4 text-[11.5px] font-semibold" style={{ color: selColors.text }}>
                      Ref: {payRef}
                    </p>
                  </motion.div>

                  <motion.button
                    whileTap={{ scale: 0.97 }}
                    onClick={handleClose}
                    initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
                    className="mt-8 rounded-2xl px-8 py-3 text-[13.5px] font-semibold text-white"
                    style={{ background: "#141414", border: "1px solid rgba(255,255,255,0.06)" }}
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
