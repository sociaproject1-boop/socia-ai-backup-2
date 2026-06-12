/**
 * MutualConnections.tsx — Mutual friends section on another user's profile.
 * Shows people who follow the profile AND are followed by the viewer.
 * Displays: count badge, avatar stack, names, "See All" link.
 */
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useLocation } from "wouter";
import { Users } from "lucide-react";
import { supabase } from "@/lib/supabase";

interface MutualUser {
  id: string;
  name: string | null;
  username: string | null;
  avatar_url: string | null;
}

interface Props {
  profileUserId: string;
  viewerId?: string | null;
}

export function MutualConnections({ profileUserId, viewerId }: Props) {
  const [, navigate]     = useLocation();
  const [mutuals,        setMutuals]       = useState<MutualUser[]>([]);
  const [totalMutuals,   setTotalMutuals]  = useState(0);
  const [loading,        setLoading]       = useState(true);

  useEffect(() => {
    if (!viewerId || viewerId === profileUserId) {
      setLoading(false);
      return;
    }

    let alive = true;

    async function load() {
      try {
        const [profileFollowersRes, viewerFollowingRes] = await Promise.all([
          supabase.from("follows").select("follower_id").eq("following_id", profileUserId),
          supabase.from("follows").select("following_id").eq("follower_id", viewerId!),
        ]);

        const followerIds  = new Set((profileFollowersRes.data ?? []).map((f: any) => f.follower_id as string));
        const followingIds = (viewerFollowingRes.data ?? []).map((f: any) => f.following_id as string);
        const mutualIds    = followingIds.filter(id => followerIds.has(id) && id !== viewerId);

        if (!alive) return;
        setTotalMutuals(mutualIds.length);

        if (mutualIds.length === 0) { setLoading(false); return; }

        const { data: users } = await supabase
          .from("users")
          .select("id, name, username, avatar_url")
          .in("id", mutualIds.slice(0, 5));

        if (alive) {
          setMutuals(users ?? []);
          setLoading(false);
        }
      } catch {
        if (alive) setLoading(false);
      }
    }

    load();
    return () => { alive = false; };
  }, [profileUserId, viewerId]);

  if (loading || totalMutuals === 0) return null;

  const shown = mutuals.slice(0, 4);
  const extra = totalMutuals - shown.length;

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
          <Users style={{ width: 13, height: 13, color: "#a855f7" }} />
          <span className="text-[13px] font-bold app-text">
            {totalMutuals} mutual {totalMutuals === 1 ? "friend" : "friends"}
          </span>
        </div>
        <button
          onClick={() => navigate(`/friends/${profileUserId}`)}
          className="text-[12px] font-semibold"
          style={{ color: "var(--accent-primary)" }}
        >
          See all
        </button>
      </div>

      {/* Avatar stack + names */}
      <div className="px-4 pb-3.5 flex items-center gap-3">
        {/* Overlapping avatars */}
        <div className="flex flex-shrink-0">
          {shown.map((u, i) => (
            <div
              key={u.id}
              className="h-8 w-8 overflow-hidden rounded-full flex-shrink-0"
              style={{
                marginLeft: i === 0 ? 0 : -10,
                zIndex: shown.length - i,
                border: "2px solid rgba(0,0,0,0.7)",
                position: "relative",
              }}
            >
              {u.avatar_url ? (
                <img src={u.avatar_url} alt={u.name ?? ""} className="h-full w-full object-cover" loading="lazy" />
              ) : (
                <div className="h-full w-full bg-[#1D9BF0] grid place-items-center">
                  <span className="text-[9px] font-bold text-white">
                    {(u.name ?? u.username ?? "?")[0]?.toUpperCase()}
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Name list */}
        <p className="text-[11.5px] text-white/45 leading-snug flex-1 min-w-0">
          {shown.slice(0, 2).map(u => u.name ?? u.username ?? "Someone").join(", ")}
          {extra > 0 && (
            <span className="text-white/55 font-semibold"> and {extra} more</span>
          )}
        </p>
      </div>
    </motion.div>
  );
}
