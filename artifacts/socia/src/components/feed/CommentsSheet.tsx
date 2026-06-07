/**
 * CommentsSheet.tsx — TikTok-style comments bottom sheet.
 *
 * Features:
 * - Slides up from bottom, occupies ~80% screen height
 * - Drag handle + swipe-down to close
 * - Realtime new comments via Supabase postgres_changes
 * - Top-level comments + inline reply threads
 * - Does NOT unmount or reload the feed behind it
 */
import { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence, useDragControls, useMotionValue, useTransform } from "framer-motion";
import { X, Send, CornerDownRight, Heart } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAppStore } from "@/lib/store";
import { fetchComments, addComment, type Comment } from "@/lib/postsClient";

interface Props {
  postId: string;
  initialCount: number;
  onClose: () => void;
  onCountChange?: (delta: number) => void;
}

function relTime(iso: string): string {
  const d = Date.now() - new Date(iso).getTime();
  if (d < 60_000)    return "now";
  if (d < 3_600_000) return `${Math.floor(d / 60_000)}m`;
  if (d < 86_400_000) return `${Math.floor(d / 3_600_000)}h`;
  return `${Math.floor(d / 86_400_000)}d`;
}

function Avatar({ url, name, size = 32 }: { url?: string | null; name?: string | null; size?: number }) {
  const letter = (name || "?").charAt(0).toUpperCase();
  if (url) {
    return (
      <img
        src={url} alt=""
        style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }}
      />
    );
  }
  return (
    <div
      style={{
        width: size, height: size, borderRadius: "50%", flexShrink: 0,
        display: "grid", placeItems: "center", fontSize: size * 0.38, fontWeight: 700, color: "#fff",
        background: "linear-gradient(135deg,var(--accent-primary),var(--accent-secondary))",
      }}
    >
      {letter}
    </div>
  );
}

interface CommentRowProps {
  comment: Comment;
  postId: string;
  me: { id: string } | null;
  onReplyClick: (c: Comment) => void;
  onNewReply: (parentId: string, reply: Comment) => void;
}

function CommentRow({ comment, postId, me, onReplyClick, onNewReply }: CommentRowProps) {
  const [replies, setReplies] = useState<Comment[]>([]);
  const [showReplies, setShowReplies] = useState(false);
  const [loadingReplies, setLoadingReplies] = useState(false);
  const [replyCount, setReplyCount] = useState(0);

  /* Count replies via Supabase realtime channel */
  useEffect(() => {
    void supabase
      .from("comments")
      .select("id", { count: "exact", head: true })
      .eq("parent_comment_id", comment.id)
      .then(({ count }) => setReplyCount(count ?? 0));

    const ch = supabase
      .channel(`replies-count-${comment.id}`)
      .on("postgres_changes", {
        event: "*", schema: "public", table: "comments",
        filter: `parent_comment_id=eq.${comment.id}`,
      }, () => {
        void supabase
          .from("comments")
          .select("id", { count: "exact", head: true })
          .eq("parent_comment_id", comment.id)
          .then(({ count }) => setReplyCount(count ?? 0));
      })
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [comment.id]);

  const loadReplies = async () => {
    if (loadingReplies) return;
    setLoadingReplies(true);
    try {
      const data = await fetchComments(postId, { parentId: comment.id, limit: 50 });
      setReplies(data);
      setShowReplies(true);
    } finally {
      setLoadingReplies(false);
    }
  };

  /* Receive new reply injected by parent */
  useEffect(() => {
    /* exposed via onNewReply callback — parent injects when user posts a reply */
  }, []);

  return (
    <div className="px-4 py-3" style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
      <div className="flex gap-3">
        <Avatar url={comment.author?.avatar_url} name={comment.author?.name} size={34} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[13px] font-bold app-text">{comment.author?.name || comment.author?.username || "User"}</span>
            <span className="text-[11px] app-text-muted">{relTime(comment.created_at)}</span>
          </div>
          <p className="text-[13px] leading-relaxed app-text mt-0.5 whitespace-pre-wrap break-words">{comment.content}</p>
          <div className="mt-1.5 flex items-center gap-4">
            {me && (
              <button
                onClick={() => onReplyClick(comment)}
                className="text-[11px] font-semibold app-text-muted"
              >
                Reply
              </button>
            )}
            {replyCount > 0 && (
              <button
                onClick={() => showReplies ? setShowReplies(false) : loadReplies()}
                className="flex items-center gap-1 text-[11px] font-semibold"
                style={{ color: "var(--accent-primary)" }}
              >
                <CornerDownRight className="h-3 w-3" />
                {loadingReplies ? "Loading…" : showReplies ? "Hide replies" : `${replyCount} ${replyCount === 1 ? "reply" : "replies"}`}
              </button>
            )}
          </div>

          {/* Reply thread */}
          {showReplies && replies.length > 0 && (
            <div className="mt-2 pl-3 border-l" style={{ borderColor: "rgba(255,255,255,0.1)" }}>
              {replies.map((r) => (
                <div key={r.id} className="flex gap-2.5 py-2">
                  <Avatar url={r.author?.avatar_url} name={r.author?.name} size={26} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[12px] font-bold app-text">{r.author?.name || r.author?.username}</span>
                      <span className="text-[10px] app-text-muted">{relTime(r.created_at)}</span>
                    </div>
                    <p className="text-[12px] leading-relaxed app-text mt-0.5 whitespace-pre-wrap break-words">{r.content}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function CommentsSheet({ postId, initialCount, onClose, onCountChange }: Props) {
  console.log("[CommentsSheet] rendered, postId=", postId);
  const me = useAppStore((s) => s.user);
  const [comments, setComments]         = useState<Comment[]>([]);
  const [loading, setLoading]           = useState(true);
  const [text, setText]                 = useState("");
  const [submitting, setSubmitting]     = useState(false);
  const [replyTo, setReplyTo]           = useState<Comment | null>(null);
  const [count, setCount]               = useState(initialCount);
  const listRef                         = useRef<HTMLDivElement>(null);
  const inputRef                        = useRef<HTMLInputElement>(null);
  const seenIds                         = useRef(new Set<string>());

  useEffect(() => {
    console.log("[CommentsSheet] MOUNTED, postId=", postId);
    return () => console.log("[CommentsSheet] UNMOUNTED");
  }, [postId]);

  /* ── Load initial comments ────────────────────────────────────────────── */
  useEffect(() => {
    setLoading(true);
    fetchComments(postId, { limit: 50 })
      .then((data) => {
        data.forEach((c) => seenIds.current.add(c.id));
        setComments(data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [postId]);

  /* ── Realtime: new top-level comments ─────────────────────────────────── */
  useEffect(() => {
    const channel = supabase
      .channel(`comments-sheet-${postId}`)
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "comments",
        filter: `post_id=eq.${postId}`,
      }, (payload) => {
        const raw = payload.new as Comment;
        if (!raw.id || seenIds.current.has(raw.id)) return;
        if (raw.parent_comment_id) {
          /* It's a reply — update count only */
          setCount((c) => { onCountChange?.(1); return c + 1; });
          return;
        }
        seenIds.current.add(raw.id);
        /* Fetch with author join */
        void supabase
          .from("comments")
          .select("*, author:users!comments_author_id_fkey(id, name, username, avatar_url)")
          .eq("id", raw.id)
          .maybeSingle()
          .then(({ data }) => {
            if (!data) return;
            setComments((prev) => [...prev, data as Comment]);
            setCount((c) => { onCountChange?.(1); return c + 1; });
            /* Scroll to bottom */
            setTimeout(() => {
              listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
            }, 80);
          });
      })
      .on("postgres_changes", {
        event: "DELETE", schema: "public", table: "comments",
        filter: `post_id=eq.${postId}`,
      }, (payload) => {
        const raw = payload.old as { id: string; parent_comment_id?: string | null };
        if (!raw.parent_comment_id) {
          setComments((prev) => prev.filter((c) => c.id !== raw.id));
          setCount((c) => { onCountChange?.(-1); return Math.max(0, c - 1); });
          seenIds.current.delete(raw.id);
        } else {
          setCount((c) => { onCountChange?.(-1); return Math.max(0, c - 1); });
        }
      })
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, [postId, onCountChange]);

  /* ── Submit ───────────────────────────────────────────────────────────── */
  const handleSubmit = useCallback(async () => {
    const content = text.trim();
    if (!content || submitting || !me) return;
    setSubmitting(true);
    setText("");
    setReplyTo(null);
    try {
      const comment = await addComment(postId, content, replyTo?.id ?? undefined);
      if (!replyTo) {
        if (!seenIds.current.has(comment.id)) {
          seenIds.current.add(comment.id);
          setComments((prev) => [...prev, comment]);
          setCount((c) => { onCountChange?.(1); return c + 1; });
          setTimeout(() => {
            listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
          }, 80);
        }
      }
    } catch {
      /* silent — realtime will add it if it succeeded */
    } finally {
      setSubmitting(false);
    }
  }, [text, submitting, me, postId, replyTo, onCountChange]);

  /* ── Drag to close ────────────────────────────────────────────────────── */
  const dragY    = useMotionValue(0);
  const opacity  = useTransform(dragY, [0, 200], [1, 0]);
  const controls = useDragControls();

  const handleDragEnd = (_: unknown, info: { offset: { y: number }; velocity: { y: number } }) => {
    if (info.offset.y > 120 || info.velocity.y > 400) {
      onClose();
    } else {
      dragY.set(0);
    }
  };

  /* Lock body scroll while sheet is open */
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  const sheet = (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[100000]"
        style={{ isolation: "isolate" }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        {/* Backdrop */}
        <motion.div
          className="absolute inset-0"
          style={{ background: "rgba(0,0,0,0.55)", opacity }}
          onClick={onClose}
        />

        {/* Sheet panel */}
        <motion.div
          drag="y"
          dragControls={controls}
          dragListener={false}
          dragConstraints={{ top: 0, bottom: 0 }}
          dragElastic={{ top: 0, bottom: 0.3 }}
          onDragEnd={handleDragEnd}
          style={{
            y: dragY,
            height: "82vh",
            background: "rgba(10,10,10,0.98)",
            backdropFilter: "blur(24px)",
            WebkitBackdropFilter: "blur(24px)",
            border: "1px solid rgba(255,255,255,0.09)",
            borderBottom: "none",
          }}
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          exit={{ y: "100%" }}
          transition={{ type: "spring", stiffness: 340, damping: 36, mass: 1 }}
          className="absolute bottom-0 left-0 right-0 flex flex-col rounded-t-[24px] overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Drag handle */}
          <div
            className="flex justify-center pt-3 pb-2 cursor-grab active:cursor-grabbing select-none"
            onPointerDown={(e) => controls.start(e)}
          >
            <div className="rounded-full" style={{ width: 36, height: 4, background: "rgba(255,255,255,0.18)" }} />
          </div>

          {/* Header */}
          <div className="flex items-center justify-between px-5 pb-3"
            style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
            <h3 className="text-[15px] font-bold app-text">
              {count > 0 ? `${count} Comment${count !== 1 ? "s" : ""}` : "Comments"}
            </h3>
            <button
              onClick={onClose}
              className="grid h-8 w-8 place-items-center rounded-full"
              style={{ background: "rgba(255,255,255,0.08)" }}
            >
              <X className="h-4 w-4 app-text-muted" />
            </button>
          </div>

          {/* Comment list */}
          <div ref={listRef} className="flex-1 overflow-y-auto hide-scrollbar">
            {loading ? (
              <div className="flex justify-center py-10">
                <div className="h-6 w-6 rounded-full border-2 border-white/20 border-t-white/60 animate-spin" />
              </div>
            ) : comments.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <div className="grid h-14 w-14 place-items-center rounded-full"
                  style={{ background: "rgba(255,255,255,0.06)" }}>
                  <Heart className="h-6 w-6 app-text-muted" />
                </div>
                <p className="text-sm app-text-muted">Be the first to comment</p>
              </div>
            ) : (
              comments.map((c) => (
                <CommentRow
                  key={c.id}
                  comment={c}
                  postId={postId}
                  me={me}
                  onReplyClick={(parent) => {
                    setReplyTo(parent);
                    inputRef.current?.focus();
                  }}
                  onNewReply={(parentId, reply) => {
                    setCount((n) => n + 1);
                  }}
                />
              ))
            )}
          </div>

          {/* Input bar */}
          {me ? (
            <div
              className="flex items-center gap-3 px-4 py-3"
              style={{
                borderTop: "1px solid rgba(255,255,255,0.07)",
                paddingBottom: `calc(env(safe-area-inset-bottom, 0px) + 12px)`,
              }}
            >
              <Avatar url={me.avatar} name={me.name || me.handle} size={32} />
              <div className="flex-1 flex flex-col gap-1">
                {replyTo && (
                  <div className="flex items-center gap-1.5 px-1">
                    <span className="text-[11px] app-text-muted">
                      Replying to <span className="font-semibold" style={{ color: "var(--accent-primary)" }}>@{replyTo.author?.username || replyTo.author?.name}</span>
                    </span>
                    <button onClick={() => setReplyTo(null)} className="text-[11px] app-text-muted underline">Cancel</button>
                  </div>
                )}
                <div className="flex items-center gap-2 rounded-full px-3 py-2"
                  style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)" }}>
                  <input
                    ref={inputRef}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void handleSubmit(); }
                    }}
                    placeholder={replyTo ? `Reply to ${replyTo.author?.name || "user"}…` : "Add a comment…"}
                    className="flex-1 bg-transparent text-[13px] app-text outline-none placeholder:app-text-muted"
                    style={{ minWidth: 0 }}
                  />
                  <motion.button
                    whileTap={{ scale: 0.85 }}
                    onClick={() => void handleSubmit()}
                    disabled={!text.trim() || submitting}
                    className="flex-shrink-0 grid h-7 w-7 place-items-center rounded-full disabled:opacity-30 transition-opacity"
                    style={{ background: "linear-gradient(135deg,var(--accent-primary),var(--accent-secondary))" }}
                  >
                    <Send className="h-3.5 w-3.5 text-white" />
                  </motion.button>
                </div>
              </div>
            </div>
          ) : (
            <div className="px-5 py-4 text-center" style={{ paddingBottom: "calc(env(safe-area-inset-bottom,0px) + 16px)" }}>
              <p className="text-xs app-text-muted">Sign in to comment</p>
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );

  console.log("[CommentsSheet] portal rendered to document.body");
  return createPortal(sheet, document.body);
}
