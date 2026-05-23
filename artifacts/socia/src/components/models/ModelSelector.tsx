/**
 * ModelSelector — Cinematic AI model selection bottom sheet.
 * Lives EXCLUSIVELY inside the AI Cinematic Studio.
 *
 * Opens when the user taps the "Models" pill in the studio header.
 * Selecting a model writes the new id directly into the page's render
 * pipeline (cfg.renderEngine) AND into the persisted modelStore.
 */

import { motion, AnimatePresence } from "framer-motion";
import { X, Cpu } from "lucide-react";
import { ModelCard, type ModelCardData } from "./ModelCard";

const PUR        = "#B026FF";
const PUR_BORDER = "rgba(176,38,255,0.25)";

export function ModelSelector({
  open, onClose, models, selectedId, onSelect,
}: {
  open: boolean;
  onClose: () => void;
  models: ModelCardData[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="ms-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            style={{
              position: "fixed", inset: 0, zIndex: 90,
              background: "rgba(0,0,0,0.75)",
              backdropFilter: "blur(8px)",
            }}
          />

          {/* Sheet */}
          <motion.div
            key="ms-sheet"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 320 }}
            style={{
              position: "fixed",
              left: 0, right: 0, bottom: 0,
              zIndex: 100,
              background: "linear-gradient(180deg, rgba(14,6,24,0.98) 0%, rgba(8,3,16,0.99) 100%)",
              borderTop: `1px solid ${PUR_BORDER}`,
              borderTopLeftRadius: 28,
              borderTopRightRadius: 28,
              boxShadow: `0 -20px 60px rgba(0,0,0,0.6), 0 -1px 0 rgba(255,255,255,0.05) inset`,
              paddingBottom: "env(safe-area-inset-bottom, 0px)",
              maxHeight: "85vh",
              overflow: "hidden",
              display: "flex", flexDirection: "column",
            }}
          >
            {/* Drag handle */}
            <div style={{ display: "flex", justifyContent: "center", paddingTop: 10 }}>
              <div style={{
                width: 44, height: 4, borderRadius: 2,
                background: "rgba(255,255,255,0.18)",
              }} />
            </div>

            {/* Header */}
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "14px 20px 8px",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{
                  width: 32, height: 32, borderRadius: 10,
                  background: `linear-gradient(135deg, ${PUR}, #ec4899)`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  boxShadow: `0 0 18px rgba(176,38,255,0.55)`,
                }}>
                  <Cpu style={{ width: 16, height: 16, color: "white" }} />
                </div>
                <div>
                  <p style={{
                    fontSize: 9, fontWeight: 800, letterSpacing: "0.16em",
                    textTransform: "uppercase", color: "rgba(176,38,255,0.85)", marginBottom: 1,
                  }}>Cinematic Studio</p>
                  <h2 style={{ fontSize: 17, fontWeight: 900, color: "white", letterSpacing: "-0.01em" }}>
                    Choose AI Model
                  </h2>
                </div>
              </div>
              <button onClick={onClose}
                style={{
                  width: 32, height: 32, borderRadius: 10,
                  background: "rgba(255,255,255,0.06)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  cursor: "pointer", color: "rgba(255,255,255,0.6)",
                }}>
                <X style={{ width: 16, height: 16 }} />
              </button>
            </div>

            <p style={{
              padding: "0 20px 14px",
              fontSize: 11, color: "rgba(255,255,255,0.45)", lineHeight: 1.5,
            }}>
              The selected model powers every scene render in this project.
            </p>

            {/* Horizontal scroll list */}
            <div style={{
              flex: 1,
              display: "flex", gap: 14,
              padding: "4px 20px 24px",
              overflowX: "auto",
              overflowY: "hidden",
              WebkitOverflowScrolling: "touch",
              scrollbarWidth: "none",
            }}>
              {models.map(m => (
                <ModelCard
                  key={m.id}
                  data={m}
                  selected={m.id === selectedId}
                  onSelect={() => { onSelect(m.id); }}
                />
              ))}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
