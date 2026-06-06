/**
 * LiveNowSection.tsx — Horizontal strip of active live streams on the Home feed.
 * Polls /api/streams/active every 30s and subscribes to Supabase Realtime for
 * stream_sessions updates so the viewer counts stay fresh.
 */
import { useEffect, useState, useCallback } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Radio } from "lucide-react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase, isSupabaseReady } from "@/lib/supabase";

const BASE = `${import.meta.env.BASE_URL}api`.replace(/\/{2,}/g, "/");

export interface LiveStreamPreview {
  id:           string;
  title:        string;
  category:     string;
  thumbnail_url: string | null;
  viewer_count: number;
  started_at:   string;
  creator: {
    id:          string;
    name:        string;
    username:    string;
    avatar_url:  string | null;
    is_verified:         boolean;
    is_owner:            boolean;
    subscription_status: string;
  };
}

async function fetchActiveStreams(): Promise<LiveStreamPreview[]> {
  const { data } = await supabase.auth.getSession();
  const jwt = data.session?.access_token;
  if (!jwt) return [];
  const res = await fetch(`${BASE}/streams/active`, {
    headers: { Authorization: `Bearer ${jwt}` },
  });
  if (!res.ok) return [];
  const json = await res.json() as { streams: LiveStreamPreview[] };
  return json.streams ?? [];
}

/* ── LiveBadge ───────────────────────────────────────────────────────────── */
function LiveBadge() {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 3,
        background: "#ef4444",
        borderRadius: 4,
        padding: "1px 5px",
        fontSize: 9,
        fontWeight: 800,
        color: "white",
        letterSpacing: "0.06em",
      }}
    >
      <span
        style={{
          width: 5,
          height: 5,
          borderRadius: "50%",
          background: "white",
          animation: "livePulse 1.4s ease-in-out infinite",
        }}
      />
      LIVE
    </span>
  );
}

/* ── StreamCard ───────────────────────────────────────────────────────────── */
function StreamCard({
  stream,
  onTap,
}: {
  stream: LiveStreamPreview;
  onTap:  () => void;
}) {
  return (
    <motion.button
      whileTap={{ scale: 0.94 }}
      onClick={onTap}
      style={{
        flexShrink: 0,
        width: 120,
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        background: "transparent",
        cursor: "pointer",
      }}
    >
      {/* Thumbnail / Avatar */}
      <div
        style={{
          position: "relative",
          width: 120,
          height: 160,
          borderRadius: 16,
          overflow: "hidden",
          background: "linear-gradient(135deg,#1a0533,#0d0d1a)",
          border: "2px solid rgba(168,85,247,0.35)",
          flexShrink: 0,
        }}
      >
        {stream.thumbnail_url ? (
          <img
            src={stream.thumbnail_url}
            alt={stream.title}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
          /* Gradient placeholder with creator avatar centered */
          <div
            style={{
              width: "100%",
              height: "100%",
              background: "linear-gradient(160deg,#1a0533 0%,#0f0523 50%,#0a0a1a 100%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: "50%",
                border: "3px solid rgba(168,85,247,0.6)",
                overflow: "hidden",
                background: "linear-gradient(135deg,#a855f7,#ec4899)",
              }}
            >
              {stream.creator.avatar_url ? (
                <img
                  src={stream.creator.avatar_url}
                  alt={stream.creator.name}
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              ) : (
                <div style={{ width: "100%", height: "100%", display: "grid", placeItems: "center" }}>
                  <span style={{ fontSize: 22, fontWeight: 700, color: "white" }}>
                    {stream.creator.name.charAt(0).toUpperCase()}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Live badge top-left */}
        <div style={{ position: "absolute", top: 7, left: 7 }}>
          <LiveBadge />
        </div>

        {/* Viewer count bottom-right */}
        <div
          style={{
            position: "absolute",
            bottom: 7,
            right: 7,
            background: "rgba(0,0,0,0.65)",
            backdropFilter: "blur(6px)",
            borderRadius: 8,
            padding: "2px 6px",
            fontSize: 10,
            fontWeight: 600,
            color: "white",
            display: "flex",
            alignItems: "center",
            gap: 3,
          }}
        >
          <span style={{ color: "#f87171", fontSize: 8 }}>●</span>
          {stream.viewer_count.toLocaleString()}
        </div>
      </div>

      {/* Creator name + stream title */}
      <div style={{ marginTop: 6, width: "100%", paddingLeft: 2 }}>
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: "rgba(255,255,255,0.9)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {stream.creator.username}
          {(stream.creator.is_owner ||
            (stream.creator.is_verified &&
              (stream.creator.subscription_status === "active" ||
               stream.creator.subscription_status === "owner"))) && (
            <span style={{ marginLeft: 2, color: "#60a5fa", fontSize: 10 }}>✓</span>
          )}
        </div>
        <div
          style={{
            fontSize: 10,
            color: "rgba(255,255,255,0.45)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            marginTop: 1,
          }}
        >
          {stream.title}
        </div>
      </div>
    </motion.button>
  );
}

/* ── LiveNowSection ──────────────────────────────────────────────────────── */
export function LiveNowSection() {
  const [, navigate]          = useLocation();
  const [streams, setStreams]  = useState<LiveStreamPreview[]>([]);
  const [loading, setLoading]  = useState(true);

  const load = useCallback(async () => {
    try {
      const data = await fetchActiveStreams();
      setStreams(data);
    } catch {
      // silently fail — section just stays hidden
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial fetch + 30s polling
  useEffect(() => {
    load();
    const interval = setInterval(load, 30_000);
    return () => clearInterval(interval);
  }, [load]);

  // Supabase Realtime — update viewer counts live
  useEffect(() => {
    if (!isSupabaseReady) return;
    type OnParam = Parameters<RealtimeChannel["on"]>[0];
    const channel: RealtimeChannel = supabase.channel("live_now_section");
    channel.on(
      "postgres_changes" as OnParam,
      { event: "UPDATE", schema: "public", table: "stream_sessions", filter: "status=eq.live" },
      (payload: { new: Partial<LiveStreamPreview> }) => {
        setStreams((prev) =>
          prev.map((s) =>
            s.id === (payload.new as { id: string }).id
              ? { ...s, viewer_count: (payload.new as { viewer_count: number }).viewer_count ?? s.viewer_count }
              : s
          )
        );
      }
    );
    channel.on(
      "postgres_changes" as OnParam,
      { event: "INSERT", schema: "public", table: "stream_sessions" },
      () => { load(); }
    );
    channel.on(
      "postgres_changes" as OnParam,
      { event: "UPDATE", schema: "public", table: "stream_sessions", filter: "status=eq.ended" },
      (payload: { new: { id: string } }) => {
        setStreams((prev) => prev.filter((s) => s.id !== payload.new.id));
      }
    );
    channel.subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [load]);

  // Don't render section if no streams and not loading
  if (!loading && streams.length === 0) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, height: 0 }}
        animate={{ opacity: 1, height: "auto" }}
        exit={{ opacity: 0, height: 0 }}
        style={{ overflow: "hidden" }}
      >
        <div style={{ paddingTop: 12, paddingBottom: 4 }}>
          {/* Section header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              paddingLeft: 16,
              paddingRight: 16,
              marginBottom: 10,
            }}
          >
            <Radio style={{ width: 13, height: 13, color: "#ef4444" }} />
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.09em",
                color: "rgba(255,255,255,0.55)",
              }}
            >
              Live Now
            </span>
            {streams.length > 0 && (
              <span
                style={{
                  background: "#ef4444",
                  borderRadius: 10,
                  padding: "1px 6px",
                  fontSize: 10,
                  fontWeight: 700,
                  color: "white",
                }}
              >
                {streams.length}
              </span>
            )}
          </div>

          {/* Horizontal scroll */}
          {loading ? (
            <div
              style={{
                display: "flex",
                gap: 10,
                paddingLeft: 16,
                paddingRight: 16,
                overflowX: "auto",
              }}
            >
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  style={{
                    flexShrink: 0,
                    width: 120,
                    height: 190,
                    borderRadius: 16,
                    background: "rgba(255,255,255,0.06)",
                    animation: "shimmer 1.5s infinite",
                  }}
                />
              ))}
            </div>
          ) : (
            <div
              className="hide-scrollbar"
              style={{
                display: "flex",
                gap: 10,
                paddingLeft: 16,
                paddingRight: 16,
                overflowX: "auto",
              }}
            >
              {streams.map((stream) => (
                <StreamCard
                  key={stream.id}
                  stream={stream}
                  onTap={() => navigate(`/live/${stream.id}`)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: "rgba(255,255,255,0.05)", margin: "8px 0 0" }} />
      </motion.div>
    </AnimatePresence>
  );
}
