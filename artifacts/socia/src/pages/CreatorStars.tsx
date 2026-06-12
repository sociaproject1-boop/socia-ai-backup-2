/**
 * CreatorStars.tsx — Fully functional Creator Stars wallet + send hub.
 *
 * Tabs:
 *   Wallet  — balance card + quick-send by username
 *   Sent    — paginated history of stars this user sent
 *   Received — paginated history of stars this user received
 */
import { useEffect, useState, useCallback } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, Star, Zap, ArrowUpRight, ArrowDownLeft,
  Clock, ChevronRight, Loader2, AlertCircle, Search,
} from "lucide-react";
import {
  getStarBalance,
  getStarHistory,
  type StarWallet,
  type StarTransaction,
} from "@/lib/starsClient";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/authContext";
import SendStarsModal from "@/components/stars/SendStarsModal";
import type { StarUser } from "@/lib/starsClient";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 604_800_000) return `${Math.floor(diff / 86_400_000)}d ago`;
  return new Date(iso).toLocaleDateString("en-PH", { month: "short", day: "numeric" });
}

function compact(n: number) {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return (n / 1000).toFixed(1).replace(/\.0$/, "") + "K";
  return (n / 1_000_000).toFixed(1) + "M";
}

type Tab = "wallet" | "sent" | "received";

export default function CreatorStars() {
  const [, navigate]        = useLocation();
  const { supabaseUser }    = useAuth();
  const [tab,    setTab]    = useState<Tab>("wallet");
  const [wallet, setWallet] = useState<StarWallet | null>(null);
  const [walletLoading, setWalletLoading] = useState(true);

  /* ── Search state ─────────────────────────────────────────────────────── */
  const [search,         setSearch]         = useState("");
  const [searchResults,  setSearchResults]  = useState<StarUser[]>([]);
  const [searchLoading,  setSearchLoading]  = useState(false);
  const [selectedCreator, setSelectedCreator] = useState<StarUser | null>(null);

  /* ── History state ────────────────────────────────────────────────────── */
  const [sentTx,     setSentTx]     = useState<StarTransaction[]>([]);
  const [receivedTx, setReceivedTx] = useState<StarTransaction[]>([]);
  const [histLoading, setHistLoading] = useState(false);

  /* ── Load wallet balance ──────────────────────────────────────────────── */
  const loadWallet = useCallback(async () => {
    if (!supabaseUser) return;
    setWalletLoading(true);
    try { setWallet(await getStarBalance()); } catch { /* ignore */ }
    finally { setWalletLoading(false); }
  }, [supabaseUser]);

  useEffect(() => { loadWallet(); }, [loadWallet]);

  /* ── Load history when tab changes ───────────────────────────────────── */
  useEffect(() => {
    if (tab === "wallet") return;
    if (!supabaseUser) return;
    setHistLoading(true);
    const dir = tab === "sent" ? "sent" : "received";
    getStarHistory({ direction: dir, limit: 30 })
      .then((tx) => {
        if (dir === "sent")     setSentTx(tx);
        else                    setReceivedTx(tx);
      })
      .catch(() => {})
      .finally(() => setHistLoading(false));
  }, [tab, supabaseUser]);

  /* ── Search creators ──────────────────────────────────────────────────── */
  useEffect(() => {
    const q = search.trim();
    if (q.length < 2) { setSearchResults([]); return; }
    setSearchLoading(true);
    const timer = setTimeout(async () => {
      try {
        const { data } = await supabase
          .from("users")
          .select("id, name, username, avatar_url")
          .or(`username.ilike.%${q}%,name.ilike.%${q}%`)
          .neq("id", supabaseUser?.id ?? "")
          .limit(6);
        setSearchResults((data as StarUser[]) ?? []);
      } catch { setSearchResults([]); }
      finally { setSearchLoading(false); }
    }, 350);
    return () => clearTimeout(timer);
  }, [search, supabaseUser]);

  /* ── Unauthenticated guard ────────────────────────────────────────────── */
  if (!supabaseUser) {
    return (
      <div className="app-bg flex min-h-[100dvh] flex-col items-center justify-center gap-4 px-6 text-center">
        <Star className="h-10 w-10 text-yellow-400" />
        <p className="font-bold text-white">Sign in to use Creator Stars</p>
        <button onClick={() => navigate("/")}
          className="rounded-full bg-[#1D9BF0] px-6 py-2.5 text-sm font-bold text-white">
          Go Home
        </button>
      </div>
    );
  }

  const txList = tab === "sent" ? sentTx : receivedTx;

  return (
    <div className="app-bg min-h-[100dvh] pb-28">

      {/* ── Header ──────────────────────────────────────────────────── */}
      <div className="app-header sticky top-0 z-40 flex items-center gap-3 px-4 py-3">
        <button onClick={() => navigate(-1 as any)}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full app-surface">
          <ArrowLeft className="h-4 w-4 app-text" />
        </button>
        <h1 className="flex-1 font-display text-[17px] font-bold app-text">Creator Stars</h1>
        <span className="rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wide text-yellow-400"
          style={{ background: "rgba(251,191,36,0.12)", border: "1px solid rgba(251,191,36,0.25)" }}>
          LIVE
        </span>
      </div>

      {/* ── Wallet hero card ─────────────────────────────────────────── */}
      <div className="px-4 pt-2">
        <div className="relative overflow-hidden rounded-[22px] p-5"
          style={{ background: "linear-gradient(135deg,#0f0a20,#1a0c2e)", border: "1px solid rgba(168,85,247,0.25)" }}>
          <div className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full opacity-25"
            style={{ background: "radial-gradient(circle,#a855f7,transparent)" }} />
          <div className="pointer-events-none absolute -bottom-4 -left-4 h-20 w-20 rounded-full opacity-15"
            style={{ background: "radial-gradient(circle,#ec4899,transparent)" }} />

          <div className="relative flex items-start justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-[#1D9BF0]">Your Star Balance</p>
              {walletLoading ? (
                <div className="mt-2 h-10 w-32 animate-pulse rounded-xl bg-white/10" />
              ) : (
                <motion.p
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-1 font-display text-[38px] font-black leading-none text-white"
                >
                  {compact(wallet?.balance ?? 0)}
                  <span className="ml-2 text-[22px] text-yellow-400">⭐</span>
                </motion.p>
              )}
              <p className="mt-1.5 text-[11px] text-white/40">
                {walletLoading ? "…" : `${compact(wallet?.lifetime_received ?? 0)} received · ${compact(wallet?.lifetime_sent ?? 0)} sent all time`}
              </p>
            </div>
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl"
              style={{ background: "linear-gradient(135deg,rgba(168,85,247,0.3),rgba(236,72,153,0.2))", border: "1px solid rgba(168,85,247,0.35)" }}>
              <Star className="h-6 w-6 fill-yellow-400 text-yellow-400" />
            </div>
          </div>

          {/* Sub-stats */}
          {!walletLoading && (
            <div className="mt-4 grid grid-cols-2 gap-3">
              {[
                { label: "Lifetime Received", value: wallet?.lifetime_received ?? 0, icon: ArrowDownLeft, color: "#4ade80" },
                { label: "Lifetime Sent",     value: wallet?.lifetime_sent     ?? 0, icon: ArrowUpRight,  color: "#c084fc" },
              ].map(({ label, value, icon: Icon, color }) => (
                <div key={label} className="flex items-center gap-2 rounded-[14px] px-3 py-2"
                  style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}>
                  <Icon className="h-3.5 w-3.5 shrink-0" style={{ color }} />
                  <div>
                    <p className="text-[12px] font-bold text-white">{compact(value)}</p>
                    <p className="text-[9.5px] text-white/40">{label}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Get More Stars CTA ─────────────────────────────────────── */}
        {!walletLoading && (wallet?.balance ?? 0) === 0 && (
          <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
            className="mt-3 flex items-center gap-3 rounded-[18px] px-4 py-3"
            style={{ background: "rgba(251,191,36,0.06)", border: "1px solid rgba(251,191,36,0.2)" }}>
            <Zap className="h-5 w-5 shrink-0 text-yellow-400" />
            <div className="flex-1">
              <p className="text-[12.5px] font-bold text-yellow-300">Get Starter Stars</p>
              <p className="text-[11px] text-white/40">Stars will be purchasable soon. Stay tuned!</p>
            </div>
          </motion.div>
        )}
      </div>

      {/* ── Tabs ─────────────────────────────────────────────────────── */}
      <div className="mt-4 flex gap-1 px-4">
        {(["wallet", "sent", "received"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="flex-1 rounded-full py-2 text-[12px] font-bold capitalize transition-all"
            style={{
              background: tab === t
                ? "linear-gradient(135deg,rgba(168,85,247,0.25),rgba(236,72,153,0.15))"
                : "rgba(255,255,255,0.04)",
              border: tab === t ? "1px solid rgba(168,85,247,0.5)" : "1px solid rgba(255,255,255,0.06)",
              color:   tab === t ? "#fff" : "rgba(255,255,255,0.4)",
            }}
          >
            {t === "wallet" ? "Send Stars" : t === "sent" ? "Sent" : "Received"}
          </button>
        ))}
      </div>

      {/* ── Tab content ───────────────────────────────────────────────── */}
      <AnimatePresence mode="wait">
        {tab === "wallet" && (
          <motion.div key="wallet" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="px-4 pt-4">

            {/* Search */}
            <p className="mb-2 text-[10.5px] font-semibold uppercase tracking-wider text-white/40">
              Send Stars to a Creator
            </p>
            <div className="flex items-center gap-2 rounded-[16px] px-4 py-3 mb-3"
              style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)" }}>
              <Search className="h-4 w-4 shrink-0 text-white/30" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name or @username…"
                className="w-full bg-transparent text-[13.5px] text-white outline-none placeholder:text-white/25"
              />
              {searchLoading && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-white/30" />}
            </div>

            {/* Search results */}
            {search.trim().length >= 2 && (
              <div className="space-y-1 mb-4">
                {searchResults.length === 0 && !searchLoading && (
                  <p className="py-4 text-center text-[12px] text-white/30">No creators found for "{search}"</p>
                )}
                {searchResults.map((u) => {
                  const initials = (u.name || u.username || "?").charAt(0).toUpperCase();
                  return (
                    <motion.button
                      key={u.id}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => setSelectedCreator(u)}
                      className="flex w-full items-center gap-3 rounded-[16px] px-4 py-3 text-left transition-colors hover:bg-white/[0.04]"
                      style={{ border: "1px solid rgba(255,255,255,0.06)" }}
                    >
                      {u.avatar_url ? (
                        <img src={u.avatar_url} alt={u.name ?? ""} className="h-10 w-10 rounded-full object-cover"
                          style={{ border: "2px solid rgba(168,85,247,0.35)" }} />
                      ) : (
                        <div className="h-10 w-10 rounded-full flex items-center justify-center text-white font-bold"
                          style={{ background: "linear-gradient(135deg,#7c3aed,#db2777)" }}>
                          {initials}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-bold text-white truncate">{u.name || u.username}</p>
                        {u.username && <p className="text-[11px] text-white/40">@{u.username}</p>}
                      </div>
                      <div className="flex items-center gap-1 text-[#1D9BF0]">
                        <Star className="h-3.5 w-3.5" />
                        <span className="text-[11px] font-bold">Send</span>
                        <ChevronRight className="h-3.5 w-3.5" />
                      </div>
                    </motion.button>
                  );
                })}
              </div>
            )}

            {/* Empty state when not searching */}
            {search.trim().length < 2 && (
              <div className="mt-6 flex flex-col items-center gap-3 py-8 text-center">
                <div className="h-16 w-16 rounded-2xl grid place-items-center"
                  style={{ background: "rgba(168,85,247,0.1)", border: "1px solid rgba(168,85,247,0.2)" }}>
                  <Star className="h-7 w-7 text-[#1D9BF0]" />
                </div>
                <div>
                  <p className="text-[14px] font-bold text-white">Support a Creator</p>
                  <p className="mt-1 text-[12px] text-white/40 max-w-[240px]">
                    Search for any creator on Socia and send them Stars as a token of support.
                  </p>
                </div>
              </div>
            )}
          </motion.div>
        )}

        {(tab === "sent" || tab === "received") && (
          <motion.div key={tab} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="px-4 pt-4">

            {histLoading ? (
              <div className="space-y-2">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="flex items-center gap-3 rounded-[16px] p-3 animate-pulse"
                    style={{ background: "rgba(255,255,255,0.03)" }}>
                    <div className="h-10 w-10 rounded-full bg-white/10 shrink-0" />
                    <div className="flex-1 space-y-2">
                      <div className="h-3 bg-white/10 rounded-full w-1/2" />
                      <div className="h-2.5 bg-white/6 rounded-full w-1/3" />
                    </div>
                    <div className="h-5 w-16 bg-white/10 rounded-full" />
                  </div>
                ))}
              </div>
            ) : txList.length === 0 ? (
              <div className="mt-12 flex flex-col items-center gap-3 text-center">
                <Clock className="h-10 w-10 text-white/20" />
                <p className="text-[13px] text-white/40">
                  {tab === "sent" ? "You haven't sent any stars yet." : "No stars received yet."}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {txList.map((tx) => {
                  const isSent    = tab === "sent";
                  const other     = isSent ? tx.receiver : tx.sender;
                  const otherName = other?.name || other?.username || "Unknown";
                  const initials  = otherName.charAt(0).toUpperCase();
                  const isAdminGrant = !tx.sender_id;

                  return (
                    <motion.div
                      key={tx.id}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex items-center gap-3 rounded-[16px] px-4 py-3"
                      style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)" }}
                    >
                      {/* Avatar */}
                      {isAdminGrant ? (
                        <div className="h-10 w-10 rounded-full shrink-0 flex items-center justify-center"
                          style={{ background: "linear-gradient(135deg,rgba(168,85,247,0.3),rgba(236,72,153,0.2))", border: "1px solid rgba(168,85,247,0.4)" }}>
                          <Zap className="h-5 w-5 text-[#1D9BF0]" />
                        </div>
                      ) : other?.avatar_url ? (
                        <img src={other.avatar_url} alt={otherName}
                          className="h-10 w-10 rounded-full object-cover shrink-0"
                          style={{ border: "1.5px solid rgba(168,85,247,0.3)" }} />
                      ) : (
                        <div className="h-10 w-10 rounded-full flex items-center justify-center text-white font-bold text-[13px] shrink-0"
                          style={{ background: "linear-gradient(135deg,#7c3aed,#db2777)" }}>
                          {initials}
                        </div>
                      )}

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-semibold text-white truncate">
                          {isAdminGrant ? "Socia (Admin Grant)" : isSent ? `To ${otherName}` : `From ${otherName}`}
                        </p>
                        <p className="text-[10.5px] text-white/35">{relTime(tx.created_at)}</p>
                      </div>

                      {/* Amount */}
                      <div className="flex items-center gap-1 shrink-0">
                        <Star className={`h-3.5 w-3.5 ${isSent && !isAdminGrant ? "text-[#1D9BF0]" : "fill-yellow-400 text-yellow-400"}`} />
                        <span className={`text-[14px] font-black ${isSent && !isAdminGrant ? "text-white" : "text-yellow-400"}`}>
                          {isSent && !isAdminGrant ? "-" : "+"}{tx.amount}
                        </span>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Send Stars Modal ─────────────────────────────────────────── */}
      {selectedCreator && (
        <SendStarsModal
          creator={selectedCreator}
          onClose={() => setSelectedCreator(null)}
          onSuccess={(_, newBal) => {
            setWallet((w) => w ? { ...w, balance: newBal } : w);
            setSelectedCreator(null);
          }}
        />
      )}
    </div>
  );
}
