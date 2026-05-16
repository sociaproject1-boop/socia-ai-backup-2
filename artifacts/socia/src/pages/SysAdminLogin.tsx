/**
 * Hidden super-admin login + first-run setup page.
 *
 * Path: /sys-admin/login (public, not linked from anywhere visible).
 * If zero super_admins exist, renders the setup form which atomically
 * creates the first super_admin account.
 */
import { useEffect, useState, type FormEvent } from "react";
import { useLocation } from "wouter";
import { Loader2, ShieldCheck, KeyRound, Eye, EyeOff } from "lucide-react";
import {
  adminLogin, adminSetup, adminNeedsSetup, adminFetchSession, adminCheckHealth, useAdminStore,
} from "@/lib/adminAuth";

export default function SysAdminLogin() {
  const [, navigate] = useLocation();
  const [mode, setMode]       = useState<"loading" | "login" | "setup">("loading");
  const [busy, setBusy]       = useState(false);
  const [err,  setErr]        = useState<string | null>(null);
  const [serverReady, setServerReady] = useState(true);
  const [showPwd, setShowPwd] = useState(false);
  const [u, setU] = useState(""); const [e, setE] = useState(""); const [p, setP] = useState("");

  /* If we're already authed, jump straight to dashboard. */
  useEffect(() => {
    let alive = true;
    (async () => {
      /* Probe server health first so we can show a clear "configure secret"
         banner instead of a generic 503 when SUPABASE_SERVICE_ROLE_KEY is
         missing. Health endpoint never throws. */
      const health = await adminCheckHealth();
      if (!alive) return;
      setServerReady(health.ready);
      if (!health.ready) { setMode("login"); return; }

      const me = await adminFetchSession();
      if (!alive) return;
      if (me) { navigate("/sys-admin"); return; }
      try {
        const needs = await adminNeedsSetup();
        if (!alive) return;
        setMode(needs ? "setup" : "login");
      } catch (er) {
        if (!alive) return;
        setErr((er as Error).message);
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
        if (p.length < 12) throw new Error("Password must be at least 12 characters.");
        await adminSetup({ username: u.trim(), email: e.trim(), password: p });
      } else {
        await adminLogin({ username: u.trim(), password: p });
      }
      navigate("/sys-admin");
    } catch (er) {
      setErr((er as Error).message);
    } finally { setBusy(false); }
  };

  if (mode === "loading") {
    return (
      <div className="fixed inset-0 grid place-items-center bg-black">
        <Loader2 className="h-6 w-6 animate-spin text-white/60" />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 overflow-auto bg-gradient-to-br from-[#0a0612] via-[#0d0a1f] to-[#000]">
      <div className="mx-auto flex min-h-full max-w-sm flex-col justify-center px-6 py-12">
        <div className="mb-6 text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl"
               style={{ background: "linear-gradient(135deg,#a855f7,#ec4899)", boxShadow: "0 12px 40px -10px rgba(168,85,247,0.7)" }}>
            <ShieldCheck className="h-7 w-7 text-white" strokeWidth={2.2} />
          </div>
          <h1 className="mt-4 font-display text-2xl font-bold text-white">
            {mode === "setup" ? "Create Super Admin" : "Restricted Access"}
          </h1>
          <p className="mt-1.5 text-xs text-white/55">
            {mode === "setup"
              ? "No admin exists yet. Set the master account now — these credentials grant full system control."
              : "Sign in with your super-admin credentials."}
          </p>
        </div>

        {!serverReady && (
          <div className="mb-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3 text-[12px] leading-relaxed text-amber-100">
            <div className="mb-1 font-bold text-amber-200">Server not configured</div>
            The admin API is missing <code className="rounded bg-black/40 px-1 font-mono">SUPABASE_SERVICE_ROLE_KEY</code>.
            Add it to this Repl's Secrets (Supabase dashboard → Project Settings → API → <em>service_role</em>) and run
            <code className="rounded bg-black/40 px-1 font-mono">admin-schema.sql</code> in the Supabase SQL editor. The
            full admin system is already built and will activate automatically once the secret is set.
          </div>
        )}

        <form onSubmit={submit} className="space-y-3">
          <Input label="Username" value={u} onChange={setU} placeholder="e.g. root" autoComplete="username" />
          {mode === "setup" && (
            <Input label="Email" type="email" value={e} onChange={setE} placeholder="you@example.com" autoComplete="email" />
          )}
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-white/50">
              Password {mode === "setup" && <span className="text-white/35 lowercase tracking-normal">(min 12 chars)</span>}
            </label>
            <div className="relative">
              <KeyRound className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
              <input
                type={showPwd ? "text" : "password"} value={p} onChange={(ev) => setP(ev.target.value)}
                placeholder="••••••••••••" autoComplete={mode === "setup" ? "new-password" : "current-password"}
                className="w-full rounded-xl border border-white/10 bg-white/5 px-9 py-2.5 text-sm text-white outline-none focus:border-purple-500/60"
                required
              />
              <button type="button" onClick={() => setShowPwd((s) => !s)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-white/45 hover:bg-white/5">
                {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {err && (
            <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-2 text-[12px] text-rose-200">
              {err}
            </div>
          )}

          <button type="submit" disabled={busy || !serverReady}
                  className="w-full rounded-xl py-3 text-sm font-bold text-white disabled:opacity-50 inline-flex items-center justify-center gap-2"
                  style={{ background: "linear-gradient(135deg,#a855f7,#ec4899)", boxShadow: "0 8px 28px -8px rgba(168,85,247,0.6)" }}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {mode === "setup" ? "Create master account" : "Sign in"}
          </button>
        </form>

        <p className="mt-6 text-center text-[10.5px] text-white/35">
          All actions on this dashboard are audit-logged.
        </p>
      </div>
    </div>
  );
}

function Input({
  label, value, onChange, type = "text", placeholder, autoComplete,
}: {
  label: string; value: string; onChange: (v: string) => void;
  type?: string; placeholder?: string; autoComplete?: string;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-white/50">{label}</label>
      <input
        type={type} value={value} onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder} autoComplete={autoComplete}
        className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white outline-none focus:border-purple-500/60"
        required
      />
    </div>
  );
}
