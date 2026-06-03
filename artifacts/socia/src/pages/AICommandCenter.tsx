/**
 * AICommandCenter — owner-only dashboard monitoring every AI provider Socia
 * depends on: live health, balances/spend (only where the provider exposes
 * them — otherwise shown honestly as "not exposed"), generation metrics from
 * our own render jobs, low-balance alerts, top-up + dashboard links.
 *
 * Read-only. Never fabricates numbers — missing data renders as "—".
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import {
  ArrowLeft, RefreshCw, Cpu, AlertTriangle, Activity, CheckCircle2, XCircle,
} from "lucide-react";
import {
  fetchAIStatus,
  refreshStatusNow,
  getStatusSocket,
  statusColor,
  SYSTEM_STATUS_CHANNEL,
  type AIStatus,
  type ProviderHealth,
} from "@/lib/systemStatus";
import { StatusPill, LinkChip, relativeTime } from "@/components/status/statusUi";

/** Low-balance threshold (USD) below which we surface an alert chip. */
const LOW_BALANCE_USD = 5;

function formatMoney(b: ProviderHealth["balance"]): string {
  if (!b || !b.supported) return "—";
  if (b.amount == null) return b.note || "—";
  const cur = b.currency || "USD";
  return `${cur === "USD" ? "$" : cur + " "}${b.amount.toFixed(2)}`;
}

function isLowBalance(p: ProviderHealth): boolean {
  const b = p.balance;
  return !!b && b.supported && b.amount != null && b.currency === "USD" && b.amount < LOW_BALANCE_USD;
}

export default function AICommandCenter() {
  const [, navigate] = useLocation();
  const [data, setData] = useState<AIStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try {
      const ai = await fetchAIStatus();
      setData(ai);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load AI status");
    }
  }, []);

  useEffect(() => {
    load();
    const socket = getStatusSocket();
    const onStatus = () => { void load(); };
    socket.on(SYSTEM_STATUS_CHANNEL, onStatus);
    pollRef.current = setInterval(() => { void load(); }, 60_000);
    return () => {
      socket.off(SYSTEM_STATUS_CHANNEL, onStatus);
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [load]);

  const doRefresh = async () => {
    setBusy(true);
    try { await refreshStatusNow(); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : "Refresh failed"); }
    finally { setBusy(false); }
  };

  const providers = data?.providers ?? [];
  const lowBalances = providers.filter(isLowBalance);
  const m = data?.metrics;

  return (
    <div className="app-bg min-h-[100dvh] pb-24">
      <div className="app-header sticky top-0 z-40 flex items-center gap-3 px-4 py-3">
        <button onClick={() => navigate("/profile")} className="rounded-full p-2 app-surface" aria-label="Back">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-lg font-bold app-text flex-1">AI Command Center</h1>
        <button
          onClick={doRefresh}
          disabled={busy}
          className="rounded-full p-2 app-surface disabled:opacity-40"
          aria-label="Refresh"
        >
          <RefreshCw className={`h-5 w-5 ${busy ? "animate-spin" : ""}`} />
        </button>
      </div>

      <div className="px-4 pt-4 space-y-4">
        {error && (
          <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
            {error}
          </div>
        )}

        {/* ── Low-balance alerts ───────────────────────────────────────── */}
        {lowBalances.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            className="rounded-3xl border border-amber-400/40 bg-amber-500/10 p-4"
          >
            <div className="flex items-center gap-2 text-sm font-bold text-amber-100">
              <AlertTriangle className="h-4 w-4" /> Low balance
            </div>
            <div className="mt-2 space-y-1.5">
              {lowBalances.map((p) => (
                <div key={p.id} className="flex items-center justify-between text-xs">
                  <span className="app-text">{p.label}</span>
                  <span className="font-bold text-amber-200">{formatMoney(p.balance)}</span>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* ── Generation metrics (from our own render jobs) ────────────── */}
        <div className="card-premium rounded-3xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <Activity className="h-4 w-4 app-text-muted" />
            <span className="text-sm font-bold app-text">Generation activity · last 24h</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Metric label="Jobs" value={m?.renderJobs24h} />
            <Metric label="Active now" value={m?.renderActive} />
            <Metric label="Succeeded" value={m?.renderSucceeded24h} tone="good" />
            <Metric label="Failed" value={m?.renderFailed24h} tone="bad" />
          </div>
          <div className="mt-3 flex items-center justify-between rounded-2xl bg-white/[0.03] px-3 py-2.5">
            <span className="text-xs app-text-muted">Success rate</span>
            <span className="text-sm font-black app-text">
              {m?.successRate != null ? `${Math.round(m.successRate * 100)}%` : "—"}
            </span>
          </div>
          {m?.computedAt && (
            <div className="mt-2 text-[10px] app-text-muted text-right">updated {relativeTime(m.computedAt)}</div>
          )}
        </div>

        {/* ── Providers ────────────────────────────────────────────────── */}
        <div className="card-premium rounded-3xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <Cpu className="h-4 w-4 app-text-muted" />
            <span className="text-sm font-bold app-text">AI providers</span>
          </div>
          <div className="space-y-2.5">
            {providers.map((p) => <AIProviderCard key={p.id} p={p} />)}
            {providers.length === 0 && (
              <div className="text-xs app-text-muted py-4 text-center">Loading providers…</div>
            )}
          </div>
        </div>

        {/* ── Service health (internal dependencies) ───────────────────── */}
        {(data?.serviceHealth?.length ?? 0) > 0 && (
          <div className="card-premium rounded-3xl p-5">
            <div className="text-sm font-bold app-text mb-3">Service health</div>
            <div className="space-y-2">
              {data!.serviceHealth.map((p) => (
                <div key={p.id} className="flex items-center justify-between rounded-2xl bg-white/[0.03] px-3 py-2.5">
                  <div className="flex items-center gap-2 min-w-0">
                    {p.status === "ONLINE"
                      ? <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-emerald-400" />
                      : <XCircle className="h-4 w-4 flex-shrink-0 text-rose-400" />}
                    <div className="min-w-0">
                      <div className="text-sm font-semibold app-text truncate">{p.label}</div>
                      <div className="text-[11px] app-text-muted truncate">{p.message}</div>
                    </div>
                  </div>
                  <StatusPill level={p.status} />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: number | null | undefined; tone?: "good" | "bad" }) {
  const color = tone === "good" ? "#a7f3d0" : tone === "bad" ? "#fecaca" : "var(--s-text)";
  return (
    <div className="rounded-2xl bg-white/[0.03] px-3 py-3">
      <div className="text-[10px] font-bold uppercase tracking-widest app-text-muted">{label}</div>
      <div className="mt-1 text-xl font-black" style={{ color }}>
        {value == null ? "—" : value}
      </div>
    </div>
  );
}

function AIProviderCard({ p }: { p: ProviderHealth }) {
  const c = statusColor(p.status);
  const low = isLowBalance(p);
  return (
    <div className="rounded-2xl border bg-white/[0.02] p-3.5" style={{ borderColor: c.border }}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="h-2.5 w-2.5 flex-shrink-0 rounded-full" style={{ background: c.dot }} />
          <div className="min-w-0">
            <div className="text-sm font-bold app-text truncate">{p.label}</div>
            <div className="text-[11px] app-text-muted truncate">{p.message}</div>
          </div>
        </div>
        <StatusPill level={p.status} />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
        <div className="rounded-xl bg-white/[0.03] px-2.5 py-2">
          <div className="app-text-muted">Balance / credit</div>
          <div className={`mt-0.5 font-bold ${low ? "text-amber-300" : "app-text"}`}>
            {formatMoney(p.balance)}
          </div>
          {p.balance && !p.balance.supported && (
            <div className="text-[10px] app-text-muted">not exposed by API</div>
          )}
        </div>
        <div className="rounded-xl bg-white/[0.03] px-2.5 py-2">
          <div className="app-text-muted">Latency</div>
          <div className="mt-0.5 font-bold app-text">
            {p.responseMs != null ? `${p.responseMs}ms` : "—"}
          </div>
          <div className="text-[10px] app-text-muted">{relativeTime(p.lastChecked)}</div>
        </div>
      </div>

      {!p.configured && (
        <div className="mt-2 text-[11px] text-amber-300/90">No API key configured.</div>
      )}

      {p.links && (p.links.dashboard || p.links.topUp || p.links.usage) && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {p.links.dashboard && <LinkChip href={p.links.dashboard} label="Dashboard" />}
          {p.links.topUp && <LinkChip href={p.links.topUp} label="Top up" />}
          {p.links.usage && <LinkChip href={p.links.usage} label="Usage" />}
        </div>
      )}
    </div>
  );
}
