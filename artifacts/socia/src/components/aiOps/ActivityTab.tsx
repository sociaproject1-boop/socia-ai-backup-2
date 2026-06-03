/** ActivityTab — live request feed from usage_receipts (#7). */
import {
  type ActivityItem,
  PROVIDER_LABELS, PROVIDER_ACCENT,
  fmtPhp, fmtTokens, fmtDuration, relTime,
} from "@/lib/aiOps";
import { Card, Tag, Hint, EmptyState } from "./shared";

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { c: string; bg: string }> = {
    success:   { c: "#a7f3d0", bg: "rgba(16,185,129,0.12)" },
    failed:    { c: "#fecaca", bg: "rgba(244,63,94,0.12)" },
    refunded:  { c: "#fde68a", bg: "rgba(245,158,11,0.12)" },
    moderated: { c: "#fbbf24", bg: "rgba(245,158,11,0.12)" },
  };
  const s = map[status] ?? { c: "var(--s-text)", bg: "rgba(255,255,255,0.06)" };
  return <Tag color={s.c} bg={s.bg}>{status}</Tag>;
}

export function ActivityTab({ items }: { items: ActivityItem[] }) {
  return (
    <Card>
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
          </span>
          <span className="text-sm font-bold app-text">Live activity</span>
        </div>
        <span className="text-[11px] app-text-muted">{items.length} most recent</span>
      </div>

      {items.length === 0 ? (
        <EmptyState>No requests recorded yet.</EmptyState>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="app-text-muted text-left">
                <th className="py-1 pr-3 font-semibold">When</th>
                <th className="py-1 pr-3 font-semibold">Feature</th>
                <th className="py-1 pr-3 font-semibold">Provider</th>
                <th className="py-1 pr-3 font-semibold">Model</th>
                <th className="py-1 pr-3 font-semibold">Status</th>
                <th className="py-1 pr-3 font-semibold text-right">Latency</th>
                <th className="py-1 pr-3 font-semibold text-right">Cost</th>
                <th className="py-1 pr-3 font-semibold text-right">Tokens</th>
                <th className="py-1 font-semibold">User</th>
              </tr>
            </thead>
            <tbody>
              {items.map((a) => (
                <tr key={a.id} className="border-t border-white/5">
                  <td className="py-1.5 pr-3 app-text-muted whitespace-nowrap">{relTime(a.createdAt)}</td>
                  <td className="py-1.5 pr-3 app-text font-medium whitespace-nowrap">{a.label}</td>
                  <td className="py-1.5 pr-3 whitespace-nowrap">
                    {a.provider ? (
                      <span className="inline-flex items-center gap-1">
                        <span className="h-1.5 w-1.5 rounded-full" style={{ background: PROVIDER_ACCENT[a.provider] }} />
                        {PROVIDER_LABELS[a.provider]}
                      </span>
                    ) : "—"}
                  </td>
                  <td className="py-1.5 pr-3 app-text-muted whitespace-nowrap">{a.model ?? "—"}</td>
                  <td className="py-1.5 pr-3"><StatusBadge status={a.status} /></td>
                  <td className="py-1.5 pr-3 text-right app-text-muted">{fmtDuration(a.durationMs)}</td>
                  <td className="py-1.5 pr-3 text-right app-text">{a.costPhp > 0 ? fmtPhp(a.costPhp) : "—"}</td>
                  <td className="py-1.5 pr-3 text-right app-text-muted">{a.tokens != null ? fmtTokens(a.tokens) : "—"}</td>
                  <td className="py-1.5 app-text-muted font-mono">{a.userRef}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-3"><Hint>User column is a non-reversible 8-char prefix of the account id — enough to spot patterns without exposing identities. Cost is owner-only.</Hint></div>
    </Card>
  );
}
