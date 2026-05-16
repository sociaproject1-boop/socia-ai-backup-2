import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";

interface Props {
  videoUrl: string;
  posterUrl?: string;
  open: boolean;
  onClose: () => void;
}

export function VideoPlayerModal({ videoUrl, posterUrl, open, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (open) {
      el.load();
      el.play().catch(() => {});
    } else {
      el.pause();
      el.currentTime = 0;
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[100] flex items-center justify-center"
          style={{ background: "#000" }}
          onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute right-4 z-10 grid h-10 w-10 place-items-center rounded-full text-white"
            style={{
              top: `calc(env(safe-area-inset-top, 0px) + 14px)`,
              background: "#0a0a0a",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            <X className="h-5 w-5" />
          </button>

          {/* 9:16 video container — fills height, crops width */}
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.92, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="relative h-full w-full flex items-center justify-center"
          >
            <div
              className="relative overflow-hidden"
              style={{
                /* 9:16 aspect: height = container height, width = 9/16 of that */
                height: "100%",
                maxHeight: "100dvh",
                aspectRatio: "9/16",
                maxWidth: "100%",
              }}
            >
              <video
                ref={videoRef}
                key={videoUrl}
                src={videoUrl}
                poster={posterUrl}
                preload="auto"
                controls
                autoPlay
                playsInline
                loop
                className="absolute inset-0 h-full w-full"
                style={{ objectFit: "cover" }}
                onError={(e) => console.error("[Socia] Video error:", e)}
              />
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
