/**
 * statusUi — small shared presentation pieces used by both owner dashboards
 * (SystemStatusCenter + AICommandCenter). Pure, stateless, theme-aware.
 */
import { ExternalLink } from "lucide-react";
import {
  statusColor,
  statusLabel,
  type ProviderHealth,
  type StatusLevel,
} from "@/lib/systemStatus";

/** Colored status chip. */
export function StatusPill({ level }: { level: StatusLevel }) {
  const c = statusColor(level);
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold"
      style={{ background: c.bg, color: c.text, border: `1px solid ${c.border}` }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: c.dot }} />
      {statusLabel(level)}
    </span>
  );
}

/** Human "x min ago" from an ISO timestamp. */
export function relativeTime(iso: string | null): string {
  if (!iso) return "never";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "—";
  const s = Math.floor((Date.now() - t) / 1000);
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

/** One provider line: status, label, latency, last-checked, config badge. */
export function ProviderRow({ p }: { p: ProviderHealth }) {
  const c = statusColor(p.status);
  return (
    <div className="flex items-center justify-between rounded-2xl bg-white/[0.03] px-3 py-2.5">
      <div className="flex items-center gap-2.5 min-w-0">
        <span className="h-2.5 w-2.5 flex-shrink-0 rounded-full" style={{ background: c.dot }} />
        <div className="min-w-0">
          <div className="text-sm font-semibold app-text truncate">{p.label}</div>
          <div className="text-[11px] app-text-muted truncate">{p.message}</div>
        </div>
      </div>
      <div className="text-right flex-shrink-0 pl-2">
        {!p.configured ? (
          <span className="text-[10px] app-text-muted">Not configured</span>
        ) : (
          <>
            <div className="text-[11px] font-bold" style={{ color: c.text }}>{statusLabel(p.status)}</div>
            <div className="text-[10px] app-text-muted">
              {p.responseMs != null ? `${p.responseMs}ms · ` : ""}{relativeTime(p.lastChecked)}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** Outbound link chip (dashboard / top up / usage / status page). */
export function LinkChip({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 rounded-full bg-white/[0.06] px-2.5 py-1 text-[11px] font-semibold app-text hover:bg-white/[0.12] transition"
    >
      {label} <ExternalLink className="h-3 w-3" />
    </a>
  );
}
