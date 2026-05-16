/**
 * Cross-account fraud correlation engine.
 * Tabs: Velocity Attacks · Coordinated · Amount Clusters · Network
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Network, Zap, Users, DollarSign, RefreshCw, AlertTriangle,
  ChevronDown, ChevronUp, Link2, Clock, Copy, Shield,
} from "lucide-react";
import { adminFetch } from "@/lib/adminAuth";

/* ── Types ──────────────────────────────────────────────────────────── */
interface VelocityAttacker {
  user_id:       string;
  submissions:   number;
  blocked:       number;
  avg_score:     number;
  max_score:     number;
  burst_minutes: number;
  risk:          "critical" | "high" | "medium" | "low";
}
interface CoordinatedPair {
  user_a: string; user_b: string;
  time_diff_s: number; avg_score: number; ts: string;
}
interface SharedRef { reference: string; users: string[]; user_count: number }
interface AmountCluster {
  amount: number; unique_users: number; total_submissions: number;
  max_score: number; blocked: number; risk: string;
}
interface LinkedUser {
  user_id: string; signals: string[]; shared_count: number; max_score: number; risk: string;
}
interface NetworkData {
  user_id: string; linked_users: LinkedUser[];
  signal_count: number; network_size: number;
}

/* ── Helpers ────────────────────────────────────────────────────────── */
const RISK_COLOR: Record<string, string> = {
  critical: "text-red-400 bg-red-500/10 border-red-500/30",
  high:     "text-orange-400 bg-orange-500/10 border-orange-500/30",
  medium:   "text-yellow-400 bg-yellow-500/10 border-yellow-500/30",
  low:      "text-emerald-400 bg-emerald-500/10 border-emerald-500/30",
};
const RISK_DOT: Record<string, string> = {
  critical: "bg-red-500", high: "bg-orange-500", medium: "bg-yellow-500", low: "bg-emerald-500",
};

function RiskBadge({ risk }: { risk: string }) {
  return (
    <span className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide border ${RISK_COLOR[risk] ?? RISK_COLOR.low}`}>
      {risk}
    </span>
  );
}

function shortId(id: string) { return id.slice(0, 8) + "…"; }

function copy(text: string) { void navigator.clipboard.writeText(text); }

/* ── Network Graph (radial SVG) ─────────────────────────────────────── */
function NetworkGraph({ data }: { data: NetworkData }) {
  const cx = 200; const cy = 200; const r = 130;
  const count = Math.min(data.linked_users.length, 12);

  return (
    <svg width="400" height="400" className="mx-auto">
      <defs>
        <radialGradient id="coreGrad" cx="50%" cy="50%">
          <stop offset="0%" stopColor="#6366f1" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#4f46e5" stopOpacity="0.6" />
        </radialGradient>
        {["critical","high","medium"].map((k) => (
          <radialGradient key={k} id={`grad-${k}`} cx="50%" cy="50%">
            <stop offset="0%" stopColor={k==="critical"?"#ef4444":k==="high"?"#f97316":"#eab308"} stopOpacity="0.9" />
            <stop offset="100%" stopColor={k==="critical"?"#dc2626":k==="high"?"#ea580c":"#ca8a04"} stopOpacity="0.6" />
          </radialGradient>
        ))}
      </defs>

      {/* Edge lines */}
      {data.linked_users.slice(0, count).map((u, i) => {
        const angle = (2 * Math.PI * i) / count - Math.PI / 2;
        const nx = cx + r * Math.cos(angle);
        const ny = cy + r * Math.sin(angle);
        const stroke = u.risk === "critical" ? "#ef4444" : u.risk === "high" ? "#f97316" : "#eab308";
        return (
          <line key={u.user_id}
            x1={cx} y1={cy} x2={nx} y2={ny}
            stroke={stroke} strokeOpacity={0.35} strokeWidth={u.signals.length >= 2 ? 2 : 1}
            strokeDasharray={u.signals.includes("shared_reference") ? "0" : "4 3"}
          />
        );
      })}

      {/* Satellite nodes */}
      {data.linked_users.slice(0, count).map((u, i) => {
        const angle = (2 * Math.PI * i) / count - Math.PI / 2;
        const nx = cx + r * Math.cos(angle);
        const ny = cy + r * Math.sin(angle);
        const gid = `grad-${u.risk === "critical" ? "critical" : u.risk === "high" ? "high" : "medium"}`;
        return (
          <g key={u.user_id}>
            {u.risk === "critical" && (
              <circle cx={nx} cy={ny} r={16} fill="none" stroke="#ef4444" strokeWidth={1} strokeOpacity={0.4}>
                <animate attributeName="r" values="16;22;16" dur="2s" repeatCount="indefinite" />
                <animate attributeName="stroke-opacity" values="0.4;0;0.4" dur="2s" repeatCount="indefinite" />
              </circle>
            )}
            <circle cx={nx} cy={ny} r={12} fill={`url(#${gid})`} />
            <text x={nx} y={ny + 4} textAnchor="middle" fontSize="8" fill="white" fontWeight="bold">
              {u.shared_count}
            </text>
            <text x={nx} y={ny + 22} textAnchor="middle" fontSize="7" fill="white" fillOpacity={0.6}>
              {shortId(u.user_id)}
            </text>
          </g>
        );
      })}

      {/* Core node */}
      <circle cx={cx} cy={cy} r={24} fill="url(#coreGrad)" />
      <circle cx={cx} cy={cy} r={24} fill="none" stroke="#6366f1" strokeWidth={1.5} strokeOpacity={0.7} />
      <text x={cx} y={cy - 6} textAnchor="middle" fontSize="8" fill="white" fontWeight="bold">TARGET</text>
      <text x={cx} y={cy + 6} textAnchor="middle" fontSize="7" fill="white" fillOpacity={0.7}>
        {shortId(data.user_id)}
      </text>

      {/* Legend */}
      <g transform="translate(10,370)">
        {[["—", "#6366f1","shared_ref"],["- -","#9ca3af","shared_image"]].map(([dash, color, label],i) => (
          <g key={label} transform={`translate(${i*100},0)`}>
            <line x1={0} y1={0} x2={20} y2={0} stroke={color} strokeWidth={1.5}
              strokeDasharray={i===1?"4 3":"0"} />
            <text x={26} y={4} fontSize="7" fill="white" fillOpacity={0.5}>{label}</text>
          </g>
        ))}
      </g>
    </svg>
  );
}

/* ── Velocity Tab ───────────────────────────────────────────────────── */
function VelocityTab({ data }: { data: VelocityAttacker[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  if (!data.length)
    return <p className="text-center text-white/30 py-16 text-sm">No velocity attackers detected in last 24 h</p>;

  return (
    <div className="space-y-2">
      {data.map((a) => (
        <motion.div key={a.user_id} layout
          className="rounded-lg border border-white/5 bg-[#0d1626] overflow-hidden">
          <button
            className="w-full flex items-center gap-3 px-4 py-3 text-left"
            onClick={() => setExpanded(e => e === a.user_id ? null : a.user_id)}>
            <span className={`h-2 w-2 rounded-full flex-shrink-0 ${RISK_DOT[a.risk]}`} />
            <span className="font-mono text-xs text-white/60 flex-1 truncate">{a.user_id}</span>
            <div className="flex items-center gap-3 flex-shrink-0">
              <span className="text-xs text-white/40">{a.submissions} submissions</span>
              <span className="text-xs font-bold text-red-400">{a.max_score}</span>
              <RiskBadge risk={a.risk} />
              {expanded === a.user_id ? <ChevronUp size={14} className="text-white/30" /> : <ChevronDown size={14} className="text-white/30" />}
            </div>
          </button>
          <AnimatePresence>
            {expanded === a.user_id && (
              <motion.div key="detail"
                initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }}
                className="border-t border-white/5 px-4 pb-3">
                <div className="grid grid-cols-4 gap-3 mt-3">
                  {[
                    ["Submissions", a.submissions, ""],
                    ["Blocked",     a.blocked,     "text-red-400"],
                    ["Avg Score",   a.avg_score,   ""],
                    ["Burst",       `${a.burst_minutes}m`, ""],
                  ].map(([label, val, cls]) => (
                    <div key={label as string} className="rounded bg-white/5 p-2 text-center">
                      <div className={`text-lg font-bold ${cls || "text-white"}`}>{val}</div>
                      <div className="text-[10px] text-white/40 mt-0.5">{label}</div>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={() => copy(a.user_id)}
                    className="flex items-center gap-1 px-3 py-1.5 rounded bg-white/5 hover:bg-white/10 text-xs text-white/60">
                    <Copy size={12} /> Copy ID
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      ))}
    </div>
  );
}

/* ── Coordinated Tab ────────────────────────────────────────────────── */
function CoordinatedTab({ pairs, refs }: { pairs: CoordinatedPair[]; refs: SharedRef[] }) {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-2">
          Synchronized Submissions ({pairs.length})
        </h3>
        {!pairs.length
          ? <p className="text-center text-white/30 py-8 text-sm">No synchronized pairs detected</p>
          : (
            <div className="space-y-1.5">
              {pairs.map((p, i) => (
                <div key={i} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-[#0d1626] border border-white/5">
                  <Link2 size={12} className="text-orange-400 flex-shrink-0" />
                  <span className="font-mono text-[10px] text-white/50 flex-1 truncate">{p.user_a}</span>
                  <span className="text-[10px] text-white/30">{p.time_diff_s}s apart</span>
                  <span className="font-mono text-[10px] text-white/50 flex-1 truncate text-right">{p.user_b}</span>
                  <span className="text-xs font-bold text-orange-400">{p.avg_score}</span>
                </div>
              ))}
            </div>
          )
        }
      </div>
      <div>
        <h3 className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-2">
          Shared Reference Numbers ({refs.length})
        </h3>
        {!refs.length
          ? <p className="text-center text-white/30 py-4 text-sm">No shared references</p>
          : (
            <div className="space-y-1.5">
              {refs.map((r) => (
                <div key={r.reference} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-red-500/5 border border-red-500/20">
                  <AlertTriangle size={12} className="text-red-400 flex-shrink-0" />
                  <code className="text-xs text-red-300 flex-1">{r.reference}</code>
                  <span className="text-xs text-white/50">{r.user_count} users</span>
                  <button onClick={() => copy(r.reference)} className="text-white/30 hover:text-white/60">
                    <Copy size={11} />
                  </button>
                </div>
              ))}
            </div>
          )
        }
      </div>
    </div>
  );
}

/* ── Amount Clusters Tab ────────────────────────────────────────────── */
function AmountClustersTab({ data }: { data: AmountCluster[] }) {
  if (!data.length)
    return <p className="text-center text-white/30 py-16 text-sm">No amount clusters found</p>;

  const maxUsers = Math.max(...data.map((c) => c.unique_users), 1);

  return (
    <div className="space-y-2">
      {data.map((c) => (
        <div key={c.amount} className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-[#0d1626] border border-white/5">
          <DollarSign size={13} className="text-emerald-400 flex-shrink-0" />
          <span className="text-sm font-semibold text-white w-20 flex-shrink-0">
            ₱{c.amount.toLocaleString()}
          </span>
          <div className="flex-1">
            <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-yellow-500 to-orange-500"
                style={{ width: `${(c.unique_users / maxUsers) * 100}%` }}
              />
            </div>
          </div>
          <span className="text-xs text-white/50 w-16 text-right">{c.unique_users} users</span>
          <span className="text-xs text-white/40 w-14 text-right">{c.total_submissions} sub</span>
          <span className="text-xs font-bold text-red-400 w-8 text-right">{c.max_score}</span>
          <RiskBadge risk={c.risk} />
        </div>
      ))}
    </div>
  );
}

/* ── Network Tab ────────────────────────────────────────────────────── */
function NetworkTab() {
  const [userId, setUserId] = useState("");
  const [loading, setLoading] = useState(false);
  const [data, setData]       = useState<NetworkData | null>(null);
  const [err, setErr]         = useState<string | null>(null);

  const lookup = useCallback(async () => {
    if (!userId.trim()) return;
    setLoading(true); setErr(null);
    try {
      const res = await adminFetch<NetworkData>(`/admin/correlation/network/${userId.trim()}`);
      setData(res);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <input
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void lookup()}
          placeholder="Enter user UUID to map network…"
          className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-indigo-500/60"
        />
        <button
          onClick={() => void lookup()}
          disabled={loading || !userId.trim()}
          className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-sm font-medium text-white">
          {loading ? "…" : "Map"}
        </button>
      </div>

      {err && <p className="text-sm text-red-400">{err}</p>}

      {data && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <div className="grid grid-cols-3 gap-3 mb-4">
            {[
              ["Network Size", data.network_size, "text-indigo-400"],
              ["Signal Types", data.signal_count, "text-orange-400"],
              ["Risk Level",   data.network_size >= 5 ? "HIGH" : data.network_size >= 2 ? "MED" : "LOW",
               data.network_size >= 5 ? "text-red-400" : "text-yellow-400"],
            ].map(([label, val, cls]) => (
              <div key={label as string} className="rounded-lg bg-white/5 p-3 text-center">
                <div className={`text-xl font-bold ${cls}`}>{val}</div>
                <div className="text-[10px] text-white/40 mt-0.5">{label}</div>
              </div>
            ))}
          </div>

          {data.network_size === 0
            ? <p className="text-center text-white/30 py-8 text-sm">No linked accounts found</p>
            : (
              <div className="grid grid-cols-2 gap-4">
                <NetworkGraph data={data} />
                <div className="space-y-1.5 overflow-y-auto max-h-80 pr-1 scrollbar-thin">
                  {data.linked_users.map((u) => (
                    <div key={u.user_id}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#0d1626] border border-white/5">
                      <span className={`h-2 w-2 rounded-full flex-shrink-0 ${RISK_DOT[u.risk] ?? RISK_DOT.low}`} />
                      <span className="font-mono text-[10px] text-white/50 flex-1 truncate">{u.user_id}</span>
                      <div className="flex flex-wrap gap-1">
                        {u.signals.map((s) => (
                          <span key={s} className="text-[9px] px-1.5 py-0.5 rounded bg-white/5 text-white/50">
                            {s.replace("_"," ")}
                          </span>
                        ))}
                      </div>
                      <span className="text-xs font-bold text-red-400">{u.max_score}</span>
                    </div>
                  ))}
                </div>
              </div>
            )
          }
        </motion.div>
      )}
    </div>
  );
}

/* ── Main component ─────────────────────────────────────────────────── */
type Tab = "velocity" | "coordinated" | "clusters" | "network";

export default function CorrelationEngine() {
  const [tab, setTab]         = useState<Tab>("velocity");
  const [loading, setLoading] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [velocity, setVelocity]       = useState<VelocityAttacker[]>([]);
  const [coordinated, setCoordinated] = useState<{ pairs: CoordinatedPair[]; refs: SharedRef[] }>({ pairs: [], refs: [] });
  const [clusters, setClusters]       = useState<AmountCluster[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [v, c, a] = await Promise.allSettled([
      adminFetch<{ attackers: VelocityAttacker[] }>("/admin/correlation/velocity"),
      adminFetch<{ coordinated_pairs: CoordinatedPair[]; shared_references: SharedRef[] }>("/admin/correlation/coordinated"),
      adminFetch<{ clusters: AmountCluster[] }>("/admin/correlation/amount-clusters"),
    ]);
    if (v.status === "fulfilled") setVelocity(v.value.attackers ?? []);
    if (c.status === "fulfilled") setCoordinated({ pairs: c.value.coordinated_pairs ?? [], refs: c.value.shared_references ?? [] });
    if (a.status === "fulfilled") setClusters(a.value.clusters ?? []);
    setLoading(false);
    setLastRefresh(new Date());
  }, []);

  useEffect(() => {
    void load();
    timerRef.current = setInterval(() => void load(), 60_000);
    return () => clearInterval(timerRef.current ?? undefined);
  }, [load]);

  const TABS: { id: Tab; label: string; icon: React.ReactNode; count?: number }[] = [
    { id: "velocity",    label: "Velocity",    icon: <Zap size={13} />,     count: velocity.length },
    { id: "coordinated", label: "Coordinated", icon: <Link2 size={13} />,   count: coordinated.pairs.length + coordinated.refs.length },
    { id: "clusters",    label: "Clusters",    icon: <DollarSign size={13} />, count: clusters.length },
    { id: "network",     label: "Network",     icon: <Network size={13} /> },
  ];

  return (
    <div className="h-full flex flex-col gap-4 min-h-0">
      {/* Header */}
      <div className="flex items-center justify-between flex-shrink-0">
        <div>
          <h2 className="text-lg font-semibold text-white">Cross-Account Correlation</h2>
          <p className="text-xs text-white/40 mt-0.5">
            {lastRefresh ? `Updated ${lastRefresh.toLocaleTimeString()}` : "Loading…"}
          </p>
        </div>
        <button
          onClick={() => void load()}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs text-white/60 disabled:opacity-40">
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-white/5 rounded-lg p-1 flex-shrink-0">
        {TABS.map((t) => (
          <button key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-medium transition-all ${
              tab === t.id ? "bg-white/10 text-white" : "text-white/40 hover:text-white/60"
            }`}>
            {t.icon} {t.label}
            {t.count !== undefined && t.count > 0 && (
              <span className="px-1.5 py-0.5 rounded-full bg-red-500/80 text-[9px] text-white font-bold leading-none">
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto scrollbar-thin min-h-0">
        <AnimatePresence mode="wait">
          <motion.div key={tab}
            initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -8 }} transition={{ duration: 0.15 }}>
            {loading
              ? <div className="flex items-center justify-center py-20">
                  <RefreshCw size={20} className="animate-spin text-white/20" />
                </div>
              : tab === "velocity"    ? <VelocityTab data={velocity} />
              : tab === "coordinated" ? <CoordinatedTab pairs={coordinated.pairs} refs={coordinated.refs} />
              : tab === "clusters"   ? <AmountClustersTab data={clusters} />
              : <NetworkTab />
            }
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
