import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { ArrowLeft, Sparkles, Zap } from "lucide-react";
import { fetchTopups, type TopupPackage } from "@/lib/billing";

const FALLBACK_TOPUPS: TopupPackage[] = [
  { code: "t250",  label: "250 Credits",  credits: 250,  price_php: 200,  bonus_label: null,         is_active: true, sort: 0 },
  { code: "t800",  label: "800 Credits",  credits: 800,  price_php: 600,  bonus_label: "+50 bonus",  is_active: true, sort: 1 },
  { code: "t2000", label: "2000 Credits", credits: 2000, price_php: 1400, bonus_label: "+200 bonus", is_active: true, sort: 2 },
];

export default function BillingTopup() {
  const [, navigate] = useLocation();
  const [pkgs, setPkgs] = useState<TopupPackage[]>(FALLBACK_TOPUPS);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const pkgs = await fetchTopups();
        if (cancelled) return;
        setPkgs(pkgs.length > 0 ? pkgs : FALLBACK_TOPUPS);
      } catch {
        if (!cancelled) setPkgs(FALLBACK_TOPUPS);
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
        <h1 className="text-lg font-bold app-text">Top up credits</h1>
      </div>

      <div className="px-4 pt-4">
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-4">
          <div className="text-[10px] font-bold uppercase tracking-widest app-text-muted">One-time</div>
          <h2 className="mt-1 text-2xl font-black text-gradient">Add credits anytime</h2>
          <p className="mt-1 text-sm app-text-muted">Credits never expire while your plan is active.</p>
        </motion.div>

        {loading ? (
          <div className="text-center text-sm app-text-muted py-8">Loading…</div>
        ) : (
          <div className="space-y-3">
            {pkgs.map((p) => (
              <motion.button
                key={p.code}
                initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                onClick={() => navigate(`/billing/checkout/new?topup=${p.code}`)}
                className="card-premium w-full rounded-2xl p-4 text-left flex items-center gap-3"
              >
                <div className="grid h-12 w-12 place-items-center rounded-2xl"
                     style={{ background: "linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))" }}>
                  <Sparkles className="h-5 w-5 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold app-text">{p.label}</div>
                  <div className="text-xs app-text-muted">
                    <b className="text-emerald-400">{p.credits.toLocaleString()} credits</b>
                    {p.bonus_label && <span className="ml-1 text-amber-300">{p.bonus_label}</span>}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-black app-text">₱{p.price_php}</div>
                  <div className="text-[10px] app-text-muted">≈ ₱{(p.price_php / p.credits).toFixed(2)} / credit</div>
                </div>
              </motion.button>
            ))}
          </div>
        )}

        <div className="mt-6 rounded-2xl border border-white/10 p-3 text-[11px] app-text-muted text-center flex items-center justify-center gap-1.5">
          <Zap className="h-3 w-3" /> Approved within hours after we receive your receipt.
        </div>
      </div>
    </div>
  );
}
