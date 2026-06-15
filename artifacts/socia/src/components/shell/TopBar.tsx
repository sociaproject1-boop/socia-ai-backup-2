/**
 * TopBar.tsx — X (Twitter)-style top header.
 *
 * Home layout:  [Avatar]    SOCIA    [Founding Supporter]
 * Other pages:  [Avatar]  Page Title  (right actions)
 */
import { useLocation } from "wouter";
import { MessageCircle, Bell } from "lucide-react";
import { useAppStore } from "@/lib/store";
import { useDrawerStore } from "@/lib/drawerStore";
import { motion } from "framer-motion";
import { RefundNotificationBell } from "@/components/refunds/RefundNotificationBell";
import { useEffect, useState } from "react";
import { fetchNotifications } from "@/lib/postsClient";

/* ── Founding Supporter button (replaces Subscribe on X) ─────────────────── */
function FoundingSupporterBtn({ onClick }: { onClick: () => void }) {
  return (
    <motion.button
      whileTap={{ scale: 0.93 }}
      onClick={onClick}
      style={{
        height:       32,
        padding:      "0 12px",
        borderRadius: 9999,
        border:       "1px solid rgba(255,255,255,0.22)",
        background:   "transparent",
        fontSize:     13,
        fontWeight:   700,
        color:        "#E7E9EA",
        cursor:       "pointer",
        whiteSpace:   "nowrap",
        flexShrink:   0,
        letterSpacing: "-0.01em",
      }}
    >
      Founding Supporter
    </motion.button>
  );
}

/* ── Avatar trigger ──────────────────────────────────────────────────────── */
function AvatarBtn({ user, onPress }: {
  user: { name: string; avatar: string } | null;
  onPress: () => void;
}) {
  return (
    <motion.button
      whileTap={{ scale: 0.88 }}
      onClick={onPress}
      aria-label="Open navigation menu"
      style={{
        width:        34,
        height:       34,
        borderRadius: "50%",
        overflow:     "hidden",
        border:       "1.5px solid rgba(255,255,255,0.18)",
        background:   "#1D9BF0",
        flexShrink:   0,
        cursor:       "pointer",
        padding:      0,
        display:      "grid",
        placeItems:   "center",
      }}
    >
      {user?.avatar ? (
        <img
          src={user.avatar}
          alt={user.name}
          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
        />
      ) : (
        <span style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>
          {(user?.name ?? "?").charAt(0).toUpperCase()}
        </span>
      )}
    </motion.button>
  );
}

/* ── Icon button ─────────────────────────────────────────────────────────── */
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

/* ── Main component ──────────────────────────────────────────────────────── */
export function TopBar() {
  const [location, navigate] = useLocation();
  const user          = useAppStore((s) => s.user);
  const isAuthenticated = useAppStore((s) => s.isAuthenticated);
  const unread        = useAppStore((s) => s.chats.some((c) => c.unread));
  const navHidden     = useAppStore((s) => s.navHidden);
  const openDrawer    = useDrawerStore((s) => s.openDrawer);

  const [notifUnread, setNotifUnread] = useState(0);
  useEffect(() => {
    if (!user) return;
    fetchNotifications({ limit: 50 })
      .then(({ notifications }) =>
        setNotifUnread(notifications.filter((n) => !n.read).length),
      )
      .catch(() => {});
  }, [user, location]);

  const isHome    = location === "/";
  const isExplore = location === "/explore" || location.startsWith("/explore");

  /* Page title for non-home authenticated pages */
  const title =
    location.startsWith("/create")        ? "Create"        :
    location.startsWith("/messages")      ? "Messages"      :
    location.startsWith("/profile")       ? "Profile"       :
    location.startsWith("/notifications") ? "Notifications" :
    (isExplore && isAuthenticated)        ? "Explore"       :
    null;

  return (
    <div
      style={{
        transform:  navHidden ? "translateY(-100%)" : "translateY(0)",
        transition: "transform 0.3s cubic-bezier(0.25,0.46,0.45,0.94)",
        willChange: "transform",
      }}
    >
      <header
        style={{
          display:        "flex",
          alignItems:     "center",
          justifyContent: "space-between",
          paddingLeft:    16,
          paddingRight:   16,
          paddingTop:     `calc(env(safe-area-inset-top, 0px) + 10px)`,
          paddingBottom:  10,
          minHeight:      56,
          background:     "rgba(0,0,0,0.85)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          borderBottom:   "1px solid #2F3336",
        }}
      >
        {/* ── LEFT: Avatar (opens drawer) or placeholder ── */}
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "flex-start" }}>
          {isAuthenticated && user ? (
            <AvatarBtn user={user} onPress={openDrawer} />
          ) : !isAuthenticated ? (
            /* Guest: show Log In / Sign Up on non-explore pages */
            !isExplore ? (
              <div style={{ display: "flex", gap: 8 }}>
                <motion.button
                  whileTap={{ scale: 0.93 }}
                  onClick={() => navigate("/auth")}
                  style={{
                    height: 30, padding: "0 12px", borderRadius: 9999,
                    background: "rgba(255,255,255,0.07)",
                    border: "1px solid rgba(255,255,255,0.14)",
                    fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.8)",
                    cursor: "pointer",
                  }}
                >
                  Log In
                </motion.button>
                <motion.button
                  whileTap={{ scale: 0.93 }}
                  onClick={() => navigate("/auth?mode=signup")}
                  style={{
                    height: 30, padding: "0 12px", borderRadius: 9999,
                    background: "#1D9BF0", border: "none",
                    fontSize: 12, fontWeight: 700, color: "#fff",
                    cursor: "pointer",
                  }}
                >
                  Sign Up
                </motion.button>
              </div>
            ) : (
              <div style={{ width: 34 }} />
            )
          ) : (
            <div style={{ width: 34 }} />
          )}
        </div>

        {/* ── CENTER: Logo / Page title ── */}
        <div style={{ flex: "0 0 auto", display: "flex", alignItems: "center", justifyContent: "center" }}>
          {isHome || !title ? (
            <h1
              style={{
                fontSize:   21,
                fontWeight: 800,
                margin:     0,
                lineHeight: 1,
                background: "linear-gradient(135deg, var(--accent-primary, #a855f7), var(--accent-secondary, #3b82f6))",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
                fontFamily: "var(--font-display, inherit)",
              }}
            >
              Socia
            </h1>
          ) : (
            <h1
              style={{
                fontSize:   17,
                fontWeight: 700,
                margin:     0,
                lineHeight: 1,
                color:      "#E7E9EA",
                fontFamily: "var(--font-display, inherit)",
              }}
            >
              {title}
            </h1>
          )}
        </div>

        {/* ── RIGHT: Actions ── */}
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8 }}>
          {/* Home: Founding Supporter button (mirrors X's "Subscribe") */}
          {isHome && isAuthenticated && (
            <FoundingSupporterBtn onClick={() => navigate("/support-hub")} />
          )}

          {/* Non-home authenticated pages: Bell + Chat */}
          {!isHome && isAuthenticated && (
            <>
              {user && (
                <IconBtn onClick={() => navigate("/notifications")}>
                  <Bell style={{ width: 15, height: 15, strokeWidth: 1.9 }} />
                  {notifUnread > 0 && (
                    <span
                      style={{
                        position: "absolute", top: 2, right: 2,
                        width: 7, height: 7, borderRadius: "50%",
                        background: "#1D9BF0",
                        border: "1.5px solid #000",
                      }}
                    />
                  )}
                </IconBtn>
              )}
              <IconBtn onClick={() => navigate("/messages")}>
                <MessageCircle style={{ width: 15, height: 15, strokeWidth: 1.9 }} />
                {unread && (
                  <span
                    style={{
                      position: "absolute", top: 4, right: 4,
                      width: 6, height: 6, borderRadius: "50%",
                      background: "#1D9BF0",
                    }}
                  />
                )}
              </IconBtn>
              {user && <RefundNotificationBell />}
            </>
          )}

          {/* Guest on explore: search icon placeholder */}
          {!isAuthenticated && isExplore && (
            <IconBtn onClick={() => navigate("/search")}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
              </svg>
            </IconBtn>
          )}
        </div>
      </header>
    </div>
  );
}
