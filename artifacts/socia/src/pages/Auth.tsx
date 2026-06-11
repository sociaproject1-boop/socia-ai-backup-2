import { useState } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  Mail, Lock, User as UserIcon, ArrowRight,
  AlertCircle, CheckCircle, RefreshCw, Loader2,
} from "lucide-react";
import { useAuth, EMAIL_CONFIRMATION_REQUIRED } from "@/lib/authContext";
import sociaMarkUrl from "@assets/splash2/mark.png";

type Mode = "signin" | "signup";

const GPU: React.CSSProperties = {
  willChange: "transform, opacity",
  transform: "translateZ(0)",
  backfaceVisibility: "hidden",
};

export default function Auth() {
  const [, navigate] = useLocation();
  const { signInEmail, signUpEmail, signInGoogle } = useAuth();
  const [mode, setMode]             = useState<Mode>("signin");
  const [name, setName]             = useState("");
  const [email, setEmail]           = useState("");
  const [pw, setPw]                 = useState("");
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState("");
  const [checkEmail, setCheckEmail] = useState(false);

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
        navigate("/");
      }
    } catch (err: any) {
      const msg: string = err?.message || "unknown";
      if (msg === EMAIL_CONFIRMATION_REQUIRED) {
        setCheckEmail(true);
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
    } catch (err: any) {
      setError(friendlyError(err?.message || "unknown"));
      setLoading(false);
    }
  };

  // ── "Check your email" screen ──────────────────────────────────────────
  if (checkEmail) {
    return (
      <div className="relative flex min-h-full flex-col items-center justify-center px-6 text-center overflow-hidden">
        <div className="relative z-10 flex flex-col items-center">
          {/* Logo mark */}
          <motion.div
            initial={{ scale: 0.8, opacity: 0, y: -8 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
            className="mb-5 flex items-center justify-center"
            style={GPU}
          >
            <img
              src={sociaMarkUrl}
              alt="Socia"
              style={{
                width: 80,
                height: 80,
                objectFit: "contain",
                filter:
                  "drop-shadow(0 0 18px rgba(168,85,247,0.65)) drop-shadow(0 0 8px rgba(236,72,153,0.45))",
              }}
            />
          </motion.div>

          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 280, damping: 22, delay: 0.1 }}
            className="mb-6 grid h-16 w-16 place-items-center rounded-3xl"
            style={{
              background: "linear-gradient(135deg, #7c3aed 0%, #ec4899 60%, #3b82f6 100%)",
              boxShadow: "0 8px 28px -6px rgba(124,58,237,0.45)",
              ...GPU,
            }}
          >
            <CheckCircle className="h-8 w-8 text-white" strokeWidth={2} />
          </motion.div>

          <motion.h2
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.18 }}
            className="font-display text-2xl font-bold text-white"
          >
            Check your email
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.24 }}
            className="mt-3 max-w-xs text-sm text-white/60"
          >
            We sent a confirmation link to{" "}
            <span className="font-medium text-white">{email}</span>.
            Click it to activate your account, then sign in.
          </motion.p>

          <motion.button
            whileTap={{ scale: 0.96 }}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.30 }}
            onClick={() => { setCheckEmail(false); setMode("signin"); }}
            className="mt-8 flex h-12 w-full max-w-xs items-center justify-center gap-2 rounded-2xl font-display text-sm font-semibold text-white"
            style={{
              background: "linear-gradient(135deg, #7c3aed 0%, #a855f7 50%, #ec4899 100%)",
              boxShadow: "0 6px 22px -6px rgba(124,58,237,0.5)",
            }}
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

          <div
            className="mt-8 rounded-2xl px-4 py-3 text-left text-xs text-amber-200/80 max-w-xs"
            style={{ background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.22)" }}
          >
            <span className="font-semibold text-amber-200">Tip:</span> To skip email
            confirmation, go to your Supabase Dashboard → Authentication → Email →
            disable <em>Confirm email</em>.
          </div>
        </div>
      </div>
    );
  }

  // ── Main auth form ──────────────────────────────────────────────────────
  return (
    <div
      className="relative flex min-h-full flex-col overflow-hidden"
      style={{ paddingTop: `calc(env(safe-area-inset-top, 0px) + 20px)` }}
    >
      {/* Subtle radial top accent */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          background: "radial-gradient(65% 42% at 50% -5%, rgba(120,50,220,0.16) 0%, transparent 68%)",
          pointerEvents: "none",
          zIndex: 0,
        }}
      />

      <div className="relative z-10 flex flex-1 flex-col px-6 pb-8">

        {/* ── Official Socia "S" mark ─────────────────────────────────── */}
        <motion.div
          initial={{ scale: 0.78, opacity: 0, y: -12 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          transition={{ duration: 0.70, ease: [0.22, 1, 0.36, 1] }}
          className="mx-auto mt-6 mb-1 flex items-center justify-center"
          style={{ width: "min(30vw, 116px)", height: "min(30vw, 116px)", ...GPU }}
        >
          <img
            src={sociaMarkUrl}
            alt="Socia"
            draggable={false}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "contain",
              filter:
                "drop-shadow(0 0 20px rgba(168,85,247,0.65)) drop-shadow(0 0 8px rgba(59,130,246,0.35)) drop-shadow(0 0 4px rgba(236,72,153,0.40))",
            }}
          />
        </motion.div>

        {/* ── Wordmark: "Socia" ──────────────────────────────────────── */}
        <motion.h1
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          className="mt-5 text-center font-display text-4xl font-bold tracking-tight"
        >
          <span className="text-gradient">Socia</span>
        </motion.h1>

        {/* ── Tagline ──────────────────────────────────────────────── */}
        <motion.p
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.22 }}
          className="mt-2 text-center text-sm text-white/55"
        >
          Where imagination becomes feed.
        </motion.p>

        {/* ── Neon underline — matches splash screen ────────────────── */}
        <motion.div
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ delay: 0.38, duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
          style={{
            height: 2.5,
            width: "min(22vw, 80px)",
            margin: "10px auto 0",
            borderRadius: 999,
            background: "linear-gradient(90deg, #ec4899 0%, #a855f7 50%, #3b82f6 100%)",
            boxShadow: "0 0 10px rgba(168,85,247,0.65)",
            transformOrigin: "left center",
          }}
        />

        {/* ── Form ──────────────────────────────────────────────────── */}
        <AnimatePresence mode="wait">
          <motion.form
            key={mode}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.22 }}
            onSubmit={submit}
            className="mt-9 space-y-3"
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
                  className="text-[11px] text-white/55 hover:text-white transition-colors"
                >
                  Forgot password?
                </button>
              </div>
            )}

            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -4, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.97 }}
                  className="flex items-start gap-2 rounded-xl px-3 py-2.5 text-xs text-rose-300"
                  style={{ background: "rgba(244,63,94,0.10)", border: "1px solid rgba(244,63,94,0.22)" }}
                >
                  <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </motion.div>
              )}
            </AnimatePresence>

            <motion.button
              whileTap={{ scale: 0.975 }}
              type="submit"
              disabled={loading}
              className="relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-2xl font-display text-sm font-semibold text-white disabled:opacity-60"
              style={{
                height: 52,
                background: "linear-gradient(135deg, #7c3aed 0%, #a855f7 50%, #ec4899 100%)",
                boxShadow: "0 6px 22px -6px rgba(168,85,247,0.6), inset 0 1px 0 rgba(255,255,255,0.12)",
              }}
            >
              <span className="relative z-10 flex items-center gap-2">
                {loading ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    {mode === "signin" ? "Continue" : "Create account"}
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </span>
            </motion.button>
          </motion.form>
        </AnimatePresence>

        {/* ── Divider ──────────────────────────────────────────────── */}
        <div className="my-5 flex items-center gap-3 text-[10px] uppercase tracking-widest text-white/30">
          <span className="h-px flex-1 bg-white/08" />or<span className="h-px flex-1 bg-white/08" />
        </div>

        {/* ── Google ───────────────────────────────────────────────── */}
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={handleGoogle}
          disabled={loading}
          className="relative flex h-12 w-full items-center justify-center gap-3 overflow-hidden rounded-2xl text-sm font-semibold text-white disabled:opacity-60"
          style={{
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.09)",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
          }}
        >
          {loading
            ? <Loader2 className="h-4 w-4 animate-spin text-white/60" />
            : <GoogleGlyph />
          }
          {loading ? "Connecting…" : "Continue with Google"}
        </motion.button>

        {/* ── Toggle signin / signup ────────────────────────────────── */}
        <div className="mt-auto pt-8 text-center text-xs text-white/50">
          {mode === "signin" ? (
            <button
              onClick={() => { setError(""); setMode("signup"); }}
              className="transition-colors hover:text-white/80"
            >
              New here? <span className="text-white">Create an account</span>
            </button>
          ) : (
            <button
              onClick={() => { setError(""); setMode("signin"); }}
              className="transition-colors hover:text-white/80"
            >
              Already have an account? <span className="text-white">Sign in</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Input field ──────────────────────────────────────────────────────────── */
function Field({
  icon: Icon, placeholder, type, value, onChange,
}: {
  icon: typeof Mail;
  placeholder: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const autoComplete =
    type === "password" ? "current-password" :
    type === "email"    ? "email" :
    type === "text"     ? "name" : "off";

  return (
    <div
      className="flex h-12 items-center gap-3 rounded-2xl px-4 transition-all focus-within:border-white/25"
      style={{
        background: "rgba(255,255,255,0.05)",
        border: "1px solid rgba(255,255,255,0.09)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
      }}
    >
      <Icon className="h-4 w-4 text-white/45" />
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        className="flex-1 bg-transparent text-sm text-white placeholder:text-white/35 focus:outline-none"
      />
    </div>
  );
}

function GoogleGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4">
      <path
        fill="#EA4335"
        d="M12 10.2v3.9h5.5c-.2 1.3-1.6 3.7-5.5 3.7-3.3 0-6-2.7-6-6.1s2.7-6.1 6-6.1c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.7 3.2 14.6 2.2 12 2.2 6.5 2.2 2 6.7 2 12.2s4.5 10 10 10c5.7 0 9.6-4 9.6-9.7 0-.6 0-1.1-.1-1.7H12z"
      />
    </svg>
  );
}

function friendlyError(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes("invalid login credentials") || m.includes("invalid credentials") || m.includes("wrong password") || m.includes("invalid email or password"))
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
