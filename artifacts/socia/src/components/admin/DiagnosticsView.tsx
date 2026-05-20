/**
 * Diagnostics View — live system health for the Command Center.
 *
 * Polls /admin/diagnostics/system every 5s. All values are real (no simulation).
 * Sections: Service Health, Render Queue, AI Activity, Realtime/Presence,
 * Process, Recent Activity Log.
 */
import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  HeartPulse, Database, Bot, Activity, Server, Cpu,
  CheckCircle2, XCircle, AlertCircle, RefreshCcw, Film, Users,
  ShieldCheck, Clock,
} from "lucide-react";
import { adminFetch } from "@/lib/adminAuth";

interface SystemSnapshot {
  ok: boolean;
  generated_at: string;
  duration_ms: number;
  services: {
    database: { ok: boolean; latency_ms: number; error: string | null };
    auth:     { ok: boolean; service_role_key: boolean };
    render:   {
      ok: boolean;
      queued: number; active: number; completed: number; failed: number; cancelled: number;
      avg_render_sec: number; failure_rate_pct: number;
    };
    realtime: { ok: boolean; online_now: number; total_users: number };
    ai:       { ok: boolean; replies_1h: number; replies_24h: number };
  };
  process: { uptime_s: number; memory_mb: number; node_version: string };
  errors: {
    count_1h: number;
    recent: Array<{ ts: string; severity: string; message: string; username?: string }>;
  };
}

function formatUptime(s: number): string {
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`;
  if (s < 86_400) return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
  return `${Math.floor(s / 86_400)}d ${Math.floor((s % 86_400) / 3600)}h`;
}

function StatusDot({ ok, warn }: { ok: boolean; warn?: boolean }) {
  const color = !ok ? "#ef4444" : warn ? "#f59e0b" : "#22c55e";
  return (
    <span className="relative inline-flex h-2 w-2">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60"
            style={{ background: color }} />
      <span className="relative inline-flex h-2 w-2 rounded-full" style={{ background: color }} />
    </span>
  );
}

function ServiceCard({
  icon: Icon, title, ok, warn, lines,
}: {
  icon: React.ElementType; title: string; ok: boolean; warn?: boolean;
  lines: Array<{ k: string; v: string | number; tone?: "good" | "warn" | "bad" }>;
}) {
  return (
    <div className={`rounded-xl border p-4 transition ${
      !ok ? "border-red-500/30 bg-red-500/[0.04]"
          : warn ? "border-yellow-500/25 bg-yellow-500/[0.04]"
                 : "border-emerald-500/20 bg-emerald-500/[0.03]"
    }`}>
      <div className="mb-3 flex items-center gap-2">
        <Icon className="h-4 w-4 text-white/70" />
        <p className="text-[12px] font-bold text-white">{title}</p>
        <div className="ml-auto"><StatusDot ok={ok} warn={warn} /></div>
      </div>
      <div className="space-y-1">
        {lines.map((l) => (
          <div key={l.k} className="flex items-center justify-between text-[11px]">
            <span className="text-white/40">{l.k}</span>
            <span className={
              l.tone === "bad"  ? "font-mono font-bold text-red-300"
            : l.tone === "warn" ? "font-mono font-bold text-yellow-300"
            : l.tone === "good" ? "font-mono font-bold text-emerald-300"
            :                     "font-mono font-semibold text-white/85"
            }>{l.v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function DiagnosticsView() {
  const [snap, setSnap]       = useState<SystemSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const aliveRef = useRef(true);

  const load = async (showSpinner = false) => {
    if (showSpinner) setRefreshing(true);
    try {
      const data = await adminFetch<SystemSnapshot>("/admin/diagnostics/system");
      if (!aliveRef.current) return;
      setSnap(data);
      setError(null);
    } catch (e) {
      if (!aliveRef.current) return;
      setError((e as Error).message);
    } finally {
      if (aliveRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  };

  useEffect(() => {
    aliveRef.current = true;
    load(false);
    const id = setInterval(() => load(false), 5_000);
    return () => { aliveRef.current = false; clearInterval(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading && !snap) {
    return (
      <div className="flex items-center justify-center py-24 text-white/40">
        <RefreshCcw className="mr-2 h-4 w-4 animate-spin" /> Loading diagnostics…
      </div>
    );
  }

  if (error && !snap) {
    return (
      <div className="rounded-xl border border-red-500/30 bg-red-500/[0.05] p-6 text-center">
        <XCircle className="mx-auto mb-2 h-8 w-8 text-red-400" />
        <p className="text-sm font-semibold text-red-300">Diagnostics unavailable</p>
        <p className="mt-1 text-xs text-white/40">{error}</p>
        <button onClick={() => load(true)}
          className="mt-3 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/70 hover:bg-white/10">
          Retry
        </button>
      </div>
    );
  }

  if (!snap) return null;

  const { services, process: proc, errors } = snap;
  const renderHealthy =
    services.render.ok && services.render.failure_rate_pct < 10;
  const renderWarn =
    services.render.failed > 0 || services.render.failure_rate_pct >= 5;
  const dbWarn = services.database.latency_ms > 500;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-base font-bold text-white">
            <HeartPulse className="h-5 w-5 text-rose-400" /> Live Diagnostics
          </h2>
          <p className="mt-0.5 text-xs text-white/40">
            Real-time system health · auto-refresh every 5s · snapshot in {snap.duration_ms}ms
          </p>
        </div>
        <button
          onClick={() => load(true)}
          disabled={refreshing}
          className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/70 transition hover:bg-white/10 disabled:opacity-50"
        >
          <RefreshCcw className={`h-3 w-3 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* Service health cards */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        <ServiceCard
          icon={Database} title="Database" ok={services.database.ok} warn={dbWarn}
          lines={[
            { k: "Status",  v: services.database.ok ? "connected" : "offline", tone: services.database.ok ? "good" : "bad" },
            { k: "Latency", v: `${services.database.latency_ms} ms`, tone: dbWarn ? "warn" : "good" },
            ...(services.database.error ? [{ k: "Error", v: services.database.error.slice(0, 40), tone: "bad" as const }] : []),
          ]}
        />
        <ServiceCard
          icon={ShieldCheck} title="Auth & Service Role" ok={services.auth.ok}
          lines={[
            { k: "Service role key", v: services.auth.service_role_key ? "configured" : "missing",
              tone: services.auth.service_role_key ? "good" : "bad" },
          ]}
        />
        <ServiceCard
          icon={Film} title="Render Queue" ok={renderHealthy} warn={renderWarn}
          lines={[
            { k: "Queued",       v: services.render.queued, tone: services.render.queued > 10 ? "warn" : undefined },
            { k: "Active",       v: services.render.active },
            { k: "Failed (24h)", v: services.render.failed, tone: services.render.failed > 0 ? "warn" : "good" },
            { k: "Avg time",     v: services.render.avg_render_sec > 0 ? `${services.render.avg_render_sec}s` : "—" },
            { k: "Failure rate", v: `${services.render.failure_rate_pct}%`,
              tone: services.render.failure_rate_pct >= 10 ? "bad" : services.render.failure_rate_pct >= 5 ? "warn" : "good" },
          ]}
        />
        <ServiceCard
          icon={Users} title="Realtime / Presence" ok={services.realtime.ok}
          lines={[
            { k: "Online now",   v: services.realtime.online_now, tone: "good" },
            { k: "Total users",  v: services.realtime.total_users },
          ]}
        />
        <ServiceCard
          icon={Bot} title="AI Activity" ok={services.ai.ok}
          lines={[
            { k: "Replies (1h)",  v: services.ai.replies_1h },
            { k: "Replies (24h)", v: services.ai.replies_24h },
          ]}
        />
        <ServiceCard
          icon={Server} title="API Server" ok={true}
          lines={[
            { k: "Uptime",   v: formatUptime(proc.uptime_s) },
            { k: "Memory",   v: `${proc.memory_mb} MB` },
            { k: "Node",     v: proc.node_version },
          ]}
        />
      </div>

      {/* Recent activity */}
      <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
        <div className="mb-3 flex items-center gap-2">
          <Activity className="h-4 w-4 text-purple-400" />
          <h3 className="text-[12px] font-bold text-white">Recent Admin Activity</h3>
          <span className="ml-auto text-[10px] text-white/35">
            {errors.count_1h} events in last hour
          </span>
        </div>
        {errors.recent.length === 0 ? (
          <p className="py-6 text-center text-xs text-white/30">No activity in the last hour</p>
        ) : (
          <div className="max-h-80 space-y-1 overflow-y-auto">
            {errors.recent.map((e, i) => (
              <motion.div
                key={`${e.ts}-${i}`}
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.02 }}
                className="flex items-center gap-3 rounded-lg border border-white/[0.04] bg-white/[0.02] px-3 py-2"
              >
                {e.severity === "error"
                  ? <AlertCircle className="h-3.5 w-3.5 shrink-0 text-red-400" />
                  : <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400/70" />
                }
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[11.5px] font-medium text-white/85">{e.message}</p>
                  {e.username && (
                    <p className="text-[10px] text-white/35">by {e.username}</p>
                  )}
                </div>
                <span className="flex items-center gap-1 text-[10px] text-white/30 shrink-0">
                  <Clock className="h-2.5 w-2.5" />
                  {new Date(e.ts).toLocaleTimeString()}
                </span>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <p className="text-center text-[10px] text-white/25">
        <Cpu className="mr-1 inline h-2.5 w-2.5" />
        Generated {new Date(snap.generated_at).toLocaleTimeString()} ·
        Auto-refresh in 5s
      </p>
    </div>
  );
}
