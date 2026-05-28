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

/* Active accent color per tab — simple color only, no glow */
const TAB_COLOR: Record<string, string> = {
  "/":         "rgba(168,85,247,1)",
  "/create":   "rgba(217,70,239,1)",
  "/messages": "rgba(96,165,250,1)",
  "/profile":  "rgba(168,85,247,1)",
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
        paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 10px)",
        paddingTop: "10px",
        paddingLeft: "12px",
        paddingRight: "12px",
        background: "transparent",
        zIndex: 50,
        ...GPU,
      }}
    >
      {/* Floating glass dock */}
      <ul
        className="grid grid-cols-4"
        style={{
          background: "rgba(8,6,16,0.82)",
          backdropFilter: "blur(24px) saturate(140%)",
          WebkitBackdropFilter: "blur(24px) saturate(140%)",
          border: "1px solid rgba(255,255,255,0.06)",
          borderRadius: "28px",
          boxShadow: "0 8px 32px -8px rgba(0,0,0,0.65), inset 0 1px 0 rgba(255,255,255,0.04)",
          padding: "6px 4px",
        }}
      >
        {TABS.map((tab) => {
          const active  = tab.match(location);
          const isInbox = tab.path === "/messages";
          const Icon    = tab.icon;
          const color   = TAB_COLOR[tab.path];

          return (
            <li key={tab.path} className="flex justify-center">
              <motion.button
                whileTap={{ scale: 0.88 }}
                transition={{ type: "spring", stiffness: 620, damping: 28 }}
                onClick={() => navigate(tab.path)}
                aria-label={tab.label}
                aria-current={active ? "page" : undefined}
                className="relative flex w-full flex-col items-center justify-center gap-1 py-2 select-none"
              >
                {/* Active background pill — subtle tint only */}
                <AnimatePresence>
                  {active && (
                    <motion.span
                      key="active-pill"
                      layoutId="navActivePill"
                      initial={{ opacity: 0, scaleX: 0.5 }}
                      animate={{ opacity: 1, scaleX: 1 }}
                      exit={{ opacity: 0, scaleX: 0.5 }}
                      transition={{ type: "spring", stiffness: 500, damping: 32 }}
                      style={{
                        position: "absolute",
                        inset: "2px 8px",
                        borderRadius: 18,
                        background: "rgba(168,85,247,0.12)",
                        border: "1px solid rgba(168,85,247,0.18)",
                        ...GPU,
                      }}
                    />
                  )}
                </AnimatePresence>

                {/* Icon */}
                <motion.span
                  className="relative"
                  animate={{
                    scale: active ? 1.06 : 1,
                    y: active ? -1 : 0,
                  }}
                  transition={{ type: "spring", stiffness: 520, damping: 28 }}
                >
                  <Icon
                    style={{
                      width: 22,
                      height: 22,
                      color: active ? color : "rgba(255,255,255,0.38)",
                      strokeWidth: active ? 2.1 : 1.7,
                      transition: "color 0.2s ease, stroke-width 0.2s ease",
                    }}
                  />
                  {/* Unread badge */}
                  {isInbox && unreadCount > 0 && !active && (
                    <motion.span
                      key={unreadCount}
                      initial={{ scale: 0.4, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className="absolute -right-1.5 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full px-0.5 text-[9px] font-bold text-white"
                      style={{
                        background: "linear-gradient(135deg,#a855f7,#ec4899)",
                        lineHeight: 1,
                      }}
                    >
                      {unreadCount > 99 ? "99+" : unreadCount}
                    </motion.span>
                  )}
                </motion.span>

                {/* Label */}
                <span
                  className="text-[10px] font-semibold tracking-wide transition-colors duration-200"
                  style={{
                    color: active ? color : "rgba(255,255,255,0.32)",
                  }}
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
