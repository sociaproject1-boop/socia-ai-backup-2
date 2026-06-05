/**
 * SupportSociaBanner — Compact premium entry point placed immediately
 * below the For You / Following tab selector on the Home feed.
 *
 * Design goals:
 *  - Ultra-compact (~52 px tall) — non-intrusive, never blocks content
 *  - Premium glass effect with purple/pink neon accent glow
 *  - Zero state, zero network calls — pure presentational nav trigger
 *  - Tapping opens the full existing /support-hub page (reuses all logic)
 *
 * Responsive: works identically on mobile / tablet / desktop because
 * the parent feed is already constrained to max-w-[480px] by AppShell.
 */
import { motion } from "framer-motion";
import { Gift, ChevronRight } from "lucide-react";
import { useLocation } from "wouter";

export function SupportSociaBanner() {
  const [, navigate] = useLocation();

  return (
    <motion.button
      type="button"
      whileHover={{ scale: 1.01 }}
      whileTap={{ scale: 0.97 }}
      onClick={() => navigate("/support-hub")}
      className="mx-4 mt-2 mb-1 flex w-auto items-center gap-3 rounded-2xl px-4 py-2.5 text-left"
      style={{
        background:
          "linear-gradient(135deg, rgba(168,85,247,0.11) 0%, rgba(236,72,153,0.07) 100%)",
        border: "1px solid rgba(168,85,247,0.22)",
        backdropFilter: "blur(10px)",
        boxShadow:
          "0 0 18px -6px rgba(168,85,247,0.30), inset 0 1px 0 rgba(255,255,255,0.05)",
      }}
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.25, 0.46, 0.45, 0.94] }}
      aria-label="Support Socia — open support page"
    >
      {/* Gift icon pill */}
      <div
        className="shrink-0 grid h-8 w-8 place-items-center rounded-xl"
        style={{
          background: "linear-gradient(135deg, #a855f7, #ec4899)",
          boxShadow: "0 4px 12px -4px rgba(168,85,247,0.55)",
        }}
      >
        <Gift className="h-4 w-4 text-white" />
      </div>

      {/* Label */}
      <div className="min-w-0 flex-1">
        <p className="text-[12.5px] font-bold leading-tight text-white">
          🎁 Support Socia
        </p>
        <p className="mt-0.5 text-[10.5px] leading-snug text-white/45">
          Help build creator monetization
        </p>
      </div>

      {/* Chevron */}
      <ChevronRight
        className="h-4 w-4 shrink-0"
        style={{ color: "rgba(168,85,247,0.65)" }}
      />
    </motion.button>
  );
}
