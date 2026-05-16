import type { AIPlanCode } from "@/lib/aiPlanClient";
import { Sparkles, Zap, Flame, Crown } from "lucide-react";

interface AIPlanBadgeProps {
  code: AIPlanCode;
  size?: "sm" | "md";
}

const CONFIG: Record<AIPlanCode, {
  label: string;
  icon: React.ElementType;
  style: React.CSSProperties;
  textColor: string;
}> = {
  free: {
    label: "Free",
    icon: Sparkles,
    style: { background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)" },
    textColor: "rgba(255,255,255,0.45)",
  },
  premium: {
    label: "Premium",
    icon: Zap,
    style: {
      background: "linear-gradient(135deg,rgba(168,85,247,0.2),rgba(236,72,153,0.14))",
      border: "1px solid rgba(168,85,247,0.4)",
    },
    textColor: "rgba(216,180,254,0.95)",
  },
  elite: {
    label: "Elite",
    icon: Flame,
    style: {
      background: "linear-gradient(135deg,rgba(239,68,68,0.14),rgba(249,115,22,0.1))",
      border: "1px solid rgba(249,115,22,0.4)",
    },
    textColor: "rgba(253,186,116,0.95)",
  },
  "super-elite": {
    label: "Super Elite",
    icon: Crown,
    style: {
      background: "linear-gradient(135deg,rgba(234,179,8,0.2),rgba(168,85,247,0.15))",
      border: "1px solid rgba(234,179,8,0.45)",
      boxShadow: "0 0 12px rgba(234,179,8,0.15)",
    },
    textColor: "rgba(253,224,71,0.95)",
  },
};

export function AIPlanBadge({ code, size = "sm" }: AIPlanBadgeProps) {
  const cfg  = CONFIG[code] ?? CONFIG.free;
  const Icon = cfg.icon;

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-semibold ${
        size === "sm" ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-[11.5px]"
      }`}
      style={{ ...cfg.style, color: cfg.textColor }}
    >
      <Icon className={size === "sm" ? "h-2.5 w-2.5" : "h-3 w-3"} />
      {cfg.label}
    </span>
  );
}
