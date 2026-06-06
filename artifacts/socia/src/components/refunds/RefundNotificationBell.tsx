/**
 * RefundNotificationBell — notification bell for refund thread updates.
 *
 * Shows a badge with unread count. Clicking opens a dropdown listing
 * recent notifications. Clicking a notification navigates to the
 * refund thread and marks it as read. Uses Supabase Realtime for live
 * updates following the useSupabaseChat.ts pattern.
 */
import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bell, CheckCircle2, Clock, ShieldCheck, XCircle, Info,
  FileCheck, CheckCheck,
} from "lucide-react";
import { useRefundNotifications, type RefundNotification } from "@/lib/useRefundThread";

const TYPE_CONFIG: Record<string, { icon: typeof Bell; color: string }> = {
  status_update:   { icon: ShieldCheck,  color: "text-blue-300"    },
  new_message:     { icon: Bell,         color: "text-purple-300"  },
  decision:        { icon: CheckCircle2, color: "text-emerald-300" },
  proof_requested: { icon: FileCheck,    color: "text-amber-300"   },
  info:            { icon: Info,         color: "text-white/50"    },
};

function NotifItem({
  notif, onClick,
}: { notif: RefundNotification; onClick: () => void }) {
  const cfg = TYPE_CONFIG[notif.type] ?? TYPE_CONFIG["info"]!;
  const Icon = cfg.icon;

  return (
    <button
      onClick={onClick}
      className={`w-full flex items-start gap-3 px-3 py-2.5 text-left rounded-xl transition hover:bg-white/[0.05] ${
        notif.is_read ? "opacity-55" : ""
      }`}
    >
      <div className={`mt-0.5 shrink-0 h-6 w-6 grid place-items-center rounded-full ${notif.is_read ? "bg-white/5" : "bg-white/10"}`}>
        <Icon className={`h-3 w-3 ${cfg.color}`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className={`text-[12px] font-semibold truncate ${notif.is_read ? "text-white/60" : "text-white"}`}>
            {notif.title}
          </span>
          {!notif.is_read && (
            <span className="shrink-0 h-1.5 w-1.5 rounded-full bg-purple-500" />
          )}
        </div>
        <div className="text-[10.5px] text-white/40 mt-0.5 line-clamp-2">{notif.message}</div>
        <div className="text-[9.5px] text-white/25 mt-0.5">
          {new Date(notif.created_at).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
        </div>
      </div>
    </button>
  );
}

export function RefundNotificationBell() {
  const [, navigate]     = useLocation();
  const [open, setOpen]  = useState(false);
  const dropRef = useRef<HTMLDivElement>(null);
  const { notifications, unreadCount, markRead, markAllRead } = useRefundNotifications();

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handleNotifClick = async (n: RefundNotification) => {
    if (!n.is_read) await markRead(n.id);
    setOpen(false);
    navigate(`/billing/refund/${n.refund_request_id}`);
  };

  if (notifications.length === 0 && unreadCount === 0) return null;

  return (
    <div className="relative" ref={dropRef}>
      <motion.button
        whileTap={{ scale: 0.88 }}
        onClick={() => setOpen((o) => !o)}
        className="app-surface relative grid place-items-center rounded-full app-text"
        style={{ width: 44, height: 44, borderRadius: "50%", flexShrink: 0 }}
      >
        <Bell style={{ width: 17, height: 17, strokeWidth: 1.9 }} />
        {unreadCount > 0 && (
          <motion.span
            key={unreadCount}
            initial={{ scale: 0.5 }} animate={{ scale: 1 }}
            className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold text-white"
            style={{ background: "var(--accent-primary)", boxShadow: "0 0 6px 2px var(--accent-glow)" }}
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </motion.span>
        )}
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.96 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-11 z-50 w-80 overflow-hidden rounded-2xl border border-white/[0.05] bg-[#0a0a0a] shadow-2xl"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-3 py-2.5 border-b border-white/8">
              <span className="text-[11px] font-bold uppercase tracking-wider text-white/50">
                Refund Updates
              </span>
              {unreadCount > 0 && (
                <button
                  onClick={markAllRead}
                  className="flex items-center gap-1 text-[10px] text-purple-400 hover:text-purple-300"
                >
                  <CheckCheck className="h-3 w-3" /> Mark all read
                </button>
              )}
            </div>

            {/* Notification list */}
            <div className="max-h-80 overflow-y-auto p-1.5 space-y-0.5">
              {notifications.length === 0 ? (
                <div className="py-8 text-center text-[12px] text-white/30">
                  No notifications
                </div>
              ) : (
                notifications.slice(0, 15).map((n) => (
                  <NotifItem key={n.id} notif={n} onClick={() => handleNotifClick(n)} />
                ))
              )}
            </div>

            {/* Footer */}
            <div className="border-t border-white/8 px-3 py-2">
              <button
                onClick={() => { setOpen(false); navigate("/billing"); }}
                className="w-full text-center text-[11px] text-white/40 hover:text-white/70"
              >
                View all refunds →
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
