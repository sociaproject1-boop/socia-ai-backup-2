/**
 * Provider Connection Editor + global enforcement controls.
 *
 * Top: the emergency kill switch (immediate), auto-pause / auto-throttle, and
 * the global daily/monthly spend caps. Below: one card per provider with its
 * real connection status (env-var presence from the server), enable/disable,
 * per-model enable/disable, a per-provider spend cap, and a dashboard link.
 * Honest throughout — never invents a "connected" state.
 */
import { ShieldAlert, Power, ExternalLink, Boxes } from "lucide-react";
import {
  PROVIDER_ACCENT, type GovernanceConfig, type GovernancePayload, type BudgetCap,
} from "@/lib/aiGovernance";
import { Toggle, PhpField, StatusDot } from "./controls";

type Setter = (updater: (prev: GovernanceConfig) => GovernanceConfig) => void;

export function ConnectionsTab({
  payload, draft, setDraft, onKillSwitch,
}: {
  payload: GovernancePayload;
  draft: GovernanceConfig;
  setDraft: Setter;
  onKillSwitch: (on: boolean) => void;
}) {
  const { topology } = payload;

  return (
    <div className="space-y-4">
      {/* Emergency kill switch — applied immediately, not part of the draft. */}
      <div className={`rounded-3xl border p-4 ${
        draft.killSwitch ? "border-rose-500/50 bg-rose-500/10" : "border-white/10 bg-white/[0.03]"
      }`}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <ShieldAlert className={`h-5 w-5 ${draft.killSwitch ? "text-rose-300" : "app-text-muted"}`} />
            <div>
              <div className="text-sm font-black app-text">Emergency kill switch</div>
              <div className="text-[11px] app-text-muted">
                {draft.killSwitch
                  ? "ALL AI generation is halted right now."
                  : "Instantly halt every AI feature. Applies immediately."}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onKillSwitch(!draft.killSwitch)}
            className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-black transition ${
              draft.killSwitch
                ? "bg-emerald-500 text-black hover:bg-emerald-400"
                : "bg-rose-500 text-white hover:bg-rose-400"
            }`}
          >
            <Power className="h-4 w-4" />
            {draft.killSwitch ? "Resume AI" : "Halt all AI"}
          </button>
        </div>
      </div>

      {/* Global enforcement */}
      <div className="card-premium rounded-3xl p-4 space-y-3">
        <div className="text-sm font-bold app-text">Global enforcement</div>
        <Row label="Auto-pause on budget" hint="Block a feature when its cap is reached.">
          <Toggle on={draft.autoPause} onChange={(v) => setDraft((d) => ({ ...d, autoPause: v }))} />
        </Row>
        <Row label="Auto-throttle" hint="Cap request rate per minute when enabled.">
          <Toggle on={draft.autoThrottle} onChange={(v) => setDraft((d) => ({ ...d, autoThrottle: v }))} />
        </Row>
        {draft.autoThrottle && (
          <label className="flex items-center justify-between gap-3">
            <span className="text-[11px] app-text-muted">Requests / minute</span>
            <input
              type="number" min={1}
              value={draft.throttleRpm ?? ""}
              onChange={(e) => setDraft((d) => ({
                ...d, throttleRpm: e.target.value === "" ? null : Math.max(1, Number(e.target.value)),
              }))}
              className="w-24 rounded-xl bg-white/[0.04] px-2.5 py-1.5 text-sm app-text outline-none"
              placeholder="e.g. 60"
            />
          </label>
        )}
        <div className="grid grid-cols-2 gap-3 border-t border-white/10 pt-3">
          <PhpField label="Global daily cap" value={draft.budgets.global.dailyPhp}
            onChange={(v) => setDraft((d) => setGlobalBudget(d, "dailyPhp", v))} />
          <PhpField label="Global monthly cap" value={draft.budgets.global.monthlyPhp}
            onChange={(v) => setDraft((d) => setGlobalBudget(d, "monthlyPhp", v))} />
        </div>
      </div>

      {/* Provider Connection Editor */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
        <div className="flex items-center gap-2 text-sm font-bold app-text">
          <Boxes className="h-4 w-4" /> Provider Connection Editor
        </div>
        <p className="mt-1 text-[11px] app-text-muted">
          Connection status reflects real API-key presence on the server. Disabling a provider or a
          model removes it from every feature's routing chain on the next request.
        </p>
      </div>

      {topology.providers.map((p) => {
        const provEnabled = draft.providers[p.id]?.enabled !== false;
        const budget = draft.budgets.perProvider[p.id] ?? { dailyPhp: null, monthlyPhp: null };
        const accent = PROVIDER_ACCENT[p.id] ?? "#888";
        return (
          <div key={p.id} className="card-premium rounded-3xl p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: accent }} />
                  <span className="text-sm font-black app-text">{p.label}</span>
                  <span className="text-[10px] uppercase tracking-wide app-text-muted">{p.role}</span>
                </div>
                <div className="mt-1">
                  <StatusDot ok={p.configured} label={p.configured ? "Connected" : "Not connected"} />
                </div>
                <div className="mt-1 text-[10px] app-text-muted">
                  Key: {p.envVars.length ? p.envVars.join(" / ") : "—"}
                </div>
                {p.dashboard && (
                  <a href={p.dashboard} target="_blank" rel="noreferrer"
                    className="mt-1 inline-flex items-center gap-1 text-[11px] text-sky-300 hover:underline">
                    Provider dashboard <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
              <label className="flex items-center gap-2 text-[11px] app-text-muted">
                Enabled
                <Toggle on={provEnabled} onChange={(v) => setDraft((d) => ({
                  ...d, providers: { ...d.providers, [p.id]: { enabled: v } },
                }))} />
              </label>
            </div>

            {/* Models */}
            <div className={`mt-3 space-y-1.5 ${provEnabled ? "" : "opacity-50"}`}>
              <div className="text-[10px] uppercase tracking-wide app-text-muted">Models</div>
              {p.models.length === 0 && <div className="text-[11px] app-text-muted">—</div>}
              {p.models.map((m) => {
                const key = `${p.id}:${m}`;
                const enabled = draft.models[key]?.enabled !== false;
                return (
                  <div key={m} className="flex items-center justify-between gap-2 rounded-xl bg-white/[0.04] px-3 py-1.5">
                    <code className="truncate text-[11px] app-text">{m}</code>
                    <Toggle on={enabled} onChange={(v) => setDraft((d) => ({
                      ...d, models: { ...d.models, [key]: { enabled: v } },
                    }))} />
                  </div>
                );
              })}
            </div>

            {/* Per-provider budget */}
            <div className="mt-4 grid grid-cols-2 gap-3 border-t border-white/10 pt-3">
              <PhpField label="Daily cap" value={budget.dailyPhp}
                onChange={(v) => setDraft((d) => setProviderBudget(d, p.id, "dailyPhp", v))} />
              <PhpField label="Monthly cap" value={budget.monthlyPhp}
                onChange={(v) => setDraft((d) => setProviderBudget(d, p.id, "monthlyPhp", v))} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Row({ label, hint, children }: { label: string; hint: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div>
        <div className="text-xs font-bold app-text">{label}</div>
        <div className="text-[10px] app-text-muted">{hint}</div>
      </div>
      {children}
    </div>
  );
}

function setGlobalBudget(d: GovernanceConfig, field: keyof BudgetCap, value: number | null): GovernanceConfig {
  return { ...d, budgets: { ...d.budgets, global: { ...d.budgets.global, [field]: value } } };
}

function setProviderBudget(
  d: GovernanceConfig, provider: string, field: keyof BudgetCap, value: number | null,
): GovernanceConfig {
  const current = d.budgets.perProvider[provider] ?? { dailyPhp: null, monthlyPhp: null };
  return {
    ...d,
    budgets: { ...d.budgets, perProvider: { ...d.budgets.perProvider, [provider]: { ...current, [field]: value } } },
  };
}
