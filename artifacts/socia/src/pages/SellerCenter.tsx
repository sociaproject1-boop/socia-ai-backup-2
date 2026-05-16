import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { ArrowLeft, Lock, ShoppingBag, Package, BarChart3, Truck, Heart, ChevronRight, Store, Video, Star } from "lucide-react";

interface FundingProgress { current_amount: number; target_amount: number; unlock_phase: number; }
const BASE = `${import.meta.env.BASE_URL}api`.replace(/\/{2,}/g, "/");
async function fetchProgress(): Promise<FundingProgress | null> {
  try { const r = await fetch(`${BASE}/funding/progress`); const d = await r.json(); return d.funding ?? null; }
  catch { return null; }
}

const FEATURES = [
  { icon: Store,      title: "Seller Dashboard",   desc: "Manage your store, products, and earnings in one place." },
  { icon: Package,    title: "Product Inventory",  desc: "Add digital or physical products with photos and descriptions." },
  { icon: Video,      title: "Live Selling",        desc: "Host live streams where fans can buy directly from you." },
  { icon: Truck,      title: "Order Management",   desc: "Track, process, and fulfill orders with notifications." },
  { icon: BarChart3,  title: "Sales Analytics",    desc: "Revenue, conversion rates, top products — all tracked." },
  { icon: Star,       title: "Store Profile",       desc: "Branded store page with banner, bio, and featured products." },
];

const REQUIREMENTS = ["Active creator account", "Identity verification", "Policy agreement", "Seller application approval"];

const ROLLOUT_STEPS = [
  { label: "Funding goal reached", active: true },
  { label: "7–15 days infrastructure prep", active: false },
  { label: "Secure payment rails integration", active: false },
  { label: "Limited beta — approved sellers first", active: false },
  { label: "Gradual marketplace expansion", active: false },
];

export default function SellerCenter() {
  const [, navigate] = useLocation();
  const [progress, setProgress] = useState<FundingProgress | null>(null);
  useEffect(() => { fetchProgress().then(setProgress); }, []);
  const pct = progress ? Math.min(100, Math.round((progress.current_amount / progress.target_amount) * 100)) : 0;

  return (
    <div className="app-bg min-h-[100dvh] pb-28">
      <div className="app-header sticky top-0 z-40 flex items-center gap-3 px-4 py-3">
        <button onClick={() => navigate("/")} className="rounded-full p-2 app-surface">
          <ArrowLeft className="h-5 w-5 app-text" />
        </button>
        <h1 className="text-lg font-bold app-text">Seller Center</h1>
      </div>

      <div className="px-4 pt-2">
        <LockedBanner pct={pct} phase={progress?.unlock_phase ?? 1} onSupport={() => navigate("/")} />
        <RolloutTimeline steps={ROLLOUT_STEPS} />

        <div className="mt-5">
          <p className="mb-3 text-[10.5px] font-semibold uppercase tracking-wider app-text-muted">What's included</p>
          <div className="grid grid-cols-1 gap-3">
            {FEATURES.map((f, i) => (
              <motion.div key={f.title} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                          className="rounded-[18px] p-4" style={{ background: "rgba(168,85,247,0.05)", border: "1px solid rgba(168,85,247,0.12)" }}>
                <div className="flex items-start gap-3">
                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl"
                       style={{ background: "linear-gradient(135deg,rgba(168,85,247,0.2),rgba(236,72,153,0.15))" }}>
                    <f.icon className="h-4 w-4 text-purple-400" />
                  </div>
                  <div>
                    <p className="text-[13px] font-bold app-text">{f.title}</p>
                    <p className="text-[11.5px] app-text-muted mt-0.5 leading-relaxed">{f.desc}</p>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
        <RequirementsCard items={REQUIREMENTS} />
      </div>
    </div>
  );
}

function LockedBanner({ pct, phase, onSupport }: { pct: number; phase: number; onSupport: () => void }) {
  return (
    <div className="relative overflow-hidden rounded-[22px] p-5 text-center"
         style={{ background: "linear-gradient(135deg,#0d0d1a,#13102a)", border: "1px solid rgba(168,85,247,0.2)" }}>
      <div className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full opacity-20"
           style={{ background: "radial-gradient(circle,#a855f7,transparent)" }} />
      <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl"
           style={{ background: "linear-gradient(135deg,rgba(168,85,247,0.2),rgba(236,72,153,0.15))", border: "1px solid rgba(168,85,247,0.25)" }}>
        <Lock className="h-6 w-6 text-purple-300" />
      </div>
      <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-purple-400">Phase {phase} · Locked</p>
      <h2 className="mb-2 font-display text-[18px] font-black leading-tight text-white">Deployment Phase Pending</h2>
      <p className="mb-4 text-[11.5px] leading-relaxed text-white/50" style={{ maxWidth: 270, margin: "0 auto 16px" }}>
        Funding goal completion unlocks the next deployment phase. The seller marketplace rolls out gradually after secure payment integration, moderation systems, and stability checks are complete.
      </p>
      <div className="mb-3 h-2 overflow-hidden rounded-full bg-white/10">
        <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 1, ease: "easeOut", delay: 0.2 }}
                    className="h-full rounded-full" style={{ background: "linear-gradient(90deg,#a855f7,#ec4899)" }} />
      </div>
      <p className="mb-4 text-[10.5px] font-bold text-purple-300">{pct}% of goal reached</p>
      <button onClick={onSupport} className="w-full rounded-2xl py-2.5 text-[13px] font-bold text-white"
              style={{ background: "linear-gradient(135deg,#a855f7,#ec4899)" }}>
        <Heart className="mr-1.5 inline h-3.5 w-3.5" /> Help Advance the Next Phase
      </button>
    </div>
  );
}

function RolloutTimeline({ steps }: { steps: { label: string; active: boolean }[] }) {
  return (
    <div className="mt-3 rounded-[18px] p-4"
         style={{ background: "rgba(168,85,247,0.04)", border: "1px solid rgba(168,85,247,0.1)" }}>
      <p className="mb-3 text-[10px] font-bold uppercase tracking-wider text-purple-400">Rollout plan</p>
      <div className="space-y-0">
        {steps.map((s, i) => (
          <div key={s.label} className="flex items-start gap-3">
            <div className="flex flex-col items-center">
              <div className="mt-0.5 h-4 w-4 shrink-0 rounded-full flex items-center justify-center"
                   style={{ background: s.active ? "linear-gradient(135deg,#a855f7,#ec4899)" : "rgba(168,85,247,0.15)", border: "1px solid rgba(168,85,247,0.3)" }}>
                <span className="text-[7px] font-black text-white">{i + 1}</span>
              </div>
              {i < steps.length - 1 && (
                <div className="w-px my-1" style={{ height: 14, background: "rgba(168,85,247,0.2)" }} />
              )}
            </div>
            <p className="pb-2 text-[11.5px] leading-snug"
               style={{ color: s.active ? "rgba(216,180,254,1)" : "rgba(255,255,255,0.4)" }}>
              {s.label}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function RequirementsCard({ items }: { items: string[] }) {
  return (
    <div className="mt-4 rounded-[18px] p-4" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
      <p className="mb-3 text-[10.5px] font-semibold uppercase tracking-wider app-text-muted">Requirements to apply</p>
      <div className="space-y-2">
        {items.map((r) => (
          <div key={r} className="flex items-center gap-2">
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-purple-400" />
            <span className="text-[12.5px] app-text">{r}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
