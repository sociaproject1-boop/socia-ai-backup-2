/**
 * Admin dashboard — pending payments queue + approve/reject actions.
 *
 * Access is double-gated:
 *   1. Client checks `is_owner` OR `admins` row (public-self-read).
 *   2. Every RPC (admin_list_orders / approve_payment / reject_payment /
 *      admin_adjust_credits / update_payment_methods) re-checks via is_admin()
 *      inside the SECURITY DEFINER function. Bypassing the client guard is
 *      pointless.
 */
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import {
  ArrowLeft, ShieldAlert, Loader2, CheckCircle2, XCircle, Eye, Filter,
  RefreshCw, AlertTriangle, ExternalLink, Settings as SettingsIcon, Save,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/authContext";
import {
  adminListOrders, adminApprove, adminReject, fetchAmIAdmin,
  fetchPaymentMethods, type PaymentOrder, type PaymentMethodsConfig,
} from "@/lib/billing";

type Tab = "pending" | "approved" | "rejected";

export default function Admin() {
  const [, navigate] = useLocation();
  const { supabaseUser } = useAuth();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [tab, setTab] = useState<Tab>("pending");
  const [orders, setOrders] = useState<PaymentOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    (async () => {
      if (!supabaseUser) { setAllowed(false); return; }
      const { data: u } = await supabase.from("users").select("is_owner").eq("id", supabaseUser.id).maybeSingle();
      const a = u?.is_owner ? true : await fetchAmIAdmin();
      setAllowed(a);
    })();
  }, [supabaseUser]);

  const reload = async () => {
    setLoading(true);
    try { setOrders(await adminListOrders(tab, 100)); }
    catch (e) { console.warn("admin list failed:", e); setOrders([]); }
    finally   { setLoading(false); }
  };
  useEffect(() => { if (allowed) void reload(); /* eslint-disable-next-line */ }, [allowed, tab]);

  // Live updates
  useEffect(() => {
    if (!allowed) return;
    const ch = supabase
      .channel(`admin:${Date.now()}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "payment_orders" }, () => { void reload(); })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line
  }, [allowed, tab]);

  if (allowed === null) {
    return <div className="app-bg flex h-[100dvh] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin app-text-muted" /></div>;
  }
  if (!allowed) {
    return (
      <div className="app-bg flex h-[100dvh] items-center justify-center px-6">
        <div className="text-center">
          <ShieldAlert className="mx-auto h-10 w-10 text-rose-400" />
          <div className="mt-3 text-lg font-bold app-text">Admin only</div>
          <div className="mt-1 text-sm app-text-muted">You don't have access to this page.</div>
          <button onClick={() => navigate("/")} className="mt-4 rounded-full bg-white/10 px-4 py-2 text-sm app-text">Go home</button>
        </div>
      </div>
    );
  }

  const pendingCount = orders.filter((o) => o.status === "pending").length;

  return (
    <div className="app-bg min-h-[100dvh] pb-24">
      <div className="app-header sticky top-0 z-40 flex items-center gap-3 px-4 py-3">
        <button onClick={() => navigate("/")} className="rounded-full p-2 app-surface" aria-label="Back">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-lg font-bold app-text">Admin</h1>
        <div className="ml-auto flex gap-1">
          <button onClick={() => setShowSettings(true)} className="rounded-full p-2 app-surface" title="Payment methods">
            <SettingsIcon className="h-4 w-4" />
          </button>
          <button onClick={reload} className="rounded-full p-2 app-surface" title="Reload">
            <RefreshCw className={"h-4 w-4 " + (loading ? "animate-spin" : "")} />
          </button>
        </div>
      </div>

      <div className="px-4 pt-3">
        <div className="flex gap-2 rounded-2xl bg-white/5 p-1">
          {(["pending", "approved", "rejected"] as Tab[]).map((t) => (
            <button key={t} onClick={() => setTab(t)}
                    className={`flex-1 rounded-xl py-2 text-xs font-bold capitalize ${tab === t ? "text-white" : "app-text-muted"}`}
                    style={tab === t ? { background: "linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))" } : {}}>
              {t}
              {t === "pending" && tab !== "pending" && pendingCount > 0 && (
                <span className="ml-1 inline-block rounded-full bg-amber-500 px-1.5 text-[9px] text-black">{pendingCount}</span>
              )}
            </button>
          ))}
        </div>

        <div className="mt-4 space-y-2">
          {loading && <div className="flex items-center justify-center gap-2 py-8 text-sm app-text-muted"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>}
          {!loading && orders.length === 0 && <div className="py-10 text-center text-sm app-text-muted">No {tab} orders.</div>}
          {orders.map((o) => <AdminOrderCard key={o.id} order={o} onChange={reload} />)}
        </div>
      </div>

      {showSettings && <PaymentMethodsSheet onClose={() => setShowSettings(false)} />}
    </div>
  );
}

function AdminOrderCard({ order, onChange }: { order: PaymentOrder; onChange: () => void }) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const [reason, setReason] = useState("");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open || !order.receipt_path) return;
    let alive = true;
    supabase.storage.from("payment-receipts").createSignedUrl(order.receipt_path, 60 * 30)
      .then(({ data }) => { if (alive) setSignedUrl(data?.signedUrl ?? null); });
    return () => { alive = false; };
  }, [open, order.receipt_path]);

  const approve = async () => {
    setBusy("approve");
    try { await adminApprove(order.id); onChange(); }
    catch (e) { alert(e instanceof Error ? e.message : "Failed"); }
    finally   { setBusy(null); }
  };
  const reject = async () => {
    if (reason.trim().length < 3) { alert("Please write a rejection reason (min 3 chars)."); return; }
    setBusy("reject");
    try { await adminReject(order.id, reason.trim()); onChange(); }
    catch (e) { alert(e instanceof Error ? e.message : "Failed"); }
    finally   { setBusy(null); }
  };

  const label = order.kind === "subscription"
    ? (order.plan_code === "p15" ? "15-Day Plan" : order.plan_code === "p30" ? "Monthly Plan" : "Plan")
    : `Top-up ${order.credits_to_grant} cr`;

  return (
    <motion.div layout className="card-premium rounded-2xl p-3">
      <button className="flex w-full items-start gap-3 text-left" onClick={() => setOpen(!open)}>
        <div className="grid h-9 w-9 place-items-center rounded-xl bg-white/5">
          {order.status === "pending"  ? <Loader2      className="h-4 w-4 animate-spin text-amber-400" />
           : order.status === "approved" ? <CheckCircle2 className="h-4 w-4 text-emerald-400" />
           : <XCircle className="h-4 w-4 text-rose-400" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-sm font-bold app-text">
            {label}
            {order.flagged && <span className="rounded-full bg-amber-500/20 px-1.5 py-0.5 text-[9px] font-bold text-amber-300 inline-flex items-center gap-0.5">
              <AlertTriangle className="h-2.5 w-2.5" /> {order.flag_reason}
            </span>}
          </div>
          <div className="text-[11px] app-text-muted truncate">
            {(order.display_name || order.username || order.email || order.user_id.slice(0, 8))} • Ref {order.reference_no} • {order.payment_method.toUpperCase()}
          </div>
          <div className="text-[10px] app-text-muted">{new Date(order.created_at).toLocaleString()}</div>
        </div>
        <div className="text-right">
          <div className="text-lg font-black app-text">₱{order.amount_php}</div>
          <div className="text-[10px] app-text-muted">+{order.credits_to_grant} cr</div>
        </div>
      </button>

      {open && (
        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
                    className="mt-3 space-y-3 border-t border-white/5 pt-3">
          {signedUrl ? (
            <a href={signedUrl} target="_blank" rel="noreferrer" className="block">
              <img src={signedUrl} alt="Receipt" className="rounded-xl max-h-72 w-full object-contain bg-black/40" />
              <div className="mt-1 text-[10px] app-text-muted flex items-center gap-1"><ExternalLink className="h-3 w-3" /> Open full</div>
            </a>
          ) : <div className="text-xs app-text-muted">Loading receipt…</div>}

          {order.sender_name && <div className="text-xs app-text-muted">Sender: <span className="app-text font-mono">{order.sender_name}</span></div>}

          {order.status === "pending" && (
            <div className="space-y-2">
              <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200}
                     placeholder="Rejection reason (required if rejecting)"
                     className="app-input w-full rounded-xl px-3 py-2 text-sm" />
              <div className="flex gap-2">
                <button onClick={approve} disabled={busy !== null}
                        className="flex-1 rounded-xl bg-emerald-500 py-2 text-sm font-bold text-black disabled:opacity-50 inline-flex items-center justify-center gap-1.5">
                  {busy === "approve" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  Approve
                </button>
                <button onClick={reject} disabled={busy !== null}
                        className="flex-1 rounded-xl bg-rose-500 py-2 text-sm font-bold text-white disabled:opacity-50 inline-flex items-center justify-center gap-1.5">
                  {busy === "reject" ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                  Reject
                </button>
              </div>
            </div>
          )}
          {order.status === "rejected" && order.rejection_reason && (
            <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-2 text-xs text-rose-200">
              Reason: {order.rejection_reason}
            </div>
          )}
        </motion.div>
      )}
    </motion.div>
  );
}

function PaymentMethodsSheet({ onClose }: { onClose: () => void }) {
  const [pmc, setPmc] = useState<PaymentMethodsConfig | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { fetchPaymentMethods().then(setPmc).catch(() => setPmc(null)); }, []);

  const save = async () => {
    if (!pmc) return;
    setBusy(true); setErr(null);
    try {
      const { error } = await supabase.rpc("update_payment_methods", {
        p_gcash_name: pmc.gcash_name, p_gcash_number: pmc.gcash_number, p_gcash_qr_url: pmc.gcash_qr_url,
        p_maya_name:  pmc.maya_name,  p_maya_number:  pmc.maya_number,  p_maya_qr_url:  pmc.maya_qr_url,
        p_bank_name:  pmc.bank_name,  p_bank_account_name: pmc.bank_account_name, p_bank_account_no: pmc.bank_account_no,
        p_notes:      pmc.notes,
      });
      if (error) throw error;
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed");
    } finally { setBusy(false); }
  };

  if (!pmc) return null;
  const set = (k: keyof PaymentMethodsConfig, v: string) => setPmc({ ...pmc, [k]: v });
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/80" onClick={onClose}>
      <motion.div initial={{ y: 50 }} animate={{ y: 0 }} className="app-bg w-full max-w-lg rounded-t-3xl p-4 max-h-[90vh] overflow-y-auto"
                  onClick={(e) => e.stopPropagation()}>
        <div className="text-lg font-bold app-text mb-2">Payment methods</div>
        <p className="text-xs app-text-muted mb-3">Edited values are visible to ALL users on the checkout page. Use a real number you actually monitor.</p>
        {([
          ["GCash name",          "gcash_name"],
          ["GCash number",        "gcash_number"],
          ["GCash QR image URL",  "gcash_qr_url"],
          ["Maya name",           "maya_name"],
          ["Maya number",         "maya_number"],
          ["Maya QR image URL",   "maya_qr_url"],
          ["Bank name",           "bank_name"],
          ["Bank account name",   "bank_account_name"],
          ["Bank account number", "bank_account_no"],
          ["Notes",               "notes"],
        ] as Array<[string, keyof PaymentMethodsConfig]>).map(([label, key]) => (
          <div key={key} className="mb-2">
            <label className="text-[11px] app-text-muted">{label}</label>
            <input value={(pmc[key] as string) ?? ""} onChange={(e) => set(key, e.target.value)}
                   className="app-input mt-0.5 w-full rounded-xl px-3 py-2 text-sm" />
          </div>
        ))}
        {err && <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-2 text-xs text-rose-200 mb-2">{err}</div>}
        <div className="flex gap-2 sticky bottom-0 pt-2 bg-[var(--s-bg)]">
          <button onClick={onClose} className="flex-1 rounded-xl bg-white/10 py-2 text-sm font-bold app-text">Cancel</button>
          <button onClick={save} disabled={busy}
                  className="flex-1 rounded-xl py-2 text-sm font-bold text-white disabled:opacity-50 inline-flex items-center justify-center gap-1.5"
                  style={{ background: "linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))" }}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save
          </button>
        </div>
      </motion.div>
    </div>
  );
}
