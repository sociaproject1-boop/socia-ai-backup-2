import { useLocation } from "wouter";
import { Home, Compass, MessageCircle, UserCircle, Upload, Video, Image as ImageIcon, BookImage, X, Wand2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useAppStore } from "@/lib/store";
import { useState } from "react";
import { GuestAuthModal } from "@/components/guest/GuestAuthModal";
import markUrl from "@assets/splash2/mark.png";

/* ── Tab definitions ─────────────────────────────────────────────────────── */

const AUTH_TABS_LEFT = [
  { path: "/",       label: "Home",    icon: Home,    match: (l: string) => l === "/" },
  { path: "/search", label: "Explore", icon: Compass, match: (l: string) => l.startsWith("/search") || l.startsWith("/explore") },
] as const;

const AUTH_TABS_RIGHT = [
  { path: "/messages", label: "Inbox",   icon: MessageCircle, match: (l: string) => l.startsWith("/messages") },
  { path: "/profile",  label: "Profile", icon: UserCircle,    match: (l: string) => l.startsWith("/profile") },
] as const;

const GUEST_TABS_LEFT = [
  { path: "/",        label: "Home",    icon: Home,    match: (l: string) => l === "/" },
  { path: "/explore", label: "Explore", icon: Compass, match: (l: string) => l === "/explore" || l.startsWith("/explore") || l.startsWith("/hashtag") },
] as const;

/* Guest Create tab navigates to AI Studio; Profile requires auth */
const GUEST_CREATE_TAB  = { path: "/create",   label: "Create",  icon: Wand2,       match: (l: string) => l === "/create" };
const GUEST_PROFILE_TAB = {                     label: "Profile", icon: UserCircle };

/* ── Color map ───────────────────────────────────────────────────────────── */
const TAB_COLOR: Record<string, string> = {
  "/":         "#a855f7",
  "/search":   "#ec4899",
  "/explore":  "#a855f7",
  "/create":   "#ec4899",
  "/messages": "#a855f7",
  "/profile":  "#a855f7",
};

/* ── Container styles ────────────────────────────────────────────────────── */
const NAV_BASE: React.CSSProperties = {
  width: "100%",
  background: "#0a0a0a",
  borderTop: "1px solid rgba(255,255,255,0.07)",
  paddingBottom: "env(safe-area-inset-bottom, 0px)",
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

/* ── Upload options sheet ─────────────────────────────────────────────────
   Shows when an authenticated user taps the S (brand-mark) center button.
   Offers: Upload Post, Upload Video, Upload Photo, Create Story.            */
function UploadSheet({ open, onClose, onSelect }: {
  open: boolean;
  onClose: () => void;
  onSelect: (path: string) => void;
}) {
  const options = [
    { icon: Upload,    label: "Upload Post",    path: "/upload"              },
    { icon: Video,     label: "Upload Video",   path: "/upload?type=video"   },
    { icon: ImageIcon, label: "Upload Photo",   path: "/upload?type=photo"   },
    { icon: BookImage, label: "Create Story",   path: "/upload?type=story"   },
  ] as const;

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="upload-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.6)",
              zIndex: 100,
            }}
          />
          {/* Sheet */}
          <motion.div
            key="upload-sheet"
            initial={{ y: "100%", opacity: 0.6 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: "100%", opacity: 0 }}
            transition={{ type: "spring", stiffness: 480, damping: 40 }}
            style={{
              position: "fixed",
              bottom: 0,
              left: "50%",
              transform: "translateX(-50%)",
              width: "100%",
              maxWidth: 480,
              background: "#111113",
              borderTop: "1px solid rgba(255,255,255,0.08)",
              borderRadius: "20px 20px 0 0",
              zIndex: 101,
              paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)",
            }}
          >
            {/* Handle */}
            <div style={{ display: "flex", justifyContent: "center", padding: "12px 0 4px" }}>
              <div style={{ width: 36, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.15)" }} />
            </div>

            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 20px 12px" }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: "#fff" }}>Create</span>
              <motion.button
                whileTap={{ scale: 0.88 }}
                onClick={onClose}
                style={{ background: "rgba(255,255,255,0.08)", border: "none", borderRadius: "50%", width: 30, height: 30, display: "grid", placeItems: "center", cursor: "pointer" }}
              >
                <X style={{ width: 14, height: 14, color: "rgba(255,255,255,0.7)" }} />
              </motion.button>
            </div>

            {/* Options */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, padding: "0 16px 8px" }}>
              {options.map(({ icon: Icon, label, path }) => (
                <motion.button
                  key={label}
                  whileTap={{ scale: 0.94 }}
                  onClick={() => { onSelect(path); onClose(); }}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 10,
                    background: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: 16,
                    padding: "20px 12px",
                    cursor: "pointer",
                  }}
                >
                  <div style={{
                    width: 44,
                    height: 44,
                    borderRadius: "50%",
                    background: "linear-gradient(135deg,#a855f7,#ec4899)",
                    display: "grid",
                    placeItems: "center",
                  }}>
                    <Icon style={{ width: 20, height: 20, color: "#fff" }} />
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.9)", textAlign: "center" }}>
                    {label}
                  </span>
                </motion.button>
              ))}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

/* ── Center brand-mark button ────────────────────────────────────────────── */
function CenterButton({ onClick, gradient }: { onClick: () => void; gradient?: boolean }) {
  return (
    <li style={{ flex: "0 0 72px", display: "flex", justifyContent: "center", alignItems: "center", paddingTop: 4, paddingBottom: 6 }}>
      <motion.button
        whileTap={{ scale: 0.88 }}
        transition={{ type: "spring", stiffness: 480, damping: 22 }}
        onClick={onClick}
        aria-label="Upload"
        style={{
          width: 50,
          height: 50,
          borderRadius: "50%",
          background: gradient
            ? "linear-gradient(135deg,#a855f7,#ec4899)"
            : "#0c0c0e",
          border: gradient ? "none" : "1px solid rgba(255,255,255,0.08)",
          display: "grid",
          placeItems: "center",
          flexShrink: 0,
          boxShadow: gradient
            ? "0 0 16px rgba(168,85,247,0.4)"
            : "0 2px 8px rgba(0,0,0,0.18)",
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
  );
}

/* ── Main component ──────────────────────────────────────────────────────── */
export function BottomNav() {
  const [location, navigate]  = useLocation();
  const isAuthenticated        = useAppStore((s) => s.isAuthenticated);
  const navHidden              = useAppStore((s) => s.navHidden);
  const unreadMessageCount     = useAppStore((s) => s.unreadMessageCount);
  const [showGuestModal, setShowGuestModal] = useState(false);
  const [showUploadSheet, setShowUploadSheet] = useState(false);

  const slideStyle: React.CSSProperties = {
    transform: navHidden
      ? "translateY(100%) translateZ(0)"
      : "translateY(0) translateZ(0)",
    transition: "transform 0.3s cubic-bezier(0.25,0.46,0.45,0.94)",
  };

  /* ── GUEST nav ─────────────────────────────────────────────────────────── */
  if (!isAuthenticated) {
    return (
      <>
        <nav style={{ ...NAV_BASE, ...slideStyle }}>
          <ul style={UL_BASE}>
            {/* Left: Home + Explore */}
            {GUEST_TABS_LEFT.map((tab) => {
              const active = tab.match(location);
              const Icon   = tab.icon;
              const color  = TAB_COLOR[tab.path] ?? "#a855f7";
              return (
                <li key={tab.path} style={{ flex: 1 }}>
                  <NavTab active={active} color={color} label={tab.label} onClick={() => navigate(tab.path)}>
                    <Icon style={{ width: 22, height: 22, color: active ? color : "rgba(255,255,255,0.35)", strokeWidth: active ? 2.2 : 1.6, transition: "color 0.18s ease" }} />
                  </NavTab>
                </li>
              );
            })}

            {/* Center — Join CTA (S button opens auth modal for guests) */}
            <CenterButton gradient onClick={() => setShowGuestModal(true)} />

            {/* Right: Create (→ AI Studio) + Profile (→ auth modal) */}
            {(() => {
              const createActive = GUEST_CREATE_TAB.match(location);
              const createColor  = TAB_COLOR[GUEST_CREATE_TAB.path];
              const CreateIcon   = GUEST_CREATE_TAB.icon;
              const ProfileIcon  = GUEST_PROFILE_TAB.icon;
              return (
                <>
                  <li style={{ flex: 1 }}>
                    <NavTab
                      active={createActive}
                      color={createColor}
                      label={GUEST_CREATE_TAB.label}
                      onClick={() => navigate(GUEST_CREATE_TAB.path)}
                    >
                      <CreateIcon style={{ width: 22, height: 22, color: createActive ? createColor : "rgba(255,255,255,0.35)", strokeWidth: createActive ? 2.2 : 1.6, transition: "color 0.18s ease" }} />
                    </NavTab>
                  </li>
                  <li style={{ flex: 1 }}>
                    <NavTab active={false} color="#a855f7" label={GUEST_PROFILE_TAB.label} onClick={() => setShowGuestModal(true)}>
                      <ProfileIcon style={{ width: 22, height: 22, color: "rgba(255,255,255,0.35)", strokeWidth: 1.6 }} />
                    </NavTab>
                  </li>
                </>
              );
            })()}
          </ul>
        </nav>

        <GuestAuthModal open={showGuestModal} onClose={() => setShowGuestModal(false)} />
      </>
    );
  }

  /* ── AUTH nav ──────────────────────────────────────────────────────────── */
  return (
    <>
      <nav style={{ ...NAV_BASE, ...slideStyle }}>
        <ul style={UL_BASE}>
          {/* Left: Home + Explore */}
          {AUTH_TABS_LEFT.map((tab) => {
            const active = tab.match(location);
            const Icon   = tab.icon;
            const color  = TAB_COLOR[tab.path];
            return (
              <li key={tab.path} style={{ flex: 1 }}>
                <NavTab active={active} color={color} label={tab.label} onClick={() => navigate(tab.path)}>
                  <Icon style={{ width: 22, height: 22, color: active ? color : "rgba(255,255,255,0.35)", strokeWidth: active ? 2.2 : 1.6, transition: "color 0.18s ease" }} />
                </NavTab>
              </li>
            );
          })}

          {/* Center — S button opens upload sheet */}
          <CenterButton onClick={() => setShowUploadSheet(true)} />

          {/* Right: Inbox (Messages) + Profile */}
          {AUTH_TABS_RIGHT.map((tab) => {
            const active = tab.match(location);
            const Icon   = tab.icon;
            const color  = TAB_COLOR[tab.path] ?? "#a855f7";
            const isInbox = tab.path === "/messages";
            const badge   = isInbox && unreadMessageCount > 0;
            return (
              <li key={tab.path} style={{ flex: 1 }}>
                <NavTab active={active} color={color} label={tab.label} onClick={() => navigate(tab.path)}>
                  <span style={{ position: "relative", display: "inline-flex" }}>
                    <Icon style={{ width: 22, height: 22, color: active ? color : "rgba(255,255,255,0.35)", strokeWidth: active ? 2.2 : 1.6, transition: "color 0.18s ease" }} />
                    {badge && (
                      <span style={{
                        position: "absolute",
                        top: -3,
                        right: -4,
                        minWidth: 14,
                        height: 14,
                        borderRadius: 7,
                        background: "#a855f7",
                        border: "1.5px solid #0a0a0a",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 8,
                        fontWeight: 700,
                        color: "#fff",
                        padding: "0 2px",
                      }}>
                        {unreadMessageCount > 9 ? "9+" : unreadMessageCount}
                      </span>
                    )}
                  </span>
                </NavTab>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Upload options sheet — shown when S button is tapped */}
      <UploadSheet
        open={showUploadSheet}
        onClose={() => setShowUploadSheet(false)}
        onSelect={(path) => navigate(path)}
      />
    </>
  );
}

/* ── NavTab ──────────────────────────────────────────────────────────────── */
function NavTab({
  active, color, label, onClick, children,
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
