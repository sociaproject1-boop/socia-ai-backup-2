/** TokensTab — token analytics (chat / token-metered providers only) (#5). */
import { Cpu } from "lucide-react";
import {
  type AiOpsOverview, type WindowKey,
  PROVIDER_LABELS, PROVIDER_ACCENT,
  fmtTokens, windowLabel,
} from "@/lib/aiOps";
import { Card, StatTile, SectionTitle, RankBars, TrendChart, Hint, EmptyState } from "./shared";

export function TokensTab({ ov, win }: { ov: AiOpsOverview; win: WindowKey }) {
  const t = ov.totals[win];

  const byFeature = ov.features
    .filter((f) => f.tokenTracked)
    .map((f) => ({ label: f.label, value: f.windows[win].tokens.total }))
    .filter((i) => i.value > 0)
    .sort((a, b) => b.value - a.value);

  const byProvider = ov.providers
    .filter((p) => p.tokenMetered)
    .map((p) => ({ label: PROVIDER_LABELS[p.id], value: p.windows[win].tokens.total, accent: PROVIDER_ACCENT[p.id] }))
    .filter((i) => i.value > 0)
    .sort((a, b) => b.value - a.value);

  const ratio = t.tokens.total > 0 ? (t.tokens.output / t.tokens.total) : null;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label={`Total tokens · ${windowLabel(win)}`} value={fmtTokens(t.tokens.total)} accent="#a78bfa" />
        <StatTile label="Input (prompt)" value={fmtTokens(t.tokens.input)} />
        <StatTile label="Output (completion)" value={fmtTokens(t.tokens.output)} />
        <StatTile label="Output share" value={ratio != null ? `${(ratio * 100).toFixed(0)}%` : "—"} sub="of total tokens" />
      </div>

      <Card>
        <SectionTitle icon={<Cpu className="h-4 w-4" />} title="Tokens / day" hint="Last 30 days · chat only" />
        <TrendChart points={ov.series} valueKey="tokens" color="#a78bfa" height={88} />
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <SectionTitle title="Tokens by feature" hint={windowLabel(win)} />
          {byFeature.length ? <RankBars items={byFeature} format={fmtTokens} /> : <EmptyState>No token usage recorded in this window.</EmptyState>}
        </Card>
        <Card>
          <SectionTitle title="Tokens by provider" hint={windowLabel(win)} />
          {byProvider.length ? <RankBars items={byProvider} format={fmtTokens} /> : <EmptyState>No token usage recorded in this window.</EmptyState>}
        </Card>
      </div>

      <Hint>
        Token usage is recorded only where the provider returns a token count — currently SOCIA's chat
        (Grok / OpenAI). Image and video generation are billed per job and do not report tokens, so they are
        intentionally excluded here rather than shown as zero or estimated.
      </Hint>
    </div>
  );
}
