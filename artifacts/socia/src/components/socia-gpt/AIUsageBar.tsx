import type { AIPlanCode, AIUsage } from "@/lib/aiPlanClient";

interface AIUsageBarProps {
  code:      AIPlanCode;
  usage:     AIUsage;
  onUpgrade?: () => void;
}

export function AIUsageBar({ code, usage, onUpgrade }: AIUsageBarProps) {
  const { used, limit, period, resetAt } = usage;
  const pct       = Math.min(100, Math.round((used / limit) * 100));
  const remaining = Math.max(0, limit - used);

  const resetDate = new Date(resetAt).toLocaleDateString("en-PH", {
    month: "short", day: "numeric",
  });

  const barColor =
    pct >= 90 ? "#ef4444" :
    pct >= 70 ? "#f59e0b" :
    code === "super-elite" ? "rgba(234,179,8,0.8)" :
    code === "elite"       ? "rgba(249,115,22,0.8)" :
    code === "premium"     ? "#a855f7" :
    "rgba(255,255,255,0.25)";

  const showUpgrade = code === "free" && pct >= 50 && onUpgrade;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-[10.5px]">
        <span style={{ color: "rgba(255,255,255,0.45)" }}>
          {remaining} / {limit} {period === "daily" ? "today" : "this month"}
        </span>
        <span style={{ color: "rgba(255,255,255,0.28)" }}>Resets {resetDate}</span>
      </div>

      <div className="h-[3px] w-full overflow-hidden rounded-full" style={{ background: "rgba(255,255,255,0.07)" }}>
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, backgroundColor: barColor }}
        />
      </div>

      {showUpgrade && (
        <button
          onClick={onUpgrade}
          className="mt-1 w-full rounded-xl py-2 text-[11px] font-semibold transition-all"
          style={{
            background: "linear-gradient(135deg,rgba(168,85,247,0.15),rgba(236,72,153,0.1))",
            border: "1px solid rgba(168,85,247,0.25)",
            color: "rgba(216,180,254,0.9)",
          }}
        >
          Upgrade to Premium — ₱499/mo
        </button>
      )}
    </div>
  );
}
