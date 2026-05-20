/**
 * PayMongo redirect-back page.
 *
 * URL: /billing/success?ref=<paymongo_payments.id>
 *
 * Polls GET /api/paymongo/payment/:ref until the webhook flips status to
 * "paid" (or fails out). The poll is short (1.5s) and bounded (max 40 tries
 * ≈ 60s) so the UI doesn't hang forever if the webhook is delayed.
 */
import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { CheckCircle2, Loader2, AlertTriangle, Sparkles } from "lucide-react";
import { fetchPaymongoPayment, fetchMyBilling, type PaymongoPaymentStatus } from "@/lib/billing";

type Phase = "polling" | "paid" | "stuck" | "failed";

const MAX_TRIES = 40;
const POLL_MS = 1500;

export default function BillingSuccess() {
  const [, navigate] = useLocation();
  const [phase, setPhase] = useState<Phase>("polling");
  const [payment, setPayment] = useState<PaymongoPaymentStatus | null>(null);
  const triesRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const ref = new URLSearchParams(window.location.search).get("ref") ?? "";

  useEffect(() => {
    if (!ref) { setPhase("failed"); return; }
    let cancelled = false;

    const tick = async () => {
      try {
        const p = await fetchPaymongoPayment(ref);
        if (cancelled) return;
        setPayment(p);
        if (p.status === "paid") {
          setPhase("paid");
          // Refresh billing summary so credits update everywhere on return.
          fetchMyBilling().catch(() => {});
          return;
        }
        if (p.status === "failed" || p.status === "cancelled" || p.status === "expired") {
          setPhase("failed");
          return;
        }
      } catch {
        // network blip — keep polling
      }
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

  return (
    <div className="app-bg min-h-[100dvh] flex items-center justify-center px-4 py-10">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="card-premium w-full max-w-sm rounded-3xl p-6 text-center"
      >
        {phase === "polling" && (
          <>
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full" style={{ background: "rgba(168,85,247,0.15)" }}>
              <Loader2 className="h-7 w-7 animate-spin text-fuchsia-300" />
            </div>
            <h1 className="text-xl font-black app-text">Confirming your payment…</h1>
            <p className="mt-2 text-sm app-text-muted">Hang tight — this usually takes a few seconds.</p>
          </>
        )}

        {phase === "paid" && (
          <>
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full" style={{ background: "linear-gradient(135deg,#a855f7,#ec4899)" }}>
              <CheckCircle2 className="h-7 w-7 text-white" />
            </div>
            <h1 className="text-xl font-black text-gradient">Payment received!</h1>
            <p className="mt-2 text-sm app-text-muted">
              {payment
                ? payment.plan_code === "cinematic"
                  ? <>+{payment.credits_added.toLocaleString()} cinematic scenes added. 4K HDR, voice & camera controls unlocked.</>
                  : <>+{payment.credits_added.toLocaleString()} messages added to your account.</>
                : "Your plan is now active."}
            </p>
            <div className="mt-5 flex flex-col gap-2">
              <button
                onClick={() => navigate("/")}
                className="rounded-2xl py-3 text-sm font-bold text-white"
                style={{ background: "linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))", boxShadow: "0 12px 32px -10px rgba(168,85,247,0.45)" }}
              >
                <Sparkles className="inline h-4 w-4 mr-1" /> Start creating
              </button>
              <button
                onClick={() => navigate("/billing")}
                className="rounded-2xl py-3 text-sm font-bold app-surface app-text"
              >
                View billing
              </button>
            </div>
          </>
        )}

        {phase === "stuck" && (
          <>
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full" style={{ background: "rgba(245,158,11,0.15)" }}>
              <Loader2 className="h-7 w-7 text-amber-300" />
            </div>
            <h1 className="text-xl font-black app-text">Still confirming…</h1>
            <p className="mt-2 text-sm app-text-muted">
              Your payment may take a minute to finalise. Credits will appear automatically — feel free to close this page and check back.
            </p>
            <button
              onClick={() => navigate("/billing")}
              className="mt-5 w-full rounded-2xl py-3 text-sm font-bold app-surface app-text"
            >
              Go to billing
            </button>
          </>
        )}

        {phase === "failed" && (
          <>
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full" style={{ background: "rgba(244,63,94,0.15)" }}>
              <AlertTriangle className="h-7 w-7 text-rose-300" />
            </div>
            <h1 className="text-xl font-black app-text">Payment didn't complete</h1>
            <p className="mt-2 text-sm app-text-muted">No worries — you weren't charged. You can try again from the upgrade page.</p>
            <button
              onClick={() => navigate("/billing/upgrade")}
              className="mt-5 w-full rounded-2xl py-3 text-sm font-bold text-white"
              style={{ background: "linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))" }}
            >
              Try again
            </button>
          </>
        )}
      </motion.div>
    </div>
  );
}
