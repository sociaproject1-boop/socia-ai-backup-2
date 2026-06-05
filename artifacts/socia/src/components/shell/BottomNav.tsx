import { useLocation } from "wouter";
import { Home, Sparkles, MessageCircle, User, Plus } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useAppStore } from "@/lib/store";

const SIDE_TABS = [
  { path: "/",         label: "Home",   icon: Home,          match: (l: string) => l === "/" },
  { path: "/create",   label: "Create", icon: Sparkles,      match: (l: string) => l.startsWith("/create") || l.startsWith("/studio") },
  { path: "/messages", label: "Inbox",  icon: MessageCircle, match: (l: string) => l.startsWith("/messages") },
  { path: "/profile",  label: "Me",     icon: User,          match: (l: string) => l.startsWith("/profile") },
] as const;

const TAB_COLOR: Record<string, string> = {
  "/":         "#a855f7",
  "/create":   "#d946ef",
  "/messages": "#60a5fa",
  "/profile":  "#a855f7",
};

const GPU: React.CSSProperties = {
  willChange: "transform, opacity",
  transform: "translateZ(0)",
  backfaceVisibility: "hidden",
};

export function BottomNav() {
  const [location, navigate] = useLocation();
  const unreadCount = useAppStore((s) => s.unreadMessageCount);

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
        {SIDE_TABS.slice(0, 2).map((tab) => {
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

        {/* Center upload button */}
        <li style={{ flex: "0 0 72px", display: "flex", justifyContent: "center", alignItems: "center" }}>
          <motion.button
            whileTap={{ scale: 0.84 }}
            transition={{ type: "spring", stiffness: 520, damping: 20 }}
            onClick={() => navigate("/upload")}
            aria-label="New Post"
            style={{
              width: 50,
              height: 50,
              borderRadius: "50%",
              background: "linear-gradient(135deg, #a855f7 0%, #ec4899 60%, #6366f1 100%)",
              boxShadow: "0 0 20px rgba(168,85,247,0.6), 0 4px 16px rgba(0,0,0,0.45)",
              display: "grid",
              placeItems: "center",
              flexShrink: 0,
              marginBottom: 4,
            }}
          >
            <Plus style={{ width: 24, height: 24, color: "white", strokeWidth: 2.8 }} />
          </motion.button>
        </li>

        {/* Right two tabs */}
        {SIDE_TABS.slice(2).map((tab) => {
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
