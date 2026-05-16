import { useMemo, useState } from "react";
import { useAppStore } from "@/lib/store";
import { FeedCard } from "@/components/feed/FeedCard";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { Flame, Sparkles } from "lucide-react";
import { CommunityFunding } from "@/components/home/CommunityFunding";

type FeedTab = "for-you" | "following";

const TRENDING_PROMPTS = [
  "Neon city at midnight",
  "Anime warrior queen",
  "Surreal dreamscape forest",
  "Glitchcore portrait",
  "Cinematic ocean sunset",
  "3D abstract orb",
];

export default function Home() {
  const posts            = useAppStore((s) => s.posts);
  const followedUserIds  = useAppStore((s) => s.followedUserIds);
  const setActivePrompt  = useAppStore((s) => s.setActivePrompt);
  const [, navigate]     = useLocation();
  const [feedTab, setFeedTab] = useState<FeedTab>("for-you");

  const handlePromptTap = (p: string) => {
    setActivePrompt(p);
    navigate("/create/prompt-image");
  };

  const displayPosts = useMemo(() => {
    if (feedTab === "following") {
      const filtered = posts.filter((p) => followedUserIds.includes(p.authorId));
      return filtered.length > 0 ? filtered : posts.slice(0, 4);
    }
    return posts;
  }, [posts, feedTab, followedUserIds]);

  return (
    <div className="app-bg pb-28 scroll-native gpu h-full overflow-y-auto hide-scrollbar">
      {/* For You / Following tab switcher */}
      <div className="app-header sticky top-0 z-10 flex items-center gap-1 px-4 py-2">
        {(["for-you", "following"] as FeedTab[]).map((t) => (
          <motion.button
            key={t}
            whileTap={{ scale: 0.95 }}
            onClick={() => setFeedTab(t)}
            className="relative rounded-full px-4 py-1.5 text-[12px] font-semibold"
            style={{ color: feedTab === t ? "hsl(var(--foreground))" : "var(--s-text-muted)" }}
          >
            {feedTab === t && (
              <motion.span
                layoutId="feedTab"
                className="absolute inset-0 rounded-full app-surface"
                transition={{ type: "spring", stiffness: 480, damping: 34 }}
              />
            )}
            <span className="relative">{t === "for-you" ? "For You" : "Following"}</span>
          </motion.button>
        ))}
      </div>

      <div className="px-4 pt-4">
        {/* Trending prompts */}
        <section className="mb-5">
          <div className="mb-2.5 flex items-center gap-1.5 px-0.5">
            <Flame style={{ width: 13, height: 13, color: "var(--accent-primary)" }} />
            <h3 className="text-[10.5px] font-semibold uppercase tracking-[0.09em] app-text-muted">Trending</h3>
          </div>
          <div className="hide-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
            {TRENDING_PROMPTS.map((p, i) => (
              <motion.button
                key={p}
                whileTap={{ scale: 0.91 }}
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.018, type: "spring", stiffness: 380, damping: 28 }}
                onClick={() => handlePromptTap(p)}
                className="app-surface shrink-0 rounded-full px-3.5 py-1.5 text-xs app-text"
                style={{ whiteSpace: "nowrap" }}
              >
                {p}
              </motion.button>
            ))}
          </div>
        </section>

        {/* Community Funding */}
        <CommunityFunding />

        {/* Feed header */}
        <div className="mb-3 flex items-end justify-between px-0.5">
          <div>
            <h2 className="font-display text-[18px] font-bold app-text leading-tight">
              {feedTab === "for-you" ? "Recent Creations" : "From People You Follow"}
            </h2>
            <p className="text-[11px] app-text-muted mt-0.5">
              {feedTab === "for-you" ? "Fresh from the collective imagination" : `${displayPosts.length} posts`}
            </p>
          </div>
          <motion.button
            whileTap={{ scale: 0.88 }}
            onClick={() => navigate("/create")}
            className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11.5px] font-semibold text-white"
            style={{ background: "linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))" }}
          >
            <Sparkles style={{ width: 11, height: 11 }} /> Create
          </motion.button>
        </div>

        {/* Feed grid */}
        {displayPosts.length === 0 ? (
          <div className="grid place-items-center py-20 text-center">
            <div className="float grid h-16 w-16 place-items-center rounded-full app-surface mb-4">
              <Sparkles className="app-text-muted" style={{ width: 26, height: 26 }} />
            </div>
            <p className="font-display text-base font-semibold app-text">No posts yet</p>
            <p className="mt-1 text-xs app-text-muted">Follow creators to see their posts here.</p>
            <motion.button whileTap={{ scale: 0.95 }} onClick={() => setFeedTab("for-you")}
              className="mt-4 rounded-full px-5 py-2 text-sm font-semibold text-white"
              style={{ background: "linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))" }}>
              Browse For You
            </motion.button>
          </div>
        ) : (
          <div className="columns-2 gap-3">
            {displayPosts.map((p, i) => <FeedCard key={p.id} post={p} index={i} />)}
          </div>
        )}
      </div>
    </div>
  );
}
