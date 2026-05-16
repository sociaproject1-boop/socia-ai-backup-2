/**
 * Admin login page — /admin/login
 *
 * Reuses the existing lib/adminAuth.ts functions and Zustand store.
 * Redirects to /admin/dashboard on success.
 * If zero super_admins exist (first run), renders the setup form instead.
 */
import { useEffect, useState, type FormEvent } from "react";
import { useLocation } from "wouter";
import { Loader2, ShieldCheck, KeyRound, Eye, EyeOff, User } from "lucide-react";
import {
  adminLogin, adminSetup, adminNeedsSetup,
  adminFetchSession, adminCheckHealth,
} from "@/lib/adminAuth";

const ERROR_MAP: Record<string, string> = {
  INVALID_CREDENTIALS:  "Incorrect username or password.",
  ADMIN_NOT_CONFIGURED: "Admin system is not configured. Add SUPABASE_SERVICE_ROLE_KEY to Secrets.",
  INVALID_USERNAME:     "Username must be 3–32 alphanumeric characters.",
  INVALID_EMAIL:        "Enter a valid email address.",
  WEAK_PASSWORD:        "Password must be at least 12 characters.",
  SETUP_DONE:           "An admin account already exists. Use the login form.",
  DB_ERROR:             "Database error — check Supabase connection.",
  LOCKED:               "Account locked after too many attempts. Try again in 15 minutes.",
};

function friendlyError(raw: string): string {
  return ERROR_MAP[raw] ?? raw;
}

export default function AdminLogin() {
  const [, navigate] = useLocation();
  const [mode, setMode]       = useState<"loading" | "login" | "setup">("loading");
  const [busy, setBusy]       = useState(false);
  const [err,  setErr]        = useState<string | null>(null);
  const [serverReady, setServerReady] = useState(true);
  const [showPwd, setShowPwd] = useState(false);
  const [username, setUsername] = useState("");
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      const health = await adminCheckHealth();
      if (!alive) return;
      setServerReady(health.ready);
      if (!health.ready) { setMode("login"); return; }

      const me = await adminFetchSession();
      if (!alive) return;
      if (me) { navigate("/admin/dashboard"); return; }

      try {
        const needs = await adminNeedsSetup();
        if (!alive) return;
        setMode(needs ? "setup" : "login");
      } catch (er) {
        if (!alive) return;
        setErr(friendlyError((er as Error).message));
        setMode("login");
      }
    })();
    return () => { alive = false; };
  }, [navigate]);

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    setBusy(true); setErr(null);
    try {
      if (mode === "setup") {
        if (password.length < 12) throw new Error("WEAK_PASSWORD");
        await adminSetup({ username: username.trim(), email: email.trim(), password });
      } else {
        await adminLogin({ username: username.trim(), password });
      }
      navigate("/admin/dashboard");
    } catch (er) {
      setErr(friendlyError((er as Error).message));
    } finally {
      setBusy(false);
    }
  };

  if (mode === "loading") {
    return (
      <div className="fixed inset-0 grid place-items-center bg-[#06060c]">
        <Loader2 className="h-6 w-6 animate-spin text-white/40" />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 overflow-auto bg-gradient-to-br from-[#0a0612] via-[#0d0a1f] to-[#000]">
      <div className="mx-auto flex min-h-full max-w-sm flex-col justify-center px-6 py-12">

        {/* Logo / title */}
        <div className="mb-8 text-center">
          <div
            className="mx-auto grid h-14 w-14 place-items-center rounded-2xl"
            style={{
              background: "linear-gradient(135deg,#a855f7,#ec4899)",
              boxShadow: "0 12px 40px -10px rgba(168,85,247,0.65)",
            }}
          >
            <ShieldCheck className="h-7 w-7 text-white" strokeWidth={2.2} />
          </div>
          <h1 className="mt-4 font-display text-2xl font-bold text-white">
            {mode === "setup" ? "Create Admin Account" : "Admin Login"}
          </h1>
          <p className="mt-1.5 text-xs text-white/45">
            {mode === "setup"
              ? "No admin exists yet. Set up the master account — these credentials grant full system control."
              : "Sign in with your admin credentials to access the dashboard."}
          </p>
        </div>

        {/* Server-not-ready banner */}
        {!serverReady && (
          <div className="mb-5 rounded-2xl border border-amber-500/30 bg-amber-500/8 p-4 text-[12px] leading-relaxed text-amber-100">
            <div className="mb-1.5 font-bold text-amber-200">⚠ Admin system not configured</div>
            Add{" "}
            <code className="rounded bg-black/50 px-1.5 py-0.5 font-mono text-amber-300">
              SUPABASE_SERVICE_ROLE_KEY
            </code>{" "}
            to this Repl's Secrets (Supabase → Project Settings → API → <em>service_role</em>),
            then restart the API server.
          </div>
        )}

        {/* Form */}
        <form onSubmit={submit} className="space-y-4">
          {/* Username */}
          <Field label="Username">
            <div className="relative">
              <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="admin"
                autoComplete="username"
                required
                className="w-full rounded-xl border border-white/10 bg-white/5 pl-9 pr-3 py-2.5 text-sm text-white outline-none focus:border-purple-500/60 transition-colors"
              />
            </div>
          </Field>

          {/* Email — setup only */}
          {mode === "setup" && (
            <Field label="Email">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                required
                className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white outline-none focus:border-purple-500/60 transition-colors"
              />
            </Field>
          )}

          {/* Password */}
          <Field label={mode === "setup" ? "Password (min 12 chars)" : "Password"}>
            <div className="relative">
              <KeyRound className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
              <input
                type={showPwd ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                autoComplete={mode === "setup" ? "new-password" : "current-password"}
                required
                className="w-full rounded-xl border border-white/10 bg-white/5 pl-9 pr-10 py-2.5 text-sm text-white outline-none focus:border-purple-500/60 transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowPwd((v) => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-white/40 hover:text-white/70 transition-colors"
              >
                {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </Field>

          {/* Error */}
          {err && (
            <div className="rounded-xl border border-rose-500/30 bg-rose-500/8 px-3 py-2.5 text-[12.5px] leading-relaxed text-rose-200">
              {err}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={busy || !serverReady}
            className="mt-1 inline-flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold text-white disabled:opacity-50 transition-opacity"
            style={{
              background: "linear-gradient(135deg,#a855f7,#ec4899)",
              boxShadow: "0 8px 28px -8px rgba(168,85,247,0.55)",
            }}
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {mode === "setup" ? "Create master account" : "Sign in"}
          </button>
        </form>

        <p className="mt-8 text-center text-[10.5px] text-white/30">
          All admin actions are audit-logged.
        </p>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-white/45">
        {label}
      </label>
      {children}
    </div>
  );
}
