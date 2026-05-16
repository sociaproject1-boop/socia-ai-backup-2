import { useLocation } from "wouter";
import { Home, Sparkles, MessageCircle, User } from "lucide-react";
import { motion } from "framer-motion";
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
      <ul
  className="grid grid-cols-4"
  style={{
    background: "#0a0a0a",
    border: "1px solid rgba(255,255,255,0.05)",
    borderRadius: "32px",
    boxShadow: "0 8px 30px rgba(0,0,0,0.55)",
    overflow: "hidden",
    padding: "8px 6px",
  }}
>
        {TABS.map((tab) => {
          const active  = tab.match(location);
          const isInbox = tab.path === "/messages";
          const Icon    = tab.icon;

          return (
            <li key={tab.path} className="flex justify-center">
              <motion.button
                whileTap={{ scale: 0.86 }}
                transition={{ type: "spring", stiffness: 600, damping: 26 }}
                onClick={() => navigate(tab.path)}
                className="relative flex w-full flex-col items-center justify-center gap-1 py-2 select-none"
              >
                {/* Active glow pill background */}
                <AnimatedActiveBg active={active} />

                {/* Icon + badge */}
                <span className="relative z-10">
                  <Icon
                    style={{
                      width: 22,
                      height: 22,
                      color: active
                        ? "#fff"
                        : "rgba(255,255,255,0.38)",
                      strokeWidth: active ? 2.2 : 1.6,
                      transition: "color 0.18s, stroke-width 0.18s",
                      filter: active
                        ? "drop-shadow(0 0 6px rgba(192,38,211,0.7))"
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
                </span>

                {/* Label */}
                <span
                  className="relative z-10 text-[10px] font-semibold tracking-wide transition-all duration-200"
                  style={{
                    color: active ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.3)",
                    letterSpacing: active ? "0.03em" : "0.02em",
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

function AnimatedActiveBg({ active }: { active: boolean }) {
  if (!active) return null;
  return (
    <motion.span
      layoutId="navActiveBg"
      className="absolute inset-x-1.5 inset-y-1 rounded-xl"
      style={{
        background: "linear-gradient(135deg, rgba(168,85,247,0.22), rgba(236,72,153,0.18))",
        boxShadow: "0 0 16px rgba(168,85,247,0.25)",
      }}
      transition={{ type: "spring", stiffness: 420, damping: 32 }}
    />
  );
}
