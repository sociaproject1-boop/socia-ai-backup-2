/**
 * Enterprise Fraud Intelligence Command Center — Dashboard view.
 * Stripe Radar / Cloudflare SOC aesthetic: full-width, dense, live data.
 */
import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, BarChart, Bar, Cell, PieChart, Pie,
} from "recharts";
import {
  ShieldCheck, ShieldAlert, ShieldX, AlertTriangle, CheckCircle2,
  Clock, Zap, Copy, Layers, RefreshCw, Eye, TrendingUp, TrendingDown,
  Activity, AlertOctagon, ChevronRight, Fingerprint, Cpu, ScanSearch,
  Info,
} from "lucide-react";
import {
  adminGetAnalytics,
  type AnalyticsOverview, type AnalyticsTotals, type AnalyticsAlert,
} from "@/lib/adminAuth";
import LiveFraudFeed from "./LiveFraudFeed";
import StreamingChart from "./StreamingChart";

/* ── Live clock ──────────────────────────────────────────────────────── */
function useClock() {
  const [time, setTime] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return time;
}

/* ── Animated counter ────────────────────────────────────────────────── */
function useCounter(target: number, duration = 900) {
  const [count, setCount] = useState(0);
  const rafRef = useRef<number | null>(null);
  useEffect(() => {
    const startTime = performance.now();
    const animate = (now: number) => {
      const progress = Math.min((now - startTime) / duration, 1);
      const eased    = 1 - Math.pow(1 - progress, 3);
      setCount(Math.round(target * eased));
      if (progress < 1) rafRef.current = requestAnimationFrame(animate);
    };
    rafRef.current = requestAnimationFrame(animate);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [target, duration]);
  return count;
}

/* ── Threat level ────────────────────────────────────────────────────── */
function threatLevel(t: AnalyticsTotals): { label: string; color: string; bg: string; border: string } {
  const rate = t.total > 0 ? (t.suspicious + t.blocked) / t.total : 0;
  if (rate >= 0.3 || t.blocked >= 20) return { label: "CRITICAL", color: "text-red-400",    bg: "bg-red-500/10",    border: "border-red-500/30" };
  if (rate >= 0.15 || t.blocked >= 10) return { label: "HIGH",     color: "text-orange-400", bg: "bg-orange-500/10", border: "border-orange-500/30" };
  if (rate >= 0.05 || t.blocked >= 3)  return { label: "ELEVATED", color: "text-amber-400",  bg: "bg-amber-500/10",  border: "border-amber-500/30" };
  return { label: "NOMINAL", color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/30" };
}

/* ── Custom Recharts tooltip ─────────────────────────────────────────── */
function DarkTooltip({ active, payload, label }: {
  active?: boolean; payload?: { color: string; name: string; value: number }[]; label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-white/10 bg-[#0d1829] p-3 shadow-2xl">
      <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-white/50">{label}</p>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center justify-between gap-4 text-[11px]">
          <div className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: p.color }} />
            <span className="capitalize text-white/60">{p.name}</span>
          </div>
          <span className="font-bold text-white">{p.value}</span>
        </div>
      ))}
    </div>
  );
}

/* ── Hero KPI card ───────────────────────────────────────────────────── */
function HeroKPI({
  label, value, sub, icon: Icon, color, glow, border, pct, index,
}: {
  label: string; value: number; sub?: string; icon: React.ElementType;
  color: string; glow: string; border: string; pct?: string; index: number;
}) {
  const count = useCounter(value);
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.07, duration: 0.35, ease: "easeOut" }}
      className={`relative overflow-hidden rounded-2xl border ${border} bg-[#0b1220] p-5`}
      style={{ boxShadow: `0 0 32px 0 ${glow}14` }}
    >
      <div className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full blur-3xl"
           style={{ background: `${glow}18` }} />
      <div className="relative">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-[10px] font-bold uppercase tracking-widest text-white/35">{label}</p>
          <div className={`grid h-8 w-8 place-items-center rounded-xl border ${border} bg-white/[0.04]`}>
            <Icon className={`h-4 w-4 ${color}`} />
          </div>
        </div>
        <p className={`text-4xl font-black tabular-nums tracking-tight ${color}`}>
          {count.toLocaleString()}
        </p>
        {(pct || sub) && (
          <p className="mt-2 text-[11px] text-white/35">
            {pct ? `${pct}% of total · ` : ""}{sub ?? ""}
          </p>
        )}
      </div>
    </motion.div>
  );
}

/* ── Secondary metric pill ───────────────────────────────────────────── */
function MetricPill({
  label, value, icon: Icon, color, index,
}: {
  label: string; value: number; icon: React.ElementType; color: string; index: number;
}) {
  const count = useCounter(value);
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: 0.28 + index * 0.05, duration: 0.3, ease: "easeOut" }}
      className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-[#0b1220] px-4 py-3"
    >
      <Icon className={`h-4 w-4 flex-shrink-0 ${color}`} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[10px] font-semibold uppercase tracking-wider text-white/35">{label}</p>
        <p className={`text-lg font-bold tabular-nums ${color}`}>{count.toLocaleString()}</p>
      </div>
    </motion.div>
  );
}

/* ── 14-day trend chart ──────────────────────────────────────────────── */
function TrendChart({ data }: { data: AnalyticsOverview["dailyTrend"] }) {
  const extended = data.length < 14
    ? [...Array.from({ length: 14 - data.length }, (_, i) => ({
        date: "", label: `D-${14 - data.length - i}`,
        total: 0, verified: 0, suspicious: 0, blocked: 0,
      })), ...data]
    : data.slice(-14);

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-[#0b1220] p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-white">Verification Trend</h3>
          <p className="mt-0.5 text-[11px] text-white/40">14-day daily breakdown · live data · 30 s refresh</p>
        </div>
        <div className="flex flex-wrap items-center gap-4 text-[10px] text-white/40">
          {[
            { color: "#10b981", label: "Verified"   },
            { color: "#f59e0b", label: "Suspicious" },
            { color: "#ef4444", label: "Blocked"    },
          ].map((l) => (
            <div key={l.label} className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ background: l.color }} />
              {l.label}
            </div>
          ))}
        </div>
      </div>
      <div className="h-[220px] lg:h-[260px] xl:h-[300px] 2xl:h-[340px]">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={extended} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
          <defs>
            {[
              { id: "gradV", color: "#10b981" },
              { id: "gradS", color: "#f59e0b" },
              { id: "gradB", color: "#ef4444" },
            ].map(({ id, color }) => (
              <linearGradient key={id} id={id} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   stopColor={color} stopOpacity={0.3} />
                <stop offset="100%" stopColor={color} stopOpacity={0.02} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
          <XAxis dataKey="label" tick={{ fill: "rgba(255,255,255,0.25)", fontSize: 10 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fill: "rgba(255,255,255,0.25)", fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
          <Tooltip content={<DarkTooltip />} />
          <Area type="monotone" dataKey="verified"   name="Verified"   stroke="#10b981" fill="url(#gradV)" strokeWidth={2} dot={false} />
          <Area type="monotone" dataKey="suspicious" name="Suspicious" stroke="#f59e0b" fill="url(#gradS)" strokeWidth={2} dot={false} />
          <Area type="monotone" dataKey="blocked"    name="Blocked"    stroke="#ef4444" fill="url(#gradB)" strokeWidth={2} dot={false} />
        </AreaChart>
      </ResponsiveContainer>
      </div>
    </div>
  );
}

/* ── Score distribution ──────────────────────────────────────────────── */
const BUCKET_COLORS = ["#10b981", "#34d399", "#f59e0b", "#fb923c", "#ef4444", "#dc2626"];

function ScoreChart({ data }: { data: AnalyticsOverview["scoreDistribution"] }) {
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-[#0b1220] p-5">
      <h3 className="mb-1 text-sm font-bold text-white">Fraud Score Distribution</h3>
      <p className="mb-4 text-[11px] text-white/40">Receipt count by risk band</p>
      <div className="h-[180px] lg:h-[220px] 2xl:h-[260px]">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
          <XAxis dataKey="range" tick={{ fill: "rgba(255,255,255,0.25)", fontSize: 10 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fill: "rgba(255,255,255,0.25)", fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
          <Tooltip content={<DarkTooltip />} />
          <Bar dataKey="count" name="Receipts" radius={[5, 5, 0, 0]} maxBarSize={36}>
            {data.map((_, i) => (
              <Cell key={i} fill={BUCKET_COLORS[i] ?? "#6b7280"} fillOpacity={0.85} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      </div>
    </div>
  );
}

/* ── Verification donut ──────────────────────────────────────────────── */
function VerificationDonut({ data }: { data: AnalyticsOverview["verificationBreakdown"] }) {
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-[#0b1220] p-5">
      <h3 className="mb-1 text-sm font-bold text-white">Verification Status</h3>
      <p className="mb-2 text-[11px] text-white/40">Current period</p>
      {data.length === 0 ? (
        <div className="flex h-[160px] lg:h-[200px] items-center justify-center text-xs text-white/25">
          No data yet
        </div>
      ) : (
        <>
          <div className="h-[160px] lg:h-[200px] 2xl:h-[240px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={data} cx="50%" cy="50%" innerRadius={46} outerRadius={68}
                   dataKey="value" paddingAngle={3} strokeWidth={0}>
                {data.map((entry, i) => <Cell key={i} fill={entry.color} fillOpacity={0.85} />)}
              </Pie>
              <Tooltip content={<DarkTooltip />} />
            </PieChart>
          </ResponsiveContainer>
          </div>
          <div className="mt-2 flex flex-wrap justify-center gap-x-3 gap-y-1">
            {data.map((d) => (
              <div key={d.name} className="flex items-center gap-1.5 text-[10px] text-white/50">
                <span className="h-2 w-2 rounded-full" style={{ background: d.color }} />
                {d.name} <span className="font-bold text-white/70">{d.value}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ── System health panel ─────────────────────────────────────────────── */
function SystemHealth({ totals }: { totals: AnalyticsTotals }) {
  const tl    = threatLevel(totals);
  const rate  = totals.total > 0 ? Math.round((totals.suspicious + totals.blocked) / totals.total * 100) : 0;
  const aiPct = totals.total > 0 ? Math.round(totals.ai_alerts / totals.total * 100) : 0;

  const bars = [
    { label: "Fraud Rate",      pct: Math.min(rate, 100),  color: rate >= 15 ? "#ef4444" : rate >= 5 ? "#f59e0b" : "#10b981" },
    { label: "AI Alert Rate",   pct: Math.min(aiPct, 100), color: aiPct >= 20 ? "#ef4444" : "#a855f7" },
    { label: "Tamper Rate",     pct: Math.min(totals.total > 0 ? Math.round(totals.tampered / totals.total * 100) : 0, 100),  color: "#f97316" },
    { label: "Duplicate Rate",  pct: Math.min(totals.total > 0 ? Math.round(totals.duplicates / totals.total * 100) : 0, 100), color: "#06b6d4" },
  ];

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-[#0b1220] p-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-white">System Health</h3>
          <p className="mt-0.5 text-[11px] text-white/40">Risk signal rates</p>
        </div>
        <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black tracking-widest ${tl.color} ${tl.bg} ${tl.border}`}>
          {tl.label}
        </span>
      </div>
      <div className="space-y-3.5">
        {bars.map(({ label, pct, color }) => (
          <div key={label}>
            <div className="mb-1.5 flex items-center justify-between text-[10px]">
              <span className="text-white/45">{label}</span>
              <span className="font-bold tabular-nums" style={{ color }}>{pct}%</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${pct}%` }}
                transition={{ duration: 1, ease: "easeOut" }}
                className="h-full rounded-full"
                style={{ background: color }}
              />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-5 grid grid-cols-2 gap-2">
        {[
          { label: "AI Engine", status: "Online", color: "text-emerald-400", dot: "bg-emerald-500" },
          { label: "OCR Engine", status: "Online", color: "text-emerald-400", dot: "bg-emerald-500" },
          { label: "Auto-Block", status: "Active", color: "text-purple-400",  dot: "bg-purple-500" },
          { label: "Monitoring", status: "Live",   color: "text-cyan-400",    dot: "bg-cyan-500"   },
        ].map(({ label, status, color, dot }) => (
          <div key={label} className="flex items-center justify-between rounded-lg border border-white/[0.04] bg-white/[0.02] px-3 py-2">
            <span className="text-[10px] text-white/40">{label}</span>
            <div className="flex items-center gap-1.5">
              <span className={`h-1.5 w-1.5 animate-pulse rounded-full ${dot}`} />
              <span className={`text-[10px] font-bold ${color}`}>{status}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── SOC Alert table ─────────────────────────────────────────────────── */
function timeAgo(dateStr: string): string {
  const s = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (s < 60)    return `${s}s ago`;
  if (s < 3600)  return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function alertLabel(a: AnalyticsAlert): string {
  if (a.tamper_detected)           return "Image Tampering";
  if (a.fraud_score >= 100)        return "Auto-Blocked";
  if (a.ai_detection_score >= 60)  return "AI Anomaly";
  if (a.verification_status === "suspicious") return "Suspicious";
  return "Fraud Alert";
}

function ScoreBadge({ score }: { score: number }) {
  const [cls, label] =
    score >= 100 ? ["text-red-400 bg-red-500/10 border-red-500/25",        "CRIT"] :
    score >= 80  ? ["text-orange-400 bg-orange-500/10 border-orange-500/25","HIGH"] :
    score >= 50  ? ["text-amber-400 bg-amber-500/10 border-amber-500/25",  "MED" ] :
                   ["text-white/35 bg-white/[0.04] border-white/10",       "LOW" ];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[9px] font-black ${cls}`}>
      {score} <span className="opacity-60">{label}</span>
    </span>
  );
}

function AlertsTable({
  alerts, onNavigate,
}: {
  alerts: AnalyticsAlert[];
  onNavigate: (view: string) => void;
}) {
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-[#0b1220]">
      <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
            </span>
            <span className="text-[10px] font-black tracking-widest text-red-400">LIVE ALERTS</span>
          </div>
          {alerts.length > 0 && (
            <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-[10px] font-bold text-red-400">
              {alerts.length}
            </span>
          )}
        </div>
        <button
          onClick={() => onNavigate("verifications")}
          className="flex items-center gap-1 text-[10px] font-semibold text-white/35 hover:text-purple-400"
        >
          View All <ChevronRight className="h-3 w-3" />
        </button>
      </div>

      {alerts.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 py-14 text-xs text-white/25">
          <ShieldCheck className="h-9 w-9 text-white/10" />
          All systems clear — no fraud alerts
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-[700px] w-full">
            <thead className="sticky top-0 z-10 bg-[#0b1220]">
              <tr className="border-b border-white/[0.04] text-left">
                {["User", "Signal", "Reference", "Amount", "Score", "Time", ""].map((h) => (
                  <th key={h} className="px-4 py-2.5 text-[9px] font-bold uppercase tracking-widest text-white/25">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.03]">
              {alerts.map((alert, i) => (
                <motion.tr
                  key={alert.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: i * 0.03 }}
                  className="group hover:bg-white/[0.015]"
                >
                  {/* User */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className="h-8 w-8 flex-shrink-0 overflow-hidden rounded-lg border border-white/10 bg-white/5">
                        {alert.image_url
                          ? <img src={alert.image_url} alt="" className="h-full w-full object-cover" />
                          : <AlertOctagon className="m-auto mt-1.5 h-4 w-4 text-white/20" />}
                      </div>
                      <div className="min-w-0">
                        <p className="max-w-[120px] truncate text-[11px] font-semibold text-white">
                          {alert.user?.username ?? alert.user_id.slice(0, 8) + "…"}
                        </p>
                        <p className="font-mono text-[9px] text-white/30">{alert.user_id.slice(0, 8)}</p>
                      </div>
                    </div>
                  </td>
                  {/* Signal */}
                  <td className="px-4 py-3">
                    <span className={`rounded-md px-2 py-0.5 text-[10px] font-bold ${
                      alert.tamper_detected                    ? "bg-red-500/10 text-red-400" :
                      alert.fraud_score >= 100                 ? "bg-orange-500/10 text-orange-400" :
                      alert.ai_detection_score >= 60           ? "bg-purple-500/10 text-purple-400" :
                      alert.verification_status === "suspicious" ? "bg-amber-500/10 text-amber-400" :
                      "bg-white/[0.05] text-white/40"
                    }`}>
                      {alertLabel(alert)}
                    </span>
                  </td>
                  {/* Reference */}
                  <td className="px-4 py-3">
                    <span className="font-mono text-[10px] text-white/50">
                      {(alert.manual_reference ?? "—").slice(0, 20)}
                    </span>
                  </td>
                  {/* Amount */}
                  <td className="px-4 py-3">
                    <span className="font-mono text-[11px] font-semibold text-white/70">
                      {alert.extracted_amount ? `₱${alert.extracted_amount.toLocaleString()}` : "—"}
                    </span>
                    {alert.extracted_payment_method && (
                      <p className="text-[9px] text-white/30">{alert.extracted_payment_method}</p>
                    )}
                  </td>
                  {/* Score */}
                  <td className="px-4 py-3">
                    <ScoreBadge score={alert.fraud_score} />
                  </td>
                  {/* Time */}
                  <td className="px-4 py-3">
                    <span className="text-[10px] tabular-nums text-white/35">{timeAgo(alert.created_at)}</span>
                  </td>
                  {/* Action */}
                  <td className="px-4 py-3">
                    <button
                      onClick={() => onNavigate("verifications")}
                      className="hidden items-center gap-1 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-[10px] font-semibold text-white/50 transition hover:border-purple-500/30 hover:bg-purple-500/10 hover:text-purple-300 group-hover:flex"
                    >
                      <Eye className="h-3 w-3" /> Review
                    </button>
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ── Hero KPI config ──────────────────────────────────────────────────── */
function buildHeroCards(t: AnalyticsTotals) {
  const pct = (n: number) => t.total > 0 ? ((n / t.total) * 100).toFixed(1) : "0.0";
  return [
    { label: "Total Receipts",    value: t.total,         icon: Layers,       color: "text-blue-300",    glow: "#3b82f6", border: "border-blue-500/15",    pct: undefined,       sub: "all time"         },
    { label: "Verified Clean",    value: t.verified,      icon: CheckCircle2, color: "text-emerald-300", glow: "#10b981", border: "border-emerald-500/15", pct: pct(t.verified), sub: "passed checks"    },
    { label: "Blocked / Rejected",value: t.blocked,       icon: ShieldX,      color: "text-red-300",     glow: "#ef4444", border: "border-red-500/15",     pct: pct(t.blocked),  sub: "auto-blocked"     },
    { label: "Pending Review",    value: t.pending_review,icon: Clock,        color: "text-purple-300",  glow: "#a855f7", border: "border-purple-500/15",  pct: pct(t.pending_review), sub: "needs action" },
  ];
}

function buildSecondaryCards(t: AnalyticsTotals) {
  return [
    { label: "Suspicious",   value: t.suspicious, icon: AlertTriangle, color: "text-amber-400"  },
    { label: "AI Fraud Hits",value: t.ai_alerts,  icon: Cpu,           color: "text-cyan-400"   },
    { label: "Duplicates",   value: t.duplicates, icon: Copy,          color: "text-orange-400" },
    { label: "Tampered",     value: t.tampered,   icon: Fingerprint,   color: "text-pink-400"   },
  ];
}

/* ── Main DashboardView export ───────────────────────────────────────── */
export function DashboardView({
  onNavigate,
  liveEvents  = [],
  reviewers   = [],
  isConnected = false,
}: {
  onNavigate:   (view: string) => void;
  liveEvents?:  import("../../lib/useAdminSocket").LiveFraudEvent[];
  reviewers?:   import("../../lib/useAdminSocket").ReviewerPresence[];
  isConnected?: boolean;
}) {
  const [data,        setData]        = useState<AnalyticsOverview | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [err,         setErr]         = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [isLive,      setIsLive]      = useState(false);
  const liveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clock = useClock();

  const load = async () => {
    setLoading(true); setErr(null);
    try {
      const result = await adminGetAnalytics() as AnalyticsOverview;
      setData(result);
      setLastRefresh(new Date());
      setIsLive(true);
      if (liveTimer.current) clearTimeout(liveTimer.current);
      liveTimer.current = setTimeout(() => setIsLive(false), 12_000);
    } catch (e) { setErr((e as Error).message); }
    finally     { setLoading(false); }
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 30_000);
    return () => { clearInterval(interval); if (liveTimer.current) clearTimeout(liveTimer.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Trigger a chart refresh immediately when a critical/high WS event arrives */
  const prevLenRef = useRef(0);
  useEffect(() => {
    if (liveEvents.length > prevLenRef.current) {
      const newest = liveEvents[0];
      if (newest && (newest.severity === "critical" || newest.severity === "high")) {
        void load();
      }
    }
    prevLenRef.current = liveEvents.length;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveEvents.length]);

  const tl = data ? threatLevel(data.totals) : null;

  return (
    <div className="flex min-h-0 gap-4">
    {/* ─── Main content column ──────────────────────────────────────────── */}
    <div className="min-w-0 flex-1 space-y-5">

      {/* ── Command header ─────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-black tracking-tight text-white">
              Fraud Intelligence Center
            </h1>
            {tl && (
              <span className={`rounded-full border px-2.5 py-0.5 text-[9px] font-black tracking-widest ${tl.color} ${tl.bg} ${tl.border}`}>
                {tl.label}
              </span>
            )}
          </div>
          <p className="mt-0.5 text-[11px] text-white/35">
            Real-time payment verification & receipt fraud monitoring
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Live badge */}
          <AnimatePresence>
            {isLive && (
              <motion.span
                initial={{ opacity: 0, scale: 0.85 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                className="flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-black tracking-widest text-emerald-400"
              >
                <span className="h-1.5 w-1.5 animate-ping rounded-full bg-emerald-400" />
                LIVE
              </motion.span>
            )}
          </AnimatePresence>

          {/* UTC clock */}
          <span className="hidden items-center gap-1.5 rounded-xl border border-white/[0.06] bg-[#0b1220] px-3 py-2 font-mono text-[11px] text-white/40 sm:flex">
            <Activity className="h-3 w-3" />
            {clock.toUTCString().slice(17, 25)} UTC
          </span>

          {/* Last refresh */}
          <span className="hidden text-[10px] text-white/25 lg:block">
            Last sync {lastRefresh.toLocaleTimeString()}
          </span>

          {/* Refresh button */}
          <button
            onClick={load}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-[11px] font-semibold text-white/60 hover:border-purple-500/20 hover:bg-purple-500/5 hover:text-purple-300 disabled:opacity-40"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>
      </div>

      {/* API error */}
      {err && (
        <div className="flex items-start gap-2.5 rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3">
          <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-400" />
          <p className="text-xs text-red-400">{err}</p>
        </div>
      )}

      {/* ── Skeleton while loading ──────────────────────────────────────── */}
      {loading && !data && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-32 animate-pulse rounded-2xl border border-white/[0.05] bg-white/[0.03]" />
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-16 animate-pulse rounded-xl border border-white/[0.05] bg-white/[0.03]" />
            ))}
          </div>
          <div className="h-72 animate-pulse rounded-2xl border border-white/[0.05] bg-white/[0.03]" />
          <div className="grid gap-4 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-56 animate-pulse rounded-2xl border border-white/[0.05] bg-white/[0.03]" />
            ))}
          </div>
        </div>
      )}

      {/* ── Live data ───────────────────────────────────────────────────── */}
      {data && (
        <>
          {/* 4 hero KPIs */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {buildHeroCards(data.totals).map((card, i) => (
              <HeroKPI key={card.label} {...card} index={i} />
            ))}
          </div>

          {/* 4 secondary metric pills */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 2xl:gap-4">
            {buildSecondaryCards(data.totals).map((card, i) => (
              <MetricPill key={card.label} {...card} index={i} />
            ))}
          </div>

          {/* Full-width 14-day trend chart */}
          <TrendChart data={data.dailyTrend} />

          {/* 3-col row */}
          <div className="grid gap-4 lg:grid-cols-3">
            <ScoreChart data={data.scoreDistribution} />
            <VerificationDonut data={data.verificationBreakdown} />
            <SystemHealth totals={data.totals} />
          </div>

          {/* SOC alert table */}
          <AlertsTable alerts={data.recentAlerts} onNavigate={onNavigate} />

          {/* Event stream chart */}
          <StreamingChart liveEvents={liveEvents} isConnected={isConnected} />
        </>
      )}
    </div>
    {/* ─── Live fraud feed sidebar ──────────────────────────────────────── */}
    <div className="hidden lg:block">
      <LiveFraudFeed
        events={liveEvents}
        reviewers={reviewers}
        isConnected={isConnected}
      />
    </div>
    </div>
  );
}
