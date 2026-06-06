import { useLocation } from "wouter";
import { MessageCircle, Search, Bell, Radio, RefreshCw } from "lucide-react";
import { useAppStore } from "@/lib/store";
import { motion } from "framer-motion";
import { CreditsBadge } from "@/components/billing/CreditsBadge";
import { RefundNotificationBell } from "@/components/refunds/RefundNotificationBell";
import { useEffect, useState } from "react";
import { fetchNotifications } from "@/lib/postsClient";

export function TopBar() {
  const [location, navigate] = useLocation();
  const user   = useAppStore((s) => s.user);
  const unread = useAppStore((s) => s.chats.some((c) => c.unread));
  const isHome = location === "/";
  const [notifUnread, setNotifUnread] = useState(0);

  useEffect(() => {
    if (!user) return;
    fetchNotifications({ limit: 50 })
      .then(({ notifications }) => {
        setNotifUnread(notifications.filter((n) => !n.read).length);
      })
      .catch(() => {});
  }, [user, location]);

  const title =
    location.startsWith("/create")   ? "Create"   :
    location.startsWith("/messages") ? "Messages" :
    location.startsWith("/profile")  ? "Profile"  :
    null;

  const handleRefresh = () => {
    window.dispatchEvent(new CustomEvent("socia:refresh-feed"));
  };

  return (
    <header
      className="app-header sticky top-0 z-30 flex items-center justify-between px-4"
      style={{
        paddingTop:    `calc(env(safe-area-inset-top, 0px) + 14px)`,
        paddingBottom: 14,
        minHeight:     72,
      }}
    >
      {/* ── Left: Logo / Page title ── */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.25 }}
      >
        {isHome
          ? <h1 className="font-display text-[21px] font-bold text-gradient">Socia</h1>
          : <h1 className="font-display text-[17px] font-semibold app-text">{title}</h1>
        }
      </motion.div>

      {/* ── Right: Action buttons ─────────────────────────────────────────── */}
      {/*
        Gap spec:
          Search → Bell → Chat → Bell → Creator : 16px between each
          Creator → Live                          : 24px (16px base + 8px marginLeft on Live)
          Live → Refresh                          : 16px (from flex gap)
      */}
      <div className="flex items-center" style={{ gap: 16 }}>

        {/* Search — Home only */}
        {isHome && (
          <IconBtn onClick={() => {}}>
            <Search style={{ width: 17, height: 17, strokeWidth: 1.9 }} />
          </IconBtn>
        )}

        {/* Notification bell */}
        {user && (
          <IconBtn onClick={() => navigate("/notifications")}>
            <Bell style={{ width: 17, height: 17, strokeWidth: 1.9 }} />
            {notifUnread > 0 && (
              <span
                className="absolute right-2 top-2 flex h-4 min-w-4 items-center justify-center rounded-full px-0.5 text-[9px] font-bold text-white"
                style={{ background: "var(--accent-primary)", boxShadow: "0 0 6px 1px var(--accent-glow)" }}
              >
                {notifUnread > 9 ? "9+" : notifUnread}
              </span>
            )}
          </IconBtn>
        )}

        {/* Chat */}
        <IconBtn onClick={() => navigate("/messages")}>
          <MessageCircle style={{ width: 17, height: 17, strokeWidth: 1.9 }} />
          {unread && (
            <span
              className="absolute right-2 top-2 h-2 w-2 rounded-full"
              style={{ background: "var(--accent-primary)", boxShadow: "0 0 6px 1px var(--accent-glow)" }}
            />
          )}
        </IconBtn>

        {/* Refund notification bell (second bell) */}
        {user && <RefundNotificationBell />}

        {/* Creator / Credits badge — pill button */}
        {user && (
          <CreditsBadge
            compact
            className="h-11 min-w-[64px] justify-center rounded-[22px] text-[12px]"
          />
        )}

        {/* ── Home-only: Live + Refresh ────────────────────────────────── */}
        {isHome && (
          <>
            {/* Live — marginLeft: 8 adds extra 8px → total 24px gap from Creator */}
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={() => navigate("/go-live")}
              aria-label="Go Live"
              style={{
                display:        "flex",
                alignItems:     "center",
                justifyContent: "center",
                gap:            6,
                height:         44,
                minWidth:       88,
                borderRadius:   22,
                marginLeft:     8,
                background:     "rgba(239,68,68,0.14)",
                border:         "1px solid rgba(239,68,68,0.35)",
                cursor:         "pointer",
                padding:        "0 14px",
                flexShrink:     0,
              }}
            >
              <Radio style={{ width: 13, height: 13, color: "#f87171", flexShrink: 0 }} />
              <span style={{ fontSize: 13, fontWeight: 700, color: "#f87171", letterSpacing: "0.02em", whiteSpace: "nowrap" }}>
                Live
              </span>
            </motion.button>

            {/* Refresh — 16px gap from Live (flex gap) */}
            <motion.button
              whileTap={{ scale: 0.85 }}
              onClick={handleRefresh}
              aria-label="Refresh feed"
              className="app-surface relative grid place-items-center app-text"
              style={{ width: 44, height: 44, borderRadius: "50%", flexShrink: 0 }}
            >
              <RefreshCw style={{ width: 16, height: 16 }} />
            </motion.button>
          </>
        )}
      </div>
    </header>
  );
}

function IconBtn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <motion.button
      whileTap={{ scale: 0.88 }}
      onClick={onClick}
      className="app-surface relative grid place-items-center rounded-full app-text"
      style={{ width: 44, height: 44, borderRadius: "50%", flexShrink: 0 }}
    >
      {children}
    </motion.button>
  );
}
