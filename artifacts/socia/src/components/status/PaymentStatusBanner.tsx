/**
 * PaymentStatusBanner — realtime notice shown to users when PayMongo is under
 * maintenance, in an outage, or degraded. Driven entirely by useSystemStatus
 * (REST + Socket.IO). Renders nothing when payments are healthy.
 *
 * Pure presentation — it never blocks anything itself; checkout gating is done
 * by the host page reading the same hook.
 */
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, Wrench, Activity } from "lucide-react";
import { statusColor, type StatusLevel } from "@/lib/systemStatus";

interface Props {
  status: StatusLevel;
  message: string;
}

export default function PaymentStatusBanner({ status, message }: Props) {
  const show = status === "MAINTENANCE" || status === "OUTAGE" || status === "DEGRADED";
  const c = statusColor(status);

  const Icon = status === "MAINTENANCE" ? Wrench : status === "DEGRADED" ? Activity : AlertTriangle;
  const heading =
    status === "MAINTENANCE" ? "Payments under maintenance"
    : status === "OUTAGE" ? "Payments temporarily unavailable"
    : "Payments may be slower than usual";

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, y: -6, height: 0 }}
          animate={{ opacity: 1, y: 0, height: "auto" }}
          exit={{ opacity: 0, y: -6, height: 0 }}
          className="mb-4 overflow-hidden rounded-2xl border px-4 py-3"
          style={{ background: c.bg, borderColor: c.border }}
          role="status"
          aria-live="polite"
        >
          <div className="flex items-start gap-3">
            <span
              className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full"
              style={{ background: "rgba(0,0,0,0.25)" }}
            >
              <Icon className="h-4 w-4" style={{ color: c.dot }} />
            </span>
            <div className="min-w-0">
              <div className="text-sm font-bold" style={{ color: c.text }}>
                {heading}
              </div>
              <div className="mt-0.5 text-xs app-text-muted">
                {message || "Please try again shortly. Your access and credits are unaffected."}
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
