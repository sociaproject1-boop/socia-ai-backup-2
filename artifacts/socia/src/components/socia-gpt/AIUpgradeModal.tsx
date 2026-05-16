import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Zap, Crown, Check, Loader2, Sparkles } from "lucide-react";
import { AI_PLAN_OPTIONS, subscribeAIPlan, useAIPlanStore, type AIPlanCode } from "@/lib/aiPlanClient";

interface AIUpgradeModalProps {
  open:           boolean;
  onClose:        () => void;
  currentPlan:    AIPlanCode;
  highlightPlan?: AIPlanCode;
}

export function AIUpgradeModal({ open, onClose, currentPlan, highlightPlan }: AIUpgradeModalProps) {
  const [selected,  setSelected]  = useState<"premium" | "ultra">(
    highlightPlan === "ultra" ? "ultra" : "premium",
  );
  const [loading,   setLoading]   = useState(false);
  const [success,   setSuccess]   = useState(false);
  const [error,     setError]     = useState<string | null>(null);
  const refresh = useAIPlanStore((s) => s.refresh);

  async function handleSubscribe() {
    setLoading(true);
    setError(null);
    const result = await subscribeAIPlan(selected);
    setLoading(false);
    if (result.ok) {
      setSuccess(true);
      // Force refresh store and give UI a moment
      useAIPlanStore.setState({ lastFetched: null });
      setTimeout(async () => {
        await refresh();
        onClose();
        setSuccess(false);
      }, 1800);
    } else {
      setError(result.error ?? "Subscription failed. Please try again.");
    }
  }

  const premiumPlan = AI_PLAN_OPTIONS.find((p) => p.code === "premium")!;
  const ultraPlan   = AI_PLAN_OPTIONS.find((p) => p.code === "ultra")!;

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            className="fixed inset-x-3 bottom-0 z-50 mx-auto max-w-md rounded-t-3xl border border-white/10 bg-[#0d0a1a] pb-[max(env(safe-area-inset-bottom),20px)] shadow-2xl sm:inset-auto sm:left-1/2 sm:top-1/2 sm:rounded-3xl sm:-translate-x-1/2 sm:-translate-y-1/2"
            initial={{ opacity: 0, y: 40, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 40, scale: 0.96 }}
            transition={{ type: "spring", damping: 26, stiffness: 280 }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-5 pb-3">
              <div className="flex items-center gap-2.5">
                <div
                  className="grid h-9 w-9 place-items-center rounded-2xl"
                  style={{ background: "linear-gradient(135deg,#a855f7,#6366f1)" }}
                >
                  <Sparkles className="h-4 w-4 text-white" />
                </div>
                <div>
                  <h2 className="font-display text-[16px] font-bold text-white">Upgrade SociaGPT</h2>
                  <p className="text-[10.5px] text-white/45">Unlock more AI power</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="grid h-8 w-8 place-items-center rounded-full bg-white/5 text-white/60 hover:bg-white/10"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Plan selector */}
            <div className="grid grid-cols-2 gap-2 px-5 pb-3">
              {[premiumPlan, ultraPlan].map((plan) => {
                const isSel     = selected === plan.code;
                const isPremium = plan.code === "premium";
                const isUltra   = plan.code === "ultra";
                const isCurrent = currentPlan === plan.code;

                return (
                  <button
                    key={plan.code}
                    onClick={() => setSelected(plan.code as "premium" | "ultra")}
                    className={`relative rounded-2xl border p-3.5 text-left transition ${
                      isSel
                        ? isPremium
                          ? "border-fuchsia-500/50 bg-fuchsia-500/10"
                          : "border-violet-400/50 bg-violet-500/10"
                        : "border-white/8 bg-white/[0.03] hover:bg-white/[0.06]"
                    }`}
                  >
                    {isCurrent && (
                      <span className="absolute right-2.5 top-2.5 rounded-full bg-white/10 px-1.5 py-0.5 text-[9px] font-medium text-white/60">
                        Current
                      </span>
                    )}
                    <div className="mb-2">
                      {isPremium
                        ? <Zap className="h-5 w-5 text-fuchsia-400" />
                        : <Crown className="h-5 w-5 text-violet-400" />}
                    </div>
                    <div className="font-display text-[13px] font-bold text-white">{plan.label}</div>
                    <div className="mt-0.5 text-[10px] text-white/50">{plan.model}</div>
                    <div className="mt-2 text-[16px] font-bold text-white">
                      ₱{plan.price_php}
                      <span className="text-[10px] font-normal text-white/45">/mo</span>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Feature list */}
            <div className="mx-5 rounded-2xl border border-white/6 bg-white/[0.02] p-3.5">
              <div className="text-[10.5px] font-semibold uppercase tracking-wide text-white/40 mb-2">
                {selected === "premium" ? premiumPlan.label : ultraPlan.label} includes
              </div>
              <ul className="space-y-1.5">
                {(selected === "premium" ? premiumPlan : ultraPlan).features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-[12px] text-white/75">
                    <Check className="mt-0.5 h-3 w-3 shrink-0 text-fuchsia-400" />
                    {f}
                  </li>
                ))}
              </ul>
            </div>

            {/* Error */}
            {error && (
              <div className="mx-5 mt-3 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-[11.5px] text-red-300">
                {error}
              </div>
            )}

            {/* CTA */}
            <div className="px-5 pt-3">
              {success ? (
                <div className="flex items-center justify-center gap-2 rounded-2xl bg-emerald-500/20 border border-emerald-500/30 py-3.5 text-[13px] font-semibold text-emerald-300">
                  <Check className="h-4 w-4" />
                  Subscription activated!
                </div>
              ) : (
                <button
                  onClick={handleSubscribe}
                  disabled={loading || currentPlan === selected}
                  className="w-full rounded-2xl py-3.5 text-[14px] font-semibold text-white disabled:opacity-50 transition"
                  style={{
                    background: selected === "ultra"
                      ? "linear-gradient(135deg,#7c3aed,#6366f1)"
                      : "linear-gradient(135deg,#a855f7,#ec4899)",
                    boxShadow: selected === "ultra"
                      ? "0 8px 24px -6px rgba(124,58,237,0.5)"
                      : "0 8px 24px -6px rgba(168,85,247,0.5)",
                  }}
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Processing…
                    </span>
                  ) : currentPlan === selected ? (
                    "Current Plan"
                  ) : (
                    `Upgrade to ${selected === "ultra" ? "Ultra Pro" : "Premium AI"} — ₱${selected === "ultra" ? 999 : 299}/mo`
                  )}
                </button>
              )}
              <p className="mt-2.5 text-center text-[10px] text-white/30">
                Payment via GCash · Maya · PayMongo · Stripe (coming soon)
              </p>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
