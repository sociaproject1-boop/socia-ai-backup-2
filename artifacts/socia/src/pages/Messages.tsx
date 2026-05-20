import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Search, MessageCirclePlus, X, ArrowLeft, User, Bot, Wifi, WifiOff } from "lucide-react";
import { useAuth } from "@/lib/authContext";
import { useAppStore } from "@/lib/store";
import { useConversations, isUserOnline } from "@/lib/useSupabaseChat";
import { usePresenceStore } from "@/lib/usePresence";
import { searchUsers, type UserSearchResult } from "@/lib/supabase";
import { NameBadges } from "@/components/Badges";
import { useAiAutoReply } from "@/lib/useAiAutoReply";

export default function Messages() {
  const [, navigate] = useLocation();
  const { supabaseUser } = useAuth();
  const myId = supabaseUser?.id ?? null;
  const storeUser = useAppStore((s) => s.user);
  const isOwner = storeUser?.isOwner ?? false;

  const [q, setQ] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<UserSearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { conversations, loading } = useConversations(myId);
  const presences = usePresenceStore((s) => s.presences);

  const ai = useAiAutoReply(isOwner);

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

      {/* ── AI Auto Reply Panel (admin only) ────────────────────────────────── */}
      <AnimatePresence>
        {isOwner && !ai.loading && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            className="mb-4 overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.03]"
          >
            <div className="flex items-center justify-between px-4 py-3">
              {/* Left: icon + label */}
              <div className="flex items-center gap-2.5">
                <div className={
                  "flex h-8 w-8 items-center justify-center rounded-full transition-all " +
                  (ai.enabled
                    ? "bg-gradient-to-br from-purple-600 via-pink-500 to-blue-500 shadow-[0_0_14px_rgba(168,85,247,0.5)]"
                    : "bg-white/[0.08]")
                }>
                  <Bot className={"h-4 w-4 " + (ai.enabled ? "text-white" : "text-white/50")} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">AI Auto Reply</p>
                  <p className={"text-[11px] " + (ai.enabled ? "text-purple-300" : "text-white/40")}>
                    {ai.enabled
                      ? (ai.mode === "offline" ? "Offline mode — always on" : "Online mode — yields on activity")
                      : "Off — manual replies only"}
                  </p>
                </div>
              </div>

              {/* Right: toggle */}
              <button
                disabled={ai.saving}
                onClick={() => ai.toggle(!ai.enabled, ai.mode)}
                className={
                  "relative h-6 w-11 rounded-full transition-all duration-300 focus:outline-none disabled:opacity-50 " +
                  (ai.enabled
                    ? "bg-gradient-to-r from-purple-600 to-pink-500"
                    : "bg-white/[0.12]")
                }
                aria-label={ai.enabled ? "Disable AI auto reply" : "Enable AI auto reply"}
              >
                <motion.span
                  layout
                  transition={{ type: "spring", stiffness: 700, damping: 35 }}
                  className={
                    "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm " +
                    (ai.enabled ? "left-[22px]" : "left-0.5")
                  }
                />
              </button>
            </div>

            {/* Mode selector — only when enabled */}
            <AnimatePresence>
              {ai.enabled && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="flex gap-2 border-t border-white/[0.06] px-4 py-3">
                    <button
                      disabled={ai.saving}
                      onClick={() => ai.toggle(true, "offline")}
                      className={
                        "flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-semibold transition-all disabled:opacity-50 " +
                        (ai.mode === "offline"
                          ? "bg-purple-600/30 text-purple-300 border border-purple-500/40"
                          : "bg-white/[0.05] text-white/50 border border-white/[0.06] hover:bg-white/[0.08]")
                      }
                    >
                      <WifiOff className="h-3 w-3" />
                      Offline mode
                    </button>
                    <button
                      disabled={ai.saving}
                      onClick={() => ai.toggle(true, "online")}
                      className={
                        "flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-semibold transition-all disabled:opacity-50 " +
                        (ai.mode === "online"
                          ? "bg-emerald-600/25 text-emerald-300 border border-emerald-500/40"
                          : "bg-white/[0.05] text-white/50 border border-white/[0.06] hover:bg-white/[0.08]")
                      }
                    >
                      <Wifi className="h-3 w-3" />
                      Online mode
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>

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
                  presenceStatus={
                    presences[conv.otherId] ??
                    (isUserOnline(conv.otherLastSeen) ? "online" : "offline")
                  }
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
  name, username, avatar, preview, time, unread, presenceStatus,
  isOwner, isVerified, index, onClick,
}: {
  name: string; username: string; avatar: string; preview: string;
  time: string; unread: boolean;
  presenceStatus: "online" | "away" | "offline";
  isOwner: boolean; isVerified: boolean;
  index: number; onClick: () => void;
}) {
  const isOnline = presenceStatus === "online";
  const isAway   = presenceStatus === "away";
  const showDot  = isOnline || isAway;

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
        {/*
          Outer wrapper: relative + shrink-0, NOT overflow-hidden.
          The avatar itself clips internally; the dot lives outside it
          so it's never cut off by the avatar's rounded corners.
        */}
        <div className="relative h-12 w-12 shrink-0">
          {/* Avatar circle — clips its own contents */}
          <div className="h-12 w-12 overflow-hidden rounded-full border border-white/10">
            {avatar ? (
              <img src={avatar} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="h-full w-full bg-gradient-to-br from-purple-600 via-pink-500 to-blue-600 grid place-items-center text-sm font-bold text-white">
                {name.charAt(0).toUpperCase()}
              </div>
            )}
          </div>

          {/* Presence dot — outside the clipping container, animated in/out */}
          <AnimatePresence>
            {showDot && (
              <motion.span
                key={presenceStatus}
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0, opacity: 0 }}
                transition={{ type: "spring", stiffness: 500, damping: 28 }}
                className="absolute bottom-0 right-0 z-10 h-3.5 w-3.5 rounded-full"
                style={{
                  background: isOnline ? "#22c55e" : "#f59e0b",
                  boxShadow: isOnline
                    ? "0 0 0 2.5px #000, 0 0 8px rgba(34,197,94,0.65)"
                    : "0 0 0 2.5px #000, 0 0 8px rgba(245,158,11,0.5)",
                }}
              />
            )}
          </AnimatePresence>
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
