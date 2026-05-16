import { useLocation, useRoute } from "wouter";
import { motion } from "framer-motion";
import { ArrowLeft, Heart, MessageCircle, Share2, Bookmark, Play } from "lucide-react";
import { useState } from "react";
import { useAppStore } from "@/lib/store";
import { supabase } from "@/lib/supabase";
import { VideoPlayerModal } from "@/components/ui/VideoPlayerModal";

export default function PostDetail() {
  const [, params] = useRoute("/post/:id");
  const [, navigate] = useLocation();
  const post = useAppStore((s) => s.posts.find((p) => p.id === params?.id));
  const toggleLike = useAppStore((s) => s.toggleLike);
  const toggleSavePost = useAppStore((s) => s.toggleSavePost);
  const savedPostIds = useAppStore((s) => s.savedPostIds);
  const [videoOpen, setVideoOpen] = useState(false);

  if (!post) {
    return (
      <div className="grid h-full place-items-center text-white/60">
        <button onClick={() => navigate("/")} className="text-sm underline">Back to feed</button>
      </div>
    );
  }

  const author = useAppStore.getState().user;
  const hasVideo = Boolean(post.videoUrl);
  const isSaved = savedPostIds.includes(post.id);

  const handleShare = async () => {
    if (navigator.share) {
      try { await navigator.share({ url: post.imageUrl, title: post.prompt }); }
      catch { navigator.clipboard?.writeText(post.imageUrl); }
    } else {
      navigator.clipboard?.writeText(post.imageUrl);
    }
  };

  return (
    <>
      <div className="flex h-full flex-col">
        <div
          className="absolute inset-x-0 top-0 z-20 flex items-center justify-between px-4"
          style={{ paddingTop: `calc(env(safe-area-inset-top, 0px) + 14px)` }}
        >
          <button onClick={() => navigate("/")} className="grid h-9 w-9 place-items-center rounded-full bg-black/55 border border-white/15 text-white backdrop-blur-md">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <motion.button
            whileTap={{ scale: 0.88 }}
            onClick={() => toggleSavePost(post.id)}
            className={
              "grid h-9 w-9 place-items-center rounded-full backdrop-blur-md border transition " +
              (isSaved
                ? "bg-purple-600/70 border-purple-400/40 text-white"
                : "bg-black/55 border-white/15 text-white")
            }
          >
            <Bookmark className={"h-4 w-4 " + (isSaved ? "fill-white" : "")} />
          </motion.button>
        </div>

        <motion.div
          initial={{ opacity: 0, scale: 1.02 }} animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
          className="relative h-full w-full"
        >
          <img src={post.imageUrl} alt={post.prompt} className="absolute inset-0 h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/30 to-black/30" />

          {/* Play button — only for real videos */}
          {hasVideo && (
            <button onClick={() => setVideoOpen(true)} className="absolute inset-0 grid place-items-center">
              <motion.span
                whileTap={{ scale: 0.88 }}
                className="grid h-16 w-16 place-items-center rounded-full border border-white/25 bg-gradient-to-br from-purple-600/80 via-pink-500/80 to-blue-500/80 backdrop-blur-xl shadow-[0_0_40px_8px_rgba(168,85,247,0.45)]"
              >
                <Play className="h-7 w-7 fill-white text-white" />
              </motion.span>
            </button>
          )}

          {post.duration && (
            <span className="absolute right-4 top-16 rounded-full bg-black/55 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur-md">
              {post.duration}
            </span>
          )}

          <div
            className="absolute inset-x-0 bottom-0 px-5"
            style={{ paddingBottom: `calc(env(safe-area-inset-bottom, 0px) + 28px)` }}
          >
            <div className="flex items-center gap-2.5">
              <img src={author?.avatar} alt="" className="h-10 w-10 rounded-full border border-white/20 object-cover" />
              <div className="flex-1">
                <div className="text-sm font-semibold text-white">@{author?.handle}</div>
                <div className="text-[11px] text-white/65">{author?.name}</div>
              </div>
              <FollowButton authorId={post.authorId} />
            </div>

            <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-white/90">{post.prompt}</p>

            <div className="mt-4 flex items-center gap-3">
              <ActionBtn icon={Heart} label={fmtCount(post.likes)} active={post.hasLiked} onClick={() => toggleLike(post.id)} />
              <ActionBtn icon={MessageCircle} label="Reply" />
              <ActionBtn icon={Share2} label="Share" onClick={handleShare} />
              <ActionBtn
                icon={Bookmark}
                label={isSaved ? "Saved" : "Save"}
                active={isSaved}
                onClick={() => toggleSavePost(post.id)}
              />
            </div>
          </div>
        </motion.div>
      </div>

      {hasVideo && (
        <VideoPlayerModal videoUrl={post.videoUrl!} posterUrl={post.imageUrl} open={videoOpen} onClose={() => setVideoOpen(false)} />
      )}
    </>
  );
}

function FollowButton({ authorId }: { authorId: string }) {
  const me                 = useAppStore((s) => s.user);
  const followedUserIds    = useAppStore((s) => s.followedUserIds);
  const setFollowedUserIds = useAppStore((s) => s.setFollowedUserIds);
  const [working, setWorking] = useState(false);

  if (authorId === me?.id || authorId === "me") return null;

  const isFollowing = followedUserIds.includes(authorId);

  const handleToggle = async () => {
    if (working) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return;
    setWorking(true);
    try {
      if (isFollowing) {
        const { error } = await supabase.rpc("unfollow_user", { target_id: authorId });
        if (!error) setFollowedUserIds(followedUserIds.filter((id) => id !== authorId));
      } else {
        const { error } = await supabase.rpc("follow_user", { target_id: authorId });
        if (!error) setFollowedUserIds([...followedUserIds, authorId]);
      }
    } finally {
      setWorking(false);
    }
  };

  return (
    <motion.button
      whileTap={{ scale: 0.94 }}
      onClick={handleToggle}
      disabled={working}
      className={
        "rounded-full px-3.5 py-1.5 text-xs font-semibold transition disabled:opacity-60 " +
        (isFollowing
          ? "border border-white/20 bg-white/10 text-white/75"
          : "bg-gradient-to-r from-purple-600 to-pink-500 text-white")
      }
    >
      {isFollowing ? "Following" : "Follow"}
    </motion.button>
  );
}

function ActionBtn({
  icon: Icon, label, active, onClick,
}: { icon: typeof Heart; label: string; active?: boolean; onClick?: () => void }) {
  return (
    <motion.button
      whileTap={{ scale: 0.92 }} onClick={onClick}
      className="flex items-center gap-1.5 rounded-full bg-white/8 border border-white/15 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur-md"
    >
      <Icon className={"h-4 w-4 " + (active ? "fill-pink-500 text-pink-500" : "text-white")} />
      {label}
    </motion.button>
  );
}

function fmtCount(n: number) {
  if (n < 1000) return n.toString();
  return (n / 1000).toFixed(1) + "k";
}
