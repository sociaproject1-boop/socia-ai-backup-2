/**
 * Auto-escalation workflow queue.
 * Shows pending escalations with approve / dismiss actions.
 * Auto-refreshes every 15 s and subscribes to live socket events.
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertOctagon, ShieldOff, UserX, Zap, RefreshCw,
  Check, X, Clock, ChevronDown, ChevronUp, Scan,
  TriangleAlert,
} from "lucide-react";
import { adminFetch } from "@/lib/adminAuth";
import type { LiveFraudEvent } from "@/lib/useAdminSocket";

/* ── Types ──────────────────────────────────────────────────────────── */
type EscType = "auto_freeze" | "auto_quarantine" | "auto_suspend" | "risk_escalation" | "velocity_alert" | "coordinated_attack";
type EscStatus = "pending" | "approved" | "dismissed";

interface Escalation {
  id:          string;
  type:        EscType;
  status:      EscStatus;
  userId?:     string;
  username?:   string;
  reason:      string;
  score:       number;
  evidence:    Record<string, unknown>;
  createdAt:   string;
  decidedAt?:  string;
  decidedBy?:  string;
}
interface QueueResponse {
  escalations: Escalation[];
  total: number; pending: number; approved: number; dismissed: number;
}
interface StatsResponse {
  total: number; pending: number; by_type: Record<string, number>;
  queue_full: boolean;
}

/* ── Helpers ─────────────────────────────────────────────────────────── */
const TYPE_META: Record<EscType, { icon: React.ReactNode; color: string; label: string }> = {
  auto_freeze:        { icon: <ShieldOff size={14} />,     color: "text-red-400 bg-red-500/10 border-red-500/30",     label: "Auto-Freeze" },
  auto_quarantine:    { icon: <AlertOctagon size={14} />,  color: "text-orange-400 bg-orange-500/10 border-orange-500/30", label: "Quarantine" },
  auto_suspend:       { icon: <UserX size={14} />,         color: "text-rose-400 bg-rose-500/10 border-rose-500/30",   label: "Suspend" },
  risk_escalation:    { icon: <TriangleAlert size={14} />, color: "text-yellow-400 bg-yellow-500/10 border-yellow-500/30", label: "Risk Escalation" },
  velocity_alert:     { icon: <Zap size={14} />,           color: "text-blue-400 bg-blue-500/10 border-blue-500/30",   label: "Velocity Alert" },
  coordinated_attack: { icon: <AlertOctagon size={14} />,  color: "text-purple-400 bg-purple-500/10 border-purple-500/30", label: "Coordinated Attack" },
};

function timeAgo(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1_000);
  if (s < 60)  return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s/60)}m ago`;
  return `${Math.floor(s/3600)}h ago`;
}

/* ── Stats bar ───────────────────────────────────────────────────────── */
function StatsBar({ stats, onScan, scanning }: { stats: StatsResponse; onScan: () => void; scanning: boolean }) {
  return (
    <div className="grid grid-cols-4 gap-3">
      {[
        { label: "Total",    val: stats.total,   color: "text-white" },
        { label: "Pending",  val: stats.pending,  color: "text-orange-400" },
        { label: "Auto-Freeze",    val: stats.by_type.auto_freeze    ?? 0, color: "text-red-400" },
        { label: "Velocity",       val: stats.by_type.velocity_alert ?? 0, color: "text-blue-400" },
      ].map((s) => (
        <div key={s.label} className="rounded-lg bg-[#0d1626] border border-white/5 p-3 text-center">
          <div className={`text-2xl font-bold ${s.color}`}>{s.val}</div>
          <div className="text-[10px] text-white/40 mt-0.5">{s.label}</div>
        </div>
      ))}
    </div>
  );
}

/* ── Escalation card ─────────────────────────────────────────────────── */
function EscCard({
  esc,
  onApprove,
  onDismiss,
  approving,
  dismissing,
}: {
  esc: Escalation;
  onApprove: (id: string) => void;
  onDismiss:  (id: string) => void;
  approving: string | null;
  dismissing: string | null;
}) {
  const [open, setOpen] = useState(false);
  const meta = TYPE_META[esc.type];

  return (
    <motion.div layout
      initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: 40 }} transition={{ duration: 0.2 }}
      className={`rounded-xl border overflow-hidden ${
        esc.status === "approved" ? "border-emerald-500/20 bg-emerald-500/5"
        : esc.status === "dismissed" ? "border-white/5 bg-white/5 opacity-50"
        : "border-white/8 bg-[#0d1626]"
      }`}>
      <div className="flex items-start gap-3 p-4">
        {/* Icon */}
        <div className={`flex-shrink-0 p-2 rounded-lg border ${meta.color}`}>
          {meta.icon}
        </div>

        {/* Body */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-xs font-semibold px-2 py-0.5 rounded border ${meta.color}`}>{meta.label}</span>
            <span className="text-xs font-bold text-red-400">Score {esc.score}</span>
            {esc.status !== "pending" && (
              <span className={`text-xs px-2 py-0.5 rounded ${esc.status === "approved" ? "bg-emerald-500/20 text-emerald-400" : "bg-white/5 text-white/40"}`}>
                {esc.status}
              </span>
            )}
          </div>
          <p className="text-sm text-white/80 mt-1">{esc.reason}</p>
          {esc.userId && (
            <p className="text-[10px] font-mono text-white/40 mt-0.5">
              {esc.username ? `@${esc.username} · ` : ""}{esc.userId}
            </p>
          )}
          <div className="flex items-center gap-3 mt-1.5">
            <span className="text-[10px] text-white/30 flex items-center gap-1">
              <Clock size={9} /> {timeAgo(esc.createdAt)}
            </span>
            {esc.decidedBy && (
              <span className="text-[10px] text-white/30">decided by {esc.decidedBy}</span>
            )}
            <button
              onClick={() => setOpen((o) => !o)}
              className="text-[10px] text-indigo-400/70 hover:text-indigo-300 flex items-center gap-0.5">
              Evidence {open ? <ChevronUp size={9} /> : <ChevronDown size={9} />}
            </button>
          </div>
        </div>

        {/* Actions */}
        {esc.status === "pending" && (
          <div className="flex flex-col gap-1.5 flex-shrink-0">
            <button
              onClick={() => onApprove(esc.id)}
              disabled={!!approving || !!dismissing}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600/80 hover:bg-emerald-600 disabled:opacity-40 text-xs font-semibold text-white">
              {approving === esc.id ? <RefreshCw size={11} className="animate-spin" /> : <Check size={11} />}
              Approve
            </button>
            <button
              onClick={() => onDismiss(esc.id)}
              disabled={!!approving || !!dismissing}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 disabled:opacity-40 text-xs text-white/60">
              {dismissing === esc.id ? <RefreshCw size={11} className="animate-spin" /> : <X size={11} />}
              Dismiss
            </button>
          </div>
        )}
      </div>

      {/* Evidence drawer */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.15 }}
            className="border-t border-white/5 px-4 pb-3">
            <pre className="mt-2 text-[10px] text-white/50 bg-white/5 rounded p-2 overflow-x-auto">
              {JSON.stringify(esc.evidence, null, 2)}
            </pre>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/* ── Main component ─────────────────────────────────────────────────── */
export default function EscalationQueue({ liveEvents }: { liveEvents?: LiveFraudEvent[] }) {
  const [filter, setFilter]   = useState<"pending" | "approved" | "dismissed" | "all">("pending");
  const [items, setItems]     = useState<Escalation[]>([]);
  const [stats, setStats]     = useState<StatsResponse>({ total: 0, pending: 0, by_type: {}, queue_full: false });
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [approving, setApproving] = useState<string | null>(null);
  const [dismissing, setDismissing] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [queue, st] = await Promise.allSettled([
      adminFetch<QueueResponse>(`/admin/escalations?status=${filter}&limit=30`),
      adminFetch<StatsResponse>("/admin/escalations/stats"),
    ]);
    if (queue.status === "fulfilled") setItems(queue.value.escalations ?? []);
    if (st.status === "fulfilled") setStats(st.value);
    setLoading(false);
  }, [filter]);

  useEffect(() => {
    void load();
    timerRef.current = setInterval(() => void load(), 15_000);
    return () => clearInterval(timerRef.current ?? undefined);
  }, [load]);

  /* Re-load when a new live critical event arrives */
  const prevLiveLen = useRef(0);
  useEffect(() => {
    if (!liveEvents) return;
    const criticals = liveEvents.filter((e) => e.severity === "critical").length;
    if (criticals > prevLiveLen.current) { void load(); }
    prevLiveLen.current = criticals;
  }, [liveEvents, load]);

  const handleScan = useCallback(async () => {
    setScanning(true);
    try {
      await adminFetch<unknown>("/admin/escalations/scan", { method: "POST" });
      await load();
    } finally {
      setScanning(false);
    }
  }, [load]);

  const handleApprove = useCallback(async (id: string) => {
    setApproving(id);
    try {
      await adminFetch<unknown>(`/admin/escalations/${id}/approve`, { method: "POST" });
      await load();
    } finally {
      setApproving(null);
    }
  }, [load]);

  const handleDismiss = useCallback(async (id: string) => {
    setDismissing(id);
    try {
      await adminFetch<unknown>(`/admin/escalations/${id}/dismiss`, { method: "POST" });
      await load();
    } finally {
      setDismissing(null);
    }
  }, [load]);

  const FILTERS = [
    { val: "pending" as const,   label: "Pending",   count: stats.pending },
    { val: "approved" as const,  label: "Approved",  count: stats.total - stats.pending },
    { val: "dismissed" as const, label: "Dismissed", count: 0 },
    { val: "all" as const,       label: "All",        count: stats.total },
  ];

  return (
    <div className="h-full flex flex-col gap-4 min-h-0">
      {/* Header */}
      <div className="flex items-center justify-between flex-shrink-0">
        <div>
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            Escalation Queue
            {stats.pending > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-red-500 text-[10px] font-bold text-white">
                {stats.pending}
              </span>
            )}
          </h2>
          <p className="text-xs text-white/40 mt-0.5">Auto-generated from fraud detection rules</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => void handleScan()}
            disabled={scanning}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-indigo-600/80 hover:bg-indigo-600 text-xs font-medium text-white disabled:opacity-40">
            <Scan size={13} className={scanning ? "animate-pulse" : ""} />
            {scanning ? "Scanning…" : "Run Scan"}
          </button>
          <button
            onClick={() => void load()}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs text-white/60 disabled:opacity-40">
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="flex-shrink-0">
        <StatsBar stats={stats} onScan={handleScan} scanning={scanning} />
      </div>

      {/* Filter pills */}
      <div className="flex gap-1 flex-shrink-0">
        {FILTERS.map((f) => (
          <button key={f.val}
            onClick={() => setFilter(f.val)}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium transition-all ${
              filter === f.val ? "bg-white/10 text-white" : "text-white/40 hover:text-white/60"
            }`}>
            {f.label}
            {f.count > 0 && (
              <span className={`px-1.5 rounded-full text-[9px] font-bold ${
                f.val === "pending" ? "bg-orange-500 text-white" : "bg-white/10 text-white/60"
              }`}>{f.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* Queue */}
      <div className="flex-1 overflow-y-auto scrollbar-thin min-h-0 space-y-2">
        {loading && !items.length
          ? <div className="flex items-center justify-center py-20">
              <RefreshCw size={20} className="animate-spin text-white/20" />
            </div>
          : !items.length
            ? <div className="flex flex-col items-center justify-center py-20 gap-3">
                <ShieldOff size={32} className="text-white/10" />
                <p className="text-sm text-white/30">
                  {filter === "pending" ? "No pending escalations — queue is clear" : "No escalations found"}
                </p>
              </div>
            : (
              <AnimatePresence mode="popLayout">
                {items.map((esc) => (
                  <EscCard key={esc.id} esc={esc}
                    onApprove={() => void handleApprove(esc.id)}
                    onDismiss={() => void handleDismiss(esc.id)}
                    approving={approving}
                    dismissing={dismissing}
                  />
                ))}
              </AnimatePresence>
            )
        }
      </div>
    </div>
  );
}
