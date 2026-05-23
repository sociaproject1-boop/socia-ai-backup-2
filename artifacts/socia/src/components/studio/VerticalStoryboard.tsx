/**
 * VerticalStoryboard — Premium cinematic vertical storyboard editor
 * Scenes → Scene Prompt → Transition → Cinematic Mood
 * Wired 100% to real CreateMultiFrame data — zero fake values.
 */

import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus, Trash2, Copy, Upload, Play, Film,
  Sparkles, ChevronDown, Layers,
  Wand2, Clapperboard, Zap,
} from "lucide-react";

/* ─── Design Tokens ─────────────────────────────────────────────── */
const PUR        = "#B026FF";
const PUR_DIM    = "rgba(176,38,255,0.18)";
const PUR_BORDER = "rgba(176,38,255,0.25)";
const BG         = "#0A0A0A";
const GLASS_MID  = "rgba(24, 12, 40, 0.85)";
const BORDER_W   = "rgba(255,255,255,0.07)";
const TEXT_DIM   = "rgba(255,255,255,0.35)";
const TEXT_MID   = "rgba(255,255,255,0.55)";

/* ─── Frame / Config interface ──────────────────────────────────── */
export interface VSFrame {
  id: string;
  imageUrl: string | null;
  uploading: boolean;
  title: string;
  durationSec: number;
  directorInstructions: string;
  emotion: string;
  beatType: string;
  transition: string;
  transDuration: number;
}

export interface VSProps {
  frames: VSFrame[];
  selectedId: string | null;
  onSelectId: (id: string | null) => void;
  onUpdateFrame: (id: string, p: Partial<VSFrame>) => void;
  onAddFrame: () => void;
  onRemoveFrame: (id: string) => void;
  onDuplicateFrame: (id: string) => void;
  onTriggerUpload: (id: string) => void;
  canGenerate: boolean;
  onGenerate: () => void;
  generating: boolean;
  cooldownSec: number;
  engineGradient: string;
  engineGlow: string;
  credits: number;
}

/* ─── Constant option arrays ─────────────────────────────────────── */
const TRANS_OPTIONS = [
  {v:"fade",           l:"Fade",       i:"◑"},
  {v:"dissolve",       l:"Dissolve",   i:"⬡"},
  {v:"zoom",           l:"Zoom",       i:"⊕"},
  {v:"flash",          l:"Flash",      i:"⚡"},
  {v:"warp",           l:"Warp",       i:"⟐"},
  {v:"cinematic-blur", l:"Cine Blur",  i:"◎"},
  {v:"glitch",         l:"Glitch",     i:"▤"},
  {v:"film-burn",      l:"Film Burn",  i:"🔥"},
  {v:"speed-ramp",     l:"Spd Ramp",  i:"⚡"},
  {v:"slide-left",     l:"Slide ←",   i:"←"},
];
const EMOTION_OPTIONS = [
  {v:"calm",l:"Calm",e:"😌"},{v:"romantic",l:"Romantic",e:"💕"},
  {v:"sad",l:"Sad",e:"😢"},{v:"tense",l:"Tense",e:"😰"},
  {v:"inspirational",l:"Inspire",e:"✨"},{v:"mysterious",l:"Mystery",e:"🌑"},
  {v:"happy",l:"Happy",e:"😊"},{v:"angry",l:"Angry",e:"😡"},
  {v:"fear",l:"Fear",e:"😨"},{v:"emotional",l:"Emotional",e:"🥺"},
  {v:"serious",l:"Serious",e:"😤"},{v:"aggressive",l:"Aggress",e:"⚔️"},
];
const BEAT_OPTIONS = [
  {v:"establish",l:"Establish"},{v:"action",l:"Action"},
  {v:"dialogue",l:"Dialogue"},{v:"reveal",l:"Reveal"},
  {v:"climax",l:"Climax"},{v:"pause",l:"Pause"},
  {v:"dream",l:"Dream"},{v:"flashback",l:"Flashback"},
];

/* ─── Sub-components ────────────────────────────────────────────── */
function GlassPanel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      background: GLASS_MID,
      border: `1px solid ${PUR_BORDER}`,
      borderRadius: 18,
      padding: "14px 16px",
      backdropFilter: "blur(16px)",
      boxShadow: `0 8px 32px rgba(176,38,255,0.07), inset 0 1px 0 rgba(255,255,255,0.05)`,
    }}>
      {children}
    </div>
  );
}

function ChipSelector({ options, value, onChange }: {
  options: {v:string;l:string;i?:string}[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      {options.map(o => (
        <button key={o.v} onClick={() => onChange(o.v)}
          style={{
            padding: "5px 10px", borderRadius: 20,
            fontSize: 10, fontWeight: 700,
            border: `1px solid ${value===o.v ? PUR : BORDER_W}`,
            background: value===o.v ? PUR_DIM : "rgba(255,255,255,0.04)",
            color: value===o.v ? "#e0b3ff" : TEXT_DIM,
            transition: "all 0.15s", cursor: "pointer",
          }}>
          {o.i && <span style={{marginRight:4}}>{o.i}</span>}{o.l}
        </button>
      ))}
    </div>
  );
}

function DurationSlider({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: TEXT_DIM, letterSpacing: "0.08em", textTransform: "uppercase" }}>Duration</span>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 800, color: "#e0b3ff" }}>{value}s</span>
          <button onClick={() => onChange(Math.min(30, value + 1))}
            style={{ width: 22, height: 22, borderRadius: 8, background: PUR_DIM, border: `1px solid ${PUR_BORDER}`, color: "#e0b3ff", fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>+</button>
          <button onClick={() => onChange(Math.max(2, value - 1))}
            style={{ width: 22, height: 22, borderRadius: 8, background: "rgba(255,255,255,0.05)", border: `1px solid ${BORDER_W}`, color: TEXT_DIM, fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>−</button>
        </div>
      </div>
      <div style={{ position: "relative", height: 24, display: "flex", alignItems: "center" }}>
        <div style={{ position: "absolute", left: 0, right: 0, height: 3, borderRadius: 2, background: "rgba(255,255,255,0.08)" }} />
        <div style={{ position: "absolute", left: 0, height: 3, borderRadius: 2, background: `linear-gradient(to right, ${PUR}, #ec4899)`, width: `${((value - 2) / 28) * 100}%`, boxShadow: `0 0 8px rgba(176,38,255,0.6)` }} />
        <input type="range" min={2} max={30} value={value}
          onChange={e => onChange(Number(e.target.value))}
          style={{ position: "absolute", left: 0, right: 0, width: "100%", opacity: 0, cursor: "pointer", height: 24 }} />
        <div style={{
          position: "absolute",
          left: `calc(${((value - 2) / 28) * 100}% - 7px)`,
          width: 14, height: 14, borderRadius: "50%",
          background: PUR, border: "2px solid rgba(255,255,255,0.8)",
          boxShadow: `0 0 8px ${PUR}`, pointerEvents: "none",
        }} />
      </div>
    </div>
  );
}

function PromptPanel({ frame, update }: { frame: VSFrame; update: (p: Partial<VSFrame>) => void }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div>
        <p style={{ fontSize: 9, fontWeight: 700, color: TEXT_DIM, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 6 }}>Scene Prompt</p>
        <textarea
          value={frame.directorInstructions}
          onChange={e => update({ directorInstructions: e.target.value })}
          placeholder="Describe the scene motion and action…"
          rows={3}
          style={{
            width: "100%", boxSizing: "border-box",
            background: "rgba(255,255,255,0.04)",
            border: `1px solid ${BORDER_W}`,
            borderRadius: 12, padding: "10px 12px",
            fontSize: 12, color: "white",
            outline: "none", resize: "none", fontFamily: "inherit", lineHeight: 1.5,
          }}
        />
      </div>
      <DurationSlider value={frame.durationSec} onChange={v => update({ durationSec: v })} />
    </div>
  );
}

function TransitionPanel({ frame, update }: { frame: VSFrame; update: (p: Partial<VSFrame>) => void }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div>
        <p style={{ fontSize: 9, fontWeight: 700, color: TEXT_DIM, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 6 }}>Transition Type</p>
        <ChipSelector options={TRANS_OPTIONS.map(o => ({v:o.v, l:o.l, i:o.i}))} value={frame.transition} onChange={v => update({ transition: v })} />
      </div>
      <DurationSlider value={frame.durationSec} onChange={v => update({ durationSec: v })} />
    </div>
  );
}

function MoodPanel({ frame, update }: { frame: VSFrame; update: (p: Partial<VSFrame>) => void }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div>
        <p style={{ fontSize: 9, fontWeight: 700, color: TEXT_DIM, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 6 }}>Cinematic Mood</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 5 }}>
          {EMOTION_OPTIONS.map(o => (
            <button key={o.v} onClick={() => update({ emotion: o.v })}
              style={{
                padding: "7px 4px", borderRadius: 10, textAlign: "center",
                border: `1px solid ${frame.emotion===o.v ? PUR_BORDER : BORDER_W}`,
                background: frame.emotion===o.v ? PUR_DIM : "rgba(255,255,255,0.03)",
                cursor: "pointer", transition: "all 0.15s",
              }}>
              <div style={{ fontSize: 14 }}>{o.e}</div>
              <div style={{ fontSize: 8, fontWeight: 700, color: frame.emotion===o.v ? "#e0b3ff" : TEXT_DIM, marginTop: 2 }}>{o.l}</div>
            </button>
          ))}
        </div>
      </div>
      <div>
        <p style={{ fontSize: 9, fontWeight: 700, color: TEXT_DIM, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 6 }}>Scene Beat</p>
        <ChipSelector options={BEAT_OPTIONS} value={frame.beatType} onChange={v => update({ beatType: v })} />
      </div>
    </div>
  );
}

/* ─── Glow connector ─────────────────────────────────────────────── */
function FlowLine({ glow = false }: { glow?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "center", padding: "4px 0" }}>
      <div style={{
        width: 1.5, height: 28,
        background: `linear-gradient(to bottom, rgba(176,38,255,${glow?0.8:0.4}), rgba(176,38,255,${glow?0.5:0.2}))`,
        boxShadow: glow ? `0 0 6px rgba(176,38,255,0.7)` : "none",
        borderRadius: 1,
      }} />
    </div>
  );
}

/* ─── Storyboard control sections ────────────────────────────────── */
const SECTIONS = [
  { key: "prompt",     label: "Scene Prompt",  icon: Sparkles },
  { key: "transition", label: "Transition",    icon: Film },
  { key: "mood",       label: "Cinematic Mood",icon: Wand2 },
] as const;

/* ─── Bezier connector SVG ───────────────────────────────────────── */
function BezierArrow() {
  return (
    <svg width="32" height="44" viewBox="0 0 32 44" style={{ flexShrink: 0, overflow: "visible" }}>
      <defs>
        <filter id="vs-glow">
          <feGaussianBlur stdDeviation="1.5" result="blur"/>
          <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>
      <path d="M 0 22 C 12 22, 20 22, 32 22"
        stroke={PUR} strokeWidth="1.5" fill="none" strokeOpacity="0.7"
        filter="url(#vs-glow)"
      />
      <circle cx="28" cy="22" r="2" fill={PUR} opacity="0.8"/>
    </svg>
  );
}

/* ─── Scene thumbnail chip in top strip ─────────────────────────── */
function SceneThumb({ frame, idx, selected, onClick }: {
  frame: VSFrame; idx: number; selected: boolean; onClick: () => void;
}) {
  return (
    <motion.button onClick={onClick} whileTap={{ scale: 0.96 }}
      style={{
        position: "relative", width: 76, height: 52, flexShrink: 0,
        borderRadius: 12, overflow: "hidden",
        border: `1.5px solid ${selected ? PUR : BORDER_W}`,
        boxShadow: selected ? `0 0 14px rgba(176,38,255,0.55)` : "none",
        transition: "all 0.2s", background: "rgba(255,255,255,0.04)", cursor: "pointer",
      }}>
      {frame.imageUrl
        ? <img src={frame.imageUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: TEXT_DIM, fontSize: 12 }}>{idx + 1}</div>}
      <div style={{
        position: "absolute", top: 4, left: 4,
        background: selected ? PUR : "rgba(176,38,255,0.5)",
        borderRadius: 5, padding: "1px 5px", fontSize: 8, fontWeight: 800, color: "white",
      }}>{idx + 1}</div>
      <div style={{
        position: "absolute", bottom: 3, right: 4,
        fontSize: 8, fontWeight: 700, color: "rgba(255,255,255,0.55)",
      }}>{frame.durationSec}s</div>
      {frame.uploading && (
        <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.65)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ width: 16, height: 16, borderRadius: "50%", border: `2px solid ${PUR}`, borderTopColor: "transparent", animation: "spin 0.7s linear infinite" }} />
        </div>
      )}
    </motion.button>
  );
}

/* ─── Main Component ─────────────────────────────────────────────── */
export function VerticalStoryboard({
  frames, selectedId, onSelectId, onUpdateFrame,
  onAddFrame, onRemoveFrame, onDuplicateFrame, onTriggerUpload,
  canGenerate, onGenerate, generating, cooldownSec,
  engineGradient, engineGlow, credits,
}: VSProps) {
  const [openSection, setOpenSection] = useState<string>("prompt");
  const scrollRef = useRef<HTMLDivElement>(null);

  const frame    = frames.find(f => f.id === selectedId) ?? frames[0] ?? null;
  const frameIdx = frame ? frames.findIndex(f => f.id === frame.id) : -1;
  const update   = (p: Partial<VSFrame>) => { if (frame) onUpdateFrame(frame.id, p); };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: BG, overflow: "hidden" }}>

      {/* ── SCENE STRIP ────────────────────────────────────────── */}
      <div style={{
        flexShrink: 0, padding: "10px 16px 8px",
        borderBottom: `1px solid ${BORDER_W}`,
        background: "rgba(10,5,18,0.98)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, overflowX: "auto", paddingBottom: 4 }}>
          {frames.map((f, i) => (
            <SceneThumb key={f.id} frame={f} idx={i} selected={f.id === frame?.id} onClick={() => onSelectId(f.id)} />
          ))}
          {frames.length < 10 && (
            <motion.button whileTap={{ scale: 0.95 }} onClick={onAddFrame}
              style={{
                width: 52, height: 52, flexShrink: 0, borderRadius: 12,
                border: `1.5px dashed rgba(176,38,255,0.35)`,
                background: "rgba(176,38,255,0.05)",
                display: "flex", alignItems: "center", justifyContent: "center",
                cursor: "pointer", color: "rgba(176,38,255,0.7)",
              }}>
              <Plus style={{ width: 18, height: 18 }} />
            </motion.button>
          )}
        </div>
        <p style={{ fontSize: 9, fontWeight: 700, color: TEXT_DIM, letterSpacing: "0.1em", textTransform: "uppercase", marginTop: 6 }}>
          {frames.length} scene{frames.length !== 1 ? "s" : ""}
          {frame && ` · Scene ${frameIdx + 1} selected`}
        </p>
      </div>

      {/* ── MAIN SCROLL ────────────────────────────────────────── */}
      {frame ? (
        <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: "16px 16px 100px" }}>

          {/* Scene header */}
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 12 }}>
            <div>
              <p style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(176,38,255,0.8)", marginBottom: 2 }}>
                Scene {frameIdx + 1}
              </p>
              <p style={{ fontSize: 15, fontWeight: 900, color: "white" }}>
                {frame.title || `Scene ${frameIdx + 1}`}
              </p>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={() => onDuplicateFrame(frame.id)}
                style={{ width: 30, height: 30, borderRadius: 10, background: "rgba(255,255,255,0.05)", border: `1px solid ${BORDER_W}`, color: TEXT_DIM, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Copy style={{ width: 13, height: 13 }} />
              </button>
              {frames.length > 2 && (
                <button onClick={() => { onRemoveFrame(frame.id); onSelectId(frames[Math.max(0, frameIdx - 1)]?.id ?? null); }}
                  style={{ width: 30, height: 30, borderRadius: 10, background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.2)", color: "rgba(239,68,68,0.6)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Trash2 style={{ width: 13, height: 13 }} />
                </button>
              )}
            </div>
          </div>

          {/* Scene image — tap to upload */}
          <motion.button whileTap={{ scale: 0.99 }} onClick={() => onTriggerUpload(frame.id)}
            style={{
              position: "relative", width: "100%", aspectRatio: "16/9",
              borderRadius: 18, overflow: "hidden", marginBottom: 4, cursor: "pointer", display: "block",
              background: frame.imageUrl ? "transparent" : "rgba(176,38,255,0.04)",
              border: `1px solid ${frame.imageUrl ? "transparent" : PUR_BORDER}`,
              boxShadow: frame.imageUrl ? `0 8px 40px rgba(176,38,255,0.15)` : "none",
            }}>
            {frame.imageUrl
              ? <img src={frame.imageUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              : (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 8, color: TEXT_DIM }}>
                  <Upload style={{ width: 28, height: 28 }} />
                  <span style={{ fontSize: 12 }}>Tap to add scene image</span>
                </div>
              )}
            {frame.uploading && (
              <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.65)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <div style={{ width: 32, height: 32, borderRadius: "50%", border: `2.5px solid ${PUR}`, borderTopColor: "transparent", animation: "spin 0.8s linear infinite" }} />
              </div>
            )}
          </motion.button>

          <FlowLine glow />

          {/* ── CONTROL SECTIONS ──────────────────────────────── */}
          {SECTIONS.map((section, si) => {
            const Icon  = section.icon;
            const isOpen = openSection === section.key;
            return (
              <div key={section.key}>
                {/* Section header row: mini-thumb + bezier + label button */}
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                  {/* Tiny scene thumbnail */}
                  <div style={{
                    width: 40, height: 28, borderRadius: 8, overflow: "hidden", flexShrink: 0,
                    border: `1px solid ${PUR_BORDER}`, background: "rgba(176,38,255,0.05)",
                    boxShadow: `0 0 8px rgba(176,38,255,0.2)`,
                  }}>
                    {frame.imageUrl
                      ? <img src={frame.imageUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, color: TEXT_DIM }}>{frameIdx + 1}</div>}
                  </div>

                  <BezierArrow />

                  <motion.button
                    onClick={() => setOpenSection(isOpen ? "" : section.key)}
                    whileTap={{ scale: 0.98 }}
                    style={{
                      flex: 1, display: "flex", alignItems: "center", justifyContent: "space-between",
                      background: isOpen ? PUR_DIM : "rgba(255,255,255,0.03)",
                      border: `1px solid ${isOpen ? PUR_BORDER : BORDER_W}`,
                      borderRadius: 12, padding: "8px 12px",
                      cursor: "pointer", transition: "all 0.2s",
                    }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                      <Icon style={{ width: 13, height: 13, color: isOpen ? "#e0b3ff" : TEXT_DIM, flexShrink: 0 }} />
                      <span style={{ fontSize: 11, fontWeight: 800, color: isOpen ? "#e0b3ff" : TEXT_MID, letterSpacing: "0.04em" }}>
                        {section.label}
                      </span>
                    </div>
                    <motion.div animate={{ rotate: isOpen ? 180 : 0 }} transition={{ duration: 0.2, ease: [0.4,0,0.2,1] }}>
                      <ChevronDown style={{ width: 13, height: 13, color: isOpen ? "#e0b3ff" : TEXT_DIM }} />
                    </motion.div>
                  </motion.button>
                </div>

                {/* Glass panel — collapsible */}
                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      key={section.key + "-panel"}
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.22, ease: [0.4,0,0.2,1] }}
                      style={{ overflow: "hidden", marginBottom: 4, paddingLeft: 82 }}>
                      <GlassPanel>
                        {section.key === "prompt"     && <PromptPanel     frame={frame} update={update} />}
                        {section.key === "transition" && <TransitionPanel frame={frame} update={update} />}
                        {section.key === "mood"       && <MoodPanel       frame={frame} update={update} />}
                      </GlassPanel>
                    </motion.div>
                  )}
                </AnimatePresence>

                {si < SECTIONS.length - 1 && <FlowLine />}
              </div>
            );
          })}

          <FlowLine glow />

          {/* Render card */}
          <GlassPanel>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <p style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: TEXT_DIM, marginBottom: 4 }}>
                  Ready to Render
                </p>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <Layers style={{ width: 11, height: 11, color: TEXT_DIM }} />
                  <span style={{ fontSize: 11, color: TEXT_MID, fontWeight: 600 }}>{frames.length} scenes</span>
                  {credits > 0 && (
                    <>
                      <span style={{ color: TEXT_DIM, fontSize: 10 }}>·</span>
                      <Zap style={{ width: 10, height: 10, color: "rgba(176,38,255,0.7)" }} />
                      <span style={{ fontSize: 11, color: "rgba(200,160,255,0.85)", fontWeight: 700 }}>{credits} credits</span>
                    </>
                  )}
                </div>
              </div>
              <motion.button
                whileTap={{ scale: canGenerate ? 0.95 : 1 }}
                onClick={canGenerate ? onGenerate : undefined}
                disabled={!canGenerate || generating}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "10px 20px", borderRadius: 14,
                  background: canGenerate ? engineGradient : "rgba(255,255,255,0.07)",
                  boxShadow: canGenerate ? `0 6px 20px -4px ${engineGlow}` : "none",
                  border: "none", color: "white", fontSize: 12, fontWeight: 800,
                  cursor: canGenerate ? "pointer" : "default",
                  opacity: generating ? 0.6 : 1, transition: "all 0.2s",
                  position: "relative", overflow: "hidden",
                }}>
                {canGenerate && !generating && (
                  <motion.div style={{
                    position: "absolute", inset: 0,
                    background: "linear-gradient(105deg,transparent 35%,rgba(255,255,255,0.15) 50%,transparent 65%)",
                    pointerEvents: "none",
                  }} animate={{ x: ["-100%","100%"] }} transition={{ duration: 2.2, repeat: Infinity, repeatDelay: 1.5 }} />
                )}
                <Clapperboard style={{ width: 14, height: 14, flexShrink: 0 }} />
                <span>{generating ? "Rendering…" : cooldownSec > 0 ? `Wait ${cooldownSec}s` : "Generate"}</span>
              </motion.button>
            </div>
          </GlassPanel>
        </div>
      ) : (
        /* ── EMPTY STATE ─────────────────────────────────────── */
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 20, padding: "24px 32px", textAlign: "center" }}>
          <motion.div
            animate={{ scale: [1, 1.05, 1], rotate: [0, 3, -3, 0] }}
            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
            style={{
              width: 72, height: 72, borderRadius: 24,
              background: `linear-gradient(135deg, ${PUR}, #ec4899)`,
              boxShadow: `0 0 40px rgba(176,38,255,0.5)`,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
            <Play style={{ width: 32, height: 32, color: "white" }} />
          </motion.div>
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 900, color: "white", marginBottom: 8 }}>Build Your Film</h2>
            <p style={{ fontSize: 12, color: TEXT_DIM, lineHeight: 1.5 }}>Upload scene images to craft your cinematic storyboard</p>
          </div>
          <motion.button whileTap={{ scale: 0.97 }} onClick={onAddFrame}
            style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "13px 28px", borderRadius: 16,
              background: `linear-gradient(135deg, ${PUR}, #ec4899)`,
              boxShadow: `0 12px 36px rgba(176,38,255,0.45)`,
              border: "none", color: "white", fontSize: 14, fontWeight: 900, cursor: "pointer",
            }}>
            <Plus style={{ width: 18, height: 18 }} />
            Add First Scene
          </motion.button>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
