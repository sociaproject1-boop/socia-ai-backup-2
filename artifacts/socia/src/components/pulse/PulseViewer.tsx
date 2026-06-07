/**
 * PulseViewer.tsx — Full-screen PULSE viewer.
 *
 * Features:
 *  • Per-user progress bars (auto-advance 5s / video duration)
 *  • Tap left 35% → prev, right 65% → next
 *  • Hold anywhere → pause
 *  • Swipe down → close
 *  • Realtime viewer count
 *  • Emoji reactions
 *  • Delete own / report others
 *  • Video plays UNMUTED (with muted fallback for browser policy)
 *  • No download / PiP / playback speed controls
 */
import { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X, Eye, Trash2, Flag, Heart, ChevronLeft, ChevronRight } from "lucide-react";
import { recordPulseView, deletePulse, reactToPulse, reportPulse } from "@/lib/pulseClient";
import type { Pulse, PulseFeedGroup } from "@/lib/pulseClient";
import { useAppStore } from "@/lib/store";

const PULSE_DURATION_MS = 5000;
const EMOJIS = ["❤️", "🔥", "😍", "👏", "😂", "💜"];

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor(diff / 60_000);
  if (h >= 1) return `${h}h`;
  if (m >= 1) return `${m}m`;
  return "just now";
}

function ProgressBars({ total, current, progress }: { total: number; current: number; progress: number }) {
  return (
    <div className="flex gap-1 w-full px-2 pt-2">
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} className="flex-1 h-[3px] rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.25)" }}>
          <div
            className="h-full rounded-full"
            style={{
              width: i < current ? "100%" : i === current ? `${progress * 100}%` : "0%",
              background: "white",
              transition: i === current ? "none" : undefined,
            }}
          />
        </div>
      ))}
    </div>
  );
}

function TextPulse({ pulse }: { pulse: Pulse }) {
  return (
    <div
      className="w-full h-full flex items-center justify-center p-10"
      style={{ background: pulse.text_bg ?? "#0f0f23" }}
    >
      <p
        className="text-center text-2xl font-bold leading-snug"
        style={{ color: pulse.text_color ?? "#ffffff", textShadow: "0 2px 20px rgba(0,0,0,0.5)" }}
      >
        {pulse.text_content}
      </p>
    </div>
  );
}

/* ── Main Viewer ─────────────────────────────────────────────────────────── */

interface PulseViewerProps {
  groups:           PulseFeedGroup[];
  startGroupIndex:  number;
  startPulseIndex?: number;
  onClose:          () => void;
  onMarkViewed?:    (pulseId: string) => void;
}

export function PulseViewer({
  groups,
  startGroupIndex,
  startPulseIndex = 0,
  onClose,
  onMarkViewed,
}: PulseViewerProps) {
  const me = useAppStore((s) => s.user);

  const [groupIdx, setGroupIdx]     = useState(startGroupIndex);
  const [pulseIdx, setPulseIdx]     = useState(startPulseIndex);
  const [progress, setProgress]     = useState(0);
  const [paused,   setPaused]       = useState(false);
  const [viewCount, setViewCount]   = useState<number | null>(null);
  const [reaction, setReaction]     = useState<string | null>(null);
  const [showReacts, setShowReacts] = useState(false);
  const [localDeleted, setLocalDeleted] = useState<Set<string>>(new Set());

  const animRef      = useRef<number | null>(null);
  const startRef     = useRef<number>(0);
  const elapsed      = useRef<number>(0);
  const videoRef     = useRef<HTMLVideoElement | null>(null);
  const swipeStartY  = useRef<number | null>(null);

  const group       = groups[groupIdx];
  const availPulses = group?.pulses.filter((p) => !localDeleted.has(p.id)) ?? [];
  const pulse       = availPulses[pulseIdx];
  const isOwnPulse  = pulse?.user_id === me?.id;

  /* ── Record view ─────────────────────────────────────────────────────── */
  useEffect(() => {
    if (!pulse) return;
    let cancelled = false;
    recordPulseView(pulse.id)
      .then((r) => { if (!cancelled) { setViewCount(r.view_count); onMarkViewed?.(pulse.id); } })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [pulse?.id, onMarkViewed]);

  /* ── Video: autoplay UNMUTED, muted fallback ─────────────────────────── */
  useEffect(() => {
    const v = videoRef.current;
    if (!v || pulse?.type !== "video") return;
    v.muted = false;
    v.play().catch(() => {
      v.muted = true;
      v.play().catch(() => {});
    });
  }, [pulse?.id]);

  /* ── Progress animation ──────────────────────────────────────────────── */
  const advance = useCallback(() => {
    const next = pulseIdx + 1;
    if (next < availPulses.length) {
      setPulseIdx(next); setProgress(0); elapsed.current = 0;
    } else {
      const ng = groupIdx + 1;
      if (ng < groups.length) {
        setGroupIdx(ng); setPulseIdx(0); setProgress(0); elapsed.current = 0;
      } else {
        onClose();
      }
    }
  }, [pulseIdx, availPulses.length, groupIdx, groups.length, onClose]);

  useEffect(() => {
    if (!pulse || paused || pulse.type === "video") return;
    elapsed.current = 0;
    startRef.current = performance.now();
    setProgress(0);
    function tick(now: number) {
      const delta = now - startRef.current;
      startRef.current = now;
      elapsed.current += delta;
      const p = Math.min(elapsed.current / PULSE_DURATION_MS, 1);
      setProgress(p);
      if (p >= 1) { advance(); } else { animRef.current = requestAnimationFrame(tick); }
    }
    animRef.current = requestAnimationFrame(tick);
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, [pulse?.id, paused, advance]);

  const handleVideoEnd      = useCallback(() => advance(), [advance]);
  const handleVideoProgress = useCallback((e: React.SyntheticEvent<HTMLVideoElement>) => {
    const v = e.currentTarget;
    if (v.duration) setProgress(v.currentTime / v.duration);
  }, []);

  /* ── Navigation ──────────────────────────────────────────────────────── */
  const goPrev = useCallback(() => {
    if (pulseIdx > 0) { setPulseIdx(pulseIdx - 1); setProgress(0); elapsed.current = 0; return; }
    if (groupIdx > 0) { setGroupIdx(groupIdx - 1); setPulseIdx(0); setProgress(0); elapsed.current = 0; }
  }, [pulseIdx, groupIdx]);

  const goNext = useCallback(() => advance(), [advance]);

  const handleTap = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (showReacts) { setShowReacts(false); return; }
    const x = e.clientX / window.innerWidth;
    if (x < 0.35) goPrev(); else goNext();
  }, [goPrev, goNext, showReacts]);

  /* ── Hold to pause ───────────────────────────────────────────────────── */
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    swipeStartY.current = e.clientY;
    holdTimer.current = setTimeout(() => {
      setPaused(true);
      videoRef.current?.pause();
    }, 150);
  }, []);
  const handlePointerUp = useCallback(() => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    setPaused(false);
    videoRef.current?.play().catch(() => {});
    swipeStartY.current = null;
  }, []);
  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (swipeStartY.current === null) return;
    if (e.clientY - swipeStartY.current > 80) { swipeStartY.current = null; onClose(); }
  }, [onClose]);

  /* ── Delete / Report / React ─────────────────────────────────────────── */
  const handleDelete = useCallback(async () => {
    if (!pulse) return;
    try { await deletePulse(pulse.id); setLocalDeleted((prev) => new Set([...prev, pulse.id])); advance(); }
    catch { /* ignore */ }
  }, [pulse, advance]);

  const handleReport = useCallback(async () => {
    if (!pulse) return;
    try { await reportPulse(pulse.id, "Inappropriate content"); } catch { /* ignore */ }
  }, [pulse]);

  const handleReact = useCallback(async (emoji: string) => {
    if (!pulse) return;
    setReaction(emoji); setShowReacts(false);
    try { await reactToPulse(pulse.id, emoji); } catch { /* ignore */ }
  }, [pulse]);

  if (!group || !pulse) return null;

  return createPortal(
    <AnimatePresence>
      <motion.div
        key="pulse-viewer"
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        transition={{ duration: 0.18 }}
        className="fixed inset-0 z-[9999] flex flex-col"
        style={{ background: "#000", touchAction: "none" }}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerMove={handlePointerMove}
        onPointerCancel={handlePointerUp}
      >
        {/* Progress bars */}
        <div className="relative z-10 pt-safe">
          <ProgressBars total={availPulses.length} current={pulseIdx} progress={progress} />

          {/* Header */}
          <div className="flex items-center gap-3 px-3 pt-2 pb-1">
            <div className="h-9 w-9 rounded-full overflow-hidden flex-shrink-0"
              style={{ outline: "2px solid rgba(255,255,255,0.4)" }}>
              {group.user.avatar_url
                ? <img src={group.user.avatar_url} className="h-full w-full object-cover" alt="" />
                : <div className="h-full w-full bg-gradient-to-br from-purple-600 to-pink-500" />
              }
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-white truncate">
                {group.user.name ?? group.user.username ?? "Unknown"}
              </p>
              <p className="text-[10px] text-white/55">{timeAgo(pulse.created_at)}</p>
            </div>

            {viewCount !== null && isOwnPulse && (
              <div className="flex items-center gap-1 text-white/55 text-xs mr-1">
                <Eye className="h-3.5 w-3.5" />
                <span>{viewCount}</span>
              </div>
            )}
            {paused && (
              <div className="rounded-full px-2 py-0.5 text-[10px] font-bold text-white"
                style={{ background: "rgba(255,255,255,0.14)" }}>
                ⏸ Hold
              </div>
            )}

            <button
              onClick={(e) => { e.stopPropagation(); onClose(); }}
              className="grid h-8 w-8 place-items-center rounded-full"
              style={{ background: "rgba(0,0,0,0.45)" }}
            >
              <X className="h-4 w-4 text-white" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="relative flex-1 overflow-hidden" onClick={handleTap}>
          {pulse.type === "image" && pulse.media_url && (
            <img
              src={pulse.media_url}
              className="h-full w-full object-cover"
              alt="Pulse"
              draggable={false}
            />
          )}

          {pulse.type === "video" && pulse.media_url && (
            <video
              ref={videoRef}
              src={pulse.media_url}
              className="h-full w-full object-cover"
              playsInline
              loop
              disablePictureInPicture
              controlsList="nodownload noplaybackrate nofullscreen"
              onContextMenu={(e) => e.preventDefault()}
              onEnded={handleVideoEnd}
              onTimeUpdate={handleVideoProgress}
            />
          )}

          {pulse.type === "text" && <TextPulse pulse={pulse} />}

          <div className="pointer-events-none absolute inset-y-0 left-0 w-1/3 flex items-center justify-start pl-3 opacity-0 hover:opacity-40 transition-opacity">
            <ChevronLeft className="h-8 w-8 text-white" />
          </div>
          <div className="pointer-events-none absolute inset-y-0 right-0 w-1/3 flex items-center justify-end pr-3 opacity-0 hover:opacity-40 transition-opacity">
            <ChevronRight className="h-8 w-8 text-white" />
          </div>
        </div>

        {/* Bottom bar */}
        <div
          className="relative z-10 flex items-center gap-3 px-4 pt-4"
          style={{
            paddingBottom: `max(20px, env(safe-area-inset-bottom, 20px))`,
            background: "linear-gradient(to top, rgba(0,0,0,0.75), transparent)",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {pulse.music_name && (
            <div className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs text-white"
              style={{ background: "rgba(255,255,255,0.12)" }}>
              🎵 {pulse.music_name}
            </div>
          )}
          <div className="flex-1" />

          {/* Reactions popup */}
          <AnimatePresence>
            {showReacts && (
              <motion.div
                initial={{ opacity: 0, y: 10, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.9 }}
                className="absolute bottom-16 right-4 flex gap-2 rounded-2xl p-2.5"
                style={{ background: "rgba(20,20,35,0.96)", border: "1px solid rgba(255,255,255,0.1)" }}
              >
                {EMOJIS.map((e) => (
                  <button key={e} className="text-xl" onClick={() => handleReact(e)}>{e}</button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          {reaction && <span className="text-xl">{reaction}</span>}

          <button
            onClick={() => setShowReacts((v) => !v)}
            className="grid h-9 w-9 place-items-center rounded-full"
            style={{ background: "rgba(255,255,255,0.14)" }}
          >
            <Heart className="h-4 w-4 text-white" />
          </button>

          {isOwnPulse ? (
            <button
              onClick={handleDelete}
              className="grid h-9 w-9 place-items-center rounded-full"
              style={{ background: "rgba(255,60,60,0.18)" }}
            >
              <Trash2 className="h-4 w-4 text-red-400" />
            </button>
          ) : (
            <button
              onClick={handleReport}
              className="grid h-9 w-9 place-items-center rounded-full"
              style={{ background: "rgba(255,255,255,0.08)" }}
            >
              <Flag className="h-4 w-4 text-white/60" />
            </button>
          )}
        </div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}

/* ── PulseViewerHost ─────────────────────────────────────────────────────── */

export function PulseViewerHost() {
  const [state, setState] = useState<{
    groups:          PulseFeedGroup[];
    startGroupIndex: number;
    startPulseIndex: number;
  } | null>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      const { groups, groupIndex, pulseIndex } = (e as CustomEvent).detail ?? {};
      if (!groups?.length) return;
      setState({ groups, startGroupIndex: groupIndex ?? 0, startPulseIndex: pulseIndex ?? 0 });
    };
    window.addEventListener("socia:open-pulse", handler);
    return () => window.removeEventListener("socia:open-pulse", handler);
  }, []);

  if (!state) return null;

  return (
    <PulseViewer
      groups={state.groups}
      startGroupIndex={state.startGroupIndex}
      startPulseIndex={state.startPulseIndex}
      onClose={() => setState(null)}
    />
  );
}

export function openPulseViewer(groups: PulseFeedGroup[], groupIndex: number, pulseIndex = 0) {
  window.dispatchEvent(
    new CustomEvent("socia:open-pulse", { detail: { groups, groupIndex, pulseIndex } })
  );
}
