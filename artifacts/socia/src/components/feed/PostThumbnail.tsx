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
        style={{ aspectRatio: aspect, border: "1.2px solid rgba(255,255,255,0.06)" }}
      >
        {isVideo ? (
          <video
            src={thumbUrl}
            className="h-full w-full object-contain"
            muted
            playsInline
            preload="metadata"
          />
        ) : (
          <img
            src={thumbUrl}
            alt={post.caption ?? ""}
            className="h-full w-full object-contain"
            loading="lazy"
            draggable={false}
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
              <path d="M12 21s-7-4.35-9-7.27C1.4 11.53 3 7 7 5c2.24-1.21 4.76-.7 5 0 .24-.7 2.76-1.21 5 0 4 2 5.6 6.53 4 8.73-2 2.92-9 7.27-9 7.27z" />
            </svg>
            <span className="text-xs font-semibold text-white">{post.like_count}</span>
          </div>
        )}

      </motion.div>
    </motion.div>
  );
}
