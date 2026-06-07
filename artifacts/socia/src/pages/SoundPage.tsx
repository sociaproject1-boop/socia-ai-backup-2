/**
 * SoundPage.tsx — TikTok-style Sound detail page.
 *
 * Route: /sounds/:id
 *
 * Shows:
 *  • Blurred cover art header
 *  • Sound title + creator
 *  • Usage count
 *  • Use Sound button → /upload?sound=:id
 *  • Grid of videos using this sound (3-col, infinite scroll)
 */
import { useEffect, useState, useRef, useCallback } from "react";
import { useRoute, useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, Music2, Play, Users, ChevronRight,
} from "lucide-react";
import { fetchSound, fetchSoundVideos, formatDuration } from "@/lib/soundsClient";
import type { Sound } from "@/lib/soundsClient";
import { useAppStore } from "@/lib/store";

function useDiscSpin(playing: boolean) {
  return {
    animationName:           "discSpin",
    animationDuration:       "3s",
    animationTimingFunction: "linear",
    animationIterationCount: "infinite",
    animationPlayState:      playing ? "running" : "paused",
  } as React.CSSProperties;
}

function VideoTile({ post, onClick }: { post: any; onClick: () => void }) {
  const thumb = (post.media ?? [])[0];
  return (
    <div
      className="relative aspect-[9/16] overflow-hidden cursor-pointer rounded-xl bg-black/30"
      onClick={onClick}
      style={{ background: "#111" }}
    >
      {thumb?.type === "video" ? (
        <video
          src={thumb.url}
          className="w-full h-full object-cover"
          playsInline
          muted
          preload="metadata"
          disablePictureInPicture
          controlsList="nodownload noplaybackrate nofullscreen"
          onContextMenu={(e) => e.preventDefault()}
        />
      ) : thumb?.url ? (
        <img src={thumb.url} alt="" className="w-full h-full object-cover" draggable={false} />
      ) : (
        <div className="w-full h-full flex items-center justify-center">
          <Play className="h-6 w-6 text-white/30" />
        </div>
      )}
      {/* View count overlay */}
      <div className="absolute bottom-1.5 left-1.5 flex items-center gap-0.5 text-[10px] font-semibold text-white drop-shadow">
        <Play className="h-2.5 w-2.5 fill-white text-white" />
        {post.view_count > 0 && (
          <span>{post.view_count >= 1000 ? `${(post.view_count / 1000).toFixed(1)}k` : post.view_count}</span>
        )}
      </div>
    </div>
  );
}

export default function SoundPage() {
  const [, params]   = useRoute<{ id: string }>("/sounds/:id");
  const [, navigate] = useLocation();
  const me           = useAppStore((s) => s.user);
  const soundId      = params?.id ?? "";

  const [sound,   setSound]   = useState<Sound | null>(null);
  const [posts,   setPosts]   = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore,  setHasMore]  = useState(true);
  const [playing,  setPlaying]  = useState(false);
  const [error,    setError]    = useState<string | null>(null);

  const audioRef   = useRef<HTMLAudioElement | null>(null);
  const offsetRef  = useRef(0);

  /* ── Load sound ─────────────────────────────────────────────────────── */
  useEffect(() => {
    if (!soundId) return;
    setLoading(true);
    setError(null);

    Promise.all([
      fetchSound(soundId),
      fetchSoundVideos(soundId, { limit: 21 }),
    ])
      .then(([s, v]) => {
        setSound(s);
        setPosts(v.posts);
        setHasMore(v.has_more);
        offsetRef.current = v.posts.length;
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [soundId]);

  /* ── Load more videos ───────────────────────────────────────────────── */
  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore || !soundId) return;
    setLoadingMore(true);
    try {
      const v = await fetchSoundVideos(soundId, { limit: 21, offset: offsetRef.current });
      setPosts((prev) => [...prev, ...v.posts]);
      setHasMore(v.has_more);
      offsetRef.current += v.posts.length;
    } catch { /* ignore */ }
    finally { setLoadingMore(false); }
  }, [loadingMore, hasMore, soundId]);

  /* ── Infinite scroll ────────────────────────────────────────────────── */
  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) loadMore(); }, { threshold: 0.1 });
    obs.observe(el);
    return () => obs.disconnect();
  }, [loadMore]);

  /* ── Audio preview ──────────────────────────────────────────────────── */
  const togglePlay = useCallback(() => {
    if (!sound?.audio_url) return;
    if (!audioRef.current) {
      audioRef.current = new Audio(sound.audio_url);
      audioRef.current.loop = true;
      audioRef.current.onended = () => setPlaying(false);
    }
    if (playing) {
      audioRef.current.pause();
      setPlaying(false);
    } else {
      audioRef.current.play().then(() => setPlaying(true)).catch(() => {});
    }
  }, [sound, playing]);

  useEffect(() => () => { audioRef.current?.pause(); }, []);

  if (loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center" style={{ background: "#0a0a0a" }}>
        <div className="h-8 w-8 rounded-full border-2 border-purple-500/30 border-t-purple-500 animate-spin" />
      </div>
    );
  }

  if (error || !sound) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center gap-4 p-8" style={{ background: "#0a0a0a" }}>
        <Music2 className="h-12 w-12 text-white/20" />
        <p className="text-white/50 text-center">{error ?? "Sound not found"}</p>
        <button onClick={() => navigate(-1 as any)} className="text-purple-400 text-sm">Go back</button>
      </div>
    );
  }

  return (
    <div className="min-h-dvh flex flex-col" style={{ background: "#0a0a0a", paddingTop: "env(safe-area-inset-top)" }}>
      {/* ── Hero header ─────────────────────────────────────────────── */}
      <div className="relative overflow-hidden" style={{ minHeight: 260 }}>
        {/* Blurred background */}
        {sound.cover_image && (
          <img
            src={sound.cover_image}
            className="absolute inset-0 w-full h-full object-cover"
            style={{ filter: "blur(24px) saturate(1.4) brightness(0.45)", transform: "scale(1.1)" }}
            alt=""
            draggable={false}
          />
        )}
        {!sound.cover_image && (
          <div
            className="absolute inset-0"
            style={{ background: "linear-gradient(135deg,#240046,#7b2d8b 50%,#ff006e)" }}
          />
        )}
        <div className="absolute inset-0" style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0.2), rgba(10,10,10,1))" }} />

        {/* Back button */}
        <button
          onClick={() => navigate(-1 as any)}
          className="absolute top-4 left-4 grid h-9 w-9 place-items-center rounded-full z-10"
          style={{ background: "rgba(0,0,0,0.45)", backdropFilter: "blur(8px)" }}
        >
          <ArrowLeft className="h-5 w-5 text-white" />
        </button>

        {/* Cover + metadata */}
        <div className="relative z-10 flex flex-col items-center pt-12 pb-6 px-4">
          {/* Disc */}
          <div
            className="rounded-full overflow-hidden mb-4 shadow-2xl"
            style={{
              width: 100, height: 100,
              border: "3px solid rgba(255,255,255,0.15)",
              ...useDiscSpin(playing),
            }}
          >
            {sound.cover_image ? (
              <img src={sound.cover_image} alt={sound.title} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full" style={{ background: "linear-gradient(135deg,#8338ec,#ff006e)" }} />
            )}
            <div
              className="absolute rounded-full bg-black"
              style={{ width: 20, height: 20, top: "50%", left: "50%", transform: "translate(-50%,-50%)", border: "1.5px solid rgba(255,255,255,0.2)" }}
            />
          </div>

          {/* Title */}
          <h1 className="text-lg font-bold text-white text-center mb-0.5 px-6 line-clamp-2">
            {sound.title}
          </h1>

          {/* Creator */}
          <p className="text-sm text-white/55 text-center mb-0.5">
            {sound.creator?.name ?? sound.creator?.username ?? "Socia Original"}
          </p>

          {/* Duration */}
          {sound.duration_seconds && (
            <p className="text-xs text-white/35 mb-3">{formatDuration(sound.duration_seconds)}</p>
          )}

          {/* Stats + play */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-white/50 text-xs">
              <Users className="h-3.5 w-3.5" />
              <span>{sound.usage_count.toLocaleString()} videos</span>
            </div>
            {sound.audio_url && (
              <button
                onClick={togglePlay}
                className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-white"
                style={{ background: playing ? "rgba(131,56,236,0.4)" : "rgba(255,255,255,0.12)" }}
              >
                {playing ? "⏸ Pause" : "▶ Preview"}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Use Sound CTA ────────────────────────────────────────────── */}
      <div className="px-4 pb-4 -mt-2 relative z-10">
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={() => navigate(`/upload?sound=${sound.id}`)}
          className="w-full py-3.5 rounded-2xl text-[15px] font-bold text-white flex items-center justify-center gap-2"
          style={{ background: "linear-gradient(135deg,#8338ec,#ff006e)" }}
        >
          <Music2 className="h-4.5 w-4.5" />
          Use This Sound
          <ChevronRight className="h-4 w-4 ml-auto opacity-60" />
        </motion.button>
      </div>

      {/* ── Videos grid ─────────────────────────────────────────────── */}
      <div className="flex-1 px-4 pb-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-white/80">
            Videos using this sound
          </h2>
          <span className="text-xs text-white/35">{sound.usage_count.toLocaleString()} videos</span>
        </div>

        {posts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Music2 className="h-10 w-10 text-white/15" />
            <p className="text-white/30 text-sm text-center">
              No videos yet — be the first to use this sound!
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-1.5">
            {posts.map((post) => (
              <VideoTile
                key={post.id}
                post={post}
                onClick={() => navigate(`/post/${post.id}`)}
              />
            ))}
          </div>
        )}

        {/* Infinite scroll sentinel */}
        <div ref={sentinelRef} className="h-4" />
        {loadingMore && (
          <div className="flex justify-center py-4">
            <div className="h-5 w-5 rounded-full border-2 border-purple-500/30 border-t-purple-500 animate-spin" />
          </div>
        )}
      </div>
    </div>
  );
}
