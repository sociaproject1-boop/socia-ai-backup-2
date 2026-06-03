/** FlowTab — request-flow visualization, dependency map & failover (#3, #9, #10). */
import { ArrowRight, GitBranch, ShieldCheck, ShieldAlert } from "lucide-react";
import {
  type AiOpsOverview, type FlowStep,
  PROVIDER_LABELS, PROVIDER_ACCENT,
} from "@/lib/aiOps";
import { Card, Tag, Hint } from "./shared";

function StepChip({ step }: { step: FlowStep }) {
  const accent = PROVIDER_ACCENT[step.provider];
  const kindBg =
    step.kind === "primary" ? "rgba(16,185,129,0.10)" :
    step.kind === "fallback" ? "rgba(245,158,11,0.10)" : "rgba(96,165,250,0.10)";
  return (
    <div className="rounded-2xl px-3 py-2" style={{ background: kindBg, border: `1px solid ${accent}33` }}>
      <div className="flex items-center gap-1.5">
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: accent }} />
        <span className="text-[11px] font-bold app-text">{PROVIDER_LABELS[step.provider]}</span>
        <span className="text-[9px] uppercase tracking-wide app-text-muted">{step.kind}</span>
      </div>
      {step.model && <div className="mt-0.5 text-[10px] app-text-muted">{step.model}</div>}
      <div className="text-[10px] app-text-muted">{step.action}</div>
    </div>
  );
}

export function FlowTab({ ov }: { ov: AiOpsOverview }) {
  return (
    <div className="space-y-4">
      <Hint>
        These chains describe how each feature routes a request through providers — including automatic
        fallbacks and user-selectable engines. This is config truth read from the engine registry, shown so
        you can see exactly which provider answers when.
      </Hint>

      {ov.features.map((f) => (
        <Card key={f.tool}>
          <div className="flex flex-wrap items-center gap-2">
            <GitBranch className="h-4 w-4 app-text-muted" />
            <span className="text-sm font-bold app-text">{f.label}</span>
            <code className="text-[10px] app-text-muted">{f.endpoint}</code>
          </div>

          <div className="mt-3 flex flex-wrap items-stretch gap-2">
            {f.flow.map((step, i) => (
              <div key={`${step.provider}-${i}`} className="flex items-center gap-2">
                <StepChip step={step} />
                {i < f.flow.length - 1 && <ArrowRight className="h-4 w-4 flex-shrink-0 app-text-muted" />}
              </div>
            ))}
          </div>

          <div className="mt-3 flex items-start gap-2 rounded-2xl bg-white/[0.03] px-3 py-2">
            {f.failover.automatic
              ? <ShieldCheck className="mt-0.5 h-4 w-4 flex-shrink-0" style={{ color: "#a7f3d0" }} />
              : <ShieldAlert className="mt-0.5 h-4 w-4 flex-shrink-0" style={{ color: "#fde68a" }} />}
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold app-text">Failover</span>
                {f.failover.automatic
                  ? <Tag color="#a7f3d0" bg="rgba(16,185,129,0.12)">automatic</Tag>
                  : <Tag color="#fde68a" bg="rgba(245,158,11,0.12)">no failover</Tag>}
              </div>
              <div className="mt-0.5 text-[11px] app-text-muted">{f.failover.summary}</div>
            </div>
          </div>
        </Card>
      ))}

      <Card>
        <div className="mb-3 flex items-center gap-2">
          <GitBranch className="h-4 w-4 app-text-muted" />
          <span className="text-sm font-bold app-text">Dependency map</span>
        </div>
        <div className="space-y-2">
          {ov.features.map((f) => (
            <div key={f.tool} className="flex flex-wrap items-center gap-2 rounded-2xl bg-white/[0.03] px-3 py-2">
              <span className="text-[11px] font-semibold app-text min-w-[140px]">{f.label}</span>
              <ArrowRight className="h-3.5 w-3.5 app-text-muted" />
              <div className="flex flex-wrap gap-1">
                {f.providers.length
                  ? f.providers.map((p) => (
                      <Tag key={p} color={PROVIDER_ACCENT[p]} bg="rgba(255,255,255,0.05)">{PROVIDER_LABELS[p]}</Tag>
                    ))
                  : <span className="text-[11px] app-text-muted">—</span>}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
