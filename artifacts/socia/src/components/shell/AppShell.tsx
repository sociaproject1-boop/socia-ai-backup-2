import { ReactNode, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { TopBar }    from "./TopBar";
import { BottomNav } from "./BottomNav";
import { useAuth }   from "@/lib/authContext";
import { useAppStore } from "@/lib/store";
import { useNotifications, type BannerNotif } from "@/lib/useNotifications";
import { useBillingStore } from "@/lib/billing";

interface Props { children: ReactNode }

const HIDE_CHROME    = [/^\/auth/, /^\/sys-admin/, /^\/admin/];
const HIDE_TOPBAR    = [/^\/messages\/[^/]+$/, /^\/post\//, /^\/create\/[^/]+$/, /^\/profile\/settings/, /^\/profile\/.+/, /^\/billing/, /^\/topup/, /^\/subscription/, /^\/admin/, /^\/socia-gpt/, /^\/studio/];
const HIDE_BOTTOMNAV = [/^\/messages\/[^/]+$/, /^\/post\//, /^\/create\/[^/]+$/, /^\/socia-gpt/, /^\/studio/];

function tabRank(loc: string) {
  if (loc.startsWith("/profile"))  return 3;
  if (loc.startsWith("/messages")) return 2;
  if (loc.startsWith("/create"))   return 1;
  return 0;
}

export function AppShell({ children }: Props) {
  const [location, navigate] = useLocation();
  const prevLoc = useRef(location);
  const dir     = useRef(0);

  const { supabaseUser } = useAuth();
  const myId             = supabaseUser?.id ?? null;
  const setUnreadCount   = useAppStore((s) => s.setUnreadMessageCount);

  /* Extract the thread currently open (if any) to suppress its banner */
  const threadMatch   = location.match(/^\/messages\/([^/]+)$/);
  const currentThread = threadMatch ? threadMatch[1] : null;

  const { banner, unreadCount, dismissBanner } = useNotifications(myId, currentThread);

  /* Keep Zustand unread count in sync for BottomNav badge */
  useEffect(() => { setUnreadCount(unreadCount); }, [unreadCount, setUnreadCount]);

  /* Refresh billing summary on sign-in / sign-out so the credits badge
   * and FAB always reflect the current user. */
  const refreshBilling = useBillingStore((s) => s.refresh);
  const setBillingSummary = useBillingStore((s) => s.setSummary);
  useEffect(() => {
    if (myId) refreshBilling();
    else setBillingSummary(null);
  }, [myId, refreshBilling, setBillingSummary]);

  /* Refresh billing summary when the tab regains focus so the credits
   * badge stays fresh after the user has been away (e.g., paid in another
   * tab or had an admin approval happen in the background). */
  useEffect(() => {
    if (!myId) return;
    const onVis = () => { if (document.visibilityState === "visible") refreshBilling(); };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", onVis);
    };
  }, [myId, refreshBilling]);

  /* Slide direction for page transitions */
  const prevRank = tabRank(prevLoc.current);
  const currRank = tabRank(location);
  if (prevRank !== currRank) {
    dir.current = currRank > prevRank ? 1 : -1;
  } else if (location !== prevLoc.current) {
    dir.current = location.length > prevLoc.current.length ? 1 : -1;
  }
  useEffect(() => { prevLoc.current = location; }, [location]);

  const hideAll       = HIDE_CHROME.some((r) => r.test(location));
  const hideTopBar    = hideAll || HIDE_TOPBAR.some((r) => r.test(location));
  const hideBottomNav = hideAll || HIDE_BOTTOMNAV.some((r) => r.test(location));
  const isModal       = /^\/(post|create\/[^/]+|messages\/[^/]+|profile\/settings)/.test(location);

  /*
   * Admin / standalone routes (/sys-admin, /admin) must NOT render inside the
   * mobile 480 px container and must NOT be children of a Framer Motion div
   * with a CSS transform — transforms create a new containing block for
   * position:fixed descendants, breaking the admin's full-screen layout.
   * We still run all hooks above so billing/notifications stay in sync.
   */
  if (hideAll) {
    return <>{children}</>;
  }

  return (
    <div className="app-bg relative h-[100dvh] w-full overflow-hidden">
      <div className="mx-auto flex h-[100dvh] w-full max-w-[480px] flex-col">
        {!hideTopBar && <TopBar />}

        <main className="relative flex-1 overflow-hidden">
          {/* mode="wait" → only ONE page is mounted at a time. Required so   *
           * the outgoing page (which is `absolute inset-0`) cannot sit on    *
           * top of the incoming page and intercept clicks during/after the  *
           * exit transition. mode="sync" caused the Follow button (and any  *
           * other interactive element on freshly-navigated pages) to be     *
           * dead until the exit animation fully unmounted the prior page.   */}
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={location}
              initial={
                isModal
                  ? { opacity: 0, y: 16, scale: 0.99 }
                  : { opacity: 0, x: dir.current * 14 }
              }
              animate={{ opacity: 1, x: 0, y: 0, scale: 1 }}
              exit={
                isModal
                  ? { opacity: 0, y: 8, scale: 0.99 }
                  : { opacity: 0, x: dir.current * -8 }
              }
              transition={{ duration: 0.13, ease: [0.32, 0.72, 0, 1] }}
              className="scroll-native gpu absolute inset-0"
              style={{ pointerEvents: "auto" }}
            >
              {children}
            </motion.div>
          </AnimatePresence>

          {/* ── In-app notification banner ─────────────────────────────── */}
          <AnimatePresence>
            {banner && (
              <NotificationBanner
                banner={banner}
                onDismiss={dismissBanner}
                onTap={() => {
                  dismissBanner();
                  navigate(`/messages/${banner.threadId}`);
                }}
              />
            )}
          </AnimatePresence>

          {/* ── Bottom nav floats over content — fixes the hard-cut dark slab — */}
          {!hideBottomNav && (
            <div className="absolute inset-x-0 bottom-0 z-30">
              <BottomNav />
            </div>
          )}
        </main>
      </div>

    </div>
  );
}

/* ── Notification banner component ─────────────────────────────────────── */

function NotificationBanner({
  banner,
  onDismiss,
  onTap,
}: {
  banner:    BannerNotif;
  onDismiss: () => void;
  onTap:     () => void;
}) {
  return (
    <motion.div
      key="notif-banner"
      initial={{ opacity: 0, y: -64, scale: 0.95 }}
      animate={{ opacity: 1, y: 0,   scale: 1    }}
      exit={{    opacity: 0, y: -64, scale: 0.95 }}
      transition={{ type: "spring", stiffness: 480, damping: 38 }}
      onClick={onTap}
      className="absolute inset-x-3 top-3 z-50 flex cursor-pointer items-center gap-3 overflow-hidden rounded-2xl border border-white/[0.06] bg-[#0a0a0a] px-4 py-3 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.8)]"
      style={{ maxWidth: 440, margin: "0 auto", left: "12px", right: "12px" }}
    >
      {/* Accent left bar */}
      <span
        className="absolute left-0 top-0 h-full w-1 rounded-l-2xl"
        style={{ background: "linear-gradient(180deg, var(--accent-primary), var(--accent-secondary))" }}
      />

      {/* Avatar */}
      <div className="relative ml-1 h-10 w-10 shrink-0 overflow-hidden rounded-full border border-white/15">
        {banner.senderAvatar ? (
          <img src={banner.senderAvatar} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <div className="h-full w-full bg-gradient-to-br from-purple-600 via-pink-500 to-blue-600 grid place-items-center text-sm font-bold text-white">
            {banner.senderName.charAt(0).toUpperCase()}
          </div>
        )}
      </div>

      {/* Text */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-semibold text-white">{banner.senderName}</p>
        <p className="truncate text-[12px] text-white/55">{banner.preview}</p>
      </div>

      {/* Dismiss */}
      <button
        onClick={(e) => { e.stopPropagation(); onDismiss(); }}
        className="shrink-0 text-white/35 transition-colors hover:text-white/70"
        aria-label="Dismiss"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
        </svg>
      </button>
    </motion.div>
  );
}
