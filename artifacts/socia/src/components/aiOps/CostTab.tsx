/** CostTab — cost explorer across 24h/7d/30d windows (#4). */
import { Coins } from "lucide-react";
import {
  type AiOpsOverview, type WindowKey,
  PROVIDER_LABELS, PROVIDER_ACCENT,
  fmtInt, fmtPhp, fmtUsd, windowLabel,
} from "@/lib/aiOps";
import { Card, StatTile, SectionTitle, RankBars, TrendChart, Hint, EmptyState } from "./shared";

export function CostTab({ ov, win }: { ov: AiOpsOverview; win: WindowKey }) {
  const t = ov.totals[win];
  const costPerReq = t.success > 0 ? t.costPhp / t.success : null;

  const byFeature = ov.features
    .map((f) => ({ label: f.label, value: f.windows[win].costPhp }))
    .filter((i) => i.value > 0)
    .sort((a, b) => b.value - a.value);

  const byProvider = ov.providers
    .map((p) => ({ label: PROVIDER_LABELS[p.id], value: p.windows[win].costPhp, accent: PROVIDER_ACCENT[p.id] }))
    .filter((i) => i.value > 0)
    .sort((a, b) => b.value - a.value);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label={`Est. cost · ${windowLabel(win)}`} value={fmtPhp(t.costPhp)} sub={fmtUsd(t.costUsd)} accent="#fbbf24" />
        <StatTile label="Cost / successful req" value={fmtPhp(costPerReq)} sub={costPerReq != null ? fmtUsd(costPerReq / ov.phpPerUsd) : "—"} />
        <StatTile label="Billable requests" value={fmtInt(t.success)} sub={`${fmtInt(t.failed)} failed (no charge)`} />
        <StatTile label="Refunded" value={fmtInt(t.refunded)} sub="auto-refunded failures" />
      </div>

      <Card>
        <SectionTitle icon={<Coins className="h-4 w-4" />} title="Est. cost / day" hint="Last 30 days · ₱ (success only)" />
        <TrendChart points={ov.series} valueKey="costPhp" color="#fbbf24" height={88} />
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <SectionTitle title="Cost by feature" hint={windowLabel(win)} />
          {byFeature.length ? <RankBars items={byFeature} format={fmtPhp} /> : <EmptyState>No cost recorded in this window.</EmptyState>}
        </Card>
        <Card>
          <SectionTitle title="Cost by provider" hint={windowLabel(win)} />
          {byProvider.length ? <RankBars items={byProvider} format={fmtPhp} /> : <EmptyState>No cost recorded in this window.</EmptyState>}
        </Card>
      </div>

      <Card>
        <SectionTitle title="Cost ledger by feature" hint={`${windowLabel(win)} · success-only spend`} />
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="app-text-muted text-left">
                <th className="py-1 pr-3 font-semibold">Feature</th>
                <th className="py-1 pr-3 font-semibold text-right">Billable req</th>
                <th className="py-1 pr-3 font-semibold text-right">Cost ₱</th>
                <th className="py-1 pr-3 font-semibold text-right">≈ $</th>
                <th className="py-1 font-semibold text-right">₱ / req</th>
              </tr>
            </thead>
            <tbody>
              {ov.features.map((f) => {
                const w = f.windows[win];
                const cpr = w.success > 0 ? w.costPhp / w.success : null;
                return (
                  <tr key={f.tool} className="border-t border-white/5">
                    <td className="py-1.5 pr-3 app-text font-medium">{f.label}</td>
                    <td className="py-1.5 pr-3 text-right app-text">{fmtInt(w.success)}</td>
                    <td className="py-1.5 pr-3 text-right app-text">{fmtPhp(w.costPhp)}</td>
                    <td className="py-1.5 pr-3 text-right app-text-muted">{fmtUsd(w.costUsd)}</td>
                    <td className="py-1.5 text-right app-text-muted">{fmtPhp(cpr)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Hint>
        Costs are internal ₱ estimates recorded per receipt (PHP_PER_USD = {ov.phpPerUsd}); they reflect SOCIA's
        modelled provider pricing, not a live invoice. Failed requests are not charged. Provider account balances
        are on the Health tab.
      </Hint>
    </div>
  );
}
