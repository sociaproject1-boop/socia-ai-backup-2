/**
 * Billing dashboard — current plan, credits, smart-saver, cooldown,
 * pending/recent payments, ledger, and CTAs.
 *
 * All reads are RLS-protected (self-only). Live updates via realtime channels
 * on `user_billing` + `payment_orders`.
 */
import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import {
  ArrowLeft, Sparkles, Clock, ShieldCheck, Zap, Wallet, History,
  AlertTriangle, CheckCircle2, XCircle, Loader2, ArrowUpRight, Crown, Gauge,
  RotateCcw, ChevronDown, HelpCircle, MessageSquare,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/authContext";
import {
  fetchMyOrders, fetchMyLedger, useBillingStore, formatRemaining,
  type PaymentOrder, type LedgerEntry,
} from "@/lib/billing";
import { RefundModal } from "@/components/billing/RefundModal";
import { RefundStatusBadge } from "@/components/billing/RefundStatusBadge";
import { OrderRefundModal, type OrderRefundTarget } from "@/components/billing/OrderRefundModal";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
async function fetchMyRefunds(): Promise<RefundRow[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token ?? "";
    const res = await fetch(`${BASE}/api/refunds/my`, {
      credentials: "include",
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    });
    if (!res.ok) return [];
    const json = await res.json() as { requests?: RefundRow[] };
    return json.requests ?? [];
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}
interface RefundRow {
  id: string; order_id: string | null; subscription_type: string; plan_code: string;
  payment_amount_php: number; estimated_refundable_php: number;
  approved_amount_php: number | null; reason: string; status: string;
  admin_notes: string | null; created_at: string; updated_at: string;
}

export default function Billing() {
  const [, navigate] = useLocation();
  const { supabaseUser } = useAuth();
  const summary = useBillingStore((s) => s.summary);
  const refresh = useBillingStore((s) => s.forceRefresh);
  const [orders, setOrders]         = useState<PaymentOrder[]>([]);
  const [ledger, setLedger]         = useState<LedgerEntry[]>([]);
  const [loading, setLoading]       = useState(true);
  const [refundOpen,         setRefundOpen]         = useState(false);
  const [refunds,            setRefunds]            = useState<RefundRow[]>([]);
  const [orderRefundTarget,  setOrderRefundTarget]  = useState<OrderRefundTarget | null>(null);
  const [historyOpen,        setHistoryOpen]        = useState(false);

  useEffect(() => {
    if (!supabaseUser) return;
    let alive = true;

    const load = async () => {
      setLoading(true);
      try {
        const [o, l, r] = await Promise.all([fetchMyOrders(20), fetchMyLedger(50), fetchMyRefunds()]);
        if (!alive) return;
        setOrders(o);
        setLedger(l);
        setRefunds(r);
      } finally {
        if (alive) setLoading(false);
      }
      void refresh();
    };
    load();

    // Live updates
    const ch = supabase
      .channel(`billing:${supabaseUser.id}_${Date.now()}`)
      .on("postgres_changes",
          { event: "*", schema: "public", table: "user_billing", filter: `user_id=eq.${supabaseUser.id}` },
          () => { void refresh(); })
      .on("postgres_changes",
          { event: "*", schema: "public", table: "payment_orders", filter: `user_id=eq.${supabaseUser.id}` },
          () => { void load(); })
      .subscribe();
    return () => { alive = false; supabase.removeChannel(ch); };
  }, [supabaseUser, refresh]);

  const planLabel = useMemo(() => {
    if (!summary) return "—";
    if (summary.is_owner) return "King (Unlimited)";
    return summary.plan_code === "p15" ? "15-Day Plan"
         : summary.plan_code === "p30" ? "Monthly Plan" : "Free";
  }, [summary]);

  const pct = useMemo(() => {
    if (!summary || summary.is_owner) return 100;
    if (!summary.plan_credits) return 0;
    return Math.min(100, Math.max(0, (summary.credits / summary.plan_credits) * 100));
  }, [summary]);

  const cdMs = summary?.cooldown_until ? new Date(summary.cooldown_until).getTime() - Date.now() : 0;
  const onCooldown = cdMs > 0;

  return (
    <div className="app-bg min-h-[100dvh] pb-24">
      <div className="app-header sticky top-0 z-40 flex items-center gap-3 px-4 py-3">
        <button onClick={() => navigate("/")} className="rounded-full p-2 app-surface" aria-label="Back">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-lg font-bold app-text">Billing</h1>
        <div className="ml-auto flex gap-2">
          <button onClick={() => navigate("/billing/upgrade")}
                  className="rounded-full px-3 py-1.5 text-xs font-bold text-white"
                  style={{ background: "linear-gradient(135deg,#a855f7,#ec4899)" }}>
            Upgrade
          </button>
        </div>
      </div>

      <div className="px-4 pt-4 space-y-4">
        {/* ── Plan card ───────────────────────────────────────────── */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                    className="card-premium relative overflow-hidden rounded-3xl p-5">
          <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full opacity-20"
               style={{ background: "radial-gradient(circle, var(--accent-primary), transparent 70%)" }} />
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold app-text-muted uppercase tracking-wider">
                {summary?.is_owner ? <Crown className="h-3.5 w-3.5 text-amber-400" /> : <ShieldCheck className="h-3.5 w-3.5" />}
                Current Plan
              </div>
              <div className="mt-1 text-2xl font-extrabold app-text">{planLabel}</div>
              {!summary?.is_owner && summary?.plan_expires_at && (
                <div className="mt-1 text-xs app-text-muted flex items-center gap-1">
                  <Clock className="h-3 w-3" /> {formatRemaining(summary.plan_expires_at)} remaining
                </div>
              )}
            </div>
            <div className="text-right">
              <div className="text-[10px] app-text-muted uppercase tracking-wider">Credits</div>
              <div className="text-3xl font-black text-gradient">
                {summary?.is_owner ? "∞" : (summary?.credits ?? 0).toLocaleString()}
              </div>
              {!summary?.is_owner && summary && summary.plan_credits > 0 && (
                <div className="text-[11px] app-text-muted">of {summary.plan_credits.toLocaleString()}</div>
              )}
            </div>
          </div>

          {!summary?.is_owner && (
            <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-white/5">
              <div className="h-full rounded-full transition-all"
                   style={{ width: `${pct}%`, background: "linear-gradient(90deg, var(--accent-primary), var(--accent-secondary))" }} />
            </div>
          )}

          {summary?.smart_saver && !summary?.is_owner && (
            <div className="mt-3 flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-2.5 text-xs text-amber-200">
              <Gauge className="h-4 w-4" />
              <span><b>Smart saver mode</b> is active — generations use standard quality to stretch your credits further. Top up to restore HD.</span>
            </div>
          )}
          {onCooldown && (
            <div className="mt-3 flex items-center gap-2 rounded-xl border border-orange-500/30 bg-orange-500/10 p-2.5 text-xs text-orange-200">
              <Clock className="h-4 w-4" />
              <span>Brief fair-use cooldown: <b>{Math.ceil(cdMs / 60_000)} min</b> remaining.</span>
            </div>
          )}
        </motion.div>

        {/* ── Quick actions ─────────────────────────────────────────── */}
        <div className="grid grid-cols-1 gap-3">
          <ActionCard icon={Zap}    title="Upgrade plan"     subtitle="Unlock HD + video" onClick={() => navigate("/billing/upgrade")} />
        </div>

        {/* ── Payment history ─────────────────────────────────────── */}
        <Section title="Payment history" icon={History}>
          {loading ? (
            <div className="flex items-center gap-2 p-3 text-sm app-text-muted">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : orders.length === 0 ? (
            <div className="p-4 text-center text-sm app-text-muted">No payments yet.</div>
          ) : (
            <ul className="divide-y divide-white/5">
              {orders.map((o) => (
              <OrderRow
                key={o.id}
                o={o}
                refundStatus={refunds.find((r) => r.order_id === o.id)?.status ?? null}
                refundedPhp={refunds.find((r) => r.order_id === o.id)?.approved_amount_php ?? null}
                onRefund={() => {
                  const label = o.kind === "subscription"
                    ? (o.plan_code === "p15" ? "15-Day Plan" : o.plan_code === "p30" ? "Monthly Plan" : "Plan")
                    : (o.topup_code === "t300" ? "Top-up 300 cr" : o.topup_code === "t800" ? "Top-up 800 cr" : o.topup_code === "t2000" ? "Top-up 2000 cr" : "Top-up");
                  setOrderRefundTarget({ id: o.id, amount_php: o.amount_php, label, reference_no: o.reference_no });
                }}
              />
            ))}
            </ul>
          )}
        </Section>

        {/* ── Credit ledger ─────────────────────────────────────────── */}
        <Section title="Credit history" icon={Sparkles}>
          {ledger.length === 0 ? (
            <div className="p-4 text-center text-sm app-text-muted">No credit activity yet.</div>
          ) : (
            <ul className="divide-y divide-white/5 max-h-72 overflow-y-auto">
              {ledger.map((e) => (
                <li key={e.id} className="flex items-center justify-between px-3 py-2 text-sm">
                  <div className="min-w-0">
                    <div className="truncate app-text">{prettyReason(e.reason)}</div>
                    <div className="text-[10px] app-text-muted">{new Date(e.created_at).toLocaleString()}</div>
                  </div>
                  <div className={"font-bold " + (e.delta >= 0 ? "text-emerald-400" : "text-rose-400")}>
                    {e.delta >= 0 ? "+" : ""}{e.delta}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Section>

        {/* ── Billing support history (collapsible, hidden by default) ── */}
        {refunds.length > 0 && (
          <div className="card-premium rounded-2xl overflow-hidden">
            <button
              onClick={() => setHistoryOpen((v) => !v)}
              className="flex w-full items-center gap-2 px-4 pt-3 pb-3 hover:bg-white/[0.02] transition"
            >
              <RotateCcw className="h-3.5 w-3.5 app-text-muted" />
              <div className="text-[11px] font-bold uppercase tracking-wider app-text-muted flex-1 text-left">
                Billing support history
                <span className="ml-1.5 rounded-full bg-white/8 px-1.5 py-0.5 text-[9px] font-semibold">
                  {refunds.length}
                </span>
              </div>
              <ChevronDown className={`h-3.5 w-3.5 app-text-muted transition-transform ${historyOpen ? "rotate-180" : ""}`} />
            </button>
            {historyOpen && (
              <ul className="divide-y divide-white/5 border-t border-white/5">
                {refunds.map((r) => (
                  <li key={r.id} className="px-4 py-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[12px] font-medium app-text capitalize">
                            {r.order_id
                              ? "Payment issue"
                              : r.subscription_type === "ai" ? "AI Subscription" : "Creator Subscription"}
                            {!r.order_id && ` · ${r.plan_code.toUpperCase()}`}
                          </span>
                          <RefundStatusBadge
                            status={r.status as "pending"|"reviewing"|"approved"|"partial"|"rejected"}
                            approvedAmountPhp={r.approved_amount_php}
                          />
                        </div>
                        <div className="text-[10px] app-text-muted mt-0.5 capitalize">
                          {r.reason.replace(/_/g, " ")} · {new Date(r.created_at).toLocaleDateString()}
                        </div>
                        {r.admin_notes && (
                          <div className="text-[10.5px] text-amber-300/60 mt-1">Note: {r.admin_notes}</div>
                        )}
                      </div>
                      <div className="text-right shrink-0 flex flex-col items-end gap-1.5">
                        <div className="text-[10px] app-text-muted">Est. refund</div>
                        <div className="text-[12px] font-semibold app-text">
                          ₱{r.estimated_refundable_php.toLocaleString()}
                        </div>
                        <button
                          onClick={() => navigate(`/billing/refund/${r.id}`)}
                          className="flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] text-white/50 hover:text-white hover:border-white/20 transition"
                        >
                          <MessageSquare className="h-2.5 w-2.5" />
                          View thread
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="pt-4 text-center text-[11px] app-text-muted space-y-1.5">
          <div>
            Need help?{" "}
            <button className="underline" onClick={() => navigate("/messages")}>Contact support</button>
          </div>
          {!summary?.is_owner && summary?.plan_code && summary.plan_code !== "free" && (
            <div>
              <button
                className="text-white/25 hover:text-white/45 transition underline decoration-dotted"
                onClick={() => setRefundOpen(true)}
              >
                Billing issue with your subscription?
              </button>
            </div>
          )}
        </div>
      </div>

      <RefundModal
        open={refundOpen}
        onClose={() => setRefundOpen(false)}
        subscriptionType="creator"
      />

      <OrderRefundModal
        open={!!orderRefundTarget}
        order={orderRefundTarget}
        onClose={() => setOrderRefundTarget(null)}
        onSuccess={async () => {
          setOrderRefundTarget(null);
          const fresh = await fetchMyRefunds();
          setRefunds(fresh);
        }}
      />
    </div>
  );
}

function ActionCard({ icon: Icon, title, subtitle, onClick }: {
  icon: typeof Zap; title: string; subtitle: string; onClick: () => void;
}) {
  return (
    <button onClick={onClick} className="card-premium group relative overflow-hidden rounded-2xl p-4 text-left">
      <div className="grid h-9 w-9 place-items-center rounded-xl mb-2"
           style={{ background: "linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))" }}>
        <Icon className="h-4 w-4 text-white" />
      </div>
      <div className="font-bold app-text text-sm">{title}</div>
      <div className="text-[11px] app-text-muted">{subtitle}</div>
      <ArrowUpRight className="absolute right-3 top-3 h-4 w-4 app-text-muted group-hover:translate-x-0.5 transition" />
    </button>
  );
}

function Section({ title, icon: Icon, children }: { title: string; icon: typeof History; children: React.ReactNode }) {
  return (
    <div className="card-premium rounded-2xl overflow-hidden">
      <div className="flex items-center gap-2 px-4 pt-3 pb-2">
        <Icon className="h-3.5 w-3.5 app-text-muted" />
        <div className="text-[11px] font-bold uppercase tracking-wider app-text-muted">{title}</div>
      </div>
      {children}
    </div>
  );
}

function OrderRow({
  o, refundStatus, refundedPhp, onRefund,
}: {
  o: PaymentOrder;
  refundStatus: string | null;
  refundedPhp: number | null;
  onRefund: () => void;
}) {
  const StatusIcon = o.status === "approved"  ? <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                   : o.status === "rejected"  ? <XCircle      className="h-4 w-4 text-rose-400" />
                   : o.status === "pending"   ? <Clock        className="h-4 w-4 text-amber-400" />
                   :                            <AlertTriangle className="h-4 w-4 text-zinc-400" />;
  const label = o.kind === "subscription"
    ? (o.plan_code === "p15" ? "15-Day Plan" : o.plan_code === "p30" ? "Monthly Plan" : "Plan")
    : (o.topup_code === "t300" ? "Top-up 300 cr"
       : o.topup_code === "t800" ? "Top-up 800 cr"
       : o.topup_code === "t2000" ? "Top-up 2000 cr" : "Top-up");

  const WINDOW_MS   = 72 * 60 * 60 * 1000;
  const reviewedAt  = o.reviewed_at ? new Date(o.reviewed_at).getTime() : null;
  const withinWindow = reviewedAt != null && (Date.now() - reviewedAt) < WINDOW_MS;
  const canRefund   = o.status === "approved" && !refundStatus && withinWindow;

  return (
    <li className="flex items-center gap-0 border-b border-white/5 last:border-0">
      <div className="flex flex-1 items-center gap-3 px-3 py-2.5 text-left min-w-0">
        {StatusIcon}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="truncate text-sm font-semibold app-text">{label}</span>
            {refundStatus && (
              <RefundStatusBadge
                status={refundStatus as "pending"|"reviewing"|"approved"|"partial"|"rejected"}
                approvedAmountPhp={refundedPhp}
              />
            )}
          </div>
          <div className="text-[10px] app-text-muted">
            {new Date(o.created_at).toLocaleString()} • Ref {o.reference_no}
            {o.flagged && <span className="ml-1 text-amber-300"> • flagged ({o.flag_reason})</span>}
          </div>
          {o.status === "rejected" && o.rejection_reason && (
            <div className="text-[11px] text-rose-300 mt-0.5">Reason: {o.rejection_reason}</div>
          )}
        </div>
        <div className="text-sm font-bold app-text shrink-0">₱{o.amount_php}</div>
      </div>
      {canRefund && (
        <button
          onClick={(e) => { e.stopPropagation(); onRefund(); }}
          title="Need help with this payment?"
          className="mr-3 shrink-0 text-[10px] text-white/25 hover:text-white/50 transition flex items-center gap-1"
        >
          <HelpCircle className="h-3 w-3" />
          <span className="hidden sm:inline">Payment issue?</span>
        </button>
      )}
    </li>
  );
}

function PendingCallout({ orders, onOpen }: { orders: PaymentOrder[]; onOpen: (id: string) => void }) {
  const p = orders.find((o) => o.status === "pending")!;
  return (
    <div className="card-premium rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4">
      <div className="flex items-center gap-2 text-xs font-semibold text-amber-300">
        <Clock className="h-3.5 w-3.5" /> Pending admin review
      </div>
      <div className="mt-1 text-sm app-text">
        Your payment of <b>₱{p.amount_php}</b> is awaiting admin approval. This usually takes 1–6 hours during business hours.
      </div>
      <button onClick={() => onOpen(p.id)}
              className="mt-3 rounded-full bg-amber-500 px-3 py-1.5 text-xs font-bold text-black">
        View receipt
      </button>
    </div>
  );
}

function prettyReason(r: string): string {
  if (r.startsWith("spend:"))  return `Spent on ${r.slice(6).replace(/_/g, " ")}`;
  if (r.startsWith("refund:")) return `Refund (${r.slice(7).replace(/_/g, " ")})`;
  if (r.startsWith("grant:plan:")) return `Plan activated (${r.slice(11)})`;
  if (r.startsWith("grant:topup:")) return `Top-up applied (${r.slice(12)})`;
  if (r.startsWith("admin:"))  return `Admin adjustment — ${r.slice(6)}`;
  return r;
}
