/**
 * GuestAuthModal.tsx — Bottom-sheet auth prompt shown when a guest attempts
 * an engagement action (like, comment, follow, save, message, upload).
 *
 * Non-intrusive: guests are never blocked from browsing. The modal only
 * appears on deliberate interaction and can always be dismissed.
 */
import { motion, AnimatePresence } from "framer-motion";
import { useLocation } from "wouter";
import { X } from "lucide-react";
import sociaMarkUrl from "@assets/splash2/mark.png";

interface Props {
  open: boolean;
  onClose: () => void;
  action?: string;
}

export function GuestAuthModal({ open, onClose, action }: Props) {
  const [, navigate] = useLocation();

  const actionLabel = action ?? "like, comment, and follow creators";

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="guest-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22 }}
            onClick={onClose}
            className="fixed inset-0 z-[80]"
            style={{ background: "rgba(0,0,0,0.72)", backdropFilter: "blur(4px)" }}
          />

          {/* Sheet */}
          <motion.div
            key="guest-sheet"
            initial={{ opacity: 0, y: 80 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 80 }}
            transition={{ type: "spring", stiffness: 380, damping: 34 }}
            className="fixed bottom-0 left-0 right-0 z-[81] mx-auto max-w-[480px] rounded-t-3xl px-6 pt-5 pb-10"
            style={{
              background: "linear-gradient(180deg,#111114 0%,#0a0a0e 100%)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderBottom: "none",
            }}
          >
            {/* Drag handle */}
            <div className="mx-auto mb-5 h-1 w-10 rounded-full" style={{ background: "rgba(255,255,255,0.18)" }} />

            {/* Close button */}
            <button
              onClick={onClose}
              className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-full"
              style={{ background: "rgba(255,255,255,0.08)" }}
            >
              <X className="h-4 w-4" style={{ color: "rgba(255,255,255,0.6)" }} />
            </button>

            {/* Icon — official Socia "S" mark (same asset as Splash Screen) */}
            <div
              className="mx-auto mb-4 flex items-center justify-center"
              style={{ width: 72, height: 72 }}
            >
              <img
                src={sociaMarkUrl}
                alt="Socia"
                style={{
                  width: 72,
                  height: 72,
                  objectFit: "contain",
                  filter:
                    "drop-shadow(0 0 18px rgba(168,85,247,0.70)) drop-shadow(0 0 6px rgba(236,72,153,0.50))",
                }}
              />
            </div>

            {/* Heading */}
            <h2
              className="mb-2 text-center text-[22px] font-bold text-white"
              style={{ fontFamily: "var(--font-display, inherit)" }}
            >
              Join Socia
            </h2>
            <p className="mb-6 text-center text-[14px] leading-relaxed" style={{ color: "rgba(255,255,255,0.55)" }}>
              Create an account to {actionLabel} and unlock the full experience.
            </p>

            {/* Perks */}
            <div className="mb-7 space-y-2">
              {[
                "Like and comment on posts",
                "Follow your favourite creators",
                "Upload photos and videos",
                "Message friends directly",
              ].map((perk) => (
                <div key={perk} className="flex items-center gap-2.5">
                  <span
                    className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
                    style={{ background: "linear-gradient(135deg,#a855f7,#ec4899)" }}
                  >
                    ✓
                  </span>
                  <span className="text-[13px]" style={{ color: "rgba(255,255,255,0.7)" }}>{perk}</span>
                </div>
              ))}
            </div>

            {/* Sign Up */}
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={() => { onClose(); navigate("/auth?mode=signup"); }}
              className="mb-3 w-full rounded-2xl py-3.5 text-[15px] font-bold text-white"
              style={{ background: "linear-gradient(135deg,#a855f7,#ec4899)" }}
            >
              Create Account — It's Free
            </motion.button>

            {/* Log In */}
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={() => { onClose(); navigate("/auth"); }}
              className="mb-3 w-full rounded-2xl py-3.5 text-[15px] font-semibold"
              style={{
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.12)",
                color: "rgba(255,255,255,0.85)",
              }}
            >
              Log In
            </motion.button>

            {/* Continue browsing */}
            <button
              onClick={onClose}
              className="w-full py-2 text-[13px]"
              style={{ color: "rgba(255,255,255,0.35)" }}
            >
              Continue Browsing
            </button>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
