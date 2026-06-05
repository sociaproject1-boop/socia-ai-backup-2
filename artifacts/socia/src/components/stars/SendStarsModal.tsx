/**
 * SendStarsModal.tsx
 * Bottom-sheet modal for sending Creator Stars to another user.
 * Shown from UserProfile and PostDetail when tapping "Send Stars".
 */
import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Star, Zap, AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { sendStars, getStarBalance, type StarWallet, type StarUser } from "@/lib/starsClient";

const PRESETS = [1, 5, 10, 25, 50, 100];

interface Props {
  creator:   StarUser;
  onClose:   () => void;
  onSuccess?: (txId: string, newBalance: number) => void;
}

type Phase = "select" | "sending" | "success" | "error";

export default function SendStarsModal({ creator, onClose, onSuccess }: Props) {
  const [wallet,     setWallet]     = useState<StarWallet | null>(null);
  const [selected,   setSelected]   = useState<number>(5);
  const [custom,     setCustom]     = useState<string>("");
  const [useCustom,  setUseCustom]  = useState(false);
  const [phase,      setPhase]      = useState<Phase>("select");
  const [errMsg,     setErrMsg]     = useState<string>("");
  const [newBal,     setNewBal]     = useState<number>(0);
  const [txId,       setTxId]       = useState<string>("");

  /* ── Load sender's current balance ────────────────────────────────────── */
  useEffect(() => {
    getStarBalance()
      .then(setWallet)
      .catch(() => setWallet({ balance: 0, lifetime_received: 0, lifetime_sent: 0 }));
  }, []);

  const effectiveAmount = useCustom
    ? Math.max(0, Math.floor(Number(custom) || 0))
    : selected;

  const isSending = phase === "sending";
  const canSend =
    phase === "select" &&
    effectiveAmount >= 1 &&
    effectiveAmount <= 10_000 &&
    wallet !== null &&
    wallet.balance >= effectiveAmount;

  /* ── Send ──────────────────────────────────────────────────────────────── */
  const handleSend = useCallback(async () => {
    if (!canSend) return;
    setPhase("sending");
    setErrMsg("");
    try {
      const result = await sendStars({
        receiver_id:  creator.id,
        amount:       effectiveAmount,
        reference_id: `${creator.id}-${Date.now()}`,
      });
      setTxId(result.transaction_id);
      setNewBal(result.sender_balance);
      setPhase("success");
      onSuccess?.(result.transaction_id, result.sender_balance);
    } catch (err: unknown) {
      const raw = err instanceof Error ? err.message : String(err);
      const friendlyMap: Record<string, string> = {
        insufficient_balance: "Not enough stars in your wallet.",
        cannot_send_to_self:  "You can't send stars to yourself.",
        receiver_not_found:   "Creator account not found.",
        duplicate_transaction: "This transaction was already submitted.",
        amount_too_large:     "Maximum 10,000 stars per transaction.",
      };
      setErrMsg(friendlyMap[raw] ?? "Something went wrong. Please try again.");
      setPhase("error");
    }
  }, [canSend, creator.id, effectiveAmount, onSuccess]);

  /* ── Avatar helpers ────────────────────────────────────────────────────── */
  const displayName = creator.name || creator.username || "Creator";
  const initials    = displayName.charAt(0).toUpperCase();

  return (
    <AnimatePresence>
      {/* Backdrop */}
      <motion.div
        key="backdrop"
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={() => phase !== "sending" && onClose()}
      />

      {/* Sheet */}
      <motion.div
        key="sheet"
        className="fixed bottom-0 left-0 right-0 z-50 mx-auto max-w-md rounded-t-[28px] pb-safe"
        style={{ background: "linear-gradient(180deg,#0d0d1a 0%,#0a0a14 100%)", border: "1px solid rgba(168,85,247,0.2)", borderBottom: "none" }}
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", stiffness: 340, damping: 32 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="h-1 w-10 rounded-full bg-white/20" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3">
          <div className="flex items-center gap-3">
            {creator.avatar_url ? (
              <img
                src={creator.avatar_url}
                alt={displayName}
                className="h-10 w-10 rounded-full object-cover"
                style={{ border: "2px solid rgba(168,85,247,0.4)" }}
              />
            ) : (
              <div
                className="h-10 w-10 rounded-full flex items-center justify-center text-white font-bold text-[15px]"
                style={{ background: "linear-gradient(135deg,#7c3aed,#db2777)" }}
              >
                {initials}
              </div>
            )}
            <div>
              <p className="text-[13px] font-bold text-white">{displayName}</p>
              {creator.username && (
                <p className="text-[11px] text-white/40">@{creator.username}</p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-full text-white/60 transition-colors hover:text-white"
            style={{ background: "rgba(255,255,255,0.06)" }}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 pb-8">

          {/* ── Success state ─────────────────────────────────────────────── */}
          {phase === "success" && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex flex-col items-center gap-4 py-6 text-center"
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: [0, 1.3, 1] }}
                transition={{ duration: 0.5, times: [0, 0.6, 1] }}
                className="relative"
              >
                <div className="h-20 w-20 rounded-full flex items-center justify-center"
                     style={{ background: "linear-gradient(135deg,rgba(168,85,247,0.3),rgba(236,72,153,0.2))", border: "2px solid rgba(168,85,247,0.5)" }}>
                  <Star className="h-9 w-9 text-yellow-400 fill-yellow-400" />
                </div>
                {/* Sparkle particles */}
                {[...Array(6)].map((_, i) => (
                  <motion.div
                    key={i}
                    className="absolute h-2 w-2 rounded-full bg-yellow-400"
                    style={{ top: "50%", left: "50%", translateX: "-50%", translateY: "-50%" }}
                    initial={{ scale: 0, x: 0, y: 0 }}
                    animate={{
                      scale: [0, 1, 0],
                      x: Math.cos((i / 6) * Math.PI * 2) * 48,
                      y: Math.sin((i / 6) * Math.PI * 2) * 48,
                    }}
                    transition={{ duration: 0.7, delay: 0.1, ease: "easeOut" }}
                  />
                ))}
              </motion.div>
              <div>
                <p className="text-[22px] font-black text-white">
                  {effectiveAmount} Stars Sent! ⭐
                </p>
                <p className="mt-1 text-[13px] text-white/50">
                  Your new balance: <span className="font-bold text-purple-300">{newBal} stars</span>
                </p>
              </div>
              <button
                onClick={onClose}
                className="mt-2 w-full rounded-2xl py-3 text-[14px] font-bold text-white"
                style={{ background: "linear-gradient(135deg,#a855f7,#ec4899)" }}
              >
                Done
              </button>
            </motion.div>
          )}

          {/* ── Error state ───────────────────────────────────────────────── */}
          {phase === "error" && (
            <div className="flex flex-col items-center gap-4 py-6 text-center">
              <div className="h-16 w-16 rounded-full flex items-center justify-center"
                   style={{ background: "rgba(239,68,68,0.15)", border: "1.5px solid rgba(239,68,68,0.35)" }}>
                <AlertCircle className="h-8 w-8 text-red-400" />
              </div>
              <div>
                <p className="text-[16px] font-bold text-white">Couldn't Send Stars</p>
                <p className="mt-1 text-[12.5px] text-white/50 max-w-xs">{errMsg}</p>
              </div>
              <div className="flex w-full gap-3">
                <button
                  onClick={() => setPhase("select")}
                  className="flex-1 rounded-2xl py-3 text-[13px] font-bold text-white"
                  style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)" }}
                >
                  Try Again
                </button>
                <button
                  onClick={onClose}
                  className="flex-1 rounded-2xl py-3 text-[13px] font-bold text-white/60"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* ── Select / Sending state ────────────────────────────────────── */}
          {(phase === "select" || phase === "sending") && (
            <>
              {/* Title + balance */}
              <div className="mb-5 text-center">
                <p className="text-[11px] font-bold uppercase tracking-wider text-purple-400 mb-1">
                  Send Stars
                </p>
                <h2 className="text-[18px] font-black text-white">
                  How many Stars?
                </h2>
                <p className="mt-1 text-[12px] text-white/40">
                  Your balance:&nbsp;
                  <span className="font-bold text-yellow-400">
                    {wallet === null ? "…" : `${wallet.balance} ⭐`}
                  </span>
                </p>
              </div>

              {/* Preset grid */}
              {!useCustom && (
                <div className="grid grid-cols-3 gap-2 mb-4">
                  {PRESETS.map((n) => {
                    const active  = selected === n;
                    const tooMany = wallet !== null && wallet.balance < n;
                    return (
                      <motion.button
                        key={n}
                        whileTap={{ scale: 0.93 }}
                        onClick={() => !tooMany && setSelected(n)}
                        disabled={tooMany || phase === "sending"}
                        className="flex flex-col items-center justify-center rounded-[16px] py-3 transition-all"
                        style={{
                          background: active
                            ? "linear-gradient(135deg,rgba(168,85,247,0.3),rgba(236,72,153,0.2))"
                            : "rgba(255,255,255,0.04)",
                          border: active
                            ? "1.5px solid rgba(168,85,247,0.6)"
                            : "1.5px solid rgba(255,255,255,0.07)",
                          opacity: tooMany ? 0.35 : 1,
                        }}
                      >
                        <Star
                          className="h-5 w-5 mb-1"
                          style={{ color: active ? "#facc15" : "rgba(255,255,255,0.4)" }}
                          fill={active ? "#facc15" : "none"}
                        />
                        <span
                          className="text-[15px] font-black"
                          style={{ color: active ? "#ffffff" : "rgba(255,255,255,0.6)" }}
                        >
                          {n}
                        </span>
                        <span className="text-[9px] font-semibold uppercase tracking-wide"
                              style={{ color: active ? "rgba(216,180,254,0.8)" : "rgba(255,255,255,0.25)" }}>
                          Stars
                        </span>
                      </motion.button>
                    );
                  })}
                </div>
              )}

              {/* Custom amount toggle */}
              {useCustom ? (
                <div className="mb-4">
                  <div className="flex items-center gap-2 rounded-[16px] px-4 py-3"
                       style={{ background: "rgba(168,85,247,0.08)", border: "1.5px solid rgba(168,85,247,0.3)" }}>
                    <Star className="h-5 w-5 shrink-0 text-yellow-400" />
                    <input
                      type="number"
                      min={1}
                      max={10000}
                      value={custom}
                      onChange={(e) => setCustom(e.target.value)}
                      placeholder="Enter amount…"
                      autoFocus
                      className="w-full bg-transparent text-[18px] font-bold text-white outline-none placeholder:text-white/25"
                    />
                    <button onClick={() => { setUseCustom(false); setCustom(""); }}
                            className="text-[11px] font-semibold text-white/40 hover:text-white/70">
                      Presets
                    </button>
                  </div>
                  {Number(custom) > 10_000 && (
                    <p className="mt-1.5 text-[11px] text-red-400">Maximum 10,000 stars per send.</p>
                  )}
                  {wallet !== null && Number(custom) > wallet.balance && Number(custom) > 0 && (
                    <p className="mt-1.5 text-[11px] text-red-400">Exceeds your balance of {wallet.balance} stars.</p>
                  )}
                </div>
              ) : (
                <button
                  onClick={() => setUseCustom(true)}
                  className="mb-4 w-full rounded-[14px] py-2.5 text-[12.5px] font-semibold text-white/50 transition-colors hover:text-white/80"
                  style={{ background: "rgba(255,255,255,0.03)", border: "1px dashed rgba(255,255,255,0.1)" }}
                >
                  <Zap className="mr-1.5 inline h-3.5 w-3.5 text-purple-400" />
                  Custom amount
                </button>
              )}

              {/* Wallet empty notice */}
              {wallet !== null && wallet.balance === 0 && (
                <div className="mb-4 flex items-center gap-2.5 rounded-[14px] p-3"
                     style={{ background: "rgba(251,191,36,0.06)", border: "1px solid rgba(251,191,36,0.15)" }}>
                  <AlertCircle className="h-4 w-4 shrink-0 text-yellow-400" />
                  <p className="text-[11.5px] text-yellow-300/80 leading-relaxed">
                    Your star wallet is empty. Stars will be purchasable soon.
                  </p>
                </div>
              )}

              {/* Send button */}
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={handleSend}
                disabled={!canSend || isSending}
                className="w-full rounded-2xl py-3.5 text-[14px] font-bold text-white transition-opacity disabled:opacity-40"
                style={{ background: "linear-gradient(135deg,#a855f7,#ec4899)" }}
              >
                {isSending ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Sending…
                  </span>
                ) : (
                  <>
                    <Star className="mr-1.5 inline h-4 w-4 fill-yellow-300 text-yellow-300" />
                    Send {effectiveAmount > 0 ? effectiveAmount : "—"} Stars
                  </>
                )}
              </motion.button>

              <p className="mt-3 text-center text-[10.5px] text-white/25 leading-relaxed">
                Stars are platform credits — not real money.
                Transactions are permanent and non-refundable.
              </p>
            </>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
