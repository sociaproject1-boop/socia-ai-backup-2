import type { AIPlanCode } from "@/lib/aiPlanClient";
import { Sparkles, Zap, Crown } from "lucide-react";

interface AIPlanBadgeProps {
  code: AIPlanCode;
  size?: "sm" | "md";
}

const CONFIG: Record<AIPlanCode, {
  label: string;
  icon: React.ElementType;
  className: string;
}> = {
  free: {
    label: "Free AI",
    icon: Sparkles,
    className: "bg-white/8 text-white/60 border border-white/10",
  },
  premium: {
    label: "Premium AI",
    icon: Zap,
    className: "border border-fuchsia-500/40 text-fuchsia-300",
  },
  ultra: {
    label: "Ultra Pro",
    icon: Crown,
    className: "border border-violet-400/50 text-violet-300",
  },
};

export function AIPlanBadge({ code, size = "sm" }: AIPlanBadgeProps) {
  const cfg  = CONFIG[code];
  const Icon = cfg.icon;

  const isPremium = code === "premium";
  const isUltra   = code === "ultra";

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-semibold ${cfg.className} ${
        size === "sm" ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-[11.5px]"
      }`}
      style={
        isPremium
          ? { background: "linear-gradient(135deg,rgba(168,85,247,0.18),rgba(236,72,153,0.12))" }
          : isUltra
          ? { background: "linear-gradient(135deg,rgba(124,58,237,0.22),rgba(99,102,241,0.15))" }
          : undefined
      }
    >
      <Icon className={size === "sm" ? "h-2.5 w-2.5" : "h-3 w-3"} />
      {cfg.label}
    </span>
  );
}
