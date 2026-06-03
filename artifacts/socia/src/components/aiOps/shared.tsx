/**
 * shared — presentation primitives for the AI Operations Center.
 * Pure, stateless, theme-aware. Dependency-free SVG charts (no chart lib).
 */
import type { ReactNode } from "react";
import type { DailyPoint, WindowKey } from "@/lib/aiOps";
import { windowLabel } from "@/lib/aiOps";

/* ── Card shell ───────────────────────────────────────────────────────── */
export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`card-premium rounded-3xl p-5 ${className}`}>{children}</div>;
}

export function SectionTitle({ icon, title, hint }: { icon?: ReactNode; title: string; hint?: string }) {
  return (
    <div className="mb-3">
      <div className="flex items-center gap-2">
        {icon}
        <span className="text-sm font-bold app-text">{title}</span>
      </div>
      {hint && <div className="mt-0.5 text-[11px] app-text-muted">{hint}</div>}
    </div>
  );
}

/* ── Stat tile ────────────────────────────────────────────────────────── */
export function StatTile({
  label, value, sub, tone, accent,
}: {
  label: string; value: ReactNode; sub?: ReactNode;
  tone?: "good" | "bad" | "warn"; accent?: string;
}) {
  const color = accent
    ? accent
    : tone === "good" ? "#a7f3d0" : tone === "bad" ? "#fecaca" : tone === "warn" ? "#fde68a" : "var(--s-text)";
  return (
    <div className="rounded-2xl bg-white/[0.03] px-3 py-3">
      <div className="text-[10px] font-bold uppercase tracking-widest app-text-muted">{label}</div>
      <div className="mt-1 text-xl font-black leading-tight" style={{ color }}>{value}</div>
      {sub != null && <div className="mt-0.5 text-[11px] app-text-muted">{sub}</div>}
    </div>
  );
}

/* ── Tag / pill ───────────────────────────────────────────────────────── */
export function Tag({ children, color = "var(--s-text)", bg = "rgba(255,255,255,0.06)" }: {
  children: ReactNode; color?: string; bg?: string;
}) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold"
      style={{ color, background: bg }}
    >
      {children}
    </span>
  );
}

export function ConfigBadge({ configured }: { configured: boolean }) {
  return configured ? (
    <Tag color="#a7f3d0" bg="rgba(16,185,129,0.12)">● Configured</Tag>
  ) : (
    <Tag color="#fde68a" bg="rgba(245,158,11,0.12)">○ No key</Tag>
  );
}

/* ── Window toggle (24h / 7d / 30d) ───────────────────────────────────── */
export function WindowToggle({
  value, onChange, keys,
}: {
  value: WindowKey; onChange: (k: WindowKey) => void; keys: WindowKey[];
}) {
  return (
    <div className="inline-flex rounded-full bg-white/[0.05] p-0.5">
      {keys.map((k) => (
        <button
          key={k}
          onClick={() => onChange(k)}
          className={`rounded-full px-3 py-1 text-[11px] font-bold transition ${
            value === k ? "bg-white/[0.14] app-text" : "app-text-muted"
          }`}
        >
          {windowLabel(k)}
        </button>
      ))}
    </div>
  );
}

/* ── Horizontal rank bars ─────────────────────────────────────────────── */
export function RankBars({
  items, format,
}: {
  items: { label: string; value: number; accent?: string }[];
  format: (n: number) => string;
}) {
  const max = Math.max(1, ...items.map((i) => i.value));
  if (items.length === 0 || max <= 0) {
    return <div className="py-3 text-center text-[11px] app-text-muted">No activity in this window.</div>;
  }
  return (
    <div className="space-y-2">
      {items.map((i) => (
        <div key={i.label}>
          <div className="flex items-center justify-between text-[11px] mb-1">
            <span className="app-text truncate pr-2">{i.label}</span>
            <span className="font-bold app-text flex-shrink-0">{format(i.value)}</span>
          </div>
          <div className="h-2 rounded-full bg-white/[0.05] overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{ width: `${Math.max(2, (i.value / max) * 100)}%`, background: i.accent ?? "var(--s-accent, #a78bfa)" }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── Trend line chart (SVG) ───────────────────────────────────────────── */
export function TrendChart({
  points, valueKey, color = "#a78bfa", height = 64,
}: {
  points: DailyPoint[];
  valueKey: "requests" | "costPhp" | "tokens";
  color?: string;
  height?: number;
}) {
  const vals = points.map((p) => p[valueKey]);
  const max = Math.max(1, ...vals);
  const n = points.length;
  if (n === 0) return <div className="text-[11px] app-text-muted">No data.</div>;
  const w = 100; // viewBox width units
  const stepX = n > 1 ? w / (n - 1) : 0;
  const pts = vals.map((v, i) => {
    const x = i * stepX;
    const y = height - (v / max) * (height - 6) - 3;
    return [x, y] as const;
  });
  const line = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
  const area = `${line} L${w},${height} L0,${height} Z`;
  const gid = `grad-${valueKey}-${color.replace("#", "")}`;
  return (
    <svg viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" className="w-full" style={{ height }}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gid})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/* ── Empty / honesty hint ─────────────────────────────────────────────── */
export function Hint({ children }: { children: ReactNode }) {
  return <div className="text-[11px] app-text-muted leading-relaxed">{children}</div>;
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="py-6 text-center text-xs app-text-muted">{children}</div>;
}
