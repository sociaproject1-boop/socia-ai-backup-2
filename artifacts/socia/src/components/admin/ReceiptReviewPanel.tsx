/**
 * Phase 2 — Advanced Receipt Review Center
 * Full-screen slide-over investigation panel for payment receipt fraud review.
 */
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, ZoomIn, ZoomOut, RefreshCw, Maximize2, Eye, ShieldAlert,
  ShieldCheck, ShieldX, AlertTriangle, CheckCircle2, XCircle, Clock,
  Upload, ScanSearch, Ban, Pause, Flag, FileText, MessageSquare,
  ChevronRight, ExternalLink, Info, AlertOctagon, Cpu, Fingerprint,
  Copy, Layers, Activity,
} from "lucide-react";
import {
  adminDecideReceipt, adminRequestReceiptProof, adminAddReceiptNote,
  adminSetUserFlags,
  type AdminReceiptDetail,
} from "@/lib/adminAuth";

/* ── Fraud signal explanations ──────────────────────────────────────── */
const FRAUD_EXPLANATIONS: Record<string, {
  title:       string;
  explanation: string;
  severity:    "critical" | "high" | "medium" | "low";
  icon:        React.ElementType;
}> = {
  duplicate_image_hash:          { title: "Duplicate Image (Cross-Account)", explanation: "This exact receipt image has been submitted before by a different account — a strong indicator of coordinated fraud.", severity: "critical", icon: Copy },
  duplicate_image_hash_own:      { title: "Previously Submitted Image",      explanation: "This user has already submitted the same receipt image in a previous request.", severity: "high",     icon: Copy },
  duplicate_extracted_reference: { title: "Duplicate Reference Number",      explanation: "This payment reference number is already linked to a previous submission in our system.", severity: "critical", icon: Fingerprint },
  reference_in_other_refund:     { title: "Reference Linked to Another Refund", explanation: "This reference number appears in another user's refund or verification request.", severity: "critical", icon: Fingerprint },
  cross_user_reference:          { title: "Cross-Account Reference Reuse",   explanation: "A different account previously used this reference number — may indicate account sharing or coordinated fraud.", severity: "critical", icon: Fingerprint },
  tamper_analysis:               { title: "Image Tampering Evidence",        explanation: "Binary analysis found editing software signatures, JPEG recompression artifacts, or EXIF anomalies. The image was likely modified after it was originally captured.", severity: "critical", icon: AlertOctagon },
  editing_software:              { title: "Editing Software Detected",       explanation: "Signatures of Photoshop, GIMP, Canva, Snapseed, or a similar editing tool were found embedded in the file's metadata.", severity: "critical", icon: AlertOctagon },
  low_quality_dqt:               { title: "Suspicious JPEG Compression",     explanation: "The image compression quality suggests it was re-exported after editing — genuine phone screenshots have consistent quality.", severity: "high",     icon: Cpu },
  suspicious_rst_variance:       { title: "Edited Image Regions Detected",   explanation: "JPEG restart marker analysis found irregular patterns in specific image regions, suggesting parts of the image may have been pasted or cloned.", severity: "high",     icon: Cpu },
  progressive_jpeg:              { title: "Non-Native File Format",          explanation: "Progressive JPEG encoding is used by web browsers and editors when exporting, not by phone cameras or banking apps when taking screenshots.", severity: "medium",   icon: Cpu },
  xmp_metadata:                  { title: "Editor Metadata Embedded",        explanation: "XMP metadata blocks were found in the file — these are written by Adobe, Canva, and similar tools during export.", severity: "high",     icon: AlertOctagon },
  suspicious_file_size:          { title: "Suspicious File Size",            explanation: "The image file size is outside the normal range for genuine payment screenshots from mobile devices.", severity: "medium",   icon: Info },
  fake_receipt_structure:        { title: "Fake Receipt Structure",          explanation: "The document layout does not match genuine GCash, Maya, or bank payment receipts. Key structural fields appear to be missing or fabricated.", severity: "high",     icon: Layers },
  suspicious_text_patterns:      { title: "Suspicious OCR Text Content",     explanation: "The extracted text contains keywords or patterns commonly found in test receipts, templates, or fabricated documents (e.g., 'test', 'demo', 'void', 'sample').", severity: "medium",   icon: ScanSearch },
  blur_detected:                 { title: "Intentionally Blurred Image",     explanation: "The image is too blurry or low-resolution to reliably read payment details. This may be deliberate to prevent accurate OCR verification.", severity: "medium",   icon: Eye },
  velocity_abuse:                { title: "Rapid Upload Pattern",            explanation: "This user submitted multiple receipts in a short time window — a pattern strongly associated with automated fraud campaigns.", severity: "high",     icon: Activity },
};

function getFraudInfo(type: string) {
  return FRAUD_EXPLANATIONS[type] ?? {
    title:       type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    explanation: "Automated fraud detection flagged this signal during receipt analysis.",
    severity:    "medium" as const,
    icon:        AlertTriangle,
  };
}

/* ── Image quality badge ─────────────────────────────────────────────── */
function imageQualityBadge(blurScore: number | null) {
  const s = blurScore ?? 0;
  if (s <= 25) return { label: "Excellent", color: "text-emerald-400", border: "border-emerald-500/20", bg: "bg-emerald-500/10", fill: s / 100 };
  if (s <= 45) return { label: "Good",      color: "text-green-400",   border: "border-green-500/20",   bg: "bg-green-500/10",   fill: s / 100 };
  if (s <= 60) return { label: "Fair",      color: "text-amber-400",   border: "border-amber-500/20",   bg: "bg-amber-500/10",   fill: s / 100 };
  if (s <= 80) return { label: "Poor",      color: "text-orange-400",  border: "border-orange-500/20",  bg: "bg-orange-500/10",  fill: s / 100 };
  return             { label: "Unreadable", color: "text-red-400",     border: "border-red-500/20",     bg: "bg-red-500/10",     fill: 1 };
}

/* ── Score bar ───────────────────────────────────────────────────────── */
function ScoreBar({ label, value, dangerAt }: { label: string; value: number; dangerAt: number }) {
  const pct   = Math.min(value, 100);
  const color = value >= dangerAt
    ? value >= dangerAt * 1.4 ? "#ef4444" : "#f59e0b"
    : "#10b981";
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[10px]">
        <span className="text-white/50">{label}</span>
        <span className="font-mono font-bold" style={{ color }}>{value}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-white/5">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="h-full rounded-full"
          style={{ background: color }}
        />
      </div>
    </div>
  );
}

/* ── Timeline event ─────────────────────────────────────────────────── */
interface TimelineEvent { time: string | null; title: string; description: string; status: "done" | "warning" | "danger" | "pending"; icon: React.ElementType }

function buildTimeline(r: AdminReceiptDetail): TimelineEvent[] {
  const events: TimelineEvent[] = [
    { time: r.created_at,     title: "Receipt submitted",   description: `User submitted payment receipt for reference ${r.manual_reference || "N/A"}`, status: "done",    icon: Upload    },
    { time: r.created_at,     title: "OCR scan complete",   description: `${r.ocr_engine ?? "Tesseract"} extracted text from image`,                     status: "done",    icon: ScanSearch },
    { time: r.created_at,     title: "Fraud analysis run",  description: `Score: ${r.fraud_score ?? 0}/100 — ${(r.fraud_reasons ?? []).length} signal(s) detected`, status: (r.fraud_score ?? 0) >= 50 ? "warning" : "done", icon: ShieldAlert },
  ];

  if (r.verification_status === "blocked") {
    events.push({ time: r.created_at, title: "Auto-blocked", description: r.block_code ? r.block_code.replace(/_/g, " ") + " — automatically rejected" : "High fraud score triggered automatic block", status: "danger", icon: Ban });
  } else if (r.verification_status === "suspicious") {
    events.push({ time: r.created_at, title: "Flagged for review", description: "Fraud score above manual review threshold (50)", status: "warning", icon: AlertTriangle });
  }

  if (r.proof_requested) {
    events.push({ time: null, title: "Additional proof requested", description: "Admin requested supporting documentation from user", status: "warning", icon: FileText });
  }

  if (r.reviewed_at && r.reviewed_by) {
    events.push({ time: r.reviewed_at, title: `Admin ${r.review_status ?? "review"} by ${r.reviewed_by}`, description: r.review_notes ?? "No notes provided", status: r.review_status === "approved" ? "done" : r.review_status === "rejected" ? "danger" : "warning", icon: r.review_status === "approved" ? ShieldCheck : r.review_status === "rejected" ? ShieldX : Eye });
  } else {
    events.push({ time: null, title: "Awaiting admin decision", description: "No review action taken yet", status: "pending", icon: Clock });
  }

  return events;
}

function TimelineItem({ event, isLast }: { event: TimelineEvent; isLast: boolean }) {
  const Icon = event.icon;
  const colors = {
    done:    { dot: "bg-emerald-500", icon: "text-emerald-400", line: "bg-emerald-500/30"  },
    warning: { dot: "bg-amber-500",   icon: "text-amber-400",   line: "bg-amber-500/30"    },
    danger:  { dot: "bg-red-500",     icon: "text-red-400",     line: "bg-red-500/30"      },
    pending: { dot: "bg-white/20",    icon: "text-white/30",    line: "bg-white/10"        },
  }[event.status];

  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center">
        <div className={`grid h-7 w-7 flex-shrink-0 place-items-center rounded-full ${colors.dot} bg-opacity-20 border border-white/10`}>
          <Icon className={`h-3.5 w-3.5 ${colors.icon}`} />
        </div>
        {!isLast && <div className={`mt-1 w-0.5 flex-1 min-h-[20px] ${colors.line}`} />}
      </div>
      <div className="min-w-0 pb-4">
        <p className="text-[11px] font-bold text-white">{event.title}</p>
        <p className="mt-0.5 text-[10px] text-white/50">{event.description}</p>
        {event.time && (
          <p className="mt-0.5 font-mono text-[10px] text-white/25">
            {new Date(event.time).toLocaleString()}
          </p>
        )}
      </div>
    </div>
  );
}

/* ── Fraud signal card ───────────────────────────────────────────────── */
function FraudSignalCard({ type, detail: rawDetail, points }: { type: string; detail: string; points: number }) {
  const [expanded, setExpanded] = useState(false);
  const info = getFraudInfo(type);
  const Icon = info.icon;
  const severityStyles = {
    critical: { bg: "bg-red-500/8",    border: "border-red-500/20",    badge: "bg-red-500/15 text-red-400",    icon: "text-red-400"    },
    high:     { bg: "bg-orange-500/8", border: "border-orange-500/20", badge: "bg-orange-500/15 text-orange-400", icon: "text-orange-400" },
    medium:   { bg: "bg-amber-500/8",  border: "border-amber-500/20",  badge: "bg-amber-500/15 text-amber-400", icon: "text-amber-400"  },
    low:      { bg: "bg-white/[0.03]", border: "border-white/5",       badge: "bg-white/5 text-white/40",      icon: "text-white/40"   },
  }[info.severity];

  return (
    <div className={`rounded-xl border ${severityStyles.border} ${severityStyles.bg} p-3`}>
      <div className="flex items-start gap-2.5">
        <Icon className={`mt-0.5 h-4 w-4 flex-shrink-0 ${severityStyles.icon}`} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-bold text-white">{info.title}</span>
            {points > 0 && (
              <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold ${severityStyles.badge}`}>
                +{points} pts
              </span>
            )}
            <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase ${severityStyles.badge}`}>
              {info.severity}
            </span>
          </div>
          <p className="mt-1 text-[10px] leading-relaxed text-white/60">{info.explanation}</p>
          {rawDetail && rawDetail !== info.explanation && (
            <button onClick={() => setExpanded((e) => !e)} className="mt-1 text-[9px] text-white/30 hover:text-white/50">
              {expanded ? "Hide" : "Show"} raw signal detail
            </button>
          )}
          {expanded && rawDetail && (
            <p className="mt-1 rounded-lg border border-white/5 bg-black/20 px-2 py-1.5 font-mono text-[9px] text-white/40">
              {rawDetail}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Section header ──────────────────────────────────────────────────── */
function SectionHeader({ icon: Icon, title, subtitle }: { icon: React.ElementType; title: string; subtitle?: string }) {
  return (
    <div className="mb-3 flex items-center gap-2.5">
      <div className="grid h-7 w-7 place-items-center rounded-lg bg-white/5">
        <Icon className="h-3.5 w-3.5 text-white/50" />
      </div>
      <div>
        <p className="text-[11px] font-bold text-white">{title}</p>
        {subtitle && <p className="text-[10px] text-white/35">{subtitle}</p>}
      </div>
    </div>
  );
}

/* ── Confirm overlay ─────────────────────────────────────────────────── */
type ActionType = "approve" | "reject" | "suspicious" | "proof" | "flag" | "temp_ban_7" | "temp_ban_30" | "perm_ban";

function actionMeta(a: ActionType) {
  return {
    approve:      { label: "Approve Receipt",       desc: "Mark this receipt as verified and approved.",               color: "bg-emerald-500 hover:bg-emerald-400", needsNote: false },
    reject:       { label: "Reject Receipt",         desc: "Mark this receipt as rejected. Cannot be undone.",          color: "bg-red-500 hover:bg-red-400",       needsNote: true  },
    suspicious:   { label: "Flag as Suspicious",     desc: "Move to manual review queue for further investigation.",     color: "bg-amber-500 hover:bg-amber-400",   needsNote: true  },
    proof:        { label: "Request Additional Proof", desc: "Ask the user to provide a clearer or alternative image.", color: "bg-blue-500 hover:bg-blue-400",     needsNote: false },
    flag:         { label: "Flag This User",          desc: "Add a fraud watch flag to this user's account.",           color: "bg-orange-500 hover:bg-orange-400", needsNote: true  },
    temp_ban_7:   { label: "Temporary Ban — 7 Days",  desc: "Suspend this account for 7 days due to suspicious activity.", color: "bg-rose-600 hover:bg-rose-500",  needsNote: true  },
    temp_ban_30:  { label: "Temporary Ban — 30 Days", desc: "Suspend this account for 30 days due to fraud pattern.",  color: "bg-rose-700 hover:bg-rose-600",     needsNote: true  },
    perm_ban:     { label: "Permanent Ban",           desc: "Permanently blacklist this user. This is irreversible.",   color: "bg-black border border-red-500/50 text-red-400 hover:bg-red-500/10", needsNote: true },
  }[a];
}

/* ── Main panel ──────────────────────────────────────────────────────── */
export function ReceiptReviewPanel({
  receipt:      initialReceipt,
  onClose,
  onRefresh,
}: {
  receipt:   AdminReceiptDetail;
  onClose:   () => void;
  onRefresh: () => void;
}) {
  const [receipt, setReceipt]         = useState(initialReceipt);
  const [zoom,    setZoom]            = useState(1.0);
  const [fullImg, setFullImg]         = useState(false);
  const [noteText, setNoteText]       = useState("");
  const [confirmAction, setConfirmAction] = useState<ActionType | null>(null);
  const [actionNotes, setActionNotes] = useState("");
  const [submitting, setSubmitting]   = useState(false);
  const [err, setErr]                 = useState<string | null>(null);

  const quality   = imageQualityBadge(receipt.blur_score);
  const timeline  = buildTimeline(receipt);
  const fraudFlags = (receipt.fraud_reasons ?? []) as { type: string; detail: string; points: number }[];
  const highRiskUser = receipt.user_receipt_history.filter((h) => h.verification_status === "blocked").length >= 3;
  const blockedCount = receipt.user_receipt_history.filter((h) => h.verification_status === "blocked").length;

  const executeAction = async () => {
    if (!confirmAction) return;
    setSubmitting(true); setErr(null);
    try {
      const notes = actionNotes.trim() || undefined;
      switch (confirmAction) {
        case "approve":    await adminDecideReceipt(receipt.id, "approved",   notes); break;
        case "reject":     await adminDecideReceipt(receipt.id, "rejected",   notes); break;
        case "suspicious": await adminDecideReceipt(receipt.id, "suspicious", notes); break;
        case "proof":      await adminRequestReceiptProof(receipt.id, notes);         break;
        case "flag":
          await adminSetUserFlags(receipt.user_id, { is_suspended: false, suspension_reason: `Fraud watch: ${notes ?? "flagged via receipt review"}` });
          break;
        case "temp_ban_7":
          await adminSetUserFlags(receipt.user_id, { is_suspended: true, suspension_reason: `7-day suspension: ${notes ?? "fraud-related activity"}` });
          break;
        case "temp_ban_30":
          await adminSetUserFlags(receipt.user_id, { is_suspended: true, suspension_reason: `30-day suspension: ${notes ?? "repeated fraud pattern"}` });
          break;
        case "perm_ban":
          await adminSetUserFlags(receipt.user_id, { is_banned: true, suspension_reason: `Permanent ban: ${notes ?? "confirmed fraud"}` });
          break;
      }
      setConfirmAction(null); setActionNotes("");
      onRefresh(); onClose();
    } catch (e) { setErr((e as Error).message); }
    finally     { setSubmitting(false); }
  };

  const addNote = async () => {
    if (!noteText.trim()) return;
    try {
      const r = await adminAddReceiptNote(receipt.id, noteText.trim());
      setNoteText("");
      setReceipt((prev) => ({ ...prev, notes: [...prev.notes, r.note] }));
    } catch (e) { setErr((e as Error).message); }
  };

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel */}
      <motion.div
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ type: "spring", stiffness: 350, damping: 40 }}
        className="relative ml-auto flex h-full w-full max-w-6xl flex-col overflow-hidden border-l border-white/[0.08] bg-[#07111e] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Top bar ── */}
        <div className="flex flex-shrink-0 items-center gap-3 border-b border-white/[0.06] bg-[#080e1a] px-5 py-3">
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg border border-white/10 text-white/50 hover:border-white/20 hover:text-white">
            <X className="h-4 w-4" />
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-bold text-white">Receipt Investigation</h2>
              <span className="font-mono text-[11px] text-white/40">{receipt.manual_reference || receipt.id.slice(0, 12)}</span>
              {highRiskUser && (
                <span className="rounded-full border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-[9px] font-bold text-red-400">
                  ⚠ HIGH RISK USER ({blockedCount} blocks)
                </span>
              )}
            </div>
            <p className="text-[10px] text-white/35">
              @{receipt.user?.username ?? receipt.user_id.slice(0, 8)} · Submitted {new Date(receipt.created_at).toLocaleString()}
            </p>
          </div>
          <a href={receipt.image_url} target="_blank" rel="noopener noreferrer"
             className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-[10px] font-semibold text-white/50 hover:text-white">
            <ExternalLink className="h-3 w-3" /> Original
          </a>
        </div>

        {/* ── Scrollable body ── */}
        <div className="flex-1 overflow-y-auto">
          {/* === TOP SPLIT: Image | Data === */}
          <div className="grid border-b border-white/[0.05] lg:grid-cols-5">
            {/* LEFT — Image + OCR */}
            <div className="space-y-4 border-b border-white/[0.05] p-5 lg:col-span-2 lg:border-b-0 lg:border-r">
              {/* Image viewer */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className={`rounded-full border ${quality.border} ${quality.bg} px-2 py-0.5 text-[9px] font-bold ${quality.color}`}>
                      {quality.label} Quality
                    </span>
                    <span className="text-[10px] text-white/30">Blur: {receipt.blur_score ?? 0}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => setZoom((z) => Math.max(z - 0.25, 0.5))} className="grid h-6 w-6 place-items-center rounded border border-white/10 bg-white/5 text-white/50 hover:text-white">
                      <ZoomOut className="h-3 w-3" />
                    </button>
                    <span className="w-10 text-center font-mono text-[10px] text-white/50">{Math.round(zoom * 100)}%</span>
                    <button onClick={() => setZoom((z) => Math.min(z + 0.25, 3))} className="grid h-6 w-6 place-items-center rounded border border-white/10 bg-white/5 text-white/50 hover:text-white">
                      <ZoomIn className="h-3 w-3" />
                    </button>
                    <button onClick={() => setZoom(1)} className="grid h-6 w-6 place-items-center rounded border border-white/10 bg-white/5 text-white/50 hover:text-white">
                      <RefreshCw className="h-3 w-3" />
                    </button>
                    <button onClick={() => setFullImg(true)} className="grid h-6 w-6 place-items-center rounded border border-white/10 bg-white/5 text-white/50 hover:text-white">
                      <Maximize2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>
                <div className="relative overflow-hidden rounded-xl border border-white/10 bg-black/40" style={{ maxHeight: 340 }}>
                  <div style={{ transform: `scale(${zoom})`, transformOrigin: "top center", transition: "transform 0.15s ease" }}>
                    <img src={receipt.image_url} alt="Payment receipt" className="w-full" draggable={false} />
                  </div>
                </div>
              </div>

              {/* OCR raw text */}
              <div>
                <SectionHeader icon={ScanSearch} title="OCR Extracted Text" subtitle={`Engine: ${receipt.ocr_engine ?? "Tesseract"}`} />
                <pre className="max-h-44 overflow-auto rounded-xl border border-white/5 bg-black/30 p-3 font-mono text-[10px] leading-relaxed text-white/60 whitespace-pre-wrap">
                  {receipt.ocr_raw_text || "No OCR text extracted."}
                </pre>
              </div>
            </div>

            {/* RIGHT — Data + Scores */}
            <div className="space-y-5 p-5 lg:col-span-3">
              {/* Payment data */}
              <div>
                <SectionHeader icon={FileText} title="Payment Data" subtitle="Extracted vs. user-submitted values" />
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {[
                    { label: "Ref (User Entered)",  value: receipt.manual_reference || "—",     flag: receipt.manual_reference !== receipt.extracted_reference && !!receipt.extracted_reference },
                    { label: "Ref (OCR Detected)",   value: receipt.extracted_reference ?? "—",  flag: receipt.manual_reference !== receipt.extracted_reference && !!receipt.extracted_reference },
                    { label: "Amount",               value: receipt.extracted_amount ? `₱${receipt.extracted_amount.toLocaleString()}` : "—" },
                    { label: "Payment Method",       value: receipt.extracted_payment_method ?? "—" },
                    { label: "Transaction Date",     value: receipt.extracted_date ?? "—" },
                    { label: "Block Code",           value: receipt.block_code?.replace(/_/g, " ") ?? "None" },
                  ].map((f) => (
                    <div key={f.label} className={`rounded-xl border px-3 py-2 ${
                      (f as { flag?: boolean }).flag
                        ? "border-red-500/30 bg-red-500/5"
                        : "border-white/5 bg-white/[0.02]"
                    }`}>
                      <p className="text-[9px] uppercase tracking-wider text-white/30">{f.label}</p>
                      <p className={`mt-0.5 truncate font-mono text-[10px] font-bold ${
                        (f as { flag?: boolean }).flag ? "text-red-400" : "text-white"
                      }`}>{f.value}</p>
                      {(f as { flag?: boolean }).flag && (
                        <p className="text-[8px] text-red-400/70">⚠ Mismatch detected</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Security scores */}
              <div>
                <SectionHeader icon={ShieldAlert} title="Security Analysis Scores" subtitle="Higher = more suspicious" />
                <div className="space-y-2.5 rounded-xl border border-white/5 bg-white/[0.02] p-4">
                  <ScoreBar label="Overall Fraud Score"  value={receipt.fraud_score ?? 0}         dangerAt={50}  />
                  <ScoreBar label="Image Blur Score"     value={receipt.blur_score ?? 0}           dangerAt={60}  />
                  <ScoreBar label="Tamper Detection"     value={receipt.tamper_score ?? 0}         dangerAt={50}  />
                  <ScoreBar label="Layout Structure"     value={receipt.structure_score ?? 0}      dangerAt={55}  />
                  <ScoreBar label="AI Detection Score"   value={receipt.ai_detection_score ?? 0}   dangerAt={60}  />
                  <div className="mt-2 flex flex-wrap gap-1.5 text-[9px]">
                    {receipt.tamper_detected && <span className="rounded-full border border-red-500/30 bg-red-500/10 px-2 py-0.5 font-bold text-red-400">⚠ TAMPERED</span>}
                    {(receipt.structure_score ?? 0) >= 55 && <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 font-bold text-amber-400">⚠ FAKE LAYOUT</span>}
                    {(receipt.blur_score ?? 0) >= 60 && <span className="rounded-full border border-orange-500/30 bg-orange-500/10 px-2 py-0.5 font-bold text-orange-400">⚠ UNREADABLE</span>}
                    <span className="rounded-full bg-white/5 px-2 py-0.5 text-white/40">{receipt.receipt_field_count ?? 0} receipt fields</span>
                    <span className="rounded-full bg-white/5 px-2 py-0.5 text-white/40">OCR: {receipt.ocr_engine ?? "Tesseract"}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* === AI FRAUD ANALYSIS === */}
          {fraudFlags.length > 0 && (
            <div className="border-b border-white/[0.05] p-5">
              <SectionHeader icon={Cpu} title="AI Fraud Analysis" subtitle={`${fraudFlags.length} signal(s) detected — total ${(fraudFlags.filter(f => f.points > 0).reduce((s, f) => s + f.points, 0))} pts`} />
              <div className="space-y-2">
                {fraudFlags
                  .sort((a, b) => b.points - a.points)
                  .map((f, i) => (
                    <FraudSignalCard key={i} type={f.type} detail={f.detail} points={f.points} />
                  ))}
              </div>
            </div>
          )}

          {/* === TRANSACTION TIMELINE === */}
          <div className="border-b border-white/[0.05] p-5">
            <SectionHeader icon={Activity} title="Transaction Timeline" subtitle="Fraud investigation audit trail" />
            <div className="space-y-0">
              {timeline.map((event, i) => (
                <TimelineItem key={i} event={event} isLast={i === timeline.length - 1} />
              ))}
            </div>
          </div>

          {/* === USER SUBMISSION HISTORY === */}
          {receipt.user_receipt_history.length > 0 && (
            <div className="border-b border-white/[0.05] p-5">
              <SectionHeader
                icon={Fingerprint}
                title={`User Submission History (${receipt.user_receipt_history.length} receipts)`}
                subtitle={highRiskUser ? `⚠ ${blockedCount} blocked — HIGH RISK pattern detected` : "User's receipt submission pattern"}
              />
              <div className="overflow-hidden rounded-xl border border-white/5">
                <table className="w-full text-[10px]">
                  <thead>
                    <tr className="border-b border-white/5 text-white/30">
                      <th className="px-3 py-2 text-left font-semibold">Reference</th>
                      <th className="px-3 py-2 text-center font-semibold">Fraud</th>
                      <th className="px-3 py-2 text-center font-semibold">Status</th>
                      <th className="px-3 py-2 text-right font-semibold">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {receipt.user_receipt_history.map((h) => (
                      <tr key={h.id} className={`border-b border-white/[0.03] ${h.id === receipt.id ? "bg-purple-500/5" : ""}`}>
                        <td className="px-3 py-1.5 font-mono text-white/60">{h.manual_reference.slice(0, 24)} {h.id === receipt.id && <span className="text-purple-400">(current)</span>}</td>
                        <td className={`px-3 py-1.5 text-center font-bold ${h.fraud_score >= 100 ? "text-red-400" : h.fraud_score >= 50 ? "text-amber-400" : "text-emerald-400"}`}>{h.fraud_score}</td>
                        <td className={`px-3 py-1.5 text-center capitalize ${h.verification_status === "blocked" ? "text-red-400" : h.verification_status === "suspicious" ? "text-amber-400" : h.verification_status === "verified" ? "text-emerald-400" : "text-white/50"}`}>{h.verification_status}</td>
                        <td className="px-3 py-1.5 text-right text-white/35">{new Date(h.created_at).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* === INVESTIGATION NOTES === */}
          <div className="p-5">
            <SectionHeader icon={MessageSquare} title="Investigation Notes" subtitle="Internal admin notes — not visible to user" />
            {receipt.notes.length > 0 && (
              <div className="mb-3 space-y-2">
                {receipt.notes.map((n) => (
                  <div key={n.id} className={`rounded-xl px-3 py-2 text-[10px] ${n.is_internal ? "border border-amber-500/20 bg-amber-500/5 text-amber-200" : "border border-white/5 bg-white/[0.02] text-white/60"}`}>
                    <div className="mb-1 flex items-center justify-between">
                      <span className="font-bold">{n.admin_name ?? n.admin_id}</span>
                      <div className="flex items-center gap-2">
                        {n.is_internal && <span className="text-[9px] font-bold text-amber-400">INTERNAL</span>}
                        <span className="text-[9px] text-white/25">{new Date(n.created_at).toLocaleString()}</span>
                      </div>
                    </div>
                    <p className="leading-relaxed">{n.note}</p>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <input
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); addNote(); } }}
                placeholder="Add internal investigation note…"
                className="flex-1 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-white placeholder:text-white/25 focus:border-purple-500/30 focus:outline-none"
              />
              <button onClick={addNote} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white/60 hover:bg-white/10">
                Add
              </button>
            </div>
          </div>
        </div>

        {/* ── Action bar ── */}
        <div className="flex-shrink-0 border-t border-white/[0.08] bg-[#060e1a] p-4">
          {err && <p className="mb-2 text-[10px] text-red-400">{err}</p>}

          {confirmAction ? (
            /* Confirmation UI */
            <div className="space-y-3">
              <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
                <p className="text-xs font-bold text-white">{actionMeta(confirmAction).label}</p>
                <p className="mt-0.5 text-[10px] text-white/50">{actionMeta(confirmAction).desc}</p>
              </div>
              {actionMeta(confirmAction).needsNote && (
                <textarea
                  value={actionNotes}
                  onChange={(e) => setActionNotes(e.target.value)}
                  placeholder="Admin notes (required for this action)…"
                  rows={2}
                  className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-white placeholder:text-white/25 focus:border-purple-500/30 focus:outline-none resize-none"
                />
              )}
              <div className="flex gap-2">
                <button
                  onClick={executeAction}
                  disabled={submitting || (actionMeta(confirmAction).needsNote && !actionNotes.trim())}
                  className={`flex-1 rounded-xl px-4 py-2 text-xs font-bold text-white disabled:opacity-40 ${actionMeta(confirmAction).color}`}
                >
                  {submitting ? "Processing…" : `Confirm: ${actionMeta(confirmAction).label}`}
                </button>
                <button onClick={() => { setConfirmAction(null); setActionNotes(""); }} className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-white/60 hover:bg-white/10">
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            /* Action buttons */
            <div className="space-y-2">
              {/* Review actions */}
              <div className="flex flex-wrap gap-2">
                <button onClick={() => setConfirmAction("approve")}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500/15 border border-emerald-500/25 px-3 py-2 text-xs font-bold text-emerald-400 hover:bg-emerald-500/25">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Approve
                </button>
                <button onClick={() => setConfirmAction("reject")}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-red-500/15 border border-red-500/25 px-3 py-2 text-xs font-bold text-red-400 hover:bg-red-500/25">
                  <XCircle className="h-3.5 w-3.5" /> Reject
                </button>
                <button onClick={() => setConfirmAction("suspicious")}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-amber-500/15 border border-amber-500/25 px-3 py-2 text-xs font-bold text-amber-400 hover:bg-amber-500/25">
                  <AlertTriangle className="h-3.5 w-3.5" /> Manual Review
                </button>
                <button onClick={() => setConfirmAction("proof")}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-blue-500/15 border border-blue-500/25 px-3 py-2 text-xs font-bold text-blue-400 hover:bg-blue-500/25">
                  <FileText className="h-3.5 w-3.5" /> Request Proof
                </button>
              </div>
              {/* Security actions */}
              <div className="flex flex-wrap gap-2">
                <span className="self-center text-[9px] font-bold uppercase tracking-wider text-white/20">User actions:</span>
                <button onClick={() => setConfirmAction("flag")}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-orange-500/10 border border-orange-500/20 px-3 py-2 text-xs font-bold text-orange-400 hover:bg-orange-500/20">
                  <Flag className="h-3.5 w-3.5" /> Flag User
                </button>
                <button onClick={() => setConfirmAction("temp_ban_7")}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-rose-500/10 border border-rose-500/20 px-3 py-2 text-xs font-bold text-rose-400 hover:bg-rose-500/20">
                  <Pause className="h-3.5 w-3.5" /> Temp Ban 7d
                </button>
                <button onClick={() => setConfirmAction("temp_ban_30")}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600/10 border border-rose-600/20 px-3 py-2 text-xs font-bold text-rose-500 hover:bg-rose-600/20">
                  <Pause className="h-3.5 w-3.5" /> Temp Ban 30d
                </button>
                <button onClick={() => setConfirmAction("perm_ban")}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-black border border-red-500/30 px-3 py-2 text-xs font-bold text-red-500 hover:bg-red-500/10">
                  <Ban className="h-3.5 w-3.5" /> Permanent Ban
                </button>
              </div>
            </div>
          )}
        </div>
      </motion.div>

      {/* Full-screen image overlay */}
      <AnimatePresence>
        {fullImg && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-10 flex items-center justify-center bg-black/90 p-8"
            onClick={() => setFullImg(false)}
          >
            <button onClick={() => setFullImg(false)} className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-xl border border-white/20 bg-white/10 text-white hover:bg-white/20">
              <X className="h-4 w-4" />
            </button>
            <img src={receipt.image_url} alt="Full-size receipt" className="max-h-full max-w-full rounded-xl object-contain shadow-2xl" onClick={(e) => e.stopPropagation()} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
