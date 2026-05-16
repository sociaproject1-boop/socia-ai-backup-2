/**
 * FraudToastProvider — non-blocking toast alerts for critical/high fraud events.
 * Renders in the bottom-right corner. Max 4 visible, auto-dismisses in 5 s.
 */
import { useEffect, useRef, useState, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X, ShieldAlert, AlertOctagon, AlertTriangle, Info } from "lucide-react";
import type { LiveFraudEvent } from "../../lib/useAdminSocket";

/* ── Toast config ─────────────────────────────────────────────────────── */

const TOAST_TTL = 5_000; // ms
const MAX_TOASTS = 4;

interface Toast extends LiveFraudEvent {
  toastId: string;
}

const SEV = {
  critical: { bg: "bg-[#1a0a0a] border-red-500/40",    icon: AlertOctagon,  iconCls: "text-red-500",    bar: "bg-red-500"    },
  high:     { bg: "bg-[#130d07] border-orange-500/35",  icon: ShieldAlert,   iconCls: "text-orange-400", bar: "bg-orange-500" },
  medium:   { bg: "bg-[#12100a] border-amber-500/30",   icon: AlertTriangle, iconCls: "text-amber-400",  bar: "bg-amber-500"  },
  low:      { bg: "bg-[#090f18] border-blue-500/25",    icon: Info,          iconCls: "text-blue-400",   bar: "bg-blue-500"   },
  info:     { bg: "bg-[#0b1220] border-white/[0.08]",   icon: Info,          iconCls: "text-white/40",   bar: "bg-white/20"   },
} as const;

/* ── Individual toast ─────────────────────────────────────────────────── */

function ToastItem({
  toast,
  onDismiss,
}: {
  toast:     Toast;
  onDismiss: (id: string) => void;
}) {
  const progressRef = useRef<HTMLDivElement>(null);
  const cfg = SEV[toast.severity] ?? SEV.info;
  const Icon = cfg.icon;

  /* Animate progress bar */
  useEffect(() => {
    const el = progressRef.current;
    if (!el) return;
    const anim = el.animate(
      [{ width: "100%" }, { width: "0%" }],
      { duration: TOAST_TTL, easing: "linear", fill: "forwards" },
    );
    const t = setTimeout(() => onDismiss(toast.toastId), TOAST_TTL);
    return () => { anim.cancel(); clearTimeout(t); };
  }, [toast.toastId, onDismiss]);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0,  scale: 1    }}
      exit={{    opacity: 0, y: 10, scale: 0.95, transition: { duration: 0.15 } }}
      className={`relative w-80 overflow-hidden rounded-xl border shadow-2xl ${cfg.bg}`}
    >
      {/* Progress bar */}
      <div className="absolute top-0 left-0 h-[2px] w-full bg-white/5">
        <div ref={progressRef} className={`h-full ${cfg.bar} opacity-60`} />
      </div>

      <div className="flex gap-3 p-3.5 pt-4">
        <div className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-white/5`}>
          <Icon className={`h-4 w-4 ${cfg.iconCls}`} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className={`rounded px-1 py-px text-[8px] font-black tracking-widest ${cfg.iconCls}`}>
              {toast.severity.toUpperCase()}
            </span>
            {toast.score !== undefined && (
              <span className="font-mono text-[9px] text-white/30">{toast.score}pts</span>
            )}
          </div>
          <p className="mt-0.5 text-[12px] font-semibold text-white/85">
            {toast.message}
          </p>
          {toast.username && (
            <p className="mt-0.5 font-mono text-[9px] text-white/30">@{toast.username}</p>
          )}
        </div>
        <button
          onClick={() => onDismiss(toast.toastId)}
          className="flex-shrink-0 rounded-lg p-1 text-white/20 hover:bg-white/5 hover:text-white/50"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </motion.div>
  );
}

/* ── Provider ─────────────────────────────────────────────────────────── */

export default function FraudToastProvider({
  liveEvents,
}: {
  liveEvents: LiveFraudEvent[];
}) {
  const [toasts, setToasts]  = useState<Toast[]>([]);
  const seenRef = useRef<Set<string>>(new Set());

  /* Watch for new critical/high events */
  useEffect(() => {
    if (liveEvents.length === 0) return;
    const latest = liveEvents[0];
    if (!latest) return;
    if (seenRef.current.has(latest.id)) return;
    if (latest.severity === "info" || latest.severity === "low") return;

    seenRef.current.add(latest.id);
    const toast: Toast = { ...latest, toastId: `toast-${latest.id}` };
    setToasts((prev) => [toast, ...prev].slice(0, MAX_TOASTS));
  }, [liveEvents]);

  const dismiss = useCallback((toastId: string) => {
    setToasts((prev) => prev.filter((t) => t.toastId !== toastId));
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-5 right-5 z-[9999] flex flex-col gap-2">
      <AnimatePresence mode="popLayout">
        {toasts.map((toast) => (
          <ToastItem key={toast.toastId} toast={toast} onDismiss={dismiss} />
        ))}
      </AnimatePresence>
    </div>
  );
}
