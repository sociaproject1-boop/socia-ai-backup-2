import { useLocation } from "wouter";
import { Home, Search, Bell, Mail, X, Upload, Video, Image as ImageIcon, BookImage } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useAppStore } from "@/lib/store";
import { useState } from "react";
import { GuestAuthModal } from "@/components/guest/GuestAuthModal";
import markUrl from "@assets/splash2/mark.png";

/* ── Tab definitions ─────────────────────────────────────────────────────── */

const AUTH_TABS = [
  { path: "/",              label: "Home",          icon: Home,   match: (l: string) => l === "/" },
  { path: "/search",        label: "Search",        icon: Search, match: (l: string) => l.startsWith("/search") || l.startsWith("/explore") },
  { path: "__create__",     label: "Socia",         icon: null,   match: (_l: string) => false },
  { path: "/notifications", label: "Notifications", icon: Bell,   match: (l: string) => l.startsWith("/notifications") },
  { path: "/messages",      label: "Messages",      icon: Mail,   match: (l: string) => l.startsWith("/messages") },
] as const;

const GUEST_TABS = [
  { path: "/",        label: "Home",          icon: Home,   match: (l: string) => l === "/" },
  { path: "/explore", label: "Search",        icon: Search, match: (l: string) => l.startsWith("/explore") || l.startsWith("/hashtag") || l.startsWith("/search") },
  { path: "__auth__", label: "Socia",         icon: null,   match: (_l: string) => false },
  { path: "__auth__", label: "Notifications", icon: Bell,   match: (_l: string) => false },
  { path: "__auth__", label: "Messages",      icon: Mail,   match: (_l: string) => false },
] as const;

/* ── Socia S logo mark ───────────────────────────────────────────────────── */
function SociaLogoMark({ size = 28 }: { size?: number }) {
  return (
    <img
      src={markUrl}
      alt="Socia"
      style={{
        width: size,
        height: size,
        objectFit: "contain",
        display: "block",
        pointerEvents: "none",
        userSelect: "none",
      }}
      draggable={false}
    />
  );
}

/* ── Upload options sheet ─────────────────────────────────────────────────── */
function UploadSheet({ open, onClose, onSelect }: {
  open: boolean;
  onClose: () => void;
  onSelect: (path: string) => void;
}) {
  const options = [
    { icon: Upload,    label: "Upload Post",  path: "/upload"            },
    { icon: Video,     label: "Upload Video", path: "/upload?type=video" },
    { icon: ImageIcon, label: "Upload Photo", path: "/upload?type=photo" },
    { icon: BookImage, label: "Create Story", path: "/upload?type=story" },
  ] as const;

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="upload-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 100 }}
          />
          <motion.div
            key="upload-sheet"
            initial={{ y: "100%", opacity: 0.6 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: "100%", opacity: 0 }}
            transition={{ type: "spring", stiffness: 480, damping: 40 }}
            style={{
              position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)",
              width: "100%", maxWidth: 480,
              background: "#16181C",
              borderTop: "1px solid #2F3336",
              borderRadius: "20px 20px 0 0",
              zIndex: 101,
              paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "center", padding: "12px 0 4px" }}>
              <div style={{ width: 36, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.15)" }} />
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 20px 12px" }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: "#E7E9EA" }}>Create post</span>
              <motion.button
                whileTap={{ scale: 0.88 }}
                onClick={onClose}
                style={{ background: "rgba(255,255,255,0.08)", border: "none", borderRadius: "50%", width: 30, height: 30, display: "grid", placeItems: "center", cursor: "pointer" }}
              >
                <X style={{ width: 14, height: 14, color: "rgba(255,255,255,0.7)" }} />
              </motion.button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, padding: "0 16px 8px" }}>
              {options.map(({ icon: Icon, label, path }) => (
                <motion.button
                  key={label}
                  whileTap={{ scale: 0.94 }}
                  onClick={() => { onSelect(path); onClose(); }}
                  style={{
                    display: "flex", flexDirection: "column", alignItems: "center",
                    justifyContent: "center", gap: 10,
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid #2F3336",
                    borderRadius: 16, padding: "20px 12px", cursor: "pointer",
                  }}
                >
                  <div style={{
                    width: 44, height: 44, borderRadius: "50%",
                    background: "#1D9BF0",
                    display: "grid", placeItems: "center",
                  }}>
                    <Icon style={{ width: 20, height: 20, color: "#fff" }} />
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "#E7E9EA", textAlign: "center" }}>
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

/* ── Main component ──────────────────────────────────────────────────────── */
export function BottomNav() {
  const [location, navigate]  = useLocation();
  const isAuthenticated        = useAppStore((s) => s.isAuthenticated);
  const navHidden              = useAppStore((s) => s.navHidden);
  const unreadMessageCount     = useAppStore((s) => s.unreadMessageCount);
  const [showGuestModal, setShowGuestModal] = useState(false);
  const [showUploadSheet, setShowUploadSheet] = useState(false);

  const slideStyle: React.CSSProperties = {
    transform: navHidden ? "translateY(100%) translateZ(0)" : "translateY(0) translateZ(0)",
    transition: "transform 0.3s cubic-bezier(0.25,0.46,0.45,0.94)",
  };

  const navStyle: React.CSSProperties = {
    width: "100%",
    background: "#000000",
    borderTop: "1px solid #2F3336",
    paddingBottom: "env(safe-area-inset-bottom, 0px)",
    willChange: "transform",
    transform: "translateZ(0)",
    backfaceVisibility: "hidden",
  };

  const tabs = isAuthenticated ? AUTH_TABS : GUEST_TABS;

  const handleTabClick = (path: string) => {
  if (path === "__create__") {
    navigate("/create");
  } else if (path === "__auth__") {
    setShowGuestModal(true);
  } else {
    navigate(path);
  }
};

  return (
    <>
      <nav style={{ ...navStyle, ...slideStyle }}>
        <ul style={{ display: "flex", alignItems: "stretch", padding: 0, margin: 0, listStyle: "none", width: "100%" }}>
          {tabs.map((tab, idx) => {
            const active     = tab.match(location);
            const Icon       = tab.icon;
            const isCenter   = tab.label === "Socia";
            const isMessages = tab.label === "Messages" && isAuthenticated;
            const badge      = isMessages && unreadMessageCount > 0;

            return (
              <li key={idx} style={{ flex: 1 }}>
                <motion.button
                  whileTap={{ scale: isCenter ? 0.90 : 0.86 }}
                  transition={{ type: "spring", stiffness: 620, damping: 28 }}
                  onClick={() => handleTabClick(tab.path)}
                  aria-label={tab.label}
                  aria-current={active ? "page" : undefined}
                  style={{
                    display: "flex", flexDirection: "column", alignItems: "center",
                    justifyContent: "center", paddingTop: 10, paddingBottom: 10,
                    width: "100%", userSelect: "none",
                    background: "none", border: "none", cursor: "pointer", minWidth: 0,
                  }}
                >
                  {isCenter ? (
                    /* Socia brand logo mark in the center slot */
                    <motion.span
                      whileTap={{ scale: 0.88 }}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: 36,
                        height: 36,
                      }}
                    >
                      <SociaLogoMark size={30} />
                    </motion.span>
                  ) : Icon ? (
                    <span style={{ position: "relative", display: "inline-flex" }}>
                      <Icon style={{
                        width: 24, height: 24,
                        color: active ? "#E7E9EA" : "#71767B",
                        strokeWidth: active ? 2.5 : 1.8,
                        transition: "color 0.15s ease",
                        fill: active && (tab.label === "Home" || tab.label === "Notifications" || tab.label === "Messages") ? "#E7E9EA" : "none",
                      }} />
                      {badge && (
                        <span style={{
                          position: "absolute", top: -3, right: -4,
                          minWidth: 14, height: 14,
                          borderRadius: 7,
                          background: "#1D9BF0",
                          border: "1.5px solid #000",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 8, fontWeight: 700, color: "#fff", padding: "0 2px",
                        }}>
                          {unreadMessageCount > 9 ? "9+" : unreadMessageCount}
                        </span>
                      )}
                    </span>
                  ) : null}
                </motion.button>
              </li>
            );
          })}
        </ul>
      </nav>

      <UploadSheet
        open={showUploadSheet}
        onClose={() => setShowUploadSheet(false)}
        onSelect={(path) => navigate(path)}
      />
      <GuestAuthModal open={showGuestModal} onClose={() => setShowGuestModal(false)} />
    </>
  );
}
