/**
 * MutualConnections.tsx — Social proof section showing mutual connections.
 * Shows followers of the profile who are also followed by the viewer.
 * Uses Supabase directly for the intersection query.
 */
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
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
  const [mutuals, setMutuals] = useState<MutualUser[]>([]);
  const [totalMutuals, setTotalMutuals] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!viewerId || viewerId === profileUserId) {
      setLoading(false);
      return;
    }

    let alive = true;

    async function load() {
      try {
        /* People who follow the profile */
        const { data: profileFollowers } = await supabase
          .from("follows")
          .select("follower_id")
          .eq("following_id", profileUserId);

        /* People the viewer follows */
        const { data: viewerFollowing } = await supabase
          .from("follows")
          .select("following_id")
          .eq("follower_id", viewerId);

        const followerIds = new Set((profileFollowers ?? []).map((f: any) => f.follower_id as string));
        const followingIds = (viewerFollowing ?? []).map((f: any) => f.following_id as string);

        const mutualIds = followingIds.filter(id => followerIds.has(id) && id !== viewerId);

        if (!alive) return;
        setTotalMutuals(mutualIds.length);

        if (mutualIds.length === 0) {
          setLoading(false);
          return;
        }

        /* Fetch user data for first 5 mutuals */
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

  if (loading || mutuals.length === 0) return null;

  const shown = mutuals.slice(0, 4);
  const extra = totalMutuals - shown.length;
  const label = totalMutuals === 1
    ? `Connected through ${mutuals[0]?.name ?? mutuals[0]?.username ?? "a shared connection"}`
    : `People in your network`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="flex items-center gap-2.5 px-4 py-2"
    >
      {/* Avatar stack */}
      <div className="flex items-center" style={{ marginRight: shown.length > 1 ? (shown.length - 1) * 6 : 0 }}>
        {shown.map((u, i) => (
          <div
            key={u.id}
            className="relative h-[22px] w-[22px] overflow-hidden rounded-full"
            style={{
              marginLeft: i === 0 ? 0 : -8,
              zIndex: shown.length - i,
              border: "1.5px solid rgba(0,0,0,0.8)",
            }}
          >
            {u.avatar_url ? (
              <img src={u.avatar_url} alt={u.name ?? ""} className="h-full w-full object-cover" loading="lazy" />
            ) : (
              <div className="h-full w-full bg-gradient-to-br from-purple-600 to-pink-500 grid place-items-center">
                <span className="text-[7px] font-bold text-white">
                  {(u.name ?? u.username ?? "?")[0]?.toUpperCase()}
                </span>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Label */}
      <p className="text-[11px] text-white/40 leading-snug flex-1 min-w-0">
        {label}
        {extra > 0 && (
          <span className="text-white/55 font-semibold"> +{extra} more</span>
        )}
      </p>
    </motion.div>
  );
}
