/**
 * PostThumbnail.tsx — Compact masonry thumbnail for profile grids.
 *
 * Accepts the old store `Post` type OR a minimal shape from backend.
 * Used in Profile.tsx and UserProfile.tsx masonry grids.
 */
import { motion } from "framer-motion";
import { useLocation } from "wouter";
import { Play, Images } from "lucide-react";
import type { SocialPost } from "@/lib/postsClient";

interface Props {
  post: SocialPost;
  index: number;
}

export function PostThumbnail({ post, index }: Props) {
  const [, navigate] = useLocation();

  const firstMedia = post.media?.[0];
  const isVideo    = firstMedia?.type === "video";
  const isMulti    = post.media?.length > 1;
  const thumbUrl   = firstMedia?.url ?? "";

  const aspect = index % 5 === 0 ? "3/4" : index % 7 === 0 ? "1/1" : "9/13";

  if (!thumbUrl) return null;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.22, delay: Math.min(index * 0.018, 0.15) }}
      className="break-inside-avoid mb-3"
    >
      <motion.div
        whileTap={{ scale: 0.96 }}
        onClick={() => navigate(`/post/${post.id}`)}
        className="relative overflow-hidden rounded-[16px] bg-white/5 cursor-pointer"
        style={{ aspectRatio: aspect }}
      >
        {isVideo ? (
          <video
            src={thumbUrl}
            className="h-full w-full object-cover"
            muted
            playsInline
            preload="metadata"
          />
        ) : (
          <img
            src={thumbUrl}
            alt={post.caption ?? ""}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        )}

        {/* Gradient */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />

        {/* Video badge */}
        {isVideo && (
          <div className="absolute left-2 top-2 grid h-6 w-6 place-items-center rounded-full bg-black/60 backdrop-blur-sm">
            <Play className="h-3 w-3 fill-white text-white" />
          </div>
        )}

        {/* Multi badge */}
        {isMulti && !isVideo && (
          <div className="absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-full bg-black/60 backdrop-blur-sm">
            <Images className="h-3 w-3 text-white" />
          </div>
        )}

        {/* Like count */}
        {(post.like_count ?? 0) > 0 && (
          <div className="absolute bottom-2 left-2 flex items-center gap-1">
            <svg viewBox="0 0 24 24" fill="white" className="h-3 w-3">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
            </svg>
            <span className="text-[10px] font-semibold text-white">
              {post.like_count > 999 ? `${(post.like_count / 1000).toFixed(1)}k` : post.like_count}
            </span>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
