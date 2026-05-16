import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Search, MessageCirclePlus, X, ArrowLeft, User } from "lucide-react";
import { useAuth } from "@/lib/authContext";
import { useConversations, isUserOnline } from "@/lib/useSupabaseChat";
import { searchUsers, type UserSearchResult } from "@/lib/supabase";
import { NameBadges } from "@/components/Badges";

export default function Messages() {
  const [, navigate] = useLocation();
  const { supabaseUser } = useAuth();
  const myId = supabaseUser?.id ?? null;
  const [q, setQ] = useState("");
  const [searching, setSearching] = useState(false);   // user-search mode
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<UserSearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { conversations, loading } = useConversations(myId);

  // Debounced user search
  useEffect(() => {
    if (!searching) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!searchQuery.trim()) { setSearchResults([]); return; }

    setSearchLoading(true);
    debounceRef.current = setTimeout(async () => {
      const results = await searchUsers(searchQuery);
      setSearchResults(results.filter((u) => u.id !== myId));
      setSearchLoading(false);
    }, 300);

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [searchQuery, searching, myId]);

  const filteredConvs = conversations.filter((c) =>
    c.otherName.toLowerCase().includes(q.toLowerCase()) ||
    c.otherUsername.toLowerCase().includes(q.toLowerCase())
  );

  return (
    <div className="px-4 pb-24 pt-2">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-display text-2xl font-bold text-white">Messages</h2>
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={() => { setSearching(true); setSearchQuery(""); setSearchResults([]); }}
          className="card-premium grid h-9 w-9 place-items-center rounded-full text-white/80"
        >
          <MessageCirclePlus className="h-[18px] w-[18px]" strokeWidth={1.9} />
        </motion.button>
      </div>

      {/* ── User-search panel (new chat) ─────────────────────────────────── */}
      <AnimatePresence>
        {searching && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="mb-4"
          >
            <div className="mb-3 flex items-center gap-2">
              <button
                onClick={() => { setSearching(false); setSearchQuery(""); setSearchResults([]); }}
                className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-white/70 hover:bg-white/10"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
              <span className="text-sm font-medium text-white/80">Find someone to message</span>
            </div>

            <div className="mb-3 flex items-center gap-2 rounded-2xl border border-white/[0.08] bg-white/[0.04] px-4 py-3">
              <Search className="h-4 w-4 text-white/50" />
              <input
                autoFocus
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by name or username…"
                className="flex-1 bg-transparent text-sm text-white placeholder:text-white/40 focus:outline-none"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery("")}>
                  <X className="h-3.5 w-3.5 text-white/40" />
                </button>
              )}
            </div>

            {/* Search results */}
            {searchLoading && (
              <div className="py-8 text-center">
                <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/20 border-t-purple-500 inline-block" />
              </div>
            )}

            {!searchLoading && searchQuery.trim() && searchResults.length === 0 && (
              <div className="py-10 text-center text-sm text-white/45">No users found</div>
            )}

            {!searchLoading && searchResults.map((user, i) => (
              <motion.div
                key={user.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
                className="flex w-full items-center gap-3 rounded-2xl px-3 py-3"
              >
                {/* Avatar — tap → profile */}
                <button
                  onClick={() => { setSearching(false); navigate(`/profile/${user.id}`); }}
                  className="h-11 w-11 shrink-0 overflow-hidden rounded-full border border-white/10 hover:ring-2 hover:ring-purple-500/40 transition-all"
                >
                  {user.avatar_url ? (
                    <img src={user.avatar_url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="h-full w-full bg-gradient-to-br from-purple-600 via-pink-500 to-blue-600 grid place-items-center text-sm font-bold text-white">
                      {user.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                </button>

                {/* Name / username — tap → message */}
                <button
                  onClick={() => { setSearching(false); navigate(`/messages/${user.id}`); }}
                  className="min-w-0 flex-1 text-left"
                >
                  <div className="truncate text-sm font-semibold text-white">{user.name}</div>
                  {user.username && (
                    <div className="truncate text-xs text-white/50">@{user.username}</div>
                  )}
                </button>

                {/* Profile icon */}
                <button
                  onClick={() => { setSearching(false); navigate(`/profile/${user.id}`); }}
                  className="shrink-0 grid h-8 w-8 place-items-center rounded-full text-white/40 hover:bg-white/10 hover:text-white/80 transition-colors"
                >
                  <User className="h-4 w-4" />
                </button>
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Conversation search bar (when not in user-search mode) ────────── */}
      {!searching && (
        <div className="mb-4 flex items-center gap-2 rounded-2xl border border-white/[0.08] bg-white/[0.04] px-4 py-3">
          <Search className="h-4 w-4 text-white/50" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search conversations"
            className="flex-1 bg-transparent text-sm text-white placeholder:text-white/40 focus:outline-none"
          />
        </div>
      )}

      {/* ── Conversation list ────────────────────────────────────────────── */}
      {!searching && (
        <>
          {loading && (
            <ul className="space-y-1">
              {[1, 2, 3, 4].map((i) => (
                <li key={i} className="flex items-center gap-3 rounded-2xl px-3 py-3">
                  <div className="h-12 w-12 shrink-0 rounded-full shimmer" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3.5 w-32 rounded shimmer" />
                    <div className="h-3 w-48 rounded shimmer" />
                  </div>
                </li>
              ))}
            </ul>
          )}

          {!loading && (
            <ul className="space-y-1">
              {filteredConvs.map((conv, i) => (
                <ConvRow
                  key={conv.otherId}
                  name={conv.otherName}
                  username={conv.otherUsername}
                  avatar={conv.otherAvatar}
                  preview={conv.lastText}
                  time={conv.lastAt}
                  unread={conv.unread}
                  online={isUserOnline(conv.otherLastSeen)}
                  isOwner={conv.otherIsOwner}
                  isVerified={conv.otherIsVerified}
                  index={i}
                  onClick={() => navigate(`/messages/${conv.otherId}`)}
                />
              ))}
              {filteredConvs.length === 0 && (
                <div className="py-16 text-center text-sm text-white/45">
                  {conversations.length === 0
                    ? "No conversations yet — tap  to start one"
                    : "No conversations match your search"}
                </div>
              )}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

function ConvRow({
  name, username, avatar, preview, time, unread, online,
  isOwner, isVerified, index, onClick,
}: {
  name: string; username: string; avatar: string; preview: string;
  time: string; unread: boolean; online: boolean;
  isOwner: boolean; isVerified: boolean;
  index: number; onClick: () => void;
}) {
  return (
    <motion.li
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.025, type: "spring", stiffness: 380, damping: 30 }}
    >
      <motion.button
        whileTap={{ scale: 0.97 }}
        onClick={onClick}
        className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left active:bg-white/[0.06]"
      >
        <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-full border border-white/10">
          {avatar ? (
            <img src={avatar} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="h-full w-full bg-gradient-to-br from-purple-600 via-pink-500 to-blue-600 grid place-items-center text-sm font-bold text-white">
              {name.charAt(0).toUpperCase()}
            </div>
          )}
          <span className={
            "absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-background transition-colors " +
            (online ? "bg-emerald-400" : "bg-white/25")
          } />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="truncate text-sm font-semibold text-white">{name}</span>
              <NameBadges isOwner={isOwner} isVerified={isVerified} size="sm" />
            </span>
            <span className="shrink-0 text-[10px] text-white/40">{relTime(time)}</span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <p className={"truncate text-xs " + (unread ? "font-medium text-white" : "text-white/55")}>
              {preview || "Start a conversation"}
            </p>
            {unread && (
              <span className="h-2 w-2 shrink-0 rounded-full bg-pink-500 neon-pulse" />
            )}
          </div>
        </div>
      </motion.button>
    </motion.li>
  );
}

function relTime(iso: string) {
  if (!iso) return "";
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60)    return "now";
  if (diff < 3600)  return Math.floor(diff / 60) + "m";
  if (diff < 86400) return Math.floor(diff / 3600) + "h";
  return Math.floor(diff / 86400) + "d";
}
