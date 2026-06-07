/**
 * Friends.tsx — /friends/:id
 * Shows mutual-follow connections ("friends") for a user.
 * Includes search, infinite scroll (25 per page), and profile-card navigation.
 */
import { useEffect, useState, useCallback, useRef } from "react";
import { useRoute, useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Search, X, Users } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { NameBadges, OnlineDot } from "@/components/Badges";
import { useAuth } from "@/lib/authContext";

interface FriendUser {
  id:          string;
  name:        string;
  username:    string;
  avatar_url:  string;
  bio?:        string;
  is_owner?:   boolean;
  is_verified?: boolean;
  is_online?:  boolean;
  followers?:  number;
}

const PAGE = 25;

export default function Friends() {
  const [, params]   = useRoute("/friends/:id");
  const [, navigate] = useLocation();
  const { supabaseUser } = useAuth();
  const targetId = params?.id ?? "";

  const [allFriends, setAllFriends]   = useState<FriendUser[]>([]);
  const [displayed,  setDisplayed]    = useState<FriendUser[]>([]);
  const [query,      setQuery]        = useState("");
  const [loading,    setLoading]      = useState(true);
  const [page,       setPage]         = useState(1);
  const [ownerName,  setOwnerName]    = useState("");
  const sentinelRef = useRef<HTMLDivElement>(null);

  /* ── Load all mutual IDs then fetch user rows ────────────────────────── */
  useEffect(() => {
    if (!targetId) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const [flrsRes, flngRes] = await Promise.all([
          supabase.from("follows").select("follower_id").eq("following_id", targetId),
          supabase.from("follows").select("following_id").eq("follower_id", targetId),
        ]);
        const followerIds  = new Set((flrsRes.data ?? []).map((r: any) => r.follower_id  as string));
        const followingIds = new Set((flngRes.data ?? []).map((r: any) => r.following_id as string));
        const mutualIds    = [...followerIds].filter((id) => followingIds.has(id));

        if (mutualIds.length === 0) {
          if (!cancelled) { setAllFriends([]); setLoading(false); }
          return;
        }

        const [usersRes, ownerRes] = await Promise.all([
          supabase.from("users").select("id,name,username,avatar_url,bio,is_owner,is_verified,is_online,followers").in("id", mutualIds),
          supabase.from("users").select("name").eq("id", targetId).maybeSingle(),
        ]);
        if (!cancelled) {
          setAllFriends((usersRes.data ?? []) as FriendUser[]);
          setOwnerName((ownerRes.data as any)?.name ?? "");
        }
      } catch { /* ignore */ }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [targetId]);

  /* ── Filter + paginate ───────────────────────────────────────────────── */
  useEffect(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? allFriends.filter((u) =>
          (u.name   ?? "").toLowerCase().includes(q) ||
          (u.username ?? "").toLowerCase().includes(q) ||
          (u.bio     ?? "").toLowerCase().includes(q)
        )
      : allFriends;
    setDisplayed(filtered.slice(0, page * PAGE));
  }, [allFriends, query, page]);

  /* ── Infinite scroll ─────────────────────────────────────────────────── */
  const loadMore = useCallback(() => {
    const q = query.trim().toLowerCase();
    const filtered = q ? allFriends.filter((u) =>
      (u.name ?? "").toLowerCase().includes(q) ||
      (u.username ?? "").toLowerCase().includes(q)
    ) : allFriends;
    if (displayed.length >= filtered.length) return;
    setPage((p) => p + 1);
  }, [allFriends, displayed.length, query]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) loadMore();
    }, { threshold: 0.1 });
    obs.observe(el);
    return () => obs.disconnect();
  }, [loadMore]);

  /* ── Reset page on new search ────────────────────────────────────────── */
  useEffect(() => { setPage(1); }, [query]);

  const isOwnProfile = !!supabaseUser && supabaseUser.id === targetId;
  const q = query.trim().toLowerCase();
  const total = q ? allFriends.filter((u) =>
    (u.name ?? "").toLowerCase().includes(q) ||
    (u.username ?? "").toLowerCase().includes(q)
  ).length : allFriends.length;

  return (
    <div className="app-bg flex h-full flex-col">

      {/* Header */}
      <div
        className="app-header sticky top-0 z-10 flex items-center gap-3 px-4 py-3"
        style={{
          paddingTop: `calc(env(safe-area-inset-top,0px) + 12px)`,
          borderBottom: "1px solid var(--s-border-a)",
          backdropFilter: "blur(20px)",
        }}
      >
        <button
          onClick={() => history.length > 1 ? history.back() : navigate("/")}
          aria-label="Back"
          className="app-surface grid h-9 w-9 flex-shrink-0 place-items-center rounded-full app-text"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="text-[15px] font-bold app-text truncate">
            {isOwnProfile ? "My Friends" : ownerName ? `${ownerName}'s Friends` : "Friends"}
          </h1>
          {!loading && (
            <p className="text-[11px] app-text-muted">
              {allFriends.length} mutual {allFriends.length === 1 ? "connection" : "connections"}
            </p>
          )}
        </div>
      </div>

      {/* Search */}
      <div className="px-4 py-3" style={{ borderBottom: "1px solid var(--s-border-a)" }}>
        <div
          className="flex items-center gap-2 rounded-[14px] px-3 py-2.5"
          style={{ background: "rgba(255,255,255,0.05)", border: "1px solid var(--s-border-a)" }}
        >
          <Search style={{ width: 14, height: 14 }} className="flex-shrink-0 app-text-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search friends…"
            className="flex-1 bg-transparent text-[13px] app-text focus:outline-none placeholder:app-text-muted"
          />
          <AnimatePresence>
            {query && (
              <motion.button
                initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }}
                onClick={() => setQuery("")}
                className="flex-shrink-0 app-text-muted"
              >
                <X style={{ width: 13, height: 13 }} />
              </motion.button>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto hide-scrollbar pb-16">

        {loading && (
          <div className="grid place-items-center py-20">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-purple-500/30 border-t-purple-500" />
          </div>
        )}

        {!loading && allFriends.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-3 py-20 px-8 text-center">
            <div className="grid h-16 w-16 place-items-center rounded-full app-surface">
              <Users className="app-text-muted" style={{ width: 24, height: 24 }} />
            </div>
            <p className="text-[14px] font-semibold app-text">No friends yet</p>
            <p className="text-[12px] app-text-muted">
              {isOwnProfile
                ? "Follow people and get followed back to appear here as mutual connections."
                : "This user has no mutual connections yet."}
            </p>
          </div>
        )}

        {!loading && allFriends.length > 0 && total === 0 && (
          <div className="grid place-items-center py-16 text-center px-8">
            <p className="text-[13px] app-text-muted">No friends matching "{query}"</p>
          </div>
        )}

        {!loading && displayed.length > 0 && (
          <div className="px-4 pt-3 space-y-2">
            {displayed.map((friend, i) => (
              <FriendCard
                key={friend.id}
                friend={friend}
                index={i}
                onNavigate={() => navigate(`/profile/${friend.id}`)}
              />
            ))}
          </div>
        )}

        <div ref={sentinelRef} className="h-4" />
      </div>
    </div>
  );
}

/* ── Friend card ─────────────────────────────────────────────────────────── */
function FriendCard({ friend, index, onNavigate }: {
  friend: FriendUser; index: number; onNavigate: () => void;
}) {
  const initials = (friend.name || friend.username || "?").charAt(0).toUpperCase();
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.025, 0.3) }}
    >
      <button
        onClick={onNavigate}
        className="app-card flex w-full items-center gap-3 rounded-[16px] p-3.5 text-left"
        style={{ border: "1px solid var(--s-border-a)" }}
      >
        {/* Avatar */}
        <div className="relative flex-shrink-0">
          <div
            className="h-12 w-12 overflow-hidden rounded-full"
            style={{ border: "1.5px solid var(--s-border-a)" }}
          >
            {friend.avatar_url ? (
              <img src={friend.avatar_url} alt={friend.name} className="h-full w-full object-cover" loading="lazy" />
            ) : (
              <div className="grid h-full w-full place-items-center bg-gradient-to-br from-purple-600 via-pink-500 to-blue-600 text-base font-bold text-white">
                {initials}
              </div>
            )}
          </div>
          <div className="absolute -bottom-0.5 -right-0.5">
            <OnlineDot online={Boolean(friend.is_online)} />
          </div>
        </div>

        {/* Info */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[14px] font-semibold app-text truncate">
              {friend.name || friend.username || "Unknown"}
            </span>
            <NameBadges isOwner={friend.is_owner} isVerified={friend.is_verified} size="sm" />
          </div>
          {friend.username && (
            <div className="text-[11px] app-text-muted">@{friend.username}</div>
          )}
          {friend.bio && (
            <div className="mt-0.5 text-[11px] app-text-muted truncate">{friend.bio}</div>
          )}
        </div>

        {/* Followers count */}
        {(friend.followers ?? 0) > 0 && (
          <div className="flex-shrink-0 text-right">
            <div className="text-[12px] font-bold app-text">{compact(friend.followers ?? 0)}</div>
            <div className="text-[9px] font-semibold uppercase tracking-[0.1em] app-text-muted">followers</div>
          </div>
        )}
      </button>
    </motion.div>
  );
}

function compact(n: number) {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return (n / 1000).toFixed(1).replace(/\.0$/, "") + "K";
  return (n / 1_000_000).toFixed(1) + "M";
}
