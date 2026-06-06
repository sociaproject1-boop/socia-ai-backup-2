/**
 * SupportSociaBanner — Compact premium entry point placed immediately
 * below the For You / Following tab selector on the Home feed.
 *
 * Design: premium glassmorphism pill with Socia neon identity.
 * Tap opens the full /support-hub (Founding Supporter Program) page.
 */
import { motion } from "framer-motion";
import { BadgeCheck, ChevronRight } from "lucide-react";
import { useLocation } from "wouter";

export function SupportSociaBanner() {
  const [, navigate] = useLocation();

  return (
    <motion.button
      type="button"
      whileHover={{ scale: 1.01 }}
      whileTap={{ scale: 0.97 }}
      onClick={() => navigate("/support-hub")}
      className="mx-4 mt-2 mb-1 flex w-auto items-center gap-3 rounded-2xl px-4 py-3 text-left"
      style={{
        background:
          "linear-gradient(135deg, rgba(168,85,247,0.14) 0%, rgba(59,130,246,0.08) 50%, rgba(236,72,153,0.10) 100%)",
        border: "1px solid rgba(168,85,247,0.28)",
        backdropFilter: "blur(12px)",
        boxShadow:
          "0 0 24px -8px rgba(168,85,247,0.35), inset 0 1px 0 rgba(255,255,255,0.06)",
      }}
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.25, 0.46, 0.45, 0.94] }}
      aria-label="Founding Supporter Program — open program page"
    >
      {/* Badge icon pill */}
      <div
        className="shrink-0 grid h-9 w-9 place-items-center rounded-xl"
        style={{
          background: "linear-gradient(135deg, #a855f7 0%, #3b82f6 50%, #ec4899 100%)",
          boxShadow: "0 4px 14px -4px rgba(168,85,247,0.60)",
        }}
      >
        <BadgeCheck className="h-4.5 w-4.5 text-white" style={{ width: 18, height: 18 }} />
      </div>

      {/* Label */}
      <div className="min-w-0 flex-1">
        <p className="text-[12.5px] font-bold leading-tight text-white">
          Founding Supporter
        </p>
        <p className="mt-0.5 text-[10.5px] leading-snug text-white/50">
          Help build the future of creator monetization
        </p>
      </div>

      {/* Exclusive tag + chevron */}
      <div className="flex shrink-0 items-center gap-2">
        <span
          className="rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-purple-300"
          style={{ background: "rgba(168,85,247,0.18)", border: "1px solid rgba(168,85,247,0.28)" }}
        >
          Exclusive
        </span>
        <ChevronRight
          className="h-4 w-4"
          style={{ color: "rgba(168,85,247,0.65)" }}
        />
      </div>
    </motion.button>
  );
}
