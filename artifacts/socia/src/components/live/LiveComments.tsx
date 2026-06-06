/**
 * LiveComments.tsx — Realtime comment overlay for live streams.
 * Newest comments appear at bottom; older ones scroll up and fade.
 */
import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send } from "lucide-react";

export interface LiveComment {
  id:         string;
  content:    string;
  is_muted:   boolean;
  created_at: string;
  user: {
    id:          string;
    name:        string;
    username:    string;
    avatar_url:  string | null;
    is_verified:         boolean;
    subscription_status: string;
  };
}

/* ── Single comment row ───────────────────────────────────────────────────── */
function CommentRow({ comment }: { comment: LiveComment }) {
  if (comment.is_muted) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.22, ease: "easeOut" }}
      style={{ display: "flex", alignItems: "flex-start", gap: 8, paddingBottom: 6 }}
    >
      {/* Avatar */}
      <div
        style={{
          width: 26, height: 26,
          borderRadius: "50%",
          background: "linear-gradient(135deg, #a855f7, #ec4899)",
          flexShrink: 0,
          overflow: "hidden",
        }}
      >
        {comment.user.avatar_url ? (
          <img
            src={comment.user.avatar_url}
            alt={comment.user.name}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
          <div style={{ width: "100%", height: "100%", display: "grid", placeItems: "center" }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: "white" }}>
              {comment.user.name.charAt(0).toUpperCase()}
            </span>
          </div>
        )}
      </div>

      {/* Bubble */}
      <div
        style={{
          background: "rgba(0,0,0,0.55)",
          backdropFilter: "blur(8px)",
          borderRadius: 14,
          padding: "5px 10px",
          maxWidth: "calc(100% - 42px)",
        }}
      >
        <span style={{ fontSize: 11, fontWeight: 700, color: "#e879f9", marginRight: 4 }}>
          {comment.user.username}
          {(comment.user.is_verified &&
            (comment.user.subscription_status === "active" ||
             comment.user.subscription_status === "owner")) && (
            <span style={{ marginLeft: 3, color: "#60a5fa" }}>✓</span>
          )}
        </span>
        <span style={{ fontSize: 13, color: "rgba(255,255,255,0.92)", wordBreak: "break-word" }}>
          {comment.content}
        </span>
      </div>
    </motion.div>
  );
}

/* ── LiveComments — full overlay ─────────────────────────────────────────── */
export function LiveComments({
  comments,
  onSend,
  disabled = false,
}: {
  comments: LiveComment[];
  onSend:   (text: string) => Promise<void>;
  disabled?: boolean;
}) {
  const [text, setText]       = useState("");
  const [sending, setSending] = useState(false);
  const listRef               = useRef<HTMLDivElement>(null);
  const inputRef              = useRef<HTMLInputElement>(null);

  // Auto-scroll to latest comment
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [comments]);

  async function handleSend() {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setSending(true);
    setText("");
    try {
      await onSend(trimmed);
    } catch {
      setText(trimmed); // restore on error
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div
      style={{
        position: "absolute",
        bottom: 80,
        left: 0,
        right: 72,
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-end",
        pointerEvents: "none",
      }}
    >
      {/* Comment list (max 8 visible, scrollable) */}
      <div
        ref={listRef}
        style={{
          maxHeight: 220,
          overflowY: "auto",
          paddingLeft: 12,
          paddingRight: 12,
          scrollbarWidth: "none",
          pointerEvents: "auto",
        }}
      >
        <AnimatePresence initial={false}>
          {comments.slice(-30).map((c) => (
            <CommentRow key={c.id} comment={c} />
          ))}
        </AnimatePresence>
      </div>

      {/* Comment input */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          paddingLeft: 12,
          paddingRight: 12,
          paddingTop: 8,
          pointerEvents: "auto",
        }}
      >
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            background: "rgba(0,0,0,0.55)",
            backdropFilter: "blur(10px)",
            borderRadius: 22,
            border: "1px solid rgba(255,255,255,0.14)",
            padding: "8px 14px",
            gap: 8,
          }}
        >
          <input
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={disabled ? "Stream ended" : "Say something…"}
            disabled={disabled || sending}
            maxLength={300}
            style={{
              flex: 1,
              background: "transparent",
              border: "none",
              outline: "none",
              color: "rgba(255,255,255,0.92)",
              fontSize: 14,
              caretColor: "#a855f7",
            }}
          />
          <motion.button
            whileTap={{ scale: 0.8 }}
            onClick={handleSend}
            disabled={!text.trim() || sending || disabled}
            style={{
              width: 28,
              height: 28,
              borderRadius: "50%",
              background: text.trim() && !disabled
                ? "linear-gradient(135deg,#a855f7,#ec4899)"
                : "transparent",
              display: "grid",
              placeItems: "center",
              flexShrink: 0,
              transition: "background 0.18s ease",
              cursor: text.trim() && !disabled ? "pointer" : "default",
            }}
            aria-label="Send"
          >
            <Send style={{ width: 14, height: 14, color: text.trim() && !disabled ? "white" : "rgba(255,255,255,0.3)" }} />
          </motion.button>
        </div>
      </div>
    </div>
  );
}
