/**
 * PayMongo cancellation redirect.
 * URL: /billing/cancelled?ref=<paymongo_payments.id>
 */
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { XCircle } from "lucide-react";

export default function BillingCancelled() {
  const [, navigate] = useLocation();

  return (
    <div className="app-bg min-h-[100dvh] flex items-center justify-center px-4 py-10">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="card-premium w-full max-w-sm rounded-3xl p-6 text-center"
      >
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full" style={{ background: "rgba(148,163,184,0.15)" }}>
          <XCircle className="h-7 w-7 app-text" />
        </div>
        <h1 className="text-xl font-black app-text">Payment cancelled</h1>
        <p className="mt-2 text-sm app-text-muted">You weren't charged. You can try again any time.</p>
        <div className="mt-5 flex flex-col gap-2">
          <button
            onClick={() => navigate("/billing/upgrade")}
            className="rounded-2xl py-3 text-sm font-bold text-white"
            style={{ background: "linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))", boxShadow: "0 12px 32px -10px rgba(168,85,247,0.45)" }}
          >
            Choose a plan again
          </button>
          <button
            onClick={() => navigate("/")}
            className="rounded-2xl py-3 text-sm font-bold app-surface app-text"
          >
            Back to home
          </button>
        </div>
      </motion.div>
    </div>
  );
}
