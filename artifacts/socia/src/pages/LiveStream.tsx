/**
 * LiveStream.tsx — Full-screen live stream viewer page.
 *
 * Layout: TikTok Live-style portrait experience.
 * - Tapping the screen toggles the control overlay.
 * - Realtime comments via Supabase Postgres changes on stream_comments.
 * - Realtime viewer count via Supabase Postgres changes on stream_sessions.
 * - Realtime reactions via Supabase Postgres changes on stream_reactions.
 * - Floating reaction animations on the right side.
 */
import { useEffect, useState, useCallback, useRef } from "react";
import { useRoute, useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, Share2, UserPlus, Check, Wifi, Users, Loader2,
} from "lucide-react";
import { useAppStore } from "@/lib/store";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase, isSupabaseReady } from "@/lib/supabase";
import { LiveComments, type LiveComment } from "@/components/live/LiveComments";
import { LiveReactions, type ReactionType, type FloatingReaction } from "@/components/live/LiveReactions";

async function getJwt(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? "";
}

const BASE = `${import.meta.env.BASE_URL}api`.replace(/\/{2,}/g, "/");

interface StreamDetail {
  id:           string;
  title:        string;
  description:  string | null;
  category:     string;
  thumbnail_url: string | null;
  status:       "live" | "ended";
  viewer_count: number;
  peak_viewers: number;
  started_at:   string;
  creator: {
    id:          string;
    name:        string;
    username:    string;
    avatar_url:  string | null;
    is_verified: boolean;
    is_owner:    boolean;
    followers:   number;
  };
}

export default function LiveStream() {
  const [, params]            = useRoute("/live/:id");
  const streamId              = params?.id ?? "";
  const [, navigate]          = useLocation();
  const me                    = useAppStore((s) => s.user);

  const [jwt, setJwt]             = useState("");
  const [stream, setStream]       = useState<StreamDetail | null>(null);
  const [loading, setLoading]     = useState(true);
  const [viewerCount, setVC]      = useState(0);
  const [comments, setComments]   = useState<LiveComment[]>([]);
  const [reactions, setReactions] = useState<FloatingReaction[]>([]);
  const [following, setFollowing] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [ended, setEnded]         = useState(false);
  const [error, setError]         = useState("");
  const controlTimerRef           = useRef<ReturnType<typeof setTimeout> | null>(null);
  const joinedRef                 = useRef(false);

  // Resolve JWT once on mount
  useEffect(() => {
    getJwt().then(setJwt);
    const { data: listener } = supabase.auth.onAuthStateChange((_e, s) => {
      setJwt(s?.access_token ?? "");
    });
    return () => { listener.subscription.unsubscribe(); };
  }, []);

  // Auto-hide controls after 4s
  function showControlsTemp() {
    setShowControls(true);
    if (controlTimerRef.current) clearTimeout(controlTimerRef.current);
    controlTimerRef.current = setTimeout(() => setShowControls(false), 4000);
  }

  // Load stream details
  const loadStream = useCallback(async () => {
    if (!jwt || !streamId) return;
    try {
      const res  = await fetch(`${BASE}/streams/${streamId}`, {
        headers: { Authorization: `Bearer ${jwt}` },
      });
      if (!res.ok) {
        setError("Stream not found");
        setLoading(false);
        return;
      }
      const json = await res.json() as { stream: StreamDetail };
      setStream(json.stream);
      setVC(json.stream.viewer_count);
      if (json.stream.status === "ended") setEnded(true);
    } catch {
      setError("Failed to load stream");
    } finally {
      setLoading(false);
    }
  }, [jwt, streamId]);

  // Load initial comments
  const loadComments = useCallback(async () => {
    if (!jwt || !streamId) return;
    try {
      const res  = await fetch(`${BASE}/streams/${streamId}/comments?limit=50`, {
        headers: { Authorization: `Bearer ${jwt}` },
      });
      if (!res.ok) return;
      const json = await res.json() as { comments: LiveComment[] };
      setComments(json.comments ?? []);
    } catch { /* silent */ }
  }, [jwt, streamId]);

  // Join stream
  const joinStream = useCallback(async () => {
    if (!jwt || !streamId || joinedRef.current) return;
    joinedRef.current = true;
    try {
      await fetch(`${BASE}/streams/${streamId}/join`, {
        method:  "POST",
        headers: { Authorization: `Bearer ${jwt}` },
      });
    } catch { /* silent */ }
  }, [jwt, streamId]);

  // Leave stream
  const leaveStream = useCallback(async () => {
    if (!jwt || !streamId || !joinedRef.current) return;
    joinedRef.current = false;
    try {
      await fetch(`${BASE}/streams/${streamId}/leave`, {
        method:  "POST",
        headers: { Authorization: `Bearer ${jwt}` },
      });
    } catch { /* silent */ }
  }, [jwt, streamId]);

  // Init
  useEffect(() => {
    loadStream();
    loadComments();
    showControlsTemp();
    return () => { if (controlTimerRef.current) clearTimeout(controlTimerRef.current); };
  }, [loadStream, loadComments]);

  // Join on mount, leave on unmount
  useEffect(() => {
    joinStream();
    return () => { leaveStream(); };
  }, [joinStream, leaveStream]);

  // Supabase Realtime
  useEffect(() => {
    if (!isSupabaseReady || !streamId) return;

    type OnParam = Parameters<RealtimeChannel["on"]>[0];
    const channel: RealtimeChannel = supabase.channel(`stream_viewer_${streamId}`);

    // Viewer count + stream status updates
    channel.on(
      "postgres_changes" as OnParam,
      { event: "UPDATE", schema: "public", table: "stream_sessions", filter: `id=eq.${streamId}` },
      (payload: { new: Partial<StreamDetail> & { status?: string } }) => {
        if (typeof (payload.new as { viewer_count?: number }).viewer_count === "number")
          setVC((payload.new as { viewer_count: number }).viewer_count);
        if ((payload.new as { status?: string }).status === "ended") setEnded(true);
      }
    );
    // New comments
    channel.on(
      "postgres_changes" as OnParam,
      { event: "INSERT", schema: "public", table: "stream_comments", filter: `stream_id=eq.${streamId}` },
      (payload: { new: LiveComment }) => {
        if (!payload.new.is_muted) {
          setComments((prev) => [...prev.slice(-99), payload.new]);
        }
      }
    );
    // New reactions
    channel.on(
      "postgres_changes" as OnParam,
      { event: "INSERT", schema: "public", table: "stream_reactions", filter: `stream_id=eq.${streamId}` },
      (payload: { new: { id: string; type: string } }) => {
        setReactions((prev) => [
          ...prev,
          { id: payload.new.id, type: payload.new.type as ReactionType, x: Math.random() },
        ]);
      }
    );
    channel.subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [streamId]);

  // Send comment
  async function handleSendComment(text: string) {
    if (!jwt || !streamId) return;
    const res = await fetch(`${BASE}/streams/${streamId}/comments`, {
      method:  "POST",
      headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
      body:    JSON.stringify({ content: text }),
    });
    if (!res.ok) {
      const j = await res.json() as { error?: string };
      throw new Error(j.error ?? "failed");
    }
  }

  // Send reaction
  async function handleReact(type: ReactionType) {
    if (!jwt || !streamId) return;
    // Optimistic local animation
    setReactions((prev) => [
      ...prev,
      { id: `local_${Date.now()}`, type, x: Math.random() },
    ]);
    try {
      await fetch(`${BASE}/streams/${streamId}/reactions`, {
        method:  "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body:    JSON.stringify({ type }),
      });
    } catch { /* silent — animation already shown */ }
  }

  // Follow creator
  async function handleFollow() {
    if (!stream || following || !me) return;
    setFollowing(true);
    try {
      const { error } = await supabase
        .from("follows")
        .insert({ follower_id: me.id, following_id: stream.creator.id });
      if (error) setFollowing(false);
    } catch {
      setFollowing(false);
    }
  }

  // Share stream
  function handleShare() {
    const url = `${window.location.origin}/live/${streamId}`;
    if (navigator.share) {
      navigator.share({ title: stream?.title ?? "Live Stream", url }).catch(() => {});
    } else {
      navigator.clipboard.writeText(url).then(() => {}).catch(() => {});
    }
  }

  /* ── Render ── */
  if (loading) {
    return (
      <div style={{ position: "fixed", inset: 0, background: "#000", display: "grid", placeItems: "center" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
          <Loader2 style={{ width: 36, height: 36, color: "#a855f7", animation: "spin 1s linear infinite" }} />
          <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 13 }}>Joining stream…</p>
        </div>
      </div>
    );
  }

  if (error || !stream) {
    return (
      <div style={{ position: "fixed", inset: 0, background: "#000", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16 }}>
        <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 15 }}>{error || "Stream not found"}</p>
        <button
          onClick={() => navigate("/")}
          style={{ padding: "10px 24px", borderRadius: 20, background: "#a855f7", color: "white", fontSize: 14, fontWeight: 600, cursor: "pointer" }}
        >
          Back to Home
        </button>
      </div>
    );
  }

  const isCreator = me?.id === stream.creator.id;

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "#000", overflow: "hidden", zIndex: 60 }}
      onClick={showControlsTemp}
    >
      {/* ── Video background (stream thumbnail / gradient) ─────────────── */}
      <div style={{ position: "absolute", inset: 0 }}>
        {stream.thumbnail_url ? (
          <img
            src={stream.thumbnail_url}
            alt={stream.title}
            style={{ width: "100%", height: "100%", objectFit: "cover", filter: "brightness(0.55)" }}
          />
        ) : (
          <div
            style={{
              width: "100%", height: "100%",
              background: "linear-gradient(160deg,#0d021a 0%,#0a0523 40%,#0a0a1a 100%)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            <div style={{ textAlign: "center" }}>
              {stream.creator.avatar_url ? (
                <img
                  src={stream.creator.avatar_url}
                  alt={stream.creator.name}
                  style={{
                    width: 100, height: 100, borderRadius: "50%",
                    border: "3px solid rgba(168,85,247,0.6)",
                    animation: "livePulse 2s ease-in-out infinite",
                    objectFit: "cover",
                  }}
                />
              ) : (
                <div
                  style={{
                    width: 100, height: 100, borderRadius: "50%",
                    background: "linear-gradient(135deg,#a855f7,#ec4899)",
                    display: "grid", placeItems: "center",
                    animation: "livePulse 2s ease-in-out infinite",
                  }}
                >
                  <span style={{ fontSize: 40, fontWeight: 700, color: "white" }}>
                    {stream.creator.name.charAt(0).toUpperCase()}
                  </span>
                </div>
              )}
              <div style={{ marginTop: 20, display: "flex", alignItems: "center", gap: 8, justifyContent: "center" }}>
                <Wifi style={{ width: 20, height: 20, color: "rgba(168,85,247,0.6)" }} />
                <span style={{ fontSize: 14, color: "rgba(255,255,255,0.4)" }}>
                  {ended ? "Stream has ended" : "Live stream active"}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Top gradient overlay ─────────────────────────────────────────── */}
      <div
        style={{
          position: "absolute", top: 0, left: 0, right: 0,
          height: 160,
          background: "linear-gradient(to bottom,rgba(0,0,0,0.75),transparent)",
          pointerEvents: "none",
        }}
      />

      {/* ── Bottom gradient overlay ──────────────────────────────────────── */}
      <div
        style={{
          position: "absolute", bottom: 0, left: 0, right: 0,
          height: 380,
          background: "linear-gradient(to top,rgba(0,0,0,0.85),transparent)",
          pointerEvents: "none",
        }}
      />

      {/* ── Top controls (always visible) ───────────────────────────────── */}
      <div
        style={{
          position: "absolute", top: 0, left: 0, right: 0,
          padding: "16px 16px 0",
          paddingTop: "calc(16px + env(safe-area-inset-top, 0px))",
          display: "flex",
          alignItems: "center",
          gap: 10,
          zIndex: 10,
        }}
      >
        {/* Back button */}
        <motion.button
          whileTap={{ scale: 0.85 }}
          onClick={(e) => { e.stopPropagation(); navigate(-1 as never); }}
          style={{
            width: 36, height: 36, borderRadius: "50%",
            background: "rgba(0,0,0,0.5)",
            backdropFilter: "blur(8px)",
            display: "grid", placeItems: "center",
          }}
        >
          <ArrowLeft style={{ width: 18, height: 18, color: "white" }} />
        </motion.button>

        {/* Creator info */}
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            gap: 8,
            background: "rgba(0,0,0,0.45)",
            backdropFilter: "blur(8px)",
            borderRadius: 24,
            padding: "6px 10px",
          }}
        >
          <div style={{ width: 32, height: 32, borderRadius: "50%", overflow: "hidden", flexShrink: 0, background: "linear-gradient(135deg,#a855f7,#ec4899)" }}>
            {stream.creator.avatar_url ? (
              <img src={stream.creator.avatar_url} alt={stream.creator.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            ) : (
              <div style={{ width: "100%", height: "100%", display: "grid", placeItems: "center" }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: "white" }}>{stream.creator.name.charAt(0)}</span>
              </div>
            )}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "white", display: "flex", alignItems: "center", gap: 3 }}>
              {stream.creator.username}
              {stream.creator.is_verified && <span style={{ color: "#60a5fa", fontSize: 11 }}>✓</span>}
            </div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)" }}>
              {stream.creator.followers?.toLocaleString() ?? 0} followers
            </div>
          </div>
          {/* Follow button (hide if own stream) */}
          {!isCreator && (
            <motion.button
              whileTap={{ scale: 0.88 }}
              onClick={(e) => { e.stopPropagation(); handleFollow(); }}
              style={{
                padding: "5px 12px",
                borderRadius: 16,
                background: following ? "rgba(255,255,255,0.1)" : "linear-gradient(135deg,#a855f7,#ec4899)",
                color: "white",
                fontSize: 11,
                fontWeight: 700,
                display: "flex",
                alignItems: "center",
                gap: 4,
                flexShrink: 0,
                cursor: "pointer",
              }}
            >
              {following ? <Check style={{ width: 11, height: 11 }} /> : <UserPlus style={{ width: 11, height: 11 }} />}
              {following ? "Following" : "Follow"}
            </motion.button>
          )}
        </div>

        {/* Viewer count */}
        <div
          style={{
            background: "rgba(0,0,0,0.5)",
            backdropFilter: "blur(8px)",
            borderRadius: 10,
            padding: "6px 10px",
            display: "flex",
            alignItems: "center",
            gap: 4,
            fontSize: 12,
            fontWeight: 600,
            color: "white",
          }}
        >
          <Users style={{ width: 12, height: 12, color: "#f87171" }} />
          {viewerCount.toLocaleString()}
        </div>
      </div>

      {/* ── Live + title strip ───────────────────────────────────────────── */}
      <AnimatePresence>
        {showControls && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: "absolute",
              top: "calc(72px + env(safe-area-inset-top, 0px))",
              left: 16,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            {!ended ? (
              <div
                style={{
                  background: "#ef4444",
                  borderRadius: 6,
                  padding: "3px 8px",
                  fontSize: 11,
                  fontWeight: 800,
                  color: "white",
                  letterSpacing: "0.06em",
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "white", animation: "livePulse 1.4s ease-in-out infinite" }} />
                LIVE
              </div>
            ) : (
              <div style={{ background: "rgba(0,0,0,0.6)", borderRadius: 6, padding: "3px 8px", fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.6)" }}>
                ENDED
              </div>
            )}
            <div
              style={{
                background: "rgba(0,0,0,0.45)",
                backdropFilter: "blur(6px)",
                borderRadius: 8,
                padding: "3px 8px",
                fontSize: 12,
                fontWeight: 600,
                color: "white",
                maxWidth: 180,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {stream.title}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Share button ────────────────────────────────────────────────── */}
      <AnimatePresence>
        {showControls && (
          <motion.button
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            whileTap={{ scale: 0.85 }}
            onClick={(e) => { e.stopPropagation(); handleShare(); }}
            style={{
              position: "absolute",
              top: "calc(120px + env(safe-area-inset-top, 0px))",
              right: 16,
              width: 40,
              height: 40,
              borderRadius: "50%",
              background: "rgba(0,0,0,0.5)",
              backdropFilter: "blur(8px)",
              display: "grid",
              placeItems: "center",
            }}
          >
            <Share2 style={{ width: 18, height: 18, color: "white" }} />
          </motion.button>
        )}
      </AnimatePresence>

      {/* ── Floating Reactions (right side) ─────────────────────────────── */}
      <LiveReactions reactions={reactions} onReact={handleReact} />

      {/* ── Realtime Comments (bottom overlay) ──────────────────────────── */}
      <LiveComments
        comments={comments}
        onSend={handleSendComment}
        disabled={ended}
      />

      {/* ── Stream ended banner ──────────────────────────────────────────── */}
      <AnimatePresence>
        {ended && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: "translate(-50%,-50%)",
              background: "rgba(0,0,0,0.85)",
              backdropFilter: "blur(12px)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 20,
              padding: "24px 32px",
              textAlign: "center",
              zIndex: 20,
            }}
          >
            <p style={{ fontSize: 20, fontWeight: 700, color: "white", marginBottom: 8 }}>
              Stream Ended
            </p>
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", marginBottom: 20 }}>
              {stream.creator.username}'s live stream has ended.
            </p>
            <button
              onClick={() => navigate("/")}
              style={{
                padding: "10px 28px",
                borderRadius: 20,
                background: "linear-gradient(135deg,#a855f7,#ec4899)",
                color: "white",
                fontSize: 14,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Back to Home
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
