import { useLocation } from "wouter";
import { Home, Sparkles, MessageCircle, User } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useAppStore } from "@/lib/store";

const TABS = [
  { path: "/",         label: "Home",   icon: Home,          match: (l: string) => l === "/" },
  { path: "/create",   label: "Create", icon: Sparkles,      match: (l: string) => l.startsWith("/create") },
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
      <ul className="grid grid-cols-4" style={{ padding: "2px 0 4px" }}>
        {TABS.map((tab) => {
          const active  = tab.match(location);
          const isInbox = tab.path === "/messages";
          const Icon    = tab.icon;
          const color   = TAB_COLOR[tab.path];

          return (
            <li key={tab.path} className="flex justify-center">
              <motion.button
                whileTap={{ scale: 0.86 }}
                transition={{ type: "spring", stiffness: 620, damping: 28 }}
                onClick={() => navigate(tab.path)}
                aria-label={tab.label}
                aria-current={active ? "page" : undefined}
                className="relative flex w-full flex-col items-center justify-center gap-0.5 py-2 select-none"
              >
                {/* Active top indicator line */}
                {active && (
                  <motion.span
                    layoutId="navActiveLine"
                    style={{
                      position: "absolute",
                      top: 0,
                      left: "30%",
                      right: "30%",
                      height: 2,
                      borderRadius: "0 0 3px 3px",
                      background: color,
                    }}
                  />
                )}

                {/* Icon */}
                <motion.span
                  className="relative"
                  animate={{ scale: active ? 1.08 : 1, y: active ? -1 : 0 }}
                  transition={{ type: "spring", stiffness: 520, damping: 28 }}
                >
                  <Icon
                    style={{
                      width: 22,
                      height: 22,
                      color: active ? color : "rgba(255,255,255,0.35)",
                      strokeWidth: active ? 2.2 : 1.6,
                      transition: "color 0.18s ease",
                    }}
                  />
                  {/* Unread badge */}
                  {isInbox && unreadCount > 0 && !active && (
                    <motion.span
                      key={unreadCount}
                      initial={{ scale: 0.4, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className="absolute -right-1.5 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full px-0.5 text-[9px] font-bold text-white"
                      style={{ background: "linear-gradient(135deg,#a855f7,#ec4899)", lineHeight: 1 }}
                    >
                      {unreadCount > 99 ? "99+" : unreadCount}
                    </motion.span>
                  )}
                </motion.span>

                {/* Label */}
                <span
                  className="text-[10px] font-medium tracking-wide transition-colors duration-200"
                  style={{ color: active ? color : "rgba(255,255,255,0.30)" }}
                >
                  {tab.label}
                </span>
              </motion.button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
