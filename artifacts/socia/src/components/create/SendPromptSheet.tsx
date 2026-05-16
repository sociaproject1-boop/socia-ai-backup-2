/**
 * SendPromptSheet.tsx — bottom-sheet picker for "Send Prompt to Chat".
 *
 * Shows:
 *   • A daily quota gauge (5/day for free, "Unlimited ✨" for Pro/King)
 *   • A search input that queries the users table by username/name
 *   • Recent chat partners, pulled from useConversations
 *
 * On select:
 *   • Calls sendPromptMessage(receiverId, prompt) RPC
 *   • Quota errors surface a "Upgrade to Pro" CTA
 *   • Success closes the sheet + offers a "View in chat" jump
 */
import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Search, X, Send, Crown, Check, Loader2, AlertCircle, Sparkles } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/authContext";
import {
  sendPromptMessage,
  useConversations,
  useDailyMessageQuota,
  type ConversationUser,
} from "@/lib/useSupabaseChat";
import { NameBadges } from "@/components/Badges";

interface Props {
  open:    boolean;
  prompt:  string;
  onClose: () => void;
}

/* Tiny debounce hook — avoids querying users on every keystroke */
function useDebounced<T>(value: T, delay = 220): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}

export function SendPromptSheet({ open, prompt, onClose }: Props) {
  const { supabaseUser } = useAuth();
  const myId = supabaseUser?.id ?? null;
  const [, navigate] = useLocation();

  /* Self profile for plan/king detection */
  const [me, setMe] = useState<{ subscription_status?: string } | null>(null);
  useEffect(() => {
    if (!myId || !open) return;
    let alive = true;
    supabase.from("users").select("subscription_status").eq("id", myId).maybeSingle()
      .then(({ data }) => { if (alive) setMe(data ?? null); });
    return () => { alive = false; };
  }, [myId, open]);

  const isPro = me?.subscription_status === "active" || me?.subscription_status === "owner";
  const { count, limit, remaining, isUnlimited } = useDailyMessageQuota(myId, isPro);

  /* Recent chats */
  const { conversations } = useConversations(myId);

  /* Search */
  const [query, setQuery] = useState("");
  const dq = useDebounced(query.trim(), 220);
  const [results, setResults] = useState<ConversationUser[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (dq.length < 2) { setResults([]); return; }
    setSearching(true);
    let alive = true;
    const escaped = dq.replace(/[%_,]/g, (m) => `\\${m}`);
    supabase
      .from("users")
      .select("id, name, username, avatar_url, last_seen, is_owner, is_verified")
      .or(`username.ilike.%${escaped}%,name.ilike.%${escaped}%`)
      .neq("id", myId ?? "")
      .limit(12)
      .then(({ data, error }) => {
        if (!alive) return;
        if (error) console.warn("[SendPromptSheet] search:", error.message);
        setResults((data ?? []) as ConversationUser[]);
        setSearching(false);
      });
    return () => { alive = false; };
  }, [dq, myId, open]);

  /* Send state */
  const [sendingTo, setSendingTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isQuotaError, setIsQuotaError] = useState(false);
  const [sentTo, setSentTo] = useState<{ id: string; name: string } | null>(null);

  /* Reset transient state when re-opened */
  useEffect(() => {
    if (open) {
      setError(null);
      setIsQuotaError(false);
      setSentTo(null);
      setQuery("");
      setResults([]);
    }
  }, [open]);

  const handleSelect = async (target: { id: string; name: string }) => {
    if (sendingTo) return;
    setError(null);
    setIsQuotaError(false);
    setSendingTo(target.id);
    const res = await sendPromptMessage(target.id, prompt);
    setSendingTo(null);
    if (!res.ok) {
      setError(res.error || "Couldn't send the prompt.");
      setIsQuotaError(Boolean(res.isQuotaError));
      return;
    }
    setSentTo(target);
  };

  const recentList = useMemo(
    () => conversations.slice(0, 8).filter((c) => c.otherId !== myId),
    [conversations, myId],
  );

  const showSearchList = dq.length >= 2;

  if (!open) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[120] flex items-end justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", stiffness: 380, damping: 36 }}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-lg overflow-hidden rounded-t-3xl border-x border-t border-white/10 bg-background/95 backdrop-blur-2xl"
        style={{
          maxHeight: "82dvh",
          paddingBottom: `calc(env(safe-area-inset-bottom, 0px) + 16px)`,
        }}
      >
        {/* ── Header ──────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between gap-3 border-b border-white/5 px-5 pt-4 pb-3">
          <div className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-purple-500/30 to-pink-500/30 border border-white/10">
              <Sparkles className="h-4 w-4 text-pink-300" />
            </span>
            <div>
              <h3 className="font-display text-base font-semibold text-white">Send Prompt</h3>
              <p className="text-[11px] text-white/50">Share this prompt with a friend</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-full bg-white/5 border border-white/10"
            aria-label="Close"
          >
            <X className="h-4 w-4 text-white/80" />
          </button>
        </div>

        {/* ── Prompt preview ──────────────────────────────────────────── */}
        <div className="px-5 pt-3">
          <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-purple-600/15 via-pink-500/12 to-blue-500/15 p-3.5">
            <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-pink-300/90">
              Prompt
            </span>
            <p className="text-sm leading-relaxed text-white/90 line-clamp-3">{prompt}</p>
          </div>
        </div>

        {/* ── Quota gauge ─────────────────────────────────────────────── */}
        <div className="px-5 pt-3">
          {isUnlimited ? (
            <div className="flex items-center justify-between rounded-xl border border-yellow-500/25 bg-gradient-to-r from-yellow-500/10 to-amber-500/10 px-3 py-2">
              <span className="flex items-center gap-1.5 text-[11px] font-semibold text-yellow-200">
                <Crown className="h-3.5 w-3.5" />
                Unlimited prompts
              </span>
              <span className="text-[10px] text-yellow-200/60">Pro / King</span>
            </div>
          ) : (
            <div className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2">
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-[11px] font-semibold text-white/70">Daily prompt sends</span>
                <span className="text-[11px] tabular-nums text-white/60">{count} / {limit}</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                <div
                  className={
                    "h-full rounded-full transition-[width] " +
                    (remaining === 0
                      ? "bg-gradient-to-r from-rose-500 to-red-600"
                      : "bg-gradient-to-r from-purple-500 via-pink-500 to-blue-500")
                  }
                  style={{ width: `${Math.min(100, (count / limit) * 100)}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* ── Search ──────────────────────────────────────────────────── */}
        <div className="px-5 pt-3">
          <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2">
            <Search className="h-4 w-4 text-white/40" />
            <input
              autoFocus
              placeholder="Search by name or @username"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="flex-1 bg-transparent text-sm text-white placeholder:text-white/30 focus:outline-none"
            />
            {query && (
              <button onClick={() => setQuery("")} className="text-white/40 hover:text-white/70">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* ── Error / Sent banners ────────────────────────────────────── */}
        <AnimatePresence>
          {error && !sentTo && (
            <motion.div
              initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
              className={
                "mx-5 mt-3 flex items-start gap-2 rounded-xl border px-3 py-2 " +
                (isQuotaError
                  ? "border-yellow-500/30 bg-yellow-500/10"
                  : "border-red-500/30 bg-red-500/10")
              }
            >
              {isQuotaError
                ? <Crown className="mt-0.5 h-4 w-4 shrink-0 text-yellow-400" />
                : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />}
              <div className="flex-1">
                <p className="text-[11px] leading-relaxed text-white/85">{error}</p>
                {isQuotaError && (
                  <button
                    onClick={() => { onClose(); navigate("/subscribe"); }}
                    className="mt-1 text-[11px] font-semibold text-yellow-300 underline"
                  >
                    Upgrade to Pro →
                  </button>
                )}
              </div>
            </motion.div>
          )}

          {sentTo && (
            <motion.div
              initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
              className="mx-5 mt-3 flex items-center justify-between gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2"
            >
              <span className="flex items-center gap-1.5 text-[11px] text-emerald-200">
                <Check className="h-3.5 w-3.5" />
                Sent to <span className="font-semibold">{sentTo.name || "them"}</span>
              </span>
              <button
                onClick={() => { onClose(); navigate(`/messages/${sentTo.id}`); }}
                className="text-[11px] font-semibold text-emerald-200 underline"
              >
                View chat →
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Lists ───────────────────────────────────────────────────── */}
        <div className="mt-3 flex-1 overflow-y-auto px-5 pb-2 hide-scrollbar" style={{ maxHeight: "44dvh" }}>
          {showSearchList ? (
            <>
              <SectionLabel>Search results</SectionLabel>
              {searching ? (
                <CenterMsg><Loader2 className="h-4 w-4 animate-spin" /> Searching…</CenterMsg>
              ) : results.length === 0 ? (
                <CenterMsg>No users found.</CenterMsg>
              ) : (
                results.map((u) => (
                  <PersonRow
                    key={u.id}
                    name={u.name || u.username || "—"}
                    username={u.username}
                    avatar={u.avatar_url}
                    isOwner={Boolean(u.is_owner)}
                    isVerified={Boolean(u.is_verified)}
                    sending={sendingTo === u.id}
                    disabled={Boolean(sendingTo) || (!isUnlimited && remaining === 0)}
                    onSend={() => handleSelect({ id: u.id, name: u.name || u.username || "them" })}
                  />
                ))
              )}
            </>
          ) : (
            <>
              <SectionLabel>Recent chats</SectionLabel>
              {recentList.length === 0 ? (
                <CenterMsg>Search above to find someone.</CenterMsg>
              ) : (
                recentList.map((c) => (
                  <PersonRow
                    key={c.otherId}
                    name={c.otherName || c.otherUsername || "—"}
                    username={c.otherUsername}
                    avatar={c.otherAvatar}
                    isOwner={c.otherIsOwner}
                    isVerified={c.otherIsVerified}
                    sending={sendingTo === c.otherId}
                    disabled={Boolean(sendingTo) || (!isUnlimited && remaining === 0)}
                    onSend={() => handleSelect({
                      id:   c.otherId,
                      name: c.otherName || c.otherUsername || "them",
                    })}
                  />
                ))
              )}
            </>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ── tiny atoms ────────────────────────────────────────────────────────── */

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-1 pt-2 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-white/45">
      {children}
    </div>
  );
}

function CenterMsg({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-center gap-2 py-6 text-[11px] text-white/45">
      {children}
    </div>
  );
}

function PersonRow({
  name, username, avatar, isOwner, isVerified, sending, disabled, onSend,
}: {
  name:        string;
  username?:   string;
  avatar?:     string;
  isOwner:     boolean;
  isVerified:  boolean;
  sending:     boolean;
  disabled:    boolean;
  onSend:      () => void;
}) {
  return (
    <div
      className={
        "flex items-center gap-3 rounded-xl px-2 py-2 transition " +
        (isOwner ? "bg-gradient-to-r from-yellow-500/[0.06] to-amber-500/[0.04]" : "hover:bg-white/[0.04]")
      }
    >
      <div className={
        "h-10 w-10 shrink-0 overflow-hidden rounded-full border " +
        (isOwner ? "border-yellow-400/40 ring-2 ring-yellow-400/20" : "border-white/10")
      }>
        {avatar
          ? <img src={avatar} alt="" loading="lazy" className="h-full w-full object-cover" />
          : <div className="grid h-full w-full place-items-center bg-gradient-to-br from-purple-600 via-pink-500 to-blue-600 text-xs font-bold text-white">
              {(name || "?").charAt(0).toUpperCase()}
            </div>}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-sm font-semibold text-white">{name}</span>
          <NameBadges isOwner={isOwner} isVerified={isVerified} size="sm" />
        </div>
        {username && <p className="truncate text-[11px] text-white/45">@{username}</p>}
      </div>
      <button
        onClick={onSend}
        disabled={disabled || sending}
        className={
          "flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[11px] font-semibold transition " +
          (disabled
            ? "border border-white/10 bg-white/5 text-white/35"
            : "bg-gradient-to-r from-purple-600 via-pink-500 to-blue-500 text-white shadow-[0_4px_18px_-6px_rgba(236,72,153,0.55)] active:scale-95")
        }
      >
        {sending
          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
          : <Send className="h-3.5 w-3.5" />}
        {sending ? "Sending…" : "Send"}
      </button>
    </div>
  );
}
