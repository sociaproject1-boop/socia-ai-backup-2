/**
 * Global Model Routing Manager — the per-feature routing matrix.
 *
 * For every AI feature the owner controls: on/off, failover on/off, the ordered
 * provider→model fallback chain (priority reorder, enable/disable each hop,
 * assign ANY provider+model, add/remove hops), and the feature's spend caps.
 * Everything here writes to the live governance config consumed by the pipeline.
 */
import { ArrowDown, ArrowUp, Plus, X, GitBranch } from "lucide-react";
import {
  PROVIDER_LABELS, type ProviderId,
  type GovernanceConfig, type GovernancePayload, type ChainHop, type FeatureConfig,
} from "@/lib/aiGovernance";
import { Toggle, PhpField } from "./controls";

type Setter = (updater: (prev: GovernanceConfig) => GovernanceConfig) => void;

function updateFeature(
  draft: GovernanceConfig,
  tool: string,
  fn: (f: FeatureConfig) => FeatureConfig,
): GovernanceConfig {
  const current = draft.features[tool] ?? { enabled: true, failoverEnabled: true, chain: [] };
  return { ...draft, features: { ...draft.features, [tool]: fn(current) } };
}

export function RoutingTab({
  payload, draft, setDraft,
}: {
  payload: GovernancePayload;
  draft: GovernanceConfig;
  setDraft: Setter;
}) {
  const { topology } = payload;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
        <div className="flex items-center gap-2 text-sm font-bold app-text">
          <GitBranch className="h-4 w-4" /> Global Model Routing Manager
        </div>
        <p className="mt-1 text-[11px] app-text-muted">
          Order is priority. The first usable provider serves the request; if failover is on, the
          next enabled hop takes over automatically. A disabled hop is skipped. "Provider default"
          keeps the route's built-in model selection.
        </p>
      </div>

      {topology.features.map((feat) => {
        const fc = draft.features[feat.tool] ?? {
          enabled: true, failoverEnabled: true,
          chain: feat.defaultProviders.map((p) => ({ provider: p, model: null, enabled: true })),
        };
        const inChain = new Set(fc.chain.map((h) => h.provider));
        const addable = topology.providers.filter((p) => !inChain.has(p.id));
        const budget = draft.budgets.perFeature[feat.tool] ?? { dailyPhp: null, monthlyPhp: null };

        return (
          <div key={feat.tool} className="card-premium rounded-3xl p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-black app-text">{feat.label}</div>
                <div className="text-[11px] app-text-muted">{feat.description}</div>
                <code className="text-[10px] app-text-muted">{feat.endpoint}</code>
              </div>
              <div className="flex flex-col items-end gap-2">
                <label className="flex items-center gap-2 text-[11px] app-text-muted">
                  Feature
                  <Toggle on={fc.enabled} onChange={(v) =>
                    setDraft((d) => updateFeature(d, feat.tool, (f) => ({ ...f, enabled: v })))} />
                </label>
                <label className="flex items-center gap-2 text-[11px] app-text-muted">
                  Failover
                  <Toggle on={fc.failoverEnabled} onChange={(v) =>
                    setDraft((d) => updateFeature(d, feat.tool, (f) => ({ ...f, failoverEnabled: v })))} />
                </label>
              </div>
            </div>

            {/* Routing chain */}
            <div className={`mt-3 space-y-2 ${fc.enabled ? "" : "opacity-50"}`}>
              {fc.chain.map((hop, idx) => (
                <ChainRow
                  key={`${hop.provider}-${idx}`}
                  hop={hop}
                  idx={idx}
                  total={fc.chain.length}
                  models={topology.providers.find((p) => p.id === hop.provider)?.models ?? []}
                  onMove={(dir) => setDraft((d) => updateFeature(d, feat.tool, (f) => ({
                    ...f, chain: moveHop(f.chain, idx, dir),
                  })))}
                  onToggle={(v) => setDraft((d) => updateFeature(d, feat.tool, (f) => ({
                    ...f, chain: f.chain.map((h, i) => i === idx ? { ...h, enabled: v } : h),
                  })))}
                  onModel={(m) => setDraft((d) => updateFeature(d, feat.tool, (f) => ({
                    ...f, chain: f.chain.map((h, i) => i === idx ? { ...h, model: m } : h),
                  })))}
                  onRemove={() => setDraft((d) => updateFeature(d, feat.tool, (f) => ({
                    ...f, chain: f.chain.filter((_, i) => i !== idx),
                  })))}
                />
              ))}
              {fc.chain.length === 0 && (
                <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[11px] text-rose-200">
                  No providers assigned — this feature cannot run until you add one.
                </div>
              )}
            </div>

            {/* Add provider */}
            {addable.length > 0 && (
              <div className="mt-2">
                <select
                  value=""
                  onChange={(e) => {
                    const pid = e.target.value as ProviderId;
                    if (!pid) return;
                    setDraft((d) => updateFeature(d, feat.tool, (f) => ({
                      ...f, chain: [...f.chain, { provider: pid, model: null, enabled: true }],
                    })));
                  }}
                  className="inline-flex items-center gap-1 rounded-full bg-white/[0.06] px-3 py-1.5 text-[11px] font-bold app-text outline-none"
                >
                  <option value="">+ Add provider…</option>
                  {addable.map((p) => (
                    <option key={p.id} value={p.id}>{p.label}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Per-feature budget */}
            <div className="mt-4 grid grid-cols-2 gap-3 border-t border-white/10 pt-3">
              <PhpField label="Daily cap" value={budget.dailyPhp}
                onChange={(v) => setDraft((d) => setFeatureBudget(d, feat.tool, "dailyPhp", v))} />
              <PhpField label="Monthly cap" value={budget.monthlyPhp}
                onChange={(v) => setDraft((d) => setFeatureBudget(d, feat.tool, "monthlyPhp", v))} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ChainRow({
  hop, idx, total, models, onMove, onToggle, onModel, onRemove,
}: {
  hop: ChainHop;
  idx: number;
  total: number;
  models: string[];
  onMove: (dir: -1 | 1) => void;
  onToggle: (v: boolean) => void;
  onModel: (m: string | null) => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-center gap-2 rounded-2xl bg-white/[0.04] px-3 py-2">
      <span className="flex flex-col">
        <button type="button" disabled={idx === 0} onClick={() => onMove(-1)}
          className="app-text-muted hover:app-text disabled:opacity-20" aria-label="Move up">
          <ArrowUp className="h-3.5 w-3.5" />
        </button>
        <button type="button" disabled={idx === total - 1} onClick={() => onMove(1)}
          className="app-text-muted hover:app-text disabled:opacity-20" aria-label="Move down">
          <ArrowDown className="h-3.5 w-3.5" />
        </button>
      </span>
      <span className="w-5 text-center text-[11px] font-black app-text-muted">{idx + 1}</span>
      <div className="min-w-0 flex-1">
        <div className="text-xs font-bold app-text">{PROVIDER_LABELS[hop.provider] ?? hop.provider}</div>
        <select
          value={hop.model ?? ""}
          onChange={(e) => onModel(e.target.value === "" ? null : e.target.value)}
          className="mt-0.5 w-full bg-transparent text-[11px] app-text-muted outline-none"
        >
          <option value="">Provider default</option>
          {models.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>
      <Toggle on={hop.enabled} onChange={onToggle} />
      <button type="button" onClick={onRemove} className="app-text-muted hover:text-rose-300" aria-label="Remove">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

function moveHop(chain: ChainHop[], idx: number, dir: -1 | 1): ChainHop[] {
  const next = [...chain];
  const target = idx + dir;
  if (target < 0 || target >= next.length) return chain;
  [next[idx], next[target]] = [next[target]!, next[idx]!];
  return next;
}

function setFeatureBudget(
  draft: GovernanceConfig,
  tool: string,
  field: "dailyPhp" | "monthlyPhp",
  value: number | null,
): GovernanceConfig {
  const current = draft.budgets.perFeature[tool] ?? { dailyPhp: null, monthlyPhp: null };
  return {
    ...draft,
    budgets: {
      ...draft.budgets,
      perFeature: { ...draft.budgets.perFeature, [tool]: { ...current, [field]: value } },
    },
  };
}
