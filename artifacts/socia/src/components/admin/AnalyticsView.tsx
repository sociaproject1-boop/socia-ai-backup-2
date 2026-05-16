/**
 * Enterprise Fraud Analytics View — Phase 3
 *
 * Four tabs: Trends · Risk Map · Signals · Performance
 * Auto-refreshes every 30 s; live indicator; CSV export.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis,
  CartesianGrid, Tooltip, BarChart, Bar, Cell,
  PieChart, Pie,
} from "recharts";
import {
  Activity, AlertTriangle, BarChart2, Download, Eye,
  RefreshCw, ShieldAlert, ShieldX, Target,
  TrendingDown, TrendingUp, Zap,
} from "lucide-react";
import {
  adminGetFraudAnalytics,
  type FraudAnalyticsData, type FraudSignal,
} from "@/lib/adminAuth";

/* ── Signal label map ─────────────────────────────────────────────────── */
const SIGNAL_LABELS: Record<string, string> = {
  duplicate_image_hash:          "Duplicate Image Hash",
  duplicate_extracted_reference: "Duplicate Reference #",
  cross_user_reference:          "Cross-User Reference",
  reference_mismatch:            "Reference Mismatch",
  image_tampering:               "Image Tampering",
  fake_receipt_structure:        "Fake Receipt Layout",
  suspicious_ocr_text:           "Suspicious OCR Text",
  blurry_image:                  "Blurry / Unreadable",
  velocity_abuse:                "Velocity Abuse",
  low_confidence_ocr:            "Low OCR Confidence",
  test_keywords:                 "Test / Demo Keywords",
  editing_software_detected:     "Editing Software",
  single_line_content:           "Minimal Content",
  number_only_content:           "Numbers-Only Content",
  jpeg_anomalies:                "JPEG Anomalies",
  recompression_artifacts:       "Recompression Artifacts",
  progressive_encoding:          "Progressive JPEG",
  missing_exif:                  "Missing EXIF Data",
};

export type AnalyticsTab = "trends" | "heatmap" | "signals" | "performance";

/* ── Dark Recharts tooltip ───────────────────────────────────────────── */
function DarkTip({ active, payload, label }: {
  active?: boolean;
  payload?: { color: string; name: string; value: number }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-white/10 bg-[#0d1829] p-3 shadow-2xl">
      <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-white/50">{label}</p>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center justify-between gap-4 text-[11px]">
          <span className="flex items-center gap-1.5 capitalize text-white/60">
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: p.color }} />
            {p.name}
          </span>
          <span className="font-bold text-white">{p.value}</span>
        </div>
      ))}
    </div>
  );
}

/* ── KPI Card ────────────────────────────────────────────────────────── */
function KPICard({ label, value, sub, icon: Icon, accentBg, accentText, trend }: {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ElementType;
  accentBg: string;
  accentText: string;
  trend?: "up" | "down";
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-white/[0.06] bg-[#0b1220] p-4"
    >
      <div className="flex items-start justify-between">
        <div className={`rounded-xl p-2 ${accentBg}`}>
          <Icon className={`h-4 w-4 ${accentText}`} />
        </div>
        {trend === "up"   && <TrendingUp   className="h-3.5 w-3.5 text-red-400"   />}
        {trend === "down" && <TrendingDown className="h-3.5 w-3.5 text-green-400" />}
      </div>
      <p className="mt-3 text-2xl font-bold tracking-tight text-white">{value}</p>
      <p className="text-[11px] font-medium text-white/50">{label}</p>
      {sub && <p className="mt-0.5 text-[10px] text-white/30">{sub}</p>}
    </motion.div>
  );
}

/* ── Calendar Heatmap (30-day GitHub-style, fraud-themed) ────────────── */
function CalendarHeatmap({ data }: { data: FraudAnalyticsData["daily_trends"] }) {
  const today = new Date();
  const cells: { date: string; count: number; flagged: number; label: string }[] = [];
  for (let i = 34; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    const found   = data.find((pt) => pt.date === dateStr);
    cells.push({
      date:    dateStr,
      count:   found?.count   ?? 0,
      flagged: found?.flagged ?? 0,
      label:   d.toLocaleDateString("en", { weekday: "short", month: "short", day: "numeric" }),
    });
  }

  function cellColor(flagged: number, count: number): string {
    if (count === 0)                         return "bg-white/[0.03]";
    const ratio = flagged / Math.max(count, 1);
    if (flagged >= 8 || ratio >= 0.7)        return "bg-red-500/70";
    if (flagged >= 4 || ratio >= 0.5)        return "bg-red-500/45";
    if (flagged >= 2 || ratio >= 0.3)        return "bg-orange-500/40";
    if (flagged >= 1)                        return "bg-amber-500/30";
    return "bg-green-500/20";
  }

  const weeks  = Array.from({ length: 5 }, (_, wi) => cells.slice(wi * 7, wi * 7 + 7));
  const days   = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  return (
    <div>
      <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-white/40">
        35-Day Fraud Activity Calendar
      </p>
      <div className="flex gap-1.5">
        {/* day labels */}
        <div className="flex flex-col gap-1.5 pt-6">
          {days.map((d) => (
            <div key={d} className="flex h-6 w-7 items-center justify-end pr-1 text-[9px] text-white/25">{d}</div>
          ))}
        </div>
        {/* week columns */}
        <div className="flex flex-1 gap-1.5">
          {weeks.map((week, wi) => (
            <div key={wi} className="flex flex-1 flex-col gap-1.5">
              <p className="h-5 text-center text-[8px] text-white/25 leading-5">
                {week[0]
                  ? new Date(week[0].date + "T12:00:00").toLocaleDateString("en", { month: "short", day: "numeric" })
                  : ""}
              </p>
              {week.map((cell) => (
                <div
                  key={cell.date}
                  title={`${cell.label} — ${cell.count} submissions · ${cell.flagged} flagged`}
                  className={`h-6 w-full rounded border border-white/[0.04] transition-all hover:ring-1 hover:ring-white/20 ${cellColor(cell.flagged, cell.count)}`}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
      {/* Legend */}
      <div className="mt-3 flex items-center gap-2 text-[9px] text-white/30">
        <span>Less risk</span>
        <div className="h-3 w-3 rounded bg-white/[0.03] border border-white/5" />
        <div className="h-3 w-3 rounded bg-green-500/20" />
        <div className="h-3 w-3 rounded bg-amber-500/30" />
        <div className="h-3 w-3 rounded bg-orange-500/40" />
        <div className="h-3 w-3 rounded bg-red-500/45" />
        <div className="h-3 w-3 rounded bg-red-500/70" />
        <span>Critical</span>
      </div>
    </div>
  );
}

/* ── Horizontal signal bar ───────────────────────────────────────────── */
function SignalBar({ signal, max }: { signal: FraudSignal; max: number }) {
  const pct   = Math.round((signal.count / Math.max(max, 1)) * 100);
  const pts   = signal.avg_points;
  const barCl = pts >= 80 ? "bg-red-500"
              : pts >= 50 ? "bg-orange-500"
              : pts >= 30 ? "bg-amber-500"
              : "bg-yellow-500";
  const badgeCl = pts >= 80 ? "bg-red-500/15 text-red-400"
                : pts >= 50 ? "bg-orange-500/15 text-orange-400"
                : "bg-amber-500/15 text-amber-400";
  return (
    <div className="flex items-center gap-3">
      <div className="w-40 flex-shrink-0 truncate text-right text-[10px] text-white/50">
        {SIGNAL_LABELS[signal.type] ?? signal.type.replace(/_/g, " ")}
      </div>
      <div className="relative h-4 flex-1 overflow-hidden rounded-full bg-white/5">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.7, ease: "easeOut" }}
          className={`h-full rounded-full ${barCl}`}
        />
      </div>
      <div className="flex w-20 flex-shrink-0 items-center justify-between gap-1.5">
        <span className="text-[10px] font-bold text-white">{signal.count}</span>
        <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold ${badgeCl}`}>{pts}pts</span>
      </div>
    </div>
  );
}

/* ── CSV export ──────────────────────────────────────────────────────── */
function exportCSV(data: FraudAnalyticsData) {
  const rows: (string | number)[][] = [
    ["Date", "Label", "Total", "Avg Score", "Approved", "Rejected", "Suspicious", "Blocked", "Flagged (≥50)"],
    ...data.daily_trends.map((d) => [
      d.date, d.label, d.count, d.avg_score, d.approved, d.rejected, d.suspicious, d.blocked, d.flagged,
    ]),
  ];
  const csv  = rows.map((r) => r.join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `fraud-analytics-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/* ── Main export ─────────────────────────────────────────────────────── */
export function AnalyticsView({ defaultTab = "trends" }: { defaultTab?: AnalyticsTab }) {
  const [data,        setData]        = useState<FraudAnalyticsData | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [err,         setErr]         = useState<string | null>(null);
  const [tab,         setTab]         = useState<AnalyticsTab>(defaultTab);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [isLive,      setIsLive]      = useState(false);
  const liveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      setData(await adminGetFraudAnalytics());
      setLastRefresh(new Date());
      setIsLive(true);
      if (liveTimer.current) clearTimeout(liveTimer.current);
      liveTimer.current = setTimeout(() => setIsLive(false), 12_000);
    } catch (e) { setErr((e as Error).message); }
    finally     { setLoading(false); }
  }, []);

  useEffect(() => {
    load();
    const iv = setInterval(load, 30_000);
    return () => {
      clearInterval(iv);
      if (liveTimer.current) clearTimeout(liveTimer.current);
    };
  }, [load]);

  const s = data?.summary;

  const riskPie = data ? [
    { name: "Low",      value: data.risk_distribution.low,      color: "#10b981" },
    { name: "Medium",   value: data.risk_distribution.medium,   color: "#f59e0b" },
    { name: "High",     value: data.risk_distribution.high,     color: "#f97316" },
    { name: "Critical", value: data.risk_distribution.critical, color: "#ef4444" },
  ].filter((d) => d.value > 0) : [];

  const outcomePie = data ? [
    { name: "Approved",   value: data.outcome_distribution.approved,   color: "#10b981" },
    { name: "Suspicious", value: data.outcome_distribution.suspicious, color: "#f59e0b" },
    { name: "Rejected",   value: data.outcome_distribution.rejected,   color: "#ef4444" },
    { name: "Blocked",    value: data.outcome_distribution.blocked,    color: "#dc2626" },
    { name: "Pending",    value: data.outcome_distribution.pending,    color: "#a855f7" },
  ].filter((d) => d.value > 0) : [];

  const maxSignal = data ? Math.max(...data.top_signals.map((sg) => sg.count), 1) : 1;

  const TABS: { id: AnalyticsTab; label: string; icon: React.ElementType }[] = [
    { id: "trends",      label: "Trends",      icon: TrendingUp  },
    { id: "heatmap",     label: "Risk Map",    icon: Target      },
    { id: "signals",     label: "Signals",     icon: ShieldAlert },
    { id: "performance", label: "Performance", icon: BarChart2   },
  ];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-white">Fraud Intelligence Analytics</h1>
          <p className="mt-0.5 text-[11px] text-white/40">
            30-day rolling window · auto-refreshes every 30 s
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isLive && (
            <motion.span
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="flex items-center gap-1.5 rounded-full border border-green-500/25 bg-green-500/10 px-2.5 py-1 text-[10px] font-bold text-green-400"
            >
              <span className="h-1.5 w-1.5 animate-ping rounded-full bg-green-400" />
              LIVE
            </motion.span>
          )}
          <span className="text-[10px] text-white/25">{lastRefresh.toLocaleTimeString()}</span>
          {data && (
            <button
              onClick={() => exportCSV(data)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white/60 transition-colors hover:border-green-500/20 hover:bg-green-500/5 hover:text-green-300"
            >
              <Download className="h-3.5 w-3.5" /> Export CSV
            </button>
          )}
          <button
            onClick={load}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white/60 transition-colors hover:border-purple-500/20 hover:bg-purple-500/5 hover:text-purple-300 disabled:opacity-40"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {err && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-xs text-red-400">{err}</div>
      )}

      {/* Tab bar */}
      <div className="flex gap-1 rounded-xl border border-white/[0.06] bg-[#080e1a] p-1">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold transition-all ${
              tab === id
                ? "border border-purple-500/25 bg-purple-500/15 text-purple-300"
                : "text-white/40 hover:text-white/60"
            }`}
          >
            <Icon className="h-3.5 w-3.5" /> {label}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {loading && !data ? (
          <motion.div
            key="skeleton"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="grid grid-cols-3 gap-3"
          >
            {Array.from({ length: 9 }).map((_, i) => (
              <div key={i} className="h-28 animate-pulse rounded-2xl border border-white/5 bg-white/[0.03]" />
            ))}
          </motion.div>
        ) : data ? (
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.18 }}
            className="space-y-5"
          >

            {/* ════════════════ TRENDS ════════════════ */}
            {tab === "trends" && (
              <>
                {/* KPI cards */}
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                  <KPICard label="Total (30d)"     value={s?.total ?? 0}          sub="submissions"
                    icon={Activity}    accentBg="bg-blue-500/10"   accentText="text-blue-400" />
                  <KPICard label="Fraud Rate"      value={`${s?.fraud_rate ?? 0}%`} sub="high + critical"
                    icon={ShieldAlert} accentBg="bg-red-500/10"    accentText="text-red-400"
                    trend={(s?.fraud_rate ?? 0) > 20 ? "up" : "down"} />
                  <KPICard label="Auto-Blocked"    value={s?.auto_blocked ?? 0}   sub="score ≥ 100"
                    icon={ShieldX}     accentBg="bg-orange-500/10" accentText="text-orange-400" />
                  <KPICard label="Tampered"        value={s?.tampered ?? 0}       sub="JPEG anomalies"
                    icon={AlertTriangle} accentBg="bg-pink-500/10" accentText="text-pink-400" />
                  <KPICard label="Review Rate"     value={`${s?.review_rate ?? 0}%`} sub={`${s?.reviewed ?? 0} reviewed`}
                    icon={Eye}         accentBg="bg-green-500/10"  accentText="text-green-400"
                    trend={(s?.review_rate ?? 0) < 60 ? "up" : "down"} />
                  <KPICard label="AI Alerts"       value={s?.high_ai_score ?? 0}  sub="confidence ≥ 60%"
                    icon={Zap}         accentBg="bg-cyan-500/10"   accentText="text-cyan-400" />
                </div>

                {/* 30-day stacked area chart */}
                <div className="rounded-2xl border border-white/[0.06] bg-[#0b1220] p-5">
                  <p className="mb-4 text-[11px] font-semibold uppercase tracking-wider text-white/40">
                    30-Day Submission Breakdown
                  </p>
                  <div className="h-[220px] lg:h-[280px] xl:h-[320px] 2xl:h-[360px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data.daily_trends}>
                      <defs>
                        {[
                          { id: "ga", color: "#10b981" },
                          { id: "gs", color: "#f59e0b" },
                          { id: "gr", color: "#ef4444" },
                          { id: "gb", color: "#f97316" },
                        ].map(({ id, color }) => (
                          <linearGradient key={id} id={id} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%"  stopColor={color} stopOpacity={0.3} />
                            <stop offset="95%" stopColor={color} stopOpacity={0}   />
                          </linearGradient>
                        ))}
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
                      <XAxis dataKey="label" tick={{ fontSize: 9, fill: "#ffffff50" }} interval={4} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 9, fill: "#ffffff50" }} axisLine={false} tickLine={false} />
                      <Tooltip content={<DarkTip />} />
                      <Area type="monotone" dataKey="approved"   name="Approved"   stroke="#10b981" fill="url(#ga)" strokeWidth={2} />
                      <Area type="monotone" dataKey="suspicious" name="Suspicious" stroke="#f59e0b" fill="url(#gs)" strokeWidth={1.5} />
                      <Area type="monotone" dataKey="rejected"   name="Rejected"   stroke="#ef4444" fill="url(#gr)" strokeWidth={1.5} />
                      <Area type="monotone" dataKey="blocked"    name="Blocked"    stroke="#f97316" fill="url(#gb)" strokeWidth={1.5} />
                    </AreaChart>
                  </ResponsiveContainer>
                  </div>
                </div>

                {/* Avg fraud score trend */}
                <div className="rounded-2xl border border-white/[0.06] bg-[#0b1220] p-5">
                  <p className="mb-4 text-[11px] font-semibold uppercase tracking-wider text-white/40">
                    Average Fraud Score Trend (30d)
                  </p>
                  <div className="h-[140px] lg:h-[180px] xl:h-[220px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data.daily_trends}>
                      <defs>
                        <linearGradient id="gsc" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%"  stopColor="#a855f7" stopOpacity={0.35} />
                          <stop offset="95%" stopColor="#a855f7" stopOpacity={0}    />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
                      <XAxis dataKey="label" tick={{ fontSize: 9, fill: "#ffffff50" }} interval={4} axisLine={false} tickLine={false} />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 9, fill: "#ffffff50" }} axisLine={false} tickLine={false} />
                      <Tooltip content={<DarkTip />} />
                      <Area type="monotone" dataKey="avg_score" name="Avg Score" stroke="#a855f7" fill="url(#gsc)" strokeWidth={2} dot={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                  </div>
                </div>
              </>
            )}

            {/* ════════════════ HEATMAP ════════════════ */}
            {tab === "heatmap" && (
              <>
                <div className="rounded-2xl border border-white/[0.06] bg-[#0b1220] p-6">
                  <CalendarHeatmap data={data.daily_trends} />
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                  {/* Risk donut */}
                  <div className="rounded-2xl border border-white/[0.06] bg-[#0b1220] p-5">
                    <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-white/40">
                      Risk Level Distribution
                    </p>
                    <div className="flex items-center gap-5">
                      <ResponsiveContainer width={160} height={160}>
                        <PieChart>
                          <Pie
                            data={riskPie} cx="50%" cy="50%"
                            innerRadius={44} outerRadius={70}
                            dataKey="value" paddingAngle={3}
                          >
                            {riskPie.map((s) => <Cell key={s.name} fill={s.color} opacity={0.85} />)}
                          </Pie>
                          <Tooltip
                            formatter={(v) => [`${v}`, ""]}
                            contentStyle={{ background: "#0d1829", border: "1px solid #ffffff1a", borderRadius: 12, fontSize: 11 }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="space-y-2.5">
                        {[
                          { label: "Low Risk",      value: data.risk_distribution.low,      cls: "text-green-400",  dot: "bg-green-400"  },
                          { label: "Medium Risk",   value: data.risk_distribution.medium,   cls: "text-amber-400",  dot: "bg-amber-400"  },
                          { label: "High Risk",     value: data.risk_distribution.high,     cls: "text-orange-400", dot: "bg-orange-400" },
                          { label: "Critical Risk", value: data.risk_distribution.critical, cls: "text-red-400",    dot: "bg-red-400"    },
                        ].map(({ label, value, cls, dot }) => (
                          <div key={label} className="flex items-center gap-2">
                            <span className={`h-2 w-2 flex-shrink-0 rounded-full ${dot}`} />
                            <span className="flex-1 text-[11px] text-white/50">{label}</span>
                            <span className={`text-[11px] font-bold ${cls}`}>{value}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Hourly fraud pattern */}
                  <div className="rounded-2xl border border-white/[0.06] bg-[#0b1220] p-5">
                    <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-white/40">
                      Hourly Fraud Activity Pattern
                    </p>
                    <div className="h-[160px] lg:h-[200px] xl:h-[240px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={data.hourly_distribution} barSize={8}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
                        <XAxis
                          dataKey="hour" tick={{ fontSize: 8, fill: "#ffffff40" }}
                          tickFormatter={(h: number) => h % 6 === 0 ? `${h}:00` : ""}
                          axisLine={false} tickLine={false}
                        />
                        <YAxis tick={{ fontSize: 8, fill: "#ffffff40" }} axisLine={false} tickLine={false} />
                        <Tooltip content={<DarkTip />} />
                        <Bar dataKey="count"   name="Total"   fill="#a855f750" radius={[2, 2, 0, 0]} />
                        <Bar dataKey="flagged" name="Flagged" fill="#ef444490" radius={[2, 2, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* ════════════════ SIGNALS ════════════════ */}
            {tab === "signals" && (
              <>
                <div className="rounded-2xl border border-white/[0.06] bg-[#0b1220] p-5">
                  <p className="mb-4 text-[11px] font-semibold uppercase tracking-wider text-white/40">
                    Top Fraud Signals — last 30 days
                  </p>
                  {data.top_signals.length === 0 ? (
                    <p className="py-10 text-center text-xs text-white/30">
                      No fraud signals detected in the last 30 days.
                    </p>
                  ) : (
                    <div className="space-y-3.5">
                      {data.top_signals.map((sig) => (
                        <SignalBar key={sig.type} signal={sig} max={maxSignal} />
                      ))}
                    </div>
                  )}
                </div>

                {/* Signal detail table */}
                <div className="overflow-hidden rounded-2xl border border-white/[0.06] bg-[#0b1220]">
                  <div className="overflow-x-auto">
                  <table className="min-w-full text-xs">
                    <thead>
                      <tr className="border-b border-white/[0.06] bg-white/[0.02]">
                        <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-white/35">Signal</th>
                        <th className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-wider text-white/35">Occurrences</th>
                        <th className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-wider text-white/35">Avg Points</th>
                        <th className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-wider text-white/35">Severity</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.top_signals.map((sig, i) => {
                        const pts = sig.avg_points;
                        const [sev, sc] =
                          pts >= 80 ? ["Critical", "text-red-400 bg-red-500/10"]      :
                          pts >= 50 ? ["High",     "text-orange-400 bg-orange-500/10"]:
                          pts >= 30 ? ["Medium",   "text-amber-400 bg-amber-500/10"]  :
                                      ["Low",      "text-yellow-400 bg-yellow-500/10"];
                        return (
                          <tr
                            key={sig.type}
                            className={`border-b border-white/[0.04] ${i % 2 === 1 ? "bg-white/[0.01]" : ""}`}
                          >
                            <td className="px-4 py-2.5 font-medium text-white/70">
                              {SIGNAL_LABELS[sig.type] ?? sig.type.replace(/_/g, " ")}
                            </td>
                            <td className="px-4 py-2.5 text-right font-bold text-white">{sig.count}</td>
                            <td className="px-4 py-2.5 text-right text-white/50">{sig.avg_points}</td>
                            <td className="px-4 py-2.5 text-right">
                              <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${sc}`}>{sev}</span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  </div>
                </div>
              </>
            )}

            {/* ════════════════ PERFORMANCE ════════════════ */}
            {tab === "performance" && (
              <>
                <div className="grid gap-4 lg:grid-cols-2">
                  {/* Outcome donut */}
                  <div className="rounded-2xl border border-white/[0.06] bg-[#0b1220] p-5">
                    <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-white/40">
                      Outcome Distribution
                    </p>
                    <div className="flex items-center gap-5">
                      <ResponsiveContainer width={160} height={160}>
                        <PieChart>
                          <Pie
                            data={outcomePie} cx="50%" cy="50%"
                            innerRadius={44} outerRadius={70}
                            dataKey="value" paddingAngle={3}
                          >
                            {outcomePie.map((s) => <Cell key={s.name} fill={s.color} opacity={0.85} />)}
                          </Pie>
                          <Tooltip
                            formatter={(v) => [`${v}`, ""]}
                            contentStyle={{ background: "#0d1829", border: "1px solid #ffffff1a", borderRadius: 12, fontSize: 11 }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="space-y-2">
                        {outcomePie.map(({ name, value, color }) => (
                          <div key={name} className="flex items-center gap-2">
                            <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ background: color }} />
                            <span className="flex-1 text-[11px] text-white/50">{name}</span>
                            <span className="text-[11px] font-bold text-white">{value}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Review metrics */}
                  <div className="space-y-3 rounded-2xl border border-white/[0.06] bg-[#0b1220] p-5">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-white/40">Review Performance</p>
                    {[
                      {
                        label: "Total Submissions",
                        value: s?.total ?? 0,
                        bar:   null,
                      },
                      {
                        label: "Auto-Blocked",
                        value: s?.auto_blocked ?? 0,
                        bar:   s?.total ? Math.round((s.auto_blocked / s.total) * 100) : 0,
                      },
                      {
                        label: "Tamper Detected",
                        value: s?.tampered ?? 0,
                        bar:   s?.total ? Math.round((s.tampered / s.total) * 100) : 0,
                      },
                      {
                        label: "AI High-Score Alerts",
                        value: s?.high_ai_score ?? 0,
                        bar:   s?.total ? Math.round((s.high_ai_score / s.total) * 100) : 0,
                      },
                      {
                        label: "Reviewed by Admin",
                        value: s?.reviewed ?? 0,
                        bar:   s?.review_rate ?? 0,
                      },
                    ].map(({ label, value, bar }) => (
                      <div key={label} className="space-y-1">
                        <div className="flex justify-between text-[10px]">
                          <span className="text-white/50">{label}</span>
                          <span className="font-bold text-white">
                            {value}{bar !== null ? ` (${bar}%)` : ""}
                          </span>
                        </div>
                        {bar !== null && (
                          <div className="h-1.5 overflow-hidden rounded-full bg-white/5">
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{ width: `${bar}%` }}
                              transition={{ duration: 0.8, ease: "easeOut" }}
                              className="h-full rounded-full bg-purple-500/70"
                            />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Hourly blocked pattern */}
                <div className="rounded-2xl border border-white/[0.06] bg-[#0b1220] p-5">
                  <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-white/40">
                    Flagged Submissions by Hour of Day (last 30d)
                  </p>
                  <ResponsiveContainer width="100%" height={160}>
                    <BarChart data={data.hourly_distribution} barSize={12}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
                      <XAxis
                        dataKey="hour"
                        tick={{ fontSize: 9, fill: "#ffffff40" }}
                        tickFormatter={(h: number) => `${h}h`}
                        axisLine={false} tickLine={false} interval={3}
                      />
                      <YAxis tick={{ fontSize: 9, fill: "#ffffff40" }} axisLine={false} tickLine={false} />
                      <Tooltip content={<DarkTip />} />
                      <Bar dataKey="flagged" name="Flagged" radius={[3, 3, 0, 0]}>
                        {data.hourly_distribution.map((entry, idx) => (
                          <Cell
                            key={idx}
                            fill={
                              entry.flagged >= 5 ? "#ef4444" :
                              entry.flagged >= 2 ? "#f97316" :
                              "#f59e0b"
                            }
                            opacity={0.75}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </>
            )}

          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
