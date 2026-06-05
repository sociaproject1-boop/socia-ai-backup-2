/**
 * GoLive.tsx — Creator live stream setup + active stream management view.
 *
 * Phase 1: Setup form (title, description, category, thumbnail).
 * Phase 2: Live creator view — comments monitor, viewer count, end stream.
 *
 * Note: Video delivery (WebRTC / HLS via a CDN like Mux or Agora) is Phase 2.
 * This phase builds the full streaming infrastructure and real-time interaction
 * layer. The stream key is generated and ready for CDN integration.
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, Camera, Radio, Users, Clock, StopCircle,
  ChevronDown, Image as ImageIcon, Loader2, Wifi
} from "lucide-react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase, isSupabaseReady } from "@/lib/supabase";
import type { LiveComment } from "@/components/live/LiveComments";

const BASE = `${import.meta.env.BASE_URL}api`.replace(/\/{2,}/g, "/");

const CATEGORIES = [
  { value: "general",   label: "General",   emoji: "💬" },
  { value: "gaming",    label: "Gaming",    emoji: "🎮" },
  { value: "music",     label: "Music",     emoji: "🎵" },
  { value: "art",       label: "Art",       emoji: "🎨" },
  { value: "fitness",   label: "Fitness",   emoji: "💪" },
  { value: "cooking",   label: "Cooking",   emoji: "🍳" },
  { value: "chat",      label: "Chat",      emoji: "💬" },
  { value: "education", label: "Education", emoji: "📚" },
  { value: "other",     label: "Other",     emoji: "✨" },
] as const;

interface StreamSession {
  id:            string;
  title:         string;
  stream_key:    string;
  viewer_count:  number;
  peak_viewers:  number;
  started_at:    string;
  status:        string;
}

function elapsed(startedAt: string): string {
  const secs = Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000);
  const h    = Math.floor(secs / 3600);
  const m    = Math.floor((secs % 3600) / 60);
  const s    = secs % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/* ── Setup Form ──────────────────────────────────────────────────────────── */
function SetupForm({
  onGoLive,
}: {
  onGoLive: (data: { title: string; description: string; category: string; thumbnail_url: string }) => void;
}) {
  const [title, setTitle]           = useState("");
  const [description, setDesc]      = useState("");
  const [category, setCategory]     = useState("general");
  const [thumbnailUrl, setThumb]    = useState("");
  const [showCats, setShowCats]     = useState(false);
  const [starting, setStarting]     = useState(false);
  const [, navigate]                = useLocation();

  const selectedCat = CATEGORIES.find((c) => c.value === category)!;

  async function handleStart() {
    if (!title.trim() || starting) return;
    setStarting(true);
    try {
      onGoLive({ title: title.trim(), description: description.trim(), category, thumbnail_url: thumbnailUrl });
    } catch {
      setStarting(false);
    }
  }

  return (
    <div className="app-bg min-h-[100dvh] flex flex-col">
      {/* Header */}
      <div className="app-header sticky top-0 z-40 flex items-center gap-3 px-4 py-3">
        <button
          onClick={() => navigate(-1 as never)}
          className="grid h-9 w-9 place-items-center rounded-full app-surface"
        >
          <ArrowLeft className="h-4 w-4 app-text" />
        </button>
        <h1 className="text-base font-bold app-text">Go Live</h1>
      </div>

      <div className="flex-1 overflow-y-auto pb-32 px-4 pt-2 space-y-5">

        {/* Camera preview placeholder */}
        <div
          style={{
            aspectRatio: "9/16",
            maxHeight: 260,
            borderRadius: 20,
            background: "linear-gradient(160deg,#0d021a 0%,#0a0a1a 100%)",
            border: "1.5px dashed rgba(168,85,247,0.3)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 12,
          }}
        >
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: "50%",
              background: "rgba(168,85,247,0.15)",
              display: "grid",
              placeItems: "center",
            }}
          >
            <Camera style={{ width: 26, height: 26, color: "rgba(168,85,247,0.7)" }} />
          </div>
          <p style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", textAlign: "center", maxWidth: 180 }}>
            Video preview will appear here
            <br />
            <span style={{ fontSize: 10 }}>CDN integration activates on go-live</span>
          </p>
        </div>

        {/* Title */}
        <div>
          <label className="text-[11px] font-semibold uppercase tracking-wider app-text-muted mb-1.5 block">
            Stream Title *
          </label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="What are you streaming today?"
            maxLength={120}
            className="w-full rounded-2xl px-4 py-3 text-sm app-text app-surface outline-none"
            style={{ border: "1px solid rgba(255,255,255,0.08)" }}
          />
          <div className="text-right mt-1 text-[10px] app-text-muted">{title.length}/120</div>
        </div>

        {/* Description */}
        <div>
          <label className="text-[11px] font-semibold uppercase tracking-wider app-text-muted mb-1.5 block">
            Description (optional)
          </label>
          <textarea
            value={description}
            onChange={(e) => setDesc(e.target.value)}
            placeholder="Tell viewers what this stream is about…"
            maxLength={500}
            rows={3}
            className="w-full rounded-2xl px-4 py-3 text-sm app-text app-surface outline-none resize-none"
            style={{ border: "1px solid rgba(255,255,255,0.08)" }}
          />
        </div>

        {/* Category */}
        <div>
          <label className="text-[11px] font-semibold uppercase tracking-wider app-text-muted mb-1.5 block">
            Category
          </label>
          <button
            onClick={() => setShowCats((v) => !v)}
            className="w-full flex items-center justify-between rounded-2xl px-4 py-3 app-surface text-sm app-text"
            style={{ border: "1px solid rgba(255,255,255,0.08)" }}
          >
            <span>{selectedCat.emoji} {selectedCat.label}</span>
            <ChevronDown
              className="h-4 w-4 app-text-muted"
              style={{ transform: showCats ? "rotate(180deg)" : undefined, transition: "transform 0.2s" }}
            />
          </button>
          <AnimatePresence>
            {showCats && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                style={{ overflow: "hidden" }}
              >
                <div
                  className="grid grid-cols-3 gap-2 mt-2"
                >
                  {CATEGORIES.map((c) => (
                    <button
                      key={c.value}
                      onClick={() => { setCategory(c.value); setShowCats(false); }}
                      className="rounded-2xl py-3 text-center text-xs font-medium app-text"
                      style={{
                        background: category === c.value
                          ? "linear-gradient(135deg,rgba(168,85,247,0.25),rgba(236,72,153,0.2))"
                          : "rgba(255,255,255,0.05)",
                        border: category === c.value
                          ? "1px solid rgba(168,85,247,0.5)"
                          : "1px solid rgba(255,255,255,0.06)",
                      }}
                    >
                      <div style={{ fontSize: 18 }}>{c.emoji}</div>
                      <div style={{ marginTop: 2 }}>{c.label}</div>
                    </button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Thumbnail URL (optional) */}
        <div>
          <label className="text-[11px] font-semibold uppercase tracking-wider app-text-muted mb-1.5 block">
            Cover Image URL (optional)
          </label>
          <div
            className="flex items-center gap-2 rounded-2xl px-4 py-3 app-surface"
            style={{ border: "1px solid rgba(255,255,255,0.08)" }}
          >
            <ImageIcon className="h-4 w-4 app-text-muted flex-shrink-0" />
            <input
              value={thumbnailUrl}
              onChange={(e) => setThumb(e.target.value)}
              placeholder="https://…"
              className="flex-1 bg-transparent outline-none text-sm app-text"
            />
          </div>
        </div>
      </div>

      {/* Go Live button */}
      <div
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          padding: "16px 20px",
          paddingBottom: "calc(16px + env(safe-area-inset-bottom, 0px))",
          background: "rgba(10,10,10,0.95)",
          backdropFilter: "blur(12px)",
          borderTop: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={handleStart}
          disabled={!title.trim() || starting}
          style={{
            width: "100%",
            padding: "15px 0",
            borderRadius: 28,
            background: title.trim() && !starting
              ? "linear-gradient(135deg,#ef4444,#dc2626)"
              : "rgba(255,255,255,0.08)",
            color: "white",
            fontSize: 16,
            fontWeight: 700,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            transition: "background 0.2s ease",
            cursor: title.trim() && !starting ? "pointer" : "default",
          }}
        >
          {starting ? (
            <Loader2 style={{ width: 18, height: 18, animation: "spin 1s linear infinite" }} />
          ) : (
            <Radio style={{ width: 18, height: 18 }} />
          )}
          {starting ? "Starting…" : "Go Live"}
        </motion.button>
      </div>
    </div>
  );
}

/* ── Live Creator View ───────────────────────────────────────────────────── */
function LiveCreatorView({
  stream,
  jwt,
  onEnded,
}: {
  stream:  StreamSession;
  jwt:     string;
  onEnded: () => void;
}) {
  const [, navigate]          = useLocation();
  const [viewerCount, setVC]  = useState(stream.viewer_count);
  const [peakViewers, setPeak]= useState(stream.peak_viewers);
  const [timer, setTimer]     = useState(elapsed(stream.started_at));
  const [comments, setComments] = useState<LiveComment[]>([]);
  const [ending, setEnding]   = useState(false);
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const timerRef              = useRef<ReturnType<typeof setInterval> | null>(null);

  // Clock ticker
  useEffect(() => {
    timerRef.current = setInterval(() => setTimer(elapsed(stream.started_at)), 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [stream.started_at]);

  // Supabase Realtime — viewer count
  useEffect(() => {
    if (!isSupabaseReady) return;
    type OnParam = Parameters<RealtimeChannel["on"]>[0];
    const channel: RealtimeChannel = supabase.channel(`creator_stream_${stream.id}`);
    channel.on(
      "postgres_changes" as OnParam,
      { event: "UPDATE", schema: "public", table: "stream_sessions", filter: `id=eq.${stream.id}` },
      (payload: { new: Partial<StreamSession> }) => {
        if (typeof (payload.new as { viewer_count?: number }).viewer_count === "number")
          setVC((payload.new as { viewer_count: number }).viewer_count);
        if (typeof (payload.new as { peak_viewers?: number }).peak_viewers === "number")
          setPeak((payload.new as { peak_viewers: number }).peak_viewers);
      }
    );
    channel.on(
      "postgres_changes" as OnParam,
      { event: "INSERT", schema: "public", table: "stream_comments", filter: `stream_id=eq.${stream.id}` },
      (payload: { new: LiveComment }) => {
        if (!payload.new.is_muted) {
          setComments((prev) => [...prev.slice(-49), payload.new]);
        }
      }
    );
    channel.subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [stream.id]);

  async function handleEndStream() {
    if (ending) return;
    setEnding(true);
    try {
      await fetch(`${BASE}/streams/${stream.id}/end`, {
        method:  "PATCH",
        headers: { Authorization: `Bearer ${jwt}` },
      });
      onEnded();
      navigate("/");
    } catch {
      setEnding(false);
    }
  }

  async function handleMuteViewer(userId: string) {
    await fetch(`${BASE}/streams/${stream.id}/viewers/${userId}/mute`, {
      method:  "POST",
      headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
      body:    JSON.stringify({ muted: true }),
    });
    setComments((prev) =>
      prev.map((c) => c.user.id === userId ? { ...c, is_muted: true } : c)
    );
  }

  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "#000",
        display: "flex", flexDirection: "column", zIndex: 60,
      }}
    >
      {/* Top bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "16px 16px 12px",
          paddingTop: "calc(16px + env(safe-area-inset-top, 0px))",
          background: "linear-gradient(to bottom, rgba(0,0,0,0.8), transparent)",
        }}
      >
        {/* LIVE badge */}
        <div
          style={{
            background: "#ef4444",
            borderRadius: 6,
            padding: "3px 8px",
            fontSize: 11,
            fontWeight: 800,
            color: "white",
            letterSpacing: "0.08em",
            display: "flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "white", animation: "livePulse 1.4s ease-in-out infinite" }} />
          LIVE
        </div>

        {/* Timer */}
        <div
          style={{
            background: "rgba(0,0,0,0.55)",
            backdropFilter: "blur(8px)",
            borderRadius: 8,
            padding: "3px 8px",
            fontSize: 12,
            fontWeight: 600,
            color: "white",
            display: "flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          <Clock style={{ width: 11, height: 11 }} /> {timer}
        </div>

        <div style={{ flex: 1 }} />

        {/* Viewers */}
        <div
          style={{
            background: "rgba(0,0,0,0.55)",
            backdropFilter: "blur(8px)",
            borderRadius: 8,
            padding: "3px 10px",
            fontSize: 12,
            fontWeight: 600,
            color: "white",
            display: "flex",
            alignItems: "center",
            gap: 5,
          }}
        >
          <Users style={{ width: 12, height: 12, color: "#f87171" }} />
          {viewerCount.toLocaleString()}
        </div>
      </div>

      {/* Stream visual — gradient bg with "live" indicator */}
      <div style={{ flex: 1, position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div
          style={{
            textAlign: "center",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 16,
          }}
        >
          <div
            style={{
              width: 80, height: 80, borderRadius: "50%",
              background: "rgba(168,85,247,0.15)",
              display: "grid", placeItems: "center",
              border: "2px solid rgba(168,85,247,0.3)",
              animation: "livePulse 2s ease-in-out infinite",
            }}
          >
            <Wifi style={{ width: 36, height: 36, color: "rgba(168,85,247,0.8)" }} />
          </div>
          <div>
            <p style={{ fontSize: 14, color: "rgba(255,255,255,0.5)", marginBottom: 4 }}>
              You're live
            </p>
            <p style={{ fontSize: 18, fontWeight: 700, color: "white", maxWidth: 260, textAlign: "center" }}>
              {stream.title}
            </p>
          </div>
          <div
            style={{
              background: "rgba(255,255,255,0.06)",
              borderRadius: 12,
              padding: "8px 16px",
              fontSize: 11,
              color: "rgba(255,255,255,0.4)",
              textAlign: "center",
            }}
          >
            Peak viewers: {peakViewers.toLocaleString()}
          </div>
        </div>

        {/* Comments monitor (right side overlay) */}
        <div
          style={{
            position: "absolute",
            bottom: 20,
            left: 12,
            right: 12,
            maxHeight: 220,
            overflowY: "auto",
            scrollbarWidth: "none",
          }}
        >
          <p style={{ fontSize: 10, fontWeight: 600, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>
            Live Comments
          </p>
          {comments.length === 0 ? (
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.2)" }}>No comments yet</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {comments.filter((c) => !c.is_muted).slice(-10).map((c) => (
                <div
                  key={c.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    background: "rgba(255,255,255,0.05)",
                    borderRadius: 10,
                    padding: "5px 8px",
                  }}
                >
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#e879f9", flexShrink: 0 }}>
                    {c.user.username}
                  </span>
                  <span style={{ fontSize: 12, color: "rgba(255,255,255,0.75)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {c.content}
                  </span>
                  <button
                    onClick={() => handleMuteViewer(c.user.id)}
                    style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", cursor: "pointer", flexShrink: 0 }}
                  >
                    mute
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* End stream button */}
      <div
        style={{
          padding: "16px 20px",
          paddingBottom: "calc(16px + env(safe-area-inset-bottom, 0px))",
          background: "rgba(0,0,0,0.9)",
        }}
      >
        {showEndConfirm ? (
          <div style={{ display: "flex", gap: 10 }}>
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => setShowEndConfirm(false)}
              style={{
                flex: 1, padding: "14px 0", borderRadius: 28,
                background: "rgba(255,255,255,0.1)",
                color: "white", fontSize: 15, fontWeight: 600, cursor: "pointer",
              }}
            >
              Keep Going
            </motion.button>
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={handleEndStream}
              disabled={ending}
              style={{
                flex: 1, padding: "14px 0", borderRadius: 28,
                background: "#ef4444",
                color: "white", fontSize: 15, fontWeight: 700, cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
              }}
            >
              {ending
                ? <Loader2 style={{ width: 16, height: 16, animation: "spin 1s linear infinite" }} />
                : <StopCircle style={{ width: 16, height: 16 }} />
              }
              {ending ? "Ending…" : "End Now"}
            </motion.button>
          </div>
        ) : (
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={() => setShowEndConfirm(true)}
            style={{
              width: "100%", padding: "14px 0", borderRadius: 28,
              background: "rgba(239,68,68,0.2)",
              border: "1.5px solid rgba(239,68,68,0.5)",
              color: "#fca5a5", fontSize: 15, fontWeight: 700,
              display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
              cursor: "pointer",
            }}
          >
            <StopCircle style={{ width: 18, height: 18 }} />
            End Stream
          </motion.button>
        )}
      </div>
    </div>
  );
}

/* ── GoLive page ─────────────────────────────────────────────────────────── */
export default function GoLive() {
  const [jwt, setJwt]       = useState("");
  const [stream, setStream] = useState<StreamSession | null>(null);
  const [error, setError]   = useState("");

  // Resolve JWT once on mount
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setJwt(data.session?.access_token ?? "");
    });
  }, []);

  async function handleGoLive(data: {
    title: string; description: string; category: string; thumbnail_url: string;
  }) {
    const { data: s } = await supabase.auth.getSession();
    const token = s.session?.access_token;
    if (!token) { setError("Not signed in"); return; }
    try {
      const res = await fetch(`${BASE}/streams`, {
        method:  "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body:    JSON.stringify(data),
      });
      if (!res.ok) {
        const j = await res.json() as { error?: string };
        setError(j.error ?? "Failed to start stream");
        return;
      }
      const json = await res.json() as { stream: StreamSession };
      setStream(json.stream);
      setJwt(token);
    } catch {
      setError("Network error. Please try again.");
    }
  }

  if (stream) {
    return (
      <LiveCreatorView
        stream={stream}
        jwt={jwt}
        onEnded={() => setStream(null)}
      />
    );
  }

  return (
    <>
      <SetupForm onGoLive={handleGoLive} />
      {error && (
        <div
          style={{
            position: "fixed",
            bottom: 100,
            left: 20,
            right: 20,
            background: "#7f1d1d",
            border: "1px solid #ef4444",
            borderRadius: 12,
            padding: "12px 16px",
            fontSize: 13,
            color: "#fca5a5",
            zIndex: 100,
          }}
        >
          {error}
        </div>
      )}
    </>
  );
}
