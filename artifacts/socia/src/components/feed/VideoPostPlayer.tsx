/**
 * VideoPostPlayer.tsx — Inline video for the social feed.
 *
 * - No download / PiP / playback rate controls
 * - Autoplay UNMUTED when ≥ 40% visible (browser may still force muted on first load)
 * - Muted fallback if browser blocks unmuted autoplay
 * - Tap to toggle play/pause
 * - Loop playback
 * - Zero browser chrome
 */
import { useRef, useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Play } from "lucide-react";
import type { PostSound } from "@/lib/postsClient";

interface Props {
  url: string;
  posterUrl?: string;
  aspectRatio?: string;
  autoplayThreshold?: number;
  sound?: PostSound | null;
}

export function VideoPostPlayer({
  url,
  posterUrl,
  aspectRatio = "4/5",
  autoplayThreshold = 0.4,
  sound,
}: Props) {
  const videoRef     = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);
  const [started, setStarted] = useState(false);
  const [errored, setErrored] = useState(false);

  /* ── IntersectionObserver — autoplay unmuted, muted fallback ─────────── */
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        const video = videoRef.current;
        if (!video || errored) return;

        if (entry.isIntersecting && entry.intersectionRatio >= autoplayThreshold) {
          video.muted = false;
          video.play()
            .then(() => { setPlaying(true); setStarted(true); })
            .catch(() => {
              /* Browser blocked unmuted — fall back to muted */
              video.muted = true;
              video.play()
                .then(() => { setPlaying(true); setStarted(true); })
                .catch(() => {});
            });
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
      video.pause();
      setPlaying(false);
    } else {
      video.muted = false;
      video.play()
        .then(() => setPlaying(true))
        .catch(() => {
          video.muted = true;
          video.play().then(() => setPlaying(true)).catch(() => {});
        });
      setStarted(true);
    }
  }, [playing]);

  if (errored && posterUrl) {
    return (
      <div className="relative w-full overflow-hidden bg-black/90" style={{ aspectRatio, border: "1.5px solid rgba(255,255,255,0.06)", borderRadius: 16 }}>
        <img src={posterUrl} alt="" className="h-full w-full object-contain" />
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
      style={{ aspectRatio, border: "1.5px solid rgba(255,255,255,0.06)", borderRadius: 16 }}
      onClick={togglePlay}
    >
      <video
        ref={videoRef}
        src={url}
        className="h-full w-full object-contain"
        playsInline
        loop
        onError={() => setErrored(true)}
        preload="metadata"
      />

      {!started && posterUrl && (
        <img src={posterUrl} alt="" className="absolute inset-0 h-full w-full object-contain" />
      )}

      {!playing && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="grid h-12 w-12 place-items-center rounded-full bg-black/40">
            <Play className="h-6 w-6 text-white" />
          </div>
        </div>
      )}

    </div>
  );
}
