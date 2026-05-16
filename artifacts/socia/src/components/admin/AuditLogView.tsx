/**
 * AuditLogView — enterprise audit trail with live events + DB history.
 *
 * Three columns of data:
 *  - Live tab: real-time socket events (in-memory)
 *  - History tab: admin_audit_log DB records
 *  - Security tab: login events + IP listing
 */
import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Activity, Download, RefreshCw, Filter, ShieldCheck,
  AlertTriangle, User, Lock, FileText, Zap, Eye,
  CheckCircle, XCircle, Clock, Search,
} from "lucide-react";
import { adminFetchAuditLog } from "../../lib/adminAuth";
import type { LiveFraudEvent, ReviewerPresence } from "../../lib/useAdminSocket";

/* ── Types ────────────────────────────────────────────────────────────── */

interface DbAuditEntry {
  id?:          string;
  admin_id?:    string;
  username?:    string;
  action:       string;
  target_type?: string;
  target_id?:   string;
  meta?:        Record<string, unknown>;
  ip?:          string;
  user_agent?:  string;
  created_at?:  string;
  /* live-event fields (in-memory fallback) */
  ts?:          string;
  severity?:    string;
  message?:     string;
  type?:        string;
}

/* ── Helpers ──────────────────────────────────────────────────────────── */

function relativeTime(iso?: string): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000)    return `${Math.floor(diff / 1_000)}s ago`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return new Date(iso).toLocaleDateString();
}

function actionIcon(action: string) {
  if (action.includes("login"))    return Lock;
  if (action.includes("approve"))  return CheckCircle;
  if (action.includes("reject"))   return XCircle;
  if (action.includes("fraud"))    return AlertTriangle;
  if (action.includes("refund"))   return FileText;
  if (action.includes("user"))     return User;
  if (action.includes("view"))     return Eye;
  return Activity;
}

function actionColor(action: string): string {
  if (action.includes("approve"))  return "text-emerald-400";
  if (action.includes("reject"))   return "text-red-400";
  if (action.includes("fraud"))    return "text-orange-400";
  if (action.includes("login"))    return "text-blue-400";
  return "text-white/50";
}

const ACTION_OPTIONS = [
  "all", "login", "approve", "reject", "fraud", "refund", "view", "system",
];

/* ── Live event row ───────────────────────────────────────────────────── */

function LiveRow({ event }: { event: LiveFraudEvent }) {
  const sev = event.severity;
  const sevColor =
    sev === "critical" ? "text-red-400" :
    sev === "high"     ? "text-orange-400" :
    sev === "medium"   ? "text-amber-400" :
    sev === "low"      ? "text-blue-400" :
    "text-white/30";

  return (
    <motion.tr
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1,  y: 0  }}
      className="group border-b border-white/[0.03] hover:bg-white/[0.015]"
    >
      <td className="px-4 py-2.5">
        <span className="font-mono text-[9px] text-white/25">
          {new Date(event.ts).toLocaleTimeString()}
        </span>
      </td>
      <td className="px-4 py-2.5">
        <span className={`text-[10px] font-bold uppercase ${sevColor}`}>
          {sev}
        </span>
      </td>
      <td className="px-4 py-2.5">
        <span className="text-[11px] text-white/60">{event.adminUsername ?? event.username ?? "—"}</span>
      </td>
      <td className="px-4 py-2.5 max-w-[260px]">
        <p className="truncate text-[11px] text-white/80">{event.message}</p>
      </td>
      <td className="px-4 py-2.5">
        {event.score !== undefined && (
          <span className="font-mono text-[10px] text-white/40">{event.score}pts</span>
        )}
      </td>
    </motion.tr>
  );
}

/* ── DB entry row ─────────────────────────────────────────────────────── */

function DbRow({ entry }: { entry: DbAuditEntry }) {
  const Icon  = actionIcon(entry.action ?? entry.type ?? "");
  const color = actionColor(entry.action ?? entry.type ?? "");
  const ts    = entry.created_at ?? entry.ts;

  return (
    <tr className="group border-b border-white/[0.03] hover:bg-white/[0.015]">
      <td className="px-4 py-2.5">
        <span className="font-mono text-[9px] text-white/25">
          {ts ? new Date(ts).toLocaleString() : "—"}
        </span>
      </td>
      <td className="px-4 py-2.5">
        <div className="flex items-center gap-1.5">
          <Icon className={`h-3 w-3 ${color}`} />
          <span className={`text-[10px] font-semibold ${color}`}>
            {entry.action ?? entry.type ?? "—"}
          </span>
        </div>
      </td>
      <td className="px-4 py-2.5">
        <span className="text-[11px] text-white/60">
          {entry.username ?? "system"}
        </span>
      </td>
      <td className="px-4 py-2.5">
        <span className="text-[11px] text-white/40">
          {entry.target_type ? `${entry.target_type}` : "—"}
          {entry.target_id   ? ` · ${String(entry.target_id).slice(0, 8)}…` : ""}
          {entry.message     ? entry.message : ""}
        </span>
      </td>
      <td className="px-4 py-2.5">
        <span className="font-mono text-[9px] text-white/20">{entry.ip ?? "—"}</span>
      </td>
    </tr>
  );
}

/* ── Stats bar ────────────────────────────────────────────────────────── */

function StatPill({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-xl border border-white/[0.06] bg-[#0d1628] px-4 py-3">
      <span className={`text-lg font-black ${color}`}>{value.toLocaleString()}</span>
      <span className="text-[9px] font-semibold uppercase tracking-wider text-white/30">{label}</span>
    </div>
  );
}

/* ── Main view ────────────────────────────────────────────────────────── */

export default function AuditLogView({
  liveEvents,
  reviewers,
  isConnected,
}: {
  liveEvents:  LiveFraudEvent[];
  reviewers:   ReviewerPresence[];
  isConnected: boolean;
}) {
  const [tab,        setTab]       = useState<"live" | "history" | "security">("live");
  const [dbEntries,  setDbEntries] = useState<DbAuditEntry[]>([]);
  const [total,      setTotal]     = useState(0);
  const [loading,    setLoading]   = useState(false);
  const [error,      setError]     = useState("");
  const [actionFilter, setActionFilter] = useState("all");
  const [search,     setSearch]    = useState("");
  const [stats,      setStats]     = useState({ total: 0, logins: 0, fraud: 0 });

  const loadHistory = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const action = actionFilter !== "all" ? actionFilter : undefined;
      const result = await adminFetchAuditLog({ limit: 200, action });
      setDbEntries((result.entries ?? []) as DbAuditEntry[]);
      setTotal(result.total ?? 0);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [actionFilter]);

  const loadStats = useCallback(async () => {
    try {
      const result = await adminFetchAuditLog({ stats: true });
      setStats({ total: result.total ?? 0, logins: result.logins ?? 0, fraud: result.fraud ?? 0 });
    } catch { /* silently ignore */ }
  }, []);

  useEffect(() => {
    if (tab === "history" || tab === "security") {
      void loadHistory();
    }
    void loadStats();
  }, [tab, loadHistory, loadStats]);

  /* Export audit log */
  function exportJson() {
    const data = tab === "live" ? liveEvents : dbEntries;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  /* Filter live events */
  const filteredLive = liveEvents.filter((e) => {
    if (search && !e.message.toLowerCase().includes(search.toLowerCase()) &&
        !(e.username ?? "").toLowerCase().includes(search.toLowerCase())) return false;
    if (actionFilter !== "all" && !e.type.includes(actionFilter) && !e.message.toLowerCase().includes(actionFilter)) return false;
    return true;
  });

  const filteredDb = dbEntries.filter((e) => {
    if (!search) return true;
    return (
      (e.action ?? "").toLowerCase().includes(search.toLowerCase()) ||
      (e.username ?? "").toLowerCase().includes(search.toLowerCase()) ||
      (e.target_id ?? "").toLowerCase().includes(search.toLowerCase())
    );
  });

  const securityEvents = dbEntries.filter((e) =>
    (e.action ?? "").includes("login") ||
    (e.type ?? "").includes("login") ||
    (e.action ?? "").includes("auth")
  );

  return (
    <div className="space-y-5">
      {/* Command bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-purple-400" />
          <div>
            <h2 className="text-base font-black text-white">Audit Trail</h2>
            <p className="text-[11px] text-white/30">
              {isConnected ? (
                <span className="flex items-center gap-1">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
                  Live · {reviewers.length} reviewer{reviewers.length !== 1 ? "s" : ""} online
                </span>
              ) : "Connecting…"}
            </p>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <div className="flex items-center gap-1.5 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2">
            <Search className="h-3.5 w-3.5 text-white/30" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search events…"
              className="w-32 bg-transparent text-[11px] text-white placeholder-white/20 outline-none"
            />
          </div>
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="rounded-xl border border-white/[0.06] bg-[#0b1220] px-3 py-2 text-[11px] text-white/60 outline-none"
          >
            {ACTION_OPTIONS.map((a) => (
              <option key={a} value={a}>{a === "all" ? "All actions" : a}</option>
            ))}
          </select>
          <button
            onClick={() => void loadHistory()}
            className="flex items-center gap-1.5 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-[11px] text-white/50 hover:text-white/80"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
          <button
            onClick={exportJson}
            className="flex items-center gap-1.5 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-[11px] text-white/50 hover:text-white/80"
          >
            <Download className="h-3.5 w-3.5" />
            Export
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
        <StatPill label="Total Events"   value={total || liveEvents.length} color="text-white" />
        <StatPill label="Live Now"       value={liveEvents.length}          color="text-emerald-400" />
        <StatPill label="Admin Logins"   value={stats.logins}               color="text-blue-400" />
        <StatPill label="Fraud Flags"    value={stats.fraud}                color="text-red-400" />
        <StatPill label="Critical"       value={liveEvents.filter((e) => e.severity === "critical").length} color="text-red-400" />
        <StatPill label="Reviewers"      value={reviewers.length}           color="text-purple-400" />
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 rounded-xl border border-white/[0.06] bg-[#080e1a] p-1">
        {([
          ["live",     "Live Stream",    Activity],
          ["history",  "DB History",     Clock],
          ["security", "Security Events",ShieldCheck],
        ] as const).map(([t, label, Icon]) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold transition-all ${
              tab === t
                ? "bg-white/[0.07] text-white shadow"
                : "text-white/35 hover:text-white/60"
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="rounded-2xl border border-white/[0.06] bg-[#0b1220]">
        <div className="overflow-x-auto">
          <table className="min-w-[700px] w-full text-xs">
            <thead className="sticky top-0 z-10 bg-[#0b1220]">
              <tr className="border-b border-white/[0.06]">
                {tab === "live" ? (
                  <>
                    <th className="px-4 py-3 text-left text-[9px] font-bold uppercase tracking-widest text-white/25">Time</th>
                    <th className="px-4 py-3 text-left text-[9px] font-bold uppercase tracking-widest text-white/25">Severity</th>
                    <th className="px-4 py-3 text-left text-[9px] font-bold uppercase tracking-widest text-white/25">Actor</th>
                    <th className="px-4 py-3 text-left text-[9px] font-bold uppercase tracking-widest text-white/25">Event</th>
                    <th className="px-4 py-3 text-left text-[9px] font-bold uppercase tracking-widest text-white/25">Score</th>
                  </>
                ) : (
                  <>
                    <th className="px-4 py-3 text-left text-[9px] font-bold uppercase tracking-widest text-white/25">Timestamp</th>
                    <th className="px-4 py-3 text-left text-[9px] font-bold uppercase tracking-widest text-white/25">Action</th>
                    <th className="px-4 py-3 text-left text-[9px] font-bold uppercase tracking-widest text-white/25">Admin</th>
                    <th className="px-4 py-3 text-left text-[9px] font-bold uppercase tracking-widest text-white/25">Target</th>
                    <th className="px-4 py-3 text-left text-[9px] font-bold uppercase tracking-widest text-white/25">IP</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              <AnimatePresence initial={false}>
                {tab === "live" ? (
                  filteredLive.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-12 text-center text-xs text-white/25">
                        {isConnected ? "No events yet" : "Connecting to live stream…"}
                      </td>
                    </tr>
                  ) : (
                    filteredLive.map((e) => <LiveRow key={e.id} event={e} />)
                  )
                ) : tab === "security" ? (
                  securityEvents.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-12 text-center text-xs text-white/25">
                        {loading ? "Loading…" : "No security events"}
                      </td>
                    </tr>
                  ) : (
                    securityEvents.map((e, i) => <DbRow key={e.id ?? i} entry={e} />)
                  )
                ) : (
                  filteredDb.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-12 text-center text-xs text-white/25">
                        {loading ? (
                          <span className="flex items-center justify-center gap-2">
                            <Filter className="h-4 w-4 animate-spin" /> Loading…
                          </span>
                        ) : error ? (
                          <span className="text-red-400">{error}</span>
                        ) : "No history records"}
                      </td>
                    </tr>
                  ) : (
                    filteredDb.map((e, i) => <DbRow key={e.id ?? i} entry={e} />)
                  )
                )}
              </AnimatePresence>
            </tbody>
          </table>
        </div>
        {tab !== "live" && total > filteredDb.length && (
          <div className="border-t border-white/[0.04] px-4 py-2 text-[10px] text-white/30">
            Showing {filteredDb.length} of {total} entries
          </div>
        )}
      </div>

      {/* Active reviewers panel */}
      {reviewers.length > 0 && (
        <div className="rounded-2xl border border-white/[0.06] bg-[#0b1220] p-5">
          <p className="mb-3 text-[11px] font-bold uppercase tracking-wider text-white/30">
            Active Reviewers
          </p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {reviewers.map((r) => (
              <div key={r.socketId} className="flex items-center gap-2.5 rounded-xl border border-emerald-500/15 bg-emerald-500/5 p-3">
                <div className="grid h-8 w-8 place-items-center rounded-lg bg-emerald-500/20 text-[10px] font-black text-emerald-400">
                  {r.username.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[11px] font-semibold text-white/80">{r.username}</p>
                  <p className="truncate text-[9px] text-white/30">
                    {r.currentView ?? "browsing"} · {relativeTime(r.connectedAt)}
                  </p>
                </div>
                <span className="h-2 w-2 flex-shrink-0 rounded-full bg-emerald-500" />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
