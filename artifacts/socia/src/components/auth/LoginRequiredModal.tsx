/**
 * LoginRequiredModal — shown when a guest attempts to use an AI creation
 * tool. The backend enforces auth via requireAuth middleware; this modal
 * is the UX layer that explains what they'll unlock before redirecting.
 *
 * Can be triggered from any page via the useLoginGate hook.
 */
import { motion, AnimatePresence } from "framer-motion";
import { useLocation } from "wouter";
import { X, ImageIcon, Film, Wand2, MessageCircle, Download, Zap } from "lucide-react";

export interface LoginRequiredModalProps {
  open: boolean;
  onClose: () => void;
  /** Name of the tool the guest tried to open — shown in the heading */
  toolName?: string;
}

const AI_PERKS = [
  { icon: ImageIcon, label: "Generate AI images from any prompt" },
  { icon: Film,      label: "Create cinematic AI videos"         },
  { icon: Wand2,     label: "Animate photos into motion"         },
  { icon: MessageCircle, label: "Chat with Socia GPT assistant"  },
  { icon: Download,  label: "Export and share your creations"    },
  { icon: Zap,       label: "Access all 11 AI Studio tools"      },
];

export function LoginRequiredModal({ open, onClose, toolName }: LoginRequiredModalProps) {
  const [, navigate] = useLocation();

  const heading = toolName ? `Unlock ${toolName}` : "Login Required";

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="lr-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 z-[90]"
            style={{ background: "rgba(0,0,0,0.78)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)" }}
          />

          {/* Sheet */}
          <motion.div
            key="lr-sheet"
            initial={{ opacity: 0, y: 96 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 96 }}
            transition={{ type: "spring", stiffness: 400, damping: 36 }}
            className="fixed bottom-0 left-0 right-0 z-[91] mx-auto max-w-[480px] rounded-t-[28px] px-5 pt-4 pb-10"
            style={{
              background: "linear-gradient(180deg,#13111e 0%,#0a0a10 100%)",
              border: "1px solid rgba(255,255,255,0.09)",
              borderBottom: "none",
            }}
          >
            {/* Drag handle */}
            <div className="mx-auto mb-4 h-1 w-10 rounded-full" style={{ background: "rgba(255,255,255,0.16)" }} />

            {/* Close */}
            <button
              onClick={onClose}
              aria-label="Close"
              className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-full"
              style={{ background: "rgba(255,255,255,0.07)" }}
            >
              <X className="h-4 w-4" style={{ color: "rgba(255,255,255,0.55)" }} />
            </button>

            {/* Icon orb */}
            <div
              className="mx-auto mb-4 grid h-[60px] w-[60px] place-items-center rounded-2xl"
              style={{
                background: "linear-gradient(135deg,#7c3aed,#a855f7,#ec4899)",
                boxShadow: "0 6px 24px -6px rgba(168,85,247,0.55)",
              }}
            >
              {/* Lock icon drawn inline to avoid import overhead */}
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            </div>

            {/* Heading */}
            <h2
              className="mb-1 text-center text-[21px] font-bold text-white"
              style={{ fontFamily: "var(--font-display, inherit)", letterSpacing: "-0.02em" }}
            >
              {heading}
            </h2>
            <p className="mb-5 text-center text-[13px] leading-relaxed" style={{ color: "rgba(255,255,255,0.50)" }}>
              {toolName
                ? `Sign in or create a free account to generate with ${toolName}.`
                : "Sign in or create a free account to start generating."}
            </p>

            {/* Perks grid */}
            <div className="mb-6 grid grid-cols-2 gap-2">
              {AI_PERKS.map(({ icon: Icon, label }) => (
                <div
                  key={label}
                  className="flex items-start gap-2 rounded-xl px-3 py-2.5"
                  style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}
                >
                  <span
                    className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
                    style={{ background: "linear-gradient(135deg,#a855f7,#ec4899)" }}
                  >
                    <Icon className="h-2.5 w-2.5 text-white" strokeWidth={2.5} />
                  </span>
                  <span className="text-[11.5px] leading-tight" style={{ color: "rgba(255,255,255,0.65)" }}>
                    {label}
                  </span>
                </div>
              ))}
            </div>

            {/* CTAs */}
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={() => { onClose(); navigate("/auth?mode=signup"); }}
              className="mb-2.5 w-full rounded-2xl py-3.5 text-[15px] font-bold text-white"
              style={{ background: "linear-gradient(135deg,#7c3aed,#a855f7,#ec4899)" }}
            >
              Create Free Account
            </motion.button>

            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={() => { onClose(); navigate("/auth"); }}
              className="mb-3 w-full rounded-2xl py-3.5 text-[15px] font-semibold"
              style={{
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.11)",
                color: "rgba(255,255,255,0.82)",
              }}
            >
              Log In
            </motion.button>

            <button
              onClick={onClose}
              className="w-full py-1.5 text-[13px]"
              style={{ color: "rgba(255,255,255,0.32)" }}
            >
              Continue Browsing
            </button>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
