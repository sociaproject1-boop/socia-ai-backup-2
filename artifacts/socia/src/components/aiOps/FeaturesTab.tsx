/** FeaturesTab — connected feature details + per-model breakdown (#2). */
import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import {
  type AiOpsOverview, type FeatureOps, type WindowKey,
  PROVIDER_LABELS, PROVIDER_ACCENT,
  fmtInt, fmtPhp, fmtUsd, fmtTokens, fmtPct, fmtDuration, windowLabel,
} from "@/lib/aiOps";
import { Card, StatTile, Tag, Hint } from "./shared";

function FeatureCard({ f, win, environment }: { f: FeatureOps; win: WindowKey; environment: string }) {
  const [open, setOpen] = useState(false);
  const w = f.windows[win];
  const today = f.windows["24h"];
  const month = f.windows["30d"];

  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-bold app-text">{f.label}</span>
            {f.providers.map((p) => (
              <Tag key={p} color={PROVIDER_ACCENT[p]} bg="rgba(255,255,255,0.05)">{PROVIDER_LABELS[p]}</Tag>
            ))}
            <Tag>{environment}</Tag>
          </div>
          <div className="mt-0.5 text-[11px] app-text-muted">{f.description}</div>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] app-text-muted">
        <span>Endpoint: <code className="app-text">{f.endpoint}</code></span>
        <span>Today: <span className="app-text font-semibold">{fmtInt(today.requests)}</span> req</span>
        <span>30d: <span className="app-text font-semibold">{fmtInt(month.requests)}</span> req</span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label={`Requests · ${windowLabel(win)}`} value={fmtInt(w.requests)} sub={`${fmtInt(w.failed)} failed`} />
        <StatTile label="Success / error" value={fmtPct(w.successRate)}
          tone={w.successRate != null && w.successRate >= 0.95 ? "good" : w.successRate != null && w.successRate < 0.8 ? "bad" : undefined}
          sub={w.errorRate != null ? `${fmtPct(w.errorRate)} errors` : "—"} />
        <StatTile label="Avg response" value={fmtDuration(w.avgDurationMs)} />
        <StatTile label="Est. cost" value={fmtPhp(w.costPhp)} sub={fmtUsd(w.costUsd)} accent="#fbbf24" />
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px]">
        <span className="app-text-muted">Tokens: {f.tokenTracked ? (
          <span className="app-text font-semibold">{fmtTokens(w.tokens.total)} ({fmtTokens(w.tokens.input)} in / {fmtTokens(w.tokens.output)} out)</span>
        ) : <span className="app-text-muted">not token-metered (per-job billing)</span>}</span>
      </div>

      {f.models.length > 0 && (
        <button onClick={() => setOpen((v) => !v)}
          className="mt-3 inline-flex items-center gap-1 text-[11px] font-semibold app-text-muted hover:app-text transition">
          {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          {open ? "Hide" : "Show"} model breakdown ({f.models.length})
        </button>
      )}

      {open && (
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="app-text-muted text-left">
                <th className="py-1 pr-3 font-semibold">Model</th>
                <th className="py-1 pr-3 font-semibold">Provider</th>
                <th className="py-1 pr-3 font-semibold text-right">Req</th>
                <th className="py-1 pr-3 font-semibold text-right">Success</th>
                <th className="py-1 pr-3 font-semibold text-right">Avg</th>
                <th className="py-1 pr-3 font-semibold text-right">Cost</th>
                <th className="py-1 font-semibold text-right">Tokens</th>
              </tr>
            </thead>
            <tbody>
              {f.models.map((m) => {
                const mw = m.windows[win];
                return (
                  <tr key={m.model} className="border-t border-white/5">
                    <td className="py-1.5 pr-3 app-text font-medium">{m.model}</td>
                    <td className="py-1.5 pr-3">{m.provider ? PROVIDER_LABELS[m.provider] : "—"}</td>
                    <td className="py-1.5 pr-3 text-right app-text">{fmtInt(mw.requests)}</td>
                    <td className="py-1.5 pr-3 text-right">{fmtPct(mw.successRate)}</td>
                    <td className="py-1.5 pr-3 text-right">{fmtDuration(mw.avgDurationMs)}</td>
                    <td className="py-1.5 pr-3 text-right">{fmtPhp(mw.costPhp)}</td>
                    <td className="py-1.5 text-right">{f.tokenTracked ? fmtTokens(mw.tokens.total) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

export function FeaturesTab({ ov, win }: { ov: AiOpsOverview; win: WindowKey }) {
  return (
    <div className="space-y-4">
      <Hint>
        Each card maps a SOCIA feature to the provider(s) and model(s) it actually calls. Endpoint &amp;
        wiring are config truth; counts, latency, cost and tokens are live for the selected window.
      </Hint>
      {ov.features.map((f) => <FeatureCard key={f.tool} f={f} win={win} environment={ov.environment} />)}
    </div>
  );
}
