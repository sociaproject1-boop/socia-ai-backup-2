/**
 * CommunityFunding — home-page section + SupportModal.
 *
 * - Fetches global funding progress once on mount (no polling).
 * - SupportModal: shows payment destination, numbered instructions,
 *   trust notices, reference number + optional screenshot upload.
 * - Admin-verified only — progress only changes after admin approval.
 * - Rollout messaging: gradual / phased, not "instant unlock".
 */
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useLocation } from "wouter";
import {
  Heart, X, Sparkles, ChevronRight, CheckCircle2, Clock,
  ShoppingBag, Users, Star, Zap, Globe, Shield, BarChart3,
  Upload, Loader2, AlertCircle, Lock,
} from "lucide-react";
import { supabase } from "@/lib/supabase";

/* ── Types ──────────────────────────────────────────────────────────── */
interface FundingProgress {
  target_amount:    number;
  current_amount:   number;
  supporters_count: number;
  is_goal_reached:  boolean;
  unlock_phase:     number;
}

interface MyDonation {
  id:             string;
  amount:         number;
  payment_method: string;
  status:         "pending" | "approved" | "rejected";
  admin_notes:    string | null;
  created_at:     string;
}

/* ── Cloudinary unsigned upload ─────────────────────────────────────── */
async function uploadScreenshot(file: File): Promise<string> {
  const form = new FormData();
  form.append("file", file);
  form.append("upload_preset", "socia_upload");
  const r = await fetch("https://api.cloudinary.com/v1_1/devyx5yyk/image/upload", {
    method: "POST", body: form,
  });
  const d = await r.json();
  if (!d.secure_url) throw new Error("Screenshot upload failed");
  return d.secure_url as string;
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

async function fetchMyDonations(): Promise<MyDonation[]> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return [];
  const r = await fetch(`${BASE}/funding/my`, {
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
  if (!r.ok) return [];
  const d = await r.json();
  return d.donations ?? [];
}

async function submitDonation(payload: {
  amount: number; payment_method: string; reference_no: string; screenshot_url?: string;
}): Promise<{ ok: boolean; message?: string }> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { ok: false, message: "Please sign in first." };
  const r = await fetch(`${BASE}/funding/donate`, {
    method:  "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
    body:    JSON.stringify(payload),
  });
  const d = await r.json();
  if (!r.ok) return { ok: false, message: d.message ?? "Submission failed." };
  return { ok: true };
}

/* ── Data ───────────────────────────────────────────────────────────── */
const WHY_CARDS = [
  { icon: Zap,         label: "Creator Monetization",  desc: "Stars, earnings, payout systems, creator levels." },
  { icon: Users,       label: "Affiliate System",       desc: "Creator referrals, campaign center, commission tracking." },
  { icon: ShoppingBag, label: "Seller Marketplace",    desc: "Digital products, live selling, inventory, orders." },
  { icon: BarChart3,   label: "Creator Analytics",      desc: "Dashboards, earnings reports, growth insights." },
  { icon: Globe,       label: "AI Infrastructure",      desc: "Expanded generation capacity and faster queues." },
  { icon: Shield,      label: "Moderation & Security",  desc: "Anti-abuse, safe payments, trust systems." },
];

const PHASE_LABELS: Record<number, string> = {
  1: "Community Beta",
  2: "Infrastructure Expansion",
  3: "Limited Beta Launch",
  4: "Public Rollout",
};

const ROLLOUT_STEPS = [
  "Funding goal reached",
  "7–15 days infrastructure preparation",
  "Limited beta — selected creators first",
  "Server stability monitoring",
  "Gradual expansion to all creators",
];

/* ══════════════════════════════════════════════════════════════════════
   Main exported section
   ══════════════════════════════════════════════════════════════════════ */
export function CommunityFunding() {
  const [progress, setProgress] = useState<FundingProgress | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [, navigate] = useLocation();

  useEffect(() => { fetchProgress().then(setProgress); }, []);

  const pct = progress
    ? Math.min(100, Math.round((progress.current_amount / progress.target_amount) * 100))
    : 0;

  const remaining = progress
    ? Math.max(0, progress.target_amount - progress.current_amount)
    : 50000;

  return (
    <section className="mb-6">
      {/* Section label */}
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
            Features roll out gradually after infrastructure preparation and stability checks.
          </p>
        </div>

        {/* Stats */}
        <div className="mb-3 grid grid-cols-3 gap-2">
          <FundStat label="Raised"     value={progress ? `₱${Math.floor(progress.current_amount).toLocaleString()}` : "—"} />
          <FundStat label="Goal"       value={progress ? `₱${Math.floor(progress.target_amount).toLocaleString()}` : "₱50,000"} />
          <FundStat label="Supporters" value={progress ? progress.supporters_count.toLocaleString() : "—"} />
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
          <span className="text-[10.5px] font-bold text-purple-300">{pct}% funded</span>
          <span className="text-[10px] text-white/40">₱{Math.floor(remaining).toLocaleString()} remaining</span>
        </div>

        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={() => setShowModal(true)}
          className="w-full rounded-2xl py-3 text-sm font-bold text-white"
          style={{ background: "linear-gradient(135deg,#a855f7,#ec4899)", boxShadow: "0 8px 20px -6px rgba(168,85,247,0.6)" }}
        >
          <Heart className="mr-1.5 inline h-4 w-4" /> Support Socia
        </motion.button>
      </motion.div>

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

      {/* ── Rollout timeline ───────────────────────────────────────── */}
      <div className="mb-4 rounded-[18px] p-4"
           style={{ background: "rgba(168,85,247,0.05)", border: "1px solid rgba(168,85,247,0.12)" }}>
        <p className="mb-3 text-[10.5px] font-semibold uppercase tracking-wider text-purple-400">
          Gradual rollout plan
        </p>
        <div className="space-y-0">
          {ROLLOUT_STEPS.map((step, i) => (
            <div key={step} className="flex items-start gap-3">
              <div className="flex flex-col items-center">
                <div className="mt-0.5 h-4 w-4 shrink-0 rounded-full flex items-center justify-center"
                     style={{ background: i === 0 ? "linear-gradient(135deg,#a855f7,#ec4899)" : "rgba(168,85,247,0.2)", border: "1px solid rgba(168,85,247,0.4)" }}>
                  <span className="text-[7px] font-black text-white">{i + 1}</span>
                </div>
                {i < ROLLOUT_STEPS.length - 1 && (
                  <div className="w-px flex-1 my-1" style={{ minHeight: 14, background: "rgba(168,85,247,0.2)" }} />
                )}
              </div>
              <p className="pb-2 text-[11.5px] leading-snug" style={{ color: i === 0 ? "rgba(216,180,254,1)" : "rgba(255,255,255,0.45)" }}>
                {step}
              </p>
            </div>
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
            { label: "Creator Monetization", icon: Star,         path: "/creator/monetization" },
            { label: "Affiliate Program",    icon: Users,        path: "/creator/affiliate" },
            { label: "Seller Center",        icon: ShoppingBag,  path: "/creator/seller" },
            { label: "Creator Stars",        icon: Sparkles,     path: "/creator/stars" },
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
        onSuccess={() => { setShowModal(false); fetchProgress().then(setProgress); }}
      />
    </section>
  );
}

/* ── Tiny stat ──────────────────────────────────────────────────────── */
function FundStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl p-2.5 text-center" style={{ background: "rgba(255,255,255,0.05)" }}>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-white/45">{label}</div>
      <div className="mt-0.5 text-[14px] font-extrabold text-white leading-tight">{value}</div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   Support Modal
   ══════════════════════════════════════════════════════════════════════ */
const PRESET_AMOUNTS = [100, 200, 500, 1000];

const FLOW_STEPS = [
  "Select your support amount",
  "Send payment using official channels (details will appear at activation)",
  "Enter the reference number from your receipt",
  "Optionally upload your payment screenshot",
  "Submit — admin verifies before it counts toward the goal",
];

function SupportModal({
  open, onClose, onSuccess,
}: {
  open: boolean; onClose: () => void; onSuccess: () => void;
}) {
  const [step, setStep]               = useState<"form" | "success" | "history">("form");
  const [amount, setAmount]           = useState<number | "">(200);
  const [method, setMethod]           = useState<"gcash" | "maya">("gcash");
  const [refNo, setRefNo]             = useState("");
  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(null);
  const [uploading, setUploading]     = useState(false);
  const [busy, setBusy]               = useState(false);
  const [err, setErr]                 = useState<string | null>(null);
  const [history, setHistory]         = useState<MyDonation[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setStep("form"); setErr(null); setRefNo(""); setScreenshotUrl(null);
      setAmount(200); setMethod("gcash"); setBusy(false);
    }
  }, [open]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true); setErr(null);
    try {
      const url = await uploadScreenshot(file);
      setScreenshotUrl(url);
    } catch {
      setErr("Screenshot upload failed. You can still submit with just a reference number.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleSubmit = async () => {
    const amt = Number(amount);
    if (!amt || amt < 50) { setErr("Minimum support amount is ₱50."); return; }
    if (refNo.trim().length < 4) { setErr("Enter your GCash / Maya reference number."); return; }
    setBusy(true); setErr(null);
    const res = await submitDonation({
      amount: amt, payment_method: method,
      reference_no: refNo.trim(), screenshot_url: screenshotUrl ?? undefined,
    });
    setBusy(false);
    if (!res.ok) { setErr(res.message ?? "Submission failed."); return; }
    setStep("success");
    onSuccess();
  };

  const loadHistory = async () => {
    setStep("history"); setLoadingHistory(true);
    const d = await fetchMyDonations();
    setHistory(d); setLoadingHistory(false);
  };

  if (!open) return null;

  return createPortal(
    <AnimatePresence>
      <motion.div
        key="backdrop"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-[200] flex items-end justify-center"
        style={{ background: "rgba(0,0,0,0.88)" }}
        onClick={onClose}
      >
        <motion.div
          key="sheet"
          initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
          transition={{ type: "spring", stiffness: 380, damping: 36 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-md overflow-y-auto rounded-t-[28px]"
          style={{
            background: "linear-gradient(180deg,#11111f,#0d0d1a)",
            border: "1px solid rgba(168,85,247,0.18)",
            borderBottom: "none",
            maxHeight: "calc(100dvh - env(safe-area-inset-top, 0px) - 16px)",
            paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 32px)",
          }}
        >
          <div className="mx-auto mt-3 h-1 w-10 rounded-full bg-white/15" />

          {/* Header — sticky so the X button stays visible when content scrolls */}
          <div
            className="sticky top-0 z-10 flex items-center justify-between px-5 pt-4 pb-3"
            style={{ background: "linear-gradient(180deg,#11111f 85%,transparent)" }}
          >
            <div>
              <h3 className="font-display text-[17px] font-bold text-white">
                {step === "history" ? "My Submissions" : step === "success" ? "Submitted!" : "Support Socia"}
              </h3>
              {step === "form" && (
                <p className="mt-0.5 text-[11px] text-white/40">
                  Admin-verified only · pending review after submission
                </p>
              )}
            </div>
            <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-full bg-white/8 text-white/60">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="px-5">

            {/* ── Success ── */}
            {step === "success" && (
              <div className="py-6 text-center">
                <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-full"
                     style={{ background: "linear-gradient(135deg,#a855f7,#ec4899)" }}>
                  <CheckCircle2 className="h-8 w-8 text-white" />
                </div>
                <p className="mb-2 text-base font-bold text-white">Submission received!</p>
                <p className="mb-5 text-[12px] leading-relaxed text-white/55">
                  Your support is pending admin review. Once verified, it will be added to the funding total.
                  Thank you for helping build Socia. ❤️
                </p>
                <div className="mb-4 rounded-2xl p-3.5 text-left"
                     style={{ background: "rgba(168,85,247,0.08)", border: "1px solid rgba(168,85,247,0.15)" }}>
                  <p className="mb-2 text-[10.5px] font-semibold text-purple-300">What happens next</p>
                  <ul className="space-y-1.5 text-[11px] text-white/55">
                    <li>• Admin reviews your reference number & screenshot</li>
                    <li>• Approved submissions update the funding total</li>
                    <li>• After the funding goal, infrastructure preparation begins (7–15 days)</li>
                    <li>• Creator systems roll out gradually — selected creators first</li>
                    <li>• You'll see "approved" status in your submissions tab</li>
                  </ul>
                </div>
                <button onClick={loadHistory}
                        className="w-full rounded-2xl bg-white/5 py-2.5 text-sm font-semibold text-white/70">
                  View my submissions
                </button>
              </div>
            )}

            {/* ── History ── */}
            {step === "history" && (
              <div className="py-3">
                {loadingHistory
                  ? <div className="py-8 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin text-purple-400" /></div>
                  : history.length === 0
                  ? <div className="py-8 text-center text-[12px] text-white/40">No submissions yet.</div>
                  : (
                    <div className="space-y-2">
                      {history.map((d) => (
                        <div key={d.id} className="flex items-center justify-between rounded-[14px] p-3"
                             style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}>
                          <div>
                            <p className="text-[13px] font-bold text-white">₱{Number(d.amount).toLocaleString()}</p>
                            <p className="text-[10.5px] capitalize text-white/40">
                              {d.payment_method} · {new Date(d.created_at).toLocaleDateString()}
                            </p>
                            {d.admin_notes && <p className="mt-0.5 text-[10.5px] text-amber-400">{d.admin_notes}</p>}
                          </div>
                          <StatusBadge status={d.status} />
                        </div>
                      ))}
                    </div>
                  )}
                <button onClick={() => setStep("form")}
                        className="mt-4 w-full rounded-2xl py-2.5 text-sm font-semibold text-white"
                        style={{ background: "linear-gradient(135deg,#a855f7,#ec4899)" }}>
                  + New submission
                </button>
              </div>
            )}

            {/* ── Form ── */}
            {step === "form" && (
              <div className="space-y-4">

                {/* How it works — numbered steps */}
                <div className="rounded-[14px] p-3.5"
                     style={{ background: "rgba(168,85,247,0.06)", border: "1px solid rgba(168,85,247,0.14)" }}>
                  <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-purple-400">How it works</p>
                  <ol className="space-y-1">
                    {FLOW_STEPS.map((s, i) => (
                      <li key={i} className="flex items-start gap-2 text-[11px] text-white/55">
                        <span className="mt-0.5 shrink-0 font-bold text-purple-500">{i + 1}.</span>
                        {s}
                      </li>
                    ))}
                  </ol>
                </div>

                {/* Amount */}
                <div>
                  <label className="mb-2 block text-[11px] font-semibold uppercase tracking-wider text-white/45">
                    Support amount
                  </label>
                  <div className="mb-2 grid grid-cols-4 gap-1.5">
                    {PRESET_AMOUNTS.map((a) => (
                      <button key={a} onClick={() => setAmount(a)}
                              className={`rounded-xl py-2 text-[12px] font-bold transition ${
                                amount === a ? "text-white" : "bg-white/5 text-white/55"
                              }`}
                              style={amount === a ? { background: "linear-gradient(135deg,#a855f7,#ec4899)" } : {}}>
                        ₱{a}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center rounded-[14px] bg-white/5 px-3 py-2.5"
                       style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
                    <span className="mr-2 text-sm text-white/40">₱</span>
                    <input
                      type="number" min={50} value={amount}
                      onChange={(e) => setAmount(e.target.value === "" ? "" : Number(e.target.value))}
                      placeholder="Custom amount"
                      className="flex-1 bg-transparent text-sm text-white focus:outline-none"
                    />
                  </div>
                  <p className="mt-1 text-[10px] text-white/30">Minimum ₱50</p>
                </div>

                {/* Payment method */}
                <div>
                  <label className="mb-2 block text-[11px] font-semibold uppercase tracking-wider text-white/45">
                    Payment method
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {(["gcash", "maya"] as const).map((m) => (
                      <button key={m} onClick={() => setMethod(m)}
                              className={`rounded-[14px] py-2.5 text-[12.5px] font-bold capitalize transition ${
                                method === m ? "text-white" : "bg-white/5 text-white/55"
                              }`}
                              style={method === m ? { background: "linear-gradient(135deg,#a855f7,#ec4899)" } : {}}>
                        {m === "gcash" ? "GCash" : "Maya"}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Payment channel — preparation state */}
                <div className="rounded-[16px] overflow-hidden"
                     style={{ border: "1px solid rgba(168,85,247,0.2)" }}>
                  {/* Header strip */}
                  <div className="flex items-center gap-2 px-4 py-3"
                       style={{ background: "rgba(168,85,247,0.1)", borderBottom: "1px solid rgba(168,85,247,0.15)" }}>
                    <Lock className="h-3.5 w-3.5 text-purple-400 shrink-0" />
                    <p className="text-[10.5px] font-bold uppercase tracking-wider text-purple-300">
                      Payment channels
                    </p>
                    <span className="ml-auto rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider"
                          style={{ background: "rgba(251,191,36,0.15)", color: "#fbbf24" }}>
                      Not yet active
                    </span>
                  </div>

                  <div className="p-4 space-y-3" style={{ background: "rgba(168,85,247,0.04)" }}>
                    {/* Notice */}
                    <p className="text-[12px] leading-relaxed text-white/60 text-center">
                      Official payment channels will appear<br />during public funding activation.
                    </p>

                    {/* QR placeholders — side by side */}
                    <div className="grid grid-cols-2 gap-2.5 mt-1">
                      {(["GCash", "Maya"] as const).map((label) => (
                        <div key={label} className="flex flex-col items-center gap-2 rounded-[14px] p-3"
                             style={{ border: "1.5px dashed rgba(168,85,247,0.25)", background: "rgba(168,85,247,0.04)" }}>
                          {/* QR grid mockup */}
                          <div className="grid grid-cols-3 gap-0.5 opacity-20" aria-hidden>
                            {Array.from({ length: 9 }).map((_, i) => (
                              <div key={i} className="h-4 w-4 rounded-sm bg-purple-400"
                                   style={{ opacity: [0,2,4,6,8].includes(i) ? 1 : 0.4 }} />
                            ))}
                          </div>
                          <p className="text-[10px] font-bold text-purple-400">{label}</p>
                          <p className="text-[9.5px] text-white/35 text-center leading-tight">
                            QR code will be<br />added before launch
                          </p>
                        </div>
                      ))}
                    </div>

                    {/* Account number placeholder */}
                    <div className="flex items-center justify-between rounded-[12px] px-3.5 py-2.5"
                         style={{ background: "rgba(255,255,255,0.04)", border: "1px dashed rgba(255,255,255,0.1)" }}>
                      <div>
                        <p className="text-[9.5px] text-white/35">
                          {method === "gcash" ? "GCash" : "Maya"} number
                        </p>
                        <p className="font-mono text-[13px] font-bold text-white/25 tracking-widest mt-0.5">
                          ••••  ••••  ••••
                        </p>
                      </div>
                      <span className="rounded-lg px-2.5 py-1.5 text-[10px] font-semibold text-white/20"
                            style={{ background: "rgba(255,255,255,0.05)", cursor: "not-allowed" }}>
                        Copy
                      </span>
                    </div>
                  </div>
                </div>

                {/* Reference number */}
                <div>
                  <label className="mb-2 block text-[11px] font-semibold uppercase tracking-wider text-white/45">
                    Reference number *
                  </label>
                  <input
                    value={refNo}
                    onChange={(e) => setRefNo(e.target.value)}
                    placeholder="e.g. 2024123456789"
                    className="w-full rounded-[14px] bg-white/5 px-3.5 py-2.5 text-sm text-white placeholder-white/25 focus:outline-none"
                    style={{ border: "1px solid rgba(255,255,255,0.08)" }}
                  />
                  <p className="mt-1 text-[10px] text-white/30">Found in your GCash / Maya transaction history</p>
                </div>

                {/* Screenshot upload */}
                <div>
                  <label className="mb-2 block text-[11px] font-semibold uppercase tracking-wider text-white/45">
                    Payment screenshot (optional but recommended)
                  </label>
                  <button
                    onClick={() => fileRef.current?.click()}
                    disabled={uploading}
                    className="flex w-full items-center justify-center gap-2 rounded-[14px] py-3 text-[12px] font-semibold text-white/55"
                    style={{ border: "1px dashed rgba(168,85,247,0.3)", background: "rgba(168,85,247,0.05)" }}
                  >
                    {uploading
                      ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Uploading…</>
                      : screenshotUrl
                      ? <><CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> Screenshot uploaded</>
                      : <><Upload className="h-3.5 w-3.5" /> Tap to upload payment screenshot</>
                    }
                  </button>
                  <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
                </div>

                {/* Error */}
                {err && (
                  <div className="flex items-start gap-2 rounded-xl px-3 py-2.5 text-[12px] text-rose-300"
                       style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)" }}>
                    <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    {err}
                  </div>
                )}

                {/* Trust notices */}
                <div className="space-y-2">
                  <div className="flex items-start gap-2 rounded-[12px] px-3 py-2.5"
                       style={{ background: "rgba(34,197,94,0.07)", border: "1px solid rgba(34,197,94,0.15)" }}>
                    <Shield className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
                    <p className="text-[11px] leading-relaxed text-emerald-300/80">
                      Only admin-verified payments count toward the community funding goal.
                    </p>
                  </div>
                  <div className="flex items-start gap-2 rounded-[12px] px-3 py-2.5"
                       style={{ background: "rgba(251,191,36,0.07)", border: "1px solid rgba(251,191,36,0.15)" }}>
                    <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />
                    <p className="text-[11px] leading-relaxed text-amber-300/80">
                      Never send payments outside official Socia payment channels.
                    </p>
                  </div>
                </div>

                {/* Submit */}
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={handleSubmit}
                  disabled={busy || uploading}
                  className="w-full rounded-2xl py-3.5 text-[14px] font-bold text-white disabled:opacity-60"
                  style={{ background: "linear-gradient(135deg,#a855f7,#ec4899)", boxShadow: "0 8px 20px -6px rgba(168,85,247,0.5)" }}
                >
                  {busy
                    ? <Loader2 className="mx-auto h-4 w-4 animate-spin" />
                    : "Submit for Verification"}
                </motion.button>

                <button onClick={loadHistory}
                        className="w-full py-2 text-[11px] text-white/35 hover:text-white/55">
                  <Clock className="mr-1 inline h-3 w-3" /> View my past submissions
                </button>
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}

function StatusBadge({ status }: { status: MyDonation["status"] }) {
  return (
    <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${
      status === "approved" ? "bg-emerald-500/15 text-emerald-400" :
      status === "rejected" ? "bg-rose-500/15 text-rose-400" :
                              "bg-amber-500/15 text-amber-400"
    }`}>
      {status === "approved" ? "Approved" : status === "rejected" ? "Rejected" : "Pending"}
    </span>
  );
}
