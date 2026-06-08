/**
 * PostDetail.tsx — Full post view.
 *
 * Facebook-standard hierarchy:
 *   Header (profile info + follow)
 *   Post text / caption  ← ALWAYS above media
 *   Media carousel
 *   Engagement stats row
 *   Action bar: Like · Comment · Share · Save
 *   Support Creator button (monetised creators only, non-owner viewer)
 *   Comments section
 *   Sticky comment input
 */
import { useEffect, useState, useRef, useCallback } from "react";
import { useLocation, useRoute } from "wouter";
import { RichCaption } from "@/components/feed/RichCaption";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, Heart, MessageCircle, Bookmark, Share2,
  Send, BadgeCheck, MoreHorizontal, Trash2, Flag, Eye, Star, X,
} from "lucide-react";
import { VideoPostPlayer } from "@/components/feed/VideoPostPlayer";
import { MusicDisc } from "@/components/feed/MusicDisc";
import {
  fetchSinglePost, fetchComments, addComment, deleteComment, editComment,
  toggleLike, toggleSave, reportPost, reportComment, recordView,
  type SocialPost, type Comment,
} from "@/lib/postsClient";
import { useAppStore } from "@/lib/store";
import { supabase } from "@/lib/supabase";
import SendStarsModal from "@/components/stars/SendStarsModal";

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function fmtCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

/* ── Comment item ─────────────────────────────────────────────────────────── */
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

  const canDelete = meId === comment.author_id || isOwner;

  const saveEdit = async () => {
    if (!draft.trim() || draft === comment.content) { setEditing(false); return; }
    setSaving(true);
    try {
      await onEdit(comment.id, draft.trim());
      setEditing(false);
    } finally { setSaving(false); }
  };

  return (
    <div className="flex gap-3 py-3">
      <div className="flex-shrink-0">
        {comment.author?.avatar_url ? (
          <img src={comment.author.avatar_url} alt="" className="h-9 w-9 rounded-full object-cover"
            style={{ border: "1px solid rgba(255,255,255,0.1)" }} />
        ) : (
          <div className="h-9 w-9 rounded-full grid place-items-center text-xs font-bold text-white"
            style={{ background: "linear-gradient(135deg,var(--accent-primary),var(--accent-secondary))" }}>
            {(comment.author?.name || comment.author?.username || "?").charAt(0).toUpperCase()}
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div
          className="rounded-2xl px-3 py-2.5 mb-1"
          style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.06)" }}
        >
          <div className="flex items-center gap-1.5 mb-1">
            <span className="text-[13px] font-bold app-text">
              {comment.author?.name || comment.author?.username || "User"}
            </span>
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
            <p className="text-[13px] app-text leading-relaxed">{comment.content}</p>
          )}
        </div>
        <span className="text-[11px] app-text-muted pl-1">{relTime(comment.created_at)}</span>
      </div>

      {/* 3-dot menu */}
      <div className="relative flex-shrink-0">
        <motion.button
          whileTap={{ scale: 0.85 }}
          onClick={() => setShowMenu((v) => !v)}
          className="grid h-8 w-8 place-items-center rounded-full mt-1"
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
                className="absolute right-0 top-9 z-40 min-w-[130px] rounded-xl border shadow-xl overflow-hidden"
                style={{ background: "rgba(18,18,18,0.97)", borderColor: "rgba(255,255,255,0.1)" }}
                onClick={(e) => e.stopPropagation()}
              >
                {meId === comment.author_id && (
                  <button onClick={() => { setShowMenu(false); setEditing(true); }}
                    className="flex w-full items-center gap-2 px-3 py-2.5 text-xs font-medium app-text hover:bg-white/5">
                    Edit
                  </button>
                )}
                {canDelete && (
                  <button onClick={() => { setShowMenu(false); onDelete(comment.id); }}
                    className="flex w-full items-center gap-2 px-3 py-2.5 text-xs font-medium text-rose-400 hover:bg-white/5">
                    <Trash2 className="h-3.5 w-3.5" /> Delete
                  </button>
                )}
                {meId !== comment.author_id && (
                  <button onClick={() => { setShowMenu(false); onReport(comment.id); }}
                    className="flex w-full items-center gap-2 px-3 py-2.5 text-xs font-medium app-text-muted hover:bg-white/5">
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

/* ── Main PostDetail ──────────────────────────────────────────────────────── */
export default function PostDetail() {
  const [, params]   = useRoute("/post/:id");
  const [, navigate] = useLocation();
  const me           = useAppStore((s) => s.user);
  const followedIds  = useAppStore((s) => s.followedUserIds);
  const setFollowedIds = useAppStore((s) => s.setFollowedUserIds);

  const [post,            setPost]            = useState<SocialPost | null>(null);
  const [comments,        setComments]        = useState<Comment[]>([]);
  const [loadingPost,     setLoadingPost]      = useState(true);
  const [loadingComments, setLoadingComments] = useState(true);
  const [postError,       setPostError]       = useState<string | null>(null);
  const [starsOpen,       setStarsOpen]       = useState(false);

  const [newComment,     setNewComment]   = useState("");
  const [submitting,     setSubmitting]   = useState(false);
  const [mediaIndex,     setMediaIndex]   = useState(0);
  const [followWorking,  setFollowWorking] = useState(false);
  const [captionExpand,  setCaptionExpand] = useState(false);

  const commentInputRef = useRef<HTMLTextAreaElement>(null);
  const postId = params?.id;

  const meId    = me?.id ?? null;
  const isOwner = me?.isOwner === true;
  const isMe    = meId === post?.author_id;
  const isFollowing = post ? followedIds.includes(post.author_id) : false;

  /* Creator is monetised and viewer is not the author */
  const showSupportButton = !isMe && !!post?.author?.is_monetized;

  /* ── Load post ────────────────────────────────────────────────────── */
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
    void recordView(postId);
  }, [postId, meId]);

  /* ── Load comments ────────────────────────────────────────────────── */
  useEffect(() => {
    if (!postId) return;
    setLoadingComments(true);
    fetchComments(postId, { limit: 50 })
      .then(setComments)
      .catch(() => setComments([]))
      .finally(() => setLoadingComments(false));
  }, [postId]);

  const handleAddComment = useCallback(async () => {
    if (!newComment.trim() || !postId || submitting) return;
    setSubmitting(true);
    try {
      const comment = await addComment(postId, newComment.trim());
      setComments((prev) => [...prev, comment]);
      setPost((p) => p ? { ...p, comment_count: p.comment_count + 1 } : p);
      setNewComment("");
    } catch { /* silent */ }
    finally { setSubmitting(false); }
  }, [newComment, postId, submitting]);

  const handleDeleteComment = useCallback(async (commentId: string) => {
    if (!postId) return;
    try {
      await deleteComment(postId, commentId);
      setComments((prev) => prev.filter((c) => c.id !== commentId));
      setPost((p) => p ? { ...p, comment_count: Math.max(0, p.comment_count - 1) } : p);
    } catch { /* silent */ }
  }, [postId]);

  const handleEditComment = useCallback(async (commentId: string, content: string) => {
    if (!postId) return;
    const updated = await editComment(postId, commentId, content);
    setComments((prev) => prev.map((c) => c.id === commentId ? updated : c));
  }, [postId]);

  const handleReportComment = useCallback(async (commentId: string) => {
    if (!postId) return;
    try { await reportComment(postId, commentId, "inappropriate"); } catch { /* silent */ }
  }, [postId]);

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

  const handleSave = useCallback(async () => {
    if (!post) return;
    const prev = { saved: post.has_saved, count: post.save_count ?? 0 };
    const nowSaved = !post.has_saved;
    setPost((p) => p ? { ...p, has_saved: nowSaved, save_count: (p.save_count ?? 0) + (nowSaved ? 1 : -1) } : p);
    try { await toggleSave(post.id); }
    catch { setPost((p) => p ? { ...p, has_saved: prev.saved, save_count: prev.count } : p); }
  }, [post]);

  const handleShare = useCallback(async () => {
    const url = window.location.href;
    if (navigator.share) {
      try { await navigator.share({ url, title: post?.caption ?? "Post" }); return; }
      catch { /* fall through */ }
    }
    navigator.clipboard?.writeText(url);
  }, [post]);

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

  /* ── Loading ──────────────────────────────────────────────────────── */
  if (loadingPost) {
    return (
      <div className="flex h-full flex-col app-bg">
        <div className="flex items-center gap-3 px-4 py-3 app-header">
          <button onClick={() => navigate(-1 as any)} className="grid h-9 w-9 place-items-center rounded-full app-surface">
            <ArrowLeft className="h-4 w-4 app-text" />
          </button>
        </div>
        <div className="space-y-4 px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full shimmer flex-shrink-0" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3.5 w-28 rounded-full shimmer" />
              <div className="h-2.5 w-20 rounded-full shimmer" />
            </div>
          </div>
          <div className="h-4 w-full rounded-full shimmer" />
          <div className="h-4 w-3/4 rounded-full shimmer" />
          <div className="shimmer rounded-2xl" style={{ aspectRatio: "4/5" }} />
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

      {/* ── Page header ─────────────────────────────────────────────── */}
      <div
        className="flex items-center gap-3 px-4 py-3 app-header flex-shrink-0"
        style={{ paddingTop: `calc(env(safe-area-inset-top, 0px) + 12px)`, borderBottom: "1px solid rgba(255,255,255,0.06)" }}
      >
        <button
          onClick={() => navigate(-1 as any)}
          className="grid h-9 w-9 place-items-center rounded-full app-surface flex-shrink-0"
        >
          <ArrowLeft className="h-4 w-4 app-text" />
        </button>
        <span className="text-[15px] font-bold app-text flex-1">Post</span>
      </div>

      {/* ── Scrollable body ─────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto scroll-native hide-scrollbar pb-28">

        {/* ── Author row ──────────────────────────────────────────── */}
        <div className="flex items-center gap-3 px-4 pt-4 pb-2">
          <motion.button
            whileTap={{ scale: 0.92 }}
            onClick={() => navigate(isMe ? "/profile" : `/profile/${post.author_id}`)}
            className="flex-shrink-0"
          >
            {post.author?.avatar_url ? (
              <img src={post.author.avatar_url} alt="" className="h-11 w-11 rounded-full object-cover"
                style={{ border: "1.5px solid rgba(255,255,255,0.12)" }} />
            ) : (
              <div className="h-11 w-11 rounded-full grid place-items-center text-base font-bold text-white"
                style={{ background: "linear-gradient(135deg,var(--accent-primary),var(--accent-secondary))" }}>
                {(post.author?.name || "?").charAt(0).toUpperCase()}
              </div>
            )}
          </motion.button>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={() => navigate(isMe ? "/profile" : `/profile/${post.author_id}`)}
                className="text-[15px] font-bold app-text leading-tight"
              >
                {post.author?.name || post.author?.username}
              </motion.button>
              {(post.author?.is_verified || post.author?.is_owner) && (
                <BadgeCheck className="h-4 w-4 flex-shrink-0" style={{ color: "var(--accent-primary)" }} />
              )}
            </div>
            <div className="flex items-center gap-1.5 mt-0.5">
              {post.author?.username && (
                <span className="text-[12px] app-text-muted">@{post.author.username}</span>
              )}
              <span className="text-[11px] app-text-muted opacity-50">·</span>
              <span className="text-[12px] app-text-muted">{relTime(post.created_at)}</span>
            </div>
          </div>

          {!isMe && (
            <motion.button
              whileTap={{ scale: 0.93 }}
              onClick={handleFollow}
              disabled={followWorking}
              className="rounded-full px-4 py-1.5 text-[12px] font-bold transition disabled:opacity-50 flex-shrink-0"
              style={isFollowing
                ? { background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.6)", border: "1px solid rgba(255,255,255,0.12)" }
                : { background: "linear-gradient(135deg,var(--accent-primary),var(--accent-secondary))", color: "white" }
              }
            >
              {isFollowing ? "Following" : "Follow"}
            </motion.button>
          )}
        </div>

        {/* ── Post text / caption — ABOVE media ───────────────────── */}
        {post.caption && (
          <div className="px-4 pb-3">
            <p
              className="text-[15px] leading-relaxed app-text"
              style={{
                display: captionExpand ? "block" : "-webkit-box",
                WebkitLineClamp: captionExpand ? undefined : 12,
                WebkitBoxOrient: "vertical",
                overflow: captionExpand ? "visible" : "hidden",
              } as React.CSSProperties}
            >
              <RichCaption text={post.caption} />
            </p>
            {post.caption.length > 280 && !captionExpand && (
              <button
                onClick={() => setCaptionExpand(true)}
                className="text-xs mt-1"
                style={{ color: "var(--accent-primary)" }}
              >
                See more
              </button>
            )}
          </div>
        )}

        {/* ── Media ───────────────────────────────────────────────── */}
        {media.length > 0 && (
          <div className="relative">
            {currentMedia?.type === "video" ? (
              <VideoPostPlayer url={currentMedia.url} aspectRatio="4/5" sound={post.sound as any} />
            ) : (
              <div style={{ aspectRatio: "4/5", background: "#0a0a0a" }}>
                <img src={currentMedia?.url} alt={post.caption ?? ""} className="h-full w-full object-cover" />
              </div>
            )}

            {media.length > 1 && (
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5 pointer-events-none">
                {media.map((_, i) => (
                  <span key={i}
                    className="rounded-full transition-all"
                    style={{ width: i === mediaIndex ? 16 : 6, height: 6, background: i === mediaIndex ? "white" : "rgba(255,255,255,0.45)" }}
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

            {/* ── TikTok music disc overlay ─────────────────────────── */}
            {post.sound_id && post.sound && currentMedia?.type !== "video" && (
              <MusicDisc sound={post.sound as any} playing={false} size={50} />
            )}
          </div>
        )}

        {/* ── Engagement stats row ────────────────────────────────── */}
        <div
          className="flex items-center gap-3 px-4 py-2.5"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
        >
          {(post.like_count ?? 0) > 0 && (
            <span className="text-[13px] app-text-muted">
              <span className="font-bold app-text">{fmtCount(post.like_count ?? 0)}</span> {post.like_count === 1 ? "like" : "likes"}
            </span>
          )}
          {(post.comment_count ?? 0) > 0 && (
            <span className="text-[13px] app-text-muted">
              <span className="font-bold app-text">{fmtCount(post.comment_count ?? 0)}</span> {post.comment_count === 1 ? "comment" : "comments"}
            </span>
          )}
          <div className="flex-1" />
          <div className="flex items-center gap-1 opacity-50">
            <Eye className="h-3.5 w-3.5" style={{ color: "rgba(255,255,255,0.4)" }} />
            <span className="text-[11px]" style={{ color: "rgba(255,255,255,0.4)" }}>{fmtCount(post.view_count ?? 0)}</span>
          </div>
        </div>

        {/* ── Action bar: Like · Comment · Share · Save ────────────── */}
        <div
          className="flex items-center px-1 py-1"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
        >
          <motion.button whileTap={{ scale: 0.82 }} onClick={handleLike}
            className="flex flex-1 items-center justify-center gap-2 py-2.5 rounded-xl">
            <Heart className="h-5 w-5 transition-colors"
              style={{ fill: post.has_liked ? "#f43f5e" : "none", color: post.has_liked ? "#f43f5e" : "rgba(255,255,255,0.7)" }} />
            <span className="text-[13px] font-semibold" style={{ color: post.has_liked ? "#f43f5e" : "rgba(255,255,255,0.7)" }}>Like</span>
          </motion.button>

          <motion.button whileTap={{ scale: 0.82 }} onClick={() => commentInputRef.current?.focus()}
            className="flex flex-1 items-center justify-center gap-2 py-2.5 rounded-xl">
            <MessageCircle className="h-5 w-5" style={{ color: "rgba(255,255,255,0.7)" }} />
            <span className="text-[13px] font-semibold" style={{ color: "rgba(255,255,255,0.7)" }}>Comment</span>
          </motion.button>

          <motion.button whileTap={{ scale: 0.82 }} onClick={handleShare}
            className="flex flex-1 items-center justify-center gap-2 py-2.5 rounded-xl">
            <Share2 className="h-5 w-5" style={{ color: "rgba(255,255,255,0.7)" }} />
            <span className="text-[13px] font-semibold" style={{ color: "rgba(255,255,255,0.7)" }}>Share</span>
          </motion.button>

          <motion.button whileTap={{ scale: 0.82 }} onClick={handleSave}
            className="flex flex-1 items-center justify-center gap-2 py-2.5 rounded-xl">
            <Bookmark className="h-5 w-5 transition-colors"
              style={{ fill: post.has_saved ? "#a855f7" : "none", color: post.has_saved ? "#a855f7" : "rgba(255,255,255,0.7)" }} />
            <span className="text-[13px] font-semibold" style={{ color: post.has_saved ? "#a855f7" : "rgba(255,255,255,0.7)" }}>Save</span>
          </motion.button>
        </div>

        {/* ── Sound chip (text-only posts — disc is overlaid on media posts) ── */}
        {post.sound_id && media.length === 0 && (
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={() => navigate(`/sounds/${post.sound_id}`)}
            className="mx-4 mt-1 mb-1 flex items-center gap-2.5 rounded-2xl px-3 py-2"
            style={{ background: "rgba(168,85,247,0.1)", border: "1px solid rgba(168,85,247,0.25)" }}
          >
            <div className="relative flex-shrink-0" style={{ width: 32, height: 32 }}>
              <span className="absolute inset-0 rounded-full" style={{ border: "1.5px solid rgba(255,255,255,0.2)" }} />
              <span className="absolute inset-[2px] rounded-full overflow-hidden grid place-items-center"
                style={{ background: "linear-gradient(135deg,#1a1a2e,#2d0a5e)", animation: "discSpin 4s linear infinite", willChange: "transform" }}>
                {post.sound?.cover_image
                  ? <img src={post.sound.cover_image} alt="" className="h-full w-full object-cover rounded-full" draggable={false} />
                  : <span style={{ fontSize: 13 }}>🎵</span>}
              </span>
              <span className="absolute rounded-full" style={{ width: 8, height: 8, top: "50%", left: "50%", transform: "translate(-50%,-50%)", background: "#111" }} />
            </div>
            <div className="flex flex-col items-start min-w-0">
              <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "rgba(168,85,247,0.8)" }}>Sound</span>
              <span className="text-[12px] font-bold app-text truncate max-w-[180px]">{post.sound?.title ?? "Unknown sound"}</span>
            </div>
          </motion.button>
        )}

        {/* ── Support Creator button (monetised only) ──────────────── */}
        {showSupportButton && (
          <div className="px-4 py-3" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={() => setStarsOpen(true)}
              className="w-full flex items-center justify-center gap-2 rounded-2xl py-3 text-[14px] font-bold"
              style={{
                background: "rgba(251,191,36,0.1)",
                border: "1.5px solid rgba(251,191,36,0.3)",
                color: "#fbbf24",
              }}
            >
              <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
              Support Creator
            </motion.button>
          </div>
        )}

        {/* ── Comments section ─────────────────────────────────────── */}
        <div className="px-4 pt-4">
          <h3 className="text-[12px] font-bold app-text-muted uppercase tracking-wide mb-3">
            {comments.length > 0 ? `${comments.length} Comment${comments.length !== 1 ? "s" : ""}` : "Comments"}
          </h3>

          {loadingComments ? (
            <div className="space-y-4 py-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex gap-3">
                  <div className="h-9 w-9 rounded-full shimmer flex-shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-16 rounded-2xl shimmer" />
                  </div>
                </div>
              ))}
            </div>
          ) : comments.length === 0 ? (
            <p className="text-sm app-text-muted py-6 text-center">No comments yet. Be the first!</p>
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

      {/* ── Sticky comment input ──────────────────────────────────── */}
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
            placeholder="Write a comment…"
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

      {/* ── Send Stars modal ─────────────────────────────────────── */}
      {starsOpen && post.author && (
        <SendStarsModal
          creator={{
            id:         post.author_id,
            name:       post.author.name ?? null,
            username:   post.author.username ?? null,
            avatar_url: post.author.avatar_url ?? null,
          }}
          onClose={() => setStarsOpen(false)}
        />
      )}
    </div>
  );
}
