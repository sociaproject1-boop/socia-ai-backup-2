/**
 * AnomalyEngine — AI behavioral scoring and pattern anomaly display.
 *
 * Derives behavioral anomaly scores from:
 *  - Live WebSocket event stream (severity distribution, burst patterns)
 *  - Clustering: groups events by user, scores cluster risk
 *  - Auto-escalation: clusters that cross threshold emit a visual alert
 *
 * No external AI API required — scoring is local statistical analysis.
 */
import { useState, useEffect, useRef, memo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Brain, Zap, TrendingUp, AlertOctagon, Circle, Activity, Info, History } from "lucide-react";
import type { LiveFraudEvent } from "../../lib/useAdminSocket";
import { adminFetch } from "@/lib/adminAuth";

/* DB shape returned by /admin/anomaly/history */
interface AnomalyHistoryRow {
  id:             string;
  user_id:        string | null;
  username:       string | null;
  event_count:    number;
  critical_count: number;
  high_count:     number;
  avg_score:      number;
  max_score:      number;
  risk_score:     number;
  escalated:      boolean;
  first_seen:     string;
  last_seen:      string;
  created_at:     string;
}

/* ── Types ────────────────────────────────────────────────────────────── */
interface AnomalyCluster {
  userId:        string;
  username?:     string;
  eventCount:    number;
  criticalCount: number;
  highCount:     number;
  avgScore:      number;
  maxScore:      number;
  firstSeen:     number;
  lastSeen:      number;
  riskScore:     number; // 0–100 behavioral risk
  escalated:     boolean;
}

interface AnomalySignal {
  type:       string;
  confidence: number; // 0–100
  message:    string;
  severity:   "critical" | "high" | "medium" | "low";
}

/* ── Behavioral scoring ───────────────────────────────────────────────── */
function computeRisk(c: Omit<AnomalyCluster, "riskScore" | "escalated">): number {
  let score = 0;

  // Base: avg fraud score
  score += Math.min(50, c.avgScore * 0.5);

  // Burst: events in short window
  const windowMs = c.lastSeen - c.firstSeen;
  if (windowMs < 60_000 && c.eventCount >= 3) score += 25; // 3+ events in 1 min
  else if (windowMs < 300_000 && c.eventCount >= 5)        score += 15;

  // Critical events
  score += Math.min(20, c.criticalCount * 8);

  // Max single score
  if (c.maxScore >= 90) score += 15;
  else if (c.maxScore >= 70) score += 8;

  return Math.min(100, Math.round(score));
}

function detectSignals(events: LiveFraudEvent[]): AnomalySignal[] {
  const signals: AnomalySignal[] = [];

  if (!events.length) return signals;

  const recent = events.slice(0, 30);

  // Surge pattern
  const critCount = recent.filter((e) => e.severity === "critical").length;
  if (critCount >= 5) {
    signals.push({
      type: "surge",
      confidence: Math.min(95, critCount * 15),
      message: `${critCount} critical events in recent stream — possible coordinated attack`,
      severity: "critical",
    });
  }

  // Single-user burst
  const userCounts = new Map<string, number>();
  recent.forEach((e) => { if (e.userId) userCounts.set(e.userId, (userCounts.get(e.userId) ?? 0) + 1); });
  const maxUserEvents = Math.max(...[...userCounts.values()]);
  if (maxUserEvents >= 4) {
    signals.push({
      type: "user_burst",
      confidence: Math.min(90, maxUserEvents * 18),
      message: `Single user responsible for ${maxUserEvents} fraud events — repeat attacker`,
      severity: maxUserEvents >= 6 ? "critical" : "high",
    });
  }

  // Velocity: events per minute
  if (recent.length >= 3) {
    const span = new Date(recent[0]!.ts).getTime() - new Date(recent[recent.length - 1]!.ts).getTime();
    const evtPerMin = span > 0 ? (recent.length / (span / 60_000)) : 0;
    if (evtPerMin > 5) {
      signals.push({
        type: "velocity",
        confidence: Math.min(85, Math.round(evtPerMin * 10)),
        message: `High velocity: ${evtPerMin.toFixed(1)} events/min — automated submission likely`,
        severity: evtPerMin > 10 ? "high" : "medium",
      });
    }
  }

  // Score distribution anomaly (most events high severity)
  const highPct = recent.filter((e) => e.severity === "critical" || e.severity === "high").length / recent.length;
  if (highPct >= 0.7 && recent.length >= 5) {
    signals.push({
      type: "score_anomaly",
      confidence: Math.round(highPct * 100),
      message: `${Math.round(highPct * 100)}% of recent events are high/critical — unusual for baseline`,
      severity: "high",
    });
  }

  return signals;
}

/* ── Cluster card ─────────────────────────────────────────────────────── */
const ClusterCard = memo(function ClusterCard({ c }: { c: AnomalyCluster }) {
  const riskColor =
    c.riskScore >= 80 ? "text-red-400" :
    c.riskScore >= 55 ? "text-orange-400" :
    c.riskScore >= 30 ? "text-amber-400" : "text-blue-400";

  const ringColor =
    c.riskScore >= 80 ? "stroke-red-500" :
    c.riskScore >= 55 ? "stroke-orange-500" :
    c.riskScore >= 30 ? "stroke-amber-500" : "stroke-blue-500";

  const circumference = 2 * Math.PI * 20;
  const offset = circumference * (1 - c.riskScore / 100);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      className={`rounded-xl border p-3 ${
        c.escalated
          ? "border-red-500/30 bg-red-500/8"
          : "border-white/[0.06] bg-white/[0.02]"
      }`}
    >
      <div className="flex items-center gap-3">
        {/* Circular risk gauge */}
        <div className="relative flex-shrink-0">
          <svg width="48" height="48" className="-rotate-90">
            <circle cx="24" cy="24" r="20" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="4" />
            <motion.circle
              cx="24" cy="24" r="20" fill="none" strokeWidth="4"
              className={ringColor}
              strokeLinecap="round"
              strokeDasharray={circumference}
              initial={{ strokeDashoffset: circumference }}
              animate={{ strokeDashoffset: offset }}
              transition={{ duration: 0.8, ease: "easeOut" }}
            />
          </svg>
          <span className={`absolute inset-0 flex items-center justify-center text-[10px] font-black ${riskColor}`}>
            {c.riskScore}
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="truncate font-mono text-[10px] text-white/60">
              {c.username ? `@${c.username}` : c.userId.slice(0, 14) + "…"}
            </p>
            {c.escalated && (
              <span className="flex-shrink-0 rounded-full bg-red-500/20 px-1.5 py-px text-[8px] font-black text-red-400">ESCALATED</span>
            )}
          </div>
          <p className={`mt-0.5 text-[9px] font-bold uppercase ${riskColor}`}>
            {c.riskScore >= 80 ? "Critical Risk" : c.riskScore >= 55 ? "High Risk" : c.riskScore >= 30 ? "Moderate" : "Low Risk"}
          </p>
        </div>
      </div>
      <div className="mt-2.5 grid grid-cols-4 gap-1.5">
        {[
          ["Events",    c.eventCount],
          ["Critical",  c.criticalCount],
          ["Avg Score", c.avgScore],
          ["Max Score", c.maxScore],
        ].map(([label, val]) => (
          <div key={label as string} className="rounded-lg bg-white/[0.03] p-1.5 text-center">
            <p className="text-[7px] text-white/20 uppercase">{label}</p>
            <p className="text-[11px] font-bold text-white/70">{val}</p>
          </div>
        ))}
      </div>
    </motion.div>
  );
});

/* ── Signal card ──────────────────────────────────────────────────────── */
function SignalCard({ s }: { s: AnomalySignal }) {
  const colors: Record<string, string> = {
    critical: "border-red-500/25 bg-red-500/8 text-red-400",
    high:     "border-orange-500/20 bg-orange-500/6 text-orange-400",
    medium:   "border-amber-500/15 bg-amber-500/5 text-amber-400",
    low:      "border-blue-500/15 bg-blue-500/5 text-blue-400",
  };
  return (
    <div className={`flex gap-2.5 rounded-xl border p-3 ${colors[s.severity]}`}>
      <Brain className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 mb-0.5">
          <p className="text-[9px] font-black uppercase">{s.type.replace("_", " ")}</p>
          <span className="flex-shrink-0 text-[9px] font-bold opacity-70">{s.confidence}% confidence</span>
        </div>
        <p className="text-[10px] opacity-80">{s.message}</p>
      </div>
      {/* Confidence bar */}
      <div className="flex flex-col justify-center flex-shrink-0">
        <div className="h-12 w-1.5 rounded-full bg-white/10 relative overflow-hidden">
          <motion.div
            className="absolute bottom-0 w-full rounded-full opacity-60"
            style={{ backgroundColor: "currentColor" }}
            initial={{ height: 0 }}
            animate={{ height: `${s.confidence}%` }}
            transition={{ duration: 0.6 }}
          />
        </div>
      </div>
    </div>
  );
}

/* ── Main component ───────────────────────────────────────────────────── */
const CLUSTER_TTL  = 300_000; // 5-minute cluster TTL
const ESCALATE_AT  = 75;     // risk score to escalate

export default function AnomalyEngine({
  liveEvents,
  isConnected,
}: {
  liveEvents:  LiveFraudEvent[];
  isConnected: boolean;
}) {
  const [clusters,  setClusters]  = useState<AnomalyCluster[]>([]);
  const [signals,   setSignals]   = useState<AnomalySignal[]>([]);
  const [history,   setHistory]   = useState<AnomalyHistoryRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError,   setHistoryError]   = useState<string | null>(null);
  const [tab,       setTab]       = useState<"signals" | "clusters" | "history">("signals");
  const seenRef       = useRef<Set<string>>(new Set());
  const persistedRef  = useRef<Set<string>>(new Set()); // userId set — escalations already POSTed
  /* Bound both Sets so they can't leak in long-running admin sessions */
  const SEEN_CAP      = 1000;
  const PERSIST_CAP   = 500;

  /* Load history on mount + every 30s while open */
  useEffect(() => {
    let alive = true;
    const loadHistory = async () => {
      try {
        const data = await adminFetch<{ events: AnomalyHistoryRow[] }>(
          "/admin/anomaly/history?limit=30",
        );
        if (!alive) return;
        setHistory(data.events);
        setHistoryError(null);
      } catch (e) {
        if (!alive) return;
        setHistoryError((e as Error).message);
      } finally {
        if (alive) setHistoryLoading(false);
      }
    };
    loadHistory();
    const id = setInterval(loadHistory, 30_000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  /* Update clusters on new events */
  useEffect(() => {
    if (!liveEvents.length) return;
    const latest = liveEvents[0];
    if (!latest || seenRef.current.has(latest.id)) return;
    seenRef.current.add(latest.id);
    /* Cap to prevent unbounded memory growth — drop oldest half when full */
    if (seenRef.current.size > SEEN_CAP) {
      const arr = Array.from(seenRef.current);
      seenRef.current = new Set(arr.slice(-Math.floor(SEEN_CAP / 2)));
    }
    if (!latest.userId || latest.severity === "info") return;

    const now = Date.now();

    setClusters((prev) => {
      const existing = prev.find((c) => c.userId === latest.userId);
      const eventScore = latest.score ?? (
        latest.severity === "critical" ? 90 :
        latest.severity === "high"     ? 65 :
        latest.severity === "medium"   ? 40 : 20
      );

      let next: AnomalyCluster[];
      if (existing) {
        const updated: AnomalyCluster = {
          ...existing,
          eventCount:    existing.eventCount + 1,
          criticalCount: existing.criticalCount + (latest.severity === "critical" ? 1 : 0),
          highCount:     existing.highCount + (latest.severity === "high" ? 1 : 0),
          avgScore:      Math.round((existing.avgScore * existing.eventCount + eventScore) / (existing.eventCount + 1)),
          maxScore:      Math.max(existing.maxScore, eventScore),
          lastSeen:      now,
          username:      latest.username ?? existing.username,
          riskScore:     0, // recalculate below
          escalated:     false,
        };
        updated.riskScore  = computeRisk(updated);
        updated.escalated  = updated.riskScore >= ESCALATE_AT;
        next = prev.map((c) => c.userId === latest.userId ? updated : c);
      } else {
        const newCluster: AnomalyCluster = {
          userId:        latest.userId!,
          username:      latest.username,
          eventCount:    1,
          criticalCount: latest.severity === "critical" ? 1 : 0,
          highCount:     latest.severity === "high" ? 1 : 0,
          avgScore:      eventScore,
          maxScore:      eventScore,
          firstSeen:     now,
          lastSeen:      now,
          riskScore:     0,
          escalated:     false,
        };
        newCluster.riskScore = computeRisk(newCluster);
        newCluster.escalated = newCluster.riskScore >= ESCALATE_AT;
        next = [...prev, newCluster];
      }

      // Evict old clusters + sort by risk
      return next
        .filter((c) => now - c.lastSeen < CLUSTER_TTL)
        .sort((a, b) => b.riskScore - a.riskScore)
        .slice(0, 20);
    });
  }, [liveEvents]);

  /* Re-compute signals whenever events change */
  useEffect(() => {
    setSignals(detectSignals(liveEvents.slice(0, 50)));
  }, [liveEvents]);

  /* Persist escalated clusters to DB (fire-and-forget, deduped per session) */
  useEffect(() => {
    const toPersist = clusters.filter((c) => c.escalated && !persistedRef.current.has(c.userId));
    if (toPersist.length === 0) return;
    for (const c of toPersist) {
      persistedRef.current.add(c.userId);
      if (persistedRef.current.size > PERSIST_CAP) {
        const arr = Array.from(persistedRef.current);
        persistedRef.current = new Set(arr.slice(-Math.floor(PERSIST_CAP / 2)));
      }
      adminFetch("/admin/anomaly/record", {
        method: "POST",
        body: JSON.stringify({
          userId:        c.userId,
          username:      c.username,
          eventCount:    c.eventCount,
          criticalCount: c.criticalCount,
          highCount:     c.highCount,
          avgScore:      c.avgScore,
          maxScore:      c.maxScore,
          riskScore:     c.riskScore,
          escalated:     true,
          firstSeen:     new Date(c.firstSeen).toISOString(),
          lastSeen:      new Date(c.lastSeen).toISOString(),
        }),
      }).then(() => {
        /* Optimistically prepend to history */
        setHistory((prev) => [{
          id:             `local-${c.userId}-${Date.now()}`,
          user_id:        c.userId,
          username:       c.username ?? null,
          event_count:    c.eventCount,
          critical_count: c.criticalCount,
          high_count:     c.highCount,
          avg_score:      c.avgScore,
          max_score:      c.maxScore,
          risk_score:     c.riskScore,
          escalated:      true,
          first_seen:     new Date(c.firstSeen).toISOString(),
          last_seen:      new Date(c.lastSeen).toISOString(),
          created_at:     new Date().toISOString(),
        }, ...prev].slice(0, 30));
      }).catch(() => {
        /* Swallow — retry on next escalation */
        persistedRef.current.delete(c.userId);
      });
    }
  }, [clusters]);

  const escalated  = clusters.filter((c) => c.escalated).length;
  const avgRisk    = clusters.length
    ? Math.round(clusters.reduce((s, c) => s + c.riskScore, 0) / clusters.length)
    : 0;

  return (
    <div className="flex h-full flex-col rounded-2xl border border-white/[0.06] bg-[#0b1220]">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-violet-500/10">
            <Brain className="h-4.5 w-4.5 text-violet-400" />
          </div>
          <div>
            <h2 className="text-base font-black text-white">AI Anomaly Engine</h2>
            <p className="text-[10px] text-white/30">Behavioral scoring · Pattern detection · Auto-escalation</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {escalated > 0 && (
            <span className="flex items-center gap-1 rounded-full bg-red-500/15 px-2 py-1 text-[9px] font-bold text-red-400">
              <Zap className="h-2.5 w-2.5 animate-pulse" /> {escalated} ESCALATED
            </span>
          )}
          <span className={`h-1.5 w-1.5 rounded-full ${isConnected ? "animate-pulse bg-emerald-500" : "bg-white/20"}`} />
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3 border-b border-white/[0.06] p-4">
        <div className="rounded-xl border border-white/[0.05] bg-white/[0.02] p-3">
          <div className="flex items-center gap-1.5"><Activity className="h-3.5 w-3.5 text-violet-400" /><p className="text-[9px] text-white/30">Active Clusters</p></div>
          <p className="mt-1 text-xl font-black text-white">{clusters.length}</p>
        </div>
        <div className="rounded-xl border border-white/[0.05] bg-white/[0.02] p-3">
          <div className="flex items-center gap-1.5"><AlertOctagon className="h-3.5 w-3.5 text-red-400" /><p className="text-[9px] text-white/30">Escalated</p></div>
          <p className="mt-1 text-xl font-black text-red-400">{escalated}</p>
        </div>
        <div className="rounded-xl border border-white/[0.05] bg-white/[0.02] p-3">
          <div className="flex items-center gap-1.5"><TrendingUp className="h-3.5 w-3.5 text-orange-400" /><p className="text-[9px] text-white/30">Avg Risk</p></div>
          <p className="mt-1 text-xl font-black text-white">{avgRisk}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-white/[0.06] px-4 py-2">
        {([
          ["signals",  "Signals",  signals.length],
          ["clusters", "Clusters", clusters.length],
          ["history",  "History",  history.length],
        ] as const).map(([key, label, count]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[10px] font-semibold transition-colors ${
              tab === key ? "bg-white/[0.07] text-white" : "text-white/35 hover:text-white/60"
            }`}
          >
            {label}
            {count > 0 && <span className="rounded-full bg-white/10 px-1 text-[8px]">{count}</span>}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 scrollbar-none">
        {tab === "signals" && (
          <div className="space-y-2">
            <AnimatePresence>
              {signals.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 py-12">
                  <Info className="h-8 w-8 text-white/10" />
                  <p className="text-[11px] text-white/20">
                    {isConnected ? "Monitoring… no anomalies detected yet" : "Connect to start analysis"}
                  </p>
                </div>
              ) : signals.map((s, i) => (
                <motion.div key={`${s.type}-${i}`} initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}>
                  <SignalCard s={s} />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
        {tab === "clusters" && (
          <div className="space-y-2">
            <AnimatePresence>
              {clusters.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 py-12">
                  <Circle className="h-8 w-8 text-white/10" />
                  <p className="text-[11px] text-white/20">No active behavioral clusters</p>
                  <p className="text-[9px] text-white/12">Clusters form when the same user triggers multiple fraud events</p>
                </div>
              ) : clusters.map((c) => <ClusterCard key={c.userId} c={c} />)}
            </AnimatePresence>
          </div>
        )}
        {tab === "history" && (
          <div className="space-y-2">
            {historyLoading && history.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-12">
                <History className="h-8 w-8 animate-pulse text-white/15" />
                <p className="text-[11px] text-white/25">Loading anomaly history…</p>
              </div>
            ) : historyError && history.length === 0 ? (
              <div className="rounded-xl border border-red-500/25 bg-red-500/[0.04] p-4 text-center">
                <p className="text-[11px] font-semibold text-red-300">Failed to load history</p>
                <p className="mt-1 text-[10px] text-white/35">{historyError}</p>
              </div>
            ) : history.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-12">
                <History className="h-8 w-8 text-white/10" />
                <p className="text-[11px] text-white/20">No persisted anomaly events yet</p>
                <p className="text-[9px] text-white/12">Escalated clusters are saved here automatically</p>
              </div>
            ) : (
              history.map((h) => (
                <div key={h.id}
                  className={`rounded-xl border p-3 transition ${
                    h.escalated
                      ? "border-red-500/25 bg-red-500/[0.04]"
                      : "border-white/[0.05] bg-white/[0.02]"
                  }`}>
                  <div className="flex items-center gap-2">
                    {h.escalated && (
                      <span className="rounded-full bg-red-500/20 px-1.5 py-0.5 text-[8px] font-bold text-red-300">
                        ESCALATED
                      </span>
                    )}
                    <p className="truncate text-[12px] font-semibold text-white">
                      {h.username ?? h.user_id?.slice(0, 8) ?? "anonymous"}
                    </p>
                    <span className="ml-auto text-[9px] text-white/30">
                      {new Date(h.created_at).toLocaleString()}
                    </span>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-[10px] sm:grid-cols-4">
                    <div><span className="text-white/30">Risk </span><span className="font-bold text-orange-300">{h.risk_score}</span></div>
                    <div><span className="text-white/30">Events </span><span className="font-mono text-white/70">{h.event_count}</span></div>
                    <div><span className="text-white/30">Crit </span><span className="font-mono text-red-300">{h.critical_count}</span></div>
                    <div><span className="text-white/30">Max </span><span className="font-mono text-white/70">{Math.round(h.max_score)}</span></div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
