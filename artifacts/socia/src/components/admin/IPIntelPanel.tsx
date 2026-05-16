/**
 * IPIntelPanel — IP and behavioral intelligence.
 *
 * Shows: admin login IP patterns, suspicious multi-account IPs,
 * 30-day daily fraud pattern, and IP risk profiles.
 */
import { useState, useEffect, useCallback, memo } from "react";
import { motion } from "framer-motion";
import {
  Globe, RefreshCw, AlertTriangle, Shield, Lock,
  TrendingUp, ChevronDown, ChevronUp, Eye,
} from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from "recharts";
import { adminFetch } from "@/lib/adminAuth";

/* ── Types ────────────────────────────────────────────────────────────── */
interface IPProfile {
  ip:            string;
  logins:        number;
  unique_admins: number;
  admins:        string[];
  latest:        string;
  risk:          "high" | "medium" | "low";
  user_agent:    string;
  is_suspicious: boolean;
}

interface DailyPoint {
  date:  string;
  count: number;
}

interface IPIntelData {
  ip_profiles: IPProfile[];
  summary: {
    unique_ips:     number;
    suspicious_ips: number;
    total_logins:   number;
  };
  daily_fraud_pattern: DailyPoint[];
}

/* ── Risk pill ────────────────────────────────────────────────────────── */
const RISK_STYLES: Record<string, string> = {
  high:   "bg-red-500/15 text-red-400 border-red-500/20",
  medium: "bg-amber-500/10 text-amber-400 border-amber-500/15",
  low:    "bg-emerald-500/10 text-emerald-400 border-emerald-500/15",
};

/* ── IP Profile row ───────────────────────────────────────────────────── */
const IPRow = memo(function IPRow({ p }: { p: IPProfile }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`rounded-xl border transition-all ${
      p.is_suspicious ? "border-orange-500/20 bg-orange-500/5" : "border-white/[0.06] bg-white/[0.02]"
    }`}>
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-3 p-3 text-left">
        <div className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-xl bg-white/5">
          <Globe className={`h-3.5 w-3.5 ${p.is_suspicious ? "text-orange-400" : "text-blue-400"}`} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-mono text-[11px] font-bold text-white/80">{p.ip}</p>
          <p className="text-[9px] text-white/30">{p.logins} logins · last {new Date(p.latest).toLocaleDateString()}</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className={`rounded-full border px-2 py-px text-[8px] font-bold uppercase ${RISK_STYLES[p.risk]}`}>
            {p.risk}
          </span>
          {open ? <ChevronUp className="h-3 w-3 text-white/25" /> : <ChevronDown className="h-3 w-3 text-white/25" />}
        </div>
      </button>
      {open && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          className="overflow-hidden border-t border-white/[0.05] px-3 pb-3"
        >
          <div className="pt-3 space-y-2">
            <div>
              <p className="text-[8px] uppercase text-white/25 mb-1">Admins logged in from this IP</p>
              <div className="flex flex-wrap gap-1.5">
                {p.admins.map((a) => (
                  <span key={a} className="rounded-lg bg-white/[0.04] px-2 py-0.5 text-[10px] text-white/50">{a}</span>
                ))}
                {p.unique_admins > p.admins.length && (
                  <span className="rounded-lg bg-white/[0.04] px-2 py-0.5 text-[10px] text-white/30">
                    +{p.unique_admins - p.admins.length} more
                  </span>
                )}
              </div>
            </div>
            {p.user_agent && (
              <div>
                <p className="text-[8px] uppercase text-white/25 mb-1">User Agent</p>
                <p className="text-[9px] text-white/40 font-mono truncate">{p.user_agent}</p>
              </div>
            )}
            {p.is_suspicious && (
              <div className="flex items-center gap-1.5 rounded-lg bg-orange-500/10 px-2 py-1.5">
                <AlertTriangle className="h-3 w-3 text-orange-400" />
                <p className="text-[9px] text-orange-400">
                  Multiple admin accounts logged in from this IP — may indicate shared access or compromise
                </p>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </div>
  );
});

/* ── Main component ───────────────────────────────────────────────────── */
export default function IPIntelPanel() {
  const [data,    setData]    = useState<IPIntelData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [tab,     setTab]     = useState<"ips" | "trend">("ips");
  const [filter,  setFilter]  = useState<"all" | "suspicious">("all");

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const data = await adminFetch<IPIntelData>("/admin/ip-intel");
      setData(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const profiles = (data?.ip_profiles ?? []).filter(
    (p) => filter === "all" || p.is_suspicious,
  );

  return (
    <div className="flex h-full flex-col rounded-2xl border border-white/[0.06] bg-[#0b1220]">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-blue-500/10">
            <Globe className="h-4.5 w-4.5 text-blue-400" />
          </div>
          <div>
            <h2 className="text-base font-black text-white">IP Intelligence</h2>
            <p className="text-[10px] text-white/30">Admin login patterns · Suspicious IP analysis · Daily fraud trend</p>
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

      {/* Summary */}
      {data && (
        <div className="grid grid-cols-3 gap-3 border-b border-white/[0.06] p-4">
          {[
            { label: "Unique IPs",      value: data.summary.unique_ips,     icon: Globe,    color: "text-blue-400"   },
            { label: "Suspicious IPs",  value: data.summary.suspicious_ips, icon: AlertTriangle, color: "text-orange-400" },
            { label: "Total Logins",    value: data.summary.total_logins,   icon: Lock,     color: "text-white/50"   },
          ].map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="rounded-xl border border-white/[0.05] bg-white/[0.02] p-3">
              <div className="flex items-center gap-1.5">
                <Icon className={`h-3.5 w-3.5 ${color}`} />
                <p className="text-[9px] text-white/30">{label}</p>
              </div>
              <p className="mt-1 text-xl font-black text-white">{value.toLocaleString()}</p>
            </div>
          ))}
        </div>
      )}

      {/* Tabs + filter */}
      <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-2">
        <div className="flex gap-1">
          {([["ips", "IP Profiles"], ["trend", "30-Day Trend"]] as const).map(([key, label]) => (
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
        {tab === "ips" && (
          <div className="flex gap-1">
            {([["all", "All"], ["suspicious", "Suspicious"]] as const).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={`rounded-lg px-2.5 py-1 text-[9px] font-semibold transition-colors ${
                  filter === key ? "bg-orange-500/15 text-orange-400" : "text-white/25 hover:text-white/50"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}
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
            {tab === "ips" && (
              <div className="space-y-2">
                {profiles.length === 0 ? (
                  <p className="py-8 text-center text-xs text-white/25">
                    {filter === "suspicious" ? "No suspicious IPs detected" : "No IP data available"}
                  </p>
                ) : profiles.map((p) => <IPRow key={p.ip} p={p} />)}
              </div>
            )}
            {tab === "trend" && (
              <div className="space-y-4">
                <p className="text-[10px] text-white/30">
                  High-severity fraud events per day over the last 30 days.
                </p>
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={data.daily_fraud_pattern} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                    <defs>
                      <linearGradient id="trendGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="#3b82f6" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="rgba(255,255,255,0.04)" strokeDasharray="2 4" />
                    <XAxis
                      dataKey="date"
                      tick={{ fill: "rgba(255,255,255,0.2)", fontSize: 8 }}
                      tickLine={false} axisLine={false}
                      interval={4}
                      tickFormatter={(d: string) => d.slice(5)}
                    />
                    <YAxis tick={{ fill: "rgba(255,255,255,0.2)", fontSize: 8 }} tickLine={false} axisLine={false} allowDecimals={false} />
                    <Tooltip
                      contentStyle={{ background: "#0d1628", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, fontSize: 11 }}
                      formatter={(v: number) => [v, "Fraud events"]}
                    />
                    <Area dataKey="count" name="Fraud events" type="monotone" stroke="#3b82f6" strokeWidth={2} fill="url(#trendGrad)" dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
                {data.daily_fraud_pattern.length > 0 && (() => {
                  const vals = data.daily_fraud_pattern.map((d) => d.count);
                  const peak = Math.max(...vals);
                  const avg  = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
                  const peakDay = data.daily_fraud_pattern.find((d) => d.count === peak);
                  return (
                    <div className="grid grid-cols-3 gap-3">
                      <Stat label="Peak Day"   value={peakDay?.date.slice(5) ?? "—"} />
                      <Stat label="Peak Events" value={peak} />
                      <Stat label="Daily Avg"  value={avg} />
                    </div>
                  );
                })()}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-white/[0.05] bg-white/[0.02] p-3 text-center">
      <p className="text-[9px] text-white/25">{label}</p>
      <p className="mt-1 text-lg font-black text-white">{value}</p>
    </div>
  );
}
