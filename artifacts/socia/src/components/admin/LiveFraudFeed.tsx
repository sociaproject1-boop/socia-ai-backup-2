/**
 * LiveFraudFeed — real-time scrolling fraud event panel.
 * Sits as a right-column sidebar on the Dashboard view.
 */
import { useEffect, useRef, memo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ShieldAlert, AlertOctagon, Copy, Fingerprint, Bot,
  User, Lock, Zap, Info, CheckCircle, ChevronRight,
} from "lucide-react";
import type { LiveFraudEvent, ReviewerPresence } from "../../lib/useAdminSocket";

/* ── Severity helpers ─────────────────────────────────────────────────── */

const SEV_CONFIG = {
  critical: {
    bg:   "bg-red-500/10",
    border: "border-red-500/25",
    text: "text-red-400",
    dot:  "bg-red-500",
    label: "CRITICAL",
  },
  high: {
    bg:   "bg-orange-500/10",
    border: "border-orange-500/20",
    text: "text-orange-400",
    dot:  "bg-orange-500",
    label: "HIGH",
  },
  medium: {
    bg:   "bg-amber-500/10",
    border: "border-amber-500/20",
    text: "text-amber-400",
    dot:  "bg-amber-500",
    label: "MED",
  },
  low: {
    bg:   "bg-blue-500/10",
    border: "border-blue-500/15",
    text: "text-blue-400",
    dot:  "bg-blue-500",
    label: "LOW",
  },
  info: {
    bg:   "bg-white/[0.03]",
    border: "border-white/[0.06]",
    text: "text-white/40",
    dot:  "bg-white/30",
    label: "INFO",
  },
} as const;

function typeIcon(type: string) {
  if (type.includes("tamper"))    return AlertOctagon;
  if (type.includes("duplicate")) return Copy;
  if (type.includes("fraud"))     return ShieldAlert;
  if (type.includes("login"))     return Lock;
  if (type.includes("refund"))    return ChevronRight;
  if (type.includes("ai"))        return Bot;
  if (type.includes("finger"))    return Fingerprint;
  if (type.includes("admin"))     return User;
  if (type.includes("system"))    return Zap;
  if (type.includes("suspicious"))return AlertOctagon;
  return Info;
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000)  return `${Math.floor(diff / 1_000)}s ago`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  return `${Math.floor(diff / 3_600_000)}h ago`;
}

/* ── Event row ────────────────────────────────────────────────────────── */

const FeedRow = memo(function FeedRow({ event }: { event: LiveFraudEvent }) {
  const sev  = SEV_CONFIG[event.severity] ?? SEV_CONFIG.info;
  const Icon = typeIcon(event.type);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 20, scale: 0.97 }}
      animate={{ opacity: 1, x: 0,  scale: 1     }}
      exit={{    opacity: 0, x: 20, scale: 0.97  }}
      transition={{ duration: 0.18, ease: "easeOut" }}
      className={`flex gap-2.5 rounded-xl border p-2.5 ${sev.bg} ${sev.border}`}
    >
      <div className={`mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-lg ${sev.bg}`}>
        <Icon className={`h-3.5 w-3.5 ${sev.text}`} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className={`rounded px-1 py-px text-[8px] font-black tracking-widest ${sev.text} ${sev.bg}`}>
            {sev.label}
          </span>
          {event.score !== undefined && (
            <span className="font-mono text-[9px] text-white/30">
              {event.score}pts
            </span>
          )}
          <span className="ml-auto flex-shrink-0 font-mono text-[9px] text-white/20">
            {relativeTime(event.ts)}
          </span>
        </div>
        <p className="mt-0.5 text-[11px] font-medium leading-snug text-white/70">
          {event.message}
        </p>
        {(event.username || event.reference) && (
          <p className="mt-0.5 truncate font-mono text-[9px] text-white/30">
            {event.username && `@${event.username}`}
            {event.username && event.reference && "  "}
            {event.reference}
          </p>
        )}
      </div>
    </motion.div>
  );
});

/* ── Reviewer dot ─────────────────────────────────────────────────────── */

function ReviewerDot({ reviewer }: { reviewer: ReviewerPresence }) {
  return (
    <div title={`${reviewer.username} · ${reviewer.currentView ?? "browsing"}`}
         className="flex h-6 w-6 items-center justify-center rounded-full border border-emerald-500/30 bg-emerald-500/10 text-[9px] font-black text-emerald-400">
      {reviewer.username.charAt(0).toUpperCase()}
    </div>
  );
}

/* ── Main component ───────────────────────────────────────────────────── */

export default function LiveFraudFeed({
  events,
  reviewers,
  isConnected,
}: {
  events:      LiveFraudEvent[];
  reviewers:   ReviewerPresence[];
  isConnected: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  /* Auto-scroll to top when new events arrive */
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, [events.length]);

  const critCount = events.filter((e) => e.severity === "critical").length;
  const highCount = events.filter((e) => e.severity === "high").length;

  return (
    <div className="flex w-72 flex-shrink-0 flex-col rounded-2xl border border-white/[0.06] bg-[#0b1220] xl:w-80">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="relative flex h-2 w-2">
            {isConnected ? (
              <>
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
              </>
            ) : (
              <span className="h-2 w-2 rounded-full bg-white/20" />
            )}
          </div>
          <span className="text-[10px] font-black tracking-widest text-white/70">
            LIVE FEED
          </span>
          {events.length > 0 && (
            <span className="rounded-full bg-white/5 px-1.5 py-px text-[9px] font-bold text-white/40">
              {events.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {critCount > 0 && (
            <span className="rounded-full bg-red-500/15 px-1.5 py-px text-[9px] font-bold text-red-400">
              {critCount} CRIT
            </span>
          )}
          {highCount > 0 && (
            <span className="rounded-full bg-orange-500/15 px-1.5 py-px text-[9px] font-bold text-orange-400">
              {highCount} HIGH
            </span>
          )}
        </div>
      </div>

      {/* Active reviewers */}
      {reviewers.length > 0 && (
        <div className="flex items-center gap-2 border-b border-white/[0.04] px-4 py-2">
          <span className="text-[9px] text-white/25">Online</span>
          <div className="flex gap-1">
            {reviewers.slice(0, 6).map((r) => (
              <ReviewerDot key={r.socketId} reviewer={r} />
            ))}
            {reviewers.length > 6 && (
              <span className="text-[9px] text-white/25">+{reviewers.length - 6}</span>
            )}
          </div>
        </div>
      )}

      {/* Events */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 scrollbar-none">
        {events.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
            <CheckCircle className="h-8 w-8 text-white/10" />
            <p className="text-[11px] text-white/25">
              {isConnected ? "No alerts — all clear" : "Connecting…"}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <AnimatePresence initial={false} mode="popLayout">
              {events.map((e) => (
                <FeedRow key={e.id} event={e} />
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-white/[0.04] px-4 py-2">
        <p className="text-[9px] text-white/20">
          {isConnected ? "WebSocket connected · live updates" : "Reconnecting…"}
        </p>
      </div>
    </div>
  );
}
