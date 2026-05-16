import type { AIPlanCode, AIUsage } from "@/lib/aiPlanClient";

interface AIUsageBarProps {
  code:  AIPlanCode;
  usage: AIUsage;
  onUpgrade?: () => void;
}

export function AIUsageBar({ code, usage, onUpgrade }: AIUsageBarProps) {
  const { used, limit, period, resetAt } = usage;
  const pct     = Math.min(100, Math.round((used / limit) * 100));
  const remaining = Math.max(0, limit - used);

  const resetDate = new Date(resetAt).toLocaleDateString("en-PH", {
    month: "short", day: "numeric",
  });

  const barColor =
    pct >= 90 ? "#ef4444" :
    pct >= 70 ? "#f59e0b" :
    code === "ultra"   ? "#8b5cf6" :
    code === "premium" ? "#a855f7" :
    "#6b7280";

  const showUpgrade = code === "free" && pct >= 60 && onUpgrade;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-[10.5px]">
        <span className="text-white/50">
          {remaining} / {limit} {period === "daily" ? "today" : "this month"}
        </span>
        <span className="text-white/35">Resets {resetDate}</span>
      </div>

      <div className="h-1 w-full overflow-hidden rounded-full bg-white/8">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, backgroundColor: barColor }}
        />
      </div>

      {showUpgrade && (
        <button
          onClick={onUpgrade}
          className="mt-1 w-full rounded-lg bg-fuchsia-500/10 border border-fuchsia-500/25 py-1.5 text-[10.5px] font-medium text-fuchsia-300 hover:bg-fuchsia-500/15 transition"
        >
          Upgrade to Premium AI — ₱299/mo
        </button>
      )}
    </div>
  );
}
