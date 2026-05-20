/**
 * Plan picker: Free / 15-day / Monthly. Tapping a paid plan creates a draft
 * order intent (not in DB) and routes to /billing/checkout/new with the
 * plan_code in the URL hash; the receipt-upload step finalises it via
 * submit_payment().
 */
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { ArrowLeft, Check, Sparkles, Crown, Shield, Wand2 } from "lucide-react";
import { fetchPlans, fetchMyBilling, type Plan, type BillingSummary } from "@/lib/billing";

const FALLBACK_PLANS: Plan[] = [
  { code: "free", name: "Free",     price_php: 0,    credits: 0,    duration_days: 0,  hd_enabled: false, watermark: true,  is_active: true, sort: 0 },
  { code: "p15",  name: "15-Day",   price_php: 1200, credits: 1000, duration_days: 15, hd_enabled: true,  watermark: false, is_active: true, sort: 1 },
  { code: "p30",  name: "Monthly",  price_php: 1700, credits: 2500, duration_days: 30, hd_enabled: true,  watermark: false, is_active: true, sort: 2 },
];

const FEATURES: Record<string, string[]> = {
  free: [
    "3 standard images per day",
    "Basic Socia GPT (limited)",
    "Watermarked downloads",
    "Limited presets",
  ],
  p15: [
    "1,000 credits (~15 days)",
    "HD images & premium video",
    "Faster generation queue",
    "No watermark",
    "Smart saver auto-protects credits",
    "Advanced Socia GPT",
  ],
  p30: [
    "2,500 credits (~30 days)",
    "HD video (5s + 10s)",
    "Priority queue",
    "All premium presets",
    "Multi-frame storyboard videos",
    "Advanced Socia GPT, no waits",
  ],
};

export default function BillingUpgrade() {
  const [, navigate] = useLocation();
  const [plans, setPlans] = useState<Plan[]>(FALLBACK_PLANS);
  const [me, setMe] = useState<BillingSummary | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [p, b] = await Promise.all([fetchPlans(), fetchMyBilling()]);
        if (cancelled) return;
        setPlans(p.length > 0 ? p : FALLBACK_PLANS);
        setMe(b);
      } catch {
        if (!cancelled) setPlans(FALLBACK_PLANS);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

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
          <h2 className="mt-1 text-2xl font-black text-gradient">Create more. Pay less.</h2>
          <p className="mt-1 text-sm app-text-muted">Manual GCash / Maya payment. Activated within hours of approval.</p>
        </motion.div>

        {loading ? (
          <div className="text-center text-sm app-text-muted py-8">Loading plans…</div>
        ) : (
          <div className="space-y-3">
            {plans.map((p) => (
              <PlanCard
                key={p.code}
                plan={p}
                isCurrent={Boolean(me?.plan_code === p.code && (p.code === "free" || (me?.plan_expires_at && new Date(me.plan_expires_at) > new Date())))}
                onSelect={() => p.code === "free" ? null : navigate(`/billing/checkout/new?plan=${p.code}`)}
              />
            ))}
          </div>
        )}

        <div className="mt-6 rounded-2xl border border-white/10 p-4 text-xs app-text-muted">
          <div className="font-bold app-text text-sm mb-1 flex items-center gap-1.5">
            <Shield className="h-3.5 w-3.5" /> How it works
          </div>
          <ol className="list-decimal list-inside space-y-1">
            <li>Pick a plan — you'll see GCash / Maya QR + the exact amount.</li>
            <li>Pay, then upload your receipt + reference number.</li>
            <li>An admin reviews. Approved payments unlock your plan & credits automatically.</li>
            <li>Free plan stays usable while a paid plan is pending.</li>
          </ol>
        </div>
      </div>
    </div>
  );
}

function PlanCard({ plan, isCurrent, onSelect }: {
  plan: Plan; isCurrent: boolean | null | undefined; onSelect: () => void;
}) {
  const isPro = plan.code === "p30";
  const isFree = plan.code === "free";
  const features = FEATURES[plan.code] ?? [];
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      className="card-premium relative overflow-hidden rounded-3xl p-5"
      style={{ borderColor: isPro ? "rgba(168,85,247,0.5)" : undefined }}
    >
      {isPro && (
        <div className="absolute right-3 top-3 rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-white"
             style={{ background: "linear-gradient(135deg,#a855f7,#ec4899)" }}>
          Best value
        </div>
      )}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider app-text-muted">
            {isPro ? <Crown className="h-3 w-3 text-amber-400" /> : <Sparkles className="h-3 w-3" />}
            {plan.name}
          </div>
          <div className="mt-1.5 flex items-baseline gap-1">
            <span className="text-3xl font-black app-text">₱{plan.price_php.toLocaleString()}</span>
            {!isFree && <span className="text-xs app-text-muted">/ {plan.duration_days}d</span>}
          </div>
        </div>
      </div>

      <ul className="mt-3 space-y-1.5">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-2 text-sm app-text">
            <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-400" />
            <span>{f}</span>
          </li>
        ))}
      </ul>

      <button
        onClick={onSelect}
        disabled={isFree || !!isCurrent}
        className="mt-4 w-full rounded-2xl py-3 text-sm font-bold transition disabled:opacity-50"
        style={{
          background: isFree || isCurrent
            ? "rgba(255,255,255,0.06)"
            : "linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))",
          color: isFree || isCurrent ? "var(--s-text-muted)" : "white",
          boxShadow: !isFree && !isCurrent ? "0 12px 32px -10px rgba(168,85,247,0.45)" : undefined,
        }}
      >
        {isCurrent ? "Current plan" : isFree ? "Free for everyone" : `Pay ₱${plan.price_php} via GCash / Maya`}
      </button>
    </motion.div>
  );
}
