import { useEffect } from "react";
import { useLocation } from "wouter";
import { Sparkles, Crown } from "lucide-react";
import { useBillingStore } from "@/lib/billing";

/** Compact pill showing credit balance — tap to open billing. */
export function CreditsBadge({
  compact = false,
  className = "",
  style: styleProp,
}: {
  compact?: boolean;
  className?: string;
  style?: React.CSSProperties;
}) {
  const [, navigate] = useLocation();
  const summary = useBillingStore((s) => s.summary);
  const refresh = useBillingStore((s) => s.refresh);

  useEffect(() => {
    if (!summary) refresh();
  }, [summary, refresh]);

  const owner   = summary?.is_owner;
  const credits = summary?.credits ?? 0;
  const label   = owner ? "∞" : credits.toLocaleString();

  return (
    <button
      onClick={() => navigate("/billing")}
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-semibold text-white ${className}`}
      style={{
        background: owner
          ? "linear-gradient(135deg,#f59e0b,#fbbf24)"
          : credits < 50
            ? "linear-gradient(135deg,#ef4444,#f97316)"
            : "linear-gradient(135deg,#a855f7,#ec4899)",
        ...styleProp,
      }}
      title="Credits & billing"
    >
      {owner ? <Crown className="h-3 w-3" /> : <Sparkles className="h-3 w-3" />}
      {label}{!compact && !owner && " credits"}
    </button>
  );
}
