import { useEffect } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, Zap } from "lucide-react";
import { useBillingStore } from "@/lib/billing";

const HIDE_ON = [
  /^\/auth/,
  /^\/forgot-password/,
  /^\/reset-password/,
  /^\/billing/,
  /^\/topup/,
  /^\/subscription/,
  /^\/admin/,
  /^\/call\//,
  /^\/messages\/[^/]+$/,
  /^\/create\/[^/]+$/,
  /^\/profile\/settings/,
  /^\/post\//,
  /^\/legal\//,
];

/**
 * Globally-mounted floating action button that appears when the user is
 * low on credits. Tap → /billing/upgrade. Hidden for owners, on auth/billing
 * routes, and during in-call screens.
 */
export function FloatingUpgradeButton() {
  const [location, navigate] = useLocation();
  const summary = useBillingStore((s) => s.summary);
  const refresh = useBillingStore((s) => s.refresh);

  useEffect(() => {
    if (!summary) refresh();
  }, [summary, refresh]);

  if (HIDE_ON.some((r) => r.test(location))) return null;
  if (!summary) return null;
  if (summary.is_owner) return null;

  const credits = summary.credits ?? 0;
  const planCr  = summary.plan_credits ?? 0;
  const lowByPct  = planCr > 0 && credits < planCr * 0.15;
  const lowByAbs  = credits < 50;
  const isFree    = summary.plan_code === "free";
  const show = lowByPct || lowByAbs || isFree;
  if (!show) return null;

  const tone = credits < 15
    ? { bg: "linear-gradient(135deg,#ef4444,#f97316)", glow: "rgba(239,68,68,0.55)" }
    : { bg: "linear-gradient(135deg,#a855f7,#ec4899)", glow: "rgba(168,85,247,0.55)" };

  const label = isFree ? "Upgrade" : credits < 15 ? "Top up now" : "Top up";

  return (
    <AnimatePresence>
      <motion.button
        key="fab-upgrade"
        initial={{ opacity: 0, scale: 0.7, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.7, y: 20 }}
        transition={{ type: "spring", stiffness: 420, damping: 28 }}
        whileTap={{ scale: 0.93 }}
        onClick={() => navigate(isFree ? "/billing/upgrade" : "/billing/topup")}
        className="fixed z-40 inline-flex items-center gap-1.5 rounded-full px-3.5 py-2.5 text-[12.5px] font-bold text-white"
        style={{
          right: 14,
          bottom: "calc(env(safe-area-inset-bottom, 0px) + 78px)",
          background: tone.bg,
          boxShadow: "0 0 0 1px rgba(255,255,255,0.08) inset",
        }}
        aria-label={label}
      >
        <motion.span
          animate={{ scale: [1, 1.18, 1] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
          className="grid h-5 w-5 place-items-center rounded-full bg-white/20"
        >
          {isFree ? <Sparkles className="h-3 w-3" /> : <Zap className="h-3 w-3" />}
        </motion.span>
        {label}
        <span className="ml-1 rounded-full bg-black/25 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide">
          {credits} cr
        </span>
      </motion.button>
    </AnimatePresence>
  );
}
