/**
 * SocialNotifications.tsx — Social activity notification center.
 * Shows likes, comments, replies, follows, and mentions from the API.
 */
import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useLocation } from "wouter";
import { ArrowLeft, Bell, Heart, MessageCircle, UserPlus, AtSign, RefreshCw } from "lucide-react";
import {
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type Notification,
} from "@/lib/postsClient";

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return "now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`;
  if (diff < 604_800_000) return `${Math.floor(diff / 86_400_000)}d`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function notifIcon(type: Notification["type"]) {
  if (type === "like")    return <Heart className="h-4 w-4" style={{ color: "#f43f5e" }} />;
  if (type === "comment") return <MessageCircle className="h-4 w-4 text-blue-400" />;
  if (type === "reply")   return <MessageCircle className="h-4 w-4 text-sky-400" />;
  if (type === "follow")  return <UserPlus className="h-4 w-4 text-emerald-400" />;
  if (type === "mention") return <AtSign className="h-4 w-4 text-purple-400" />;
  return <Bell className="h-4 w-4 app-text-muted" />;
}

function notifText(n: Notification): string {
  const name = n.actor?.name || n.actor?.username || "Someone";
  if (n.type === "like")    return `${name} liked your post`;
  if (n.type === "comment") return `${name} commented on your post`;
  if (n.type === "reply")   return `${name} replied to your comment`;
  if (n.type === "follow")  return `${name} started following you`;
  if (n.type === "mention") return `${name} mentioned you`;
  return `${name} interacted with your content`;
}

function NotifSkeleton() {
  return (
    <div className="flex items-center gap-3 px-4 py-3 animate-pulse">
      <div className="h-11 w-11 rounded-full bg-white/8 shrink-0" />
      <div className="flex-1 space-y-2">
        <div className="h-3 bg-white/8 rounded-full w-3/4" />
        <div className="h-2.5 bg-white/5 rounded-full w-1/2" />
      </div>
      <div className="h-10 w-10 rounded-xl bg-white/5 shrink-0" />
    </div>
  );
}

export default function SocialNotificationsPage() {
  const [, navigate] = useLocation();
  const [items,   setItems]   = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const { notifications } = await fetchNotifications({ limit: 50 });
      setItems(notifications);
    } catch {
      setError("Couldn't load notifications. Tap to retry.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const markAll = useCallback(async () => {
    await markAllNotificationsRead().catch(() => {});
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
  }, []);

  const tapItem = useCallback(async (n: Notification) => {
    if (!n.read) {
      await markNotificationRead(n.id).catch(() => {});
      setItems((prev) => prev.map((x) => x.id === n.id ? { ...x, read: true } : x));
    }
    if (n.post_id) navigate(`/post/${n.post_id}`);
    else if (n.actor?.id) navigate(`/profile/${n.actor.id}`);
  }, [navigate]);

  const unreadCount = items.filter((n) => !n.read).length;

  return (
    <div className="app-bg min-h-[100dvh] pb-28">
      {/* Header */}
      <div className="app-header sticky top-0 z-30 flex items-center gap-3 px-4"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 10px)", paddingBottom: 10 }}>
        <motion.button
          whileTap={{ scale: 0.88 }}
          onClick={() => navigate("/")}
          className="grid h-9 w-9 place-items-center rounded-full app-surface app-text"
        >
          <ArrowLeft className="h-4 w-4" />
        </motion.button>
        <h1 className="flex-1 font-display text-[17px] font-semibold app-text">Activity</h1>

        {unreadCount > 0 && (
          <motion.button
            whileTap={{ scale: 0.92 }}
            onClick={markAll}
            className="text-[11px] font-semibold px-3 py-1.5 rounded-full"
            style={{ background: "rgba(168,85,247,0.15)", color: "var(--accent-primary)" }}
          >
            Mark all read
          </motion.button>
        )}
        <motion.button whileTap={{ scale: 0.88 }} onClick={() => load(true)}
          className="grid h-9 w-9 place-items-center rounded-full app-surface app-text">
          <RefreshCw className="h-4 w-4" />
        </motion.button>
      </div>

      {/* Content */}
      <div>
        {loading && (
          <div>
            {[...Array(8)].map((_, i) => <NotifSkeleton key={i} />)}
          </div>
        )}

        {!loading && error && (
          <motion.button
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            onClick={() => load()}
            className="mx-auto mt-16 flex flex-col items-center gap-3 text-center"
          >
            <Bell className="h-10 w-10 app-text-muted opacity-40" />
            <p className="text-sm app-text-muted">{error}</p>
          </motion.button>
        )}

        {!loading && !error && items.length === 0 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            className="mt-24 flex flex-col items-center gap-4 px-8 text-center"
          >
            <div className="h-16 w-16 rounded-2xl grid place-items-center"
              style={{ background: "rgba(168,85,247,0.12)", border: "1px solid rgba(168,85,247,0.2)" }}>
              <Bell className="h-7 w-7" style={{ color: "var(--accent-primary)", opacity: 0.7 }} />
            </div>
            <div>
              <p className="font-semibold app-text">No activity yet</p>
              <p className="mt-1 text-sm app-text-muted">Likes, comments, and follows will appear here.</p>
            </div>
          </motion.div>
        )}

        <AnimatePresence initial={false}>
          {!loading && items.map((n, i) => (
            <motion.button
              key={n.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i * 0.02, 0.12) }}
              onClick={() => tapItem(n)}
              className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors"
              style={{ background: n.read ? "transparent" : "rgba(168,85,247,0.04)" }}
            >
              {/* Avatar */}
              <div className="relative shrink-0">
                {n.actor?.avatar_url ? (
                  <img src={n.actor.avatar_url} alt="" className="h-11 w-11 rounded-full object-cover"
                    style={{ border: "1.5px solid rgba(255,255,255,0.1)" }} />
                ) : (
                  <div className="h-11 w-11 rounded-full grid place-items-center text-sm font-bold text-white"
                    style={{ background: "linear-gradient(135deg,var(--accent-primary),var(--accent-secondary))" }}>
                    {(n.actor?.name || "?").charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="absolute -bottom-0.5 -right-0.5 h-5 w-5 rounded-full grid place-items-center"
                  style={{ background: "#111", border: "1px solid rgba(255,255,255,0.08)" }}>
                  {notifIcon(n.type)}
                </div>
              </div>

              {/* Text */}
              <div className="flex-1 min-w-0">
                <p className="text-[13px] leading-snug app-text">{notifText(n)}</p>
                <p className="mt-0.5 text-[11px] app-text-muted">{relTime(n.created_at)}</p>
              </div>

              {/* Unread dot */}
              {!n.read && (
                <div className="h-2.5 w-2.5 rounded-full shrink-0"
                  style={{ background: "var(--accent-primary)", boxShadow: "0 0 6px 1px var(--accent-glow)" }} />
              )}
            </motion.button>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
