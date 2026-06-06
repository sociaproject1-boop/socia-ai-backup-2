/**
 * MomentsComposer.tsx — Bottom-sheet text post composer for the Moments tab.
 * Owner-only. Creates a text-only post using the existing POST /api/posts endpoint.
 * No new APIs, no new DB tables.
 */
import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Feather, Send } from "lucide-react";
import { createTextPost, type SocialPost } from "@/lib/postsClient";

const MAX_CHARS = 500;

interface Props {
  open: boolean;
  onClose: () => void;
  onPosted: (post: SocialPost) => void;
}

export function MomentsComposer({ open, onClose, onPosted }: Props) {
  const [text, setText]       = useState("");
  const [posting, setPosting] = useState(false);
  const [error, setError]     = useState("");
  const textareaRef           = useRef<HTMLTextAreaElement>(null);

  /* Auto-focus textarea when sheet opens */
  useEffect(() => {
    if (open) {
      setTimeout(() => textareaRef.current?.focus(), 120);
      setText("");
      setError("");
    }
  }, [open]);

  /* Auto-grow textarea */
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
  }, [text]);

  const canPost   = text.trim().length > 0 && text.length <= MAX_CHARS && !posting;
  const remaining = MAX_CHARS - text.length;
  const nearLimit = remaining <= 80;
  const overLimit = remaining < 0;

  async function handlePost() {
    if (!canPost) return;
    setPosting(true);
    setError("");
    try {
      const post = await createTextPost(text.trim());
      onPosted(post);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to post. Please try again.");
      setPosting(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handlePost();
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 z-40"
            style={{ background: "rgba(0,0,0,0.65)", backdropFilter: "blur(6px)" }}
          />

          {/* Bottom sheet */}
          <motion.div
            key="sheet"
            initial={{ y: "100%", opacity: 0.6 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: "100%", opacity: 0 }}
            transition={{ type: "spring", stiffness: 380, damping: 38, mass: 0.9 }}
            className="fixed bottom-0 left-0 right-0 z-50 rounded-t-[28px] overflow-hidden"
            style={{
              background: "linear-gradient(160deg,#0d0b1e 0%,#0a0c1a 100%)",
              border:     "1px solid rgba(168,85,247,0.18)",
              borderBottom: "none",
              paddingBottom: "env(safe-area-inset-bottom,16px)",
              maxWidth: 520,
              margin: "0 auto",
            }}
          >
            {/* Drag pill */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="h-1 w-10 rounded-full" style={{ background: "rgba(255,255,255,0.15)" }} />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3">
              <div className="flex items-center gap-2">
                <div
                  className="grid h-7 w-7 place-items-center rounded-[10px]"
                  style={{ background: "linear-gradient(135deg,rgba(168,85,247,0.25),rgba(236,72,153,0.15))", border: "1px solid rgba(168,85,247,0.3)" }}
                >
                  <Feather className="h-3.5 w-3.5 text-purple-400" />
                </div>
                <span className="text-[14px] font-bold text-white">Write a Moment</span>
              </div>
              <motion.button
                whileTap={{ scale: 0.88 }}
                onClick={onClose}
                disabled={posting}
                className="grid h-8 w-8 place-items-center rounded-full"
                style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}
              >
                <X className="h-4 w-4 text-white/60" />
              </motion.button>
            </div>

            {/* Divider */}
            <div style={{ height: 1, background: "rgba(255,255,255,0.05)", margin: "0 20px" }} />

            {/* Textarea */}
            <div className="px-5 pt-4 pb-2">
              <textarea
                ref={textareaRef}
                value={text}
                onChange={e => setText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="What's on your mind…"
                rows={4}
                disabled={posting}
                className="w-full resize-none bg-transparent text-[15px] leading-relaxed text-white placeholder:text-white/25 focus:outline-none disabled:opacity-50"
                style={{ minHeight: 100, maxHeight: 220 }}
              />
            </div>

            {/* Error */}
            <AnimatePresence>
              {error && (
                <motion.p
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="px-5 pb-2 text-[11.5px] text-red-400"
                >
                  {error}
                </motion.p>
              )}
            </AnimatePresence>

            {/* Footer — character count + post button */}
            <div className="flex items-center justify-between px-5 pb-5 pt-2">
              {/* Character counter */}
              <div className="flex items-center gap-2">
                {nearLimit && (
                  <motion.span
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="text-[12px] font-semibold tabular-nums"
                    style={{ color: overLimit ? "#f87171" : remaining <= 30 ? "#fb923c" : "#a78bfa" }}
                  >
                    {remaining}
                  </motion.span>
                )}

                {/* Thin arc progress ring */}
                <svg width="20" height="20" viewBox="0 0 20 20" className="-rotate-90">
                  <circle cx="10" cy="10" r="8" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="2" />
                  <circle
                    cx="10" cy="10" r="8" fill="none"
                    stroke={overLimit ? "#f87171" : remaining <= 30 ? "#fb923c" : "#a78bfa"}
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeDasharray={`${2 * Math.PI * 8}`}
                    strokeDashoffset={`${2 * Math.PI * 8 * Math.max(0, remaining / MAX_CHARS)}`}
                    style={{ transition: "stroke-dashoffset 0.2s, stroke 0.2s" }}
                  />
                </svg>

                {!nearLimit && (
                  <span className="text-[11px] text-white/25">{MAX_CHARS} chars max</span>
                )}
              </div>

              {/* Post button */}
              <motion.button
                whileTap={{ scale: 0.93 }}
                onClick={handlePost}
                disabled={!canPost}
                className="flex items-center gap-2 rounded-full px-5 py-2.5 text-[13px] font-bold text-white transition-opacity disabled:opacity-35"
                style={{ background: "linear-gradient(135deg,#a855f7,#ec4899,#3b82f6)" }}
              >
                {posting ? (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                ) : (
                  <Send className="h-3.5 w-3.5" />
                )}
                {posting ? "Posting…" : "Post Moment"}
              </motion.button>
            </div>

            {/* Keyboard tip */}
            <p className="pb-3 text-center text-[10px] text-white/20">
              ⌘ + Enter to post
            </p>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
