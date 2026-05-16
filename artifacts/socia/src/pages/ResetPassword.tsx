/**
 * ResetPassword.tsx — handles the password recovery flow.
 *
 * Two modes:
 *   1. /forgot-password  → enter your email, we send a reset link.
 *   2. /reset-password   → arrived from the email link; pick a new password.
 *      Supabase puts a recovery session into localStorage automatically when
 *      the user clicks the magic link, so updateUser({ password }) just works.
 */
import { useState, useEffect } from "react";
import { useLocation, useRoute } from "wouter";
import { motion } from "framer-motion";
import { ArrowLeft, KeyRound, Mail, Eye, EyeOff, CheckCircle2 } from "lucide-react";
import { useAuth } from "@/lib/authContext";

export default function ResetPassword() {
  const [, navigate] = useLocation();
  const [matchForgot] = useRoute("/forgot-password");
  const isForgot = !!matchForgot;
  const { requestPasswordReset, updatePassword } = useAuth();

  const [email, setEmail]     = useState("");
  const [pwd,   setPwd]       = useState("");
  const [show,  setShow]      = useState(false);
  const [busy,  setBusy]      = useState(false);
  const [done,  setDone]      = useState(false);
  const [err,   setErr]       = useState<string | null>(null);

  /* On /reset-password we expect Supabase to have stashed a recovery session
   * in localStorage from the magic link. If it hasn't, send the user back. */
  useEffect(() => {
    if (isForgot) return;
    const t = setTimeout(() => {
      try {
        const k = Object.keys(localStorage).find((x) => x.includes("auth-token"));
        if (!k) console.warn("[ResetPassword] no auth-token found — link may be expired");
      } catch {}
    }, 800);
    return () => clearTimeout(t);
  }, [isForgot]);

  const handleSendLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null); setBusy(true);
    try {
      await requestPasswordReset(email);
      setDone(true);
    } catch (e2) {
      setErr((e2 as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pwd.length < 8) { setErr("Password must be at least 8 characters."); return; }
    setErr(null); setBusy(true);
    try {
      await updatePassword(pwd);
      setDone(true);
      setTimeout(() => navigate("/"), 1500);
    } catch (e2) {
      setErr((e2 as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="app-bg flex h-full flex-col">
      <header className="sticky top-0 z-20 flex items-center gap-3 px-4 app-header"
        style={{ paddingTop: `calc(env(safe-area-inset-top, 0px) + 12px)`, paddingBottom: 12 }}>
        <button onClick={() => navigate("/auth")} className="grid h-9 w-9 place-items-center rounded-full app-surface app-text">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <h2 className="flex-1 text-center text-[15px] font-semibold app-text">
          {isForgot ? "Reset Password" : "Set New Password"}
        </h2>
        <div className="h-9 w-9" />
      </header>

      <div className="flex flex-1 flex-col items-center justify-center px-6">
        <motion.div
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-sm space-y-4"
        >
          {!done && isForgot && (
            <form onSubmit={handleSendLink} className="space-y-3">
              <p className="text-center text-sm app-text-muted">
                Enter your email and we'll send you a link to reset your password.
              </p>
              <label className="app-card flex items-center gap-3 rounded-2xl px-4 py-3">
                <Mail className="h-4 w-4 app-text-muted" />
                <input
                  type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com" autoComplete="email"
                  className="flex-1 bg-transparent text-sm outline-none app-text"
                />
              </label>
              {err && <p className="text-center text-xs text-red-400">{err}</p>}
              <button
                type="submit" disabled={busy}
                className="w-full rounded-2xl py-3 text-sm font-semibold text-white disabled:opacity-50"
                style={{ background: "linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))" }}
              >
                {busy ? "Sending…" : "Send reset link"}
              </button>
            </form>
          )}

          {!done && !isForgot && (
            <form onSubmit={handleUpdate} className="space-y-3">
              <p className="text-center text-sm app-text-muted">
                Choose a new password (at least 8 characters).
              </p>
              <label className="app-card flex items-center gap-3 rounded-2xl px-4 py-3">
                <KeyRound className="h-4 w-4 app-text-muted" />
                <input
                  type={show ? "text" : "password"} required value={pwd} onChange={(e) => setPwd(e.target.value)}
                  placeholder="New password" autoComplete="new-password" minLength={8}
                  className="flex-1 bg-transparent text-sm outline-none app-text"
                />
                <button type="button" onClick={() => setShow(!show)} className="app-text-muted">
                  {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </label>
              {err && <p className="text-center text-xs text-red-400">{err}</p>}
              <button
                type="submit" disabled={busy}
                className="w-full rounded-2xl py-3 text-sm font-semibold text-white disabled:opacity-50"
                style={{ background: "linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))" }}
              >
                {busy ? "Saving…" : "Update password"}
              </button>
            </form>
          )}

          {done && (
            <div className="flex flex-col items-center gap-3 text-center">
              <CheckCircle2 className="h-12 w-12 text-emerald-400" />
              <p className="font-semibold app-text">
                {isForgot ? "Check your email" : "Password updated"}
              </p>
              <p className="text-sm app-text-muted">
                {isForgot
                  ? `We sent a reset link to ${email}.`
                  : "You can now sign in with your new password."}
              </p>
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
