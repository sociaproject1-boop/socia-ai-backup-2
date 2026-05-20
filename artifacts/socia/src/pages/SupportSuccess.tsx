/**
 * Community-support PayMongo redirect-back page.
 *
 * URL: /support/success?ref=<community_support.id>
 *
 * Polls GET /api/paymongo/support/:ref until the signed webhook flips the
 * row to "paid". Short (1.5s) and bounded (~60s) so the UI never hangs.
 */
import { useEffect, useRef, useState, useMemo } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { CheckCircle2, Loader2, AlertTriangle, Heart } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { detectInitialLocale, getSupportCopy } from "@/lib/i18n/support";

interface SupportPayment {
  id:               string;
  status:           "pending" | "paid" | "failed";
  amount_centavos:  number;
  payment_method:   string | null;
  paid_at:          string | null;
}

const BASE = `${import.meta.env.BASE_URL}api`.replace(/\/{2,}/g, "/");
const MAX_TRIES = 40;
const POLL_MS   = 1500;

type Phase = "polling" | "paid" | "stuck" | "failed";

export default function SupportSuccess() {
  const [, navigate] = useLocation();
  const [phase, setPhase] = useState<Phase>("polling");
  const [payment, setPayment] = useState<SupportPayment | null>(null);
  const triesRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const locale = useMemo(() => detectInitialLocale(), []);
  const copy = useMemo(() => getSupportCopy(locale), [locale]);

  const ref = new URLSearchParams(window.location.search).get("ref") ?? "";

  useEffect(() => {
    if (!ref) { setPhase("failed"); return; }
    let cancelled = false;

    const tick = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) { setPhase("failed"); return; }
        const r = await fetch(`${BASE}/paymongo/support/${ref}`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (r.ok) {
          const d = await r.json();
          if (cancelled) return;
          const p: SupportPayment = d.payment;
          setPayment(p);
          if (p.status === "paid") { setPhase("paid"); return; }
          if (p.status === "failed") { setPhase("failed"); return; }
        }
      } catch { /* keep polling */ }
      triesRef.current += 1;
      if (triesRef.current >= MAX_TRIES) { setPhase("stuck"); return; }
      timerRef.current = setTimeout(tick, POLL_MS);
    };

    tick();
    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [ref]);

  const amountPhp = payment ? payment.amount_centavos / 100 : 0;

  return (
    <div className="min-h-[100dvh] w-full flex items-center justify-center px-5 py-8 app-bg">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="w-full max-w-md rounded-[28px] p-7 text-center"
        style={{
          background: "linear-gradient(180deg,#11111f,#0d0d1a)",
          border: "1px solid rgba(168,85,247,0.22)",
          boxShadow: "0 18px 48px -16px rgba(168,85,247,0.35)",
        }}
      >
        {phase === "polling" && (
          <>
            <div className="mx-auto mb-5 grid h-16 w-16 place-items-center rounded-full"
                 style={{ background: "rgba(168,85,247,0.12)", border: "1px solid rgba(168,85,247,0.3)" }}>
              <Loader2 className="h-7 w-7 animate-spin text-purple-400" />
            </div>
            <h1 className="font-display text-[20px] font-black text-white">
              {copy.securing}
            </h1>
            <p className="mt-2 text-[12px] leading-relaxed text-white/55">
              Confirming your contribution with PayMongo. This usually takes a few seconds.
            </p>
          </>
        )}

        {phase === "paid" && (
          <>
            <div className="relative mx-auto mb-5 h-16 w-16">
              {/* Pulsing glow ring — purple→pink, fades softly behind the
                  success badge. Two staggered rings for a richer halo. */}
              <motion.span
                aria-hidden
                className="absolute inset-0 rounded-full"
                style={{ background: "radial-gradient(circle, rgba(168,85,247,0.55), transparent 65%)" }}
                initial={{ scale: 0.7, opacity: 0.0 }}
                animate={{ scale: [0.9, 1.45, 0.9], opacity: [0.55, 0, 0.55] }}
                transition={{ duration: 2.4, repeat: Infinity, ease: "easeOut" }}
              />
              <motion.span
                aria-hidden
                className="absolute inset-0 rounded-full"
                style={{ background: "radial-gradient(circle, rgba(236,72,153,0.55), transparent 65%)" }}
                initial={{ scale: 0.7, opacity: 0.0 }}
                animate={{ scale: [1.0, 1.65, 1.0], opacity: [0.4, 0, 0.4] }}
                transition={{ duration: 2.4, repeat: Infinity, ease: "easeOut", delay: 0.6 }}
              />
              <motion.div
                initial={{ scale: 0.7, opacity: 0 }}
                animate={{ scale: 1,   opacity: 1 }}
                transition={{ type: "spring", stiffness: 280, damping: 18 }}
                className="relative z-[1] grid h-16 w-16 place-items-center rounded-full"
                style={{
                  background: "linear-gradient(135deg,#a855f7,#ec4899)",
                  boxShadow: "0 0 40px -4px rgba(168,85,247,0.65), 0 0 80px -16px rgba(236,72,153,0.5)",
                }}
              >
                <CheckCircle2 className="h-8 w-8 text-white" />
              </motion.div>
            </div>
            <h1 className="font-display text-[22px] font-black text-white">
              {copy.thanksTitle}
            </h1>
            <p className="mt-2 mb-5 text-[12.5px] leading-relaxed text-white/60">
              {copy.thanksBody}
            </p>
            <div className="mb-5 rounded-2xl p-3.5"
                 style={{ background: "rgba(168,85,247,0.08)", border: "1px solid rgba(168,85,247,0.18)" }}>
              <p className="text-[10.5px] font-semibold uppercase tracking-wider text-purple-300">
                Your contribution
              </p>
              <p className="mt-1 font-display text-[28px] font-black text-white">
                ₱{Math.floor(amountPhp).toLocaleString()}
              </p>
              {payment?.paid_at && (
                <p className="mt-0.5 text-[10.5px] text-white/40">
                  {new Date(payment.paid_at).toLocaleString()}
                </p>
              )}
            </div>
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={() => navigate("/")}
              className="w-full rounded-2xl py-3 text-sm font-bold text-white"
              style={{
                background: "linear-gradient(135deg,#a855f7,#ec4899)",
                boxShadow: "0 10px 24px -8px rgba(168,85,247,0.55)",
              }}
            >
              <Heart className="mr-1.5 inline h-4 w-4" /> {copy.thanksCta}
            </motion.button>
          </>
        )}

        {(phase === "failed" || phase === "stuck") && (
          <>
            <div className="mx-auto mb-5 grid h-16 w-16 place-items-center rounded-full"
                 style={{ background: "rgba(244,63,94,0.12)", border: "1px solid rgba(244,63,94,0.3)" }}>
              <AlertTriangle className="h-7 w-7 text-rose-400" />
            </div>
            <h1 className="font-display text-[20px] font-black text-white">
              {phase === "failed" ? "Payment not completed" : "Still confirming…"}
            </h1>
            <p className="mt-2 mb-5 text-[12px] leading-relaxed text-white/55">
              {phase === "failed"
                ? "We couldn't confirm this contribution. No charge was made — please try again from the Support Socia card."
                : "Your bank is taking a little longer than usual. You'll receive an update once the contribution is confirmed."}
            </p>
            <button
              onClick={() => navigate("/")}
              className="w-full rounded-2xl py-3 text-sm font-bold text-white"
              style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}
            >
              {copy.thanksCta}
            </button>
          </>
        )}
      </motion.div>
    </div>
  );
}
