/**
 * XDrawer.tsx — Global X (Twitter)-style left slide drawer.
 *
 * Mounted once in AppShell. Opens when the user taps the avatar in the TopBar.
 * State lives in the global Zustand store so any part of the app can open/close it.
 */
import { useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  User, UserPlus, Star, List, Users, Gem,
  Rocket, Briefcase, Megaphone, Settings, LogOut,
} from "lucide-react";
import { useAppStore } from "@/lib/store";
import { useDrawerStore } from "@/lib/drawerStore";
import { useAuth } from "@/lib/authContext";

/* ── Menu items ─────────────────────────────────────────────────────────── */
const MENU_ITEMS = [
  { icon: User,      label: "Profile",            path: "/profile" },
  { icon: UserPlus,  label: "Follow",             path: "/explore" },
  { icon: Star,      label: "Premium",            path: "/billing/upgrade" },
  { icon: List,      label: "Lists",              path: "/explore" },
  { icon: Users,     label: "Communities",        path: "/explore" },
  { icon: Gem,       label: "Founding Supporter",  path: "/support-hub" },
  { icon: Rocket,    label: "Creator Studio",     path: "/creator/dashboard" },
  { icon: Briefcase, label: "Business",           path: "/billing/upgrade" },
  { icon: Megaphone, label: "Ads",                path: "/billing/upgrade" },
  { icon: Settings,  label: "Settings and Privacy", path: "/profile/settings" },
] as const;

/* ── Helpers ─────────────────────────────────────────────────────────────── */
function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

/* ── Component ───────────────────────────────────────────────────────────── */
export function XDrawer() {
  const open    = useDrawerStore((s) => s.open);
  const close   = useDrawerStore((s) => s.close);
  const user    = useAppStore((s) => s.user);
  const { signOutUser } = useAuth();
  const [, navigate] = useLocation();

  /* Swipe-left-to-close --------------------------------------------------- */
  const touchStartX = useRef<number | null>(null);
  const drawerRef   = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const el = drawerRef.current;
    if (!el) return;

    const onTouchStart = (e: TouchEvent) => {
      touchStartX.current = e.touches[0]?.clientX ?? null;
    };
    const onTouchEnd = (e: TouchEvent) => {
      if (touchStartX.current === null) return;
      const dx = (e.changedTouches[0]?.clientX ?? 0) - touchStartX.current;
      if (dx < -60) close(); // swiped left ≥ 60 px
      touchStartX.current = null;
    };

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchend",   onTouchEnd,   { passive: true });
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchend",   onTouchEnd);
    };
  }, [open, close]);

  /* Lock body scroll while drawer is open ---------------------------------- */
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  const handleNav = (path: string) => {
    close();
    navigate(path);
  };

  const handleLogout = async () => {
    close();
    try { await signOutUser(); } catch {}
    navigate("/auth");
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="drawer-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22 }}
            onClick={close}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(91,112,131,0.4)",
              zIndex: 200,
              WebkitTapHighlightColor: "transparent",
            }}
          />

          {/* Drawer panel */}
          <motion.div
            key="drawer-panel"
            ref={drawerRef}
            initial={{ x: "-100%" }}
            animate={{ x: 0 }}
            exit={{ x: "-100%" }}
            transition={{ type: "spring", stiffness: 420, damping: 40, mass: 0.9 }}
            style={{
              position:   "fixed",
              top:         0,
              left:        0,
              bottom:      0,
              width:       "82vw",
              maxWidth:    340,
              background:  "#000000",
              zIndex:      201,
              display:     "flex",
              flexDirection: "column",
              overflowY:   "auto",
              paddingTop:  "env(safe-area-inset-top, 16px)",
              paddingBottom: "env(safe-area-inset-bottom, 24px)",
            }}
          >
            {/* ── Profile header ── */}
            <div style={{ padding: "20px 20px 12px" }}>
              {/* Avatar row */}
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 12 }}>
                <div
                  style={{
                    width: 44, height: 44,
                    borderRadius: "50%",
                    overflow: "hidden",
                    border: "2px solid #2F3336",
                    flexShrink: 0,
                    background: "#1D9BF0",
                    display: "grid", placeItems: "center",
                  }}
                >
                  {user?.avatar ? (
                    <img
                      src={user.avatar}
                      alt={user.name}
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    />
                  ) : (
                    <span style={{ fontSize: 18, fontWeight: 700, color: "#fff" }}>
                      {(user?.name ?? "?").charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>

                {/* Add account / + button — X-style */}
                <button
                  onClick={() => handleNav("/profile/settings")}
                  style={{
                    width: 32, height: 32,
                    borderRadius: "50%",
                    border: "1px solid #2F3336",
                    background: "transparent",
                    display: "grid", placeItems: "center",
                    cursor: "pointer",
                    marginTop: 4,
                  }}
                  aria-label="Manage accounts"
                >
                  <span style={{ color: "#E7E9EA", fontSize: 18, lineHeight: 1, fontWeight: 300 }}>+</span>
                </button>
              </div>

              {/* Name + handle */}
              <div style={{ marginBottom: 12 }}>
                <p style={{ fontSize: 16, fontWeight: 800, color: "#E7E9EA", margin: 0, lineHeight: 1.2 }}>
                  {user?.name ?? "Socia User"}
                </p>
                <p style={{ fontSize: 14, color: "#71767B", margin: "3px 0 0", lineHeight: 1.2 }}>
                  @{user?.handle ?? "user"}
                </p>
              </div>

              {/* Following / Followers */}
              <div style={{ display: "flex", gap: 20 }}>
                <button
                  onClick={() => handleNav(user ? `/following/${user.id}` : "/profile")}
                  style={{ background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left" }}
                >
                  <span style={{ fontSize: 14, fontWeight: 700, color: "#E7E9EA" }}>
                    {formatCount(user?.following ?? 0)}
                  </span>
                  <span style={{ fontSize: 13, color: "#71767B", marginLeft: 4 }}>Following</span>
                </button>
                <button
                  onClick={() => handleNav(user ? `/followers/${user.id}` : "/profile")}
                  style={{ background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left" }}
                >
                  <span style={{ fontSize: 14, fontWeight: 700, color: "#E7E9EA" }}>
                    {formatCount(user?.followers ?? 0)}
                  </span>
                  <span style={{ fontSize: 13, color: "#71767B", marginLeft: 4 }}>Followers</span>
                </button>
              </div>
            </div>

            {/* ── Divider ── */}
            <div style={{ height: 1, background: "#2F3336", margin: "0 0 6px" }} />

            {/* ── Menu items ── */}
            <nav style={{ flex: 1, padding: "6px 0" }}>
              {MENU_ITEMS.map(({ icon: Icon, label, path }) => (
                <MenuItem
                  key={label}
                  icon={<Icon style={{ width: 22, height: 22, strokeWidth: 1.8 }} />}
                  label={label}
                  onClick={() => handleNav(path)}
                />
              ))}

              {/* Divider before logout */}
              <div style={{ height: 1, background: "#2F3336", margin: "10px 0" }} />

              {/* Logout */}
              <MenuItem
                icon={<LogOut style={{ width: 22, height: 22, strokeWidth: 1.8 }} />}
                label="Log out"
                onClick={handleLogout}
              />
            </nav>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

/* ── Menu item sub-component ─────────────────────────────────────────────── */
function MenuItem({
  icon, label, onClick,
}: {
  icon:    React.ReactNode;
  label:   string;
  onClick: () => void;
}) {
  return (
    <motion.button
      whileTap={{ scale: 0.96, backgroundColor: "rgba(255,255,255,0.06)" }}
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 20,
        width: "100%",
        padding: "13px 20px",
        background: "none",
        border: "none",
        cursor: "pointer",
        textAlign: "left",
        borderRadius: 0,
        WebkitTapHighlightColor: "transparent",
      }}
    >
      <span style={{ color: "#E7E9EA", flexShrink: 0 }}>{icon}</span>
      <span style={{ fontSize: 18, fontWeight: 700, color: "#E7E9EA", lineHeight: 1.2 }}>
        {label}
      </span>
    </motion.button>
  );
}
