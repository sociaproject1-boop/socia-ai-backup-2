/**
 * RefundStatusBadge — pill showing refund request status.
 * Also handles payout_status overlay (sent → "Refunded").
 */
import { CheckCircle2, XCircle, Clock, HelpCircle, ShieldCheck, Send } from "lucide-react";

type Status = "pending" | "reviewing" | "approved" | "partial" | "rejected";
type PayoutStatus = "queued" | "processing" | "sent" | "failed" | null;

interface Props {
  status: Status;
  payoutStatus?: PayoutStatus;
  approvedAmountPhp?: number | null;
  size?: "sm" | "md";
}

const CONFIG: Record<Status, {
  label: string;
  icon: typeof CheckCircle2;
  classes: string;
}> = {
  pending:   { label: "Pending Review",       icon: Clock,        classes: "border-amber-500/30 bg-amber-500/10 text-amber-300" },
  reviewing: { label: "Under Investigation",  icon: ShieldCheck,  classes: "border-blue-500/30 bg-blue-500/10 text-blue-300" },
  approved:  { label: "Approved",             icon: CheckCircle2, classes: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" },
  partial:   { label: "Partially Approved",   icon: CheckCircle2, classes: "border-teal-500/30 bg-teal-500/10 text-teal-300" },
  rejected:  { label: "Rejected",             icon: XCircle,      classes: "border-rose-500/30 bg-rose-500/10 text-rose-300" },
};

export function RefundStatusBadge({ status, payoutStatus, approvedAmountPhp, size = "sm" }: Props) {
  // Payout overlay — overrides display when payout is confirmed
  if (payoutStatus === "sent") {
    const textSize = size === "md" ? "text-[12px]" : "text-[10.5px]";
    return (
      <span className={`inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/15 px-2 py-0.5 font-semibold ${textSize} text-emerald-300`}>
        <Send className={`shrink-0 ${size === "md" ? "h-3.5 w-3.5" : "h-3 w-3"}`} />
        Refunded
        {approvedAmountPhp != null && (
          <span className="ml-0.5 opacity-80">· ₱{Number(approvedAmountPhp).toLocaleString()}</span>
        )}
      </span>
    );
  }

  const cfg  = CONFIG[status] ?? { label: status, icon: HelpCircle, classes: "border-white/10 bg-white/5 text-white/50" };
  const Icon = cfg.icon;
  const textSize = size === "md" ? "text-[12px]" : "text-[10.5px]";
  const iconSize = size === "md" ? "h-3.5 w-3.5" : "h-3 w-3";

  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-semibold ${textSize} ${cfg.classes}`}>
      <Icon className={`shrink-0 ${iconSize}`} />
      {cfg.label}
      {(status === "approved" || status === "partial") && approvedAmountPhp != null && (
        <span className="ml-0.5 opacity-80">· ₱{Number(approvedAmountPhp).toLocaleString()}</span>
      )}
    </span>
  );
}
