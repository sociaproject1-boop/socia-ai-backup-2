/**
 * BusinessVerificationModal — fullscreen overlay showing Socia's business
 * registration documents: DTI Certificate + BIR Form 2303 (3 pages).
 *
 * Tabbed document navigator so the user can switch between the four docs.
 * Body scroll is locked while the modal is open.
 */

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, ShieldCheck, BadgeCheck, ChevronLeft, ChevronRight } from "lucide-react";
import dtiCertificate from "@/assets/dti-certificate.png";
import bir2303p1 from "@/assets/bir-2303-page1.png";
import bir2303p2 from "@/assets/bir-2303-page2.png";
import bir2303p3 from "@/assets/bir-2303-page3.png";
import { SecureDocumentViewer } from "./SecureDocumentViewer";

interface DocDef {
  id: string;
  label: string;
  shortLabel: string;
  src: string;
  alt: string;
  issuer: string;
}

const DOCS: DocDef[] = [
  {
    id: "dti",
    label: "DTI Certificate",
    shortLabel: "DTI",
    src: dtiCertificate,
    alt: "DTI Certificate of Business Name Registration for Socia Software Development Services",
    issuer: "Department of Trade and Industry",
  },
  {
    id: "bir-p1",
    label: "BIR 2303 — Page 1",
    shortLabel: "BIR P1",
    src: bir2303p1,
    alt: "BIR Certificate of Registration (Form 2303) Page 1",
    issuer: "Bureau of Internal Revenue",
  },
  {
    id: "bir-p2",
    label: "BIR 2303 — Page 2",
    shortLabel: "BIR P2",
    src: bir2303p2,
    alt: "BIR Certificate of Registration (Form 2303) Page 2",
    issuer: "Bureau of Internal Revenue",
  },
  {
    id: "bir-p3",
    label: "BIR 2303 — Page 3",
    shortLabel: "BIR P3",
    src: bir2303p3,
    alt: "BIR Certificate of Registration (Form 2303) Page 3",
    issuer: "Bureau of Internal Revenue",
  },
];

interface Props {
  open: boolean;
  onClose: () => void;
}

export function BusinessVerificationModal({ open, onClose }: Props) {
  const [activeIdx, setActiveIdx] = useState(0);

  const activeDoc = DOCS[activeIdx];

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") setActiveIdx((i) => Math.min(i + 1, DOCS.length - 1));
      if (e.key === "ArrowLeft")  setActiveIdx((i) => Math.max(i - 1, 0));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="bvm-root"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          style={{
            position: "fixed", inset: 0, zIndex: 140,
            background: "rgba(4,4,12,0.88)",
            backdropFilter: "blur(28px) saturate(140%)",
            WebkitBackdropFilter: "blur(28px) saturate(140%)",
            display: "flex", justifyContent: "center",
          }}
        >
          <motion.div
            initial={{ y: 24, opacity: 0, scale: 0.985 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 16, opacity: 0, scale: 0.99 }}
            transition={{ type: "spring", stiffness: 340, damping: 30 }}
            style={{
              position: "relative", width: "100%", maxWidth: 520,
              height: "100dvh", display: "flex", flexDirection: "column",
              paddingTop: "env(safe-area-inset-top, 0px)", color: "white",
            }}
          >
            {/* ── Header ─────────────────────────────────────── */}
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "14px 16px 12px",
              borderBottom: "1px solid rgba(255,255,255,0.05)",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
                <div style={{
                  width: 38, height: 38, borderRadius: 12,
                  background: "linear-gradient(135deg, #3b82f6, #8b5cf6)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  boxShadow: "0 0 22px rgba(99,102,241,0.55), inset 0 1px 0 rgba(255,255,255,0.18)",
                  flexShrink: 0,
                }}>
                  <ShieldCheck style={{ width: 18, height: 18, color: "white" }} />
                </div>
                <div style={{ minWidth: 0 }}>
                  <p style={{
                    fontSize: 9, fontWeight: 800, letterSpacing: "0.18em",
                    textTransform: "uppercase", color: "rgba(139,92,246,0.95)", marginBottom: 2,
                  }}>Verification</p>
                  <h2 style={{
                    fontSize: 18, fontWeight: 900, color: "white",
                    letterSpacing: "-0.015em", lineHeight: 1.1,
                    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                  }}>
                    Business Registration
                  </h2>
                </div>
              </div>
              <motion.button
                onClick={onClose}
                whileTap={{ scale: 0.92 }}
                aria-label="Close"
                style={{
                  width: 36, height: 36, borderRadius: 12,
                  background: "rgba(255,255,255,0.06)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  cursor: "pointer", color: "rgba(255,255,255,0.7)",
                  touchAction: "manipulation", flexShrink: 0,
                }}
              >
                <X style={{ width: 16, height: 16 }} />
              </motion.button>
            </div>

            {/* ── Tab bar ─────────────────────────────────────── */}
            <div style={{
              display: "flex", overflowX: "auto", gap: 6, padding: "10px 16px",
              borderBottom: "1px solid rgba(255,255,255,0.05)",
              scrollbarWidth: "none",
            }}>
              {DOCS.map((doc, idx) => (
                <button
                  key={doc.id}
                  onClick={() => setActiveIdx(idx)}
                  style={{
                    flexShrink: 0,
                    padding: "5px 12px",
                    borderRadius: 20,
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: "0.02em",
                    cursor: "pointer",
                    transition: "all 0.18s",
                    background: activeIdx === idx
                      ? "linear-gradient(135deg, rgba(59,130,246,0.3), rgba(139,92,246,0.3))"
                      : "rgba(255,255,255,0.05)",
                    border: `1px solid ${activeIdx === idx ? "rgba(139,92,246,0.5)" : "rgba(255,255,255,0.08)"}`,
                    color: activeIdx === idx ? "#e0e7ff" : "rgba(255,255,255,0.5)",
                  }}
                >
                  {doc.shortLabel}
                </button>
              ))}
            </div>

            {/* ── Scrollable body ─────────────────────────────── */}
            <div style={{
              flex: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden",
              WebkitOverflowScrolling: "touch", overscrollBehavior: "contain",
              touchAction: "pan-y", scrollbarWidth: "none",
              paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 32px)",
            }}>
              {/* Verified Business badge */}
              <div style={{ padding: "18px 16px 0", display: "flex", justifyContent: "center" }}>
                <div style={{
                  display: "inline-flex", alignItems: "center", gap: 8,
                  padding: "8px 14px", borderRadius: 999,
                  background: "linear-gradient(135deg, rgba(59,130,246,0.18), rgba(139,92,246,0.18))",
                  border: "1px solid rgba(139,92,246,0.45)",
                  boxShadow: "0 0 24px rgba(99,102,241,0.25), inset 0 1px 0 rgba(255,255,255,0.06)",
                }}>
                  <BadgeCheck style={{ width: 14, height: 14, color: "#a5b4fc" }} />
                  <span style={{
                    fontSize: 10.5, fontWeight: 800, letterSpacing: "0.12em",
                    textTransform: "uppercase", color: "#e0e7ff",
                  }}>
                    Verified Business
                  </span>
                </div>
              </div>

              {/* Document title + issuer */}
              <div style={{ padding: "12px 16px 0", textAlign: "center" }}>
                <AnimatePresence mode="wait">
                  <motion.div
                    key={activeDoc.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.18 }}
                  >
                    <p style={{
                      fontSize: 14, fontWeight: 800, color: "white",
                      letterSpacing: "-0.01em",
                    }}>
                      {activeDoc.label}
                    </p>
                    <p style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", marginTop: 2 }}>
                      Issued by the {activeDoc.issuer}
                    </p>
                  </motion.div>
                </AnimatePresence>
              </div>

              {/* Document image */}
              <div style={{ padding: "14px 16px 0" }}>
                <AnimatePresence mode="wait">
                  <motion.div
                    key={activeDoc.id}
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.98 }}
                    transition={{ duration: 0.2 }}
                  >
                    <SecureDocumentViewer
                      src={activeDoc.src}
                      alt={activeDoc.alt}
                      active={open}
                    />
                  </motion.div>
                </AnimatePresence>
              </div>

              {/* Prev / Next navigation */}
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "14px 16px 0",
              }}>
                <button
                  onClick={() => setActiveIdx((i) => Math.max(i - 1, 0))}
                  disabled={activeIdx === 0}
                  style={{
                    display: "flex", alignItems: "center", gap: 6,
                    padding: "8px 14px", borderRadius: 20,
                    background: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    color: activeIdx === 0 ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.7)",
                    fontSize: 12, fontWeight: 600, cursor: activeIdx === 0 ? "not-allowed" : "pointer",
                    touchAction: "manipulation",
                  }}
                >
                  <ChevronLeft style={{ width: 14, height: 14 }} />
                  Previous
                </button>
                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>
                  {activeIdx + 1} / {DOCS.length}
                </span>
                <button
                  onClick={() => setActiveIdx((i) => Math.min(i + 1, DOCS.length - 1))}
                  disabled={activeIdx === DOCS.length - 1}
                  style={{
                    display: "flex", alignItems: "center", gap: 6,
                    padding: "8px 14px", borderRadius: 20,
                    background: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    color: activeIdx === DOCS.length - 1 ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.7)",
                    fontSize: 12, fontWeight: 600,
                    cursor: activeIdx === DOCS.length - 1 ? "not-allowed" : "pointer",
                    touchAction: "manipulation",
                  }}
                >
                  Next
                  <ChevronRight style={{ width: 14, height: 14 }} />
                </button>
              </div>

              {/* Trust indicators */}
              <div style={{ padding: "22px 16px 0" }}>
                <p style={{
                  fontSize: 9.5, fontWeight: 800, letterSpacing: "0.16em",
                  textTransform: "uppercase", color: "rgba(255,255,255,0.5)",
                  marginBottom: 10, paddingLeft: 4,
                }}>
                  Trust & Compliance
                </p>
                <div style={{
                  display: "flex", flexDirection: "column", gap: 8,
                  borderRadius: 18, padding: 14,
                  background: "rgba(255,255,255,0.025)",
                  border: "1px solid rgba(255,255,255,0.06)",
                }}>
                  {[
                    "Registered Philippine Business",
                    "DTI Certificate of Business Name Registration",
                    "BIR Certificate of Registration (Form 2303)",
                    "Software Development Services",
                    "User Trust & Transparency",
                  ].map((line) => (
                    <div key={line} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{
                        width: 22, height: 22, borderRadius: "50%",
                        background: "linear-gradient(135deg, #3b82f6, #8b5cf6)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        flexShrink: 0, boxShadow: "0 0 12px rgba(99,102,241,0.35)",
                      }}>
                        <BadgeCheck style={{ width: 12, height: 12, color: "white" }} strokeWidth={2.5} />
                      </div>
                      <span style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.92)" }}>
                        {line}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <p style={{
                margin: "20px 24px 0", fontSize: 11, lineHeight: 1.55,
                color: "rgba(255,255,255,0.42)", textAlign: "center",
              }}>
                Business information is displayed for transparency and user confidence.
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
