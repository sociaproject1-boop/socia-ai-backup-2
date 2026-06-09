import { useLocation } from "wouter";
import { Home, Search, MessageCircle, User, Compass, LogIn, UserPlus } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useAppStore } from "@/lib/store";
import { useState } from "react";
import { GuestAuthModal } from "@/components/guest/GuestAuthModal";
import markUrl from "@assets/splash2/mark.png";

const AUTH_TABS = [
  { path: "/",        label: "Home",   icon: Home,          match: (l: string) => l === "/" },
  { path: "/search",  label: "Explore",icon: Search,        match: (l: string) => l.startsWith("/search") },
  { path: "/messages",label: "Inbox",  icon: MessageCircle, match: (l: string) => l.startsWith("/messages") },
  { path: "/profile", label: "Me",     icon: User,          match: (l: string) => l.startsWith("/profile") },
] as const;

const GUEST_TABS_LEFT = [
  { path: "/explore", label: "Explore", icon: Compass, match: (l: string) => l === "/explore" || l.startsWith("/explore") || l.startsWith("/hashtag") },
  { path: "/search",  label: "Search",  icon: Search,  match: (l: string) => l.startsWith("/search") },
] as const;

const GUEST_TABS_RIGHT = [
  { path: "/auth",             label: "Log In",  icon: LogIn,    match: (_l: string) => false },
  { path: "/auth?mode=signup", label: "Sign Up", icon: UserPlus, match: (_l: string) => false },
] as const;

const TAB_COLOR: Record<string, string> = {
  "/":         "#a855f7",
  "/search":   "#ec4899",
  "/explore":  "#a855f7",
  "/messages": "#60a5fa",
  "/profile":  "#a855f7",
  "/auth":     "#a855f7",
};

/* Shared nav container styles — no position:fixed; the AppShell wrapper
 * (absolute inset-x-0 bottom-0 z-30) already anchors the nav to the
 * bottom of the 480-px app column. Using position:fixed here caused the
 * bar to span the full viewport width instead of the app container. */
const NAV_BASE: React.CSSProperties = {
  width: "100%",
  background: "#0a0a0a",
  borderTop: "1px solid rgba(255,255,255,0.07)",
  paddingBottom: "env(safe-area-inset-bottom, 0px)",
  /* GPU compositing for smooth slide animation */
  willChange: "transform",
  transform: "translateZ(0)",
  backfaceVisibility: "hidden",
};

const UL_BASE: React.CSSProperties = {
  display: "flex",
  alignItems: "stretch",
  padding: "0",
  margin: "0",
  listStyle: "none",
  width: "100%",
  position: "relative",
};

export function BottomNav() {
  const [location, navigate] = useLocation();
  const isAuthenticated = useAppStore((s) => s.isAuthenticated);
  const unreadCount = useAppStore((s) => s.unreadMessageCount);
  const navHidden = useAppStore((s) => s.navHidden);
  const [showGuestModal, setShowGuestModal] = useState(false);

  const slideStyle: React.CSSProperties = {
    transform: navHidden
      ? "translateY(100%) translateZ(0)"
      : "translateY(0) translateZ(0)",
    transition: "transform 0.3s cubic-bezier(0.25,0.46,0.45,0.94)",
  };

  if (!isAuthenticated) {
    return (
      <>
        <nav style={{ ...NAV_BASE, ...slideStyle }}>
          <ul style={UL_BASE}>
            {/* Left: Explore + Search */}
            {GUEST_TABS_LEFT.map((tab) => {
              const active = tab.match(location);
              const Icon   = tab.icon;
              const color  = TAB_COLOR[tab.path] ?? "#a855f7";
              return (
                <li key={tab.path} style={{ flex: 1 }}>
                  <NavTab
                    active={active}
                    color={color}
                    label={tab.label}
                    onClick={() => navigate(tab.path)}
                  >
                    <Icon
                      style={{
                        width: 22, height: 22,
                        color: active ? color : "rgba(255,255,255,0.35)",
                        strokeWidth: active ? 2.2 : 1.6,
                        transition: "color 0.18s ease",
                      }}
                    />
                  </NavTab>
                </li>
              );
            })}

            {/* Center — Join CTA */}
            <li style={{ flex: "0 0 72px", display: "flex", justifyContent: "center", alignItems: "center", paddingTop: 4, paddingBottom: 6 }}>
              <motion.button
                whileTap={{ scale: 0.88 }}
                transition={{ type: "spring", stiffness: 480, damping: 22 }}
                onClick={() => setShowGuestModal(true)}
                aria-label="Join Socia"
                style={{
                  width: 50,
                  height: 50,
                  borderRadius: "50%",
                  background: "linear-gradient(135deg,#a855f7,#ec4899)",
                  display: "grid",
                  placeItems: "center",
                  flexShrink: 0,
                  boxShadow: "0 0 16px rgba(168,85,247,0.4)",
                }}
              >
                <img
                  src={markUrl}
                  alt=""
                  draggable={false}
                  style={{
                    width: 36,
                    height: 36,
                    objectFit: "contain",
                    userSelect: "none",
                    pointerEvents: "none",
                  }}
                />
              </motion.button>
            </li>

            {/* Right: Log In + Sign Up (mirrors the 2-tab left side) */}
            {GUEST_TABS_RIGHT.map((tab) => {
              const Icon = tab.icon;
              return (
                <li key={tab.path} style={{ flex: 1 }}>
                  <NavTab
                    active={false}
                    color="#a855f7"
                    label={tab.label}
                    onClick={() => navigate(tab.path)}
                  >
                    <Icon
                      style={{
                        width: 22, height: 22,
                        color: "rgba(255,255,255,0.35)",
                        strokeWidth: 1.6,
                      }}
                    />
                  </NavTab>
                </li>
              );
            })}
          </ul>
        </nav>

        <GuestAuthModal
          open={showGuestModal}
          onClose={() => setShowGuestModal(false)}
        />
      </>
    );
  }

  return (
    <nav style={{ ...NAV_BASE, ...slideStyle }}>
      <ul style={UL_BASE}>
        {/* Left two tabs */}
        {AUTH_TABS.slice(0, 2).map((tab) => {
          const active  = tab.match(location);
          const Icon    = tab.icon;
          const color   = TAB_COLOR[tab.path];
          return (
            <li key={tab.path} style={{ flex: 1 }}>
              <NavTab
                active={active}
                color={color}
                label={tab.label}
                onClick={() => navigate(tab.path)}
              >
                <Icon
                  style={{
                    width: 22, height: 22,
                    color: active ? color : "rgba(255,255,255,0.35)",
                    strokeWidth: active ? 2.2 : 1.6,
                    transition: "color 0.18s ease",
                  }}
                />
              </NavTab>
            </li>
          );
        })}

        {/* Center — Socia brand mark / new post */}
        <li style={{ flex: "0 0 72px", display: "flex", justifyContent: "center", alignItems: "center", paddingTop: 4, paddingBottom: 6 }}>
          <motion.button
            whileTap={{ scale: 0.88 }}
            transition={{ type: "spring", stiffness: 480, damping: 22 }}
            onClick={() => navigate("/upload")}
            aria-label="New Post"
            style={{
              width: 50,
              height: 50,
              borderRadius: "50%",
              background: "#0c0c0e",
              border: "1px solid rgba(255,255,255,0.08)",
              display: "grid",
              placeItems: "center",
              flexShrink: 0,
              boxShadow: "0 2px 8px rgba(0,0,0,0.18)",
            }}
          >
            <img
              src={markUrl}
              alt=""
              draggable={false}
              style={{
                width: 36,
                height: 36,
                objectFit: "contain",
                userSelect: "none",
                pointerEvents: "none",
              }}
            />
          </motion.button>
        </li>

        {/* Right two tabs */}
        {AUTH_TABS.slice(2).map((tab) => {
          const active  = tab.match(location);
          const isInbox = tab.path === "/messages";
          const Icon    = tab.icon;
          const color   = TAB_COLOR[tab.path];
          return (
            <li key={tab.path} style={{ flex: 1 }}>
              <NavTab
                active={active}
                color={color}
                label={tab.label}
                onClick={() => navigate(tab.path)}
              >
                <span className="relative">
                  <Icon
                    style={{
                      width: 22, height: 22,
                      color: active ? color : "rgba(255,255,255,0.35)",
                      strokeWidth: active ? 2.2 : 1.6,
                      transition: "color 0.18s ease",
                    }}
                  />
                  {isInbox && unreadCount > 0 && (
                    <AnimatePresence>
                      <motion.span
                        key={unreadCount}
                        initial={{ scale: 0.4, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        className="absolute -right-1.5 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full px-0.5 text-[9px] font-bold text-white"
                        style={{ background: "linear-gradient(135deg,#a855f7,#ec4899)", lineHeight: 1 }}
                      >
                        {unreadCount > 99 ? "99+" : unreadCount}
                      </motion.span>
                    </AnimatePresence>
                  )}
                </span>
              </NavTab>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function NavTab({
  active,
  color,
  label,
  onClick,
  children,
}: {
  active: boolean;
  color: string;
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <motion.button
      whileTap={{ scale: 0.86 }}
      transition={{ type: "spring", stiffness: 620, damping: 28 }}
      onClick={onClick}
      aria-label={label}
      aria-current={active ? "page" : undefined}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 2,
        paddingTop: 6,
        paddingBottom: 6,
        width: "100%",
        userSelect: "none",
        position: "relative",
        background: "none",
        border: "none",
        cursor: "pointer",
        minWidth: 0,
      }}
    >
      {active && (
        <motion.span
          layoutId="navActiveLine"
          style={{
            position: "absolute",
            top: 0,
            left: "25%",
            right: "25%",
            height: 2,
            borderRadius: "0 0 3px 3px",
            background: color,
          }}
        />
      )}
      <motion.span
        animate={{ scale: active ? 1.08 : 1, y: active ? -1 : 0 }}
        transition={{ type: "spring", stiffness: 520, damping: 28 }}
      >
        {children}
      </motion.span>
      <span
        style={{
          fontSize: 10,
          fontWeight: 500,
          letterSpacing: "0.02em",
          color: active ? color : "rgba(255,255,255,0.30)",
          transition: "color 0.2s",
          lineHeight: 1.2,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          maxWidth: "100%",
        }}
      >
        {label}
      </span>
    </motion.button>
  );
}
