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
  const isAuthenticated = useAppStore((s) => s.isAuthenticated);
  const unread = useAppStore((s) => s.chats.some((c) => c.unread));
  const navHidden = useAppStore((s) => s.navHidden);
  const isHome    = location === "/";
  const isExplore = location === "/explore" || location.startsWith("/explore");
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
    (isExplore && isAuthenticated)   ? "Explore"  :
    null;

  const handleRefresh = () => {
    window.dispatchEvent(new CustomEvent("socia:refresh-feed"));
  };

  return (
    <div
      style={{
        transform:  navHidden ? "translateY(-100%)" : "translateY(0)",
        transition: "transform 0.3s cubic-bezier(0.25,0.46,0.45,0.94)",
        willChange: "transform",
      }}
    >
    <header
      className="app-header flex items-center justify-between px-4"
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
          : title
          ? <h1 className="font-display text-[17px] font-semibold app-text">{title}</h1>
          : <h1 className="font-display text-[21px] font-bold text-gradient">Socia</h1>
        }
      </motion.div>

      {/* ── Right: Action buttons ── */}
      <div className="flex items-center" style={{ gap: 8 }}>

        {/* Guest CTAs — hidden on Explore (search icon replaces them there) */}
        {!isAuthenticated && !isExplore && (
          <>
            <motion.button
              whileTap={{ scale: 0.93 }}
              onClick={() => navigate("/auth")}
              className="rounded-full px-3 py-1.5 text-[12px] font-semibold"
              style={{
                background: "rgba(255,255,255,0.07)",
                border: "1px solid rgba(255,255,255,0.14)",
                color: "rgba(255,255,255,0.8)",
                height: 30,
                flexShrink: 0,
              }}
            >
              Log In
            </motion.button>
            <motion.button
              whileTap={{ scale: 0.93 }}
              onClick={() => navigate("/auth?mode=signup")}
              className="rounded-full px-3 py-1.5 text-[12px] font-bold text-white"
              style={{
                background: "#1D9BF0",
                height: 30,
                flexShrink: 0,
              }}
            >
              Sign Up
            </motion.button>
          </>
        )}

        {/* Guest on Explore — single search icon only */}
        {!isAuthenticated && isExplore && (
          <IconBtn onClick={() => navigate("/search")}>
            <Search style={{ width: 15, height: 15, strokeWidth: 1.9 }} />
          </IconBtn>
        )}

        {/* Authenticated-only actions */}
        {isAuthenticated && (
          <>
            {/* Search — Home only */}
            {isHome && (
              <IconBtn onClick={() => navigate("/search")}>
                <Search style={{ width: 15, height: 15, strokeWidth: 1.9 }} />
              </IconBtn>
            )}

            {/* Notification bell */}
            {user && (
              <IconBtn onClick={() => navigate("/notifications")}>
                <Bell style={{ width: 15, height: 15, strokeWidth: 1.9 }} />
                {notifUnread > 0 && (
                  <span
                    className="absolute right-0.5 top-0.5 flex h-[13px] min-w-[13px] items-center justify-center rounded-full px-0.5 text-[8px] font-bold text-white"
                    style={{ background: "var(--accent-primary)" }}
                  >
                    {notifUnread > 9 ? "9+" : notifUnread}
                  </span>
                )}
              </IconBtn>
            )}

            {/* Chat */}
            <IconBtn onClick={() => navigate("/messages")}>
              <MessageCircle style={{ width: 15, height: 15, strokeWidth: 1.9 }} />
              {unread && (
                <span
                  className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full"
                  style={{ background: "var(--accent-primary)" }}
                />
              )}
            </IconBtn>

            {/* Refund notification bell */}
            {user && <RefundNotificationBell />}

            {/* Creator / Credits badge */}
            {user && (
              <div style={{ marginLeft: 2, flexShrink: 0 }}>
                <CreditsBadge
                  compact
                  className="justify-center text-[11px]"
                  style={{
                    height:        30,
                    minWidth:      44,
                    borderRadius:  15,
                    paddingTop:    0,
                    paddingBottom: 0,
                  }}
                />
              </div>
            )}

            {/* Home-only: Live + Refresh */}
            {isHome && (
              <>
                <motion.button
                  whileTap={{ scale: 0.92 }}
                  onClick={() => navigate("/go-live")}
                  aria-label="Go Live"
                  style={{
                    marginLeft:     2,
                    display:        "flex",
                    alignItems:     "center",
                    justifyContent: "center",
                    gap:            3,
                    height:         30,
                    minWidth:       58,
                    borderRadius:   15,
                    background:     "rgba(239,68,68,0.12)",
                    border:         "1px solid rgba(239,68,68,0.28)",
                    cursor:         "pointer",
                    padding:        "0 8px",
                    flexShrink:     0,
                  }}
                >
                  <Radio style={{ width: 10, height: 10, color: "#f87171", flexShrink: 0 }} />
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#f87171", letterSpacing: "0.02em", whiteSpace: "nowrap" }}>
                    Live
                  </span>
                </motion.button>

                <motion.button
                  whileTap={{ scale: 0.88 }}
                  onClick={handleRefresh}
                  aria-label="Refresh feed"
                  className="app-surface relative grid place-items-center app-text"
                  style={{ width: 32, height: 32, borderRadius: "50%", flexShrink: 0 }}
                >
                  <RefreshCw style={{ width: 13, height: 13 }} />
                </motion.button>
              </>
            )}
          </>
        )}
      </div>
    </header>
    </div>
  );
}

function IconBtn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <motion.button
      whileTap={{ scale: 0.88 }}
      onClick={onClick}
      className="app-surface relative grid place-items-center rounded-full app-text"
      style={{ width: 32, height: 32, borderRadius: "50%", flexShrink: 0 }}
    >
      {children}
    </motion.button>
  );
}
