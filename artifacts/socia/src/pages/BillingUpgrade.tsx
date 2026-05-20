/**
 * Plan picker. Tapping a paid plan kicks off a PayMongo Checkout session
 * via createPaymongoCheckout() and redirects to the hosted GCash / Maya /
 * Card form. Credits + plan activation happen automatically when the
 * PayMongo webhook fires — no admin review.
 *
 * Plans (creator system — soft daily quotas + monthly pool):
 *   Premium      ₱499/mo   150 chat · 20 img · 5 vid daily
 *   Elite        ₱999/mo   300 chat · 50 img · 10 vid daily
 *   Super Elite  ₱1999/mo  500 chat · 100 img · 20 vid daily
 *   AI Cinematic Studio ₱2499/mo  10 cinematic projects (parallel add-on)
 *
 * UI language is creator-friendly: NO "limit reached" / "blocked" wording.
 * Past daily quota → render runs in "economy mode" (lower res / lower queue
 * priority) so creators are never frustrated mid-flow.
 */
import { useEffect, useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { ArrowLeft, Check, Sparkles, Crown, Shield, Wand2, Film, Zap, Star } from "lucide-react";
import { fetchMyBilling, createPaymongoCheckout, type PlanCode, type BillingSummary } from "@/lib/billing";
import PolicyModal, { type PolicyPlanCode } from "@/components/billing/PolicyModal";

type UpgradePlanCode = "premium" | "elite" | "super_elite" | "cinematic";

interface UpgradePlan {
  code:          UpgradePlanCode;
  name:          string;
  price_php:     number;
  /** Headline subtext under the price */
  subtitle:      string;
  /** Bullet list of features */
  features:      string[];
  /** Visual accent */
  accent:        "premium" | "elite" | "super_elite" | "cinematic";
}

const PLANS: UpgradePlan[] = [
  {
    code: "premium",
    name: "Premium",
    price_php: 499,
    subtitle: "Daily creator toolkit · standard quality",
    features: [
      "150 AI chats every day",
      "20 standard-quality images daily",
      "5 short AI videos daily",
      "5s image · 30s video cooldown",
      "Keep creating after limits in economy render mode",
    ],
    accent: "premium",
  },
  {
    code: "elite",
    name: "Elite",
    price_php: 999,
    subtitle: "Heavy creator daily · faster renders",
    features: [
      "300 AI chats every day",
      "50 better-quality images daily",
      "10 AI videos daily · faster queue",
      "3s image · 20s video cooldown",
      "Adaptive quality past daily limits — never blocked",
    ],
    accent: "elite",
  },
  {
    code: "super_elite",
    name: "Super Elite",
    price_php: 1999,
    subtitle: "Top tier · priority render queue",
    features: [
      "500 AI chats every day",
      "100 high-quality images daily",
      "20 AI videos daily · priority queue",
      "1s image · 10s video cooldown",
      "Highest queue priority + adaptive overflow mode",
    ],
    accent: "super_elite",
  },
  {
    code: "cinematic",
    name: "AI Cinematic Studio",
    price_php: 2499,
    subtitle: "Pro cinematic creator add-on",
    features: [
      "10 cinematic projects per month",
      "Up to 10 scenes per project · 30s final video",
      "1080p export · voice acting · ambient sound",
      "Cinematic motion + camera controls",
      "Extra projects continue in economy cinematic mode",
      "Full render history",
    ],
    accent: "cinematic",
  },
];

function planAccentStyle(accent: UpgradePlan["accent"]): { gradient: string; ring: string; icon: ReactNode; badge?: string } {
  switch (accent) {
    case "premium":
      return { gradient: "linear-gradient(135deg,#a855f7,#ec4899)", ring: "rgba(168,85,247,0.5)", icon: <Sparkles className="h-3 w-3" /> };
    case "elite":
      return { gradient: "linear-gradient(135deg,#f59e0b,#ec4899)", ring: "rgba(245,158,11,0.5)", icon: <Crown className="h-3 w-3 text-amber-300" />, badge: "Most popular" };
    case "super_elite":
      return { gradient: "linear-gradient(135deg,#06b6d4,#a855f7)", ring: "rgba(6,182,212,0.5)", icon: <Star className="h-3 w-3 text-cyan-300" />, badge: "Top tier" };
    case "cinematic":
      return { gradient: "linear-gradient(135deg,#ec4899,#f59e0b)", ring: "rgba(236,72,153,0.5)", icon: <Film className="h-3 w-3 text-rose-300" />, badge: "Add-on" };
  }
}

export default function BillingUpgrade() {
  const [, navigate] = useLocation();
  const [me, setMe] = useState<BillingSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [payingPlan, setPayingPlan] = useState<UpgradePlanCode | null>(null);
  const [payError, setPayError] = useState<string | null>(null);
  /** Plan currently being reviewed in the policy modal. null = modal closed. */
  const [policyPlan, setPolicyPlan] = useState<UpgradePlanCode | null>(null);

  // Tapping Pay opens the policy modal first. Checkout only proceeds after
  // the user reads the plan policy + global fair-usage statement and taps
  // "I Understand & Agree". This protects against refund complaints and
  // "scam" accusations by making the soft-limit behavior explicit upfront.
  const handlePay = (code: UpgradePlanCode) => {
    if (payingPlan) return;
    setPayError(null);
    setPolicyPlan(code);
  };

  const proceedToCheckout = async () => {
    const code = policyPlan;
    if (!code) return;
    setPolicyPlan(null);
    setPayingPlan(code);
    try {
      const { checkout_url } = await createPaymongoCheckout(code as PlanCode);
      window.location.assign(checkout_url);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Payment failed. Please try again.";
      setPayError(msg);
      setPayingPlan(null);
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const b = await fetchMyBilling();
        if (!cancelled) setMe(b);
      } catch {
        /* ignore — page is usable without billing summary */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const isPlanActive = (code: UpgradePlanCode): boolean => {
    if (!me) return false;
    const exp = me.plan_expires_at ? new Date(me.plan_expires_at) : null;
    const active = exp ? exp > new Date() : false;
    if (!active) return false;
    // The chat plan currently held lives in me.plan_code; cinematic is tracked
    // separately and we don't currently surface it in BillingSummary, so we
    // intentionally never mark cinematic as "current" here — the user can
    // always re-purchase it (which stacks on the existing expiry).
    if (code === "cinematic") return false;
    return me.plan_code === code;
  };

  return (
    <div className="app-bg min-h-[100dvh] pb-24">
      <div className="app-header sticky top-0 z-40 flex items-center gap-3 px-4 py-3">
        <button onClick={() => navigate("/billing")} className="rounded-full p-2 app-surface" aria-label="Back">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-lg font-bold app-text">Upgrade</h1>
      </div>

      <div className="px-4 pt-4">
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-5">
          <div className="text-[10px] font-bold uppercase tracking-widest app-text-muted">Pick your plan</div>
          <h2 className="mt-1 text-2xl font-black text-gradient">Create freely. All month.</h2>
          <p className="mt-1 text-sm app-text-muted">
            Generous daily quotas — and you keep creating in economy mode if you push past them. GCash, Maya or Card.
          </p>
          {payError && (
            <div className="mt-3 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
              {payError}
            </div>
          )}
        </motion.div>

        {loading ? (
          <div className="text-center text-sm app-text-muted py-8">Loading plans…</div>
        ) : (
          <div className="space-y-3">
            {PLANS.map((p) => (
              <PlanCard
                key={p.code}
                plan={p}
                isCurrent={isPlanActive(p.code)}
                isPaying={payingPlan === p.code}
                disabled={payingPlan !== null && payingPlan !== p.code}
                onSelect={() => handlePay(p.code)}
              />
            ))}
          </div>
        )}

        <PolicyModal
          open={policyPlan !== null}
          plan={(policyPlan ?? "premium") as PolicyPlanCode}
          onAgree={proceedToCheckout}
          onClose={() => setPolicyPlan(null)}
        />

        <div className="mt-6 rounded-2xl border border-white/10 p-4 text-xs app-text-muted">
          <div className="font-bold app-text text-sm mb-1 flex items-center gap-1.5">
            <Shield className="h-3.5 w-3.5" /> How it works
          </div>
          <ol className="list-decimal list-inside space-y-1">
            <li>Pick a plan — tap Pay and choose GCash, Maya, or Card on the next screen.</li>
            <li>Complete payment on PayMongo's secure checkout.</li>
            <li>Your plan unlocks instantly — no admin review.</li>
            <li>Fair usage: past daily quotas, creating continues in economy render mode (lower priority, lower res) so your flow never breaks.</li>
            <li>Cinematic Studio is a parallel add-on — stacks on any chat plan.</li>
          </ol>
        </div>
      </div>
    </div>
  );
}

function PlanCard({ plan, isCurrent, isPaying, disabled, onSelect }: {
  plan: UpgradePlan; isCurrent: boolean; isPaying: boolean; disabled: boolean; onSelect: () => void;
}) {
  const style = planAccentStyle(plan.accent);
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      className="card-premium relative overflow-hidden rounded-3xl p-5"
      style={{ borderColor: style.ring }}
    >
      {style.badge && (
        <div
          className="absolute right-3 top-3 rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-white"
          style={{ background: style.gradient }}
        >
          {style.badge}
        </div>
      )}

      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider app-text-muted">
            {style.icon}
            {plan.name}
          </div>
          <div className="mt-1.5 flex items-baseline gap-1">
            <span className="text-3xl font-black app-text">₱{plan.price_php.toLocaleString()}</span>
            <span className="text-xs app-text-muted">/ month</span>
          </div>
          <div className="text-[11px] app-text-muted">{plan.subtitle}</div>
        </div>
      </div>

      <ul className="mt-3 space-y-1.5">
        {plan.features.map((f) => (
          <li key={f} className="flex items-start gap-2 text-sm app-text">
            <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-400" />
            <span>{f}</span>
          </li>
        ))}
      </ul>

      <button
        onClick={onSelect}
        disabled={isCurrent || disabled || isPaying}
        className="mt-4 w-full rounded-2xl py-3 text-sm font-bold transition disabled:opacity-50 flex items-center justify-center gap-2"
        style={{
          background: isCurrent ? "rgba(255,255,255,0.06)" : style.gradient,
          color: isCurrent ? "var(--s-text-muted)" : "white",
          boxShadow: !isCurrent ? "0 12px 32px -10px rgba(168,85,247,0.45)" : undefined,
        }}
      >
        {isPaying && <Wand2 className="h-4 w-4 animate-spin" />}
        {isCurrent
          ? "Current plan"
          : isPaying
            ? "Redirecting to PayMongo…"
            : (
              <>
                <Zap className="h-4 w-4" />
                Pay via GCash / Maya / Card
              </>
            )}
      </button>
    </motion.div>
  );
}
