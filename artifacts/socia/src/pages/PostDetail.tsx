/**
 * PostDetail.tsx — Full post view with real comments, like/save, and moderation.
 *
 * Fetches post and comments from the backend. Supports:
 * - Like, save, share
 * - Comment list (paginated)
 * - Add / edit / delete own comments
 * - Report post or comment
 * - Owner can delete any comment
 * - Follow / unfollow author inline
 */
import { useEffect, useState, useRef, useCallback } from "react";
import { useLocation, useRoute } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, Heart, MessageCircle, Bookmark, Share2,
  Send, BadgeCheck, MoreHorizontal, Trash2, Flag, Eye, Zap, X,
} from "lucide-react";
import { VideoPostPlayer } from "@/components/feed/VideoPostPlayer";
import {
  fetchSinglePost, fetchComments, addComment, deleteComment, editComment,
  toggleLike, toggleSave, reportPost, reportComment, recordView,
  type SocialPost, type Comment,
} from "@/lib/postsClient";
import { useAppStore } from "@/lib/store";
import { supabase } from "@/lib/supabase";

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return "now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function fmtCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

/* ── Comment item ───────────────────────────────────────────────────────── */
function CommentItem({
  comment, postId, meId, isOwner,
  onDelete, onEdit, onReport,
}: {
  comment: Comment;
  postId: string;
  meId: string | null;
  isOwner: boolean;
  onDelete: (cid: string) => void;
  onEdit: (cid: string, content: string) => void;
  onReport: (cid: string) => void;
}) {
  const [showMenu, setShowMenu] = useState(false);
  const [editing,  setEditing]  = useState(false);
  const [draft,    setDraft]    = useState(comment.content);
  const [saving,   setSaving]   = useState(false);

  const isOwnerMe = meId === comment.author_id || isOwner;

  const saveEdit = async () => {
    if (!draft.trim() || draft === comment.content) { setEditing(false); return; }
    setSaving(true);
    try {
      await onEdit(comment.id, draft.trim());
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex gap-3 py-3">
      {/* Avatar */}
      <div className="flex-shrink-0">
        {comment.author?.avatar_url ? (
          <img
            src={comment.author.avatar_url}
            alt=""
            className="h-8 w-8 rounded-full object-cover"
            style={{ border: "1px solid rgba(255,255,255,0.1)" }}
          />
        ) : (
          <div
            className="h-8 w-8 rounded-full grid place-items-center text-xs font-bold text-white"
            style={{ background: "linear-gradient(135deg,var(--accent-primary),var(--accent-secondary))" }}
          >
            {(comment.author?.name || comment.author?.username || "?").charAt(0).toUpperCase()}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          <span className="text-[12px] font-bold app-text">
            {comment.author?.name || comment.author?.username || "User"}
          </span>
          <span className="text-[10px] app-text-muted">{relTime(comment.created_at)}</span>
        </div>

        {editing ? (
          <div className="flex items-end gap-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value.slice(0, 2000))}
              rows={2}
              autoFocus
              className="flex-1 text-sm app-text bg-white/5 rounded-xl px-3 py-2 outline-none resize-none"
              style={{ border: "1px solid rgba(255,255,255,0.12)" }}
            />
            <div className="flex flex-col gap-1">
              <button onClick={saveEdit} disabled={saving}
                className="rounded-lg px-2 py-1 text-[11px] font-bold text-white bg-purple-600 disabled:opacity-50">
                {saving ? "…" : "Save"}
              </button>
              <button onClick={() => { setEditing(false); setDraft(comment.content); }}
                className="rounded-lg px-2 py-1 text-[11px] app-text-muted bg-white/5">
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <p className="text-sm app-text leading-relaxed">{comment.content}</p>
        )}
      </div>

      {/* 3-dot menu */}
      <div className="relative flex-shrink-0">
        <motion.button
          whileTap={{ scale: 0.85 }}
          onClick={() => setShowMenu((v) => !v)}
          className="grid h-7 w-7 place-items-center rounded-full"
        >
          <MoreHorizontal className="h-3.5 w-3.5 app-text-muted" />
        </motion.button>

        <AnimatePresence>
          {showMenu && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setShowMenu(false)} />
              <motion.div
                initial={{ opacity: 0, scale: 0.9, y: -4 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="absolute right-0 top-8 z-40 min-w-[130px] rounded-xl border shadow-xl overflow-hidden"
                style={{ background: "rgba(18,18,18,0.97)", borderColor: "rgba(255,255,255,0.1)" }}
                onClick={(e) => e.stopPropagation()}
              >
                {meId === comment.author_id && (
                  <button
                    onClick={() => { setShowMenu(false); setEditing(true); }}
                    className="flex w-full items-center gap-2 px-3 py-2.5 text-xs font-medium app-text hover:bg-white/5"
                  >
                    Edit
                  </button>
                )}
                {isOwnerMe && (
                  <button
                    onClick={() => { setShowMenu(false); onDelete(comment.id); }}
                    className="flex w-full items-center gap-2 px-3 py-2.5 text-xs font-medium text-rose-400 hover:bg-white/5"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Delete
                  </button>
                )}
                {meId !== comment.author_id && (
                  <button
                    onClick={() => { setShowMenu(false); onReport(comment.id); }}
                    className="flex w-full items-center gap-2 px-3 py-2.5 text-xs font-medium app-text-muted hover:bg-white/5"
                  >
                    <Flag className="h-3.5 w-3.5" /> Report
                  </button>
                )}
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

/* ── Main PostDetail ─────────────────────────────────────────────────────── */
export default function PostDetail() {
  const [, params]   = useRoute("/post/:id");
  const [, navigate] = useLocation();
  const me           = useAppStore((s) => s.user);
  const followedIds  = useAppStore((s) => s.followedUserIds);
  const setFollowedIds = useAppStore((s) => s.setFollowedUserIds);

  const [post,         setPost]         = useState<SocialPost | null>(null);
  const [comments,     setComments]     = useState<Comment[]>([]);
  const [loadingPost,  setLoadingPost]  = useState(true);
  const [loadingComments, setLoadingComments] = useState(true);
  const [postError,    setPostError]    = useState<string | null>(null);
  /* Tip state */
  const [tipOpen,    setTipOpen]    = useState(false);
  const [tipAmt,     setTipAmt]     = useState<number>(5);
  const [tipBusy,    setTipBusy]    = useState(false);
  const [tipResult,  setTipResult]  = useState<{ ok: boolean; msg: string } | null>(null);

  const [newComment,   setNewComment]   = useState("");
  const [submitting,   setSubmitting]   = useState(false);
  const [mediaIndex,   setMediaIndex]   = useState(0);
  const [followWorking, setFollowWorking] = useState(false);

  const commentInputRef = useRef<HTMLTextAreaElement>(null);
  const postId = params?.id;

  const meId    = me?.id ?? null;
  const isOwner = me?.isOwner === true;
  const isMe    = meId === post?.author_id;
  const isFollowing = post ? followedIds.includes(post.author_id) : false;

  const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

  const handleTip = useCallback(async () => {
    if (!post || !meId) return;
    setTipBusy(true);
    setTipResult(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) { setTipResult({ ok: false, msg: "Please sign in to tip." }); return; }
      const res = await fetch(`${BASE}/api/tip`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ creator_id: post.author_id, post_id: post.id, amount: tipAmt }),
      });
      const j = await res.json().catch(() => ({})) as { ok?: boolean; error?: string; creator?: string; newBalance?: number };
      if (res.ok && j.ok) {
        setTipResult({ ok: true, msg: `${tipAmt} credit${tipAmt > 1 ? "s" : ""} sent to ${j.creator ?? "creator"}! 🎉` });
        setTimeout(() => setTipOpen(false), 2200);
      } else {
        setTipResult({ ok: false, msg: j.error ?? "Failed to send tip." });
      }
    } catch (e) {
      setTipResult({ ok: false, msg: "Network error. Please try again." });
    } finally {
      setTipBusy(false);
    }
  }, [post, meId, tipAmt, BASE]);

  /* ── Load post ──────────────────────────────────────────────────────── */
  useEffect(() => {
    if (!postId) return;
    setLoadingPost(true);
    setPostError(null);
    fetchSinglePost(postId, meId ?? undefined)
      .then((p) => {
        if (!p) { setPostError("Post not found"); return; }
        setPost(p);
      })
      .catch((e) => setPostError(e.message ?? "Failed to load post"))
      .finally(() => setLoadingPost(false));

    /* Record view (fire and forget) */
    void recordView(postId);
  }, [postId, meId]);

  /* ── Load comments ──────────────────────────────────────────────────── */
  useEffect(() => {
    if (!postId) return;
    setLoadingComments(true);
    fetchComments(postId, { limit: 50 })
      .then(setComments)
      .catch(() => setComments([]))
      .finally(() => setLoadingComments(false));
  }, [postId]);

  /* ── Add comment ────────────────────────────────────────────────────── */
  const handleAddComment = useCallback(async () => {
    if (!newComment.trim() || !postId || submitting) return;
    setSubmitting(true);
    try {
      const comment = await addComment(postId, newComment.trim());
      setComments((prev) => [...prev, comment]);
      setPost((p) => p ? { ...p, comment_count: p.comment_count + 1 } : p);
      setNewComment("");
    } catch { /* show nothing — comment failed */ }
    finally { setSubmitting(false); }
  }, [newComment, postId, submitting]);

  /* ── Delete comment ─────────────────────────────────────────────────── */
  const handleDeleteComment = useCallback(async (commentId: string) => {
    if (!postId) return;
    try {
      await deleteComment(postId, commentId);
      setComments((prev) => prev.filter((c) => c.id !== commentId));
      setPost((p) => p ? { ...p, comment_count: Math.max(0, p.comment_count - 1) } : p);
    } catch { /* silent */ }
  }, [postId]);

  /* ── Edit comment ───────────────────────────────────────────────────── */
  const handleEditComment = useCallback(async (commentId: string, content: string) => {
    if (!postId) return;
    const updated = await editComment(postId, commentId, content);
    setComments((prev) => prev.map((c) => c.id === commentId ? updated : c));
  }, [postId]);

  /* ── Report comment ─────────────────────────────────────────────────── */
  const handleReportComment = useCallback(async (commentId: string) => {
    if (!postId) return;
    try { await reportComment(postId, commentId, "inappropriate"); } catch { /* silent */ }
  }, [postId]);

  /* ── Like ───────────────────────────────────────────────────────────── */
  const handleLike = useCallback(async () => {
    if (!post) return;
    const prev = { liked: post.has_liked, count: post.like_count };
    const nowLiked = !post.has_liked;
    setPost((p) => p ? { ...p, has_liked: nowLiked, like_count: p.like_count + (nowLiked ? 1 : -1) } : p);
    try {
      const result = await toggleLike(post.id);
      setPost((p) => p ? { ...p, has_liked: result.liked, like_count: p.like_count + (result.liked === p.has_liked ? 0 : result.liked ? 1 : -1) } : p);
    } catch {
      setPost((p) => p ? { ...p, has_liked: prev.liked, like_count: prev.count } : p);
    }
  }, [post]);

  /* ── Save ───────────────────────────────────────────────────────────── */
  const handleSave = useCallback(async () => {
    if (!post) return;
    const prev = { saved: post.has_saved, count: post.save_count ?? 0 };
    const nowSaved = !post.has_saved;
    setPost((p) => p ? { ...p, has_saved: nowSaved, save_count: (p.save_count ?? 0) + (nowSaved ? 1 : -1) } : p);
    try {
      await toggleSave(post.id);
    } catch {
      setPost((p) => p ? { ...p, has_saved: prev.saved, save_count: prev.count } : p);
    }
  }, [post]);

  /* ── Share ──────────────────────────────────────────────────────────── */
  const handleShare = useCallback(async () => {
    const url = window.location.href;
    if (navigator.share) {
      try { await navigator.share({ url, title: post?.caption ?? "Post" }); }
      catch { navigator.clipboard?.writeText(url); }
    } else {
      navigator.clipboard?.writeText(url);
    }
  }, [post]);

  /* ── Follow ─────────────────────────────────────────────────────────── */
  const handleFollow = useCallback(async () => {
    if (!post || followWorking || isMe) return;
    setFollowWorking(true);
    try {
      if (isFollowing) {
        const { error } = await supabase.rpc("unfollow_user", { target_id: post.author_id });
        if (!error) setFollowedIds(followedIds.filter((id) => id !== post.author_id));
      } else {
        const { error } = await supabase.rpc("follow_user", { target_id: post.author_id });
        if (!error) setFollowedIds([...followedIds, post.author_id]);
      }
    } finally { setFollowWorking(false); }
  }, [post, followWorking, isMe, isFollowing, followedIds, setFollowedIds]);

  const media = post?.media ?? [];
  const currentMedia = media[mediaIndex];

  /* ── Loading state ──────────────────────────────────────────────────── */
  if (loadingPost) {
    return (
      <div className="flex h-full flex-col app-bg">
        <div className="flex items-center gap-3 px-4 py-3 app-header">
          <button onClick={() => navigate(-1 as any)} className="grid h-9 w-9 place-items-center rounded-full app-surface">
            <ArrowLeft className="h-4 w-4 app-text" />
          </button>
        </div>
        <div className="shimmer flex-1" style={{ maxHeight: 400 }} />
        <div className="space-y-3 px-4 py-4">
          <div className="h-4 w-32 rounded-full shimmer" />
          <div className="h-3 w-full rounded-full shimmer" />
          <div className="h-3 w-3/4 rounded-full shimmer" />
        </div>
      </div>
    );
  }

  if (postError || !post) {
    return (
      <div className="grid h-full place-items-center app-bg text-center px-6">
        <div>
          <p className="font-semibold app-text mb-2">{postError ?? "Post not found"}</p>
          <button onClick={() => navigate("/")} className="text-sm app-text-muted underline">Back to feed</button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col app-bg overflow-hidden">
      {/* ── Header ───────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-4 py-3 app-header flex-shrink-0" style={{ paddingTop: `calc(env(safe-area-inset-top, 0px) + 12px)` }}>
        <button onClick={() => navigate(-1 as any)} className="grid h-9 w-9 place-items-center rounded-full app-surface">
          <ArrowLeft className="h-4 w-4 app-text" />
        </button>
        <div className="flex-1 flex items-center gap-2">
          {post.author?.avatar_url ? (
            <img src={post.author.avatar_url} alt="" className="h-8 w-8 rounded-full object-cover" />
          ) : (
            <div className="h-8 w-8 rounded-full grid place-items-center text-xs font-bold text-white" style={{ background: "linear-gradient(135deg,var(--accent-primary),var(--accent-secondary))" }}>
              {(post.author?.name || "?").charAt(0)}
            </div>
          )}
          <div>
            <div className="flex items-center gap-1">
              <span className="text-sm font-bold app-text">{post.author?.name || post.author?.username}</span>
              {(post.author?.is_verified || post.author?.is_owner) && (
                <BadgeCheck className="h-3.5 w-3.5" style={{ color: "var(--accent-primary)" }} />
              )}
            </div>
            {post.author?.username && <div className="text-[10px] app-text-muted">@{post.author.username}</div>}
          </div>
        </div>
        {!isMe && (
          <motion.button
            whileTap={{ scale: 0.93 }}
            onClick={handleFollow}
            disabled={followWorking}
            className="rounded-full px-3.5 py-1.5 text-xs font-bold transition disabled:opacity-50"
            style={isFollowing
              ? { background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.6)", border: "1px solid rgba(255,255,255,0.12)" }
              : { background: "linear-gradient(135deg,var(--accent-primary),var(--accent-secondary))", color: "white" }
            }
          >
            {isFollowing ? "Following" : "Follow"}
          </motion.button>
        )}
      </div>

      {/* ── Scrollable body ──────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto scroll-native hide-scrollbar pb-28">

        {/* Media */}
        {media.length > 0 && (
          <div className="relative">
            {currentMedia?.type === "video" ? (
              <VideoPostPlayer url={currentMedia.url} aspectRatio="4/5" />
            ) : (
              <div style={{ aspectRatio: "4/5", background: "#0a0a0a" }}>
                <img src={currentMedia?.url} alt={post.caption ?? ""} className="h-full w-full object-cover" />
              </div>
            )}

            {media.length > 1 && (
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
                {media.map((_, i) => (
                  <button key={i} onClick={() => setMediaIndex(i)}
                    className="h-1.5 rounded-full transition-all"
                    style={{ width: i === mediaIndex ? 16 : 6, background: i === mediaIndex ? "white" : "rgba(255,255,255,0.45)" }}
                  />
                ))}
              </div>
            )}
            {media.length > 1 && mediaIndex > 0 && (
              <button onClick={() => setMediaIndex((i) => i - 1)}
                className="absolute left-3 top-1/2 -translate-y-1/2 grid h-9 w-9 place-items-center rounded-full bg-black/50 backdrop-blur-sm text-white text-lg font-bold">‹</button>
            )}
            {media.length > 1 && mediaIndex < media.length - 1 && (
              <button onClick={() => setMediaIndex((i) => i + 1)}
                className="absolute right-3 top-1/2 -translate-y-1/2 grid h-9 w-9 place-items-center rounded-full bg-black/50 backdrop-blur-sm text-white text-lg font-bold">›</button>
            )}
          </div>
        )}

        {/* Caption — appears directly below media */}
        {post.caption && (
          <div className="px-4 pt-3 pb-1">
            <p className="text-[15px] leading-relaxed app-text">{post.caption}</p>
          </div>
        )}

        {/* Actions row — below caption */}
        <div className="flex items-center gap-1 px-3 pt-2 pb-1" style={{ borderTop: "1px solid rgba(255,255,255,0.05)", marginTop: post.caption ? 8 : 0 }}>
          <motion.button whileTap={{ scale: 0.82 }} onClick={handleLike}
            className="flex items-center gap-1.5 rounded-full px-3 py-2">
            <Heart className="h-5 w-5 transition-colors"
              style={{ fill: post.has_liked ? "#f43f5e" : "none", color: post.has_liked ? "#f43f5e" : "rgba(255,255,255,0.7)" }} />
            <span className="text-xs font-semibold" style={{ color: post.has_liked ? "#f43f5e" : "rgba(255,255,255,0.7)" }}>
              {fmtCount(post.like_count ?? 0)}
            </span>
          </motion.button>

          <motion.button whileTap={{ scale: 0.82 }} onClick={() => commentInputRef.current?.focus()}
            className="flex items-center gap-1.5 rounded-full px-3 py-2">
            <MessageCircle className="h-5 w-5" style={{ color: "rgba(255,255,255,0.7)" }} />
            <span className="text-xs font-semibold" style={{ color: "rgba(255,255,255,0.7)" }}>
              {fmtCount(post.comment_count ?? 0)}
            </span>
          </motion.button>

          <motion.button whileTap={{ scale: 0.82 }} onClick={handleSave}
            className="flex items-center gap-1.5 rounded-full px-3 py-2">
            <Bookmark className="h-5 w-5 transition-colors"
              style={{ fill: post.has_saved ? "#a855f7" : "none", color: post.has_saved ? "#a855f7" : "rgba(255,255,255,0.7)" }} />
          </motion.button>

          <motion.button whileTap={{ scale: 0.82 }} onClick={handleShare}
            className="flex items-center gap-1.5 rounded-full px-3 py-2">
            <Share2 className="h-5 w-5" style={{ color: "rgba(255,255,255,0.7)" }} />
          </motion.button>

          {/* Tip creator — only show if author is monetized and post is not mine */}
          {!isMe && post.author?.is_monetized && (
            <motion.button
              whileTap={{ scale: 0.82 }}
              onClick={() => { setTipResult(null); setTipOpen(true); }}
              className="flex items-center gap-1.5 rounded-full px-3 py-2"
            >
              <Zap className="h-5 w-5" style={{ color: "#fbbf24" }} />
              <span className="text-xs font-semibold" style={{ color: "#fbbf24" }}>Tip</span>
            </motion.button>
          )}

          <div className="flex-1" />
          <div className="flex items-center gap-1 px-3">
            <Eye className="h-4 w-4" style={{ color: "rgba(255,255,255,0.3)" }} />
            <span className="text-[11px]" style={{ color: "rgba(255,255,255,0.35)" }}>{fmtCount(post.view_count ?? 0)}</span>
          </div>
        </div>

        {/* Comments section */}
        <div className="border-t px-4 pt-4" style={{ borderColor: "rgba(255,255,255,0.07)" }}>
          <h3 className="text-[12px] font-semibold app-text-muted uppercase tracking-wide mb-2">
            {comments.length > 0 ? `${comments.length} Comments` : "Comments"}
          </h3>

          {loadingComments ? (
            <div className="space-y-4 py-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex gap-3">
                  <div className="h-8 w-8 rounded-full shimmer flex-shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-2.5 w-20 rounded-full shimmer" />
                    <div className="h-2.5 w-full rounded-full shimmer" />
                  </div>
                </div>
              ))}
            </div>
          ) : comments.length === 0 ? (
            <p className="text-sm app-text-muted py-4">No comments yet. Be the first!</p>
          ) : (
            <div className="divide-y" style={{ borderColor: "rgba(255,255,255,0.04)" }}>
              {comments.map((c) => (
                <CommentItem
                  key={c.id}
                  comment={c}
                  postId={post.id}
                  meId={meId}
                  isOwner={isOwner}
                  onDelete={handleDeleteComment}
                  onEdit={handleEditComment}
                  onReport={handleReportComment}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Sticky comment input ─────────────────────────────────────── */}
      <div
        className="flex-shrink-0 flex items-end gap-3 px-4 pt-3 app-header border-t"
        style={{ paddingBottom: `calc(env(safe-area-inset-bottom, 0px) + 16px)`, borderColor: "rgba(255,255,255,0.07)" }}
      >
        {me?.avatar && (
          <img src={me.avatar} alt="" className="h-8 w-8 rounded-full object-cover flex-shrink-0 mb-1" />
        )}
        <div
          className="flex flex-1 items-end gap-2 rounded-2xl px-3 py-2"
          style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
        >
          <textarea
            ref={commentInputRef}
            value={newComment}
            onChange={(e) => setNewComment(e.target.value.slice(0, 2000))}
            placeholder="Add a comment…"
            rows={1}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void handleAddComment(); } }}
            className="flex-1 text-sm app-text bg-transparent outline-none resize-none placeholder:app-text-muted"
            style={{ maxHeight: 96, minHeight: 20, overflowY: "auto" }}
          />
          <AnimatePresence>
            {newComment.trim() && (
              <motion.button
                initial={{ opacity: 0, scale: 0.7 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.7 }}
                whileTap={{ scale: 0.85 }}
                onClick={handleAddComment}
                disabled={submitting}
                className="flex-shrink-0 grid h-7 w-7 place-items-center rounded-full text-white disabled:opacity-50"
                style={{ background: "linear-gradient(135deg,var(--accent-primary),var(--accent-secondary))" }}
              >
                <Send className="h-3.5 w-3.5" />
              </motion.button>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* ── Tip bottom sheet ─────────────────────────────────────────── */}
      <AnimatePresence>
        {tipOpen && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end justify-center"
            onClick={() => !tipBusy && setTipOpen(false)}
          >
            <div className="absolute inset-0 bg-black/75" />
            <motion.div
              initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 26, stiffness: 260 }}
              className="relative w-full max-w-md rounded-t-3xl border-t border-white/[0.05] bg-[#0a0a0a] p-6 pb-10 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between mb-5">
                <div>
                  <h3 className="text-[16px] font-bold text-white">Tip Creator</h3>
                  <p className="text-[11px] text-white/40 mt-0.5">
                    Send credits to {post.author?.name ?? "this creator"}
                  </p>
                </div>
                <button onClick={() => setTipOpen(false)} disabled={tipBusy} className="p-1">
                  <X className="h-4 w-4 text-white/40" />
                </button>
              </div>

              {/* Amount selector */}
              <div className="grid grid-cols-5 gap-2 mb-5">
                {[1, 5, 10, 25, 50].map((amt) => (
                  <button
                    key={amt}
                    onClick={() => setTipAmt(amt)}
                    className="rounded-2xl py-3 text-[13px] font-bold transition-all"
                    style={{
                      background: tipAmt === amt
                        ? "linear-gradient(135deg,#fbbf24,#f59e0b)"
                        : "rgba(255,255,255,0.07)",
                      color: tipAmt === amt ? "#0a0a0a" : "rgba(255,255,255,0.6)",
                      border: tipAmt === amt ? "none" : "1px solid rgba(255,255,255,0.08)",
                    }}
                  >
                    {amt}
                  </button>
                ))}
              </div>

              {/* Selected amount display */}
              <div
                className="rounded-2xl p-4 text-center mb-4"
                style={{ background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.2)" }}
              >
                <div className="flex items-center justify-center gap-2">
                  <Zap className="h-5 w-5 text-amber-400" />
                  <span className="text-[18px] font-black text-amber-400">{tipAmt} credits</span>
                </div>
                <p className="text-[11px] text-white/35 mt-1">will be sent to the creator</p>
              </div>

              {/* Result message */}
              <AnimatePresence>
                {tipResult && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="mb-3 rounded-xl px-4 py-2.5 text-sm text-center font-medium"
                    style={{
                      background: tipResult.ok ? "rgba(52,211,153,0.1)" : "rgba(248,113,113,0.1)",
                      color:      tipResult.ok ? "#34d399"               : "#f87171",
                      border: `1px solid ${tipResult.ok ? "rgba(52,211,153,0.25)" : "rgba(248,113,113,0.25)"}`,
                    }}
                  >
                    {tipResult.msg}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Send button */}
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={handleTip}
                disabled={tipBusy}
                className="w-full rounded-2xl py-4 text-[15px] font-bold text-black disabled:opacity-50"
                style={{ background: "linear-gradient(135deg,#fbbf24,#f59e0b)" }}
              >
                {tipBusy
                  ? <span className="flex items-center justify-center gap-2"><span className="h-4 w-4 animate-spin rounded-full border-2 border-black/30 border-t-black" /> Sending…</span>
                  : `⚡ Send ${tipAmt} credits`}
              </motion.button>

              <p className="mt-3 text-center text-[10px] text-white/25">
                Tips are non-refundable. Credits deducted from your balance.
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
