/**
 * NotificationCenter — enterprise notification hub.
 *
 * Features:
 *  - Web Audio API sound alerts (3 tones by severity)
 *  - Persistent notification history (last 150 events)
 *  - Fraud surge detection (4+ critical/high in 60 s)
 *  - Reviewer action alerts
 *  - Slide-in drawer with tabs
 *  - Unread badge (exported for embedding in nav header)
 *  - Sound toggle persisted in localStorage
 */
import {
  useState, useEffect, useRef, useCallback, memo,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Bell, BellOff, X, Volume2, VolumeX, CheckCheck, Trash2,
  ShieldAlert, AlertOctagon, AlertTriangle, Info, Zap,
  User, Lock, FileText, ChevronRight, Download,
} from "lucide-react";
import type { LiveFraudEvent, ReviewerPresence } from "../../lib/useAdminSocket";

/* ── Types ────────────────────────────────────────────────────────────── */
export interface Notification {
  id:       string;
  event:    LiveFraudEvent;
  read:     boolean;
  ts:       number;
  category: "fraud" | "audit" | "reviewer" | "surge" | "system";
}

/* ── Sound engine ─────────────────────────────────────────────────────── */
let audioCtx: AudioContext | null = null;

function getAudioCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!audioCtx) audioCtx = new (window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext!)();
  return audioCtx;
}

function playTone(
  freq1: number, freq2: number,
  duration: number, volume: number,
  type: OscillatorType = "sine",
): void {
  try {
    const ctx = getAudioCtx();
    if (!ctx) return;
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = type;
    osc.frequency.setValueAtTime(freq1, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(freq2, ctx.currentTime + duration * 0.8);
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration);
  } catch { /* AudioContext may not be available */ }
}

function playSurgeAlarm(): void {
  [0, 0.25, 0.5].forEach((delay) => {
    setTimeout(() => playTone(880, 440, 0.2, 0.35, "square"), delay * 1000);
  });
}

function playSoundForSeverity(severity: string): void {
  if (severity === "critical") { playTone(880, 440, 0.45, 0.3,  "sawtooth"); return; }
  if (severity === "high")     { playTone(660, 550, 0.3,  0.2,  "triangle"); return; }
  if (severity === "medium")   { playTone(440, 440, 0.12, 0.12, "sine");     return; }
}

/* ── Helpers ──────────────────────────────────────────────────────────── */
const SOUND_KEY  = "socia_admin_sound";
const MAX_NOTIFS = 150;
const SURGE_WIN  = 60_000;
const SURGE_TH   = 4;

function categoryOf(event: LiveFraudEvent): Notification["category"] {
  if (event.type === "admin_login" || event.type === "admin_action") return "audit";
  if (event.type === "fraud_detected" || event.type === "receipt_blocked" ||
      event.type === "tamper_detected" || event.type === "duplicate_found") return "fraud";
  if (event.type === "refund_decision") return "audit";
  return "system";
}

function notifIcon(cat: Notification["category"]) {
  if (cat === "fraud")    return ShieldAlert;
  if (cat === "audit")    return Lock;
  if (cat === "reviewer") return User;
  if (cat === "surge")    return Zap;
  return Info;
}

function relativeTime(ts: number): string {
  const d = Date.now() - ts;
  if (d < 60_000)    return `${Math.floor(d / 1_000)}s ago`;
  if (d < 3_600_000) return `${Math.floor(d / 60_000)}m ago`;
  return `${Math.floor(d / 3_600_000)}h ago`;
}

const SEV_COLOR: Record<string, string> = {
  critical: "text-red-400",
  high:     "text-orange-400",
  medium:   "text-amber-400",
  low:      "text-blue-400",
  info:     "text-white/40",
};
const SEV_BG: Record<string, string> = {
  critical: "bg-red-500/10 border-red-500/20",
  high:     "bg-orange-500/10 border-orange-500/20",
  medium:   "bg-amber-500/8 border-amber-500/15",
  low:      "bg-blue-500/8 border-blue-500/15",
  info:     "bg-white/[0.03] border-white/[0.06]",
};

/* ── Notification row ─────────────────────────────────────────────────── */
const NotifRow = memo(function NotifRow({
  notif,
  onRead,
}: {
  notif:  Notification;
  onRead: (id: string) => void;
}) {
  const Icon = notifIcon(notif.category);
  const sev  = notif.event.severity;
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1,  y:  0 }}
      exit={{    opacity: 0, height: 0, marginBottom: 0 }}
      transition={{ duration: 0.16 }}
      onClick={() => onRead(notif.id)}
      className={`relative flex cursor-pointer gap-3 rounded-xl border p-3 transition-colors ${
        notif.read ? "opacity-50" : ""
      } ${SEV_BG[sev] ?? SEV_BG.info}`}
    >
      {!notif.read && (
        <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-blue-400" />
      )}
      <div className={`mt-0.5 grid h-7 w-7 flex-shrink-0 place-items-center rounded-lg bg-white/5`}>
        <Icon className={`h-3.5 w-3.5 ${SEV_COLOR[sev] ?? ""}`} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[11px] font-semibold text-white/80">{notif.event.message}</p>
        <div className="mt-0.5 flex items-center gap-2">
          <span className={`text-[9px] font-bold uppercase ${SEV_COLOR[sev] ?? ""}`}>{sev}</span>
          {notif.event.username && (
            <span className="text-[9px] text-white/30">@{notif.event.username}</span>
          )}
          <span className="ml-auto text-[9px] text-white/20">{relativeTime(notif.ts)}</span>
        </div>
      </div>
    </motion.div>
  );
});

/* ── Surge banner ─────────────────────────────────────────────────────── */
function SurgeBanner({ count, onDismiss }: { count: number; onDismiss: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, scaleX: 0.8 }}
      animate={{ opacity: 1, scaleX: 1 }}
      exit={{    opacity: 0, scaleX: 0.8 }}
      className="flex items-center gap-2.5 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3"
    >
      <Zap className="h-4 w-4 animate-pulse text-red-400" />
      <div className="flex-1">
        <p className="text-[11px] font-black text-red-300">FRAUD SURGE DETECTED</p>
        <p className="text-[10px] text-red-400/70">{count} high-severity events in the last 60 s</p>
      </div>
      <button onClick={onDismiss} className="text-red-400/50 hover:text-red-400">
        <X className="h-3.5 w-3.5" />
      </button>
    </motion.div>
  );
}

/* ── Main component ───────────────────────────────────────────────────── */
interface NotificationCenterProps {
  liveEvents:  LiveFraudEvent[];
  reviewers:   ReviewerPresence[];
  isConnected: boolean;
}

export default function NotificationCenter({
  liveEvents,
  reviewers,
}: NotificationCenterProps) {
  const [isOpen,    setIsOpen]    = useState(false);
  const [sound,     setSound]     = useState(() =>
    typeof window !== "undefined"
      ? localStorage.getItem(SOUND_KEY) !== "off"
      : true,
  );
  const [notifs,    setNotifs]    = useState<Notification[]>([]);
  const [tab,       setTab]       = useState<"all" | "fraud" | "audit" | "surge">("all");
  const [surge,     setSurge]     = useState<{ count: number } | null>(null);
  const seenRef     = useRef<Set<string>>(new Set());
  const surgeTimesRef = useRef<number[]>([]);

  /* Persist sound preference */
  useEffect(() => {
    localStorage.setItem(SOUND_KEY, sound ? "on" : "off");
  }, [sound]);

  /* Process incoming live events */
  useEffect(() => {
    if (!liveEvents.length) return;
    const latest = liveEvents[0];
    if (!latest || seenRef.current.has(latest.id)) return;
    seenRef.current.add(latest.id);

    /* Play sound */
    if (sound && latest.severity !== "info" && latest.severity !== "low") {
      playSoundForSeverity(latest.severity);
    }

    /* Surge detection */
    const now = Date.now();
    if (latest.severity === "critical" || latest.severity === "high") {
      surgeTimesRef.current.push(now);
      surgeTimesRef.current = surgeTimesRef.current.filter(
        (t) => now - t < SURGE_WIN,
      );
      if (surgeTimesRef.current.length >= SURGE_TH && !surge) {
        setSurge({ count: surgeTimesRef.current.length });
        if (sound) playSurgeAlarm();
        setTimeout(() => setSurge(null), 90_000);
      }
    }

    /* Add notification */
    const notif: Notification = {
      id:       latest.id,
      event:    latest,
      read:     false,
      ts:       new Date(latest.ts).getTime(),
      category: categoryOf(latest),
    };
    setNotifs((prev) => [notif, ...prev].slice(0, MAX_NOTIFS));
  }, [liveEvents, sound, surge]);

  /* Reviewer join/leave notifications */
  const prevReviewersRef = useRef<ReviewerPresence[]>([]);
  useEffect(() => {
    const prev = prevReviewersRef.current;
    if (prev.length > 0 && reviewers.length !== prev.length) {
      const joined = reviewers.filter((r) => !prev.find((p) => p.socketId === r.socketId));
      const left   = prev.filter((p) => !reviewers.find((r) => r.socketId === p.socketId));
      const synth  = (r: ReviewerPresence, action: string) => ({
        id:       `rev-${r.socketId}-${Date.now()}`,
        event: {
          id:       `rev-${r.socketId}`,
          type:     "admin_login" as const,
          severity: "info" as const,
          message:  `${r.username} ${action} the admin panel`,
          adminUsername: r.username,
          ts:       new Date().toISOString(),
        },
        read:     false,
        ts:       Date.now(),
        category: "reviewer" as const,
      });
      const next: Notification[] = [
        ...joined.map((r) => synth(r, "joined")),
        ...left.map((r) => synth(r, "left")),
      ];
      if (next.length) setNotifs((p) => [...next, ...p].slice(0, MAX_NOTIFS));
    }
    prevReviewersRef.current = reviewers;
  }, [reviewers]);

  const markRead  = useCallback((id: string) => setNotifs((p) => p.map((n) => n.id === id ? { ...n, read: true } : n)), []);
  const markAll   = useCallback(() => setNotifs((p) => p.map((n) => ({ ...n, read: true }))), []);
  const clearAll  = useCallback(() => setNotifs([]), []);
  const exportLog = useCallback(() => {
    const blob = new Blob([JSON.stringify(notifs, null, 2)], { type: "application/json" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a"); a.href = url;
    a.download = `notifications-${Date.now()}.json`; a.click();
    URL.revokeObjectURL(url);
  }, [notifs]);

  const unread  = notifs.filter((n) => !n.read).length;
  const display = tab === "all"   ? notifs
    : tab === "fraud" ? notifs.filter((n) => n.category === "fraud")
    : tab === "audit" ? notifs.filter((n) => n.category === "audit" || n.category === "reviewer")
    : notifs.filter((n) => n.category === "surge");

  return (
    <>
      {/* ── Bell trigger ──────────────────────────────────────────────── */}
      <button
        onClick={() => setIsOpen((o) => !o)}
        className="relative flex h-8 w-8 items-center justify-center rounded-xl border border-white/[0.07] bg-white/[0.03] text-white/50 transition-colors hover:border-white/[0.12] hover:text-white/80"
      >
        <Bell className="h-3.5 w-3.5" />
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[8px] font-black text-white">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {/* ── Drawer ────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              key="notif-backdrop"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-40"
              onClick={() => setIsOpen(false)}
            />
            {/* Panel */}
            <motion.div
              key="notif-panel"
              initial={{ opacity: 0, x: 16, scale: 0.97 }}
              animate={{ opacity: 1, x: 0,  scale: 1    }}
              exit={{    opacity: 0, x: 16, scale: 0.97 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
              className="fixed right-4 top-14 z-50 flex w-[360px] flex-col rounded-2xl border border-white/[0.08] bg-[#080e1a] shadow-2xl"
              style={{ maxHeight: "calc(100vh - 80px)" }}
            >
              {/* Header */}
              <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
                <div className="flex items-center gap-2">
                  <Bell className="h-4 w-4 text-white/50" />
                  <span className="text-sm font-bold text-white">Notifications</span>
                  {unread > 0 && (
                    <span className="rounded-full bg-red-500/20 px-1.5 py-px text-[9px] font-bold text-red-400">
                      {unread} unread
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    title={sound ? "Mute sounds" : "Enable sounds"}
                    onClick={() => setSound((s) => !s)}
                    className="rounded-lg p-1.5 text-white/30 hover:bg-white/5 hover:text-white/60"
                  >
                    {sound ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
                  </button>
                  <button onClick={markAll}    className="rounded-lg p-1.5 text-white/30 hover:bg-white/5 hover:text-white/60" title="Mark all read"><CheckCheck className="h-3.5 w-3.5" /></button>
                  <button onClick={clearAll}   className="rounded-lg p-1.5 text-white/30 hover:bg-white/5 hover:text-white/60" title="Clear all"><Trash2 className="h-3.5 w-3.5" /></button>
                  <button onClick={exportLog}  className="rounded-lg p-1.5 text-white/30 hover:bg-white/5 hover:text-white/60" title="Export"><Download className="h-3.5 w-3.5" /></button>
                  <button onClick={() => setIsOpen(false)} className="rounded-lg p-1.5 text-white/30 hover:bg-white/5 hover:text-white/60"><X className="h-3.5 w-3.5" /></button>
                </div>
              </div>

              {/* Tabs */}
              <div className="flex gap-0.5 border-b border-white/[0.06] px-3 py-2">
                {(["all", "fraud", "audit", "surge"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setTab(t)}
                    className={`rounded-lg px-2.5 py-1 text-[10px] font-semibold capitalize transition-colors ${
                      tab === t ? "bg-white/[0.07] text-white" : "text-white/35 hover:text-white/60"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>

              {/* Surge banner */}
              <AnimatePresence>
                {surge && (
                  <div className="p-3 pb-0">
                    <SurgeBanner count={surge.count} onDismiss={() => setSurge(null)} />
                  </div>
                )}
              </AnimatePresence>

              {/* Notification list */}
              <div className="flex-1 overflow-y-auto p-3 scrollbar-none">
                {display.length === 0 ? (
                  <div className="flex flex-col items-center justify-center gap-2 py-12">
                    <BellOff className="h-8 w-8 text-white/10" />
                    <p className="text-[11px] text-white/25">No notifications</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <AnimatePresence initial={false}>
                      {display.map((n) => (
                        <NotifRow key={n.id} notif={n} onRead={markRead} />
                      ))}
                    </AnimatePresence>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between border-t border-white/[0.05] px-4 py-2">
                <span className="text-[9px] text-white/20">
                  {notifs.length} total · {sound ? "Sound on" : "Sound off"}
                </span>
                <div className="flex items-center gap-1">
                  <span className={`h-1.5 w-1.5 rounded-full ${surge ? "animate-ping bg-red-500" : "bg-white/15"}`} />
                  <span className="text-[9px] text-white/20">{surge ? "SURGE" : "Normal"}</span>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

/* ── Exported sound toggle for external use ───────────────────────────── */
export { playSoundForSeverity, playSurgeAlarm };
