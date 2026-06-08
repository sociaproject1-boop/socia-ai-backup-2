import { useLocation } from "wouter";
import { Home, Search, MessageCircle, User, Compass, LogIn } from "lucide-react";
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

const GUEST_TABS = [
  { path: "/explore", label: "Explore", icon: Compass, match: (l: string) => l === "/explore" || l.startsWith("/explore") || l.startsWith("/hashtag") },
  { path: "/search",  label: "Search",  icon: Search,  match: (l: string) => l.startsWith("/search") },
  { path: "/auth",    label: "Sign In", icon: LogIn,   match: (_l: string) => false },
] as const;

const TAB_COLOR: Record<string, string> = {
  "/":         "#a855f7",
  "/search":   "#ec4899",
  "/explore":  "#a855f7",
  "/messages": "#60a5fa",
  "/profile":  "#a855f7",
  "/auth":     "#a855f7",
};

const GPU: React.CSSProperties = {
  willChange: "transform, opacity",
  transform: "translateZ(0)",
  backfaceVisibility: "hidden",
};

export function BottomNav() {
  const [location, navigate] = useLocation();
  const isAuthenticated = useAppStore((s) => s.isAuthenticated);
  const unreadCount = useAppStore((s) => s.unreadMessageCount);
  const navHidden = useAppStore((s) => s.navHidden);
  const [showGuestModal, setShowGuestModal] = useState(false);

  const slideStyle: React.CSSProperties = {
    transform:  navHidden ? "translateY(100%)" : "translateY(0)",
    transition: "transform 0.3s cubic-bezier(0.25,0.46,0.45,0.94)",
  };

  if (!isAuthenticated) {
    return (
      <>
        <nav
          style={{
            position: "fixed",
            bottom: 0,
            left: 0,
            right: 0,
            background: "#0a0a0a",
            borderTop: "1px solid rgba(255,255,255,0.07)",
            paddingBottom: "env(safe-area-inset-bottom, 0px)",
            zIndex: 50,
            ...GPU,
            ...slideStyle,
          }}
        >
          <ul
            style={{
              display: "flex",
              alignItems: "center",
              padding: "4px 0 6px",
              position: "relative",
            }}
          >
            {/* Left tabs */}
            {GUEST_TABS.slice(0, 2).map((tab) => {
              const active = tab.match(location);
              const Icon   = tab.icon;
              const color  = TAB_COLOR[tab.path] ?? "#a855f7";
              return (
                <li key={tab.path} style={{ flex: 1, display: "flex", justifyContent: "center" }}>
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
            <li style={{ flex: "0 0 72px", display: "flex", justifyContent: "center", alignItems: "center" }}>
              <motion.button
                whileTap={{ scale: 0.88 }}
                transition={{ type: "spring", stiffness: 480, damping: 22 }}
                onClick={() => setShowGuestModal(true)}
                aria-label="Join Socia"
                style={{
                  width: 54,
                  height: 54,
                  borderRadius: "50%",
                  background: "linear-gradient(135deg,#a855f7,#ec4899)",
                  display: "grid",
                  placeItems: "center",
                  flexShrink: 0,
                  marginBottom: 2,
                  boxShadow: "0 0 16px rgba(168,85,247,0.4)",
                }}
              >
                <img
                  src={markUrl}
                  alt=""
                  draggable={false}
                  style={{
                    width: 40,
                    height: 40,
                    objectFit: "contain",
                    userSelect: "none",
                    pointerEvents: "none",
                  }}
                />
              </motion.button>
            </li>

            {/* Right: Sign In tab */}
            <li style={{ flex: 1, display: "flex", justifyContent: "center" }}>
              <NavTab
                active={false}
                color="#a855f7"
                label="Sign In"
                onClick={() => navigate("/auth")}
              >
                <LogIn
                  style={{
                    width: 22, height: 22,
                    color: "rgba(255,255,255,0.35)",
                    strokeWidth: 1.6,
                  }}
                />
              </NavTab>
            </li>

            {/* Empty right slot for symmetry */}
            <li style={{ flex: 1 }} />
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
    <nav
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        background: "#0a0a0a",
        borderTop: "1px solid rgba(255,255,255,0.07)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
        zIndex: 50,
        ...GPU,
        ...slideStyle,
      }}
    >
      <ul
        style={{
          display: "flex",
          alignItems: "center",
          padding: "4px 0 6px",
          position: "relative",
        }}
      >
        {/* Left two tabs */}
        {AUTH_TABS.slice(0, 2).map((tab) => {
          const active  = tab.match(location);
          const Icon    = tab.icon;
          const color   = TAB_COLOR[tab.path];
          return (
            <li key={tab.path} style={{ flex: 1, display: "flex", justifyContent: "center" }}>
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

        {/* Center — Socia "S" brand mark */}
        <li style={{ flex: "0 0 72px", display: "flex", justifyContent: "center", alignItems: "center" }}>
          <motion.button
            whileTap={{ scale: 0.88 }}
            transition={{ type: "spring", stiffness: 480, damping: 22 }}
            onClick={() => navigate("/upload")}
            aria-label="New Post"
            style={{
              width: 54,
              height: 54,
              borderRadius: "50%",
              background: "#0c0c0e",
              border: "1px solid rgba(255,255,255,0.08)",
              display: "grid",
              placeItems: "center",
              flexShrink: 0,
              marginBottom: 2,
              boxShadow: "0 2px 8px rgba(0,0,0,0.18)",
            }}
          >
            <img
              src={markUrl}
              alt=""
              draggable={false}
              style={{
                width: 40,
                height: 40,
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
            <li key={tab.path} style={{ flex: 1, display: "flex", justifyContent: "center" }}>
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
      className="relative flex w-full flex-col items-center justify-center gap-0.5 py-2 select-none"
    >
      {active && (
        <motion.span
          layoutId="navActiveLine"
          style={{
            position: "absolute",
            top: 0,
            left: "28%",
            right: "28%",
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
        className="text-[10px] font-medium tracking-wide transition-colors duration-200"
        style={{ color: active ? color : "rgba(255,255,255,0.30)" }}
      >
        {label}
      </span>
    </motion.button>
  );
}
