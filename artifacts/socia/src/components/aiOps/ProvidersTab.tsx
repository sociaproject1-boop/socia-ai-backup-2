/** ProvidersTab — provider → feature mapping + live config matrix (#1, #11). */
import { ExternalLink, KeyRound } from "lucide-react";
import {
  type AiOpsOverview, type WindowKey,
  PROVIDER_LABELS, PROVIDER_ACCENT,
  fmtInt, fmtPhp, fmtUsd, fmtTokens, windowLabel,
} from "@/lib/aiOps";
import { Card, StatTile, Tag, ConfigBadge, Hint, EmptyState } from "./shared";

export function ProvidersTab({ ov, win }: { ov: AiOpsOverview; win: WindowKey }) {
  return (
    <div className="space-y-4">
      <Hint>
        Provider → feature wiring is read from the engine registry (config truth). Request / cost / token
        figures are live from <code>usage_receipts</code> for {windowLabel(win).toLowerCase()}.
      </Hint>

      {ov.providers.map((p) => {
        const w = p.windows[win];
        const accent = PROVIDER_ACCENT[p.id];
        return (
          <Card key={p.id}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: accent }} />
                  <span className="text-sm font-bold app-text">{PROVIDER_LABELS[p.id]}</span>
                  <ConfigBadge configured={p.configured} />
                  {p.tokenMetered && <Tag color="#a78bfa" bg="rgba(167,139,250,0.12)">token-metered</Tag>}
                </div>
                <div className="mt-0.5 text-[11px] app-text-muted">{p.role}</div>
              </div>
              {p.dashboard && (
                <a href={p.dashboard} target="_blank" rel="noopener noreferrer"
                  className="inline-flex flex-shrink-0 items-center gap-1 rounded-full bg-white/[0.06] px-2.5 py-1 text-[11px] font-semibold app-text hover:bg-white/[0.12] transition">
                  Dashboard <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>

            <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatTile label="Requests" value={fmtInt(w.requests)} sub={`${fmtInt(w.failed)} failed`} />
              <StatTile label="Est. cost" value={fmtPhp(w.costPhp)} sub={fmtUsd(w.costUsd)} accent="#fbbf24" />
              <StatTile label="Tokens" value={p.tokenMetered ? fmtTokens(w.tokens.total) : "n/a"}
                sub={p.tokenMetered ? `${fmtTokens(w.tokens.input)} in` : "per-job billing"} accent="#a78bfa" />
              <StatTile label="Avg latency" value={w.avgDurationMs != null ? `${(w.avgDurationMs / 1000).toFixed(1)}s` : "—"} />
            </div>

            <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-3">
              <div>
                <div className="mb-1 flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest app-text-muted">
                  <KeyRound className="h-3 w-3" /> Required keys
                </div>
                <div className="flex flex-wrap gap-1">
                  {p.envVars.length ? p.envVars.map((e) => <Tag key={e}>{e}</Tag>) : <span className="text-[11px] app-text-muted">—</span>}
                </div>
              </div>
              <div>
                <div className="mb-1 text-[10px] font-bold uppercase tracking-widest app-text-muted">Models</div>
                <div className="flex flex-wrap gap-1">
                  {p.models.length ? p.models.map((m) => <Tag key={m}>{m}</Tag>) : <span className="text-[11px] app-text-muted">—</span>}
                </div>
              </div>
              <div>
                <div className="mb-1 text-[10px] font-bold uppercase tracking-widest app-text-muted">Powers features</div>
                <div className="flex flex-wrap gap-1">
                  {p.featuresUsing.length ? p.featuresUsing.map((f) => <Tag key={f} color={accent} bg="rgba(255,255,255,0.05)">{f}</Tag>) : <span className="text-[11px] app-text-muted">—</span>}
                </div>
              </div>
            </div>
          </Card>
        );
      })}

      {ov.unclassified && ov.unclassified.windows[win].requests > 0 && (
        <Card className="border border-amber-500/20">
          <div className="text-sm font-bold app-text">Unclassified usage</div>
          <Hint>
            {fmtInt(ov.unclassified.windows[win].requests)} request(s) in {windowLabel(win).toLowerCase()} could not be
            mapped to a known model/provider. Shown for honesty — not attributed to any provider above.
          </Hint>
        </Card>
      )}

      {ov.providers.length === 0 && <EmptyState>No providers registered.</EmptyState>}
    </div>
  );
}
