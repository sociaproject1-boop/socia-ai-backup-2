/**
 * CommunityFunding — Home-page community support card + automated
 * PayMongo-powered contribution flow.
 *
 * UX contract:
 *   1. Tap "Support Socia" → bottom-sheet modal opens instantly (portaled
 *      into document.body so it overlays the whole viewport regardless of
 *      where the trigger lives in the page).
 *   2. User picks an amount tile (or types a custom amount) and a method
 *      (GCash / Maya / Card). PayMongo will gate the actual method
 *      selection at hosted checkout — these pills are UI affordances that
 *      pre-select the rail.
 *   3. "Continue Secure Payment" → POST /api/paymongo/support-checkout →
 *      window.location.assign(checkout_url). The CTA shows a
 *      "Securing your contribution…" loading state for the brief moment
 *      between tap and redirect so the user never sees a blank screen.
 *   4. After the redirect-back to /support/success?ref=..., that page polls
 *      the webhook-finalized row and shows confirmation.
 *
 * No reference numbers. No screenshot upload. No admin verification. All
 * confirmation happens server-side via the signed webhook + idempotent
 * paymongo_finalize_support() RPC (migration 36).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useLocation } from "wouter";
import {
  Heart, X, Sparkles, ChevronRight, Loader2, ShieldCheck, Lock,
  ShoppingBag, Users, Star, Zap, Globe, Shield, BarChart3, CreditCard,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import {
  detectInitialLocale, saveLocale, LOCALES,
  type LocaleCode, getSupportCopy,
} from "@/lib/i18n/support";

/* ── Types ──────────────────────────────────────────────────────────── */
interface FundingProgress {
  target_amount:    number;
  current_amount:   number;
  supporters_count: number;
  is_goal_reached:  boolean;
  unlock_phase:     number;
}

interface RecentSupporter {
  id:       string;
  amount:   number;
  paid_at:  string;
  username: string;
}

/* ── API helpers ────────────────────────────────────────────────────── */
const BASE = `${import.meta.env.BASE_URL}api`.replace(/\/{2,}/g, "/");

async function fetchProgress(): Promise<FundingProgress | null> {
  try {
    const r = await fetch(`${BASE}/funding/progress`);
    if (!r.ok) return null;
    const d = await r.json();
    return d.funding ?? null;
  } catch { return null; }
}

async function fetchRecentSupporters(): Promise<RecentSupporter[]> {
  try {
    const r = await fetch(`${BASE}/funding/recent-supporters`);
    if (!r.ok) return [];
    const d = await r.json();
    return d.supporters ?? [];
  } catch { return []; }
}

interface CheckoutResult { checkout_url: string; ref: string; resumed: boolean; }
async function createSupportCheckout(amountCentavos: number): Promise<CheckoutResult> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Please sign in to support Socia.");
  const r = await fetch(`${BASE}/paymongo/support-checkout`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify({ amount_centavos: amountCentavos }),
  });
  const d = await r.json().catch(() => ({} as Record<string, unknown>));
  if (!r.ok || !d.checkout_url) {
    // Prefer the human message the backend ships; fall back to a known code
    // mapping, then to a generic copy. Never leak raw error codes to the UI.
    const code    = (d.code as string)    ?? "";
    const message = (d.message as string) ?? "";
    if (message) throw new Error(message);
    if (code === "SUPPORT_NOT_READY")    throw new Error("Community support is being set up. Please try again in a moment.");
    if (code === "SESSION_EXPIRED")      throw new Error("Your session has expired. Please sign in again to continue.");
    if (code === "AMOUNT_BELOW_MIN")     throw new Error("Minimum contribution is ₱50.");
    if (code === "AMOUNT_ABOVE_MAX")     throw new Error("Maximum contribution per transaction is ₱10,000.");
    if (code === "PAYMONGO_NOT_CONFIGURED") throw new Error("Payments aren't configured yet. Please contact support.");
    if (code === "CHECKOUT_IN_PROGRESS") throw new Error("A checkout is already starting. Please wait a moment and try again.");
    throw new Error("We couldn't start your contribution. Please try again.");
  }
  return {
    checkout_url: d.checkout_url as string,
    ref:          (d.ref as string) ?? "",
    resumed:      Boolean(d.resumed),
  };
}

interface PendingCheckout {
  ref:             string;
  amount_centavos: number;
  created_at:      string;
  checkout_url:    string;
}
async function fetchPendingCheckout(): Promise<PendingCheckout | null> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return null;
    const r = await fetch(`${BASE}/community-support/pending`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (!r.ok) return null;
    const d = await r.json();
    return d.pending ?? null;
  } catch { return null; }
}

interface ContributionRow {
  ref:             string;
  amount_centavos: number;
  status:          "pending" | "paid" | "failed" | "cancelled" | "expired";
  payment_method:  string | null;
  paid_at:         string | null;
  created_at:      string;
  paymongo_ref:    string | null;
}
async function fetchContributionHistory(): Promise<ContributionRow[]> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return [];
    const r = await fetch(`${BASE}/community-support/history`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (!r.ok) return [];
    const d = await r.json();
    return d.contributions ?? [];
  } catch { return []; }
}

/* ── In-app browser safe redirect ───────────────────────────────────────
 * Facebook / Messenger / Instagram / TikTok in-app browsers occasionally
 * sandbox window.location to the embedded webview and refuse cross-origin
 * navigations, or open the target inside a sub-tab that loses the back
 * stack. Calling window.top.location.href first breaks out of any iframe,
 * and falling back to window.location.assign covers the standard case.
 * The caller is expected to show a manual "Open checkout" link after a
 * short timeout in case both paths are blocked. */
function safeRedirectToCheckout(url: string): void {
  try {
    if (window.top && window.top !== window) {
      window.top.location.href = url;
      return;
    }
  } catch { /* cross-origin top access blocked — fall through */ }
  try { window.location.href = url; return; } catch { /* fall through */ }
  window.location.assign(url);
}

function detectInAppBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  // FBAN/FBAV = Facebook app, FB_IAB = FB in-app browser, Instagram, Messenger,
  // musical_ly + TikTok = TikTok, Line/, KAKAOTALK, Twitter.
  return /(FBAN|FBAV|FB_IAB|Instagram|Messenger|musical_ly|TikTok|Line\/|KAKAOTALK)/i.test(ua);
}

/* ── Static data ────────────────────────────────────────────────────── */
const WHY_CARDS = [
  { icon: Zap,         label: "Creator Monetization", desc: "Stars, earnings, payout systems, creator levels." },
  { icon: Users,       label: "Affiliate System",     desc: "Creator referrals, campaign center, commission tracking." },
  { icon: ShoppingBag, label: "Seller Marketplace",   desc: "Digital products, live selling, inventory, orders." },
  { icon: BarChart3,   label: "Creator Analytics",    desc: "Dashboards, earnings reports, growth insights." },
  { icon: Globe,       label: "AI Infrastructure",    desc: "Expanded generation capacity and faster queues." },
  { icon: Shield,      label: "Moderation & Security",desc: "Anti-abuse, safe payments, trust systems." },
];

const PHASE_LABELS: Record<number, string> = {
  1: "Community Beta",
  2: "Infrastructure Expansion",
  3: "Limited Beta Launch",
  4: "Public Rollout",
};

/* ══════════════════════════════════════════════════════════════════════
   Main exported section
   ══════════════════════════════════════════════════════════════════════ */
export function CommunityFunding() {
  const [progress, setProgress]     = useState<FundingProgress | null>(null);
  const [supporters, setSupporters] = useState<RecentSupporter[]>([]);
  const [showModal, setShowModal]   = useState(false);
  const [, navigate]                = useLocation();
  const [locale, setLocaleState]    = useState<LocaleCode>(() => detectInitialLocale());
  const copy = useMemo(() => getSupportCopy(locale), [locale]);

  useEffect(() => {
    fetchProgress().then(setProgress);
    fetchRecentSupporters().then(setSupporters);
  }, []);

  const pct = progress
    ? Math.min(100, Math.round((progress.current_amount / progress.target_amount) * 100))
    : 0;

  const remaining = progress
    ? Math.max(0, progress.target_amount - progress.current_amount)
    : 50000;

  // Optimistic refresh after a contribution lands — called by the modal
  // when the user returns from a successful checkout (we currently navigate
  // to /support/success, so this is a defensive refresh path).
  const refreshAll = () => {
    fetchProgress().then(setProgress);
    fetchRecentSupporters().then(setSupporters);
  };

  return (
    <section className="mb-6">
      <div className="mb-4 flex items-center gap-2 px-0.5">
        <Heart style={{ width: 13, height: 13, color: "var(--accent-primary)" }} />
        <h3 className="text-[10.5px] font-semibold uppercase tracking-[0.09em] app-text-muted">
          Community Support
        </h3>
      </div>

      {/* ── Funding progress card ──────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-[22px] p-5 mb-4"
        style={{
          background: "linear-gradient(135deg, #0d0d1a 0%, #13102a 60%, #0d0d1a 100%)",
          border: "1px solid rgba(168,85,247,0.2)",
          boxShadow: "0 8px 32px -8px rgba(168,85,247,0.25)",
        }}
      >
        <div className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full opacity-20"
             style={{ background: "radial-gradient(circle, #a855f7, transparent)" }} />
        <div className="pointer-events-none absolute -bottom-6 -left-6 h-24 w-24 rounded-full opacity-15"
             style={{ background: "radial-gradient(circle, #ec4899, transparent)" }} />

        <div className="mb-4 relative">
          <div className="flex items-center gap-2 mb-1">
            <div className="grid h-7 w-7 place-items-center rounded-xl"
                 style={{ background: "linear-gradient(135deg,#a855f7,#ec4899)" }}>
              <Sparkles className="h-3.5 w-3.5 text-white" />
            </div>
            <span className="text-[10px] font-bold uppercase tracking-widest text-purple-400">
              Phase {progress?.unlock_phase ?? 1} · {PHASE_LABELS[progress?.unlock_phase ?? 1]}
            </span>
          </div>
          <h2 className="font-display text-[20px] font-black leading-tight text-white">
            Help Build Socia
          </h2>
          <p className="mt-1 text-[11.5px] leading-relaxed text-white/55" style={{ maxWidth: 290 }}>
            Community support expands AI infrastructure and advances Socia's creator economy systems.
            Confirmed instantly via secure PayMongo checkout.
          </p>
        </div>

        {/* Stats */}
        <div className="mb-3 grid grid-cols-3 gap-2">
          <FundStat label={copy.raisedLabel}     value={progress ? `₱${Math.floor(progress.current_amount).toLocaleString()}` : "—"} />
          <FundStat label={copy.goalLabel}       value={progress ? `₱${Math.floor(progress.target_amount).toLocaleString()}` : "₱50,000"} />
          <FundStat label={copy.supportersLabel} value={progress ? progress.supporters_count.toLocaleString() : "—"} />
        </div>

        {/* Progress bar */}
        <div className="mb-1 h-2.5 overflow-hidden rounded-full bg-white/10">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 1.2, ease: "easeOut", delay: 0.2 }}
            className="h-full rounded-full"
            style={{ background: "linear-gradient(90deg,#a855f7,#ec4899)" }}
          />
        </div>
        <div className="mb-4 flex items-center justify-between">
          <span className="text-[10.5px] font-bold text-purple-300">{pct}% {copy.fundedSuffix}</span>
          <span className="text-[10px] text-white/40">₱{Math.floor(remaining).toLocaleString()} {copy.remainingSuffix}</span>
        </div>

        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={() => setShowModal(true)}
          className="w-full rounded-2xl py-3 text-sm font-bold text-white"
          style={{ background: "linear-gradient(135deg,#a855f7,#ec4899)", boxShadow: "0 8px 20px -6px rgba(168,85,247,0.6)" }}
        >
          <Heart className="mr-1.5 inline h-4 w-4" /> {copy.triggerCta}
        </motion.button>
      </motion.div>

      {/* ── Recent supporters feed ─────────────────────────────────── */}
      {supporters.length > 0 && (
        <div className="mb-4 rounded-[18px] p-4"
             style={{ background: "rgba(168,85,247,0.05)", border: "1px solid rgba(168,85,247,0.12)" }}>
          <p className="mb-3 text-[10.5px] font-semibold uppercase tracking-wider text-purple-400">
            {copy.recentSupporters}
          </p>
          <div className="space-y-2">
            {supporters.slice(0, 5).map((s) => (
              <div key={s.id} className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="grid h-7 w-7 place-items-center rounded-full text-[10px] font-bold text-white"
                       style={{ background: "linear-gradient(135deg,#a855f7,#ec4899)" }}>
                    {(s.username[0] ?? "?").toUpperCase()}
                  </div>
                  <div>
                    <p className="text-[11.5px] font-semibold text-white leading-tight">{s.username}</p>
                    <p className="text-[10px] text-white/40">{relativeTime(s.paid_at)}</p>
                  </div>
                </div>
                <p className="text-[12px] font-bold text-purple-300">₱{Math.floor(s.amount).toLocaleString()}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Why support matters ────────────────────────────────────── */}
      <div className="mb-4">
        <p className="mb-3 px-0.5 text-[10.5px] font-semibold uppercase tracking-[0.09em] app-text-muted">
          Why community support matters
        </p>
        <div className="grid grid-cols-2 gap-2">
          {WHY_CARDS.map((c, i) => (
            <motion.div
              key={c.label}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
              className="rounded-[16px] p-3"
              style={{
                background: "linear-gradient(135deg,rgba(168,85,247,0.06),rgba(236,72,153,0.04))",
                border: "1px solid rgba(168,85,247,0.12)",
              }}
            >
              <c.icon className="mb-1.5 h-4 w-4 text-purple-400" />
              <p className="text-[11.5px] font-bold app-text leading-tight">{c.label}</p>
              <p className="mt-0.5 text-[10.5px] app-text-muted leading-relaxed">{c.desc}</p>
            </motion.div>
          ))}
        </div>
      </div>

      {/* ── Locked feature preview pills ──────────────────────────── */}
      <div className="mb-2">
        <p className="mb-3 px-0.5 text-[10.5px] font-semibold uppercase tracking-[0.09em] app-text-muted">
          Preview upcoming systems
        </p>
        <div className="hide-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
          {[
            { label: "Creator Monetization", icon: Star,        path: "/creator/monetization" },
            { label: "Affiliate Program",    icon: Users,       path: "/creator/affiliate" },
            { label: "Seller Center",        icon: ShoppingBag, path: "/creator/seller" },
            { label: "Creator Stars",        icon: Sparkles,    path: "/creator/stars" },
          ].map((f) => (
            <motion.button
              key={f.label}
              whileTap={{ scale: 0.95 }}
              onClick={() => navigate(f.path)}
              className="flex shrink-0 items-center gap-2 rounded-2xl px-3.5 py-2.5"
              style={{ background: "rgba(168,85,247,0.08)", border: "1px solid rgba(168,85,247,0.15)" }}
            >
              <f.icon className="h-3.5 w-3.5 text-purple-400" />
              <span className="text-[11.5px] font-semibold app-text whitespace-nowrap">{f.label}</span>
              <ChevronRight className="h-3 w-3 app-text-muted" />
            </motion.button>
          ))}
        </div>
      </div>

      <SupportModal
        open={showModal}
        onClose={() => setShowModal(false)}
        onReturn={refreshAll}
        locale={locale}
        onLocaleChange={(c) => { setLocaleState(c); saveLocale(c); }}
      />
    </section>
  );
}

function FundStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl p-2.5 text-center" style={{ background: "rgba(255,255,255,0.05)" }}>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-white/45">{label}</div>
      <div className="mt-0.5 text-[14px] font-extrabold text-white leading-tight">{value}</div>
    </div>
  );
}

function relativeTime(iso: string): string {
  const t = new Date(iso).getTime();
  if (!t) return "";
  const diff = Date.now() - t;
  const m = Math.floor(diff / 60000);
  if (m < 1)    return "just now";
  if (m < 60)   return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24)   return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30)   return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

/* ══════════════════════════════════════════════════════════════════════
   Support Modal — bottom-sheet, portaled, automated PayMongo flow
   ══════════════════════════════════════════════════════════════════════ */
const PRESET_AMOUNTS = [100, 250, 500, 1000, 2500];

type Method = "gcash" | "paymaya" | "card";

function SupportModal({
  open, onClose, onReturn, locale, onLocaleChange,
}: {
  open:           boolean;
  onClose:        () => void;
  onReturn:       () => void;
  locale:         LocaleCode;
  onLocaleChange: (c: LocaleCode) => void;
}) {
  const copy = useMemo(() => getSupportCopy(locale), [locale]);
  const [amount, setAmount]       = useState<number>(250);
  const [custom, setCustom]       = useState<string>("");
  const [method, setMethod]       = useState<Method>("gcash");
  const [busy, setBusy]           = useState(false);
  const [err, setErr]             = useState<string | null>(null);
  // Sequential loading copy: stage 1 → 2 → 3 so the user has a sense of
  // forward progress while we hit PayMongo + the browser redirects.
  const [loadingStage, setLoadingStage]   = useState<1 | 2 | 3>(1);
  // Resume banner: surfaced when the user has an in-flight pending row
  // (closed the tab during a previous checkout). Fetched on open.
  const [resumable, setResumable]         = useState<PendingCheckout | null>(null);
  // Contribution history accordion — lazy-loaded when expanded.
  const [history, setHistory]             = useState<ContributionRow[]>([]);
  const [historyOpen, setHistoryOpen]     = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  // Manual fallback link shown if the redirect after a tap takes too long
  // (most often inside FB/IG/TikTok in-app browsers).
  const [fallbackUrl, setFallbackUrl]     = useState<string | null>(null);
  const sheetRef                          = useRef<HTMLDivElement | null>(null);
  const mountedRef                        = useRef(true);
  const prevFocusRef                      = useRef<HTMLElement | null>(null);

  // Reset transient state every time the sheet opens, then fetch any
  // resumable in-flight checkout so we can offer a one-tap recovery.
  useEffect(() => {
    if (open) {
      setAmount(250); setCustom(""); setMethod("gcash");
      setBusy(false); setErr(null);
      setLoadingStage(1); setFallbackUrl(null);
      setHistoryOpen(false); setHistoryLoaded(false); setHistory([]);
      void fetchPendingCheckout().then((p) => {
        if (mountedRef.current) setResumable(p);
      });
    } else {
      setResumable(null);
    }
  }, [open]);

  // Sequential loading copy timer — stage 1 → 2 at 1.5s → 3 at 3.5s.
  useEffect(() => {
    if (!busy) { setLoadingStage(1); return; }
    const t2 = setTimeout(() => setLoadingStage(2), 1500);
    const t3 = setTimeout(() => setLoadingStage(3), 3500);
    return () => { clearTimeout(t2); clearTimeout(t3); };
  }, [busy]);

  // Lazy-load history the first time the user expands it. Cheap (≤50 rows)
  // and avoids paying for it on every modal open.
  useEffect(() => {
    if (!open || !historyOpen || historyLoaded) return;
    void fetchContributionHistory().then((rows) => {
      if (!mountedRef.current) return;
      setHistory(rows); setHistoryLoaded(true);
    });
  }, [open, historyOpen, historyLoaded]);

  // Track mount for redirect-safe state guards.
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Body scroll lock that preserves the exact scroll position. iOS Safari
  // ignores overflow:hidden on <body>, so we use position:fixed + top:-scrollY.
  useEffect(() => {
    if (!open) return;
    const scrollY = window.scrollY;
    const body = document.body;
    const prev = {
      position: body.style.position, top: body.style.top,
      left: body.style.left, right: body.style.right,
      width: body.style.width, overflow: body.style.overflow,
    };
    body.style.position = "fixed";
    body.style.top      = `-${scrollY}px`;
    body.style.left     = "0";
    body.style.right    = "0";
    body.style.width    = "100%";
    body.style.overflow = "hidden";
    return () => {
      body.style.position = prev.position;
      body.style.top      = prev.top;
      body.style.left     = prev.left;
      body.style.right    = prev.right;
      body.style.width    = prev.width;
      body.style.overflow = prev.overflow;
      window.scrollTo(0, scrollY);
    };
  }, [open]);

  // Focus management — remember prior focus, restore on close.
  useEffect(() => {
    if (!open) return;
    prevFocusRef.current = document.activeElement as HTMLElement | null;
    return () => { prevFocusRef.current?.focus?.(); };
  }, [open]);

  // ESC to close — always allowed once the fallback link is visible, so
  // the user is never permanently trapped even inside an in-app browser.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && (!busy || fallbackUrl)) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, fallbackUrl, onClose]);

  // Refresh stats when the user comes back to the tab — they may have just
  // paid in another tab/window. Defensive only; SupportSuccess is the
  // primary refresh path.
  useEffect(() => {
    if (!open) return;
    const onVisible = () => { if (document.visibilityState === "visible") onReturn(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [open, onReturn]);

  const finalAmount = useMemo(() => {
    if (custom.trim().length > 0) {
      const n = Number(custom);
      if (!Number.isFinite(n)) return 0;
      return Math.floor(n);
    }
    return amount;
  }, [amount, custom]);

  // Redirect helper shared by both "Continue Secure Payment" and the
  // "Resume checkout" banner. Always navigates with safeRedirectToCheckout,
  // then arms a manual-fallback link in case the in-app browser silently
  // blocks the navigation (FB/IG/TikTok).
  const beginRedirect = (url: string) => {
    setBusy(true); setErr(null); setLoadingStage(1);
    setFallbackUrl(null);
    // If we're already in a known in-app browser, surface the fallback link
    // immediately so the user has a one-tap escape if the redirect stalls.
    const inApp = detectInAppBrowser();
    safeRedirectToCheckout(url);
    setTimeout(() => {
      if (mountedRef.current) setFallbackUrl(url);
    }, inApp ? 600 : 2000);
  };

  const handleSubmit = async () => {
    if (busy) return;
    setErr(null);
    if (!finalAmount || finalAmount < 50) {
      setErr(copy.minAmountError);
      return;
    }
    setBusy(true);
    try {
      const { checkout_url } = await createSupportCheckout(finalAmount * 100);
      beginRedirect(checkout_url);
    } catch (e: unknown) {
      if (!mountedRef.current) return;
      setErr(e instanceof Error ? e.message : "Checkout failed. Please try again.");
      setBusy(false);
    }
  };

  const handleResume = () => {
    if (busy || !resumable) return;
    beginRedirect(resumable.checkout_url);
  };

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      <motion.div
        key="backdrop"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        transition={{ duration: 0.18, ease: "easeOut" }}
        className="fixed inset-0 z-[200] flex items-end justify-center"
        style={{
          background: "rgba(0,0,0,0.74)",
          backdropFilter: "blur(10px)",
          WebkitBackdropFilter: "blur(10px)",
        }}
        onClick={() => { if (!busy || fallbackUrl) onClose(); }}
      >
        <motion.div
          key="sheet"
          ref={sheetRef}
          role="dialog"
          aria-modal="true"
          aria-label={copy.title}
          initial={{ y: "100%", opacity: 0.96 }}
          animate={{ y: 0,      opacity: 1 }}
          exit={{   y: "100%", opacity: 0.96 }}
          transition={{ type: "spring", stiffness: 340, damping: 30, mass: 0.85 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-md overflow-y-auto rounded-t-[28px]"
          style={{
            background: "rgba(12,12,18,0.96)",
            borderTop: "1px solid rgba(168,85,247,0.22)",
            maxHeight: "calc(100dvh - env(safe-area-inset-top, 0px) - 16px)",
            paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 32px)",
            willChange: "transform",
            transform: "translateZ(0)",
          }}
        >
          {/* Grabber */}
          <div className="mx-auto mt-3 h-1 w-10 rounded-full bg-white/15" />

          {/* Header */}
          <div className="sticky top-0 z-10 flex items-start justify-between px-5 pt-4 pb-3"
               style={{ background: "rgba(12,12,18,0.96)" }}>
            <div className="flex-1 pr-3">
              <h3 className="font-display text-[18px] font-bold text-white leading-tight">
                {copy.title}
              </h3>
              <p className="mt-0.5 text-[11px] text-white/45 leading-snug">
                {copy.subtitle}
              </p>
            </div>
            <button
              onClick={onClose}
              disabled={busy && !fallbackUrl}
              className="grid h-8 w-8 place-items-center rounded-full bg-white/8 text-white/60 disabled:opacity-40"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="px-5 pb-2 space-y-5">

            {/* Resume banner — only when an unfinished checkout exists. */}
            {resumable && !busy && (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-2xl p-3.5"
                style={{
                  background: "linear-gradient(135deg, rgba(168,85,247,0.18), rgba(236,72,153,0.12))",
                  border: "1px solid rgba(168,85,247,0.42)",
                }}
              >
                <p className="text-[11px] font-bold uppercase tracking-wider text-purple-200">
                  {copy.resumeTitle}
                </p>
                <p className="mt-1 text-[11.5px] text-white/65">
                  {copy.resumeBody}
                </p>
                <button
                  onClick={handleResume}
                  className="mt-2.5 w-full rounded-xl py-2 text-[12.5px] font-bold text-white"
                  style={{ background: "linear-gradient(135deg,#a855f7,#ec4899)" }}
                >
                  {copy.resumeCta} · ₱{Math.floor(resumable.amount_centavos / 100).toLocaleString()}
                </button>
              </motion.div>
            )}

            {/* Language pills */}
            <div className="flex gap-1.5">
              {LOCALES.map((l) => {
                const active = l.code === locale;
                return (
                  <button
                    key={l.code}
                    onClick={() => onLocaleChange(l.code)}
                    aria-pressed={active}
                    className="flex-1 rounded-full py-1.5 text-[10.5px] font-bold transition-colors"
                    style={{
                      background: active ? "linear-gradient(135deg,#a855f7,#ec4899)" : "rgba(255,255,255,0.05)",
                      color: active ? "#fff" : "rgba(255,255,255,0.55)",
                      border: active ? "1px solid transparent" : "1px solid rgba(255,255,255,0.08)",
                    }}
                  >
                    {l.nativeLabel}
                  </button>
                );
              })}
            </div>

            {/* Amount selector */}
            <div>
              <p className="mb-2 text-[10.5px] font-semibold uppercase tracking-wider text-purple-400">
                {copy.sectionAmount}
              </p>
              <div className="grid grid-cols-3 gap-2">
                {PRESET_AMOUNTS.map((a) => {
                  const active = custom.length === 0 && amount === a;
                  return (
                    <motion.button
                      key={a}
                      whileTap={{ scale: 0.96 }}
                      onClick={() => { setAmount(a); setCustom(""); setErr(null); }}
                      className="rounded-2xl py-3 text-[14px] font-extrabold transition-colors"
                      style={{
                        background: active
                          ? "linear-gradient(135deg,rgba(168,85,247,0.25),rgba(236,72,153,0.18))"
                          : "rgba(255,255,255,0.04)",
                        color: active ? "#fff" : "rgba(255,255,255,0.7)",
                        border: active ? "1px solid rgba(168,85,247,0.5)" : "1px solid rgba(255,255,255,0.06)",
                      }}
                    >
                      ₱{a.toLocaleString()}
                    </motion.button>
                  );
                })}
                {/* Custom amount input occupies one tile slot */}
                <div
                  className="rounded-2xl flex items-center px-2.5"
                  style={{
                    background: custom.length > 0
                      ? "linear-gradient(135deg,rgba(168,85,247,0.25),rgba(236,72,153,0.18))"
                      : "rgba(255,255,255,0.04)",
                    border: custom.length > 0 ? "1px solid rgba(168,85,247,0.5)" : "1px solid rgba(255,255,255,0.06)",
                  }}
                >
                  <span className="text-[14px] font-extrabold text-white/55 mr-0.5">₱</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    placeholder="—"
                    value={custom}
                    onChange={(e) => { setCustom(e.target.value); setErr(null); }}
                    className="w-full bg-transparent text-[14px] font-extrabold text-white outline-none placeholder:text-white/30"
                    aria-label={copy.customAmountLabel}
                  />
                </div>
              </div>
              <p className="mt-1.5 text-[10px] text-white/35">{copy.customAmountHint}</p>
            </div>

            {/* Method picker */}
            <div>
              <p className="mb-2 text-[10.5px] font-semibold uppercase tracking-wider text-purple-400">
                {copy.sectionMethod}
              </p>
              <div className="grid grid-cols-3 gap-2">
                <MethodPill active={method === "gcash"}    onClick={() => setMethod("gcash")}    label={copy.methodGcash}    color="#0084ff" />
                <MethodPill active={method === "paymaya"}  onClick={() => setMethod("paymaya")}  label={copy.methodMaya}     color="#00d632" />
                <MethodPill active={method === "card"}     onClick={() => setMethod("card")}     label={copy.methodCard}     icon={<CreditCard className="h-3.5 w-3.5" />} />
              </div>
            </div>

            {/* Trust */}
            <div className="rounded-[14px] p-3.5"
                 style={{ background: "rgba(168,85,247,0.06)", border: "1px solid rgba(168,85,247,0.14)" }}>
              <div className="flex items-center gap-2 mb-2">
                <ShieldCheck className="h-3.5 w-3.5 text-purple-400" />
                <p className="text-[10.5px] font-bold uppercase tracking-wider text-purple-300">
                  {copy.trustLine}
                </p>
              </div>
              <ul className="space-y-1">
                {copy.trustPoints.map((p) => (
                  <li key={p} className="flex items-start gap-1.5 text-[11px] text-white/55">
                    <Lock className="mt-0.5 h-2.5 w-2.5 shrink-0 text-purple-400" />
                    {p}
                  </li>
                ))}
              </ul>
            </div>

            {/* Error chip */}
            {err && (
              <div className="rounded-2xl px-3.5 py-2.5 text-[11.5px] font-medium text-rose-200"
                   style={{ background: "rgba(244,63,94,0.12)", border: "1px solid rgba(244,63,94,0.28)" }}>
                {err}
              </div>
            )}

            {/* Manual fallback link for in-app browsers that block redirects. */}
            {fallbackUrl && busy && (
              <a
                href={fallbackUrl}
                target="_top"
                rel="noopener noreferrer"
                className="block rounded-2xl px-3.5 py-2.5 text-center text-[11.5px] font-semibold text-purple-200 underline"
                style={{ background: "rgba(168,85,247,0.08)", border: "1px solid rgba(168,85,247,0.28)" }}
              >
                {copy.openInBrowser}
              </a>
            )}

            {/* CTA */}
            <div className="space-y-2 pt-1">
              <motion.button
                whileTap={busy ? undefined : { scale: 0.98 }}
                onClick={handleSubmit}
                disabled={busy}
                aria-busy={busy}
                className="w-full rounded-2xl py-3.5 text-[14px] font-bold text-white disabled:opacity-90"
                style={{
                  background: "linear-gradient(135deg,#a855f7,#ec4899)",
                  boxShadow: "0 10px 24px -8px rgba(168,85,247,0.55)",
                }}
              >
                {busy ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {loadingStage === 1 ? copy.securing : loadingStage === 2 ? copy.securingStage2 : copy.securingStage3}
                  </span>
                ) : (
                  <>{copy.cta} · ₱{(finalAmount || 0).toLocaleString()}</>
                )}
              </motion.button>
              <button
                onClick={onClose}
                disabled={busy && !fallbackUrl}
                className="w-full rounded-2xl py-2.5 text-[12.5px] font-semibold text-white/60 disabled:opacity-40"
              >
                {copy.back}
              </button>
            </div>

            {/* Contribution history accordion */}
            <div className="pt-1">
              <button
                onClick={() => setHistoryOpen((v) => !v)}
                aria-expanded={historyOpen}
                disabled={busy}
                className="flex w-full items-center justify-between rounded-2xl px-3.5 py-2.5 text-left text-[11.5px] font-semibold text-white/70 disabled:opacity-40"
                style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
              >
                <span>{copy.historyTitle}</span>
                <ChevronRight
                  className="h-3.5 w-3.5 transition-transform"
                  style={{ transform: historyOpen ? "rotate(90deg)" : "rotate(0deg)" }}
                />
              </button>
              <AnimatePresence initial={false}>
                {historyOpen && (
                  <motion.ul
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{   height: 0, opacity: 0 }}
                    transition={{ duration: 0.18 }}
                    className="overflow-hidden mt-2 space-y-1.5"
                  >
                    {!historyLoaded && (
                      <li className="flex items-center gap-2 px-1 py-1 text-[11px] text-white/40">
                        <Loader2 className="h-3 w-3 animate-spin" /> …
                      </li>
                    )}
                    {historyLoaded && history.length === 0 && (
                      <li className="px-1 py-1 text-[11px] text-white/40">{copy.historyEmpty}</li>
                    )}
                    {history.map((row) => {
                      const statusLabel =
                        row.status === "paid"      ? copy.statusPaid
                      : row.status === "pending"   ? copy.statusPending
                      : row.status === "failed"    ? copy.statusFailed
                      : row.status === "cancelled" ? copy.statusCancelled
                      :                              copy.statusExpired;
                      const statusColor =
                        row.status === "paid"      ? "#34d399"
                      : row.status === "pending"   ? "#fbbf24"
                      :                              "#f87171";
                      const ts = row.paid_at ?? row.created_at;
                      return (
                        <li
                          key={row.ref}
                          className="flex items-center justify-between rounded-xl px-3 py-2"
                          style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.05)" }}
                        >
                          <div className="min-w-0 flex-1 pr-2">
                            <p className="text-[12.5px] font-bold text-white">
                              ₱{Math.floor(row.amount_centavos / 100).toLocaleString()}
                              {row.payment_method && (
                                <span className="ml-1.5 text-[10px] font-semibold uppercase tracking-wider text-white/40">
                                  · {row.payment_method}
                                </span>
                              )}
                            </p>
                            <p className="mt-0.5 text-[10px] text-white/35 truncate">
                              {new Date(ts).toLocaleString()}
                              {row.paymongo_ref && (
                                <span className="ml-1.5">· {row.paymongo_ref.slice(0, 12)}…</span>
                              )}
                            </p>
                          </div>
                          <span
                            className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
                            style={{
                              background: `${statusColor}22`,
                              color: statusColor,
                              border: `1px solid ${statusColor}55`,
                            }}
                          >
                            {statusLabel}
                          </span>
                        </li>
                      );
                    })}
                  </motion.ul>
                )}
              </AnimatePresence>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body,
  );
}

function MethodPill({
  active, onClick, label, color, icon,
}: {
  active: boolean; onClick: () => void; label: string; color?: string; icon?: React.ReactNode;
}) {
  return (
    <motion.button
      whileTap={{ scale: 0.96 }}
      onClick={onClick}
      aria-pressed={active}
      className="flex items-center justify-center gap-1.5 rounded-2xl py-3 text-[12px] font-bold transition-colors"
      style={{
        background: active
          ? "linear-gradient(135deg,rgba(168,85,247,0.25),rgba(236,72,153,0.18))"
          : "rgba(255,255,255,0.04)",
        color: active ? "#fff" : "rgba(255,255,255,0.7)",
        border: active ? "1px solid rgba(168,85,247,0.5)" : "1px solid rgba(255,255,255,0.06)",
      }}
    >
      {color && <span className="h-2 w-2 rounded-full" style={{ background: color }} />}
      {icon}
      {label}
    </motion.button>
  );
}
