/**
 * PulseViewer.tsx — Full-screen PULSE viewer (v2).
 *
 * Improvements over v1:
 *  • Silent hold-to-pause — no "Hold" badge
 *  • 3-dots menu replaces raw trash/flag buttons
 *  • Reactions redesign: ❤️😂😮😢😡 + quick-reply input
 *  • Clickable header (avatar + name → open profile)
 *  • Horizontal swipe to navigate between user groups
 *  • Owner viewer-stats bottom sheet (tap eye)
 *  • Swipe-down to dismiss preserved
 */
import { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useLocation } from "wouter";
import {
  X, Eye, MoreVertical, Flag, Send,
  ChevronLeft, ChevronRight, Trash2, Archive,
  Download, BarChart2, Share2,
} from "lucide-react";
import {
  recordPulseView, deletePulse, reactToPulse,
  reportPulse, fetchPulseViews,
} from "@/lib/pulseClient";
import type { Pulse, PulseFeedGroup } from "@/lib/pulseClient";
import { useAppStore } from "@/lib/store";

const PULSE_DURATION_MS = 5000;

const REACTIONS: { emoji: string; label: string }[] = [
  { emoji: "❤️", label: "Love"  },
  { emoji: "😂", label: "Haha"  },
  { emoji: "😮", label: "Wow"   },
  { emoji: "😢", label: "Sad"   },
  { emoji: "😡", label: "Angry" },
];

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor(diff / 60_000);
  if (h >= 1) return `${h}h ago`;
  if (m >= 1) return `${m}m ago`;
  return "just now";
}

/* ── Progress bars ────────────────────────────────────────────────────────── */
function ProgressBars({ total, current, progress }: { total: number; current: number; progress: number }) {
  return (
    <div className="flex gap-1 w-full px-2 pt-2">
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} className="flex-1 h-[3px] rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.25)" }}>
          <div
            className="h-full rounded-full"
            style={{
              width:      i < current ? "100%" : i === current ? `${progress * 100}%` : "0%",
              background: "white",
              transition: i === current ? "none" : undefined,
            }}
          />
        </div>
      ))}
    </div>
  );
}

/* ── Text pulse ───────────────────────────────────────────────────────────── */
function TextPulse({ pulse }: { pulse: Pulse }) {
  return (
    <div className="w-full h-full flex items-center justify-center p-10"
      style={{ background: pulse.text_bg ?? "#0f0f23" }}>
      <p className="text-center text-2xl font-bold leading-snug"
        style={{ color: pulse.text_color ?? "#ffffff", textShadow: "0 2px 20px rgba(0,0,0,0.5)" }}>
        {pulse.text_content}
      </p>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Main Viewer
══════════════════════════════════════════════════════════════════════════ */
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
  const [, navigate] = useLocation();

  const [groupIdx,     setGroupIdx]     = useState(startGroupIndex);
  const [pulseIdx,     setPulseIdx]     = useState(startPulseIndex);
  const [progress,     setProgress]     = useState(0);
  const [paused,       setPaused]       = useState(false);
  const [viewCount,    setViewCount]    = useState<number | null>(null);
  const [reaction,     setReaction]     = useState<string | null>(null);
  const [showReacts,   setShowReacts]   = useState(false);
  const [showMenu,     setShowMenu]     = useState(false);
  const [showViewers,  setShowViewers]  = useState(false);
  const [replyText,    setReplyText]    = useState("");
  const [replySent,    setReplySent]    = useState(false);
  const [viewers,      setViewers]      = useState<any[]>([]);
  const [localDeleted, setLocalDeleted] = useState<Set<string>>(new Set());

  const animRef      = useRef<number | null>(null);
  const startRef     = useRef<number>(0);
  const elapsed      = useRef<number>(0);
  const videoRef     = useRef<HTMLVideoElement | null>(null);

  /* Swipe gesture tracking */
  const gesture = useRef<{ startX: number; startY: number; fired: boolean; holdTimer: ReturnType<typeof setTimeout> | null }>({
    startX: 0, startY: 0, fired: false, holdTimer: null,
  });

  const group       = groups[groupIdx];
  const availPulses = group?.pulses.filter((p) => !localDeleted.has(p.id)) ?? [];
  const pulse       = availPulses[pulseIdx];
  const isOwnPulse  = pulse?.user_id === me?.id;

  /* Sheet open = pause story */
  const anySheetOpen = showReacts || showMenu || showViewers;

  /* ── Record view ─────────────────────────────────────────────────────── */
  useEffect(() => {
    if (!pulse) return;
    let cancelled = false;
    recordPulseView(pulse.id)
      .then((r) => { if (!cancelled) { setViewCount(r.view_count); onMarkViewed?.(pulse.id); } })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [pulse?.id, onMarkViewed]);

  /* ── Video autoplay ──────────────────────────────────────────────────── */
  useEffect(() => {
    const v = videoRef.current;
    if (!v || pulse?.type !== "video") return;
    v.muted = false;
    v.play().catch(() => { v.muted = true; v.play().catch(() => {}); });
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
    if (!pulse || paused || anySheetOpen || pulse.type === "video") return;
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
  }, [pulse?.id, paused, anySheetOpen, advance]);

  const handleVideoEnd      = useCallback(() => advance(), [advance]);
  const handleVideoProgress = useCallback((e: React.SyntheticEvent<HTMLVideoElement>) => {
    const v = e.currentTarget;
    if (v.duration) setProgress(v.currentTime / v.duration);
  }, []);

  /* ── Navigation ──────────────────────────────────────────────────────── */
  const goPrev = useCallback(() => {
    if (pulseIdx > 0)       { setPulseIdx(pulseIdx - 1); setProgress(0); elapsed.current = 0; return; }
    if (groupIdx > 0)       { setGroupIdx(groupIdx - 1); setPulseIdx(0); setProgress(0); elapsed.current = 0; }
  }, [pulseIdx, groupIdx]);

  const goNext = useCallback(() => advance(), [advance]);

  const goNextGroup = useCallback(() => {
    const ng = groupIdx + 1;
    if (ng < groups.length) { setGroupIdx(ng); setPulseIdx(0); setProgress(0); elapsed.current = 0; }
    else onClose();
  }, [groupIdx, groups.length, onClose]);

  const goPrevGroup = useCallback(() => {
    const ng = groupIdx - 1;
    if (ng >= 0) { setGroupIdx(ng); setPulseIdx(0); setProgress(0); elapsed.current = 0; }
  }, [groupIdx]);

  /* ── Tap navigation ──────────────────────────────────────────────────── */
  const handleTap = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (gesture.current.fired) { gesture.current.fired = false; return; }
    if (anySheetOpen) { setShowReacts(false); setShowMenu(false); setShowViewers(false); return; }
    const x = e.clientX / window.innerWidth;
    if (x < 0.35) goPrev(); else goNext();
  }, [goPrev, goNext, anySheetOpen]);

  /* ── Pointer gesture (hold + swipe) ─────────────────────────────────── */
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    gesture.current.startX  = e.clientX;
    gesture.current.startY  = e.clientY;
    gesture.current.fired   = false;
    if (gesture.current.holdTimer) clearTimeout(gesture.current.holdTimer);
    gesture.current.holdTimer = setTimeout(() => {
      setPaused(true);
      videoRef.current?.pause();
    }, 200);
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    const dx = e.clientX - gesture.current.startX;
    const dy = e.clientY - gesture.current.startY;
    const adx = Math.abs(dx);
    const ady = Math.abs(dy);

    /* Swipe down → close */
    if (ady > 80 && ady > adx && !gesture.current.fired) {
      gesture.current.fired = true;
      if (gesture.current.holdTimer) clearTimeout(gesture.current.holdTimer);
      onClose();
      return;
    }
    /* Swipe left/right → navigate groups */
    if (adx > 60 && adx > ady && !gesture.current.fired) {
      gesture.current.fired = true;
      if (gesture.current.holdTimer) clearTimeout(gesture.current.holdTimer);
      setPaused(false);
      videoRef.current?.play().catch(() => {});
      if (dx < 0) goNextGroup();
      else goPrevGroup();
    }
  }, [onClose, goNextGroup, goPrevGroup]);

  const handlePointerUp = useCallback(() => {
    if (gesture.current.holdTimer) clearTimeout(gesture.current.holdTimer);
    setPaused(false);
    videoRef.current?.play().catch(() => {});
  }, []);

  /* ── Delete / Report ─────────────────────────────────────────────────── */
  const handleDelete = useCallback(async () => {
    if (!pulse) return;
    setShowMenu(false);
    try { await deletePulse(pulse.id); setLocalDeleted((prev) => new Set([...prev, pulse.id])); advance(); }
    catch { /* ignore */ }
  }, [pulse, advance]);

  const handleReport = useCallback(async () => {
    if (!pulse) return;
    setShowMenu(false);
    try { await reportPulse(pulse.id, "Inappropriate content"); } catch { /* ignore */ }
  }, [pulse]);

  /* ── Reactions ───────────────────────────────────────────────────────── */
  const handleReact = useCallback(async (emoji: string) => {
    if (!pulse) return;
    setReaction(emoji);
    setShowReacts(false);
    try { await reactToPulse(pulse.id, emoji); } catch { /* ignore */ }
  }, [pulse]);

  const handleQuickReply = useCallback(async () => {
    if (!pulse || !replyText.trim()) return;
    try { await reactToPulse(pulse.id, `💬 ${replyText.trim()}`); } catch { /* ignore */ }
    setReplyText("");
    setReplySent(true);
    setShowReacts(false);
    setTimeout(() => setReplySent(false), 2500);
  }, [pulse, replyText]);

  /* ── Viewer stats ─────────────────────────────────────────────────────── */
  const handleOpenViewers = useCallback(async () => {
    if (!pulse) return;
    setShowViewers(true);
    try {
      const res = await fetchPulseViews(pulse.id);
      setViewers(res.views ?? []);
    } catch { /* ignore */ }
  }, [pulse]);

  /* ── Navigate to profile ─────────────────────────────────────────────── */
  const openProfile = useCallback((userId: string) => {
    onClose();
    setTimeout(() => navigate(`/profile/${userId}`), 80);
  }, [onClose, navigate]);

  if (!group || !pulse) return null;

  return createPortal(
    <AnimatePresence>
      <motion.div
        key="pulse-viewer"
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.97 }}
        transition={{ duration: 0.15 }}
        className="fixed inset-0 z-[9999] flex flex-col"
        style={{ background: "#000", touchAction: "none" }}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerMove={handlePointerMove}
        onPointerCancel={handlePointerUp}
      >
        {/* ── Progress bars ─────────────────────────────────────────────── */}
        <div className="relative z-10 pt-safe">
          <ProgressBars total={availPulses.length} current={pulseIdx} progress={progress} />

          {/* ── Header ──────────────────────────────────────────────────── */}
          <div className="flex items-center gap-3 px-3 pt-2 pb-1">

            {/* Avatar — clickable */}
            <button
              type="button"
              className="h-10 w-10 rounded-full overflow-hidden flex-shrink-0 focus:outline-none"
              style={{ outline: "2px solid rgba(255,255,255,0.4)" }}
              onClick={(e) => { e.stopPropagation(); openProfile(group.user.id); }}
            >
              {group.user.avatar_url
                ? <img src={group.user.avatar_url} className="h-full w-full object-cover" alt="" />
                : <div className="h-full w-full bg-gradient-to-br from-purple-600 to-pink-500" />
              }
            </button>

            {/* Name + time — clickable */}
            <button
              type="button"
              className="flex-1 min-w-0 text-left focus:outline-none"
              onClick={(e) => { e.stopPropagation(); openProfile(group.user.id); }}
            >
              <p className="text-sm font-bold text-white truncate leading-tight">
                {group.user.name ?? group.user.username ?? "Unknown"}
              </p>
              <p className="text-[10px] text-white/55 truncate leading-tight">
                {group.user.username ? `@${group.user.username} · ` : ""}{timeAgo(pulse.created_at)}
              </p>
            </button>

            {/* View count — owner only, opens viewer list */}
            {viewCount !== null && isOwnPulse && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); handleOpenViewers(); }}
                className="flex items-center gap-1 text-white/55 text-xs mr-1"
              >
                <Eye className="h-3.5 w-3.5" />
                <span>{viewCount}</span>
              </button>
            )}

            {/* 3-dots menu */}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setShowMenu(true); }}
              className="grid h-8 w-8 place-items-center rounded-full"
              style={{ background: "rgba(0,0,0,0.4)" }}
            >
              <MoreVertical className="h-4 w-4 text-white" />
            </button>

            {/* Close */}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onClose(); }}
              className="grid h-8 w-8 place-items-center rounded-full"
              style={{ background: "rgba(0,0,0,0.4)" }}
            >
              <X className="h-4 w-4 text-white" />
            </button>
          </div>
        </div>

        {/* ── Content ───────────────────────────────────────────────────── */}
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

          {/* Subtle tap zone hints */}
          <div className="pointer-events-none absolute inset-y-0 left-0 w-1/3 flex items-center justify-start pl-3 opacity-0 hover:opacity-30 transition-opacity">
            <ChevronLeft className="h-8 w-8 text-white" />
          </div>
          <div className="pointer-events-none absolute inset-y-0 right-0 w-1/3 flex items-center justify-end pr-3 opacity-0 hover:opacity-30 transition-opacity">
            <ChevronRight className="h-8 w-8 text-white" />
          </div>
        </div>

        {/* ── Bottom bar ────────────────────────────────────────────────── */}
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

          {/* Reply sent toast */}
          <AnimatePresence>
            {replySent && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="absolute bottom-20 right-4 rounded-2xl px-3 py-2 text-xs font-semibold text-white"
                style={{ background: "rgba(6,214,160,0.22)", border: "1px solid rgba(6,214,160,0.4)" }}
              >
                Reply sent ✓
              </motion.div>
            )}
          </AnimatePresence>

          {/* Selected reaction display */}
          {reaction && <span className="text-2xl">{reaction}</span>}

          {/* React button */}
          <button
            type="button"
            onClick={() => { setShowReacts(true); }}
            className="grid h-10 w-10 place-items-center rounded-full text-lg"
            style={{ background: "rgba(255,255,255,0.14)" }}
          >
            ❤️
          </button>
        </div>

        {/* ══════════════════════════════════════════════════════════════
            REACTIONS SHEET
        ══════════════════════════════════════════════════════════════ */}
        <AnimatePresence>
          {showReacts && (
            <>
              <motion.div
                className="fixed inset-0 z-[100]"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setShowReacts(false)}
              />
              <motion.div
                className="fixed bottom-0 left-0 right-0 z-[101] rounded-t-[28px] overflow-hidden"
                style={{
                  background: "rgba(12,8,20,0.97)",
                  backdropFilter: "blur(24px)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  paddingBottom: `max(env(safe-area-inset-bottom, 0px), 24px)`,
                }}
                initial={{ y: "100%" }}
                animate={{ y: 0 }}
                exit={{ y: "100%" }}
                transition={{ type: "spring", stiffness: 380, damping: 34 }}
                onClick={(e) => e.stopPropagation()}
              >
                {/* Handle */}
                <div className="flex justify-center pt-3 pb-4">
                  <div className="h-[3px] w-10 rounded-full bg-white/20" />
                </div>

                {/* Reaction buttons */}
                <div className="flex justify-around px-6 mb-5">
                  {REACTIONS.map(({ emoji, label }) => (
                    <motion.button
                      key={emoji}
                      type="button"
                      whileTap={{ scale: 0.8 }}
                      onClick={() => handleReact(emoji)}
                      className="flex flex-col items-center gap-1.5"
                    >
                      <motion.span
                        className="text-[36px]"
                        whileHover={{ scale: 1.2 }}
                        transition={{ type: "spring", stiffness: 400, damping: 12 }}
                      >
                        {emoji}
                      </motion.span>
                      <span className="text-[10px] font-semibold text-white/50">{label}</span>
                    </motion.button>
                  ))}
                </div>

                {/* Quick reply */}
                <div className="flex items-center gap-3 px-4 pb-2">
                  <div
                    className="flex-1 flex items-center rounded-full px-4 py-3"
                    style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)" }}
                  >
                    <input
                      type="text"
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") handleQuickReply(); }}
                      placeholder="Reply to story…"
                      className="flex-1 bg-transparent text-[13px] text-white outline-none placeholder:text-white/30"
                      autoFocus
                    />
                  </div>
                  <motion.button
                    type="button"
                    whileTap={{ scale: 0.88 }}
                    onClick={handleQuickReply}
                    disabled={!replyText.trim()}
                    className="grid h-11 w-11 place-items-center rounded-full disabled:opacity-30"
                    style={{ background: "linear-gradient(135deg,#8338ec,#ff006e)" }}
                  >
                    <Send className="h-4 w-4 text-white" />
                  </motion.button>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>

        {/* ══════════════════════════════════════════════════════════════
            3-DOTS MENU SHEET
        ══════════════════════════════════════════════════════════════ */}
        <AnimatePresence>
          {showMenu && (
            <>
              <motion.div
                className="fixed inset-0 z-[100]"
                style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)" }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setShowMenu(false)}
              />
              <motion.div
                className="fixed bottom-0 left-0 right-0 z-[101] rounded-t-[28px] overflow-hidden"
                style={{
                  background: "rgba(12,8,20,0.97)",
                  backdropFilter: "blur(24px)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  paddingBottom: `max(env(safe-area-inset-bottom, 0px), 24px)`,
                }}
                initial={{ y: "100%" }}
                animate={{ y: 0 }}
                exit={{ y: "100%" }}
                transition={{ type: "spring", stiffness: 380, damping: 34 }}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex justify-center pt-3 pb-2">
                  <div className="h-[3px] w-10 rounded-full bg-white/20" />
                </div>

                <p className="text-center text-[11px] font-bold uppercase tracking-widest text-white/30 mb-3 px-4">
                  {isOwnPulse ? "Story Options" : "Report"}
                </p>

                {isOwnPulse ? (
                  <div className="px-4 space-y-1">
                    <MenuRow icon={<Trash2 className="h-4 w-4 text-red-400" />} label="Delete Story" labelClass="text-red-400" onClick={handleDelete} />
                    <MenuRow icon={<Archive className="h-4 w-4 text-white/70" />} label="Archive Story" onClick={() => setShowMenu(false)} />
                    <MenuRow icon={<Download className="h-4 w-4 text-white/70" />} label="Save Story" onClick={() => setShowMenu(false)} />
                    <MenuRow icon={<BarChart2 className="h-4 w-4 text-white/70" />} label="Story Insights" onClick={() => { setShowMenu(false); handleOpenViewers(); }} />
                    <MenuRow icon={<Share2 className="h-4 w-4 text-white/70" />} label="Share Story" onClick={() => setShowMenu(false)} />
                  </div>
                ) : (
                  <div className="px-4 space-y-1">
                    <MenuRow icon={<Flag className="h-4 w-4 text-red-400" />} label="Report Story" labelClass="text-red-400" onClick={handleReport} />
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => setShowMenu(false)}
                  className="mt-3 mx-4 w-[calc(100%-32px)] py-3.5 rounded-2xl text-[14px] font-semibold text-white/50"
                  style={{ background: "rgba(255,255,255,0.05)" }}
                >
                  Cancel
                </button>
              </motion.div>
            </>
          )}
        </AnimatePresence>

        {/* ══════════════════════════════════════════════════════════════
            VIEWER STATS SHEET (owner only)
        ══════════════════════════════════════════════════════════════ */}
        <AnimatePresence>
          {showViewers && (
            <>
              <motion.div
                className="fixed inset-0 z-[100]"
                style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)" }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setShowViewers(false)}
              />
              <motion.div
                className="fixed bottom-0 left-0 right-0 z-[101] rounded-t-[28px] overflow-hidden"
                style={{
                  background: "rgba(12,8,20,0.97)",
                  backdropFilter: "blur(24px)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  maxHeight: "70vh",
                  paddingBottom: `max(env(safe-area-inset-bottom, 0px), 24px)`,
                }}
                initial={{ y: "100%" }}
                animate={{ y: 0 }}
                exit={{ y: "100%" }}
                transition={{ type: "spring", stiffness: 380, damping: 34 }}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex justify-center pt-3 pb-1">
                  <div className="h-[3px] w-10 rounded-full bg-white/20" />
                </div>

                <div className="flex items-center gap-3 px-5 py-3 border-b border-white/[0.06]">
                  <Eye className="h-4 w-4 text-purple-400" />
                  <span className="text-[15px] font-bold text-white">Story Insights</span>
                  <span className="ml-auto text-[13px] text-white/40">{viewCount ?? 0} views</span>
                </div>

                <div className="overflow-y-auto" style={{ maxHeight: "50vh" }}>
                  {viewers.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-white/30">
                      <Eye className="h-8 w-8 mb-3 opacity-30" />
                      <p className="text-[13px]">No viewers yet</p>
                    </div>
                  ) : (
                    viewers.map((v: any, i: number) => (
                      <div key={i} className="flex items-center gap-3 px-5 py-3">
                        <div className="h-9 w-9 rounded-full overflow-hidden flex-shrink-0"
                          style={{ background: "rgba(168,85,247,0.2)" }}>
                          {v.avatar_url
                            ? <img src={v.avatar_url} className="h-full w-full object-cover" alt="" />
                            : <div className="h-full w-full flex items-center justify-center text-sm font-bold text-purple-400">
                                {(v.name ?? v.username ?? "?").charAt(0).toUpperCase()}
                              </div>
                          }
                        </div>
                        <div>
                          <p className="text-[13px] font-semibold text-white">{v.name ?? v.username}</p>
                          {v.username && <p className="text-[11px] text-white/40">@{v.username}</p>}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </motion.div>
    </AnimatePresence>,
    document.body,
  );
}

/* ── Menu row helper ────────────────────────────────────────────────────── */
function MenuRow({
  icon, label, labelClass = "text-white", onClick,
}: { icon: React.ReactNode; label: string; labelClass?: string; onClick: () => void }) {
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.97 }}
      onClick={onClick}
      className="flex items-center gap-4 w-full px-4 py-3.5 rounded-2xl text-left"
      style={{ background: "rgba(255,255,255,0.04)" }}
    >
      {icon}
      <span className={`text-[14px] font-semibold ${labelClass}`}>{label}</span>
    </motion.button>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   PulseViewerHost — renders the viewer via custom event
══════════════════════════════════════════════════════════════════════════ */
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
    new CustomEvent("socia:open-pulse", { detail: { groups, groupIndex, pulseIndex } }),
  );
}
