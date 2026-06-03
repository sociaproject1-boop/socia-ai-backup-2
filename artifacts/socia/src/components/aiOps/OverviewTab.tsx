/** OverviewTab — AI infrastructure summary + budget/token consumption at a glance. */
import { Activity, Coins, Cpu, TrendingUp } from "lucide-react";
import {
  type AiOpsOverview, type WindowKey,
  PROVIDER_LABELS, PROVIDER_ACCENT,
  fmtInt, fmtPhp, fmtUsd, fmtTokens, fmtPct, windowLabel,
} from "@/lib/aiOps";
import { Card, StatTile, SectionTitle, RankBars, TrendChart, Hint } from "./shared";

export function OverviewTab({ ov, win }: { ov: AiOpsOverview; win: WindowKey }) {
  const t = ov.totals[win];
  const configured = ov.providers.filter((p) => p.configured).length;

  const featureCost = ov.features
    .map((f) => ({ label: f.label, value: f.windows[win].costPhp }))
    .filter((i) => i.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 6);

  const providerCost = ov.providers
    .map((p) => ({ label: PROVIDER_LABELS[p.id], value: p.windows[win].costPhp, accent: PROVIDER_ACCENT[p.id] }))
    .filter((i) => i.value > 0)
    .sort((a, b) => b.value - a.value);

  const featureTokens = ov.features
    .map((f) => ({ label: f.label, value: f.windows[win].tokens.total }))
    .filter((i) => i.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 6);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label={`Requests · ${windowLabel(win)}`} value={fmtInt(t.requests)}
          sub={`${fmtInt(t.success)} ok · ${fmtInt(t.failed)} failed`} />
        <StatTile label="Success rate" value={fmtPct(t.successRate)}
          tone={t.successRate != null && t.successRate >= 0.95 ? "good" : t.successRate != null && t.successRate < 0.8 ? "bad" : undefined}
          sub={t.errorRate != null ? `${fmtPct(t.errorRate)} errors` : "—"} />
        <StatTile label="Est. infra cost" value={fmtPhp(t.costPhp)} sub={fmtUsd(t.costUsd)} accent="#fbbf24" />
        <StatTile label="Tokens (chat)" value={fmtTokens(t.tokens.total)}
          sub={`${fmtTokens(t.tokens.input)} in · ${fmtTokens(t.tokens.output)} out`} accent="#a78bfa" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <SectionTitle icon={<Activity className="h-4 w-4" />} title="Requests / day" hint="Last 30 days" />
          <TrendChart points={ov.series} valueKey="requests" color="#60a5fa" />
        </Card>
        <Card>
          <SectionTitle icon={<Coins className="h-4 w-4" />} title="Est. cost / day" hint="Last 30 days · ₱" />
          <TrendChart points={ov.series} valueKey="costPhp" color="#fbbf24" />
        </Card>
        <Card>
          <SectionTitle icon={<Cpu className="h-4 w-4" />} title="Tokens / day" hint="Last 30 days · chat only" />
          <TrendChart points={ov.series} valueKey="tokens" color="#a78bfa" />
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <SectionTitle icon={<TrendingUp className="h-4 w-4" />} title="Top budget consumers"
            hint={`Cost by feature · ${windowLabel(win)}`} />
          <RankBars items={featureCost} format={fmtPhp} />
        </Card>
        <Card>
          <SectionTitle icon={<Coins className="h-4 w-4" />} title="Cost by provider" hint={windowLabel(win)} />
          <RankBars items={providerCost} format={fmtPhp} />
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <SectionTitle icon={<Cpu className="h-4 w-4" />} title="Top token consumers"
            hint={`Total tokens by feature · ${windowLabel(win)}`} />
          <RankBars items={featureTokens} format={fmtTokens} />
          <div className="mt-3"><Hint>Tokens are metered for chat only. Image &amp; video are billed per job, not per token.</Hint></div>
        </Card>
        <Card>
          <SectionTitle title="Provider readiness" hint="Live key configuration" />
          <div className="grid grid-cols-2 gap-3">
            <StatTile label="Configured" value={`${configured}/${ov.providers.length}`} tone="good" />
            <StatTile label="Environment" value={ov.environment} />
          </div>
          <div className="mt-3"><Hint>Configured = required API key present in this environment. See the Providers tab for the full matrix.</Hint></div>
        </Card>
      </div>
    </div>
  );
}
