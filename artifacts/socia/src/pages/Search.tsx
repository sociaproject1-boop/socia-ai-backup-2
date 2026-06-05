/**
 * Search.tsx — Advanced search & explore page.
 * Phases 13 + 16: search users/posts/hashtags, trending discovery,
 * recommended creators, recent search history, infinite scroll.
 */
import {
  useState, useEffect, useRef, useCallback, useMemo,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useLocation } from "wouter";
import {
  Search, X, TrendingUp, Users, Grid3x3, Hash,
  ChevronRight, Verified, Crown, Play, Heart, MessageCircle,
  UserPlus, UserCheck,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAppStore } from "@/lib/store";

const API   = import.meta.env.BASE_URL.replace(/\/$/, "");
const LS_KEY = "socia_recent_searches";
const MAX_RECENT = 8;
const PAGE  = 20;

/* ── Types ──────────────────────────────────────────────────────────────── */
interface SearchUser {
  id: string;
  name: string;
  username: string;
  avatar_url: string | null;
  bio: string | null;
  is_verified: boolean;
  is_owner: boolean;
}

interface SearchMedia {
  id: string;
  url: string;
  type: "photo" | "video";
  position: number;
}

interface SearchPost {
  id: string;
  author_id: string;
  caption: string | null;
  type: "photo" | "video" | "multi";
  view_count: number;
  like_count: number;
  comment_count: number;
  created_at: string;
  author: {
    id: string;
    name: string;
    username: string;
    avatar_url: string | null;
    is_verified: boolean;
    is_owner: boolean;
  };
  media: SearchMedia[];
}

interface TrendingData {
  hashtags: { tag: string; count: number }[];
  suggestedUsers: SearchUser[];
}

type TabId = "people" | "posts" | "tags";

/* ── Helpers ─────────────────────────────────────────────────────────────── */
async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const jwt = data.session?.access_token;
  return jwt ? { Authorization: `Bearer ${jwt}` } : {};
}

function getRecent(): string[] {
  try { return JSON.parse(localStorage.getItem(LS_KEY) ?? "[]"); } catch { return []; }
}
function addRecent(q: string) {
  const prev = getRecent().filter((s) => s !== q);
  localStorage.setItem(LS_KEY, JSON.stringify([q, ...prev].slice(0, MAX_RECENT)));
}
function removeRecent(q: string) {
  localStorage.setItem(LS_KEY, JSON.stringify(getRecent().filter((s) => s !== q)));
}
function clearRecent() {
  localStorage.removeItem(LS_KEY);
}

function relTime(iso: string) {
  const d = Date.now() - new Date(iso).getTime();
  if (d < 60_000)       return "now";
  if (d < 3_600_000)    return `${Math.floor(d / 60_000)}m`;
  if (d < 86_400_000)   return `${Math.floor(d / 3_600_000)}h`;
  return `${Math.floor(d / 86_400_000)}d`;
}

/* ── Skeleton components ─────────────────────────────────────────────────── */
function UserSkeleton() {
  return (
    <div className="flex items-center gap-3 px-4 py-3 animate-pulse">
      <div className="h-12 w-12 rounded-full bg-white/8 shrink-0" />
      <div className="flex-1 space-y-2">
        <div className="h-3.5 w-32 rounded-full bg-white/8" />
        <div className="h-2.5 w-20 rounded-full bg-white/5" />
      </div>
      <div className="h-8 w-20 rounded-full bg-white/5" />
    </div>
  );
}

function PostSkeleton() {
  return (
    <div className="grid grid-cols-3 gap-0.5 px-0.5">
      {Array.from({ length: 9 }).map((_, i) => (
        <div key={i} className="aspect-square bg-white/6 animate-pulse" />
      ))}
    </div>
  );
}

/* ── User card ───────────────────────────────────────────────────────────── */
function UserCard({
  user, myId, onNavigate,
}: { user: SearchUser; myId: string | null; onNavigate: (id: string) => void }) {
  const [following, setFollowing] = useState(false);
  const [checking,  setChecking]  = useState(true);
  const [busy,      setBusy]      = useState(false);
  const isSelf = myId === user.id;

  useEffect(() => {
    if (!myId || isSelf) { setChecking(false); return; }
    supabase
      .from("follows")
      .select("id")
      .eq("follower_id", myId)
      .eq("following_id", user.id)
      .maybeSingle()
      .then(({ data }) => { setFollowing(!!data); setChecking(false); });
  }, [myId, user.id, isSelf]);

  async function toggle() {
    if (!myId || isSelf || busy) return;
    setBusy(true);
    const next = !following;
    setFollowing(next);
    try {
      const hdrs = await authHeaders();
      await fetch(`${API}/api/posts/follow/${user.id}`, {
        method:  next ? "POST" : "DELETE",
        headers: hdrs,
      });
    } catch { setFollowing(!next); }
    finally  { setBusy(false); }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center gap-3 px-4 py-3 active:bg-white/4 transition-colors"
    >
      <button
        onClick={() => onNavigate(user.id)}
        className="h-12 w-12 rounded-full shrink-0 overflow-hidden bg-white/8"
      >
        {user.avatar_url
          ? <img src={user.avatar_url} alt={user.name} className="h-full w-full object-cover" />
          : (
            <div className="h-full w-full flex items-center justify-center text-lg font-bold text-white/60"
              style={{ background: "linear-gradient(135deg,#a855f7,#ec4899)" }}>
              {(user.name || user.username || "?")[0].toUpperCase()}
            </div>
          )}
      </button>

      <button onClick={() => onNavigate(user.id)} className="flex-1 text-left min-w-0">
        <div className="flex items-center gap-1">
          <span className="text-[14px] font-semibold text-white truncate">{user.name || user.username}</span>
          {user.is_owner    && <Crown className="h-3.5 w-3.5 shrink-0" style={{ color: "#fbbf24" }} />}
          {user.is_verified && !user.is_owner && <Verified className="h-3.5 w-3.5 shrink-0 text-blue-400" />}
        </div>
        <div className="text-[12px] text-white/45">@{user.username}</div>
        {user.bio && (
          <div className="text-[11.5px] text-white/35 truncate mt-0.5">{user.bio}</div>
        )}
      </button>

      {!isSelf && !checking && (
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={toggle}
          disabled={busy}
          className="shrink-0 flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12px] font-semibold transition-all"
          style={following
            ? { border: "1px solid rgba(255,255,255,0.18)", color: "rgba(255,255,255,0.6)" }
            : { background: "linear-gradient(135deg,#a855f7,#ec4899)", color: "white" }}
        >
          {following
            ? <><UserCheck className="h-3.5 w-3.5" />Following</>
            : <><UserPlus  className="h-3.5 w-3.5" />Follow</>}
        </motion.button>
      )}
    </motion.div>
  );
}

/* ── Post thumbnail ──────────────────────────────────────────────────────── */
function PostThumb({ post, onClick }: { post: SearchPost; onClick: () => void }) {
  const first = post.media.slice().sort((a, b) => a.position - b.position)[0];
  const isVid = first?.type === "video" || post.type === "video";

  return (
    <motion.button
      whileTap={{ scale: 0.96 }}
      onClick={onClick}
      className="relative aspect-square overflow-hidden bg-white/5"
    >
      {first?.url
        ? isVid
          ? <video src={first.url} className="h-full w-full object-cover" muted playsInline preload="metadata" />
          : <img   src={first.url} alt="" className="h-full w-full object-cover" loading="lazy" />
        : <div className="h-full w-full flex items-center justify-center text-white/20">
            <Grid3x3 className="h-6 w-6" />
          </div>}
      {isVid && (
        <div className="absolute top-1.5 right-1.5 rounded-full bg-black/50 p-0.5">
          <Play className="h-2.5 w-2.5 text-white fill-white" />
        </div>
      )}
      <div className="absolute inset-x-0 bottom-0 flex items-center gap-2 bg-gradient-to-t from-black/70 to-transparent px-1.5 py-1.5">
        <Heart className="h-3 w-3 text-white fill-white" />
        <span className="text-[10px] font-semibold text-white">
          {post.like_count >= 1000 ? `${(post.like_count / 1000).toFixed(1)}k` : post.like_count}
        </span>
      </div>
    </motion.button>
  );
}

/* ── Main page ───────────────────────────────────────────────────────────── */
export default function SearchPage() {
  const [, navigate]   = useLocation();
  const myId           = useAppStore((s) => s.user?.id ?? null);

  const [query,        setQuery]       = useState("");
  const [committed,    setCommitted]   = useState("");
  const [activeTab,    setActiveTab]   = useState<TabId>("people");
  const [loading,      setLoading]     = useState(false);
  const [loadingMore,  setLoadingMore] = useState(false);
  const [users,        setUsers]       = useState<SearchUser[]>([]);
  const [posts,        setPosts]       = useState<SearchPost[]>([]);
  const [hasMore,      setHasMore]     = useState(false);
  const [offset,       setOffset]      = useState(0);
  const [trending,     setTrending]    = useState<TrendingData | null>(null);
  const [recentList,   setRecentList]  = useState<string[]>([]);
  const [trendLoading, setTrendLoad]   = useState(true);
  const [isFocused,    setFocused]     = useState(false);

  const inputRef    = useRef<HTMLInputElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* recent searches */
  useEffect(() => { setRecentList(getRecent()); }, []);

  /* trending data */
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`${API}/api/search/trending`);
        if (r.ok) setTrending(await r.json());
      } finally { setTrendLoad(false); }
    })();
  }, []);

  /* debounced search */
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setCommitted(query.trim()), 320);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query]);

  /* run search when committed query changes */
  const doSearch = useCallback(async (q: string, off: number, append: boolean) => {
    if (!q) return;
    off === 0 ? setLoading(true) : setLoadingMore(true);
    try {
      const hdrs = await authHeaders();
      const url  = `${API}/api/search?q=${encodeURIComponent(q)}&type=all&offset=${off}&limit=${PAGE}`;
      const r    = await fetch(url, { headers: hdrs });
      if (!r.ok) return;
      const data = await r.json();
      setUsers (prev => append ? [...prev, ...(data.users ?? [])] : (data.users ?? []));
      setPosts (prev => append ? [...prev, ...(data.posts ?? [])] : (data.posts ?? []));
      setHasMore(data.hasMore ?? false);
      setOffset(off + PAGE);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    if (!committed) { setUsers([]); setPosts([]); setHasMore(false); setOffset(0); return; }
    setOffset(0);
    doSearch(committed, 0, false);
  }, [committed, doSearch]);

  /* IntersectionObserver for infinite scroll */
  useEffect(() => {
    if (!sentinelRef.current) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting && hasMore && !loadingMore && committed) doSearch(committed, offset, true); },
      { threshold: 0.5 },
    );
    obs.observe(sentinelRef.current);
    return () => obs.disconnect();
  }, [hasMore, loadingMore, committed, offset, doSearch]);

  function commitSearch(q: string) {
    if (!q.trim()) return;
    addRecent(q.trim());
    setRecentList(getRecent());
    setQuery(q.trim());
    setCommitted(q.trim());
    inputRef.current?.blur();
  }

  function clearQuery() {
    setQuery("");
    setCommitted("");
    setUsers([]);
    setPosts([]);
    inputRef.current?.focus();
  }

  const isSearching = committed.length > 0;
  const showDropdown = isFocused && !isSearching && query.length === 0;

  /* filtered tab counts */
  const peopleCount = users.length;
  const postCount   = posts.length;

  const TABS: { id: TabId; label: string; count: number; icon: React.ReactNode }[] = [
    { id: "people", label: "People", count: peopleCount, icon: <Users  className="h-3.5 w-3.5" /> },
    { id: "posts",  label: "Posts",  count: postCount,   icon: <Grid3x3 className="h-3.5 w-3.5" /> },
    { id: "tags",   label: "Tags",   count: 0,           icon: <Hash   className="h-3.5 w-3.5" /> },
  ];

  /* hashtags extracted from post captions */
  const tagResults = useMemo(() => {
    if (!committed) return [];
    const map = new Map<string, number>();
    posts.forEach((p) => {
      const tags: string[] = (p.caption ?? "").match(/#[\w\u00C0-\u017E]+/gi) ?? [];
      tags.forEach((t) => {
        const lower = t.toLowerCase();
        if (lower.includes(committed.toLowerCase()))
          map.set(lower, (map.get(lower) ?? 0) + 1);
      });
    });
    return [...map.entries()].sort((a, b) => b[1] - a[1]).map(([tag, count]) => ({ tag, count }));
  }, [posts, committed]);

  function navigateUser(id: string) { navigate(`/profile/${id}`); }
  function navigatePost(id: string) { navigate(`/post/${id}`);    }

  return (
    <div className="flex flex-col h-full app-bg overflow-hidden">

      {/* ── Sticky search bar ─────────────────────────────────────────── */}
      <div
        className="shrink-0 px-4 pt-4 pb-3"
        style={{ background: "#0a0a0a", borderBottom: "1px solid rgba(255,255,255,0.06)" }}
      >
        <div className="relative flex items-center gap-2">
          <div
            className="relative flex-1 flex items-center gap-2 rounded-2xl px-4 py-3 transition-all"
            style={{
              background: "rgba(255,255,255,0.07)",
              border: isFocused ? "1px solid rgba(168,85,247,0.5)" : "1px solid rgba(255,255,255,0.1)",
              boxShadow: isFocused ? "0 0 0 3px rgba(168,85,247,0.12)" : "none",
            }}
          >
            <Search className="h-4 w-4 shrink-0 text-white/40" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setTimeout(() => setFocused(false), 150)}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitSearch(query);
              }}
              placeholder="Search people, posts, hashtags…"
              className="flex-1 bg-transparent text-[14px] text-white placeholder:text-white/30 outline-none"
            />
            <AnimatePresence>
              {query && (
                <motion.button
                  key="clear"
                  initial={{ opacity: 0, scale: 0.7 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.7 }}
                  onClick={clearQuery}
                  className="shrink-0"
                >
                  <X className="h-4 w-4 text-white/40" />
                </motion.button>
              )}
            </AnimatePresence>
          </div>

          <AnimatePresence>
            {(isFocused || query) && (
              <motion.button
                key="cancel"
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 12 }}
                onClick={() => { clearQuery(); inputRef.current?.blur(); }}
                className="text-[13px] text-purple-400 font-medium shrink-0"
              >
                Cancel
              </motion.button>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* ── Dropdown: recent + trending suggestions ───────────────────── */}
      <AnimatePresence>
        {showDropdown && (
          <motion.div
            key="dropdown"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="absolute left-0 right-0 z-20 mx-4 rounded-2xl overflow-hidden"
            style={{
              top: 76,
              background: "#141414",
              border: "1px solid rgba(255,255,255,0.10)",
              boxShadow: "0 16px 48px rgba(0,0,0,0.7)",
            }}
          >
            {/* Recent searches */}
            {recentList.length > 0 && (
              <div className="px-4 pt-3 pb-1">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-semibold text-white/40 uppercase tracking-wider">Recent</span>
                  <button
                    onClick={() => { clearRecent(); setRecentList([]); }}
                    className="text-[11px] text-purple-400"
                  >Clear all</button>
                </div>
                {recentList.map((s) => (
                  <div key={s} className="flex items-center gap-3 py-2.5">
                    <button
                      className="flex-1 flex items-center gap-2.5 text-left"
                      onClick={() => commitSearch(s)}
                    >
                      <Search className="h-3.5 w-3.5 text-white/30 shrink-0" />
                      <span className="text-[13.5px] text-white/75">{s}</span>
                    </button>
                    <button onClick={() => { removeRecent(s); setRecentList(getRecent()); }}>
                      <X className="h-3.5 w-3.5 text-white/25" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Trending hashtags in dropdown */}
            {(trending?.hashtags ?? []).length > 0 && (
              <div className="px-4 pt-2 pb-3 border-t border-white/6">
                <span className="text-[11px] font-semibold text-white/40 uppercase tracking-wider">Trending</span>
                <div className="mt-2 flex flex-wrap gap-2">
                  {(trending?.hashtags ?? []).slice(0, 8).map(({ tag }) => (
                    <button
                      key={tag}
                      onClick={() => commitSearch(tag)}
                      className="text-[12px] font-medium text-purple-300 rounded-full px-3 py-1"
                      style={{ background: "rgba(168,85,247,0.12)", border: "1px solid rgba(168,85,247,0.2)" }}
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Scrollable body ───────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto overscroll-contain" style={{ scrollbarWidth: "none" }}>

        {/* ═══ SEARCH RESULTS ═══════════════════════════════════════════ */}
        {isSearching ? (
          <>
            {/* Tabs */}
            <div
              className="flex sticky top-0 z-10"
              style={{ background: "#0a0a0a", borderBottom: "1px solid rgba(255,255,255,0.06)" }}
            >
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className="flex-1 flex flex-col items-center gap-0.5 py-3 relative transition-colors"
                >
                  <div
                    className="flex items-center gap-1.5 text-[13px] font-semibold transition-colors"
                    style={{ color: activeTab === tab.id ? "#a855f7" : "rgba(255,255,255,0.4)" }}
                  >
                    {tab.icon}
                    {tab.label}
                    {tab.count > 0 && (
                      <span
                        className="rounded-full px-1.5 py-0.5 text-[9px] font-bold"
                        style={{
                          background: activeTab === tab.id ? "rgba(168,85,247,0.25)" : "rgba(255,255,255,0.08)",
                          color: activeTab === tab.id ? "#d8b4fe" : "rgba(255,255,255,0.4)",
                        }}
                      >
                        {tab.count > 99 ? "99+" : tab.count}
                      </span>
                    )}
                  </div>
                  {activeTab === tab.id && (
                    <motion.div
                      layoutId="searchTabLine"
                      className="absolute bottom-0 left-1/4 right-1/4 h-0.5 rounded-full"
                      style={{ background: "#a855f7" }}
                    />
                  )}
                </button>
              ))}
            </div>

            {/* Tab content */}
            <AnimatePresence mode="wait">

              {/* People tab */}
              {activeTab === "people" && (
                <motion.div
                  key="people"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  {loading
                    ? Array.from({ length: 6 }).map((_, i) => <UserSkeleton key={i} />)
                    : users.length === 0
                      ? (
                        <div className="flex flex-col items-center justify-center py-20 text-center px-8">
                          <Users className="h-12 w-12 text-white/10 mb-4" />
                          <p className="text-[14px] text-white/30">No people found for "{committed}"</p>
                        </div>
                      )
                      : users.map((u) => (
                        <UserCard key={u.id} user={u} myId={myId} onNavigate={navigateUser} />
                      ))}
                </motion.div>
              )}

              {/* Posts tab */}
              {activeTab === "posts" && (
                <motion.div
                  key="posts"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  {loading
                    ? <PostSkeleton />
                    : posts.length === 0
                      ? (
                        <div className="flex flex-col items-center justify-center py-20 text-center px-8">
                          <Grid3x3 className="h-12 w-12 text-white/10 mb-4" />
                          <p className="text-[14px] text-white/30">No posts found for "{committed}"</p>
                        </div>
                      )
                      : (
                        <div className="grid grid-cols-3 gap-0.5 p-0.5">
                          {posts.map((p) => (
                            <PostThumb key={p.id} post={p} onClick={() => navigatePost(p.id)} />
                          ))}
                        </div>
                      )}
                </motion.div>
              )}

              {/* Tags tab */}
              {activeTab === "tags" && (
                <motion.div
                  key="tags"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="px-4 pt-4"
                >
                  {tagResults.length === 0
                    ? (
                      <div className="flex flex-col items-center justify-center py-20 text-center px-8">
                        <Hash className="h-12 w-12 text-white/10 mb-4" />
                        <p className="text-[14px] text-white/30">No hashtags found for "{committed}"</p>
                      </div>
                    )
                    : tagResults.map(({ tag, count }) => (
                      <motion.button
                        key={tag}
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        onClick={() => commitSearch(tag)}
                        className="flex items-center gap-3 w-full py-3 border-b border-white/5 last:border-0"
                      >
                        <div
                          className="h-11 w-11 rounded-2xl flex items-center justify-center shrink-0"
                          style={{ background: "rgba(168,85,247,0.15)" }}
                        >
                          <Hash className="h-5 w-5 text-purple-400" />
                        </div>
                        <div className="flex-1 text-left">
                          <div className="text-[14px] font-semibold text-white">{tag}</div>
                          <div className="text-[11.5px] text-white/35">{count} post{count !== 1 ? "s" : ""}</div>
                        </div>
                        <ChevronRight className="h-4 w-4 text-white/25" />
                      </motion.button>
                    ))}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Sentinel + load-more spinner */}
            {hasMore && (
              <div ref={sentinelRef} className="flex justify-center py-6">
                {loadingMore && (
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/20 border-t-purple-400" />
                )}
              </div>
            )}
          </>
        ) : (

          /* ═══ EXPLORE / TRENDING ══════════════════════════════════════ */
          <div className="pb-6">

            {/* Trending hashtags */}
            <section className="px-4 pt-5 pb-2">
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp className="h-4 w-4 text-purple-400" />
                <h2 className="text-[14px] font-bold text-white">Trending</h2>
              </div>

              {trendLoading
                ? (
                  <div className="flex gap-2 flex-wrap animate-pulse">
                    {Array.from({ length: 8 }).map((_, i) => (
                      <div key={i} className="h-8 rounded-full bg-white/6" style={{ width: `${60 + i * 12}px` }} />
                    ))}
                  </div>
                )
                : (trending?.hashtags ?? []).length > 0
                  ? (
                    <div className="flex flex-wrap gap-2">
                      {(trending?.hashtags ?? []).map(({ tag, count }, i) => (
                        <motion.button
                          key={tag}
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ delay: i * 0.03 }}
                          onClick={() => commitSearch(tag)}
                          className="flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[12.5px] font-medium text-white/80 transition-all active:scale-95"
                          style={{
                            background: "rgba(255,255,255,0.07)",
                            border: "1px solid rgba(255,255,255,0.1)",
                          }}
                        >
                          <Hash className="h-3 w-3 text-purple-400" />
                          {tag.replace(/^#/, "")}
                          <span className="text-white/35 text-[10px]">
                            {count >= 1000 ? `${(count / 1000).toFixed(1)}k` : count}
                          </span>
                        </motion.button>
                      ))}
                    </div>
                  )
                  : (
                    <p className="text-[12px] text-white/25">No trending hashtags yet.</p>
                  )}
            </section>

            {/* Suggested creators */}
            <section className="pt-4 pb-2">
              <div className="flex items-center justify-between px-4 mb-3">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-pink-400" />
                  <h2 className="text-[14px] font-bold text-white">Suggested Creators</h2>
                </div>
              </div>

              {trendLoading
                ? <div className="px-4 space-y-1">{Array.from({ length: 4 }).map((_, i) => <UserSkeleton key={i} />)}</div>
                : (trending?.suggestedUsers ?? []).length > 0
                  ? (trending?.suggestedUsers ?? []).map((u) => (
                    <UserCard key={u.id} user={u} myId={myId} onNavigate={navigateUser} />
                  ))
                  : (
                    <div className="px-4">
                      <p className="text-[12px] text-white/25">No suggestions yet.</p>
                    </div>
                  )}
            </section>

            {/* Explore posts grid */}
            <section className="pt-4">
              <div className="flex items-center gap-2 px-4 mb-3">
                <Grid3x3 className="h-4 w-4 text-blue-400" />
                <h2 className="text-[14px] font-bold text-white">Explore</h2>
              </div>

              {trendLoading
                ? <PostSkeleton />
                : (() => {
                  const explorePosts = (trending as any)?.posts ?? [];
                  return explorePosts.length > 0
                    ? (
                      <div className="grid grid-cols-3 gap-0.5 px-0.5">
                        {explorePosts.map((p: SearchPost) => (
                          <PostThumb key={p.id} post={p} onClick={() => navigatePost(p.id)} />
                        ))}
                      </div>
                    )
                    : (
                      <div className="px-4 py-8 text-center">
                        <p className="text-[12px] text-white/25">Nothing to explore yet — be the first to post!</p>
                      </div>
                    );
                })()}
            </section>

            {/* Recent searches */}
            {recentList.length > 0 && (
              <section className="px-4 pt-5">
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-[13px] font-semibold text-white/40 uppercase tracking-wider">Recent Searches</h2>
                  <button
                    onClick={() => { clearRecent(); setRecentList([]); }}
                    className="text-[12px] text-purple-400"
                  >Clear</button>
                </div>
                {recentList.map((s) => (
                  <div key={s} className="flex items-center gap-3 py-2.5 border-b border-white/5 last:border-0">
                    <button
                      className="flex-1 flex items-center gap-2.5 text-left"
                      onClick={() => commitSearch(s)}
                    >
                      <Search className="h-3.5 w-3.5 text-white/25 shrink-0" />
                      <span className="text-[13.5px] text-white/60">{s}</span>
                    </button>
                    <button onClick={() => { removeRecent(s); setRecentList(getRecent()); }}>
                      <X className="h-3.5 w-3.5 text-white/25" />
                    </button>
                  </div>
                ))}
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
