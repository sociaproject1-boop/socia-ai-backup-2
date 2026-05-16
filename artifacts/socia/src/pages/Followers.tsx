/**
 * Followers.tsx + Following.tsx (single component, mode prop)
 * Lists the users who follow / are followed by a target user.
 * Route: /followers/:id and /following/:id (mode chosen in App.tsx).
 */
import { useEffect, useState } from "react";
import { useRoute, useLocation } from "wouter";
import { motion } from "framer-motion";
import { ArrowLeft } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { DbUser } from "@/lib/supabase";
import { NameBadges, OnlineDot } from "@/components/Badges";

interface Props { mode: "followers" | "following" }

export default function FollowList({ mode }: Props) {
  const route        = mode === "followers" ? "/followers/:id" : "/following/:id";
  const [, params]   = useRoute(route);
  const [, navigate] = useLocation();
  const targetId     = params?.id ?? "";

  const [users,   setUsers]   = useState<DbUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    if (!targetId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      /* Step 1 — pull the relevant id list from `follows` */
      const select   = mode === "followers" ? "follower_id"  : "following_id";
      const filterCol = mode === "followers" ? "following_id" : "follower_id";
      const { data: rows, error: rowsErr } = await supabase
        .from("follows")
        .select(select)
        .eq(filterCol, targetId)
        .order("created_at", { ascending: false });

      if (cancelled) return;
      if (rowsErr) {
        setError(rowsErr.message);
        setLoading(false);
        return;
      }
      const ids = (rows ?? []).map((r: any) => r[select]).filter(Boolean);
      if (ids.length === 0) {
        setUsers([]);
        setLoading(false);
        return;
      }

      /* Step 2 — fetch the actual user rows */
      const { data: usersRes, error: usersErr } = await supabase
        .from("users")
        .select("*")
        .in("id", ids);

      if (cancelled) return;
      if (usersErr) {
        setError(usersErr.message);
        setLoading(false);
        return;
      }
      setUsers((usersRes as DbUser[]) ?? []);
      setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [targetId, mode]);

  return (
    <div className="app-bg flex h-full flex-col">
      <div
        className="app-header flex items-center gap-3 px-4 py-3"
        style={{ borderBottom: "1px solid var(--s-border-a)" }}
      >
        <button
          onClick={() => (history.length > 1 ? history.back() : navigate("/"))}
          aria-label="Back"
          className="app-surface grid h-9 w-9 place-items-center rounded-full app-text"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <h1 className="text-base font-semibold app-text capitalize">{mode}</h1>
      </div>

      <div className="flex-1 overflow-y-auto hide-scrollbar px-4 pb-12 pt-3">
        {loading && (
          <div className="grid place-items-center py-16 app-text-muted text-sm">Loading…</div>
        )}
        {!loading && error && (
          <div className="app-card rounded-[14px] p-4 text-sm" style={{ color: "#ef4444" }}>
            {error}
          </div>
        )}
        {!loading && !error && users.length === 0 && (
          <div className="grid place-items-center py-16 text-center">
            <p className="text-sm font-semibold app-text">
              {mode === "followers" ? "No followers yet" : "Not following anyone yet"}
            </p>
            <p className="mt-1 text-xs app-text-muted">
              When this happens you'll see them here.
            </p>
          </div>
        )}
        {!loading && !error && users.length > 0 && (
          <ul className="space-y-2">
            {users.map((u, i) => {
              const initials = (u.name || u.username || "?").charAt(0).toUpperCase();
              return (
                <motion.li
                  key={u.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.02 }}
                >
                  <button
                    onClick={() => navigate(`/profile/${u.id}`)}
                    className="app-card flex w-full items-center gap-3 rounded-[16px] p-3"
                  >
                    <div className="relative">
                      <div
                        className="h-11 w-11 overflow-hidden rounded-full"
                        style={{ border: "1.5px solid var(--s-border-a)" }}
                      >
                        {u.avatar_url ? (
                          <img src={u.avatar_url} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <div className="grid h-full w-full place-items-center bg-gradient-to-br from-purple-600 via-pink-500 to-blue-600 text-base font-bold text-white">
                            {initials}
                          </div>
                        )}
                      </div>
                      <div className="absolute -bottom-0.5 -right-0.5">
                        <OnlineDot online={Boolean(u.is_online)} />
                      </div>
                    </div>
                    <div className="min-w-0 flex-1 text-left">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-sm font-semibold app-text">
                          {u.name || u.username || "Unknown"}
                        </span>
                        <NameBadges
                          isOwner={u.is_owner}
                          isVerified={u.is_verified}
                          size="sm"
                        />
                      </div>
                      {u.username && (
                        <div className="text-xs app-text-muted truncate">@{u.username}</div>
                      )}
                    </div>
                  </button>
                </motion.li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
