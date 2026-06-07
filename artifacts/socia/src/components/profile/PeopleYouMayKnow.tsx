/**
 * PeopleYouMayKnow.tsx — "People You May Know" section.
 *
 * Algorithm (client-side, no extra API route):
 *   1. Get everyone the viewer already follows.
 *   2. Get all the people THOSE accounts follow (2nd-degree network).
 *   3. Rank by how many mutual connections they share with the viewer.
 *   4. Exclude: viewer themselves, people already followed, and an
 *      optional `excludeId` (the profile owner on UserProfile pages).
 *   5. Show top 6 with skeleton loading + empty-state handling.
 */
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useLocation } from "wouter";
import { UserPlus, Sparkles } from "lucide-react";
import { supabase } from "@/lib/supabase";

interface Suggestion {
  id: string;
  name: string | null;
  username: string | null;
  avatar_url: string | null;
  mutualCount: number;
}

interface Props {
  viewerId?: string | null;
  excludeId?: string | null;
}

export function PeopleYouMayKnow({ viewerId, excludeId }: Props) {
  const [, navigate] = useLocation();
  const [suggestions,  setSuggestions]  = useState<Suggestion[]>([]);
  const [following,    setFollowing]    = useState<Set<string>>(new Set());
  const [loading,      setLoading]      = useState(true);
  const [followed,     setFollowed]     = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!viewerId) { setLoading(false); return; }

    let alive = true;

    async function load() {
      try {
        // 1. Viewer's current following list
        const { data: myFollowing } = await supabase
          .from("follows")
          .select("following_id")
          .eq("follower_id", viewerId!);

        const myFollowingIds = (myFollowing ?? []).map((r: any) => r.following_id as string);
        const myFollowingSet = new Set(myFollowingIds);
        if (alive) setFollowing(myFollowingSet);

        if (myFollowingIds.length === 0) {
          // No followings → suggest active users (most followed)
          const { data: popular } = await supabase
            .from("users")
            .select("id, name, username, avatar_url, followers")
            .neq("id", viewerId!)
            .order("followers", { ascending: false })
            .limit(6);

          if (alive) {
            setSuggestions(
              (popular ?? [])
                .filter((u: any) => u.id !== excludeId)
                .slice(0, 6)
                .map((u: any) => ({ ...u, mutualCount: 0 })),
            );
            setLoading(false);
          }
          return;
        }

        // 2. Fetch who each of the viewer's followings also follows (2nd degree)
        const cap = myFollowingIds.slice(0, 40);
        const { data: secondDegree } = await supabase
          .from("follows")
          .select("following_id")
          .in("follower_id", cap)
          .neq("following_id", viewerId!);

        // 3. Count mutual score
        const scoreMap = new Map<string, number>();
        for (const row of (secondDegree ?? []) as { following_id: string }[]) {
          const id = row.following_id;
          if (myFollowingSet.has(id)) continue;           // already following
          if (id === viewerId)         continue;           // self
          if (id === excludeId)        continue;           // profile owner
          scoreMap.set(id, (scoreMap.get(id) ?? 0) + 1);
        }

        if (scoreMap.size === 0) { if (alive) setLoading(false); return; }

        // 4. Sort by score, take top 6
        const topIds = [...scoreMap.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 6)
          .map(([id]) => id);

        const { data: users } = await supabase
          .from("users")
          .select("id, name, username, avatar_url")
          .in("id", topIds);

        if (alive) {
          const userMap = new Map((users ?? []).map((u: any) => [u.id, u]));
          setSuggestions(
            topIds
              .filter(id => userMap.has(id))
              .map(id => ({ ...(userMap.get(id) as any), mutualCount: scoreMap.get(id) ?? 0 })),
          );
          setLoading(false);
        }
      } catch {
        if (alive) setLoading(false);
      }
    }

    load();
    return () => { alive = false; };
  }, [viewerId, excludeId]);

  async function handleFollow(userId: string) {
    if (!viewerId) return;
    setFollowed(prev => new Set(prev).add(userId));
    await supabase.from("follows").insert({ follower_id: viewerId, following_id: userId }).select();
  }

  if (loading) {
    return (
      <div className="mx-4 mb-4 rounded-[18px] overflow-hidden"
        style={{ border: "1px solid var(--s-border-a)", background: "rgba(255,255,255,0.025)" }}>
        <div className="flex items-center gap-2 px-4 pt-3.5 pb-2">
          <Sparkles style={{ width: 13, height: 13, color: "#a855f7" }} />
          <span className="text-[13px] font-bold app-text">People You May Know</span>
        </div>
        <div className="px-4 pb-3.5 space-y-3">
          {[0, 1, 2].map(i => (
            <div key={i} className="flex items-center gap-3 animate-pulse">
              <div className="h-9 w-9 rounded-full bg-white/10 flex-shrink-0" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 w-28 rounded bg-white/10" />
                <div className="h-2.5 w-20 rounded bg-white/[0.06]" />
              </div>
              <div className="h-7 w-16 rounded-full bg-white/[0.07]" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (suggestions.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22 }}
      className="mx-4 mb-4 rounded-[18px] overflow-hidden"
      style={{ border: "1px solid var(--s-border-a)", background: "rgba(255,255,255,0.025)" }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-3.5 pb-2">
        <div className="flex items-center gap-2">
          <Sparkles style={{ width: 13, height: 13, color: "#a855f7" }} />
          <span className="text-[13px] font-bold app-text">People You May Know</span>
        </div>
      </div>

      {/* Suggestion list */}
      <div className="px-4 pb-3.5 space-y-3">
        {suggestions.map((user) => {
          const isFollowed  = followed.has(user.id) || following.has(user.id);
          const initial     = (user.name ?? user.username ?? "?")[0]?.toUpperCase();

          return (
            <div key={user.id} className="flex items-center gap-3">
              {/* Avatar */}
              <button
                onClick={() => navigate(`/profile/${user.id}`)}
                className="h-9 w-9 overflow-hidden rounded-full flex-shrink-0"
              >
                {user.avatar_url ? (
                  <img src={user.avatar_url} alt={user.name ?? ""}
                    className="h-full w-full object-cover" loading="lazy" />
                ) : (
                  <div className="h-full w-full bg-gradient-to-br from-purple-600 to-pink-500 grid place-items-center">
                    <span className="text-[11px] font-bold text-white">{initial}</span>
                  </div>
                )}
              </button>

              {/* Name / mutual count */}
              <button
                onClick={() => navigate(`/profile/${user.id}`)}
                className="flex-1 text-left min-w-0"
              >
                <p className="text-[13px] font-semibold app-text truncate">
                  {user.name ?? user.username ?? "Unknown"}
                </p>
                <p className="text-[11px] app-text-muted truncate">
                  {user.mutualCount > 0
                    ? `${user.mutualCount} mutual connection${user.mutualCount > 1 ? "s" : ""}`
                    : `@${user.username ?? ""}`}
                </p>
              </button>

              {/* Follow button */}
              <button
                onClick={() => !isFollowed && handleFollow(user.id)}
                disabled={isFollowed}
                className="flex items-center gap-1 rounded-full px-3 py-1.5 text-[11px] font-bold transition-all flex-shrink-0"
                style={isFollowed ? {
                  background: "rgba(255,255,255,0.06)",
                  border:     "1px solid rgba(255,255,255,0.1)",
                  color:      "rgba(255,255,255,0.35)",
                } : {
                  background: "linear-gradient(135deg,rgba(168,85,247,0.22),rgba(59,130,246,0.12))",
                  border:     "1px solid rgba(168,85,247,0.5)",
                  color:      "#a855f7",
                }}
              >
                <UserPlus style={{ width: 10, height: 10 }} />
                {isFollowed ? "Following" : "Follow"}
              </button>
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}
