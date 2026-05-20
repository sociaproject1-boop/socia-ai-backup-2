/**
 * Community-support cancelled-back page.
 * URL: /support/cancelled?ref=<community_support.id>
 */
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { Heart, XCircle } from "lucide-react";

export default function SupportCancelled() {
  const [, navigate] = useLocation();
  return (
    <div className="min-h-[100dvh] w-full flex items-center justify-center px-5 py-8 app-bg">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="w-full max-w-md rounded-[28px] p-7 text-center"
        style={{
          background: "linear-gradient(180deg,#11111f,#0d0d1a)",
          border: "1px solid rgba(168,85,247,0.22)",
        }}
      >
        <div className="mx-auto mb-5 grid h-16 w-16 place-items-center rounded-full"
             style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}>
          <XCircle className="h-7 w-7 text-white/55" />
        </div>
        <h1 className="font-display text-[20px] font-black text-white">
          Contribution cancelled
        </h1>
        <p className="mt-2 mb-5 text-[12px] leading-relaxed text-white/55">
          No charge was made. You can return anytime and support Socia from the home screen.
        </p>
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={() => navigate("/")}
          className="w-full rounded-2xl py-3 text-sm font-bold text-white"
          style={{
            background: "linear-gradient(135deg,#a855f7,#ec4899)",
            boxShadow: "0 10px 24px -8px rgba(168,85,247,0.55)",
          }}
        >
          <Heart className="mr-1.5 inline h-4 w-4" /> Back to Socia
        </motion.button>
      </motion.div>
    </div>
  );
}
