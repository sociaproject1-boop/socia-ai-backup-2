import { useLocation } from "wouter";
import { Home, Sparkles, MessageCircle, User } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useAppStore } from "@/lib/store";

const TABS = [
  { path: "/",          label: "Home",   icon: Home,          match: (l: string) => l === "/" },
  { path: "/create",   label: "Create", icon: Sparkles,      match: (l: string) => l.startsWith("/create") },
  { path: "/messages", label: "Inbox",  icon: MessageCircle, match: (l: string) => l.startsWith("/messages") },
  { path: "/profile",  label: "Me",     icon: User,          match: (l: string) => l.startsWith("/profile") },
] as const;

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
        paddingLeft: "16px",
        paddingRight: "16px",
        background: "transparent",
        zIndex: 50,
      }}
    >
      {/* Floating glass dock — lighter, more premium, no chunky fill */}
      <ul
        className="grid grid-cols-4"
        style={{
          background: "rgba(12,12,14,0.72)",
          backdropFilter: "blur(24px) saturate(140%)",
          WebkitBackdropFilter: "blur(24px) saturate(140%)",
          border: "1px solid rgba(255,255,255,0.06)",
          borderRadius: "28px",
          boxShadow:
            "0 10px 32px -8px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.04)",
          padding: "6px 6px",
        }}
      >
        {TABS.map((tab) => {
          const active  = tab.match(location);
          const isInbox = tab.path === "/messages";
          const Icon    = tab.icon;

          return (
            <li key={tab.path} className="flex justify-center">
              <motion.button
                whileTap={{ scale: 0.9 }}
                transition={{ type: "spring", stiffness: 600, damping: 26 }}
                onClick={() => navigate(tab.path)}
                aria-label={tab.label}
                aria-current={active ? "page" : undefined}
                className="relative flex w-full flex-col items-center justify-center gap-1 py-2 select-none"
              >
                {/* Icon + badge — subtle scale + neon glow on active, no filled background */}
                <motion.span
                  className="relative"
                  animate={{ scale: active ? 1.06 : 1, y: active ? -1 : 0 }}
                  transition={{ type: "spring", stiffness: 500, damping: 28 }}
                >
                  <Icon
                    style={{
                      width: 22,
                      height: 22,
                      color: active ? "#ffffff" : "rgba(255,255,255,0.42)",
                      strokeWidth: active ? 2.1 : 1.7,
                      transition: "color 0.2s ease, stroke-width 0.2s ease",
                      filter: active
                        ? "drop-shadow(0 0 6px rgba(176,38,255,0.55)) drop-shadow(0 0 12px rgba(176,38,255,0.28))"
                        : "none",
                    }}
                  />
                  {isInbox && unreadCount > 0 && !active && (
                    <motion.span
                      key={unreadCount}
                      initial={{ scale: 0.5, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className="absolute -right-1.5 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full px-0.5 text-[9px] font-bold text-white"
                      style={{
                        background: "linear-gradient(135deg,#a855f7,#ec4899)",
                        boxShadow: "0 0 8px rgba(168,85,247,0.6)",
                        lineHeight: 1,
                      }}
                    >
                      {unreadCount > 99 ? "99+" : unreadCount}
                    </motion.span>
                  )}
                </motion.span>

                {/* Label */}
                <span
                  className="text-[10px] font-semibold tracking-wide"
                  style={{
                    color: active ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.36)",
                    letterSpacing: active ? "0.03em" : "0.02em",
                    transition: "color 0.2s ease, letter-spacing 0.2s ease",
                  }}
                >
                  {tab.label}
                </span>

                {/* Tiny glow dot under active tab — the only active "indicator" */}
                <AnimatePresence>
                  {active && (
                    <motion.span
                      key="active-dot"
                      layoutId="navActiveDot"
                      initial={{ opacity: 0, scale: 0.4 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.4 }}
                      transition={{ type: "spring", stiffness: 520, damping: 30 }}
                      className="absolute -bottom-0.5 h-1 w-1 rounded-full"
                      style={{
                        background: "#B026FF",
                        boxShadow:
                          "0 0 6px rgba(176,38,255,0.9), 0 0 12px rgba(176,38,255,0.5)",
                      }}
                    />
                  )}
                </AnimatePresence>
              </motion.button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
