/**
 * Checkout flow: serves two URL shapes.
 *
 *   /billing/checkout/new?plan=p15      — fresh subscription order
 *   /billing/checkout/new?topup=t800    — fresh top-up order
 *   /billing/checkout/<orderId>         — view an existing order
 *
 * The flow:
 *   1. Show GCash / Maya / Bank instructions (admin-managed, real values).
 *   2. User uploads receipt + reference no.
 *   3. We hash the file (SHA-256), upload to private storage, then call
 *      submit_payment() RPC which inserts a pending payment_orders row.
 *   4. Existing orders show their current status + receipt + admin reason.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useParams, useSearch } from "wouter";
import { motion } from "framer-motion";
import {
  ArrowLeft, Copy, Upload, Loader2, CheckCircle2, XCircle, Info,
  AlertTriangle, Smartphone, CreditCard, Building2, Clock, X, Maximize2,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import {
  fetchPaymentSettings, fetchPlans, fetchTopups, submitPayment,
  uploadReceipt, fetchMyOrders, type PaymentSettings, type Plan,
  type TopupPackage, type PaymentOrder,
} from "@/lib/billing";

const FALLBACK_PLANS: Plan[] = [
  { code: "free", name: "Free",    price_php: 0,    credits: 0,    duration_days: 0,  hd_enabled: false, watermark: true,  is_active: true, sort: 0 },
  { code: "p15",  name: "15-Day",  price_php: 1200, credits: 1000, duration_days: 15, hd_enabled: true,  watermark: false, is_active: true, sort: 1 },
  { code: "p30",  name: "Monthly", price_php: 1700, credits: 2500, duration_days: 30, hd_enabled: true,  watermark: false, is_active: true, sort: 2 },
];
const FALLBACK_TOPUPS: TopupPackage[] = [
  { code: "t250",  label: "250 Credits",  credits: 250,  price_php: 200,  bonus_label: null,         is_active: true, sort: 0 },
  { code: "t800",  label: "800 Credits",  credits: 800,  price_php: 600,  bonus_label: "+50 bonus",  is_active: true, sort: 1 },
  { code: "t2000", label: "2000 Credits", credits: 2000, price_php: 1400, bonus_label: "+200 bonus", is_active: true, sort: 2 },
];

type Method = "gcash" | "maya" | "bank";

export default function BillingCheckout() {
  const [, navigate] = useLocation();
  const { id } = useParams<{ id: string }>();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const planCode  = params.get("plan");
  const topupCode = params.get("topup");
  const isNew = id === "new";

  const [pmc, setPmc]     = useState<PaymentSettings | null>(null);
  const [plans, setPlans] = useState<Plan[]>(FALLBACK_PLANS);
  const [tops, setTops]   = useState<TopupPackage[]>(FALLBACK_TOPUPS);
  const [order, setOrder] = useState<PaymentOrder | null>(null);
  const [method, setMethod] = useState<Method>("gcash");
  const [refNo, setRefNo]   = useState("");
  const [sender, setSender] = useState("");
  const [file, setFile]     = useState<File | null>(null);
  const [busy, setBusy]     = useState(false);
  const [err, setErr]       = useState<string | null>(null);
  const [loading, setLoading] = useState(!isNew);
  const fileRef = useRef<HTMLInputElement>(null);

  // Derive which payment methods are enabled from admin settings.
  // While pmc is still loading, show all three so tabs aren't empty.
  const enabledMethods = useMemo((): Method[] => {
    if (!pmc) return ["gcash", "maya", "bank"];
    const out: Method[] = [];
    if (pmc.gcash_enabled !== false) out.push("gcash");
    if (pmc.maya_enabled  !== false) out.push("maya");
    if (pmc.bank_enabled  !== false) out.push("bank");
    return out.length > 0 ? out : ["gcash", "maya", "bank"];
  }, [pmc]);

  // Auto-select the first enabled method once settings load.
  useEffect(() => {
    if (pmc && !enabledMethods.includes(method)) {
      setMethod(enabledMethods[0]);
    }
  }, [pmc, enabledMethods, method]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      /* Fetch everything in parallel — including the order lookup when
       * viewing an existing order.  Previously fetchMyOrders was called
       * sequentially AFTER the first allSettled batch, adding one extra RTT
       * on every existing-order view. */
      const [mRes, pRes, tRes, oRes] = await Promise.allSettled([
        fetchPaymentSettings(),
        fetchPlans(),
        fetchTopups(),
        isNew ? Promise.resolve([] as PaymentOrder[]) : fetchMyOrders(50),
      ]);
      if (cancelled) return;
      if (mRes.status === "fulfilled") setPmc(mRes.value);
      const loadedPlans = pRes.status === "fulfilled" ? pRes.value : [];
      setPlans(loadedPlans.length > 0 ? loadedPlans : FALLBACK_PLANS);
      const loadedTops = tRes.status === "fulfilled" ? tRes.value : [];
      setTops(loadedTops.length > 0 ? loadedTops : FALLBACK_TOPUPS);
      if (!isNew) {
        const all = oRes.status === "fulfilled" ? oRes.value : [];
        const o = (all as PaymentOrder[]).find((x) => x.id === id);
        setOrder(o ?? null);
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [id, isNew]);

  const item = useMemo(() => {
    if (!isNew && order) {
      if (order.kind === "subscription") {
        const p = plans.find((x) => x.code === order.plan_code);
        return { kind: "subscription" as const, label: p?.name ?? "Plan", amount: order.amount_php, credits: order.credits_to_grant };
      }
      const t = tops.find((x) => x.code === order.topup_code);
      return { kind: "topup" as const, label: t?.label ?? "Top-up", amount: order.amount_php, credits: order.credits_to_grant };
    }
    if (planCode) {
      const p = plans.find((x) => x.code === planCode);
      return p ? { kind: "subscription" as const, label: p.name, amount: p.price_php, credits: p.credits } : null;
    }
    if (topupCode) {
      const t = tops.find((x) => x.code === topupCode);
      return t ? { kind: "topup" as const, label: t.label, amount: t.price_php, credits: t.credits } : null;
    }
    return null;
  }, [isNew, order, plans, tops, planCode, topupCode]);

  const onSubmit = async () => {
    setErr(null);
    if (!item || !isNew) return;
    if (!refNo.trim() || refNo.trim().length < 4) { setErr("Please enter the reference number from your receipt (min 4 chars)."); return; }
    if (!file) { setErr("Please upload a screenshot of your payment receipt."); return; }
    if (file.size > 5 * 1024 * 1024) { setErr("Receipt image is too large (max 5 MB)."); return; }

    setBusy(true);
    try {
      const { path, sha256 } = await uploadReceipt(file);
      const r = await submitPayment({
        kind:           item.kind,
        plan_code:      item.kind === "subscription" ? (planCode as "p15" | "p30") : null,
        topup_code:     item.kind === "topup" ? topupCode : null,
        payment_method: method,
        reference_no:   refNo.trim(),
        sender_name:    sender.trim() || null,
        receipt_path:   path,
        receipt_sha256: sha256,
      });
      // Best-effort cleanup of orphaned upload if RPC throws — not needed on success.
      navigate(`/billing/checkout/${r.id}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Submission failed";
      setErr(msg);
    } finally {
      setBusy(false);
    }
  };

  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!order?.receipt_path) return;
    let alive = true;
    supabase.storage.from("payment-receipts")
      .createSignedUrl(order.receipt_path, 60 * 60)
      .then(({ data }) => { if (alive) setSignedUrl(data?.signedUrl ?? null); });
    return () => { alive = false; };
  }, [order?.receipt_path]);

  return (
    <div className="app-bg min-h-[100dvh] pb-24">
      <div className="app-header sticky top-0 z-40 flex items-center gap-3 px-4 py-3">
        <button onClick={() => navigate("/billing")} className="rounded-full p-2 app-surface" aria-label="Back">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-lg font-bold app-text">{isNew ? "Pay & upload receipt" : "Order"}</h1>
      </div>

      {loading ? (
        <div className="p-6 text-center text-sm app-text-muted">Loading…</div>
      ) : !item ? (
        <div className="p-6 text-center text-sm app-text-muted">
          Order not found. <button onClick={() => navigate("/billing/upgrade")} className="underline">Pick a plan</button>
        </div>
      ) : (
        <div className="px-4 pt-4 space-y-4">
          {/* ── Summary ─────────────────────────────────────────── */}
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                      className="card-premium rounded-2xl p-4 flex items-center justify-between">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-widest app-text-muted">{item.kind === "subscription" ? "Plan" : "Top-up"}</div>
              <div className="text-lg font-extrabold app-text">{item.label}</div>
              <div className="text-xs app-text-muted">{item.credits.toLocaleString()} credits</div>
            </div>
            <div className="text-right">
              <div className="text-3xl font-black text-gradient">₱{item.amount}</div>
            </div>
          </motion.div>

          {/* ── Existing order status ──────────────────────────── */}
          {!isNew && order && (
            <OrderStatusCard order={order} signedUrl={signedUrl} />
          )}

          {isNew && (
            <>
              {/* ── Method tabs ──────────────────────────────────── */}
              <div className="flex gap-2 rounded-2xl bg-white/5 p-1">
                {enabledMethods.map((m) => (
                  <button key={m} onClick={() => setMethod(m)}
                          className={`flex-1 rounded-xl py-2 text-xs font-bold capitalize ${method === m ? "text-white" : "app-text-muted"}`}
                          style={method === m ? { background: "linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))" } : {}}>
                    {m === "gcash" ? <Smartphone className="inline h-3.5 w-3.5 mr-1" />
                     : m === "maya" ? <CreditCard className="inline h-3.5 w-3.5 mr-1" />
                     : <Building2 className="inline h-3.5 w-3.5 mr-1" />}
                    {m === "bank" ? "Bank" : m.toUpperCase()}
                  </button>
                ))}
              </div>

              {/* ── Method details ─────────────────────────────── */}
              <PaymentDetails method={method} pmc={pmc} amount={item.amount} />

              {/* ── Submit form ─────────────────────────────────── */}
              <div className="card-premium rounded-2xl p-4 space-y-3">
                <div className="text-[11px] font-bold uppercase tracking-wider app-text-muted">Submit your payment</div>

                <div>
                  <label className="text-xs app-text-muted">Reference / transaction number *</label>
                  <input value={refNo} onChange={(e) => setRefNo(e.target.value)} maxLength={40}
                         placeholder="e.g. 1234567890123"
                         className="app-input mt-1 w-full rounded-xl px-3 py-2.5 text-sm" />
                </div>
                <div>
                  <label className="text-xs app-text-muted">Sender name (optional)</label>
                  <input value={sender} onChange={(e) => setSender(e.target.value)} maxLength={60}
                         placeholder="Name on the GCash / Maya account"
                         className="app-input mt-1 w-full rounded-xl px-3 py-2.5 text-sm" />
                </div>
                <div>
                  <label className="text-xs app-text-muted">Receipt screenshot * (PNG / JPG, &lt; 5 MB)</label>
                  <input ref={fileRef} type="file" accept="image/*"
                         onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="hidden" />
                  <button type="button" onClick={() => fileRef.current?.click()}
                          className="mt-1 w-full rounded-xl border border-dashed border-white/15 bg-white/5 px-3 py-3 text-sm app-text flex items-center gap-2 justify-center">
                    <Upload className="h-4 w-4" />
                    {file ? file.name : "Choose image"}
                  </button>
                </div>

                {err && (
                  <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-2.5 text-xs text-rose-200 flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" /> {err}
                  </div>
                )}

                <button onClick={onSubmit} disabled={busy}
                        className="w-full rounded-2xl py-3 text-sm font-bold text-white disabled:opacity-50"
                        style={{ background: "linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))" }}>
                  {busy ? <span className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />Submitting…</span>
                        : `Submit for verification (₱${item.amount})`}
                </button>

                <div className="flex items-center gap-1.5 text-[11px] app-text-muted">
                  <Info className="h-3 w-3" /> Approval typically takes 1–6 hours during business hours.
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function PaymentDetails({ method, pmc, amount }: { method: Method; pmc: PaymentSettings | null; amount: number }) {
  if (!pmc) return null;
  const [copied,  setCopied]  = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);

  const copy = (label: string, val: string) => {
    navigator.clipboard.writeText(val).then(() => { setCopied(label); setTimeout(() => setCopied(null), 1200); });
  };

  // Mask bank account number — only last 4 digits visible to the payer.
  // The admin sees the full number in the payment-settings panel.
  const maskAcct = (no: string | null): string => {
    if (!no) return "—";
    const cleaned = no.replace(/\s/g, "");
    if (cleaned.length <= 4) return cleaned;
    return "••••" + cleaned.slice(-4);
  };

  return (
    <>
      <div className="card-premium rounded-2xl p-4">
        <div className="text-[11px] font-bold uppercase tracking-wider app-text-muted mb-2">Payment instructions</div>
        <div className="rounded-xl bg-white/5 p-3 mb-3">
          <div className="text-xs app-text-muted">Send EXACTLY</div>
          <div className="flex items-center justify-between">
            <div className="text-2xl font-black text-gradient">₱{amount.toFixed(2)}</div>
            <button onClick={() => copy("amount", String(amount))}
                    className="rounded-full bg-white/10 px-2 py-1 text-[10px] font-bold app-text inline-flex items-center gap-1">
              <Copy className="h-3 w-3" /> {copied === "amount" ? "Copied" : "Copy"}
            </button>
          </div>
        </div>

        {method === "gcash" && (
          <>
            <Field label="GCash name"   value={pmc.gcash_name   ?? "—"} onCopy={(v) => copy("g_name", v)} copied={copied === "g_name"} />
            <Field label="GCash number" value={pmc.gcash_number ?? "—"} onCopy={(v) => copy("g_num",  v)} copied={copied === "g_num"} />
            {pmc.gcash_qr_url && <QrThumb url={pmc.gcash_qr_url} alt="GCash QR" onOpen={() => setLightbox(pmc.gcash_qr_url!)} />}
          </>
        )}
        {method === "maya" && (
          <>
            <Field label="Maya name"   value={pmc.maya_name   ?? "—"} onCopy={(v) => copy("m_name", v)} copied={copied === "m_name"} />
            <Field label="Maya number" value={pmc.maya_number ?? "—"} onCopy={(v) => copy("m_num",  v)} copied={copied === "m_num"} />
            {pmc.maya_qr_url && <QrThumb url={pmc.maya_qr_url} alt="Maya QR" onOpen={() => setLightbox(pmc.maya_qr_url!)} />}
          </>
        )}
        {method === "bank" && (
          <>
            <Field label="Bank"           value={pmc.bank_name         ?? "—"} onCopy={(v) => copy("b_name",  v)} copied={copied === "b_name"} />
            <Field label="Account name"   value={pmc.bank_account_name ?? "—"} onCopy={(v) => copy("b_acct",  v)} copied={copied === "b_acct"} />
            <Field label="Account number" value={maskAcct(pmc.bank_account_no)} onCopy={(v) => copy("b_no", v)} copied={copied === "b_no"} />
            {pmc.bank_qr_url && <QrThumb url={pmc.bank_qr_url} alt="Bank QR" onOpen={() => setLightbox(pmc.bank_qr_url!)} />}
          </>
        )}
        {pmc.notes && <p className="mt-3 text-[11px] app-text-muted">{pmc.notes}</p>}
      </div>

      {/* ── QR fullscreen lightbox ─────────────────────────────────── */}
      {lightbox && (
        <div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.93)", backdropFilter: "blur(8px)" }}
          onClick={() => setLightbox(null)}
        >
          <button
            onClick={() => setLightbox(null)}
            className="absolute right-4 top-4 grid h-11 w-11 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20"
            aria-label="Close QR viewer"
          >
            <X className="h-5 w-5" />
          </button>
          <img
            src={lightbox}
            alt="QR Code"
            className="max-h-[78dvh] max-w-[88vw] rounded-3xl bg-white p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
          <p className="mt-4 text-[11px] text-white/35">Scan with your phone camera · tap anywhere to close</p>
        </div>
      )}
    </>
  );
}

function QrThumb({ url, alt, onOpen }: { url: string; alt: string; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="relative mt-3 mx-auto block w-full group"
      aria-label={`Open ${alt} fullscreen for scanning`}
    >
      <img
        src={url}
        alt={alt}
        className="mx-auto max-h-52 rounded-2xl bg-white p-2 transition-opacity group-hover:opacity-75"
      />
      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
        <div className="rounded-full bg-black/65 p-2.5">
          <Maximize2 className="h-5 w-5 text-white" />
        </div>
      </div>
      <div className="mt-1.5 flex items-center justify-center gap-1 text-[10px] text-white/40">
        <Maximize2 className="h-3 w-3" /> Tap to enlarge for scanning
      </div>
    </button>
  );
}

function Field({ label, value, onCopy, copied }: { label: string; value: string; onCopy: (v: string) => void; copied: boolean }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-white/5 last:border-0">
      <div className="text-[11px] app-text-muted">{label}</div>
      <div className="flex items-center gap-2">
        <span className="text-sm font-mono app-text">{value}</span>
        <button onClick={() => onCopy(value)} className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold app-text">
          {copied ? "Copied" : <Copy className="h-3 w-3" />}
        </button>
      </div>
    </div>
  );
}

function OrderStatusCard({ order, signedUrl }: { order: PaymentOrder; signedUrl: string | null }) {
  const status = order.status;
  const statusLabel =
    status === "pending"  ? "Awaiting admin review"
    : status === "approved" ? "Approved"
    : status === "rejected" ? "Rejected"
    : "Expired";
  return (
    <div className="card-premium rounded-2xl p-4">
      <div className="flex items-center gap-2">
        {status === "approved"  && <CheckCircle2 className="h-5 w-5 text-emerald-400" />}
        {status === "rejected"  && <XCircle      className="h-5 w-5 text-rose-400" />}
        {/* Clock (not a spinner) — pending means waiting for a human, not loading */}
        {status === "pending"   && <Clock        className="h-5 w-5 text-amber-400" />}
        <div className="font-bold app-text">{statusLabel}</div>
        {order.flagged && <span className="ml-auto rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-300">Flagged</span>}
      </div>
      <div className="mt-2 text-xs app-text-muted">
        Submitted {new Date(order.created_at).toLocaleString()} • Ref {order.reference_no} • {order.payment_method.toUpperCase()}
      </div>
      {status === "rejected" && order.rejection_reason && (
        <div className="mt-2 rounded-xl border border-rose-500/30 bg-rose-500/10 p-2.5 text-xs text-rose-200">
          <b>Reason:</b> {order.rejection_reason}
        </div>
      )}
      {signedUrl && (
        <a href={signedUrl} target="_blank" rel="noreferrer" className="block mt-3">
          <img src={signedUrl} alt="Receipt" className="rounded-2xl max-h-80 w-full object-contain bg-black/40" />
        </a>
      )}
    </div>
  );
}
