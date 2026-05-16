/**
 * Dynamic adaptive threat scoring panel.
 * Aggregates live event stream into per-user threat profiles.
 * Confidence levels, behavioral anomaly scoring, signal breakdown.
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  TrendingUp, ShieldAlert, RefreshCw, ChevronDown, ChevronUp,
  Activity, Zap, Clock, Target, BarChart3, AlertTriangle,
} from "lucide-react";
import type { LiveFraudEvent } from "@/lib/useAdminSocket";

/* ── Types ──────────────────────────────────────────────────────────── */
interface Signal {
  name:       string;
  weight:     number;
  triggered:  boolean;
  confidence: number; // 0–1
}

interface ThreatProfile {
  userId:        string;
  username?:     string;
  baseScore:     number;
  velocityBonus: number;
  clusterBonus:  number;
  adaptedScore:  number;
  confidence:    "high" | "medium" | "low";
  signals:       Signal[];
  eventCount:    number;
  criticalCount: number;
  firstSeen:     number;
  lastSeen:      number;
  trend:         "rising" | "stable" | "falling";
  scoreHistory:  number[];
}

/* ── Scoring weights ─────────────────────────────────────────────────── */
const BASE_SIGNALS: Signal[] = [
  { name: "High base score",       weight: 40, triggered: false, confidence: 0.95 },
  { name: "Velocity burst",        weight: 25, triggered: false, confidence: 0.85 },
  { name: "Critical severity",     weight: 20, triggered: false, confidence: 0.90 },
  { name: "Cluster membership",    weight: 10, triggered: false, confidence: 0.70 },
  { name: "Temporal anomaly",      weight: 5,  triggered: false, confidence: 0.60 },
];

const CONFIDENCE_LABELS: Record<ThreatProfile["confidence"], { label: string; color: string }> = {
  high:   { label: "High Confidence",   color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30" },
  medium: { label: "Medium Confidence", color: "text-yellow-400 bg-yellow-500/10 border-yellow-500/30" },
  low:    { label: "Low Confidence",    color: "text-white/40 bg-white/5 border-white/10" },
};

function scoreToColor(s: number) {
  if (s >= 85) return { fg: "#ef4444", bg: "#ef444420" };
  if (s >= 70) return { fg: "#f97316", bg: "#f9731620" };
  if (s >= 50) return { fg: "#eab308", bg: "#eab30820" };
  return { fg: "#22c55e", bg: "#22c55e20" };
}

/* ── Gauge ───────────────────────────────────────────────────────────── */
function ScoreGauge({ score, size = 80 }: { score: number; size?: number }) {
  const r = size * 0.38;
  const cx = size / 2; const cy = size / 2;
  const circ = 2 * Math.PI * r;
  const arc  = circ * 0.75; // 270° arc
  const fill = arc * (score / 100);
  const offset = circ * 0.125; // start at -135°
  const { fg, bg } = scoreToColor(score);

  return (
    <svg width={size} height={size} style={{ transform: "rotate(-135deg)" }}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={bg} strokeWidth={size * 0.09}
        strokeDasharray={`${arc} ${circ - arc}`} strokeDashoffset={-offset}
        strokeLinecap="round" />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={fg} strokeWidth={size * 0.09}
        strokeDasharray={`${fill} ${circ - fill}`} strokeDashoffset={-offset}
        strokeLinecap="round"
        style={{ transition: "stroke-dasharray 0.5s ease" }} />
      <text x={cx} y={cy + size * 0.07} textAnchor="middle" fontSize={size * 0.22}
        fontWeight="bold" fill={fg} style={{ transform: "rotate(135deg)", transformOrigin: `${cx}px ${cy}px` }}>
        {score}
      </text>
    </svg>
  );
}

/* ── Mini spark ──────────────────────────────────────────────────────── */
function Sparkline({ data, color }: { data: number[]; color: string }) {
  if (data.length < 2) return <span className="text-[9px] text-white/20">—</span>;
  const max = Math.max(...data, 1);
  const w = 60; const h = 20;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - (v / max) * h;
    return `${x},${y}`;
  }).join(" ");
  return (
    <svg width={w} height={h}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

/* ── Signal bar ──────────────────────────────────────────────────────── */
function SignalBar({ signal }: { signal: Signal }) {
  return (
    <div className="flex items-center gap-2">
      <div className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${signal.triggered ? "bg-red-400" : "bg-white/10"}`} />
      <span className={`text-[10px] flex-1 ${signal.triggered ? "text-white/80" : "text-white/30"}`}>
        {signal.name}
      </span>
      <div className="flex-1 max-w-16 h-1 rounded-full bg-white/5 overflow-hidden">
        <div
          className="h-full rounded-full"
          style={{
            width: `${signal.confidence * 100}%`,
            backgroundColor: signal.triggered ? "#ef4444" : "#374151",
          }}
        />
      </div>
      <span className="text-[9px] text-white/30 w-8 text-right">+{signal.weight}</span>
    </div>
  );
}

/* ── Profile card ────────────────────────────────────────────────────── */
function ThreatCard({ profile }: { profile: ThreatProfile }) {
  const [open, setOpen] = useState(false);
  const conf = CONFIDENCE_LABELS[profile.confidence];
  const { fg } = scoreToColor(profile.adaptedScore);
  const trendIcon = profile.trend === "rising"
    ? <TrendingUp size={11} className="text-red-400" />
    : profile.trend === "falling"
      ? <TrendingUp size={11} className="text-emerald-400 rotate-180" />
      : <Activity size={11} className="text-white/30" />;

  return (
    <motion.div layout className="rounded-xl border border-white/8 bg-[#0d1626] overflow-hidden">
      <button
        className="w-full flex items-center gap-3 px-4 py-3 text-left"
        onClick={() => setOpen((o) => !o)}>
        {/* Gauge */}
        <div className="flex-shrink-0">
          <ScoreGauge score={profile.adaptedScore} size={56} />
        </div>

        {/* Identity */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-xs font-semibold px-1.5 py-0.5 rounded border ${conf.color}`}>
              {conf.label}
            </span>
            {trendIcon}
            <span className="text-[10px] text-white/30">
              {profile.eventCount} events · {profile.criticalCount} critical
            </span>
          </div>
          <p className="font-mono text-[10px] text-white/50 mt-0.5 truncate">
            {profile.username ? `@${profile.username} · ` : ""}{profile.userId}
          </p>
        </div>

        {/* Sparkline + chevron */}
        <div className="flex items-center gap-3 flex-shrink-0">
          <Sparkline data={profile.scoreHistory} color={fg} />
          {open ? <ChevronUp size={14} className="text-white/30" /> : <ChevronDown size={14} className="text-white/30" />}
        </div>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.18 }}
            className="border-t border-white/5 px-4 pb-4">
            {/* Score breakdown */}
            <div className="grid grid-cols-3 gap-2 mt-3">
              {[
                { label: "Base",     val: profile.baseScore,     color: "text-white" },
                { label: "Velocity", val: `+${profile.velocityBonus}`, color: "text-orange-400" },
                { label: "Cluster",  val: `+${profile.clusterBonus}`,  color: "text-purple-400" },
              ].map((s) => (
                <div key={s.label} className="rounded bg-white/5 p-2 text-center">
                  <div className={`text-base font-bold ${s.color}`}>{s.val}</div>
                  <div className="text-[9px] text-white/40">{s.label}</div>
                </div>
              ))}
            </div>

            {/* Signals */}
            <div className="mt-3 space-y-1.5">
              <h4 className="text-[9px] uppercase tracking-wider text-white/30 font-semibold">Signal Breakdown</h4>
              {profile.signals.map((s) => <SignalBar key={s.name} signal={s} />)}
            </div>

            {/* Timing */}
            <div className="flex items-center gap-4 mt-3 text-[10px] text-white/30">
              <span className="flex items-center gap-1"><Clock size={9} /> First: {new Date(profile.firstSeen).toLocaleTimeString()}</span>
              <span className="flex items-center gap-1"><Target size={9} /> Last: {new Date(profile.lastSeen).toLocaleTimeString()}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/* ── Score distribution chart ────────────────────────────────────────── */
function ScoreDistribution({ profiles }: { profiles: ThreatProfile[] }) {
  const bins = [0, 0, 0, 0, 0]; // 0-19, 20-39, 40-59, 60-79, 80-100
  for (const p of profiles) {
    const i = Math.min(4, Math.floor(p.adaptedScore / 20));
    bins[i]!++;
  }
  const max = Math.max(...bins, 1);
  const labels = ["0–19", "20–39", "40–59", "60–79", "80–100"];
  const colors = ["#22c55e", "#84cc16", "#eab308", "#f97316", "#ef4444"];

  return (
    <div className="flex items-end gap-2 h-12">
      {bins.map((count, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-1">
          <div
            className="w-full rounded-t"
            style={{
              height: `${(count / max) * 40}px`,
              backgroundColor: colors[i],
              opacity: count > 0 ? 0.8 : 0.15,
              minHeight: "2px",
            }}
          />
          <span className="text-[8px] text-white/30">{labels[i]}</span>
        </div>
      ))}
    </div>
  );
}

/* ── Main ────────────────────────────────────────────────────────────── */
const MAX_PROFILES = 50;
const HISTORY_LEN  = 10;

export default function ThreatScoringPanel({ liveEvents }: { liveEvents: LiveFraudEvent[] }) {
  const [profiles, setProfiles] = useState<Map<string, ThreatProfile>>(new Map());
  const [sort, setSort]         = useState<"score" | "events" | "critical">("score");
  const [minScore, setMinScore] = useState(0);
  const prevLenRef              = useRef(0);

  /* ── Ingest live events and build/update threat profiles ── */
  useEffect(() => {
    if (liveEvents.length === prevLenRef.current) return;
    prevLenRef.current = liveEvents.length;

    setProfiles((prev) => {
      const next = new Map(prev);

      for (const ev of liveEvents) {
        if (!ev.userId) continue;
        const uid   = ev.userId;
        const score = ev.score ?? 0;
        const existing = next.get(uid);

        if (existing) {
          /* Update existing profile */
          const velBonus = Math.min(30,
            existing.eventCount >= 5 ? 15 : existing.eventCount >= 3 ? 8 : 0
          );
          const clusterBonus = existing.criticalCount >= 2 ? 10 : existing.criticalCount >= 1 ? 5 : 0;
          const adapted = Math.min(100, score + velBonus + clusterBonus);
          const history = [...existing.scoreHistory, adapted].slice(-HISTORY_LEN);

          /* Trend */
          const trend: ThreatProfile["trend"] =
            history.length >= 3
              ? history[history.length - 1]! > history[0]! + 5 ? "rising"
              : history[history.length - 1]! < history[0]! - 5 ? "falling"
              : "stable"
            : "stable";

          /* Confidence */
          const confidence: ThreatProfile["confidence"] =
            existing.eventCount >= 5 ? "high" : existing.eventCount >= 2 ? "medium" : "low";

          /* Signals */
          const signals: Signal[] = BASE_SIGNALS.map((s) => ({
            ...s,
            triggered:
              s.name === "High base score"   ? score >= 60
            : s.name === "Velocity burst"    ? existing.eventCount >= 3
            : s.name === "Critical severity" ? ev.severity === "critical"
            : s.name === "Cluster membership"? existing.criticalCount >= 1
            : /* temporal anomaly */           new Date().getHours() < 6 || new Date().getHours() > 22,
          }));

          next.set(uid, {
            ...existing,
            baseScore:     score,
            velocityBonus: velBonus,
            clusterBonus,
            adaptedScore:  adapted,
            confidence,
            signals,
            eventCount:    existing.eventCount + 1,
            criticalCount: existing.criticalCount + (ev.severity === "critical" ? 1 : 0),
            lastSeen:      Date.now(),
            trend,
            scoreHistory:  history,
            username:      ev.username ?? existing.username,
          });
        } else {
          /* New profile */
          if (next.size >= MAX_PROFILES) {
            /* Evict lowest-score entry */
            const lowestKey = [...next.entries()]
              .sort((a, b) => a[1].adaptedScore - b[1].adaptedScore)[0]?.[0];
            if (lowestKey) next.delete(lowestKey);
          }
          const signals: Signal[] = BASE_SIGNALS.map((s) => ({
            ...s,
            triggered:
              s.name === "High base score"   ? score >= 60
            : s.name === "Critical severity" ? ev.severity === "critical"
            : false,
          }));
          next.set(uid, {
            userId:        uid,
            username:      ev.username,
            baseScore:     score,
            velocityBonus: 0,
            clusterBonus:  0,
            adaptedScore:  score,
            confidence:    "low",
            signals,
            eventCount:    1,
            criticalCount: ev.severity === "critical" ? 1 : 0,
            firstSeen:     Date.now(),
            lastSeen:      Date.now(),
            trend:         "stable",
            scoreHistory:  [score],
          });
        }
      }
      return next;
    });
  }, [liveEvents]);

  const allProfiles = [...profiles.values()]
    .filter((p) => p.adaptedScore >= minScore)
    .sort((a, b) =>
      sort === "score"    ? b.adaptedScore  - a.adaptedScore
    : sort === "events"   ? b.eventCount    - a.eventCount
    : /* critical */        b.criticalCount - a.criticalCount
    );

  const highRisk = allProfiles.filter((p) => p.adaptedScore >= 70).length;
  const rising   = allProfiles.filter((p) => p.trend === "rising").length;

  return (
    <div className="h-full flex flex-col gap-4 min-h-0">
      {/* Header */}
      <div className="flex items-center justify-between flex-shrink-0">
        <div>
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <BarChart3 size={18} className="text-purple-400" />
            Threat Scoring Engine
          </h2>
          <p className="text-xs text-white/40 mt-0.5">
            Live adaptive risk profiles from {profiles.size} tracked accounts
          </p>
        </div>
        <button
          onClick={() => setProfiles(new Map())}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs text-white/40">
          <RefreshCw size={12} /> Reset
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3 flex-shrink-0">
        {[
          { label: "Tracked",   val: profiles.size,  color: "text-white" },
          { label: "High Risk", val: highRisk,        color: "text-red-400" },
          { label: "Rising",    val: rising,          color: "text-orange-400" },
          { label: "Min Score", val: minScore,        color: "text-purple-400", isSlider: true },
        ].map((s) => (
          <div key={s.label} className="rounded-lg bg-[#0d1626] border border-white/5 p-3">
            {s.isSlider
              ? (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[9px] text-white/40">FILTER ≥</span>
                    <span className={`text-sm font-bold ${s.color}`}>{s.val}</span>
                  </div>
                  <input type="range" min={0} max={80} step={10} value={minScore}
                    onChange={(e) => setMinScore(Number(e.target.value))}
                    className="w-full h-1 accent-purple-500" />
                </div>
              )
              : (
                <div className="text-center">
                  <div className={`text-2xl font-bold ${s.color}`}>{s.val}</div>
                  <div className="text-[9px] text-white/40 mt-0.5">{s.label}</div>
                </div>
              )
            }
          </div>
        ))}
      </div>

      {/* Distribution */}
      {allProfiles.length > 0 && (
        <div className="flex-shrink-0 rounded-lg bg-[#0d1626] border border-white/5 px-4 pt-3 pb-2">
          <p className="text-[9px] uppercase tracking-wider text-white/30 font-semibold mb-2">Score Distribution</p>
          <ScoreDistribution profiles={allProfiles} />
        </div>
      )}

      {/* Sort bar */}
      <div className="flex gap-1 bg-white/5 rounded-lg p-1 flex-shrink-0">
        {(["score","events","critical"] as const).map((s) => (
          <button key={s}
            onClick={() => setSort(s)}
            className={`flex-1 py-1.5 rounded-md text-xs font-medium transition-all capitalize ${
              sort === s ? "bg-white/10 text-white" : "text-white/40 hover:text-white/60"
            }`}>
            {s === "score" ? "By Risk Score" : s === "events" ? "By Events" : "By Criticals"}
          </button>
        ))}
      </div>

      {/* Profiles */}
      <div className="flex-1 overflow-y-auto scrollbar-thin min-h-0 space-y-2">
        {!allProfiles.length
          ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <ShieldAlert size={36} className="text-white/10" />
              <p className="text-sm text-white/30">
                {profiles.size === 0
                  ? "Waiting for live fraud events to build threat profiles…"
                  : `No profiles match score ≥ ${minScore}`
                }
              </p>
            </div>
          )
          : (
            <AnimatePresence mode="popLayout">
              {allProfiles.map((p) => <ThreatCard key={p.userId} profile={p} />)}
            </AnimatePresence>
          )
        }
      </div>
    </div>
  );
}
