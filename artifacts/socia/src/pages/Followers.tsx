/**
 * Followers.tsx + Following.tsx (single component, mode prop)
 * Lists the users who follow / are followed by a target user.
 * Features: search bar, infinite scroll (30 per page).
 * Route: /followers/:id and /following/:id (mode chosen in App.tsx).
 */
import { useEffect, useState, useCallback, useRef } from "react";
import { useRoute, useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Search, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { DbUser } from "@/lib/supabase";
import { NameBadges, OnlineDot } from "@/components/Badges";

interface Props { mode: "followers" | "following" }

const PAGE = 30;

export default function FollowList({ mode }: Props) {
  const route        = mode === "followers" ? "/followers/:id" : "/following/:id";
  const [, params]   = useRoute(route);
  const [, navigate] = useLocation();
  const targetId     = params?.id ?? "";

  const [allUsers,   setAllUsers]   = useState<DbUser[]>([]);
  const [displayed,  setDisplayed]  = useState<DbUser[]>([]);
  const [query,      setQuery]      = useState("");
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState<string | null>(null);
  const [page,       setPage]       = useState(1);
  const sentinelRef  = useRef<HTMLDivElement>(null);

  /* ── Fetch all IDs then user rows ────────────────────────────────────── */
  useEffect(() => {
    if (!targetId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setAllUsers([]);
    setPage(1);

    (async () => {
      const select    = mode === "followers" ? "follower_id"  : "following_id";
      const filterCol = mode === "followers" ? "following_id" : "follower_id";

      const { data: rows, error: rowsErr } = await supabase
        .from("follows")
        .select(select)
        .eq(filterCol, targetId)
        .order("created_at", { ascending: false });

      if (cancelled) return;
      if (rowsErr) { setError(rowsErr.message); setLoading(false); return; }

      const ids = (rows ?? []).map((r: any) => r[select] as string).filter(Boolean);
      if (ids.length === 0) { setAllUsers([]); setLoading(false); return; }

      const { data: usersRes, error: usersErr } = await supabase
        .from("users")
        .select("*")
        .in("id", ids);

      if (cancelled) return;
      if (usersErr) { setError(usersErr.message); setLoading(false); return; }

      const ordered = ids
        .map((id) => (usersRes ?? []).find((u: any) => u.id === id))
        .filter(Boolean) as DbUser[];
      setAllUsers(ordered);
      setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [targetId, mode]);

  /* ── Filter + paginate ───────────────────────────────────────────────── */
  useEffect(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? allUsers.filter((u) =>
          (u.name     ?? "").toLowerCase().includes(q) ||
          (u.username ?? "").toLowerCase().includes(q) ||
          (u.bio      ?? "").toLowerCase().includes(q)
        )
      : allUsers;
    setDisplayed(filtered.slice(0, page * PAGE));
  }, [allUsers, query, page]);

  /* ── Infinite scroll ─────────────────────────────────────────────────── */
  const loadMore = useCallback(() => {
    const q = query.trim().toLowerCase();
    const total = q
      ? allUsers.filter((u) =>
          (u.name ?? "").toLowerCase().includes(q) ||
          (u.username ?? "").toLowerCase().includes(q)
        ).length
      : allUsers.length;
    if (displayed.length >= total) return;
    setPage((p) => p + 1);
  }, [allUsers, displayed.length, query]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) loadMore(); },
      { threshold: 0.1 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [loadMore]);

  /* Reset page on new search */
  useEffect(() => { setPage(1); }, [query]);

  const title = mode === "followers" ? "Followers" : "Following";

  return (
    <div className="app-bg flex h-full flex-col">

      {/* Header */}
      <div
        className="app-header sticky top-0 z-10 flex items-center gap-3 px-4"
        style={{
          paddingTop: `calc(env(safe-area-inset-top,0px) + 12px)`,
          paddingBottom: 12,
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
          <h1 className="text-[15px] font-bold app-text">{title}</h1>
          {!loading && (
            <p className="text-[11px] app-text-muted">
              {allUsers.length} {title.toLowerCase()}
            </p>
          )}
        </div>
      </div>

      {/* Search bar */}
      <div className="px-4 py-3" style={{ borderBottom: "1px solid var(--s-border-a)" }}>
        <div
          className="flex items-center gap-2 rounded-[14px] px-3 py-2.5"
          style={{ background: "rgba(255,255,255,0.05)", border: "1px solid var(--s-border-a)" }}
        >
          <Search style={{ width: 14, height: 14 }} className="flex-shrink-0 app-text-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search ${title.toLowerCase()}…`}
            className="flex-1 bg-transparent text-[13px] app-text focus:outline-none placeholder:app-text-muted"
          />
          <AnimatePresence>
            {query && (
              <motion.button
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
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

        {!loading && error && (
          <div className="mx-4 mt-4 rounded-[14px] p-4 text-sm" style={{ color: "#ef4444", background: "rgba(239,68,68,0.08)" }}>
            {error}
          </div>
        )}

        {!loading && !error && allUsers.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-3 py-20 text-center px-8">
            <p className="text-[14px] font-semibold app-text">
              {mode === "followers" ? "No followers yet" : "Not following anyone yet"}
            </p>
            <p className="text-[12px] app-text-muted">
              {mode === "followers"
                ? "When someone follows this account, they'll appear here."
                : "When this account follows someone, they'll appear here."}
            </p>
          </div>
        )}

        {!loading && !error && allUsers.length > 0 && displayed.length === 0 && (
          <div className="grid place-items-center py-16 text-center px-8">
            <p className="text-[13px] app-text-muted">No {title.toLowerCase()} matching "{query}"</p>
          </div>
        )}

        {!loading && !error && displayed.length > 0 && (
          <ul className="px-4 pt-3 space-y-2">
            {displayed.map((u, i) => {
              const initials = (u.name || u.username || "?").charAt(0).toUpperCase();
              return (
                <motion.li
                  key={u.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i * 0.02, 0.3) }}
                >
                  <button
                    onClick={() => navigate(`/profile/${u.id}`)}
                    className="app-card flex w-full items-center gap-3 rounded-[16px] p-3.5 text-left"
                    style={{ border: "1px solid var(--s-border-a)" }}
                  >
                    {/* Avatar */}
                    <div className="relative flex-shrink-0">
                      <div
                        className="h-12 w-12 overflow-hidden rounded-full"
                        style={{ border: "1.5px solid var(--s-border-a)" }}
                      >
                        {u.avatar_url ? (
                          <img src={u.avatar_url} alt="" className="h-full w-full object-cover" loading="lazy" />
                        ) : (
                          <div className="grid h-full w-full place-items-center bg-[#1D9BF0] text-base font-bold text-white">
                            {initials}
                          </div>
                        )}
                      </div>
                      <div className="absolute -bottom-0.5 -right-0.5">
                        <OnlineDot online={Boolean(u.is_online)} />
                      </div>
                    </div>

                    {/* Info */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[14px] font-semibold app-text truncate">
                          {u.name || u.username || "Unknown"}
                        </span>
                        <NameBadges isOwner={u.is_owner} isVerified={u.is_verified} size="sm" />
                      </div>
                      {u.username && (
                        <div className="text-[11px] app-text-muted">@{u.username}</div>
                      )}
                      {u.bio && (
                        <div className="mt-0.5 text-[11px] app-text-muted truncate">{u.bio}</div>
                      )}
                    </div>
                  </button>
                </motion.li>
              );
            })}
          </ul>
        )}

        {/* Infinite scroll sentinel */}
        <div ref={sentinelRef} className="h-4" />
      </div>
    </div>
  );
}
