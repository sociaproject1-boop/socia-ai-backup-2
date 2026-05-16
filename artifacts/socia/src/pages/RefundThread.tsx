/**
 * /billing/refund/:id — User-facing refund support thread.
 *
 * Shows the full conversation timeline, status, decision details,
 * and a compose box for open refunds. Live-updates via Supabase Realtime.
 */
import { useEffect, useRef, useState } from "react";
import { useLocation, useParams } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, Send, Paperclip, Clock, CheckCircle2, XCircle,
  AlertTriangle, ShieldCheck, MessageSquare, RefreshCw,
  Info, Lock,
} from "lucide-react";
import { useRefundThread, type RefundMessage } from "@/lib/useRefundThread";
import { supabase } from "@/lib/supabase";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
async function authFetch(path: string, init: RequestInit = {}) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token ?? "";
  return fetch(`${BASE}${path}`, {
    ...init, credentials: "include",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
}

interface RefundDetail {
  id: string; subscription_type: string; plan_code: string;
  payment_amount_php: number; estimated_refundable_php: number;
  approved_amount_php: number | null; reason: string; status: string;
  payout_status: string | null; payout_at: string | null;
  admin_notes: string | null; payment_reference: string | null;
  created_at: string; updated_at: string;
}

const STATUS_CONFIG: Record<string, { label: string; icon: typeof Clock; color: string; bg: string; border: string }> = {
  pending:   { label: "Pending Review",        icon: Clock,         color: "text-amber-300",   bg: "bg-amber-500/10",   border: "border-amber-500/30" },
  reviewing: { label: "Under Investigation",   icon: ShieldCheck,   color: "text-blue-300",    bg: "bg-blue-500/10",    border: "border-blue-500/30" },
  approved:  { label: "Approved",              icon: CheckCircle2,  color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/30" },
  partial:   { label: "Partially Approved",    icon: CheckCircle2,  color: "text-teal-300",    bg: "bg-teal-500/10",    border: "border-teal-500/30" },
  rejected:  { label: "Rejected",              icon: XCircle,       color: "text-rose-400",    bg: "bg-rose-500/10",    border: "border-rose-500/30" },
};

function StatusBanner({ refund }: { refund: RefundDetail }) {
  const cfg = STATUS_CONFIG[refund.status] ?? STATUS_CONFIG["pending"]!;
  const Icon = cfg.icon;
  const isDone = ["approved", "partial", "rejected"].includes(refund.status);

  return (
    <div className={`rounded-2xl border ${cfg.border} ${cfg.bg} p-4`}>
      <div className={`flex items-center gap-2 text-sm font-semibold ${cfg.color}`}>
        <Icon className="h-4 w-4" />
        {cfg.label}
        {refund.payout_status === "sent" && (
          <span className="ml-auto rounded-full bg-emerald-500/20 border border-emerald-500/30 px-2 py-0.5 text-[10px] text-emerald-300 font-bold">
            REFUNDED ✓
          </span>
        )}
        {refund.payout_status === "queued" && (
          <span className="ml-auto rounded-full bg-blue-500/20 border border-blue-500/30 px-2 py-0.5 text-[10px] text-blue-300 font-bold">
            PAYOUT QUEUED
          </span>
        )}
      </div>

      {isDone && (
        <div className="mt-2 text-[12.5px] text-white/70 space-y-1">
          {(refund.status === "approved" || refund.status === "partial") && refund.approved_amount_php != null && (
            <div>
              Approved amount: <span className={`font-bold ${cfg.color}`}>
                ₱{Number(refund.approved_amount_php).toLocaleString()}
              </span>
            </div>
          )}
          {refund.admin_notes && (
            <div className="text-white/55 text-[11.5px] italic">{refund.admin_notes}</div>
          )}
        </div>
      )}

      <div className="mt-2 grid grid-cols-2 gap-2 text-[10.5px] text-white/40">
        <span>Submitted {new Date(refund.created_at).toLocaleDateString()}</span>
        <span className="text-right">₱{refund.payment_amount_php} paid</span>
      </div>
    </div>
  );
}

function MessageBubble({ msg, myUserId }: { msg: RefundMessage; myUserId: string | null }) {
  const isMe     = msg.sender_role === "user" && msg.sender_id === myUserId;
  const isSystem = msg.sender_role === "system";
  const isAdmin  = msg.sender_role === "admin";

  if (isSystem) {
    return (
      <div className="flex justify-center my-2">
        <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 max-w-xs text-center">
          <Info className="h-3 w-3 text-white/40 shrink-0" />
          <span className="text-[11px] text-white/55">{msg.message}</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex ${isMe ? "justify-end" : "justify-start"} mb-2`}>
      <div className={`max-w-[78%] space-y-1`}>
        {!isMe && (
          <div className="text-[9.5px] font-semibold uppercase tracking-wider px-1"
               style={{ color: isAdmin ? "#a78bfa" : "rgba(255,255,255,0.35)" }}>
            {isAdmin ? "Support Team" : "You"}
          </div>
        )}
        <div
          className={`rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed ${
            isMe
              ? "rounded-br-sm text-white"
              : "rounded-bl-sm bg-white/[0.06] border border-white/8 text-white/90"
          }`}
          style={isMe ? { background: "linear-gradient(135deg, #7c3aed, #4f46e5)" } : undefined}
        >
          {msg.message}
        </div>
        {msg.attachment_url && (
          <a href={msg.attachment_url} target="_blank" rel="noopener noreferrer"
             className="flex items-center gap-1.5 text-[10.5px] text-purple-400 hover:text-purple-300 px-1">
            <Paperclip className="h-3 w-3" /> View attachment
          </a>
        )}
        <div className={`text-[9.5px] text-white/25 px-1 ${isMe ? "text-right" : ""}`}>
          {new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </div>
      </div>
    </div>
  );
}

function ComposeBox({ refundId, onSent }: { refundId: string; onSent: () => void }) {
  const { sendMessage, sending } = useRefundThread(refundId);
  const [text, setText] = useState("");

  const submit = async () => {
    const ok = await sendMessage(text);
    if (ok) { setText(""); onSent(); }
  };

  return (
    <div className="border-t border-white/[0.05] bg-[#000000] px-4 py-3">
      <div className="flex items-end gap-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void submit(); } }}
          placeholder="Type a message…"
          rows={2}
          disabled={sending}
          className="flex-1 resize-none rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-[13px] text-white placeholder:text-white/25 focus:outline-none focus:border-purple-500/40 disabled:opacity-50"
        />
        <motion.button
          whileTap={{ scale: 0.88 }}
          onClick={submit}
          disabled={!text.trim() || sending}
          className="h-10 w-10 grid place-items-center rounded-2xl text-white disabled:opacity-40"
          style={{ background: "linear-gradient(135deg, #7c3aed, #4f46e5)" }}
        >
          {sending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </motion.button>
      </div>
    </div>
  );
}

export default function RefundThread() {
  const [, navigate] = useLocation();
  const { id } = useParams<{ id: string }>();
  const [refund, setRefund]     = useState<RefundDetail | null>(null);
  const [refundErr, setRefundErr] = useState<string | null>(null);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const { messages, loading, error, reload } = useRefundThread(id ?? null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setMyUserId(data.user?.id ?? null));
  }, []);

  useEffect(() => {
    if (!id) return;
    authFetch(`/api/refunds/my/${id}`)
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then((j: { refund: RefundDetail }) => setRefund(j.refund))
      .catch(() => setRefundErr("Could not load refund details."));
  }, [id]);

  useEffect(() => {
    if (!loading) setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 80);
  }, [messages, loading]);

  const isDone = refund ? ["approved", "partial", "rejected"].includes(refund.status) : false;

  return (
    <div className="fixed inset-0 flex flex-col bg-[#06060c]">
      {/* Header */}
      <div className="app-header sticky top-0 z-30 flex items-center gap-3 px-4"
           style={{ paddingTop: `calc(env(safe-area-inset-top, 0px) + 10px)`, paddingBottom: 10 }}>
        <button onClick={() => navigate("/billing")}
                className="grid h-9 w-9 place-items-center rounded-full app-surface text-white/60 hover:text-white">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="text-[15px] font-semibold text-white">Refund Support</div>
          {refund && (
            <div className="text-[10.5px] text-white/35 truncate">
              {refund.subscription_type === "ai" ? "AI Subscription" : "Creator Plan"} · {refund.plan_code.toUpperCase()}
            </div>
          )}
        </div>
        <button onClick={reload} className="grid h-9 w-9 place-items-center rounded-full app-surface text-white/40 hover:text-white">
          <RefreshCw className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto px-4 pb-2 space-y-3 pt-3">
        {refundErr && (
          <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-300">
            {refundErr}
          </div>
        )}

        {refund && <StatusBanner refund={refund} />}

        {/* Welcome system message when no messages */}
        {!loading && messages.length === 0 && !error && (
          <div className="flex justify-center my-4">
            <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5">
              <MessageSquare className="h-3 w-3 text-white/40" />
              <span className="text-[11px] text-white/50">
                {isDone ? "This thread is closed." : "Start the conversation — our team will reply shortly."}
              </span>
            </div>
          </div>
        )}

        {loading && (
          <div className="flex justify-center py-8">
            <RefreshCw className="h-5 w-5 animate-spin text-white/30" />
          </div>
        )}

        {error && (
          <div className="text-center text-[12px] text-rose-300 py-4">{error}</div>
        )}

        <AnimatePresence initial={false}>
          {messages.map((msg) => (
            <motion.div key={msg.id}
              initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.18 }}>
              <MessageBubble msg={msg} myUserId={myUserId} />
            </motion.div>
          ))}
        </AnimatePresence>

        {isDone && messages.length > 0 && (
          <div className="flex justify-center my-3">
            <div className="flex items-center gap-2 rounded-full border border-white/8 bg-white/[0.03] px-3 py-1.5">
              <Lock className="h-3 w-3 text-white/30" />
              <span className="text-[10.5px] text-white/35">Thread closed · {STATUS_CONFIG[refund!.status]?.label}</span>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Compose box — only for open refunds */}
      {!isDone && id && (
        <ComposeBox refundId={id} onSent={reload} />
      )}

      {/* Info bar for closed threads */}
      {isDone && (
        <div className="border-t border-white/5 bg-[#06060c]/80 px-4 py-3 text-center">
          <span className="text-[11.5px] text-white/30">
            <AlertTriangle className="inline h-3 w-3 mr-1" />
            This request has been resolved. Contact support for further assistance.
          </span>
        </div>
      )}
    </div>
  );
}
