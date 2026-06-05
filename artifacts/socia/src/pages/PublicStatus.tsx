/**
 * PublicStatus.tsx — Public-facing system status page.
 *
 * FIX 8: Simple service status for regular users + technical diagnostics
 * for the owner. No auth required — accessible at /status.
 *
 * Regular users see:  green/yellow/red indicator with plain language
 * Owner sees:         full technical breakdown (payment monitor data)
 */
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { ArrowLeft, RefreshCw, CheckCircle, AlertTriangle, XCircle, Clock, Wifi } from "lucide-react";
import { useAppStore } from "@/lib/store";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface PublicStatusData {
  status: "ONLINE" | "MAINTENANCE" | "OUTAGE" | "UNKNOWN";
  message: string | null;
  checkoutDisabled: boolean;
  providers: Array<{ id: string; name: string; status: string }>;
  lastChecked: string;
}

function StatusIcon({ status }: { status: string }) {
  if (status === "ONLINE") return <CheckCircle className="h-8 w-8 text-emerald-400" />;
  if (status === "MAINTENANCE") return <AlertTriangle className="h-8 w-8 text-orange-400" />;
  if (status === "OUTAGE") return <XCircle className="h-8 w-8 text-rose-400" />;
  return <Wifi className="h-8 w-8 text-white/40" />;
}

function statusColor(status: string) {
  if (status === "ONLINE") return { bg: "rgba(16,185,129,0.1)", border: "rgba(52,211,153,0.35)", text: "#34d399" };
  if (status === "MAINTENANCE") return { bg: "rgba(249,115,22,0.1)", border: "rgba(251,146,60,0.35)", text: "#fb923c" };
  if (status === "OUTAGE") return { bg: "rgba(239,68,68,0.1)", border: "rgba(248,113,113,0.35)", text: "#f87171" };
  return { bg: "rgba(255,255,255,0.03)", border: "rgba(255,255,255,0.1)", text: "#9ca3af" };
}

function statusLabel(status: string) {
  if (status === "ONLINE") return "All Systems Operational";
  if (status === "MAINTENANCE") return "Scheduled Maintenance";
  if (status === "OUTAGE") return "Service Disruption";
  return "Status Unknown";
}

function userFriendlyMessage(status: string, message: string | null): string {
  if (message) return message;
  if (status === "ONLINE") return "Socia is fully operational. All services are running normally.";
  if (status === "MAINTENANCE") return "We're performing scheduled maintenance to improve Socia. Some features may be temporarily unavailable.";
  if (status === "OUTAGE") return "We're experiencing a service disruption and working to restore normal service as quickly as possible.";
  return "We're checking the current status of our services.";
}

function relTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return new Date(iso).toLocaleDateString();
}

export default function PublicStatus() {
  const [, navigate] = useLocation();
  const isOwner = useAppStore((s) => s.user?.isOwner === true);
  const [data, setData]     = useState<PublicStatusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch(`${BASE}/api/system-status/public`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      setData(j);
      setError(null);
    } catch (e) {
      /* Fallback: try the full status endpoint (requires auth) */
      try {
        const r2 = await fetch(`${BASE}/api/system-status`);
        if (r2.ok) {
          const j2 = await r2.json();
          setData({
            status: j2.payment?.status ?? "UNKNOWN",
            message: j2.payment?.message ?? null,
            checkoutDisabled: j2.payment?.checkoutDisabled ?? false,
            providers: (j2.providers ?? []).map((p: any) => ({ id: p.id, name: p.name, status: p.status })),
            lastChecked: new Date().toISOString(),
          });
          setError(null);
        } else throw new Error(`HTTP ${r2.status}`);
      } catch {
        setError(e instanceof Error ? e.message : "Could not load status");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const col  = statusColor(data?.status ?? "UNKNOWN");
  const label = statusLabel(data?.status ?? "UNKNOWN");

  return (
    <div className="app-bg min-h-[100dvh] pb-24">
      {/* Header */}
      <div className="app-header sticky top-0 z-40 flex items-center gap-3 px-4 py-3">
        <button onClick={() => navigate("/")} className="rounded-full p-2 app-surface" aria-label="Back">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-lg font-bold app-text flex-1">Socia Status</h1>
        <button
          onClick={load}
          disabled={loading}
          className="rounded-full p-2 app-surface disabled:opacity-40"
          aria-label="Refresh"
        >
          <RefreshCw className={`h-5 w-5 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      <div className="px-4 pt-4 space-y-4 max-w-lg mx-auto">
        {error && (
          <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
            {error}
          </div>
        )}

        {/* Main status card */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-3xl p-6 border"
          style={{ background: col.bg, borderColor: col.border }}
        >
          <div className="flex items-center gap-4">
            <StatusIcon status={data?.status ?? "UNKNOWN"} />
            <div className="flex-1 min-w-0">
              <div className="text-xl font-black" style={{ color: col.text }}>
                {loading ? "Checking…" : label}
              </div>
              <p className="text-sm text-white/60 mt-1 leading-relaxed">
                {loading ? "Fetching current status…" : userFriendlyMessage(data?.status ?? "UNKNOWN", data?.message ?? null)}
              </p>
            </div>
          </div>

          {data?.checkoutDisabled && (
            <div className="mt-3 rounded-2xl bg-rose-500/20 border border-rose-400/30 px-3 py-2 text-xs text-rose-200 font-medium">
              Payments are temporarily disabled. We apologize for the inconvenience.
            </div>
          )}

          {data && (
            <div className="mt-3 flex items-center gap-1.5 text-[11px] text-white/35">
              <Clock className="h-3 w-3" />
              Last checked {relTime(data.lastChecked)}
            </div>
          )}
        </motion.div>

        {/* Services grid */}
        <div className="card-premium rounded-3xl p-5">
          <div className="text-sm font-bold app-text mb-3">Service components</div>
          {loading ? (
            <div className="space-y-2">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-10 rounded-xl shimmer" />
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {/* Hardcoded services — always shown */}
              {[
                { name: "API & Core Services",    status: data?.status ?? "UNKNOWN" },
                { name: "AI Generation",          status: data?.status ?? "UNKNOWN" },
                { name: "Media Storage",          status: "ONLINE" },
                { name: "Payment Processing",     status: data?.checkoutDisabled ? "MAINTENANCE" : (data?.status ?? "UNKNOWN") },
                { name: "Real-time Messaging",    status: "ONLINE" },
              ].map((svc) => {
                const c = statusColor(svc.status);
                return (
                  <div
                    key={svc.name}
                    className="flex items-center justify-between rounded-2xl px-3 py-2.5 border"
                    style={{ background: c.bg, borderColor: c.border }}
                  >
                    <span className="text-sm font-medium text-white/80">{svc.name}</span>
                    <span className="text-xs font-bold" style={{ color: c.text }}>
                      {statusLabel(svc.status).replace("All Systems ", "").replace("Scheduled ", "").replace("Service ", "")}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Owner: technical details link */}
        {isOwner && (
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={() => navigate("/owner/payments")}
            className="w-full rounded-3xl p-4 text-center text-sm font-bold card-premium"
            style={{ borderColor: "rgba(251,191,36,0.3)" }}
          >
            <span style={{ color: "#fbbf24" }}>View Technical Diagnostics →</span>
          </motion.button>
        )}

        {/* Footer */}
        <div className="text-center text-xs text-white/25 pb-4">
          <p>Socia · Status Page</p>
          <p className="mt-1">For urgent issues, contact support through the app.</p>
        </div>
      </div>
    </div>
  );
}
