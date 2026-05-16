/**
 * AuthCallback.tsx
 *
 * Landing page for Supabase OAuth redirects (Google, etc.).
 *
 * Flow:
 *  1. Google redirects user back to this page with ?code=xxx
 *  2. Supabase client (detectSessionInUrl: true + flowType: pkce) automatically
 *     reads the code from the URL and exchanges it for a session on init.
 *  3. AuthProvider's onAuthStateChange fires SIGNED_IN → store is populated.
 *  4. We listen for that event here and navigate to the home feed.
 *
 * This page never shows the main app shell — it renders only a fullscreen
 * loading/error state so the user has clear feedback during the OAuth exchange.
 */
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";

type Status = "loading" | "success" | "error";

export default function AuthCallback() {
  const [, navigate] = useLocation();
  const [status,   setStatus]  = useState<Status>("loading");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    let settled = false;

    const settle = (next: Status, msg = "", dest = "/") => {
      if (settled) return;
      settled = true;
      setStatus(next);
      if (msg) setErrorMsg(msg);
      if (next === "success") {
        /* Small delay so the user sees the success tick */
        setTimeout(() => navigate(dest), 700);
      }
    };

    /* ── Subscribe FIRST so we never miss the SIGNED_IN event ─────────── */
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === "SIGNED_IN" && session) {
          settle("success");
        }
        /* PKCE exchange error surfaces as SIGNED_OUT with no session */
        if (event === "SIGNED_OUT" && !session && !settled) {
          settle("error", "Authentication failed. Please try again.");
        }
      },
    );

    /* ── Check if the session is already resolved (fast cold-start) ────── */
    supabase.auth.getSession().then(({ data, error }) => {
      if (error) {
        settle("error", friendlyOauthError(error.message));
      } else if (data.session) {
        settle("success");
      }
    });

    /* ── Safety net ─────────────────────────────────────────────────────── */
    const timeout = setTimeout(() => {
      settle("error", "Sign-in timed out. Please try again.");
    }, 14_000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      className="fixed inset-0 flex flex-col items-center justify-center"
      style={{ background: "linear-gradient(135deg, #060a10 0%, #0b0f1e 100%)" }}
    >
      {/* Ambient glow */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 60% 40% at 50% 40%, rgba(139,92,246,0.12) 0%, transparent 70%)",
        }}
      />

      <AnimatePresence mode="wait">
        {status === "loading" && (
          <motion.div
            key="loading"
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.94 }}
            transition={{ duration: 0.25 }}
            className="relative flex flex-col items-center gap-6 px-8 text-center"
          >
            {/* Animated logo ring */}
            <div className="relative">
              <div
                className="h-20 w-20 rounded-3xl"
                style={{
                  background: "linear-gradient(135deg, #7c3aed, #ec4899, #3b82f6)",
                  boxShadow: "0 0 60px -8px rgba(139,92,246,0.6)",
                }}
              />
              {/* Spinning ring */}
              <div className="absolute inset-0 flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-white/80" />
              </div>
            </div>

            <div>
              <h2 className="text-xl font-bold text-white">Signing you in…</h2>
              <p className="mt-1.5 text-sm text-white/45">
                Completing your Google sign-in securely
              </p>
            </div>

            {/* Shimmer progress bar */}
            <div className="h-0.5 w-48 overflow-hidden rounded-full bg-white/10">
              <motion.div
                className="h-full rounded-full"
                style={{
                  background: "linear-gradient(90deg, #7c3aed, #ec4899, #3b82f6)",
                }}
                animate={{ x: ["-100%", "100%"] }}
                transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
              />
            </div>
          </motion.div>
        )}

        {status === "success" && (
          <motion.div
            key="success"
            initial={{ opacity: 0, scale: 0.88 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 400, damping: 28 }}
            className="flex flex-col items-center gap-5 px-8 text-center"
          >
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 500, damping: 22, delay: 0.05 }}
              className="flex h-20 w-20 items-center justify-center rounded-3xl"
              style={{
                background: "linear-gradient(135deg, #059669, #10b981)",
                boxShadow: "0 0 60px -8px rgba(16,185,129,0.55)",
              }}
            >
              <CheckCircle2 className="h-9 w-9 text-white" />
            </motion.div>
            <div>
              <h2 className="text-xl font-bold text-white">Signed in!</h2>
              <p className="mt-1 text-sm text-white/45">Taking you to your feed…</p>
            </div>
          </motion.div>
        )}

        {status === "error" && (
          <motion.div
            key="error"
            initial={{ opacity: 0, scale: 0.88 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ type: "spring", stiffness: 400, damping: 28 }}
            className="flex flex-col items-center gap-5 px-8 text-center"
          >
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 500, damping: 22, delay: 0.05 }}
              className="flex h-20 w-20 items-center justify-center rounded-3xl"
              style={{
                background: "linear-gradient(135deg, #dc2626, #ef4444)",
                boxShadow: "0 0 60px -8px rgba(239,68,68,0.5)",
              }}
            >
              <AlertCircle className="h-9 w-9 text-white" />
            </motion.div>

            <div>
              <h2 className="text-xl font-bold text-white">Sign-in failed</h2>
              <p className="mt-1.5 max-w-xs text-sm text-white/50">{errorMsg}</p>
            </div>

            <button
              onClick={() => navigate("/auth")}
              className="mt-2 flex h-11 items-center gap-2 rounded-2xl px-6 text-sm font-semibold text-white transition-opacity hover:opacity-80"
              style={{ background: "linear-gradient(135deg, #7c3aed, #ec4899)" }}
            >
              Try again
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function friendlyOauthError(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes("code verifier") || m.includes("pkce"))
    return "Session verification failed. Please try signing in again.";
  if (m.includes("expired"))
    return "The sign-in link expired. Please try again.";
  if (m.includes("network") || m.includes("fetch"))
    return "Network error during sign-in. Check your connection.";
  return msg.length < 120 ? msg : "Sign-in failed. Please try again.";
}
