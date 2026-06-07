/**
 * MomentsComposer.tsx — Full-screen post composer (Facebook-quality).
 *
 * Layout: position:fixed; inset:0 — fills entire screen including where the
 * bottom nav was, so no overlap is possible.
 *
 * Keyboard handling on Android/iOS:
 *   When the soft keyboard opens, the browser shrinks the visual viewport.
 *   Because this modal is `position:fixed; inset:0` the modal shrinks too.
 *   The textarea (flex-1 / overflow-y-auto) absorbs the height change.
 *   The sticky footer (Post button + counter) stays above the keyboard.
 *   The bottom nav is invisible underneath the modal (z-index layering).
 *   No layout jump. No hidden buttons. No scroll lock hacks needed.
 *
 * No backend changes — calls createTextPost(caption) exactly as before.
 */
import { useState, useRef, useEffect, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, Globe, UserCheck, Users, Lock } from "lucide-react";
import { createTextPost, type SocialPost } from "@/lib/postsClient";
import { useAppStore } from "@/lib/store";

const MAX_CHARS = 500;

/* ── Audience types (UI-only; backend always posts as Public for now) ──── */
type AudienceId = "public" | "followers" | "friends" | "only_me";

interface AudienceOption {
  id: AudienceId;
  label: string;
  sub: string;
  icon: React.ComponentType<{ style?: React.CSSProperties; className?: string }>;
}

const AUDIENCES: AudienceOption[] = [
  { id: "public",    label: "Public",    sub: "Anyone on Socia",             icon: Globe     },
  { id: "followers", label: "Followers", sub: "People who follow you",       icon: UserCheck },
  { id: "friends",   label: "Friends",   sub: "Mutual followers only",       icon: Users     },
  { id: "only_me",   label: "Only Me",   sub: "Visible only to you",         icon: Lock      },
];

interface Props {
  open: boolean;
  onClose: () => void;
  onPosted: (post: SocialPost) => void;
}

export function MomentsComposer({ open, onClose, onPosted }: Props) {
  const user = useAppStore((s) => s.user);

  const [text,         setText]         = useState("");
  const [posting,      setPosting]      = useState(false);
  const [posted,       setPosted]       = useState(false);
  const [error,        setError]        = useState("");
  const [audience,     setAudience]     = useState<AudienceId>("public");
  const [pickerOpen,   setPickerOpen]   = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  /* Reset state every time the modal opens */
  useEffect(() => {
    if (!open) return;
    setText("");
    setError("");
    setPosted(false);
    setPosting(false);
    setPickerOpen(false);
    /* Delay focus so the slide-in animation doesn't fight the keyboard */
    const t = setTimeout(() => textareaRef.current?.focus(), 180);
    return () => clearTimeout(t);
  }, [open]);

  /* Auto-grow textarea height */
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [text]);

  const remaining = MAX_CHARS - text.length;
  const nearLimit = remaining <= 80;
  const overLimit = remaining < 0;
  const canPost   = text.trim().length > 0 && !overLimit && !posting && !posted;

  const ringColor = overLimit
    ? "#f87171"
    : remaining <= 30
    ? "#fb923c"
    : "#a78bfa";

  const currentAudience = AUDIENCES.find((a) => a.id === audience) ?? AUDIENCES[0];
  const AudienceIcon = currentAudience.icon;

  /* ── Post handler ────────────────────────────────────────────────────── */
  const handlePost = useCallback(async () => {
    if (!canPost) return;
    setPosting(true);
    setError("");
    try {
      const post = await createTextPost(text.trim());
      setPosted(true);
      /* Brief success pause then close */
      setTimeout(() => {
        onPosted(post);
        onClose();
      }, 520);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to post. Try again.");
      setPosting(false);
    }
  }, [canPost, text, onPosted, onClose]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        void handlePost();
      }
    },
    [handlePost],
  );

  const handleCancel = useCallback(() => {
    if (posting) return;
    onClose();
  }, [posting, onClose]);

  /* ── Render ──────────────────────────────────────────────────────────── */
  return (
    <AnimatePresence>
      {open && (
        /**
         * Full-screen overlay — z-[80] sits above the bottom nav (z-50) and
         * every other modal layer. `inset-0` fills the screen exactly;
         * when Android keyboard opens and shrinks the viewport, this div
         * shrinks with it — keeping the footer visible above the keyboard.
         */
        <motion.div
          key="composer"
          initial={{ opacity: 0, y: 32 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 32 }}
          transition={{ duration: 0.2, ease: [0.32, 0, 0.16, 1] }}
          className="fixed inset-0 z-[80] flex flex-col"
          style={{ background: "#09090f" }}
        >

          {/* ── Header ─────────────────────────────────────────────────── */}
          <div
            className="flex items-center justify-between gap-3 px-4 flex-shrink-0"
            style={{
              paddingTop: "max(env(safe-area-inset-top, 0px), 14px)",
              paddingBottom: 14,
              borderBottom: "1px solid rgba(255,255,255,0.07)",
            }}
          >
            {/* Cancel */}
            <button
              onClick={handleCancel}
              disabled={posting}
              className="text-[14px] font-medium transition-opacity disabled:opacity-40"
              style={{ color: "rgba(255,255,255,0.5)", minWidth: 64 }}
            >
              Cancel
            </button>

            {/* Title */}
            <span className="flex-1 text-center text-[15px] font-bold text-white">
              Create Post
            </span>

            {/* Post button (header) */}
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={handlePost}
              disabled={!canPost}
              className="rounded-full px-4 py-1.5 text-[13px] font-bold text-white transition-all"
              style={{
                minWidth: 64,
                background: canPost
                  ? "linear-gradient(135deg,#a855f7,#ec4899)"
                  : "rgba(255,255,255,0.08)",
                opacity: canPost ? 1 : 0.45,
              }}
            >
              {posted ? "Posted" : posting ? "…" : "Post"}
            </motion.button>
          </div>

          {/* ── Author + Audience ───────────────────────────────────────── */}
          <div className="relative flex items-center gap-3 px-4 py-3 flex-shrink-0">
            {/* Avatar */}
            {user?.avatar ? (
              <img
                src={user.avatar}
                alt=""
                className="h-10 w-10 rounded-full object-cover flex-shrink-0"
                style={{ border: "1.5px solid rgba(255,255,255,0.1)" }}
              />
            ) : (
              <div
                className="h-10 w-10 rounded-full flex-shrink-0 grid place-items-center text-sm font-bold text-white"
                style={{
                  background:
                    "linear-gradient(135deg,rgba(168,85,247,0.8),rgba(236,72,153,0.7))",
                }}
              >
                {(user?.name || user?.handle || "?").charAt(0).toUpperCase()}
              </div>
            )}

            {/* Name + audience pill */}
            <div className="flex flex-col gap-1">
              <span className="text-[14px] font-bold text-white leading-none">
                {user?.name || user?.handle || "You"}
              </span>

              {/* Audience selector pill */}
              <button
                onClick={() => setPickerOpen((v) => !v)}
                className="flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold transition-opacity"
                style={{
                  background: "rgba(168,85,247,0.14)",
                  border: "1px solid rgba(168,85,247,0.28)",
                  color: "#c084fc",
                  width: "fit-content",
                }}
              >
                <AudienceIcon style={{ width: 10, height: 10 }} />
                <span>{currentAudience.label}</span>
                <motion.span
                  animate={{ rotate: pickerOpen ? 180 : 0 }}
                  transition={{ duration: 0.15 }}
                  style={{ display: "flex" }}
                >
                  <ChevronDown style={{ width: 10, height: 10 }} />
                </motion.span>
              </button>
            </div>

            {/* ── Audience dropdown ──────────────────────────────────────── */}
            <AnimatePresence>
              {pickerOpen && (
                <>
                  <div
                    className="fixed inset-0 z-[85]"
                    onClick={() => setPickerOpen(false)}
                  />
                  <motion.div
                    initial={{ opacity: 0, y: -6, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -6, scale: 0.97 }}
                    transition={{ duration: 0.14 }}
                    className="absolute left-16 top-[52px] z-[90] w-64 rounded-2xl overflow-hidden shadow-2xl"
                    style={{
                      background: "rgba(16,12,28,0.98)",
                      border: "1px solid rgba(168,85,247,0.22)",
                    }}
                  >
                    {AUDIENCES.map((opt, i) => {
                      const Icon = opt.icon;
                      const active = audience === opt.id;
                      return (
                        <button
                          key={opt.id}
                          onClick={() => {
                            setAudience(opt.id);
                            setPickerOpen(false);
                          }}
                          className="flex items-center gap-3 w-full px-4 py-3 text-left"
                          style={{
                            background: active
                              ? "rgba(168,85,247,0.1)"
                              : "transparent",
                            borderBottom:
                              i < AUDIENCES.length - 1
                                ? "1px solid rgba(255,255,255,0.04)"
                                : "none",
                          }}
                        >
                          <div
                            className="grid h-9 w-9 place-items-center rounded-full flex-shrink-0"
                            style={{
                              background: active
                                ? "linear-gradient(135deg,rgba(168,85,247,0.25),rgba(236,72,153,0.15))"
                                : "rgba(255,255,255,0.06)",
                            }}
                          >
                            <Icon
                              style={{
                                width: 16,
                                height: 16,
                                color: active ? "#c084fc" : "rgba(255,255,255,0.4)",
                              }}
                            />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p
                              className="text-[13px] font-semibold leading-tight"
                              style={{
                                color: active ? "#c084fc" : "rgba(255,255,255,0.85)",
                              }}
                            >
                              {opt.label}
                            </p>
                            <p
                              className="text-[11px] mt-0.5 leading-tight"
                              style={{ color: "rgba(255,255,255,0.32)" }}
                            >
                              {opt.sub}
                            </p>
                          </div>
                          {active && (
                            <div
                              className="h-2 w-2 rounded-full flex-shrink-0"
                              style={{
                                background:
                                  "linear-gradient(135deg,#a855f7,#ec4899)",
                              }}
                            />
                          )}
                        </button>
                      );
                    })}
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>

          {/* Thin divider */}
          <div
            className="mx-4 flex-shrink-0"
            style={{ height: 1, background: "rgba(255,255,255,0.04)" }}
          />

          {/* ── Scrollable compose area ─────────────────────────────────── */}
          {/*
            flex-1 + overflow-y-auto: absorbs the viewport height reduction
            when the keyboard opens. The textarea grows with content via
            the auto-height effect above, and the area scrolls if needed.
          */}
          <div className="flex-1 overflow-y-auto">
            <div className="px-4 pt-4 pb-2">
              <textarea
                ref={textareaRef}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="What's on your mind?"
                disabled={posting || posted}
                rows={1}
                className="w-full resize-none bg-transparent text-[17px] leading-[1.6] text-white placeholder:text-white/20 focus:outline-none disabled:opacity-55"
                style={{ minHeight: 120 }}
              />
            </div>
          </div>

          {/* ── Error message ───────────────────────────────────────────── */}
          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="px-4 flex-shrink-0"
              >
                <p
                  className="text-[12px] py-2 px-3 rounded-xl"
                  style={{
                    color: "#fca5a5",
                    background: "rgba(239,68,68,0.1)",
                    border: "1px solid rgba(239,68,68,0.2)",
                  }}
                >
                  {error}
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Footer — always visible above keyboard ──────────────────── */}
          {/*
            flex-shrink-0 prevents this from collapsing when keyboard opens.
            paddingBottom uses safe-area-inset-bottom for iPhone notch.
            On Android, `bottom: 0` of the shrunk viewport = just above keyboard.
          */}
          <div
            className="flex items-center justify-between px-4 flex-shrink-0"
            style={{
              paddingTop: 12,
              paddingBottom: "max(env(safe-area-inset-bottom, 0px), 16px)",
              borderTop: "1px solid rgba(255,255,255,0.06)",
              background: "rgba(9,9,15,0.95)",
            }}
          >
            {/* Character progress ring + counter */}
            <div className="flex items-center gap-2">
              {nearLimit && (
                <motion.span
                  initial={{ opacity: 0, scale: 0.7 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="text-[13px] font-semibold tabular-nums"
                  style={{ color: ringColor }}
                >
                  {remaining}
                </motion.span>
              )}
              <svg
                width="22"
                height="22"
                viewBox="0 0 22 22"
                style={{ transform: "rotate(-90deg)", flexShrink: 0 }}
              >
                <circle
                  cx="11" cy="11" r="9"
                  fill="none"
                  stroke="rgba(255,255,255,0.08)"
                  strokeWidth="2.5"
                />
                <circle
                  cx="11" cy="11" r="9"
                  fill="none"
                  stroke={ringColor}
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeDasharray={`${2 * Math.PI * 9}`}
                  strokeDashoffset={`${
                    2 * Math.PI * 9 * Math.max(0, remaining / MAX_CHARS)
                  }`}
                  style={{ transition: "stroke-dashoffset 0.18s, stroke 0.18s" }}
                />
              </svg>
              {!nearLimit && (
                <span
                  className="text-[11px]"
                  style={{ color: "rgba(255,255,255,0.2)" }}
                >
                  {MAX_CHARS} max
                </span>
              )}
            </div>

            {/* Post button */}
            <motion.button
              whileTap={{ scale: 0.94 }}
              onClick={handlePost}
              disabled={!canPost}
              className="rounded-full px-6 py-2.5 text-[14px] font-bold text-white transition-all"
              style={{
                background: canPost
                  ? "linear-gradient(135deg,#a855f7,#ec4899,#3b82f6)"
                  : "rgba(255,255,255,0.07)",
                opacity: canPost ? 1 : 0.4,
                minWidth: 80,
              }}
            >
              {posted ? (
                <span style={{ color: "#86efac" }}>Posted</span>
              ) : posting ? (
                <span className="flex items-center justify-center gap-2">
                  <span
                    className="inline-block h-4 w-4 animate-spin rounded-full border-2"
                    style={{
                      borderColor: "rgba(255,255,255,0.25)",
                      borderTopColor: "white",
                    }}
                  />
                  Posting
                </span>
              ) : (
                "Post"
              )}
            </motion.button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
