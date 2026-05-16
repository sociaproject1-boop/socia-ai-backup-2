import { useState } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles, Mail, Lock, User as UserIcon, ArrowRight,
  AlertCircle, CheckCircle, RefreshCw, Loader2,
} from "lucide-react";
import { useAuth, EMAIL_CONFIRMATION_REQUIRED } from "@/lib/authContext";

type Mode = "signin" | "signup";

export default function Auth() {
  const [, navigate] = useLocation();
  const { signInEmail, signUpEmail, signInGoogle } = useAuth();
  const [mode, setMode]           = useState<Mode>("signin");
  const [name, setName]           = useState("");
  const [email, setEmail]         = useState("");
  const [pw, setPw]               = useState("");
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState("");
  const [checkEmail, setCheckEmail] = useState(false);  // email-confirmation pending state

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (mode === "signin") {
        await signInEmail(email, pw);
        navigate("/");
      } else {
        if (!name.trim()) { setError("Display name is required"); return; }
        await signUpEmail(email, pw, name.trim());
        // signUpEmail either succeeds silently (no-confirmation mode)
        // or throws EMAIL_CONFIRMATION_REQUIRED
        navigate("/");
      }
    } catch (err: any) {
      const msg: string = err?.message || "unknown";
      if (msg === EMAIL_CONFIRMATION_REQUIRED) {
        setCheckEmail(true);   // show the "check your email" screen
      } else {
        setError(friendlyError(msg));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setError("");
    setLoading(true);
    try {
      await signInGoogle();
      // OAuth redirect — page will reload; no navigate needed
    } catch (err: any) {
      setError(friendlyError(err?.message || "unknown"));
      setLoading(false);
    }
  };

  // ── "Check your email" screen ─────────────────────────────────────────────
  if (checkEmail) {
    return (
      <div className="relative flex min-h-full flex-col items-center justify-center px-6 text-center">
        <motion.div
          initial={{ scale: 0.85, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="mb-6 grid h-20 w-20 place-items-center rounded-3xl bg-gradient-to-br from-purple-600 via-pink-500 to-blue-500 shadow-[0_12px_60px_-8px_rgba(236,72,153,0.6)]"
        >
          <CheckCircle className="h-9 w-9 text-white" strokeWidth={2} />
        </motion.div>
        <h2 className="font-display text-2xl font-bold text-white">Check your email</h2>
        <p className="mt-3 max-w-xs text-sm text-white/60">
          We sent a confirmation link to <span className="text-white font-medium">{email}</span>.
          Click it to activate your account, then sign in here.
        </p>

        <motion.button
          whileTap={{ scale: 0.96 }}
          onClick={() => { setCheckEmail(false); setMode("signin"); }}
          className="mt-8 flex h-12 w-full max-w-xs items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-purple-600 via-pink-500 to-blue-500 font-display text-sm font-semibold text-white shadow-[0_8px_28px_-6px_rgba(236,72,153,0.55)]"
        >
          Go to sign in <ArrowRight className="h-4 w-4" />
        </motion.button>

        <p className="mt-4 text-xs text-white/40">
          Didn't get it? Check spam or{" "}
          <button
            className="text-white/70 underline underline-offset-2"
            onClick={() => { setCheckEmail(false); setMode("signup"); }}
          >
            try again
          </button>
        </p>

        <div className="mt-8 rounded-2xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-left text-xs text-amber-200/80 max-w-xs">
          <span className="font-semibold text-amber-200">Tip:</span> To skip email confirmation,
          go to your Supabase Dashboard → Authentication → Email → disable{" "}
          <em>Confirm email</em>.
        </div>
      </div>
    );
  }

  // ── Main auth form ─────────────────────────────────────────────────────────
  return (
    <div
      className="relative flex min-h-full flex-col px-6 pb-8"
      style={{ paddingTop: `calc(env(safe-area-inset-top, 0px) + 32px)` }}
    >

      <div className="relative z-10 flex flex-1 flex-col">
        {/* Logo */}
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="mx-auto mt-4 grid h-20 w-20 place-items-center rounded-3xl bg-gradient-to-br from-purple-600 via-pink-500 to-blue-500 shadow-[0_12px_60px_-8px_rgba(236,72,153,0.6)]"
        >
          <Sparkles className="h-9 w-9 text-white" strokeWidth={2.2} />
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mt-6 text-center font-display text-4xl font-bold tracking-tight"
        >
          <span className="text-gradient">Socia</span>
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.18 }}
          className="mt-2 text-center text-sm text-white/65"
        >
          Where imagination becomes feed.
        </motion.p>

        {/* Form */}
        <AnimatePresence mode="wait">
          <motion.form
            key={mode}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            onSubmit={submit}
            className="mt-10 space-y-3"
          >
            {mode === "signup" && (
              <Field icon={UserIcon} placeholder="Display name" type="text" value={name} onChange={setName} />
            )}
            <Field icon={Mail} placeholder="email@socia.app" type="email" value={email} onChange={setEmail} />
            <Field icon={Lock} placeholder="password (min 6 chars)" type="password" value={pw} onChange={setPw} />

            {mode === "signin" && (
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => navigate("/forgot-password")}
                  className="text-[11px] text-white/60 hover:text-white"
                >
                  Forgot password?
                </button>
              </div>
            )}

            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="flex items-start gap-2 rounded-xl bg-rose-500/15 border border-rose-500/25 px-3 py-2.5 text-xs text-rose-300"
                >
                  <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </motion.div>
              )}
            </AnimatePresence>

            <motion.button
              whileTap={{ scale: 0.98 }}
              type="submit"
              disabled={loading}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-purple-600 via-pink-500 to-blue-500 font-display text-sm font-semibold text-white shadow-[0_8px_28px_-6px_rgba(236,72,153,0.55)] disabled:opacity-60"
            >
              {loading ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  {mode === "signin" ? "Continue" : "Create account"}
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </motion.button>
          </motion.form>
        </AnimatePresence>

        <div className="my-5 flex items-center gap-3 text-[10px] uppercase tracking-widest text-white/35">
          <span className="h-px flex-1 bg-white/10" />or<span className="h-px flex-1 bg-white/10" />
        </div>

        <motion.button
          whileTap={{ scale: 0.97 }}
          whileHover={{ borderColor: "rgba(255,255,255,0.18)", backgroundColor: "rgba(255,255,255,0.08)" }}
          onClick={handleGoogle}
          disabled={loading}
          className="relative flex h-12 w-full items-center justify-center gap-3 overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0a0a0a] text-sm font-semibold text-white transition-colors disabled:opacity-60"
        >
          {/* Subtle shimmer on hover */}
          <motion.div
            className="pointer-events-none absolute inset-0"
            style={{ background: "linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.04) 50%, transparent 60%)" }}
            initial={{ x: "-100%" }}
            whileHover={{ x: "100%" }}
            transition={{ duration: 0.55 }}
          />
          {loading
            ? <Loader2 className="h-4 w-4 animate-spin text-white/60" />
            : <GoogleGlyph />
          }
          {loading ? "Connecting…" : "Continue with Google"}
        </motion.button>

        <div className="mt-auto pt-8 text-center text-xs text-white/55">
          {mode === "signin" ? (
            <button onClick={() => { setError(""); setMode("signup"); }}>
              New here? <span className="text-white">Create an account</span>
            </button>
          ) : (
            <button onClick={() => { setError(""); setMode("signin"); }}>
              Already have an account? <span className="text-white">Sign in</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({
  icon: Icon, placeholder, type, value, onChange,
}: {
  icon: typeof Mail; placeholder: string; type: string;
  value: string; onChange: (v: string) => void;
}) {
  const autoComplete =
    type === "password" ? "current-password" :
    type === "email"    ? "email" :
    type === "text"     ? "name" : "off";
  return (
    <div className="card-premium flex h-12 items-center gap-3 rounded-2xl px-4 transition-colors focus-within:border-white/30">
      <Icon className="h-4 w-4 text-white/50" />
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        className="flex-1 bg-transparent text-sm text-white placeholder:text-white/40 focus:outline-none"
      />
    </div>
  );
}

function GoogleGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4">
      <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.2 1.3-1.6 3.7-5.5 3.7-3.3 0-6-2.7-6-6.1s2.7-6.1 6-6.1c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.7 3.2 14.6 2.2 12 2.2 6.5 2.2 2 6.7 2 12.2s4.5 10 10 10c5.7 0 9.6-4 9.6-9.7 0-.6 0-1.1-.1-1.7H12z"/>
    </svg>
  );
}

function friendlyError(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes("invalid login credentials") || m.includes("invalid credentials") || m.includes("wrong password"))
    return "Incorrect email or password.";
  if (m.includes("user already registered") || m.includes("already registered"))
    return "An account with this email already exists. Try signing in.";
  if (m.includes("password should be at least") || m.includes("password must be") || m.includes("weak_password"))
    return "Password must be at least 6 characters.";
  if (m.includes("unable to validate email") || m.includes("invalid email") || m.includes("invalid format"))
    return "Please enter a valid email address.";
  if (m.includes("email not confirmed"))
    return "Email not confirmed yet. Check your inbox and click the confirmation link.";
  if (m.includes("rate limit") || m.includes("too many requests") || m.includes("over_email_send_rate_limit"))
    return "Too many attempts. Please wait a moment and try again.";
  if (m.includes("network") || m.includes("fetch") || m.includes("failed to fetch"))
    return "Network error — check your connection.";
  if (m.includes("email") && m.includes("required"))
    return "Please enter your email address.";
  if (m.includes("password") && m.includes("required"))
    return "Please enter your password.";
  console.error("[Socia] Unmapped auth error:", msg);
  return msg.length < 120 ? msg : "Sign-in failed. Please try again.";
}
