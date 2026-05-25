/**
 * BusinessVerificationModal — fullscreen overlay showing Socia's DTI
 * Certificate of Business Name Registration.
 *
 * Surfaced from Settings → "Business Verification" row (sits between
 * Privacy and About). Intentionally a standalone modal, NOT a Settings
 * sub-section, so the verification credential is presented as its own
 * trust artefact rather than blending into the rest of the settings UI.
 *
 * Design contract:
 *  - Dark luxury surface, same token palette as the rest of the app
 *    (var(--accent-primary) / --accent-secondary) so it inherits theme.
 *  - Certificate image gets a glowing bordered container and supports
 *    pinch-to-zoom on mobile via `touch-action: pinch-zoom` on a
 *    transform-friendly wrapper (and CSS-only because we don't want
 *    to ship a gesture library for one screen).
 *  - Verified Business badge pinned at top of the scrollable content.
 *  - Body scroll is locked while the modal is open.
 */

import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, ShieldCheck, BadgeCheck } from "lucide-react";
import dtiCertificate from "@/assets/dti-certificate.png";
import { SecureDocumentViewer } from "./SecureDocumentViewer";

interface Props {
  open: boolean;
  onClose: () => void;
}

export function BusinessVerificationModal({ open, onClose }: Props) {
  /* Lock body scroll while open — mobile-first modal contract. We save
     and restore the previous value so we don't trample callers that
     also manage overflow (e.g. ModelSelectorModal). */
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  /* Close on Escape (desktop). */
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
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
            position: "fixed",
            inset: 0,
            zIndex: 140,
            background: "rgba(4,4,12,0.86)",
            backdropFilter: "blur(28px) saturate(140%)",
            WebkitBackdropFilter: "blur(28px) saturate(140%)",
            display: "flex",
            justifyContent: "center",
          }}
        >
          <motion.div
            initial={{ y: 24, opacity: 0, scale: 0.985 }}
            animate={{ y: 0,  opacity: 1, scale: 1 }}
            exit={{    y: 16, opacity: 0, scale: 0.99 }}
            transition={{ type: "spring", stiffness: 340, damping: 30 }}
            style={{
              position: "relative",
              width: "100%",
              maxWidth: 520,
              height: "100dvh",
              display: "flex",
              flexDirection: "column",
              paddingTop: "env(safe-area-inset-top, 0px)",
              color: "white",
            }}
          >
            {/* ── Header ───────────────────────────────────────── */}
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
                aria-label="Close business verification"
                style={{
                  width: 36, height: 36, borderRadius: 12,
                  background: "rgba(255,255,255,0.06)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  cursor: "pointer", color: "rgba(255,255,255,0.7)",
                  touchAction: "manipulation",
                  flexShrink: 0,
                }}
              >
                <X style={{ width: 16, height: 16 }} />
              </motion.button>
            </div>

            {/* ── Scrollable body ──────────────────────────────── */}
            <div
              style={{
                flex: 1,
                minHeight: 0,
                overflowY: "auto",
                overflowX: "hidden",
                WebkitOverflowScrolling: "touch",
                overscrollBehavior: "contain",
                touchAction: "pan-y",
                scrollbarWidth: "none",
                paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 32px)",
              }}
            >
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

              {/* Secure document viewer — pinch/pan/zoom + screenshot
                  deterrents live in SecureDocumentViewer. The viewer
                  only arms its security listeners while `active` is
                  true, so closing the modal tears everything down. */}
              <div style={{ padding: "18px 16px 0" }}>
                <SecureDocumentViewer
                  src={dtiCertificate}
                  alt="DTI Certificate of Business Name Registration for Socia Software Development Services"
                  active={open}
                />
              </div>

              {/* Caption */}
              <p style={{
                margin: "20px 18px 0",
                fontSize: 13,
                lineHeight: 1.6,
                color: "rgba(255,255,255,0.78)",
                textAlign: "center",
              }}>
                <span style={{ color: "white", fontWeight: 700 }}>Socia Software Development Services</span>
                {" "}is a registered business in the Philippines under the Department of Trade and Industry (DTI).
                This registration confirms the legitimacy and ownership of the platform and its software services.
              </p>

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
                  borderRadius: 18,
                  padding: 14,
                  background: "rgba(255,255,255,0.025)",
                  border: "1px solid rgba(255,255,255,0.06)",
                }}>
                  {[
                    "Registered Philippine Business",
                    "Verified Ownership",
                    "Software Development Services",
                    "User Trust & Transparency",
                  ].map(line => (
                    <div key={line} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{
                        width: 22, height: 22, borderRadius: "50%",
                        background: "linear-gradient(135deg, #3b82f6, #8b5cf6)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        flexShrink: 0,
                        boxShadow: "0 0 12px rgba(99,102,241,0.35)",
                      }}>
                        <BadgeCheck style={{ width: 12, height: 12, color: "white" }} strokeWidth={2.5} />
                      </div>
                      <span style={{
                        fontSize: 13, fontWeight: 600,
                        color: "rgba(255,255,255,0.92)",
                      }}>
                        {line}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Footer transparency note */}
              <p style={{
                margin: "20px 24px 0",
                fontSize: 11,
                lineHeight: 1.55,
                color: "rgba(255,255,255,0.42)",
                textAlign: "center",
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
