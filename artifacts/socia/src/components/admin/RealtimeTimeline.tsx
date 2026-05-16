/**
 * RealtimeTimeline — chronological audit event replay system.
 *
 * Features:
 *  - All live events displayed as a vertical timeline
 *  - Step-through replay mode (pause → step → resume)
 *  - Filter by severity, category, username
 *  - Immutable event history (never mutates past events)
 *  - Export filtered events as JSON
 */
import { useState, useEffect, useRef, useCallback, memo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Clock, Play, Pause, SkipForward, SkipBack, ChevronsLeft,
  Download, Filter, ShieldAlert, Lock, User, Cpu,
  CheckCircle2, XCircle, AlertTriangle, Info, ChevronRight,
} from "lucide-react";
import type { LiveFraudEvent } from "../../lib/useAdminSocket";

/* ── Types ────────────────────────────────────────────────────────────── */
interface TimelineEvent extends LiveFraudEvent {
  localIndex: number;
}

/* ── Constants ────────────────────────────────────────────────────────── */
const SEV_COLOR: Record<string, string> = {
  critical: "#ef4444",
  high:     "#f97316",
  medium:   "#eab308",
  low:      "#3b82f6",
  info:     "#6b7280",
};

const SEV_BG: Record<string, string> = {
  critical: "bg-red-500/10 border-red-500/20",
  high:     "bg-orange-500/8 border-orange-500/15",
  medium:   "bg-amber-500/6 border-amber-500/12",
  low:      "bg-blue-500/6 border-blue-500/12",
  info:     "bg-white/[0.02] border-white/[0.05]",
};

function typeIcon(type: string) {
  if (type.includes("fraud") || type.includes("receipt") || type.includes("tamper")) return ShieldAlert;
  if (type.includes("admin") || type.includes("login"))                              return Lock;
  if (type.includes("refund"))                                                       return CheckCircle2;
  if (type.includes("abuse"))                                                        return AlertTriangle;
  if (type.includes("system"))                                                       return Cpu;
  return Info;
}

function fmtTime(ts: string): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
}

function fmtDate(ts: string): string {
  return new Date(ts).toLocaleDateString("en-PH", { month: "short", day: "numeric" });
}

/* ── Timeline event row ───────────────────────────────────────────────── */
const TimelineRow = memo(function TimelineRow({
  event,
  isActive,
  isLast,
  onClick,
}: {
  event:    TimelineEvent;
  isActive: boolean;
  isLast:   boolean;
  onClick:  () => void;
}) {
  const Icon = typeIcon(event.type);
  const sev  = event.severity;
  return (
    <div className={`relative flex gap-3 ${isLast ? "" : "pb-2"}`}>
      {/* Connector line */}
      {!isLast && (
        <div
          className="absolute left-[13px] top-8 bottom-0 w-px"
          style={{ background: `linear-gradient(${SEV_COLOR[sev]}33, transparent)` }}
        />
      )}
      {/* Node */}
      <div className="flex-shrink-0">
        <motion.div
          animate={{ scale: isActive ? 1.15 : 1 }}
          className={`grid h-7 w-7 place-items-center rounded-full border-2 ${
            isActive ? "shadow-lg" : "border-transparent"
          }`}
          style={{
            backgroundColor: `${SEV_COLOR[sev]}1a`,
            borderColor: isActive ? SEV_COLOR[sev] : "transparent",
            boxShadow: isActive ? `0 0 12px ${SEV_COLOR[sev]}40` : "none",
          }}
        >
          <Icon className="h-3 w-3" style={{ color: SEV_COLOR[sev] }} />
        </motion.div>
      </div>

      {/* Content */}
      <motion.button
        onClick={onClick}
        className={`flex-1 min-w-0 rounded-xl border p-3 text-left transition-colors ${
          isActive ? SEV_BG[sev] : "border-transparent bg-transparent hover:bg-white/[0.02] hover:border-white/[0.04]"
        }`}
        whileHover={{ x: 2 }}
      >
        <div className="flex items-start justify-between gap-2">
          <p className="flex-1 min-w-0 text-[11px] font-semibold text-white/80 leading-snug">{event.message}</p>
          <div className="flex flex-shrink-0 flex-col items-end gap-0.5">
            <span className="font-mono text-[9px] text-white/25">{fmtTime(event.ts)}</span>
            <span className="text-[8px] uppercase font-bold" style={{ color: SEV_COLOR[sev] }}>{sev}</span>
          </div>
        </div>
        {(event.username || event.userId) && (
          <div className="mt-1 flex items-center gap-1.5">
            <User className="h-2.5 w-2.5 text-white/20" />
            <span className="text-[9px] text-white/30">{event.username ?? event.userId}</span>
          </div>
        )}
        {event.score != null && (
          <div className="mt-1.5 flex items-center gap-1.5">
            <div className="h-1 flex-1 rounded-full bg-white/[0.06] overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{ width: `${event.score}%`, backgroundColor: SEV_COLOR[sev] }}
              />
            </div>
            <span className="text-[8px] font-mono text-white/20">{event.score}</span>
          </div>
        )}
      </motion.button>
    </div>
  );
});

/* ── Main component ───────────────────────────────────────────────────── */
interface RealtimeTimelineProps {
  liveEvents:  LiveFraudEvent[];
  isConnected: boolean;
}

export default function RealtimeTimeline({ liveEvents, isConnected }: RealtimeTimelineProps) {
  const [events,   setEvents]   = useState<TimelineEvent[]>([]);
  const [cursor,   setCursor]   = useState<number | null>(null); // replay cursor
  const [playing,  setPlaying]  = useState(false);
  const [filter,   setFilter]   = useState<"all" | "critical" | "high" | "medium">("all");
  const [search,   setSearch]   = useState("");
  const seenRef   = useRef<Set<string>>(new Set());
  const indexRef  = useRef(0);
  const playTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* Ingest live events */
  useEffect(() => {
    if (!liveEvents.length) return;
    const latest = liveEvents[0];
    if (!latest || seenRef.current.has(latest.id)) return;
    seenRef.current.add(latest.id);
    const te: TimelineEvent = { ...latest, localIndex: indexRef.current++ };
    setEvents((prev) => [te, ...prev].slice(0, 500));
  }, [liveEvents]);

  /* Replay controls */
  const stopPlay = useCallback(() => {
    setPlaying(false);
    if (playTimerRef.current) clearTimeout(playTimerRef.current);
  }, []);

  const startPlay = useCallback(() => {
    if (!events.length) return;
    setPlaying(true);
    setCursor(events.length - 1); // start from oldest
  }, [events.length]);

  useEffect(() => {
    if (!playing || cursor === null) return;
    playTimerRef.current = setTimeout(() => {
      setCursor((c) => {
        if (c === null || c <= 0) { setPlaying(false); return null; }
        return c - 1;
      });
    }, 600);
    return () => { if (playTimerRef.current) clearTimeout(playTimerRef.current); };
  }, [playing, cursor]);

  const reset    = useCallback(() => { stopPlay(); setCursor(null); }, [stopPlay]);
  const stepBack = useCallback(() => setCursor((c) => c !== null ? Math.min(events.length - 1, c + 1) : events.length - 1), [events.length]);
  const stepFwd  = useCallback(() => setCursor((c) => c !== null ? Math.max(0, c - 1) : 0), []);

  const exportEvents = useCallback(() => {
    const blob = new Blob([JSON.stringify(events, null, 2)], { type: "application/json" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a"); a.href = url;
    a.download = `audit-timeline-${Date.now()}.json`; a.click();
    URL.revokeObjectURL(url);
  }, [events]);

  /* Filtered display */
  const displayed = events.filter((e) => {
    if (filter !== "all" && e.severity !== filter) return false;
    if (search && !e.message.toLowerCase().includes(search.toLowerCase()) &&
        !(e.username ?? "").toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="flex h-full flex-col rounded-2xl border border-white/[0.06] bg-[#0b1220]">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-cyan-500/10">
            <Clock className="h-4.5 w-4.5 text-cyan-400" />
          </div>
          <div>
            <h2 className="text-base font-black text-white">Realtime Timeline</h2>
            <p className="text-[10px] text-white/30">{events.length} events · Chronological audit trail with replay</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`h-1.5 w-1.5 rounded-full ${isConnected ? "animate-pulse bg-emerald-500" : "bg-white/20"}`} />
          <button onClick={exportEvents} className="rounded-xl border border-white/[0.07] p-1.5 text-white/30 hover:text-white/60">
            <Download className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-3 border-b border-white/[0.06] px-4 py-3">
        {/* Replay controls */}
        <div className="flex items-center gap-1.5 rounded-xl border border-white/[0.07] bg-white/[0.02] p-1">
          <button onClick={reset}    className="rounded-lg p-1.5 text-white/30 hover:bg-white/5 hover:text-white/60" title="Reset"><ChevronsLeft className="h-3.5 w-3.5" /></button>
          <button onClick={stepBack} className="rounded-lg p-1.5 text-white/30 hover:bg-white/5 hover:text-white/60" title="Step back"><SkipBack className="h-3.5 w-3.5" /></button>
          <button
            onClick={playing ? stopPlay : startPlay}
            className={`rounded-lg p-1.5 transition-colors ${playing ? "bg-cyan-500/20 text-cyan-400" : "text-white/40 hover:bg-white/5 hover:text-white/70"}`}
            title={playing ? "Pause" : "Play"}
          >
            {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
          </button>
          <button onClick={stepFwd}  className="rounded-lg p-1.5 text-white/30 hover:bg-white/5 hover:text-white/60" title="Step forward"><SkipForward className="h-3.5 w-3.5" /></button>
        </div>

        {/* Filter */}
        <div className="flex gap-0.5">
          {(["all", "critical", "high", "medium"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-lg px-2 py-1 text-[9px] font-semibold capitalize transition-colors ${
                filter === f ? "bg-white/[0.07] text-white" : "text-white/25 hover:text-white/50"
              }`}
            >
              {f}
            </button>
          ))}
        </div>

        {/* Search */}
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search events…"
          className="ml-auto w-40 rounded-xl border border-white/[0.07] bg-white/[0.03] px-3 py-1.5 text-[10px] text-white/60 placeholder-white/20 outline-none focus:border-white/[0.12]"
        />
      </div>

      {/* Replay indicator */}
      <AnimatePresence>
        {cursor !== null && (
          <motion.div
            initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }}
            className="overflow-hidden border-b border-cyan-500/20 bg-cyan-500/5"
          >
            <div className="flex items-center gap-2 px-4 py-2">
              <Play className="h-3 w-3 text-cyan-400" />
              <p className="text-[10px] text-cyan-400">
                Replay mode — event {events.length - cursor} of {events.length}
              </p>
              <div className="ml-2 flex-1 rounded-full bg-white/10 h-1 overflow-hidden">
                <div
                  className="h-full bg-cyan-500 rounded-full transition-all"
                  style={{ width: `${((events.length - cursor) / events.length) * 100}%` }}
                />
              </div>
              <button onClick={reset} className="text-[9px] text-cyan-400/60 hover:text-cyan-400">Exit</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Timeline */}
      <div className="flex-1 overflow-y-auto px-4 py-4 scrollbar-none">
        {displayed.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16">
            <Clock className="h-8 w-8 text-white/10" />
            <p className="text-[11px] text-white/20">
              {isConnected ? "Waiting for events…" : "Connect to receive events"}
            </p>
          </div>
        ) : (
          <div className="space-y-0">
            {displayed.map((e, i) => {
              const active = cursor !== null && e.localIndex === (events[cursor]?.localIndex ?? -1);
              return (
                <TimelineRow
                  key={e.id}
                  event={e}
                  isActive={active}
                  isLast={i === displayed.length - 1}
                  onClick={() => setCursor(events.findIndex((ev) => ev.id === e.id))}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
