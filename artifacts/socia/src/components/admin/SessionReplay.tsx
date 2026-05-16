/**
 * Session replay — user journey reconstruction from audit log.
 * Replay mode steps through events one by one with a progress bar.
 * Fraud events are highlighted; shows click timeline and action summary.
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Play, Pause, SkipForward, SkipBack, RotateCcw,
  Search, RefreshCw, Film, Clock, AlertTriangle,
  MousePointer, FileText, ShieldAlert, User, ChevronRight,
} from "lucide-react";
import { adminFetch } from "@/lib/adminAuth";

/* ── Types ──────────────────────────────────────────────────────────── */
interface AuditEntry {
  id:          string;
  action:      string;
  admin_username?: string;
  user_id?:    string;
  target_id?:  string;
  details?:    Record<string, unknown>;
  created_at:  string;
  ip_address?: string;
}
interface Receipt {
  id: string; fraud_score: number | null; verification_status: string;
  amount: number | null; manual_reference: string | null; created_at: string;
  image_url: string | null; ocr_text: string | null;
}
interface SessionEvent {
  id:        string;
  ts:        number;
  type:      "receipt_submit" | "receipt_blocked" | "admin_action" | "login" | "profile_update" | "refund_request";
  label:     string;
  detail:    string;
  severity:  "critical" | "high" | "medium" | "info";
  raw:       Receipt | AuditEntry;
}

/* ── Helpers ─────────────────────────────────────────────────────────── */
const SEV_STYLE: Record<string, string> = {
  critical: "border-l-red-500 bg-red-500/5",
  high:     "border-l-orange-500 bg-orange-500/5",
  medium:   "border-l-yellow-500 bg-yellow-500/5",
  info:     "border-l-blue-500 bg-blue-500/5",
};
const SEV_DOT: Record<string, string> = {
  critical: "bg-red-500", high: "bg-orange-500", medium: "bg-yellow-500", info: "bg-blue-500",
};
const SEV_TEXT: Record<string, string> = {
  critical: "text-red-400", high: "text-orange-400", medium: "text-yellow-400", info: "text-blue-400",
};

function timeStr(ts: number) { return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }); }

function eventFromReceipt(r: Receipt): SessionEvent {
  const score = r.fraud_score ?? 0;
  return {
    id:       r.id,
    ts:       new Date(r.created_at).getTime(),
    type:     r.verification_status === "blocked" ? "receipt_blocked" : "receipt_submit",
    label:    r.verification_status === "blocked" ? "Receipt Blocked" : "Receipt Submitted",
    detail:   `Score ${score}${r.amount ? ` · ₱${r.amount.toLocaleString()}` : ""}${r.manual_reference ? ` · ref ${r.manual_reference}` : ""}`,
    severity: score >= 80 ? "critical" : score >= 60 ? "high" : score >= 40 ? "medium" : "info",
    raw:      r,
  };
}

/* ── Action summary ──────────────────────────────────────────────────── */
function ActionSummary({ events }: { events: SessionEvent[] }) {
  const byType: Record<string, number> = {};
  for (const e of events) { byType[e.type] = (byType[e.type] ?? 0) + 1; }
  const criticals = events.filter((e) => e.severity === "critical").length;
  const span = events.length >= 2
    ? Math.round((events[events.length - 1]!.ts - events[0]!.ts) / 60_000)
    : 0;

  return (
    <div className="grid grid-cols-4 gap-3">
      {[
        { label: "Events",    val: events.length,             color: "text-white" },
        { label: "Criticals", val: criticals,                 color: "text-red-400" },
        { label: "Blocked",   val: byType.receipt_blocked ?? 0, color: "text-orange-400" },
        { label: "Duration",  val: `${span}m`,               color: "text-blue-400" },
      ].map((s) => (
        <div key={s.label} className="rounded-lg bg-[#0d1626] border border-white/5 p-3 text-center">
          <div className={`text-xl font-bold ${s.color}`}>{s.val}</div>
          <div className="text-[9px] text-white/40 mt-0.5">{s.label}</div>
        </div>
      ))}
    </div>
  );
}

/* ── Click timeline ──────────────────────────────────────────────────── */
function ClickTimeline({
  events,
  activeIndex,
  onSeek,
}: {
  events:      SessionEvent[];
  activeIndex: number;
  onSeek:      (i: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  /* Auto-scroll active item into view */
  useEffect(() => {
    const el = containerRef.current?.querySelector(`[data-index="${activeIndex}"]`);
    el?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }, [activeIndex]);

  if (!events.length)
    return <p className="text-center text-white/30 py-4 text-xs">No events loaded</p>;

  return (
    <div ref={containerRef} className="flex items-center gap-0 overflow-x-auto pb-2 scrollbar-thin relative">
      {events.map((e, i) => (
        <button
          key={e.id}
          data-index={i}
          onClick={() => onSeek(i)}
          title={`${timeStr(e.ts)} · ${e.label}`}
          className="flex flex-col items-center gap-1 flex-shrink-0 group">
          {/* Connector line */}
          {i > 0 && <div className="absolute" style={{ width: 24, height: 1, backgroundColor: "#1e293b", top: 8 }} />}
          <div className={`h-4 w-4 rounded-full transition-all ${
            i === activeIndex
              ? `${SEV_DOT[e.severity]} scale-125 ring-2 ring-white/40`
              : i < activeIndex
                ? `${SEV_DOT[e.severity]} opacity-60`
                : "bg-white/10"
          }`} />
          <span className="text-[7px] text-white/30 group-hover:text-white/60 max-w-10 text-center leading-tight">
            {e.label.split(" ")[0]}
          </span>
        </button>
      ))}
    </div>
  );
}

/* ── Event card ──────────────────────────────────────────────────────── */
function EventCard({ event, isActive }: { event: SessionEvent; isActive: boolean }) {
  const [open, setOpen] = useState(false);

  return (
    <motion.div
      layout
      animate={isActive ? { scale: 1, opacity: 1 } : { scale: 0.98, opacity: 0.6 }}
      className={`rounded-xl border-l-2 border border-white/5 px-4 py-3 cursor-pointer ${SEV_STYLE[event.severity]} ${isActive ? "ring-1 ring-white/10" : ""}`}
      onClick={() => setOpen((o) => !o)}>
      <div className="flex items-start gap-3">
        <div className={`flex-shrink-0 h-2 w-2 rounded-full mt-1.5 ${SEV_DOT[event.severity]}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-xs font-semibold ${SEV_TEXT[event.severity]}`}>{event.label}</span>
            <span className="text-[10px] text-white/40 flex items-center gap-1">
              <Clock size={9} /> {timeStr(event.ts)}
            </span>
          </div>
          <p className="text-xs text-white/60 mt-0.5">{event.detail}</p>
        </div>
        <ChevronRight size={13} className={`text-white/20 flex-shrink-0 transition-transform ${open ? "rotate-90" : ""}`} />
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.15 }}
            className="mt-2 border-t border-white/5 pt-2">
            <pre className="text-[10px] text-white/40 bg-white/5 rounded p-2 overflow-x-auto">
              {JSON.stringify(event.raw, null, 2)}
            </pre>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/* ── Main ────────────────────────────────────────────────────────────── */
export default function SessionReplay() {
  const [userId, setUserId]         = useState("");
  const [events, setEvents]         = useState<SessionEvent[]>([]);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [activeIdx, setActiveIdx]   = useState(0);
  const [playing, setPlaying]       = useState(false);
  const [speed, setSpeed]           = useState(1_000); // ms per step
  const [filterSev, setFilterSev]   = useState<string>("all");
  const playRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ── Load user events ── */
  const load = useCallback(async () => {
    const uid = userId.trim();
    if (!uid) return;
    setLoading(true); setError(null); setPlaying(false); setActiveIdx(0);
    try {
      /* Fetch receipts for this user */
      const res = await adminFetch<{ receipts: Receipt[] }>(`/admin/receipts?user_id=${encodeURIComponent(uid)}&limit=100`);
      const receipts = (res.receipts ?? []).map(eventFromReceipt);
      const sorted = receipts.sort((a, b) => a.ts - b.ts);
      setEvents(sorted);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  /* ── Playback ── */
  useEffect(() => {
    if (!playing) { clearTimeout(playRef.current ?? undefined); return; }
    const filtered = filterSev === "all" ? events : events.filter((e) => e.severity === filterSev);
    if (activeIdx >= filtered.length - 1) { setPlaying(false); return; }
    playRef.current = setTimeout(() => setActiveIdx((i) => i + 1), speed);
    return () => clearTimeout(playRef.current ?? undefined);
  }, [playing, activeIdx, events, speed, filterSev]);

  const filtered = filterSev === "all" ? events : events.filter((e) => e.severity === filterSev);

  const SPEEDS = [{ label: "0.5×", ms: 2000 }, { label: "1×", ms: 1000 }, { label: "2×", ms: 500 }, { label: "4×", ms: 250 }];

  return (
    <div className="h-full flex flex-col gap-4 min-h-0">
      {/* Header */}
      <div className="flex items-center justify-between flex-shrink-0">
        <div>
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <Film size={18} className="text-cyan-400" />
            Session Replay
          </h2>
          <p className="text-xs text-white/40 mt-0.5">User journey reconstruction from fraud event log</p>
        </div>
      </div>

      {/* Search */}
      <div className="flex gap-2 flex-shrink-0">
        <div className="flex-1 flex items-center gap-2 bg-white/5 border border-white/10 rounded-lg px-3 py-2">
          <User size={14} className="text-white/30 flex-shrink-0" />
          <input
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void load()}
            placeholder="User UUID to replay…"
            className="flex-1 bg-transparent text-sm text-white placeholder-white/30 focus:outline-none"
          />
        </div>
        <button
          onClick={() => void load()}
          disabled={loading || !userId.trim()}
          className="px-4 py-2 rounded-lg bg-cyan-600/80 hover:bg-cyan-600 disabled:opacity-40 text-sm font-medium text-white flex items-center gap-2">
          {loading ? <RefreshCw size={14} className="animate-spin" /> : <Search size={14} />}
          Load
        </button>
      </div>

      {error && <p className="text-sm text-red-400 flex-shrink-0">{error}</p>}

      {events.length > 0 && (
        <>
          {/* Summary */}
          <div className="flex-shrink-0">
            <ActionSummary events={events} />
          </div>

          {/* Filter */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="text-[10px] text-white/30 uppercase tracking-wider">Filter:</span>
            {(["all", "critical", "high", "medium", "info"] as const).map((s) => (
              <button key={s}
                onClick={() => { setFilterSev(s); setActiveIdx(0); setPlaying(false); }}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                  filterSev === s ? "bg-white/10 text-white" : "text-white/30 hover:text-white/60"
                }`}>
                {s === "all" ? "All" : s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
            <span className="ml-auto text-[10px] text-white/30">{filtered.length} events</span>
          </div>

          {/* Click timeline */}
          <div className="flex-shrink-0 bg-[#0d1626] border border-white/5 rounded-xl px-4 py-3">
            <p className="text-[9px] uppercase tracking-wider text-white/30 font-semibold mb-3">Click Timeline</p>
            <ClickTimeline events={filtered} activeIndex={activeIdx} onSeek={setActiveIdx} />
          </div>

          {/* Playback controls */}
          <div className="flex items-center gap-3 flex-shrink-0 bg-[#0d1626] border border-white/5 rounded-xl px-4 py-3">
            {/* Progress */}
            <div className="flex-1">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] text-white/40">{timeStr(filtered[activeIdx]?.ts ?? Date.now())}</span>
                <span className="text-[10px] text-white/40">{activeIdx + 1} / {filtered.length}</span>
              </div>
              <input type="range" min={0} max={Math.max(0, filtered.length - 1)} value={activeIdx}
                onChange={(e) => { setActiveIdx(Number(e.target.value)); setPlaying(false); }}
                className="w-full h-1 accent-cyan-500" />
            </div>

            {/* Buttons */}
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <button onClick={() => { setActiveIdx(0); setPlaying(false); }}
                className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-white/60">
                <RotateCcw size={13} />
              </button>
              <button onClick={() => setActiveIdx((i) => Math.max(0, i - 1))}
                className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-white/60">
                <SkipBack size={13} />
              </button>
              <button onClick={() => setPlaying((p) => !p)}
                className="p-2.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white">
                {playing ? <Pause size={14} /> : <Play size={14} />}
              </button>
              <button onClick={() => setActiveIdx((i) => Math.min(filtered.length - 1, i + 1))}
                className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-white/60">
                <SkipForward size={13} />
              </button>
            </div>

            {/* Speed */}
            <div className="flex items-center gap-1 flex-shrink-0">
              {SPEEDS.map((s) => (
                <button key={s.ms}
                  onClick={() => setSpeed(s.ms)}
                  className={`px-2 py-1 rounded text-[10px] font-medium ${speed === s.ms ? "bg-cyan-600 text-white" : "bg-white/5 text-white/40 hover:text-white/60"}`}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Event feed */}
          <div className="flex-1 overflow-y-auto scrollbar-thin min-h-0 space-y-2">
            <AnimatePresence mode="popLayout">
              {filtered.map((e, i) => (
                <EventCard key={e.id} event={e} isActive={i === activeIdx} />
              ))}
            </AnimatePresence>
          </div>
        </>
      )}

      {!events.length && !loading && (
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <Film size={40} className="text-white/10" />
          <div className="text-center">
            <p className="text-sm text-white/40">Enter a user UUID to load their session</p>
            <p className="text-xs text-white/20 mt-1">Reconstructs fraud event journey from the receipt log</p>
          </div>
        </div>
      )}
    </div>
  );
}
