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
        paddingTop:    `calc(env(safe-area-inset-top, 0px) + 12px)`,
        paddingBottom: 12,
        minHeight:     64,
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

      {/* ── Right: Action buttons ────────────────────────────────────────────
          Spacing spec (Style 3 — Minimal & Flat, mobile-first 360px safe):
            Between icon buttons (Search / Bell / Chat / Bell) : 8px flex-gap
            Before Creator badge                               : 10px (8px gap + 2px marginLeft)
            Before Live button                                 : 10px (8px gap + 2px marginLeft)
            After Live / before Refresh                        : 8px flex-gap
      ────────────────────────────────────────────────────────────────────── */}
      <div className="flex items-center" style={{ gap: 8 }}>

        {/* Search — Home only */}
        {isHome && (
          <IconBtn onClick={() => navigate("/search")}>
            <Search style={{ width: 16, height: 16, strokeWidth: 1.9 }} />
          </IconBtn>
        )}

        {/* Notification bell */}
        {user && (
          <IconBtn onClick={() => navigate("/notifications")}>
            <Bell style={{ width: 16, height: 16, strokeWidth: 1.9 }} />
            {notifUnread > 0 && (
              <span
                className="absolute right-1 top-1 flex h-[14px] min-w-[14px] items-center justify-center rounded-full px-0.5 text-[8px] font-bold text-white"
                style={{ background: "var(--accent-primary)" }}
              >
                {notifUnread > 9 ? "9+" : notifUnread}
              </span>
            )}
          </IconBtn>
        )}

        {/* Chat */}
        <IconBtn onClick={() => navigate("/messages")}>
          <MessageCircle style={{ width: 16, height: 16, strokeWidth: 1.9 }} />
          {unread && (
            <span
              className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full"
              style={{ background: "var(--accent-primary)" }}
            />
          )}
        </IconBtn>

        {/* Refund notification bell (second bell) */}
        {user && <RefundNotificationBell />}

        {/* Creator / Credits badge — 10px total gap = 8px flex-gap + 2px marginLeft */}
        {user && (
          <div style={{ marginLeft: 2, flexShrink: 0 }}>
            <CreditsBadge
              compact
              className="justify-center text-[12px]"
              style={{
                height:      38,
                minWidth:    52,
                borderRadius: 19,
                paddingTop:   0,
                paddingBottom: 0,
              }}
            />
          </div>
        )}

        {/* ── Home-only: Live + Refresh ────────────────────────────────── */}
        {isHome && (
          <>
            {/* Live — 10px total gap = 8px flex-gap + 2px marginLeft */}
            <motion.button
              whileTap={{ scale: 0.92 }}
              onClick={() => navigate("/go-live")}
              aria-label="Go Live"
              style={{
                marginLeft:     2,
                display:        "flex",
                alignItems:     "center",
                justifyContent: "center",
                gap:            4,
                height:         38,
                minWidth:       68,
                borderRadius:   19,
                background:     "rgba(239,68,68,0.12)",
                border:         "1px solid rgba(239,68,68,0.28)",
                cursor:         "pointer",
                padding:        "0 10px",
                flexShrink:     0,
              }}
            >
              <Radio style={{ width: 11, height: 11, color: "#f87171", flexShrink: 0 }} />
              <span style={{ fontSize: 12, fontWeight: 700, color: "#f87171", letterSpacing: "0.02em", whiteSpace: "nowrap" }}>
                Live
              </span>
            </motion.button>

            {/* Refresh — 8px gap from Live (flex gap) */}
            <motion.button
              whileTap={{ scale: 0.88 }}
              onClick={handleRefresh}
              aria-label="Refresh feed"
              className="app-surface relative grid place-items-center app-text"
              style={{ width: 38, height: 38, borderRadius: "50%", flexShrink: 0 }}
            >
              <RefreshCw style={{ width: 14, height: 14 }} />
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
      style={{ width: 38, height: 38, borderRadius: "50%", flexShrink: 0 }}
    >
      {children}
    </motion.button>
  );
}
