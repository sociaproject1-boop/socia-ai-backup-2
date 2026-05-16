import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, ChevronRight, LogOut, User, Bell, Palette, Shield, Info, Check, MessageCircle, KeyRound, Trash2, AlertTriangle, Sparkles, Wallet } from "lucide-react";
import { useAppStore } from "@/lib/store";
import { useAuth } from "@/lib/authContext";
import { usePreferences } from "@/lib/PreferencesContext";
import { TextSizeKey } from "@/lib/preferences";
import { supabase } from "@/lib/supabase";

type Section = "main" | "account" | "notifications" | "appearance" | "privacy" | "about";

const SECTION_MENU = [
  { id: "account"       as Section, icon: User,    label: "Account",       desc: "Profile · password" },
  { id: "notifications" as Section, icon: Bell,    label: "Notifications", desc: "Push · email · sounds" },
  { id: "appearance"    as Section, icon: Palette, label: "Appearance",    desc: "Theme · accent · text size" },
  { id: "privacy"       as Section, icon: Shield,  label: "Privacy",       desc: "Visibility · DMs · 2FA" },
  { id: "about"         as Section, icon: Info,    label: "About",         desc: "Version 1.0.0" },
];

const slide = {
  initial:    { opacity: 0, x: 28 },
  animate:    { opacity: 1, x: 0 },
  exit:       { opacity: 0, x: -16 },
  transition: { duration: 0.18, ease: [0.32, 0.72, 0, 1] as const },
};

export default function Settings() {
  const [, navigate]  = useLocation();
  const logout        = useAppStore((s) => s.logout);
  const user          = useAppStore((s) => s.user);
  const { signOutUser, supabaseUser, updatePassword, deleteAccount } = useAuth();
  const { prefs, setTextSize, setNotif } = usePreferences();

  const [section, setSection] = useState<Section>("main");
  const [confirm, setConfirm] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const [pwd, setPwd]               = useState("");
  const [pwdBusy, setPwdBusy]       = useState(false);
  const [pwdMsg, setPwdMsg]         = useState<{ ok: boolean; text: string } | null>(null);
  const [delConfirm, setDelConfirm] = useState(false);
  const [delBusy, setDelBusy]       = useState(false);
  const [delErr, setDelErr]         = useState<string | null>(null);

  const [privacy, setPrivacy] = useState({
    private_account: false,
    show_online:     true,
    allow_dms:       true,
    two_factor:      false,
  });
  const [privacyLoaded, setPrivacyLoaded] = useState(false);

  useEffect(() => {
    if (!supabaseUser) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("user_settings")
        .select("private_account, show_online, allow_dms, two_factor")
        .eq("user_id", supabaseUser.id)
        .maybeSingle();
      if (cancelled) return;
      if (error) {
        console.warn("[Settings] user_settings fetch:", error.message);
      } else if (data) {
        setPrivacy({
          private_account: !!data.private_account,
          show_online:     data.show_online === null ? true : !!data.show_online,
          allow_dms:       data.allow_dms   === null ? true : !!data.allow_dms,
          two_factor:      !!data.two_factor,
        });
      }
      setPrivacyLoaded(true);
    })();
    return () => { cancelled = true; };
  }, [supabaseUser]);

  const setPrivacyKey = useCallback(async (
    key: "private_account" | "show_online" | "allow_dms" | "two_factor",
    v: boolean,
  ) => {
    if (!supabaseUser) return;
    setPrivacy((p) => ({ ...p, [key]: v }));
    const { error } = await supabase
      .from("user_settings")
      .upsert({ user_id: supabaseUser.id, [key]: v }, { onConflict: "user_id" });
    if (error) console.warn("[Settings] privacy save failed:", error.message);
  }, [supabaseUser]);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pwd.length < 8) { setPwdMsg({ ok: false, text: "At least 8 characters." }); return; }
    setPwdBusy(true); setPwdMsg(null);
    try {
      await updatePassword(pwd);
      setPwd("");
      setPwdMsg({ ok: true, text: "Password updated." });
    } catch (e2) {
      setPwdMsg({ ok: false, text: (e2 as Error).message });
    } finally {
      setPwdBusy(false);
    }
  };

  const handleDeleteAccount = async () => {
    setDelBusy(true); setDelErr(null);
    try {
      await deleteAccount();
      logout();
      navigate("/auth");
    } catch (e2) {
      setDelErr((e2 as Error).message);
    } finally {
      setDelBusy(false);
    }
  };

  const handleLogout = async () => {
    setLoggingOut(true);
    setConfirm(false);
    try { await signOutUser(); } catch {}
    logout();
    navigate("/auth");
  };

  const goBack = () => section === "main" ? navigate("/profile") : setSection("main");

  const Header = ({ title }: { title: string }) => (
    <header className="app-header sticky top-0 z-20 flex items-center gap-3 px-4"
      style={{ paddingTop: `calc(env(safe-area-inset-top, 0px) + 12px)`, paddingBottom: 12 }}>
      <RoundBtn onClick={goBack}><ArrowLeft style={{ width: 16, height: 16 }} /></RoundBtn>
      <h2 className="flex-1 text-center font-display text-[15px] font-semibold app-text">{title}</h2>
      <div className="h-9 w-9" />
    </header>
  );

  return (
    <div className="app-bg flex h-full flex-col">
      <AnimatePresence mode="wait" initial={false}>

        {/* ── MAIN ──────────────────────────────────────────────────── */}
        {section === "main" && (
          <motion.div key="main" {...slide} className="flex h-full flex-col">
            <Header title="Settings" />
            <div
              className="flex-1 overflow-y-auto hide-scrollbar px-4 pt-4 space-y-2"
              style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 108px)" }}
            >
              {/* ── Contact Owner card ───────────────────────────── */}
              <motion.button
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                whileTap={{ scale: 0.97 }}
                transition={{ duration: 0.18 }}
                onClick={() => window.open("https://www.facebook.com/share/17Yzu7p447/", "_blank", "noopener,noreferrer")}
                className="w-full flex items-center gap-3.5 rounded-[18px] p-4 text-left mb-1"
                style={{
                  background: "rgb(var(--s-card))",
                  border: "1px solid var(--s-border-a)",
                  boxShadow: "0 2px 10px -4px rgba(0,0,0,0.2)",
                }}
              >
                <div
                  className="relative shrink-0 overflow-hidden rounded-full"
                  style={{ width: 52, height: 52, border: "2px solid var(--s-border-a)" }}
                >
                  <div
                    className="h-full w-full grid place-items-center"
                    style={{ background: "linear-gradient(135deg, #1877f2 0%, #42a5f5 100%)" }}
                  >
                    <User className="text-white" style={{ width: 24, height: 24, strokeWidth: 1.8 }} />
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] font-semibold app-text leading-tight">Get Support</p>
                  <p className="text-[11.5px] app-text-muted mt-0.5 leading-snug">Need help? Message the developer directly</p>
                </div>
                <div
                  className="shrink-0 grid h-9 w-9 place-items-center rounded-full"
                  style={{ background: "linear-gradient(135deg, #1877f2 0%, #42a5f5 100%)" }}
                >
                  <MessageCircle className="text-white" style={{ width: 16, height: 16, strokeWidth: 2 }} />
                </div>
              </motion.button>

              <div style={{ height: 1, background: "var(--s-border-b)", margin: "2px 0 6px" }} />

              {/* ── Billing & Credits entry ──────────────────────── */}
              <motion.button
                initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => navigate("/billing")}
                className="app-card flex w-full items-center gap-3.5 rounded-[18px] p-3.5 text-left"
              >
                <span
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-xl"
                  style={{ background: "linear-gradient(135deg,#a855f7,#ec4899)" }}
                >
                  <Wallet className="text-white" style={{ width: 16, height: 16, strokeWidth: 2.1 }} />
                </span>
                <div className="flex-1 min-w-0">
                  <p className="app-text text-[13.5px] font-semibold">Billing & Credits</p>
                  <p className="app-text-muted text-[11px] mt-0.5">Plan · credits · receipts · top-ups</p>
                </div>
                <ChevronRight className="app-text-muted shrink-0" style={{ width: 16, height: 16 }} />
              </motion.button>

              <motion.button
                initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => navigate("/billing/upgrade")}
                className="app-card flex w-full items-center gap-3.5 rounded-[18px] p-3.5 text-left"
              >
                <span
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-xl"
                  style={{ background: "linear-gradient(135deg,#38bdf8,#1d4ed8)" }}
                >
                  <Sparkles className="text-white" style={{ width: 16, height: 16, strokeWidth: 2.1 }} />
                </span>
                <div className="flex-1 min-w-0">
                  <p className="app-text text-[13.5px] font-semibold">Subscription</p>
                  <p className="app-text-muted text-[11px] mt-0.5">Pick a plan · 15-day or monthly</p>
                </div>
                <ChevronRight className="app-text-muted shrink-0" style={{ width: 16, height: 16 }} />
              </motion.button>

              <div style={{ height: 1, background: "var(--s-border-b)", margin: "2px 0 6px" }} />

              {SECTION_MENU.map((s, i) => {
                const Icon = s.icon;
                return (
                  <motion.button
                    key={s.id}
                    initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.03 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setSection(s.id)}
                    className="app-card flex w-full items-center gap-3.5 rounded-[18px] p-3.5 text-left"
                  >
                    <span
                      className="grid h-10 w-10 shrink-0 place-items-center rounded-xl"
                      style={{ background: "linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))" }}
                    >
                      <Icon className="text-white" style={{ width: 16, height: 16, strokeWidth: 2.1 }} />
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="app-text text-[13.5px] font-semibold">{s.label}</p>
                      <p className="app-text-muted text-[11px] mt-0.5">{s.desc}</p>
                    </div>
                    <ChevronRight className="app-text-muted shrink-0" style={{ width: 16, height: 16 }} />
                  </motion.button>
                );
              })}

              {/* ── Log out button — always visible above nav ──── */}
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={() => setConfirm(true)}
                disabled={loggingOut}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-[18px] py-4 text-white text-sm font-semibold disabled:opacity-60"
                style={{
                  background: "linear-gradient(135deg, #e11d48, #ef4444)",
                  boxShadow: "0 6px 24px -6px rgba(244,63,94,0.45)",
                  minHeight: 56,
                }}
              >
                {loggingOut
                  ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  : <LogOut style={{ width: 16, height: 16 }} />}
                {loggingOut ? "Logging out…" : "Log Out"}
              </motion.button>
            </div>
          </motion.div>
        )}

        {/* ── ACCOUNT ───────────────────────────────────────────────── */}
        {section === "account" && (
          <motion.div key="account" {...slide} className="flex h-full flex-col">
            <Header title="Account" />
            <div className="flex-1 overflow-y-auto hide-scrollbar px-4 pt-4 space-y-4"
              style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 80px)" }}>
              <Field label="Display name" defaultValue={user?.name ?? ""} readOnly />
              <Field label="Username"     defaultValue={`@${user?.handle ?? ""}`} readOnly />
              <Field label="Email"        defaultValue={supabaseUser?.email ?? ""} readOnly />
              <p className="px-1 text-[10.5px] app-text-muted">
                To edit your name, username or photo, go to your profile and tap "Edit Profile".
              </p>

              <Divider label="Change Password" />
              <form onSubmit={handleChangePassword} className="space-y-2">
                <div className="app-card flex items-center gap-3 rounded-[14px] px-4 py-3">
                  <KeyRound className="h-4 w-4 app-text-muted" />
                  <input
                    type="password" placeholder="New password (min 8)" autoComplete="new-password"
                    value={pwd} onChange={(e) => setPwd(e.target.value)} minLength={8}
                    className="flex-1 bg-transparent text-sm outline-none app-text"
                  />
                </div>
                {pwdMsg && (
                  <p className="px-1 text-[11px]" style={{ color: pwdMsg.ok ? "#10b981" : "#ef4444" }}>
                    {pwdMsg.text}
                  </p>
                )}
                <button
                  type="submit" disabled={pwdBusy || pwd.length < 8}
                  className="w-full rounded-[14px] py-3 text-sm font-semibold text-white disabled:opacity-50"
                  style={{ background: "linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))" }}
                >
                  {pwdBusy ? "Saving…" : "Update password"}
                </button>
              </form>

              <Divider label="Danger Zone" />
              <button
                onClick={() => setDelConfirm(true)}
                className="flex w-full items-center justify-center gap-2 rounded-[14px] border py-3 text-sm font-semibold"
                style={{ borderColor: "rgba(239,68,68,0.3)", color: "#ef4444" }}
              >
                <Trash2 className="h-4 w-4" />
                Delete Account
              </button>
            </div>
          </motion.div>
        )}

        {/* ── NOTIFICATIONS ─────────────────────────────────────────── */}
        {section === "notifications" && (
          <motion.div key="notifications" {...slide} className="flex h-full flex-col">
            <Header title="Notifications" />
            <div className="flex-1 overflow-y-auto hide-scrollbar px-4 pt-4 space-y-2"
              style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 80px)" }}>
              {([
                { key: "push"      as const, label: "Push Notifications", desc: "Alerts when app is closed" },
                { key: "email"     as const, label: "Email Updates",      desc: "Weekly digest & product news" },
                { key: "sound"     as const, label: "In-app Sounds",      desc: "Sound effects for actions" },
                { key: "followers" as const, label: "New Followers",      desc: "When someone follows you" },
                { key: "likes"     as const, label: "Post Likes",         desc: "When someone likes your post" },
              ]).map((item) => (
                <ToggleRow
                  key={item.key}
                  label={item.label}
                  desc={item.desc}
                  on={prefs.notifs[item.key]}
                  onChange={(v) => setNotif(item.key, v)}
                />
              ))}
              <p className="px-1 pt-1 text-[10.5px] app-text-muted">
                Toggle states are saved locally and will power backend push integration in a future release.
              </p>
            </div>
          </motion.div>
        )}

        {/* ── APPEARANCE ─────────────────────────────────────────────── */}
        {section === "appearance" && (
          <motion.div key="appearance" {...slide} className="flex h-full flex-col">
            <Header title="Appearance" />
            <div className="flex-1 overflow-y-auto hide-scrollbar px-4 pt-4 space-y-5"
              style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 80px)" }}>
              <div>
                <SectionLabel>Text Size</SectionLabel>
                <div className="app-card rounded-[18px] px-4 py-4">
                  {(["small", "default", "large"] as TextSizeKey[]).map((sz) => (
                    <button
                      key={sz}
                      onClick={() => setTextSize(sz)}
                      className="flex w-full items-center justify-between py-2"
                    >
                      <span
                        className="capitalize font-medium"
                        style={{
                          fontSize: sz === "small" ? 13 : sz === "default" ? 15 : 18,
                          color: prefs.textSize === sz ? "var(--accent-primary)" : "hsl(var(--foreground))",
                        }}
                      >
                        {sz === "default" ? "Default" : sz.charAt(0).toUpperCase() + sz.slice(1)}
                      </span>
                      {prefs.textSize === sz && (
                        <Check style={{ width: 16, height: 16, color: "var(--accent-primary)", strokeWidth: 2.5 }} />
                      )}
                    </button>
                  ))}
                </div>
                <p className="mt-1.5 px-1 text-[10.5px] app-text-muted">
                  Changes apply immediately throughout the app.
                </p>
              </div>
            </div>
          </motion.div>
        )}

        {/* ── PRIVACY ───────────────────────────────────────────────── */}
        {section === "privacy" && (
          <motion.div key="privacy" {...slide} className="flex h-full flex-col">
            <Header title="Privacy" />
            <div className="flex-1 overflow-y-auto hide-scrollbar px-4 pt-4 space-y-2"
              style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 80px)" }}>
              {!privacyLoaded && (
                <p className="px-1 text-[11px] app-text-muted">Loading your settings…</p>
              )}
              <ToggleRow label="Private Account"      desc="Only approved followers see your posts"  on={privacy.private_account} onChange={(v) => setPrivacyKey("private_account", v)} />
              <ToggleRow label="Show Online Status"   desc="Let others see when you're active"        on={privacy.show_online}     onChange={(v) => setPrivacyKey("show_online", v)} />
              <ToggleRow label="Allow Direct Messages" desc="Anyone you've allowed can message you"   on={privacy.allow_dms}       onChange={(v) => setPrivacyKey("allow_dms", v)} />
              <ToggleRow label="Two-Factor Auth"       desc="Extra login security (requires re-auth)" on={privacy.two_factor}      onChange={(v) => setPrivacyKey("two_factor", v)} />
              <p className="px-1 pt-1 text-[10.5px] app-text-muted">
                Privacy settings sync to your account and apply across all your devices.
              </p>
            </div>
          </motion.div>
        )}

        {/* ── ABOUT ─────────────────────────────────────────────────── */}
        {section === "about" && (
          <motion.div key="about" {...slide} className="flex h-full flex-col">
            <Header title="About" />
            <div className="flex-1 overflow-y-auto hide-scrollbar px-4 pt-4 space-y-3"
              style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 80px)" }}>
              <div className="app-card rounded-[18px] overflow-hidden divide-y" style={{ borderColor: "var(--s-border-a)" }}>
                {[["Version", "1.0.0 (Build 42)"], ["Platform", "Web · PWA ready"]].map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between px-4 py-3.5">
                    <span className="text-sm app-text-muted">{k}</span>
                    <span className="text-sm font-semibold app-text">{v}</span>
                  </div>
                ))}
              </div>
              <LinkCard
                items={[
                  { label: "Terms of Service",     href: "/legal/terms" },
                  { label: "Privacy Policy",       href: "/legal/privacy" },
                  { label: "Open Source Licenses", href: "/legal/licenses" },
                  { label: "About the Developer",  href: "/legal/developer" },
                ]}
                onNavigate={navigate}
              />
              <p className="pt-2 text-center text-[11px] app-text-muted">Made with ♥ by Socia</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Delete-account confirm — fixed, centered, above nav ──────── */}
      <AnimatePresence>
        {delConfirm && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => !delBusy && setDelConfirm(false)}
            className="fixed inset-0 z-[100] flex items-center justify-center px-5"
            style={{ background: "rgba(0,0,0,0.82)" }}
          >
            <motion.div
              initial={{ scale: 0.88, opacity: 0, y: 16 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.92, opacity: 0, y: 8 }}
              transition={{ type: "spring", stiffness: 420, damping: 30 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm"
            >
              <div
                className="w-full rounded-[28px] p-6"
                style={{
                  background: "#0e0e0e",
                  border: "1px solid rgba(239,68,68,0.18)",
                  boxShadow: "0 32px 80px -8px rgba(0,0,0,0.95), inset 0 0 0 1px rgba(255,255,255,0.04)",
                }}
              >
                <div className="flex justify-center mb-4">
                  <div className="grid h-14 w-14 place-items-center rounded-[20px]"
                    style={{ background: "rgba(239,68,68,0.1)", border: "1.5px solid rgba(239,68,68,0.22)" }}>
                    <AlertTriangle style={{ width: 22, height: 22, color: "#ef4444" }} />
                  </div>
                </div>
                <h3 className="text-center font-display text-[18px] font-bold app-text mb-1">Delete your account?</h3>
                <p className="text-center text-[13px] app-text-muted mb-2">
                  This permanently removes your profile, posts, messages and follows.
                </p>
                <p className="text-center text-[12px] font-semibold mb-5" style={{ color: "#ef4444" }}>
                  This action cannot be undone.
                </p>
                {delErr && (
                  <p className="mb-4 text-center text-xs" style={{ color: "#ef4444" }}>{delErr}</p>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setDelConfirm(false)} disabled={delBusy}
                    className="rounded-[16px] py-3.5 text-sm font-semibold app-text disabled:opacity-50"
                    style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.09)" }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleDeleteAccount} disabled={delBusy}
                    className="rounded-[16px] py-3.5 text-sm font-semibold text-white disabled:opacity-50"
                    style={{ background: "linear-gradient(135deg, #e11d48, #ef4444)", boxShadow: "0 4px 16px -4px rgba(225,29,72,0.45)" }}
                  >
                    {delBusy ? "Deleting…" : "Delete forever"}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Log-out confirm — fixed, centered, always above nav ──────── */}
      <AnimatePresence>
        {confirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={() => setConfirm(false)}
            className="fixed inset-0 z-[100] flex items-center justify-center px-5"
            style={{ background: "rgba(0,0,0,0.82)" }}
          >
            <motion.div
              initial={{ scale: 0.85, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.92, opacity: 0, y: 10 }}
              transition={{ type: "spring", stiffness: 440, damping: 30 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm"
            >
              <div
                className="w-full rounded-[28px] p-6"
                style={{
                  background: "#0d0d0d",
                  border: "1px solid rgba(255,255,255,0.09)",
                  boxShadow: "0 32px 80px -8px rgba(0,0,0,0.95), inset 0 0 0 1px rgba(255,255,255,0.04)",
                }}
              >
                {/* Icon */}
                <div className="flex justify-center mb-5">
                  <motion.div
                    animate={{ scale: [1, 1.05, 1] }}
                    transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                    className="grid h-[60px] w-[60px] place-items-center rounded-[22px]"
                    style={{
                      background: "linear-gradient(135deg, rgba(225,29,72,0.15), rgba(239,68,68,0.08))",
                      border: "1.5px solid rgba(225,29,72,0.28)",
                      boxShadow: "0 0 24px -4px rgba(225,29,72,0.3)",
                    }}
                  >
                    <LogOut style={{ width: 24, height: 24, color: "#f43f5e" }} />
                  </motion.div>
                </div>

                <h3 className="text-center font-display text-[20px] font-bold app-text mb-2">
                  Log out?
                </h3>
                <p className="text-center text-[13.5px] leading-relaxed app-text-muted mb-6">
                  Are you sure you want to log out of Socia?
                </p>

                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setConfirm(false)}
                    className="rounded-[16px] py-4 text-[14px] font-semibold app-text"
                    style={{
                      background: "rgba(255,255,255,0.07)",
                      border: "1px solid rgba(255,255,255,0.09)",
                    }}
                  >
                    Cancel
                  </button>
                  <motion.button
                    whileTap={{ scale: 0.96 }}
                    onClick={handleLogout}
                    className="rounded-[16px] py-4 text-[14px] font-semibold text-white"
                    style={{
                      background: "linear-gradient(135deg, #e11d48, #ef4444)",
                      boxShadow: "0 6px 20px -4px rgba(225,29,72,0.55)",
                    }}
                  >
                    Log Out
                  </motion.button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ── Small shared components ─────────────────────────────────────────── */

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-2 px-1 text-[10.5px] font-semibold uppercase tracking-[0.1em] app-text-muted">
      {children}
    </p>
  );
}

function ToggleRow({ label, desc, on, onChange }: {
  label: string; desc: string; on: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <div className="app-card flex items-center gap-3 rounded-[18px] px-4 py-3.5">
      <div className="flex-1 min-w-0">
        <p className="text-[13.5px] font-semibold app-text">{label}</p>
        <p className="text-[11px] app-text-muted mt-0.5">{desc}</p>
      </div>
      <Toggle on={on} onChange={onChange} />
    </div>
  );
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <motion.button
      onClick={() => onChange(!on)}
      className="relative shrink-0"
      style={{
        width: 44, height: 26, borderRadius: 13,
        background: on
          ? `linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))`
          : "rgba(128,128,128,0.25)",
      }}
      transition={{ duration: 0.15 }}
    >
      <motion.span
        animate={{ x: on ? 20 : 2 }}
        transition={{ type: "spring", stiffness: 600, damping: 28 }}
        className="absolute top-[4px] block"
        style={{ width: 18, height: 18, borderRadius: "50%", background: "#fff", left: 2 }}
      />
    </motion.button>
  );
}

function RoundBtn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <motion.button
      whileTap={{ scale: 0.88 }}
      onClick={onClick}
      className="app-surface grid h-9 w-9 place-items-center rounded-full app-text"
    >
      {children}
    </motion.button>
  );
}

function Field({ label, defaultValue, type = "text", readOnly }: {
  label: string; defaultValue: string; type?: string; readOnly?: boolean;
}) {
  return (
    <div className="space-y-1">
      <p className="px-1 text-[10.5px] font-semibold uppercase tracking-[0.1em] app-text-muted">{label}</p>
      <input
        type={type}
        defaultValue={defaultValue}
        readOnly={readOnly}
        className="w-full app-card rounded-[14px] px-4 py-3 text-sm app-text outline-none"
        style={readOnly ? { opacity: 0.7, cursor: "default" } : {}}
      />
    </div>
  );
}

function Divider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="h-px flex-1" style={{ background: "var(--s-border-b)" }} />
      <p className="text-[10.5px] font-semibold uppercase tracking-[0.1em] app-text-muted shrink-0">{label}</p>
      <div className="h-px flex-1" style={{ background: "var(--s-border-b)" }} />
    </div>
  );
}

function LinkCard({ items, onNavigate }: {
  items: { label: string; href: string }[];
  onNavigate: (href: string) => void;
}) {
  return (
    <div className="app-card rounded-[18px] overflow-hidden">
      {items.map((item, i) => (
        <button
          key={item.label}
          onClick={() => onNavigate(item.href)}
          className="flex w-full items-center justify-between px-4 py-3.5 text-sm app-text"
          style={i < items.length - 1 ? { borderBottom: "1px solid var(--s-border-b)" } : {}}
        >
          {item.label}
          <ChevronRight style={{ width: 14, height: 14 }} className="app-text-muted" />
        </button>
      ))}
    </div>
  );
}
