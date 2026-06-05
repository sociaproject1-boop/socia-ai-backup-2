/**
 * ChatThread.tsx — production-ready chat thread
 *
 * Features:
 *  • Voice recording via MediaRecorder API (tap mic → record, tap again → send)
 *  • Inline audio player for voice messages
 *  • Image lightbox (fullscreen on tap)
 *  • Skeleton loaders while messages load
 *  • React.memo on MessageBubble (no unnecessary re-renders)
 *  • Lazy image loading
 *  • useCallback on all event handlers
 *  • Send error toast
 */
import { useEffect, useRef, useState, useCallback, memo, useMemo } from "react";
import { useLocation, useRoute } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, Plus, Send, Image as ImageIcon, Check, CheckCheck,
  X, Download, Mic, Play, Pause, Square, AlertCircle,
  Copy, Sparkles, Wand2, ChevronDown, CornerUpLeft,
  Info, Trash2, Clock,
} from "lucide-react";
import { useAppStore } from "@/lib/store";
import { useAuth } from "@/lib/authContext";
import {
  useMessages,
  useReactions,
  useTypingStatus,
  fetchUserById,
  sendMessage,
  editMessage,
  deleteMessage,
  markThreadSeen,
  markThreadDelivered,
  toggleReaction,
  uploadChatImage,
  uploadAudioMessage,
  fetchNickname,
  upsertNickname,
  getLastSeenText,
  type SupabaseMessage,
  type MessageReaction,
  type ConversationUser,
} from "@/lib/useSupabaseChat";
import { usePresenceStatus } from "@/lib/usePresence";
import { NameBadges } from "@/components/Badges";

/* ════════════════════════════════════════════════════════════════════════ */
/*  Timestamp helpers                                                        */
/* ════════════════════════════════════════════════════════════════════════ */

/** Exact timestamp: "Today 3:42 PM" / "Yesterday 10:11 AM" / "Jun 5, 2026 9:14 PM" */
function fmtExact(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
  const todayStr = now.toDateString();
  const yest = new Date(now); yest.setDate(now.getDate() - 1);
  if (d.toDateString() === todayStr)     return `Today ${time}`;
  if (d.toDateString() === yest.toDateString()) return `Yesterday ${time}`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) + ` ${time}`;
}

/** Day-only label for the separator: "Today", "Yesterday", "Jun 5, 2026" */
function fmtDay(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const yest = new Date(now); yest.setDate(now.getDate() - 1);
  if (d.toDateString() === now.toDateString())  return "Today";
  if (d.toDateString() === yest.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/** "3:42 PM" — short time only */
function fmtShortTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
}

/* ════════════════════════════════════════════════════════════════════════ */
/*  Day separator                                                            */
/* ════════════════════════════════════════════════════════════════════════ */
function DaySeparator({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 my-3 px-1">
      <div className="flex-1 h-px bg-white/[0.06]" />
      <span className="text-[10px] text-white/30 font-medium px-1">{label}</span>
      <div className="flex-1 h-px bg-white/[0.06]" />
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════ */
/*  Skeleton loader                                                          */
/* ════════════════════════════════════════════════════════════════════════ */
function MessageSkeleton({ mine }: { mine: boolean }) {
  return (
    <div className={"flex " + (mine ? "justify-end" : "justify-start")}>
      <div className={"flex max-w-[78%] items-end gap-2 " + (mine ? "flex-row-reverse" : "")}>
        {!mine && <div className="h-6 w-6 shrink-0 rounded-full bg-white/10 animate-pulse" />}
        <div className={"h-9 animate-pulse rounded-2xl bg-white/[0.08] " + (mine ? "rounded-br-md w-40" : "rounded-bl-md w-52")} />
      </div>
    </div>
  );
}
function SkeletonList() {
  const patterns = [false, true, false, false, true, false, true] as const;
  return (
    <div className="space-y-3 px-4 py-4">
      {patterns.map((mine, i) => <MessageSkeleton key={i} mine={mine} />)}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════ */
/*  Audio player                                                             */
/* ════════════════════════════════════════════════════════════════════════ */
/** Safe mm:ss formatter — never returns NaN or Infinity */
function fmtTime(seconds: number): string {
  if (!isFinite(seconds) || isNaN(seconds) || seconds < 0) return "0:00";
  const s = Math.floor(seconds);
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;
}

const AudioPlayer = memo(function AudioPlayer({ url }: { url: string }) {
  const audioRef     = useRef<HTMLAudioElement>(null);
  const [playing,    setPlaying]    = useState(false);
  const [progress,   setProgress]   = useState(0);        // 0–1
  const [currentSec, setCurrentSec] = useState(0);        // raw seconds
  const [duration,   setDuration]   = useState(0);        // raw seconds
  const [metaReady,  setMetaReady]  = useState(false);    // true once loadedmetadata fires
  const [loadError,  setLoadError]  = useState(false);

  /* Guard: don't render if url is empty */
  if (!url) return null;

  const toggle = () => {
    const a = audioRef.current;
    if (!a || loadError) return;
    if (playing) {
      a.pause();
      setPlaying(false);
    } else {
      a.play()
        .then(() => setPlaying(true))
        .catch(() => setLoadError(true));
    }
  };

  const handleTimeUpdate = (e: React.SyntheticEvent<HTMLAudioElement>) => {
    const a = e.currentTarget;
    const dur = a.duration;
    const cur = a.currentTime;
    /* Guard against Infinity (live streams) and NaN */
    if (isFinite(dur) && dur > 0) {
      setProgress(cur / dur);
      setCurrentSec(cur);
    }
  };

  const captureDuration = (el: HTMLAudioElement) => {
    const dur = el.duration;
    if (isFinite(dur) && !isNaN(dur) && dur > 0) {
      setDuration(dur);
    }
  };

  const handleLoadedMetadata = (e: React.SyntheticEvent<HTMLAudioElement>) => {
    captureDuration(e.currentTarget);
    setMetaReady(true);
    setLoadError(false);
  };

  /* onDurationChange fires when duration becomes known (e.g. after buffering starts) */
  const handleDurationChange = (e: React.SyntheticEvent<HTMLAudioElement>) => {
    captureDuration(e.currentTarget);
  };

  /* onCanPlay fires even on servers that skip loadedmetadata (e.g., no range-request support).
     Use it as a fallback to capture duration if metadata handler didn't already. */
  const handleCanPlay = (e: React.SyntheticEvent<HTMLAudioElement>) => {
    captureDuration(e.currentTarget);
    if (!metaReady) {
      setMetaReady(true);
      setLoadError(false);
    }
  };

  const handleEnded = () => {
    setPlaying(false);
    setProgress(0);
    setCurrentSec(0);
    if (audioRef.current) audioRef.current.currentTime = 0;
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const a = audioRef.current;
    if (!a || !metaReady || !isFinite(duration) || duration === 0) return;
    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    a.currentTime = ratio * duration;
    setProgress(ratio);
    setCurrentSec(ratio * duration);
  };

  return (
    <div className="flex items-center gap-2.5 rounded-2xl border border-white/[0.06] bg-[#0a0a0a] px-3 py-2.5 min-w-[200px] max-w-[260px]">
      <audio
        ref={audioRef}
        src={url}
        preload="metadata"
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onDurationChange={handleDurationChange}
        onCanPlay={handleCanPlay}
        onEnded={handleEnded}
        onError={() => { setLoadError(true); setMetaReady(true); }}
      />

      {/* Play / Pause button */}
      <button
        onClick={toggle}
        disabled={loadError}
        className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gradient-to-r from-purple-600 via-pink-500 to-blue-500 text-white disabled:opacity-40"
      >
        {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
      </button>

      <div className="flex flex-1 flex-col gap-1.5">
        {/* Scrub bar */}
        <div
          className="relative h-1.5 w-full cursor-pointer overflow-hidden rounded-full bg-white/20"
          onClick={handleSeek}
        >
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 transition-[width] duration-100"
            style={{ width: `${progress * 100}%` }}
          />
        </div>

        {/* Time display */}
        <div className="flex items-center justify-between">
          {loadError ? (
            <span className="text-[10px] text-red-400/80">Playback error</span>
          ) : !metaReady || duration === 0 ? (
            /* Spinner until we have a valid non-zero duration */
            <span className="flex items-center gap-1 text-[10px] text-white/40">
              <span className="h-2.5 w-2.5 animate-spin rounded-full border border-white/20 border-t-white/60 inline-block" />
              Loading…
            </span>
          ) : (
            <span className="text-[10px] text-white/50 tabular-nums">
              {fmtTime(currentSec)} / {fmtTime(duration)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
});

/* ════════════════════════════════════════════════════════════════════════ */
/*  Image lightbox                                                           */
/* ════════════════════════════════════════════════════════════════════════ */
function ImageLightbox({ src, onClose }: { src: string; onClose: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95"
      onClick={onClose}
    >
      <motion.img
        initial={{ scale: 0.92, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.92, opacity: 0 }}
        src={src}
        alt="fullscreen"
        className="max-h-[90dvh] max-w-[95vw] rounded-2xl object-contain shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        draggable={false}
      />
      {/* Top controls */}
      <div className="absolute top-safe-4 right-4 flex gap-2" style={{ top: `calc(env(safe-area-inset-top, 0px) + 12px)` }}>
        <a
          href={src}
          download
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="grid h-10 w-10 place-items-center rounded-full bg-[#141414] text-white hover:bg-[#1e1e1e]"
        >
          <Download className="h-4 w-4" />
        </a>
        <button
          onClick={onClose}
          className="grid h-10 w-10 place-items-center rounded-full bg-[#141414] text-white hover:bg-[#1e1e1e]"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </motion.div>
  );
}

/* ════════════════════════════════════════════════════════════════════════ */
/*  MessageBubble                                                            */
/* ════════════════════════════════════════════════════════════════════════ */
interface BubbleProps {
  msg:           SupabaseMessage;
  mine:          boolean;
  peerAvatar:    string;
  peerName:      string;
  isLast:        boolean;
  onImageTap:    (src: string) => void;
  onLongPress:   (id: string, mine: boolean, text: string | null) => void;
  reactions:     MessageReaction[];
  myId:          string;
  /* Sender flair — true = the message author has a King badge.
     Mapped from peer.is_owner for !mine bubbles, my own profile for mine. */
  senderIsKing:  boolean;
  /* Use-prompt CTA (only meaningful when msg.is_prompt is true) */
  onUsePrompt:   (prompt: string) => void;
  /* Edit mode */
  isEditing:    boolean;
  editText:     string;
  onEditChange: (v: string) => void;
  onEditSave:   () => void;
  onEditCancel: () => void;
  /* Grouping (Messenger-style consecutive messages) */
  grouped:      boolean;   // true = same sender as previous msg within 3 min → less top margin, no avatar
  groupedNext:  boolean;   // true = next msg is same sender → tighter bottom radius
  replyPreview?: { senderName: string; text: string | null; isImage: boolean; isAudio: boolean } | null;
  onReply:       (msg: SupabaseMessage) => void;
  showTimestamp: boolean;  // show time label below bubble
  isLastMine:   boolean;   // used by parent for receipt; passed here for swipe affordance only
}

const REACTION_EMOJIS = ["❤️", "👍", "😂", "😮", "😢"] as const;

const MessageBubble = memo(function MessageBubble({
  msg, mine, peerAvatar, peerName, onImageTap,
  onLongPress, reactions, myId,
  senderIsKing, onUsePrompt,
  isEditing, editText, onEditChange, onEditSave, onEditCancel,
  grouped: isGrouped, groupedNext: isGroupedNext,
  replyPreview, onReply,
  showTimestamp,
}: BubbleProps) {
  const isImage  = !!msg.image_url && !msg.audio_url;
  const isAudio  = !!msg.audio_url;
  const isPrompt = !!msg.is_prompt && !isImage && !isAudio;
  const lpTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [copied, setCopied] = useState(false);

  /* ── Swipe-to-reply (received messages only) ─────────────────────── */
  const swipeStartX = useRef(0);
  const [swipeDx, setSwipeDx] = useState(0);
  const isSwiping  = useRef(false);

  const onTouchStart = (e: React.TouchEvent) => {
    swipeStartX.current = e.touches[0].clientX;
    isSwiping.current   = true;
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (!isSwiping.current) return;
    const raw = e.touches[0].clientX - swipeStartX.current;
    /* Only allow right-swipe on received; left-swipe on mine */
    const dx = mine ? Math.max(0, -raw) : Math.max(0, raw);
    setSwipeDx(Math.min(dx, 72));
  };
  const onTouchEnd = () => {
    if (swipeDx >= 48) onReply(msg);
    setSwipeDx(0);
    isSwiping.current = false;
  };

  const promptText = (msg.prompt || msg.text || "").trim();

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(promptText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — silently no-op */
    }
  };

  /* Group reactions by emoji: { emoji → {count, iMine} } */
  const rxnMap = reactions.reduce<Record<string, { count: number; iMine: boolean }>>(
    (acc, r) => {
      if (!acc[r.emoji]) acc[r.emoji] = { count: 0, iMine: false };
      acc[r.emoji].count++;
      if (r.user_id === myId) acc[r.emoji].iMine = true;
      return acc;
    },
    {}
  );

  const startLp = () => {
    lpTimer.current = setTimeout(() => onLongPress(msg.id, mine, msg.text), 500);
  };
  const cancelLp = () => { if (lpTimer.current) clearTimeout(lpTimer.current); };

  const Avatar = () => (
    <div className="h-6 w-6 shrink-0 overflow-hidden rounded-full border border-white/10">
      {peerAvatar
        ? <img src={peerAvatar} alt="" loading="lazy" className="h-full w-full object-cover" />
        : <div className="h-full w-full bg-gradient-to-br from-purple-600 via-pink-500 to-blue-600 grid place-items-center text-[10px] font-bold text-white">{peerName.charAt(0)}</div>}
    </div>
  );

  /* Reply icon that fades in on swipe */
  const replyIconOpacity = Math.min(1, swipeDx / 36);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      className={"flex flex-col " + (mine ? "items-end" : "items-start") + (isGrouped ? " mt-0.5" : " mt-2")}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      <div
        className={
          "flex items-end gap-2 " +
          (mine ? "flex-row-reverse " : "") +
          (isImage ? "max-w-[88%]" : "max-w-[78%]")
        }
        style={{ transform: swipeDx ? `translateX(${mine ? -swipeDx : swipeDx}px)` : undefined, transition: swipeDx ? "none" : "transform 0.18s ease" }}
      >
        {/* Peer avatar — hide (but reserve space) when grouped */}
        {!mine && !isImage && (isGrouped ? <div className="h-6 w-6 shrink-0" /> : <Avatar />)}
        {!mine &&  isAudio && (isGrouped ? <div className="h-6 w-6 shrink-0" /> : <Avatar />)}

        {/* ── Content ─────────────────────────────────────────────────── */}
        <div
          onMouseDown={startLp} onMouseUp={cancelLp} onMouseLeave={cancelLp}
          onTouchStart={startLp} onTouchEnd={cancelLp}
          className="select-none"
        >
          {/* Reply preview — quoted snippet when this msg replies to another */}
          {replyPreview && !isImage && !isAudio && (
            <div
              className={"mb-1.5 flex items-start gap-1.5 rounded-xl px-3 py-2 border-l-2 "
                + (mine ? "border-purple-400/50 bg-purple-500/10" : "border-white/20 bg-white/5")}
              style={{ maxWidth: 240 }}
            >
              <CornerUpLeft className="h-3 w-3 shrink-0 mt-0.5 text-white/30" />
              <div className="min-w-0">
                <span className="text-[10px] font-semibold text-white/40 block truncate">
                  {replyPreview.senderName}
                </span>
                <span className="text-[11px] text-white/35 truncate block">
                  {replyPreview.isImage ? "📷 Photo" : replyPreview.isAudio ? "🎵 Voice" : (replyPreview.text ?? "").slice(0, 55)}
                </span>
              </div>
            </div>
          )}
          {isAudio ? (
            <AudioPlayer url={msg.audio_url!} />

          ) : isImage ? (
            <div
              className="group relative cursor-pointer overflow-hidden rounded-2xl border border-white/10 shadow-lg"
              style={{ maxWidth: "min(72vw, 320px)" }}
              onClick={() => onImageTap(msg.image_url!)}
            >
              <img
                src={msg.image_url!}
                alt="shared image"
                loading="lazy"
                decoding="async"
                className="block w-full max-h-80 object-cover"
              />
              <div className="absolute inset-0 bg-black/0 transition-colors group-active:bg-black/25" />
              <a
                href={msg.image_url!} download target="_blank" rel="noopener noreferrer"
                className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full bg-[#000000] text-white opacity-0 transition-opacity group-hover:opacity-100 active:opacity-100"
                onClick={(e) => e.stopPropagation()}
              >
                <Download className="h-3.5 w-3.5" />
              </a>
              <div className="absolute bottom-2 right-2 grid h-6 w-6 place-items-center rounded-full bg-[#000000] text-white opacity-0 transition-opacity group-hover:opacity-100 active:opacity-100">
                <svg viewBox="0 0 16 16" fill="none" className="h-3 w-3" stroke="currentColor" strokeWidth="1.5">
                  <path d="M10 2h4v4M6 14H2v-4M14 6l-4 4M2 10l4-4" />
                </svg>
              </div>
            </div>

          ) : isEditing ? (
            /* ── Inline edit input ─────────────────────────────────── */
            <div className="flex flex-col gap-1.5 min-w-[180px] max-w-[260px]">
              <textarea
                autoFocus
                value={editText}
                onChange={(e) => onEditChange(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onEditSave(); } if (e.key === "Escape") onEditCancel(); }}
                rows={2}
                className="w-full resize-none rounded-xl border border-purple-500/50 bg-[#0a0a0a] px-3 py-2 text-sm text-white outline-none focus:border-purple-400"
              />
              <div className="flex justify-end gap-2">
                <button onClick={onEditCancel} className="rounded-lg px-2.5 py-1 text-[11px] text-white/50 hover:bg-white/5">Cancel</button>
                <button onClick={onEditSave} className="rounded-lg bg-purple-600/80 px-2.5 py-1 text-[11px] text-white hover:bg-purple-500">Save</button>
              </div>
            </div>

          ) : isPrompt ? (
            /* ── Prompt bubble (Send Prompt to Chat) ───────────────── */
            <div
              className={
                "relative flex flex-col gap-2 rounded-2xl border px-3.5 py-3 " +
                "bg-[#0a0a0a] " +
                (senderIsKing
                  ? "border-yellow-300/60 ring-2 ring-yellow-300/30 shadow-[0_4px_28px_-4px_rgba(251,191,36,0.5)]"
                  : "border-white/15") +
                " min-w-[200px] max-w-[300px]"
              }
            >
              <div className="flex items-center gap-1.5">
                <Sparkles className="h-3 w-3 text-pink-300" />
                <span className="text-[9px] font-bold uppercase tracking-[0.14em] text-pink-200/90">
                  Prompt
                </span>
                {senderIsKing && (
                  <span className="ml-auto rounded-full bg-yellow-400/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-yellow-300">
                    👑 King
                  </span>
                )}
              </div>
              <p className="text-sm leading-relaxed text-white/95 whitespace-pre-wrap break-words">
                {promptText || msg.text}
              </p>
              {msg.edited && (
                <span className="text-[10px] text-white/40">(edited)</span>
              )}
              <div className="mt-1 flex gap-2">
                <button
                  onClick={handleCopy}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-2.5 py-1.5 text-[11px] font-semibold text-white/85 hover:bg-white/10 active:scale-95"
                >
                  {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                  {copied ? "Copied" : "Copy"}
                </button>
                <button
                  onClick={() => onUsePrompt(promptText || msg.text || "")}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-purple-600 via-pink-500 to-blue-500 px-2.5 py-1.5 text-[11px] font-semibold text-white shadow-[0_4px_14px_-4px_rgba(236,72,153,0.55)] active:scale-95"
                >
                  <Wand2 className="h-3 w-3" />
                  Use prompt
                </button>
              </div>
            </div>

          ) : (
            /* ── Text bubble ───────────────────────────────────────── */
            <div className={
              mine
                ? `${isGrouped ? "rounded-2xl rounded-tr-md" : ""} ${isGroupedNext ? "rounded-br-2xl" : "rounded-br-md"} rounded-2xl bg-gradient-to-r from-purple-600 via-pink-500 to-blue-500 px-3.5 py-2 text-sm text-white shadow-[0_4px_18px_-4px_rgba(236,72,153,0.45)]`
                : `${isGrouped ? "rounded-2xl rounded-tl-md" : ""} ${isGroupedNext ? "rounded-bl-2xl" : "rounded-bl-md"} rounded-2xl border border-white/[0.06] bg-[#0d0d0d] px-3.5 py-2 text-sm text-white`
            }>
              {msg.text}
              {msg.edited && (
                <span className="ml-1.5 text-[10px] opacity-50">(edited)</span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Reactions row ─────────────────────────────────────────────── */}
      {Object.keys(rxnMap).length > 0 && (
        <div className={"flex flex-wrap gap-1 mt-1 " + (mine ? "justify-end pr-1" : "justify-start pl-8")}>
          {Object.entries(rxnMap).map(([emoji, { count, iMine }]) => (
            <span
              key={emoji}
              className={
                "flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-xs cursor-default " +
                (iMine ? "bg-purple-600/40 border border-purple-500/50" : "bg-white/10 border border-white/10")
              }
            >
              {emoji}{count > 1 && <span className="text-[10px] text-white/60">{count}</span>}
            </span>
          ))}
        </div>
      )}

      {/* ── Timestamp + swipe-reply icon ──────────────────────────────── */}
      {(showTimestamp || replyIconOpacity > 0.05) && (
        <div className={"flex items-center gap-1.5 mt-0.5 " + (mine ? "justify-end pr-1" : "justify-start pl-8")}>
          {!mine && replyIconOpacity > 0.05 && (
            <CornerUpLeft
              className="h-3 w-3 text-purple-400 shrink-0"
              style={{ opacity: replyIconOpacity }}
            />
          )}
          {showTimestamp && (
            <span className="text-[10px] text-white/25">{fmtShortTime(msg.created_at)}</span>
          )}
          {mine && replyIconOpacity > 0.05 && (
            <CornerUpLeft
              className="h-3 w-3 text-purple-400 shrink-0 scale-x-[-1]"
              style={{ opacity: replyIconOpacity }}
            />
          )}
        </div>
      )}
    </motion.div>
  );
});

/* ════════════════════════════════════════════════════════════════════════ */
/*  Voice recorder hook                                                      */
/* ════════════════════════════════════════════════════════════════════════ */
type RecorderState = "idle" | "recording" | "uploading";

function useVoiceRecorder() {
  const [state,    setState]    = useState<RecorderState>("idle");
  const [duration, setDuration] = useState(0);
  const mediaRef  = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef  = useRef<ReturnType<typeof setInterval> | null>(null);

  const start = useCallback(async (): Promise<boolean> => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream, { mimeType: "audio/webm" });
      chunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.start(100);
      mediaRef.current = mr;
      setState("recording");
      setDuration(0);
      timerRef.current = setInterval(() => setDuration((d) => d + 1), 1000);
      return true;
    } catch {
      return false;
    }
  }, []);

  const stop = useCallback((): Promise<Blob | null> => {
    return new Promise((resolve) => {
      if (timerRef.current) clearInterval(timerRef.current);
      const mr = mediaRef.current;
      if (!mr || mr.state === "inactive") { setState("idle"); resolve(null); return; }
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        mr.stream.getTracks().forEach((t) => t.stop());
        setState("idle");
        resolve(blob.size > 0 ? blob : null);
      };
      mr.stop();
    });
  }, []);

  const cancel = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    const mr = mediaRef.current;
    if (mr && mr.state !== "inactive") {
      mr.onstop = () => { mr.stream.getTracks().forEach((t) => t.stop()); };
      mr.stop();
    }
    chunksRef.current = [];
    setState("idle");
    setDuration(0);
  }, []);

  const markUploading = useCallback(() => setState("uploading"), []);

  return { state, duration, start, stop, cancel, markUploading };
}

/* ════════════════════════════════════════════════════════════════════════ */
/*  Helpers                                                                  */
/* ════════════════════════════════════════════════════════════════════════ */
function TypingDots() {
  return (
    <div className="flex items-center gap-1">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="h-1.5 w-1.5 rounded-full bg-white/60"
          animate={{ opacity: [0.3, 1, 0.3], y: [0, -3, 0] }}
          transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.15, ease: "easeInOut" }}
        />
      ))}
    </div>
  );
}

function AttachBtn({ icon: Icon, label, onClick }: { icon: typeof Send; label: string; onClick: () => void }) {
  return (
    <motion.button whileTap={{ scale: 0.95 }} onClick={onClick} className="flex flex-col items-center gap-1 rounded-xl px-3 py-2 hover:bg-white/5">
      <span className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-purple-600/80 via-pink-500/70 to-blue-500/80 text-white">
        <Icon className="h-4 w-4" />
      </span>
      <span className="text-[10px] text-white/70">{label}</span>
    </motion.button>
  );
}


/* ════════════════════════════════════════════════════════════════════════ */
/*  ChatThread (main component)                                              */
/* ════════════════════════════════════════════════════════════════════════ */
export default function ChatThread() {
  const [, params]   = useRoute("/messages/:id");
  const otherId      = params?.id || "";
  const [, navigate] = useLocation();

  const { supabaseUser } = useAuth();
  const myId = supabaseUser?.id ?? "";

  const [otherUser,   setOtherUser]   = useState<ConversationUser | null>(null);
  const [text,        setText]        = useState("");
  const [showAttach,  setShowAttach]  = useState(false);
  const [uploading,   setUploading]   = useState(false);
  /* Supabase-backed typing indicator — replaces Socket.io */
  const { peerTyping, sendTyping } = useTypingStatus(myId ?? null, otherId ?? null);
  const [sendError,   setSendError]   = useState<string | null>(null);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

  /* Edit */
  const [editingId,   setEditingId]   = useState<string | null>(null);
  const [editText,    setEditText]    = useState("");

  /* Action sheet (long-press menu) */
  type ActionSheet = { id: string; mine: boolean; text: string | null; msg: SupabaseMessage };
  const [actionSheet, setActionSheet] = useState<ActionSheet | null>(null);

  /* Message Info bottom sheet */
  const [msgInfoMsg, setMsgInfoMsg] = useState<SupabaseMessage | null>(null);

  /* Nickname */
  const [nickname,       setNickname]       = useState<string | null>(null);
  const [nicknamingOpen, setNicknamingOpen] = useState(false);
  const [nicknameInput,  setNicknameInput]  = useState("");

  const scrollRef      = useRef<HTMLDivElement>(null);
  const fileRef        = useRef<HTMLInputElement>(null);
  const textareaRef    = useRef<HTMLTextAreaElement>(null);
  const typingTimer    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const topSentinelRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef   = useRef(true);
  const prevMsgCountRef   = useRef(0);
  const [newMsgBanner,  setNewMsgBanner]  = useState(false);
  const [replyTo,       setReplyTo]       = useState<SupabaseMessage | null>(null);

  const recorder = useVoiceRecorder();

  const peerStatus = usePresenceStatus(otherId || null);
  const { messages, loading, error: msgError, hasMore, loadOlder, loadingOlder } = useMessages(myId || null, otherId || null);

  const messageIds = messages.map((m) => m.id);
  const { reactions: allReactions, optimisticToggle } = useReactions(myId || null, otherId || null, messageIds);

  /* Pre-compute reply previews keyed by message id for O(1) bubble lookup */
  const replyMap = useMemo(() => {
    const map = new Map<string, { senderName: string; text: string | null; isImage: boolean; isAudio: boolean }>();
    messages.forEach((m) => {
      map.set(m.id, {
        senderName: m.sender_id === myId ? "You" : (otherUser?.name ?? "User"),
        text:       m.text,
        isImage:    !!m.image_url && !m.audio_url,
        isAudio:    !!m.audio_url,
      });
    });
    return map;
  }, [messages, myId, otherUser]);

  useEffect(() => {
    if (!otherId) return;
    fetchUserById(otherId).then(setOtherUser);
  }, [otherId]);

  /* Load nickname on open */
  useEffect(() => {
    if (!myId || !otherId) return;
    fetchNickname(myId, otherId).then(setNickname);
  }, [myId, otherId]);

  /* Count how many unseen messages from the OTHER user are in our thread.
     markThreadSeen only fires when that number changes (or on open),
     never just because we sent a message. */
  const unseenInboundCount = messages.filter(
    (m) => m.sender_id === otherId && !m.seen,
  ).length;

  const undeliveredInboundCount = messages.filter(
    (m) => m.sender_id === otherId && !m.delivered_at,
  ).length;

  useEffect(() => {
    if (myId && otherId) markThreadSeen(myId, otherId);
  }, [myId, otherId, unseenInboundCount]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (myId && otherId) markThreadDelivered(myId, otherId);
  }, [myId, otherId, undeliveredInboundCount]); // eslint-disable-line react-hooks/exhaustive-deps

  const bottomRef = useRef<HTMLDivElement>(null);

  /* ── Smart auto-scroll ────────────────────────────────────────────── */
  useEffect(() => {
    const count = messages.length;
    if (count === 0) { prevMsgCountRef.current = 0; return; }

    const prevCount = prevMsgCountRef.current;
    prevMsgCountRef.current = count;

    const raf = requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (!el) return;

      if (prevCount === 0) {
        /* Initial load → snap instantly to the bottom */
        el.scrollTop = el.scrollHeight;
        setNewMsgBanner(false);
        return;
      }

      /* New message arrived — decide scroll vs banner */
      const lastMsg = messages[count - 1];
      const isMine  = lastMsg?.sender_id === myId;

      if (isMine || isNearBottomRef.current) {
        el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
        setNewMsgBanner(false);
      } else {
        /* Peer sent while user is reading old messages → show banner */
        setNewMsgBanner(true);
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [messages.length, myId]);

  /* Track whether the user is within 120 px of the bottom */
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    isNearBottomRef.current = distFromBottom < 120;
    if (isNearBottomRef.current) setNewMsgBanner(false);
  }, []);

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    setNewMsgBanner(false);
  }, []);

  /* ── Upward sentinel — load older messages when scrolled to top ─── */
  useEffect(() => {
    const sentinel = topSentinelRef.current;
    if (!sentinel || !hasMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0].isIntersecting) return;
        const oldest = messages[0]?.created_at;
        if (oldest) {
          /* Preserve scroll position when messages are prepended */
          const el = scrollRef.current;
          const prevScrollHeight = el?.scrollHeight ?? 0;
          loadOlder(oldest).then(() => {
            requestAnimationFrame(() => {
              if (el) {
                el.scrollTop += el.scrollHeight - prevScrollHeight;
              }
            });
          });
        }
      },
      { threshold: 0.1, root: scrollRef.current },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, messages, loadOlder]);

  /* ── Auto-resize textarea (1 line → up to 8 lines) ───────────────── */
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    const LINE_H   = 20;   /* px — matches leading-5 */
    const PADDING  = 20;   /* vertical padding inside the bubble */
    const maxH     = LINE_H * 8 + PADDING;
    const newH     = Math.min(ta.scrollHeight, maxH);
    ta.style.height = newH + "px";
    ta.style.overflowY = ta.scrollHeight > maxH ? "scroll" : "hidden";
  }, [text]);

  /* ── Typing indicator is handled by useTypingStatus (Supabase) ── */

  /* Auto-dismiss send error */
  useEffect(() => {
    if (!sendError) return;
    const t = setTimeout(() => setSendError(null), 4000);
    return () => clearTimeout(t);
  }, [sendError]);

  const handleTextChange = useCallback((val: string) => {
    setText(val);
    /* Drive Supabase typing status — hook handles debounce & auto-stop */
    sendTyping(val.trim().length > 0);
  }, [sendTyping]);

  const send = useCallback(async () => {
    const t = text.trim();
    if (!t || !myId || !otherId) return;
    const rid = replyTo?.id;
    setText("");
    setReplyTo(null);
    sendTyping(false); /* Clear typing indicator on send */
    if (typingTimer.current) clearTimeout(typingTimer.current);
    const err = await sendMessage(myId, otherId, { text: t, ...(rid ? { reply_to_id: rid } : {}) });
    if (err) setSendError("Failed to send. Check connection.");
  }, [text, myId, otherId, sendTyping, replyTo]);

  const handleImagePick = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !myId || !otherId) return;
    setShowAttach(false);
    setUploading(true);
    try {
      const url = await uploadChatImage(file, myId);
      if (url) {
        const err = await sendMessage(myId, otherId, { image_url: url });
        if (err) setSendError("Image sent but message failed. Retry.");
      } else {
        setSendError("Image upload failed. Try again.");
      }
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }, [myId, otherId]);

  /* ── Hold-to-record handlers ── */
  const handleMicDown = useCallback(async (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    if (recorder.state !== "idle") return;
    setShowAttach(false);
    const ok = await recorder.start();
    if (!ok) setSendError("Microphone access denied.");
  }, [recorder]);

  const handleMicUp = useCallback(async (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    if (recorder.state !== "recording") return;
    recorder.markUploading();
    const blob = await recorder.stop();
    if (!blob || !myId || !otherId) return;
    setUploading(true);
    try {
      const url = await uploadAudioMessage(blob, myId);
      if (url) {
        const err = await sendMessage(myId, otherId, { audio_url: url });
        if (err) setSendError("Voice message failed to send.");
      } else {
        setSendError("Audio upload failed. Try again.");
      }
    } finally {
      setUploading(false);
    }
  }, [recorder, myId, otherId]);

  const handleMicCancel = useCallback(() => {
    /* Finger slid off or pointer left — cancel recording */
    if (recorder.state === "recording") recorder.cancel?.();
  }, [recorder]);

  const handleImageTap = useCallback((src: string) => setLightboxSrc(src), []);

  /* Long-press → open action sheet */
  const handleLongPress = useCallback((id: string, mine: boolean, text: string | null) => {
    const msg = messages.find((m) => m.id === id);
    if (msg) setActionSheet({ id, mine, text, msg });
  }, [messages]);

  /* Edit */
  const handleStartEdit = useCallback(() => {
    if (!actionSheet) return;
    setEditingId(actionSheet.id);
    setEditText(actionSheet.text || "");
    setActionSheet(null);
  }, [actionSheet]);

  const handleEditSave = useCallback(async () => {
    if (!editingId || !myId) return;
    const t = editText.trim();
    if (!t) return;
    const prevId = editingId;
    setEditingId(null);
    const err = await editMessage(prevId, myId, t);
    if (err) setSendError("Edit failed. Try again.");
  }, [editingId, editText, myId]);

  const handleEditCancel = useCallback(() => { setEditingId(null); setEditText(""); }, []);

  /* Reply — find the target message and open the reply banner */
  const handleReply = useCallback(() => {
    if (!actionSheet) return;
    const msg = messages.find((m) => m.id === actionSheet.id);
    if (msg) setReplyTo(msg);
    setActionSheet(null);
    setTimeout(() => textareaRef.current?.focus(), 80);
  }, [actionSheet, messages]);

  /* Reaction from action sheet */
  const handleReact = useCallback(async (msgId: string, emoji: string) => {
    if (!myId) return;
    setActionSheet(null);
    optimisticToggle(msgId, myId, emoji);
    await toggleReaction(msgId, myId, emoji);
  }, [myId, optimisticToggle]);

  /* Copy text from action sheet */
  const handleCopyText = useCallback(async () => {
    if (!actionSheet?.text) return;
    try { await navigator.clipboard.writeText(actionSheet.text); } catch {}
    setActionSheet(null);
  }, [actionSheet]);

  /* Delete own message from action sheet */
  const handleDeleteMsg = useCallback(async () => {
    if (!actionSheet?.mine) return;
    const id = actionSheet.id;
    setActionSheet(null);
    const err = await deleteMessage(id);
    if (err) setSendError("Failed to delete message.");
  }, [actionSheet]);

  /* Message Info from action sheet */
  const handleMsgInfo = useCallback(() => {
    if (!actionSheet) return;
    setMsgInfoMsg(actionSheet.msg);
    setActionSheet(null);
  }, [actionSheet]);

  /* Nickname */
  const handleOpenNickname = useCallback(() => {
    setNicknameInput(nickname || "");
    setNicknamingOpen(true);
  }, [nickname]);

  const handleSaveNickname = useCallback(async () => {
    if (!myId || !otherId) return;
    const n = nicknameInput.trim();
    setNicknamingOpen(false);
    setNickname(n || null);
    await upsertNickname(myId, otherId, n);
  }, [myId, otherId, nicknameInput]);

  const peerName   = nickname || otherUser?.name || (loading ? "" : "User");
  const peerAvatar = otherUser?.avatar_url || "";
  // Realtime presence from Supabase channel; fallback to last_seen for offline display
  const peerOnline = peerStatus === "online";
  const peerAway   = peerStatus === "away";

  /* Self profile — used to flag MY prompt bubbles with the King treatment
     when the current user is the owner. Lazy single fetch + cache via the
     same fetchUserById helper used for peers. */
  const [me, setMe] = useState<ConversationUser | null>(null);
  useEffect(() => {
    if (!myId) return;
    fetchUserById(myId).then(setMe);
  }, [myId]);
  const myIsKing   = Boolean(me?.is_owner);
  const peerIsKing = Boolean(otherUser?.is_owner);

  /* "Use prompt" CTA — drops the prompt into the global generator state
     and routes the user to the prompt-image generator. */
  const setActivePrompt = useAppStore((s) => s.setActivePrompt);
  const handleUsePrompt = useCallback((p: string) => {
    if (!p) return;
    setActivePrompt(p);
    navigate("/create/prompt-image");
  }, [setActivePrompt, navigate]);
  const isRecording = recorder.state === "recording";
  const showMic     = !text.trim() && !uploading;

  /* Last message the CURRENT USER sent — used for the seen avatar */
  const lastMyMsg = [...messages].reverse().find((m) => m.sender_id === myId) ?? null;

  if (!otherId || !myId) {
    return (
      <div className="grid h-full place-items-center text-white/60">
        <button onClick={() => navigate("/messages")} className="text-sm underline">Back to messages</button>
      </div>
    );
  }

  return (
    <>
      <div className="flex h-full flex-col">
        {/* ── Header ────────────────────────────────────────────────────── */}
        <div
          className="sticky top-0 z-20 flex items-center gap-3 border-b border-white/[0.04] bg-[#000000] px-4"
          style={{ paddingTop: `calc(env(safe-area-inset-top, 0px) + 12px)`, paddingBottom: 12 }}
        >
          <button onClick={() => navigate("/messages")} className="card-premium grid h-9 w-9 place-items-center rounded-full text-white">
            <ArrowLeft className="h-4 w-4" />
          </button>

          {/* Avatar — tap to view profile.
              Outer button is `relative` but NOT `overflow-hidden`, so the
              presence dot (sibling) is never clipped by the avatar's
              rounded border. The image is clipped by its own nested div. */}
          <button
            onClick={() => navigate(`/profile/${otherId}`)}
            className="relative h-9 w-9 shrink-0"
            aria-label={`Open ${peerName}'s profile`}
          >
            <div className="h-9 w-9 overflow-hidden rounded-full border border-white/10">
              {peerAvatar ? (
                <img src={peerAvatar} alt="" loading="lazy" className="h-full w-full object-cover" />
              ) : (
                <div className="h-full w-full bg-gradient-to-br from-purple-600 via-pink-500 to-blue-600 grid place-items-center text-xs font-bold text-white">
                  {peerName.charAt(0)}
                </div>
              )}
            </div>

            {/* Presence dot — sibling of avatar, Messenger-style.
                Only renders for online/away; offline → no dot. */}
            <AnimatePresence>
              {(peerOnline || peerAway) && (
                <motion.span
                  key={peerStatus}
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0, opacity: 0 }}
                  transition={{ type: "spring", stiffness: 500, damping: 28 }}
                  className="pointer-events-none absolute -bottom-0.5 -right-0.5 z-10 h-2.5 w-2.5 rounded-full"
                  style={{
                    background: peerOnline ? "#22c55e" : "#f59e0b",
                    boxShadow: peerOnline
                      ? "0 0 0 2px #000, 0 0 8px rgba(34,197,94,0.65)"
                      : "0 0 0 2px #000, 0 0 8px rgba(245,158,11,0.5)",
                  }}
                  aria-label={peerOnline ? "Online" : "Away"}
                />
              )}
            </AnimatePresence>
          </button>

          <div className="min-w-0 flex-1">
            <button
              onClick={() => navigate(`/profile/${otherId}`)}
              onContextMenu={(e) => { e.preventDefault(); handleOpenNickname(); }}
              className="flex w-full items-center gap-1.5 text-left"
            >
              <span className="truncate text-sm font-semibold text-white">
                {peerName || <span className="h-3.5 w-24 rounded animate-pulse bg-white/10 inline-block" />}
              </span>
              <NameBadges
                isOwner={Boolean(otherUser?.is_owner)}
                isVerified={Boolean(otherUser?.is_verified)}
                size="sm"
              />
              {nickname && <span className="text-[10px] font-normal text-purple-300/60">(nickname)</span>}
            </button>
            <AnimatePresence mode="wait">
              {peerTyping ? (
                <motion.div key="typing" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} className="flex items-center gap-1">
                  <TypingDots />
                  <span className="text-[11px] text-purple-300/80">typing…</span>
                </motion.div>
              ) : (
                <motion.div key="status" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} className={"text-[11px] " + (peerOnline ? "text-emerald-400/80" : peerAway ? "text-amber-400/70" : "text-white/40")}>
                  {peerOnline ? "Online" : peerAway ? "Away" : (otherUser ? getLastSeenText(otherUser.last_seen) : "")}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

        </div>

        {/* ── Error banners ─────────────────────────────────────────────── */}
        <AnimatePresence>
          {sendError && (
            <motion.div
              initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
              className="mx-4 mt-2 flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2"
            >
              <AlertCircle className="h-3.5 w-3.5 shrink-0 text-red-400" />
              <span className="text-xs text-red-300">{sendError}</span>
            </motion.div>
          )}
        </AnimatePresence>
        {msgError && !loading && (
          <div className="mx-4 mt-2 flex items-center gap-2 rounded-xl border border-orange-500/20 bg-orange-500/10 px-3 py-2">
            <AlertCircle className="h-3.5 w-3.5 shrink-0 text-orange-400" />
            <span className="text-xs text-orange-300">
              Something went wrong. Please refresh and try again.
            </span>
          </div>
        )}

        {/* ── Messages ──────────────────────────────────────────────────── */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto hide-scrollbar" onScroll={handleScroll}>
          {loading && <SkeletonList />}

          {!loading && messages.length === 0 && !msgError && (
            <div className="flex flex-col items-center justify-center gap-3 py-20 text-center px-4">
              <div className="h-14 w-14 overflow-hidden rounded-full border border-white/10">
                {peerAvatar ? (
                  <img src={peerAvatar} alt="" loading="lazy" className="h-full w-full object-cover" />
                ) : (
                  <div className="h-full w-full bg-gradient-to-br from-purple-600 via-pink-500 to-blue-600 grid place-items-center text-lg font-bold text-white">
                    {peerName.charAt(0)}
                  </div>
                )}
              </div>
              <div>
                <p className="text-sm font-semibold text-white">{peerName}</p>
                {otherUser?.username && <p className="text-xs text-white/45">@{otherUser.username}</p>}
              </div>
              <p className="text-xs text-white/40">Say hello! This is the start of your conversation.</p>
            </div>
          )}

          {/* ── Top sentinel for upward pagination ──────────────────────── */}
          {!loading && (
            <>
              <div ref={topSentinelRef} className="h-px" />
              {loadingOlder && (
                <div className="flex justify-center py-3">
                  <div className="h-5 w-5 rounded-full border-2 border-white/20 border-t-purple-400 animate-spin" />
                </div>
              )}
              {!hasMore && messages.length > 0 && !loadingOlder && (
                <p className="py-3 text-center text-[10px] text-white/25">Beginning of conversation</p>
              )}
            </>
          )}

          {!loading && (
            <div className="px-4 py-4">
              <AnimatePresence initial={false}>
                {(() => {
                  const lastMineIdx = messages.reduce((acc, m, i) => m.sender_id === myId ? i : acc, -1);
                  return messages.map((msg, idx) => {
                    const prev = idx > 0 ? messages[idx - 1] : null;
                    const next = idx < messages.length - 1 ? messages[idx + 1] : null;
                    const GROUP_MS = 3 * 60_000;
                    const grouped = !!(prev && prev.sender_id === msg.sender_id &&
                      new Date(msg.created_at).getTime() - new Date(prev.created_at).getTime() < GROUP_MS);
                    const groupedNext = !!(next && next.sender_id === msg.sender_id &&
                      new Date(next.created_at).getTime() - new Date(msg.created_at).getTime() < GROUP_MS);
                    const mine = msg.sender_id === myId;
                    /* Day separator: show when this is the first message or day changes */
                    const showDaySep = !prev ||
                      new Date(prev.created_at).toDateString() !== new Date(msg.created_at).toDateString();
                    /* Timestamp label below bubble: show at end of each consecutive group */
                    const showTimestamp = !groupedNext;
                    const isLastMine = mine && idx === lastMineIdx;
                    return (
                      <div key={msg.id}>
                        {showDaySep && <DaySeparator label={fmtDay(msg.created_at)} />}
                        <MessageBubble
                          msg={msg}
                          mine={mine}
                          peerAvatar={peerAvatar}
                          peerName={peerName}
                          isLast={idx === messages.length - 1}
                          onImageTap={handleImageTap}
                          onLongPress={handleLongPress}
                          reactions={allReactions.filter((r) => r.message_id === msg.id)}
                          myId={myId}
                          senderIsKing={mine ? myIsKing : peerIsKing}
                          onUsePrompt={handleUsePrompt}
                          isEditing={editingId === msg.id}
                          editText={editText}
                          onEditChange={setEditText}
                          onEditSave={handleEditSave}
                          onEditCancel={handleEditCancel}
                          grouped={grouped}
                          groupedNext={groupedNext}
                          replyPreview={msg.reply_to_id ? (replyMap.get(msg.reply_to_id) ?? null) : null}
                          onReply={() => { setReplyTo(msg); setTimeout(() => textareaRef.current?.focus(), 80); }}
                          showTimestamp={showTimestamp}
                          isLastMine={isLastMine}
                        />
                      </div>
                    );
                  });
                })()}
              </AnimatePresence>

              {/* Typing indicator bubble */}
              <AnimatePresence>
                {peerTyping && (
                  <motion.div
                    initial={{ opacity: 0, y: 8, scale: 0.9 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    className="flex justify-start"
                  >
                    <div className="flex items-end gap-2">
                      <div className="h-6 w-6 shrink-0 overflow-hidden rounded-full border border-white/10">
                        {peerAvatar
                          ? <img src={peerAvatar} alt="" loading="lazy" className="h-full w-full object-cover" />
                          : <div className="h-full w-full bg-gradient-to-br from-purple-600 via-pink-500 to-blue-600 grid place-items-center text-[10px] font-bold text-white">{peerName.charAt(0)}</div>}
                      </div>
                      <div className="rounded-2xl rounded-bl-md border border-white/[0.05] bg-[#0d0d0d] px-4 py-3">
                        <TypingDots />
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          {/* ── Message receipt (Sent / Delivered / Seen) ───────────────── */}
          {!loading && lastMyMsg && (
            <div className="pb-2 pr-4 flex items-center justify-end gap-1.5">
              {lastMyMsg.seen_at ? (
                /* ✓✓ blue + avatar — Seen */
                <div title={`Seen ${fmtExact(lastMyMsg.seen_at)}`} className="flex items-center gap-1.5">
                  <CheckCheck className="h-3.5 w-3.5 text-blue-400" />
                  {peerAvatar ? (
                    <img src={peerAvatar} alt="Seen" loading="lazy" className="h-4 w-4 rounded-full object-cover ring-1 ring-blue-400/60" />
                  ) : (
                    <div className="h-4 w-4 rounded-full bg-gradient-to-br from-purple-600 via-pink-500 to-blue-600 grid place-items-center text-[7px] font-bold text-white ring-1 ring-blue-400/60">
                      {peerName.charAt(0)}
                    </div>
                  )}
                </div>
              ) : lastMyMsg.delivered_at ? (
                /* ✓✓ grey — Delivered */
                <span title={`Delivered ${fmtExact(lastMyMsg.delivered_at)}`} className="flex items-center gap-0.5 text-[10px] text-white/40">
                  <CheckCheck className="h-3.5 w-3.5" />
                  Delivered
                </span>
              ) : (
                /* ✓ grey — Sent */
                <span className="flex items-center gap-0.5 text-[10px] text-white/35">
                  <Check className="h-3 w-3" />
                  Sent
                </span>
              )}
            </div>
          )}

          {/* Sentinel for auto-scroll */}
          <div ref={bottomRef} className="h-px" />
        </div>

        {/* ── New Messages banner ───────────────────────────────────────── */}
        <AnimatePresence>
          {newMsgBanner && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="flex justify-center py-2"
            >
              <button
                onClick={scrollToBottom}
                className="flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold text-white shadow-xl"
                style={{ background: "linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))" }}
              >
                <ChevronDown className="h-3.5 w-3.5" />
                New message
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Recording bar ─────────────────────────────────────────────── */}
        <AnimatePresence>
          {isRecording && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="flex items-center justify-between bg-red-500/15 border-t border-red-500/20 px-4 py-2"
            >
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-red-500 animate-pulse" />
                <span className="text-sm text-red-300 font-medium">Recording {fmtTime(recorder.duration)}</span>
              </div>
              <button onClick={recorder.cancel} className="flex items-center gap-1 text-xs text-white/50 hover:text-white/80">
                <X className="h-3.5 w-3.5" /> Cancel
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Reply banner ──────────────────────────────────────────────── */}
        <AnimatePresence>
          {replyTo && (
            <motion.div
              initial={{ opacity: 0, y: 6, height: 0 }}
              animate={{ opacity: 1, y: 0, height: "auto" }}
              exit={{ opacity: 0, y: 6, height: 0 }}
              className="flex items-center gap-2.5 border-t border-purple-500/20 bg-purple-500/8 px-4 py-2 overflow-hidden"
            >
              <CornerUpLeft className="h-3.5 w-3.5 shrink-0 text-purple-400" />
              <div className="flex-1 min-w-0">
                <span className="text-[10.5px] font-semibold text-purple-300 block">
                  {replyTo.sender_id === myId ? "Replying to yourself" : `Replying to ${peerName}`}
                </span>
                <span className="text-[11px] text-white/40 truncate block">
                  {replyTo.image_url ? "📷 Photo" : replyTo.audio_url ? "🎵 Voice message" : (replyTo.text ?? "").slice(0, 60)}
                </span>
              </div>
              <button onClick={() => setReplyTo(null)} className="p-1 shrink-0">
                <X className="h-3.5 w-3.5 text-white/40" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Composer ──────────────────────────────────────────────────── */}
        <div
          className="relative border-t border-white/[0.04] bg-[#000000] px-3 pt-2"
          style={{ paddingBottom: `calc(env(safe-area-inset-bottom, 0px) + 12px)` }}
        >
          <AnimatePresence>
            {showAttach && (
              <motion.div
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}
                className="absolute bottom-full left-3 mb-2 flex gap-2 rounded-2xl border border-white/[0.05] bg-[#0a0a0a] p-2 shadow-lg"
              >
                <AttachBtn icon={ImageIcon} label="Photo" onClick={() => { setShowAttach(false); fileRef.current?.click(); }} />
                <AttachBtn icon={X} label="Close" onClick={() => setShowAttach(false)} />
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex items-end gap-2">
            {/* + attach button (hidden while recording) */}
            {!isRecording && (
              <motion.button whileTap={{ scale: 0.9 }} onClick={() => setShowAttach((v) => !v)} className="card-premium mb-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-full text-white">
                <Plus className={"h-5 w-5 transition-transform " + (showAttach ? "rotate-45" : "")} />
              </motion.button>
            )}

            {/* Input area — auto-expanding */}
            <div className="flex flex-1 items-end rounded-2xl border border-white/[0.06] bg-[#0a0a0a] px-4 py-0">
              {uploading ? (
                <div className="flex h-10 flex-1 items-center gap-2 text-xs text-white/60">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-purple-500" />
                  Uploading…
                </div>
              ) : isRecording ? (
                <div className="flex h-10 flex-1 items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                  <span className="text-sm text-white/70">Tap stop to send</span>
                </div>
              ) : (
                <textarea
                  ref={textareaRef}
                  value={text}
                  rows={1}
                  onChange={(e) => handleTextChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      send();
                    }
                  }}
                  placeholder={`Message ${peerName.split(" ")[0]}`}
                  className="flex-1 resize-none bg-transparent py-[10px] text-sm leading-5 text-white placeholder:text-white/40 focus:outline-none"
                  style={{ height: 40, overflowY: "hidden" }}
                />
              )}
            </div>

            {/* Mic (hold to record) or Send (has text) */}
            {showMic ? (
              <motion.button
                onPointerDown={handleMicDown}
                onPointerUp={handleMicUp}
                onPointerLeave={handleMicCancel}
                onPointerCancel={handleMicCancel}
                animate={isRecording ? { scale: [1, 1.12, 1.08] } : { scale: 1 }}
                transition={isRecording ? { repeat: Infinity, duration: 0.9 } : {}}
                className={
                  "grid h-10 w-10 shrink-0 place-items-center rounded-full text-white transition-colors select-none touch-none " +
                  (isRecording
                    ? "bg-gradient-to-r from-red-600 to-pink-600 shadow-[0_4px_18px_-4px_rgba(239,68,68,0.6)]"
                    : "card-premium")
                }
              >
                {isRecording ? <Square className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              </motion.button>
            ) : (
              <motion.button
                whileTap={{ scale: 0.9 }}
                onClick={send}
                disabled={!text.trim() || uploading}
                className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gradient-to-r from-purple-600 via-pink-500 to-blue-500 text-white shadow-[0_4px_18px_-4px_rgba(236,72,153,0.55)] disabled:opacity-40"
              >
                <Send className="h-4 w-4" />
              </motion.button>
            )}
          </div>
        </div>

        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImagePick} />
      </div>

      {/* ── Image lightbox ──────────────────────────────────────────────── */}
      <AnimatePresence>
        {lightboxSrc && (
          <ImageLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />
        )}
      </AnimatePresence>

      {/* ── Action sheet (long-press) ────────────────────────────────────── */}
      <AnimatePresence>
        {actionSheet && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end justify-center"
            onClick={() => setActionSheet(null)}
          >
            <div className="absolute inset-0 bg-black/80" />
            <motion.div
              initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 26, stiffness: 260 }}
              className="relative w-full max-w-md rounded-t-3xl border-t border-white/[0.05] bg-[#0a0a0a] p-4 pb-8 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Reaction row */}
              <div className="mb-3 flex items-center justify-center gap-3">
                {REACTION_EMOJIS.map((emoji) => (
                  <button
                    key={emoji}
                    onClick={() => handleReact(actionSheet.id, emoji)}
                    className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-xl active:scale-90 transition-transform hover:bg-white/20"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
              <div className="h-px bg-white/10 mb-3" />

              {/* Copy — text messages only */}
              {actionSheet.text && (
                <button
                  onClick={handleCopyText}
                  className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm text-white hover:bg-white/5 active:bg-white/10"
                >
                  <Copy className="h-4 w-4 text-white/60" />
                  Copy
                </button>
              )}

              {/* Reply — available for all messages */}
              <button
                onClick={handleReply}
                className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm text-white hover:bg-white/5 active:bg-white/10"
              >
                <CornerUpLeft className="h-4 w-4 text-white/60" />
                Reply
              </button>

              {/* Edit (own text messages only) */}
              {actionSheet.mine && actionSheet.text && (
                <button
                  onClick={handleStartEdit}
                  className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm text-white hover:bg-white/5 active:bg-white/10"
                >
                  <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4 text-white/60" stroke="currentColor" strokeWidth="1.5">
                    <path d="M14.5 2.5l3 3-10 10H4.5v-3l10-10z" />
                  </svg>
                  Edit message
                </button>
              )}

              {/* Message Info — own messages */}
              {actionSheet.mine && (
                <button
                  onClick={handleMsgInfo}
                  className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm text-white hover:bg-white/5 active:bg-white/10"
                >
                  <Info className="h-4 w-4 text-white/60" />
                  Message info
                </button>
              )}

              {/* Delete — own messages */}
              {actionSheet.mine && (
                <button
                  onClick={handleDeleteMsg}
                  className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm text-rose-400 hover:bg-white/5 active:bg-white/10"
                >
                  <Trash2 className="h-4 w-4" />
                  Delete message
                </button>
              )}

              <button
                onClick={() => setActionSheet(null)}
                className="mt-1 flex w-full items-center justify-center rounded-xl px-4 py-3 text-sm text-white/50 hover:bg-white/5"
              >
                Cancel
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Message Info bottom sheet ────────────────────────────────────── */}
      <AnimatePresence>
        {msgInfoMsg && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end justify-center"
            onClick={() => setMsgInfoMsg(null)}
          >
            <div className="absolute inset-0 bg-black/80" />
            <motion.div
              initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 26, stiffness: 260 }}
              className="relative w-full max-w-md rounded-t-3xl border-t border-white/[0.05] bg-[#0a0a0a] p-5 pb-10 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Handle bar */}
              <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-white/15" />
              <h3 className="mb-5 text-center text-sm font-semibold text-white">Message Info</h3>

              {/* Message preview */}
              {msgInfoMsg.text && (
                <div className="mb-5 rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-3">
                  <p className="text-sm text-white/70 break-words line-clamp-3">{msgInfoMsg.text}</p>
                </div>
              )}

              {/* Receipt rows */}
              <div className="space-y-0 divide-y divide-white/[0.04]">
                {/* Sent */}
                <div className="flex items-center justify-between py-3.5">
                  <div className="flex items-center gap-2.5 text-sm text-white/70">
                    <Clock className="h-4 w-4 text-white/40 shrink-0" />
                    Sent
                  </div>
                  <span className="text-sm text-white/50">{fmtExact(msgInfoMsg.created_at)}</span>
                </div>

                {/* Delivered */}
                <div className="flex items-center justify-between py-3.5">
                  <div className="flex items-center gap-2.5 text-sm text-white/70">
                    <CheckCheck className={"h-4 w-4 shrink-0 " + (msgInfoMsg.delivered_at ? "text-white/40" : "text-white/15")} />
                    Delivered
                  </div>
                  <span className="text-sm text-white/50">
                    {msgInfoMsg.delivered_at ? fmtExact(msgInfoMsg.delivered_at) : <span className="text-white/20">—</span>}
                  </span>
                </div>

                {/* Seen */}
                <div className="flex items-center justify-between py-3.5">
                  <div className="flex items-center gap-2.5 text-sm text-white/70">
                    <CheckCheck className={"h-4 w-4 shrink-0 " + (msgInfoMsg.seen_at ? "text-blue-400" : "text-white/15")} />
                    Seen
                  </div>
                  <span className="text-sm text-white/50">
                    {msgInfoMsg.seen_at ? fmtExact(msgInfoMsg.seen_at) : <span className="text-white/20">—</span>}
                  </span>
                </div>
              </div>

              {/* Message ID (subtle, for debugging) */}
              <p className="mt-5 text-center font-mono text-[9px] text-white/15 break-all">{msgInfoMsg.id}</p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Nickname modal ───────────────────────────────────────────────── */}
      <AnimatePresence>
        {nicknamingOpen && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end justify-center"
            onClick={() => setNicknamingOpen(false)}
          >
            <div className="absolute inset-0 bg-black/80" />
            <motion.div
              initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 26, stiffness: 260 }}
              className="relative w-full max-w-md rounded-t-3xl border-t border-white/[0.05] bg-[#0a0a0a] p-6 pb-10 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="mb-4 text-center text-sm font-semibold text-white">
                Set nickname for <span className="text-purple-300">{otherUser?.name || peerName}</span>
              </h3>
              <input
                autoFocus
                value={nicknameInput}
                onChange={(e) => setNicknameInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleSaveNickname(); if (e.key === "Escape") setNicknamingOpen(false); }}
                placeholder={otherUser?.name || "Nickname…"}
                maxLength={40}
                className="w-full rounded-xl border border-white/[0.08] bg-[#0a0a0a] px-4 py-3 text-sm text-white placeholder:text-white/40 outline-none focus:border-purple-500"
              />
              <p className="mt-1.5 text-[10px] text-white/30 text-center">Leave blank to use real name. Right-click the name in the header to reopen.</p>
              <div className="mt-4 flex gap-2">
                <button
                  onClick={() => setNicknamingOpen(false)}
                  className="flex-1 rounded-xl border border-white/10 py-2.5 text-sm text-white/60 hover:bg-white/5"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveNickname}
                  className="flex-1 rounded-xl bg-gradient-to-r from-purple-600 to-pink-500 py-2.5 text-sm font-semibold text-white"
                >
                  Save
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
