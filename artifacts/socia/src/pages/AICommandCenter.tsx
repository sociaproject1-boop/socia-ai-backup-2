/**
 * AICommandCenter — owner-only AI Operations Center.
 *
 * A tabbed, live observability dashboard for every AI provider & feature SOCIA
 * depends on. All metrics come from real data: usage_receipts (requests, cost,
 * tokens, latency, status) via /api/ai-ops/overview, and live provider health/
 * balances via /api/system-status/ai. Provider→feature wiring and failover are
 * config truth from the engine registry.
 *
 * Read-only. Never fabricates numbers — missing data renders as "—", and
 * un-metered dimensions (e.g. tokens for image/video) are labelled, not zeroed.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import {
  ArrowLeft, RefreshCw, Cpu, AlertTriangle, Activity, CheckCircle2, XCircle,
  LayoutDashboard, Boxes, Layers, Coins, GitBranch, HeartPulse, SlidersHorizontal, Plug,
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
import {
  fetchAiOpsOverview,
  type AiOpsOverview,
  type WindowKey,
} from "@/lib/aiOps";
import { StatusPill, LinkChip, IncidentTimeline, relativeTime } from "@/components/status/statusUi";
import { WindowToggle } from "@/components/aiOps/shared";
import { OverviewTab } from "@/components/aiOps/OverviewTab";
import { ProvidersTab } from "@/components/aiOps/ProvidersTab";
import { FeaturesTab } from "@/components/aiOps/FeaturesTab";
import { CostTab } from "@/components/aiOps/CostTab";
import { TokensTab } from "@/components/aiOps/TokensTab";
import { ActivityTab } from "@/components/aiOps/ActivityTab";
import { FlowTab } from "@/components/aiOps/FlowTab";
import { useGovernance } from "@/lib/aiGovernance";
import { RoutingTab } from "@/components/aiGovernance/RoutingTab";
import { ConnectionsTab } from "@/components/aiGovernance/ConnectionsTab";
import { SaveBar } from "@/components/aiGovernance/controls";

/** Low-balance threshold (USD) below which we surface an alert chip. */
const LOW_BALANCE_USD = 5;

type TabId =
  | "routing" | "connections"
  | "overview" | "providers" | "features" | "cost" | "tokens" | "activity" | "flow" | "health";

const TABS: { id: TabId; label: string; icon: typeof Activity; windowed: boolean }[] = [
  { id: "routing",     label: "Routing",     icon: SlidersHorizontal, windowed: false },
  { id: "connections", label: "Connections", icon: Plug,              windowed: false },
  { id: "overview",  label: "Overview",   icon: LayoutDashboard, windowed: true },
  { id: "providers", label: "Providers",  icon: Boxes,           windowed: true },
  { id: "features",  label: "Features",   icon: Layers,          windowed: true },
  { id: "cost",      label: "Cost",       icon: Coins,           windowed: true },
  { id: "tokens",    label: "Tokens",     icon: Cpu,             windowed: true },
  { id: "activity",  label: "Activity",   icon: Activity,        windowed: false },
  { id: "flow",      label: "Flow",       icon: GitBranch,       windowed: false },
  { id: "health",    label: "Health",     icon: HeartPulse,      windowed: false },
];

const GOV_TABS = new Set<TabId>(["routing", "connections"]);

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
  const [ov, setOv] = useState<AiOpsOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [opsError, setOpsError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<TabId>("routing");
  const gov = useGovernance();
  const [win, setWin] = useState<WindowKey>("24h");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const opsPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try {
      const ai = await fetchAIStatus();
      setData(ai);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load AI status");
    }
  }, []);

  const loadOps = useCallback(async () => {
    try {
      const o = await fetchAiOpsOverview();
      setOv(o);
      setOpsError(null);
    } catch (e) {
      setOpsError(e instanceof Error ? e.message : "Could not load AI operations data");
    }
  }, []);

  useEffect(() => {
    void load();
    void loadOps();
    const socket = getStatusSocket();
    const onStatus = () => { void load(); };
    socket.on(SYSTEM_STATUS_CHANNEL, onStatus);
    pollRef.current = setInterval(() => { void load(); }, 60_000);
    opsPollRef.current = setInterval(() => { void loadOps(); }, 30_000);
    return () => {
      socket.off(SYSTEM_STATUS_CHANNEL, onStatus);
      if (pollRef.current) clearInterval(pollRef.current);
      if (opsPollRef.current) clearInterval(opsPollRef.current);
    };
  }, [load, loadOps]);

  // Lazy-load governance config the first time a routing tab is opened.
  const govLoad = gov.load;
  const govReady = !!gov.payload;
  useEffect(() => {
    if (GOV_TABS.has(tab) && !govReady) void govLoad();
  }, [tab, govReady, govLoad]);

  const doRefresh = async () => {
    setBusy(true);
    try { await Promise.all([refreshStatusNow().then(load), loadOps()]); }
    catch (e) { setError(e instanceof Error ? e.message : "Refresh failed"); }
    finally { setBusy(false); }
  };

  const providers = data?.providers ?? [];
  const lowBalances = providers.filter(isLowBalance);
  const m = data?.metrics;
  const activeTab = TABS.find((t) => t.id === tab)!;

  return (
    <div className="app-bg min-h-[100dvh] pb-24">
      <div className="app-header sticky top-0 z-40">
        <div className="flex items-center gap-3 px-4 py-3">
          <button onClick={() => navigate("/profile")} className="rounded-full p-2 app-surface" aria-label="Back">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold app-text leading-tight">AI Operations Center</h1>
            <p className="text-[11px] app-text-muted truncate">
              Live · sourced from real usage {ov ? `· ${ov.environment}` : ""}
            </p>
          </div>
          {activeTab.windowed && (
            <WindowToggle value={win} onChange={setWin} keys={["24h", "7d", "30d"]} />
          )}
          <button onClick={doRefresh} disabled={busy}
            className="rounded-full p-2 app-surface disabled:opacity-40" aria-label="Refresh">
            <RefreshCw className={`h-5 w-5 ${busy ? "animate-spin" : ""}`} />
          </button>
        </div>

        {/* Tab nav */}
        <div className="flex gap-1 overflow-x-auto px-3 pb-2 no-scrollbar">
          {TABS.map((t) => {
            const Icon = t.icon;
            const on = t.id === tab;
            return (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`inline-flex flex-shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-bold transition ${
                  on ? "bg-white/[0.14] app-text" : "app-text-muted hover:app-text"
                }`}>
                <Icon className="h-3.5 w-3.5" /> {t.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="px-4 pt-4 space-y-4">
        {/* ── Routing platform (governance) tabs ─────────────────────── */}
        {GOV_TABS.has(tab) && (
          <>
            {gov.error && (
              <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
                {gov.error}
              </div>
            )}
            {!gov.payload && !gov.error && (
              <div className="py-16 text-center text-xs app-text-muted">Loading routing configuration…</div>
            )}
            {gov.payload && gov.draft && tab === "routing" && (
              <RoutingTab payload={gov.payload} draft={gov.draft} setDraft={gov.setDraft} />
            )}
            {gov.payload && gov.draft && tab === "connections" && (
              <ConnectionsTab
                payload={gov.payload}
                draft={gov.draft}
                setDraft={gov.setDraft}
                onKillSwitch={(on) => void gov.applyKillSwitch(on)}
              />
            )}
            {gov.payload && gov.draft && (
              <SaveBar
                dirty={gov.dirty}
                saving={gov.saving}
                savedAt={gov.savedAt}
                onSave={() => void gov.save()}
                onReset={gov.reset}
                errors={gov.errors}
                error={null}
              />
            )}
          </>
        )}

        {opsError && !GOV_TABS.has(tab) && tab !== "health" && (
          <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
            {opsError}
          </div>
        )}

        {ov?.truncated && !GOV_TABS.has(tab) && tab !== "health" && (
          <div className="rounded-xl border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
            Showing the most recent {ov.rowsRead.toLocaleString()} receipts in this 30-day window — older
            rows beyond this cap are not included in the totals below.
          </div>
        )}

        {/* Data-driven tabs */}
        {!GOV_TABS.has(tab) && tab !== "health" && !ov && !opsError && (
          <div className="py-16 text-center text-xs app-text-muted">Loading live operations data…</div>
        )}
        {ov && tab === "overview"  && <OverviewTab ov={ov} win={win} />}
        {ov && tab === "providers" && <ProvidersTab ov={ov} win={win} />}
        {ov && tab === "features"  && <FeaturesTab ov={ov} win={win} />}
        {ov && tab === "cost"      && <CostTab ov={ov} win={win} />}
        {ov && tab === "tokens"    && <TokensTab ov={ov} win={win} />}
        {ov && tab === "activity"  && <ActivityTab items={ov.activity} />}
        {ov && tab === "flow"      && <FlowTab ov={ov} />}

        {/* Health tab — live provider health, balances & internal services */}
        {tab === "health" && (
          <div className="space-y-4">
            {error && (
              <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
                {error}
              </div>
            )}

            {lowBalances.length > 0 && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                className="rounded-3xl border border-amber-400/40 bg-amber-500/10 p-4">
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

            <div className="card-premium rounded-3xl p-5">
              <div className="flex items-center gap-2 mb-1">
                <AlertTriangle className="h-4 w-4 app-text-muted" />
                <span className="text-sm font-bold app-text">Incident history</span>
              </div>
              <p className="text-xs app-text-muted mb-3">
                Recent AI-provider outages and degradations, with how long each lasted.
              </p>
              <IncidentTimeline incidents={data?.incidents ?? []} />
            </div>

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
