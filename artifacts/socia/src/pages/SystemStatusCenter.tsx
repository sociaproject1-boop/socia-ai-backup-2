/**
 * SystemStatusCenter — owner-only dashboard for the Payment Status Monitor.
 *
 * Shows the effective payment status, every monitored provider, the manual
 * maintenance/outage override controls, and the recent transition log. Updates
 * live via Socket.IO and a periodic re-fetch. Read-only for everyone except
 * the owner (enforced server-side on every endpoint).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import {
  ArrowLeft, RefreshCw, Wrench, AlertTriangle, ShieldCheck, Power, Clock,
} from "lucide-react";
import {
  fetchFullStatus,
  setMaintenanceOverride,
  clearMaintenanceOverride,
  refreshStatusNow,
  getStatusSocket,
  statusColor,
  statusLabel,
  SYSTEM_STATUS_CHANNEL,
  type FullStatus,
} from "@/lib/systemStatus";
import { StatusPill, ProviderRow, IncidentTimeline, relativeTime } from "@/components/status/statusUi";

export default function SystemStatusCenter() {
  const [, navigate] = useLocation();
  const [data, setData] = useState<FullStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [overrideMsg, setOverrideMsg] = useState("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try {
      const full = await fetchFullStatus();
      setData(full);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load status");
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

  const enableOverride = async (level: "MAINTENANCE" | "OUTAGE") => {
    setBusy(true);
    try { await setMaintenanceOverride(level, overrideMsg); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : "Override failed"); }
    finally { setBusy(false); }
  };

  const disableOverride = async () => {
    setBusy(true);
    try { await clearMaintenanceOverride(); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : "Clear failed"); }
    finally { setBusy(false); }
  };

  const pay = data?.payment;
  const ov = data?.override;
  const payColor = statusColor(pay?.status ?? "UNKNOWN");

  return (
    <div className="app-bg min-h-[100dvh] pb-24">
      <div className="app-header sticky top-0 z-40 flex items-center gap-3 px-4 py-3">
        <button onClick={() => navigate("/profile")} className="rounded-full p-2 app-surface" aria-label="Back">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-lg font-bold app-text flex-1">Payment Status Monitor</h1>
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

        {/* ── Effective payment status hero ───────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          className="card-premium rounded-3xl p-5"
          style={{ borderColor: payColor.border }}
        >
          <div className="flex items-center justify-between">
            <div className="text-[10px] font-bold uppercase tracking-widest app-text-muted">PayMongo · Effective Status</div>
            <StatusPill level={pay?.status ?? "UNKNOWN"} />
          </div>
          <div className="mt-2 text-2xl font-black" style={{ color: payColor.text }}>
            {statusLabel(pay?.status ?? "UNKNOWN")}
          </div>
          <div className="mt-1 text-sm app-text-muted">{pay?.message || "—"}</div>
          <div className="mt-3 flex items-center gap-2 text-xs">
            {pay?.checkoutDisabled ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/15 px-2 py-1 text-rose-200">
                <Power className="h-3 w-3" /> Checkout DISABLED for users
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-1 text-emerald-200">
                <ShieldCheck className="h-3 w-3" /> Checkout enabled
              </span>
            )}
          </div>
        </motion.div>

        {/* ── Manual override controls ─────────────────────────────────── */}
        <div className="card-premium rounded-3xl p-5">
          <div className="text-sm font-bold app-text mb-1">Manual override</div>
          <p className="text-xs app-text-muted mb-3">
            Force a maintenance or outage state for checkout regardless of automatic detection.
            Users see the banner instantly and the Pay buttons disable.
          </p>

          {ov?.active ? (
            <div
              className="rounded-2xl border px-3 py-3 mb-3"
              style={{ background: statusColor(ov.level).bg, borderColor: statusColor(ov.level).border }}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold" style={{ color: statusColor(ov.level).text }}>
                  Override active: {ov.level}
                </span>
                <button
                  onClick={disableOverride}
                  disabled={busy}
                  className="rounded-full bg-white/10 px-3 py-1 text-[11px] font-bold app-text disabled:opacity-40"
                >
                  Clear
                </button>
              </div>
              {ov.message && <div className="mt-1 text-xs app-text-muted">“{ov.message}”</div>}
              {ov.setAt && (
                <div className="mt-1 text-[10px] app-text-muted flex items-center gap-1">
                  <Clock className="h-3 w-3" /> set {relativeTime(ov.setAt)} {ov.setBy ? `by ${ov.setBy}` : ""}
                </div>
              )}
            </div>
          ) : (
            <div className="text-xs app-text-muted mb-3">No override active — status is automatic.</div>
          )}

          <input
            value={overrideMsg}
            onChange={(e) => setOverrideMsg(e.target.value)}
            placeholder="Optional message shown to users (e.g. 'Back at 3 PM')"
            className="w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-sm app-text placeholder:app-text-muted mb-3 outline-none focus:border-white/25"
            maxLength={300}
          />
          <div className="flex gap-2">
            <button
              onClick={() => enableOverride("MAINTENANCE")}
              disabled={busy}
              className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-2xl bg-orange-500/20 border border-orange-400/40 py-2.5 text-xs font-bold text-orange-100 disabled:opacity-40"
            >
              <Wrench className="h-3.5 w-3.5" /> Maintenance
            </button>
            <button
              onClick={() => enableOverride("OUTAGE")}
              disabled={busy}
              className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-2xl bg-rose-500/20 border border-rose-400/40 py-2.5 text-xs font-bold text-rose-100 disabled:opacity-40"
            >
              <AlertTriangle className="h-3.5 w-3.5" /> Outage
            </button>
          </div>
        </div>

        {/* ── All providers ────────────────────────────────────────────── */}
        <div className="card-premium rounded-3xl p-5">
          <div className="text-sm font-bold app-text mb-3">All monitored providers</div>
          <div className="space-y-2">
            {(data?.providers ?? []).map((p) => <ProviderRow key={p.id} p={p} />)}
            {!data && <div className="text-xs app-text-muted py-4 text-center">Loading…</div>}
          </div>
        </div>

        {/* ── Incident history ─────────────────────────────────────────── */}
        <div className="card-premium rounded-3xl p-5">
          <div className="text-sm font-bold app-text mb-1">Incident history</div>
          <p className="text-xs app-text-muted mb-3">
            Each outage or maintenance window per provider, with how long it lasted.
          </p>
          <IncidentTimeline incidents={data?.incidents ?? []} />
        </div>

        {/* ── Transition log ───────────────────────────────────────────── */}
        <div className="card-premium rounded-3xl p-5">
          <div className="text-sm font-bold app-text mb-3">Recent status changes</div>
          <div className="space-y-2">
            {(data?.log ?? []).length === 0 && (
              <div className="text-xs app-text-muted py-2">No transitions recorded yet.</div>
            )}
            {(data?.log ?? []).map((l, i) => (
              <div key={`${l.ts}-${i}`} className="flex items-start gap-2 text-xs">
                <span className="mt-0.5 h-2 w-2 flex-shrink-0 rounded-full" style={{ background: statusColor(l.to).dot }} />
                <div className="min-w-0">
                  <span className="app-text font-semibold">{l.label}</span>{" "}
                  <span className="app-text-muted">{l.from} → {l.to}</span>
                  <div className="app-text-muted truncate">{l.message}</div>
                  <div className="app-text-muted text-[10px]">{relativeTime(l.ts)} · {l.source}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
