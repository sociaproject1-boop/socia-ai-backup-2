/**
 * DeviceIntelPanel — device fingerprint intelligence.
 *
 * Shows: image hash collisions, repeat offenders, time-of-day fraud distribution,
 * and overall device risk summary.
 */
import { useState, useEffect, useCallback, memo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Monitor, RefreshCw, AlertTriangle, ShieldAlert, Users,
  Copy, Clock, ChevronDown, ChevronUp, Hash, TrendingUp,
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { adminFetch } from "@/lib/adminAuth";

/* ── Types ────────────────────────────────────────────────────────────── */
interface HashCollision {
  hash:         string;
  count:        number;
  unique_users: number;
  max_score:    number;
  latest:       string;
}

interface RepeatOffender {
  user_id:   string;
  total:     number;
  blocked:   number;
  flagged:   number;
  avg_score: number;
  max_score: number;
  risk:      "critical" | "high" | "medium" | "low";
}

interface HourBucket {
  hour:  number;
  count: number;
}

interface Overview {
  summary: {
    hash_collisions:  number;
    repeat_offenders: number;
    blocked_total:    number;
    suspicious_total: number;
  };
  collisions:       HashCollision[];
  repeat_offenders: RepeatOffender[];
  hourly_fraud:     HourBucket[];
}

/* ── Risk styling ─────────────────────────────────────────────────────── */
const RISK_COLOR: Record<string, string> = {
  critical: "text-red-400",
  high:     "text-orange-400",
  medium:   "text-amber-400",
  low:      "text-blue-400",
};
const RISK_BG: Record<string, string> = {
  critical: "bg-red-500/10 border-red-500/20",
  high:     "bg-orange-500/10 border-orange-500/20",
  medium:   "bg-amber-500/8 border-amber-500/15",
  low:      "bg-blue-500/8 border-blue-500/15",
};

/* ── Collision row ────────────────────────────────────────────────────── */
const CollisionRow = memo(function CollisionRow({ c }: { c: HashCollision }) {
  const risk = c.max_score >= 80 ? "critical" : c.max_score >= 55 ? "high" : "medium";
  return (
    <div className={`rounded-xl border p-3 ${RISK_BG[risk]}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Hash className={`h-3.5 w-3.5 flex-shrink-0 ${RISK_COLOR[risk]}`} />
          <span className="truncate font-mono text-[10px] text-white/50">{c.hash}</span>
        </div>
        <span className={`flex-shrink-0 text-[9px] font-black uppercase ${RISK_COLOR[risk]}`}>{risk}</span>
      </div>
      <div className="mt-1.5 flex gap-4">
        <Stat label="Submissions" value={c.count} />
        <Stat label="Users"       value={c.unique_users} />
        <Stat label="Max Score"   value={c.max_score} />
        <Stat label="Latest"      value={new Date(c.latest).toLocaleDateString()} />
      </div>
    </div>
  );
});

/* ── Offender row ─────────────────────────────────────────────────────── */
const OffenderRow = memo(function OffenderRow({ r }: { r: RepeatOffender }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`rounded-xl border transition-colors ${RISK_BG[r.risk]}`}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 p-3 text-left"
      >
        <div className={`grid h-7 w-7 flex-shrink-0 place-items-center rounded-xl bg-white/5`}>
          <Users className={`h-3.5 w-3.5 ${RISK_COLOR[r.risk]}`} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="truncate font-mono text-[10px] text-white/60">{r.user_id.slice(0, 20)}…</p>
          <p className={`text-[9px] font-bold uppercase ${RISK_COLOR[r.risk]}`}>{r.risk} risk</p>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <Stat label="Total" value={r.total} />
          <Stat label="Blocked" value={r.blocked} />
          {open ? <ChevronUp className="h-3 w-3 text-white/25" /> : <ChevronDown className="h-3 w-3 text-white/25" />}
        </div>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-t border-white/[0.05] px-3 pb-3"
          >
            <div className="flex flex-wrap gap-3 pt-3">
              <Stat label="Avg Score"  value={r.avg_score}  />
              <Stat label="Max Score"  value={r.max_score}  />
              <Stat label="Flagged"    value={r.flagged}    />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <p className="text-[8px] text-white/25 uppercase">{label}</p>
      <p className="text-[11px] font-bold text-white/70">{value}</p>
    </div>
  );
}

/* ── Hour bar color ───────────────────────────────────────────────────── */
function hourColor(count: number, max: number) {
  const ratio = max > 0 ? count / max : 0;
  if (ratio >= 0.8) return "#ef4444";
  if (ratio >= 0.55) return "#f97316";
  if (ratio >= 0.3) return "#eab308";
  return "#3b82f6";
}

/* ── Main component ───────────────────────────────────────────────────── */
export default function DeviceIntelPanel() {
  const [data,    setData]    = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [tab,     setTab]     = useState<"collisions" | "offenders" | "timing">("collisions");

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const data = await adminFetch<Overview>("/admin/device-intel/overview");
      setData(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const maxHour = Math.max(...(data?.hourly_fraud.map((h) => h.count) ?? [1]));

  return (
    <div className="flex h-full flex-col rounded-2xl border border-white/[0.06] bg-[#0b1220]">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-purple-500/10">
            <Monitor className="h-4.5 w-4.5 text-purple-400" />
          </div>
          <div>
            <h2 className="text-base font-black text-white">Device Intelligence</h2>
            <p className="text-[10px] text-white/30">Fingerprint collision · Repeat offender · Timing analysis</p>
          </div>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-xl border border-white/[0.07] px-3 py-1.5 text-[10px] text-white/40 hover:border-white/[0.12] hover:text-white/70 disabled:opacity-40"
        >
          <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* Summary cards */}
      {data && (
        <div className="grid grid-cols-2 gap-3 border-b border-white/[0.06] p-4 sm:grid-cols-4">
          {[
            { label: "Hash Collisions",   value: data.summary.hash_collisions,  icon: Copy,         color: "text-red-400"    },
            { label: "Repeat Offenders",  value: data.summary.repeat_offenders, icon: ShieldAlert,  color: "text-orange-400" },
            { label: "Blocked Total",     value: data.summary.blocked_total,    icon: AlertTriangle,color: "text-amber-400"  },
            { label: "Suspicious Total",  value: data.summary.suspicious_total, icon: TrendingUp,   color: "text-blue-400"   },
          ].map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="rounded-xl border border-white/[0.05] bg-white/[0.02] p-3">
              <div className="flex items-center gap-1.5">
                <Icon className={`h-3.5 w-3.5 ${color}`} />
                <p className="text-[9px] text-white/30">{label}</p>
              </div>
              <p className="mt-1.5 text-xl font-black text-white">{value.toLocaleString()}</p>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-white/[0.06] px-4 py-2">
        {([
          ["collisions", "Hash Collisions"],
          ["offenders",  "Repeat Offenders"],
          ["timing",     "Timing Analysis"],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`rounded-lg px-3 py-1.5 text-[10px] font-semibold transition-colors ${
              tab === key ? "bg-white/[0.07] text-white" : "text-white/35 hover:text-white/60"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 scrollbar-none">
        {loading && (
          <div className="flex items-center justify-center py-16">
            <RefreshCw className="h-6 w-6 animate-spin text-white/20" />
          </div>
        )}
        {error && (
          <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-400">{error}</div>
        )}
        {!loading && !error && data && (
          <>
            {tab === "collisions" && (
              <div className="space-y-2">
                {data.collisions.length === 0 ? (
                  <p className="py-8 text-center text-xs text-white/25">No image hash collisions detected</p>
                ) : data.collisions.map((c) => <CollisionRow key={c.hash} c={c} />)}
              </div>
            )}
            {tab === "offenders" && (
              <div className="space-y-2">
                {data.repeat_offenders.length === 0 ? (
                  <p className="py-8 text-center text-xs text-white/25">No repeat offenders detected</p>
                ) : data.repeat_offenders.map((r) => <OffenderRow key={r.user_id} r={r} />)}
              </div>
            )}
            {tab === "timing" && (
              <div className="space-y-4">
                <p className="text-[10px] text-white/30">
                  Fraud submission frequency by hour of day (last 7 days). Peak hours indicate attack windows.
                </p>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={data.hourly_fraud} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                    <CartesianGrid stroke="rgba(255,255,255,0.04)" strokeDasharray="2 4" />
                    <XAxis
                      dataKey="hour"
                      tick={{ fill: "rgba(255,255,255,0.2)", fontSize: 8 }}
                      tickLine={false} axisLine={false}
                      tickFormatter={(h: number) => `${h}h`}
                    />
                    <YAxis tick={{ fill: "rgba(255,255,255,0.2)", fontSize: 8 }} tickLine={false} axisLine={false} allowDecimals={false} />
                    <Tooltip
                      contentStyle={{ background: "#0d1628", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, fontSize: 11 }}
                      formatter={(v: number) => [v, "Fraud events"]}
                      labelFormatter={(h: number) => `${h}:00–${h + 1}:00`}
                    />
                    <Bar dataKey="count" radius={[3, 3, 0, 0]}>
                      {data.hourly_fraud.map((h) => (
                        <Cell key={h.hour} fill={hourColor(h.count, maxHour)} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                <div className="grid grid-cols-3 gap-3">
                  {[0, 1, 2].map((shift) => {
                    const slice  = data.hourly_fraud.slice(shift * 8, shift * 8 + 8);
                    const total  = slice.reduce((s, h) => s + h.count, 0);
                    const labels = ["Night (0–8h)", "Day (8–16h)", "Evening (16–24h)"];
                    return (
                      <div key={shift} className="rounded-xl border border-white/[0.05] bg-white/[0.02] p-3 text-center">
                        <p className="text-[9px] text-white/25">{labels[shift]}</p>
                        <p className="mt-1 text-lg font-black text-white">{total}</p>
                        <p className="text-[9px] text-white/30">events</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
