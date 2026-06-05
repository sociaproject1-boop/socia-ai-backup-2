import { useLocation } from "wouter";
import { MessageCircle, Search, Bell } from "lucide-react";
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
    location.startsWith("/create")   ? "Create" :
    location.startsWith("/messages") ? "Messages" :
    location.startsWith("/profile")  ? "Profile" :
    null; // Home shows brand name

  return (
    <header
      className="app-header sticky top-0 z-30 flex items-center justify-between px-4"
      style={{
        paddingTop:    `calc(env(safe-area-inset-top, 0px) + 10px)`,
        paddingBottom: 10,
      }}
    >
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        transition={{ duration: 0.25 }}
      >
        {isHome
          ? <h1 className="font-display text-[21px] font-bold text-gradient">Socia</h1>
          : <h1 className="font-display text-[17px] font-semibold app-text">{title}</h1>
        }
      </motion.div>

      <div className="flex items-center gap-2">
        {isHome && (
          <IconBtn onClick={() => {}}>
            <Search style={{ width: 17, height: 17, strokeWidth: 1.9 }} />
          </IconBtn>
        )}

        {user && (
          <IconBtn onClick={() => navigate("/notifications")}>
            <Bell style={{ width: 17, height: 17, strokeWidth: 1.9 }} />
            {notifUnread > 0 && (
              <span
                className="absolute right-2 top-2 flex h-4 min-w-4 items-center justify-center rounded-full px-0.5 text-[9px] font-bold text-white"
                style={{ background: "var(--accent-primary)", boxShadow: "0 0 6px 1px var(--accent-glow)" }}
              >
                {notifUnread > 9 ? "9+" : notifUnread}
              </span>
            )}
          </IconBtn>
        )}

        <IconBtn onClick={() => navigate("/messages")}>
          <MessageCircle style={{ width: 17, height: 17, strokeWidth: 1.9 }} />
          {unread && (
            <span
              className="absolute right-2 top-2 h-2 w-2 rounded-full"
              style={{ background: "var(--accent-primary)", boxShadow: "0 0 6px 1px var(--accent-glow)" }}
            />
          )}
        </IconBtn>

        {user && <RefundNotificationBell />}
        {user && <CreditsBadge compact />}
      </div>
    </header>
  );
}

function IconBtn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <motion.button
      whileTap={{ scale: 0.88 }}
      onClick={onClick}
      className="app-surface relative grid h-9 w-9 place-items-center rounded-full app-text"
      style={{ borderRadius: 36 }}
    >
      {children}
    </motion.button>
  );
}
