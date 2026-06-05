/**
 * VideoPostPlayer.tsx — Inline video for the social feed.
 *
 * Features:
 * - Autoplay when ≥ 50% visible (IntersectionObserver)
 * - Pause when scrolled offscreen
 * - Muted by default, tap to unmute
 * - Loop playback
 * - Fullscreen on demand
 * - Never crashes — all errors are silent (shows poster fallback)
 */
import { useRef, useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Volume2, VolumeX, Maximize2, Play, Pause } from "lucide-react";

interface Props {
  url: string;
  posterUrl?: string;
  aspectRatio?: string;
  autoplayThreshold?: number;
}

export function VideoPostPlayer({
  url,
  posterUrl,
  aspectRatio = "4/5",
  autoplayThreshold = 0.5,
}: Props) {
  const videoRef    = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [playing,  setPlaying]  = useState(false);
  const [muted,    setMuted]    = useState(true);
  const [started,  setStarted]  = useState(false);
  const [errored,  setErrored]  = useState(false);

  /* ── IntersectionObserver — autoplay when visible ─────────────────── */
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        const video = videoRef.current;
        if (!video || errored) return;

        if (entry.isIntersecting && entry.intersectionRatio >= autoplayThreshold) {
          video.muted = true; setMuted(true);
          video.play().then(() => { setPlaying(true); setStarted(true); }).catch(() => {});
        } else {
          video.pause();
          setPlaying(false);
        }
      },
      { threshold: autoplayThreshold },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [autoplayThreshold, errored]);

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (playing) {
      video.pause(); setPlaying(false);
    } else {
      video.play().then(() => setPlaying(true)).catch(() => {});
      setStarted(true);
    }
  }, [playing]);

  const toggleMute = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setMuted(video.muted);
  }, []);

  const openFullscreen = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const video = videoRef.current;
    if (!video) return;
    if ((video as any).webkitEnterFullscreen) {
      (video as any).webkitEnterFullscreen();
    } else if (video.requestFullscreen) {
      video.requestFullscreen().catch(() => {});
    }
  }, []);

  if (errored && posterUrl) {
    return (
      <div className="relative w-full overflow-hidden bg-black/90" style={{ aspectRatio }}>
        <img src={posterUrl} alt="" className="h-full w-full object-cover" />
        <div className="absolute inset-0 flex items-center justify-center bg-black/40">
          <span className="text-xs text-white/60">Video unavailable</span>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="relative w-full overflow-hidden bg-black"
      style={{ aspectRatio }}
      onClick={togglePlay}
    >
      <video
        ref={videoRef}
        src={url}
        poster={posterUrl}
        loop
        muted
        playsInline
        preload="metadata"
        onError={() => setErrored(true)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        className="h-full w-full object-cover"
        style={{ display: "block" }}
      />

      {/* Play/pause tap overlay */}
      <AnimatePresence>
        {!playing && (
          <motion.div
            key="play"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.15 }}
            className="pointer-events-none absolute inset-0 flex items-center justify-center"
          >
            <div className="grid h-14 w-14 place-items-center rounded-full bg-black/50 backdrop-blur-sm">
              {started ? (
                <Pause className="h-6 w-6 text-white" />
              ) : (
                <Play className="h-6 w-6 fill-white text-white" />
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Controls — bottom-right */}
      <div
        className="absolute bottom-3 right-3 flex gap-2"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={toggleMute}
          className="grid h-8 w-8 place-items-center rounded-full bg-black/60 backdrop-blur-sm"
        >
          {muted ? (
            <VolumeX className="h-3.5 w-3.5 text-white" />
          ) : (
            <Volume2 className="h-3.5 w-3.5 text-white" />
          )}
        </button>
        <button
          onClick={openFullscreen}
          className="grid h-8 w-8 place-items-center rounded-full bg-black/60 backdrop-blur-sm"
        >
          <Maximize2 className="h-3.5 w-3.5 text-white" />
        </button>
      </div>
    </div>
  );
}
