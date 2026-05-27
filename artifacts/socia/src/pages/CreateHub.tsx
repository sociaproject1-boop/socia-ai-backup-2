import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  ImageIcon, Film, Wand2, Layers, ArrowRight,
  Sparkles, MessageCircle, Crown, Lock,
} from "lucide-react";
import { useBillingStore } from "@/lib/billing";
import { useEffect } from "react";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { useToast } from "@/hooks/use-toast";

/**
 * `comingSoon: true` modules are locked for normal users until their
 * backend models / API keys are wired up. Admin users bypass the lock.
 */
const MODES = [
  {
    path: "/studio",
    title: "AI Preset Studio",
    desc: "1-click pro looks. 26 presets, no prompts.",
    icon: Sparkles,
    aurora: "linear-gradient(135deg, #a855f7, #ec4899, #6366f1, #a855f7)",
    glowColor: "rgba(168,85,247,0.7)",
    iconBg: "linear-gradient(135deg, #a855f7 0%, #ec4899 50%, #6366f1 100%)",
    iconShadow: "0 0 28px rgba(168,85,247,0.8), 0 0 60px rgba(236,72,153,0.4)",
    borderColor: "rgba(168,85,247,0.45)",
    premium: false,
    comingSoon: true,
  },
  {
    path: "/create/prompt-image",
    title: "Prompt to Image",
    desc: "Type your idea, get stunning art.",
    icon: ImageIcon,
    aurora: "linear-gradient(135deg, #7c3aed, #a855f7, #d946ef, #7c3aed)",
    glowColor: "rgba(139,92,246,0.7)",
    iconBg: "linear-gradient(135deg, #7c3aed 0%, #a855f7 50%, #d946ef 100%)",
    iconShadow: "0 0 28px rgba(139,92,246,0.8), 0 0 60px rgba(168,85,247,0.4)",
    borderColor: "rgba(139,92,246,0.45)",
    premium: false,
    comingSoon: false,
  },
  {
    path: "/create/prompt-video",
    title: "Prompt to Video",
    desc: "Bring words to cinematic motion.",
    icon: Film,
    aurora: "linear-gradient(135deg, #ec4899, #f43f5e, #fb923c, #ec4899)",
    glowColor: "rgba(236,72,153,0.7)",
    iconBg: "linear-gradient(135deg, #ec4899 0%, #f43f5e 60%, #fb923c 100%)",
    iconShadow: "0 0 28px rgba(236,72,153,0.8), 0 0 60px rgba(244,63,94,0.4)",
    borderColor: "rgba(236,72,153,0.45)",
    premium: false,
    comingSoon: false,
  },
  {
    path: "/create/image-video",
    title: "Image to Video",
    desc: "Animate any photo into life.",
    icon: Wand2,
    aurora: "linear-gradient(135deg, #2563eb, #3b82f6, #06b6d4, #2563eb)",
    glowColor: "rgba(59,130,246,0.7)",
    iconBg: "linear-gradient(135deg, #2563eb 0%, #3b82f6 50%, #06b6d4 100%)",
    iconShadow: "0 0 28px rgba(59,130,246,0.8), 0 0 60px rgba(6,182,212,0.4)",
    borderColor: "rgba(59,130,246,0.45)",
    premium: false,
    comingSoon: false,
  },
  {
    path: "/create/multi-frame",
    title: "AI Cinematic Studio",
    desc: "Multi-frame cinematic video. Professional AI film.",
    icon: Layers,
    aurora: "linear-gradient(135deg, #4f46e5, #6366f1, #a855f7, #ec4899, #4f46e5)",
    glowColor: "rgba(99,102,241,0.7)",
    iconBg: "linear-gradient(135deg, #4f46e5 0%, #6366f1 30%, #a855f7 65%, #ec4899 100%)",
    iconShadow: "0 0 32px rgba(99,102,241,0.85), 0 0 70px rgba(168,85,247,0.5)",
    borderColor: "rgba(99,102,241,0.5)",
    premium: true,
    comingSoon: true,
  },
  {
    path: "/socia-gpt",
    title: "Socia GPT",
    desc: "Your AI assistant — fix prompts, get ideas.",
    icon: MessageCircle,
    aurora: "linear-gradient(135deg, #7c3aed, #a855f7, #ec4899, #7c3aed)",
    glowColor: "rgba(168,85,247,0.65)",
    iconBg: "linear-gradient(135deg, #7c3aed 0%, #a855f7 50%, #ec4899 100%)",
    iconShadow: "0 0 28px rgba(168,85,247,0.75), 0 0 55px rgba(236,72,153,0.35)",
    borderColor: "rgba(168,85,247,0.42)",
    premium: false,
    comingSoon: false,
  },
];

/** Inject keyframes for the aurora card animations. */
function CreateHubStyles() {
  return (
    <style>{`
      @keyframes ch-aurora {
        0%   { background-position: 0%   50%; }
        50%  { background-position: 100% 50%; }
        100% { background-position: 0%   50%; }
      }
      .ch-aurora-bg {
        background-size: 280% 280%;
        animation: ch-aurora 9s ease-in-out infinite;
        will-change: background-position;
      }
      @keyframes ch-shimmer {
        0%   { transform: translateX(-140%) skewX(-18deg); }
        100% { transform: translateX(260%)  skewX(-18deg); }
      }
      .ch-shimmer {
        animation: ch-shimmer 5s ease-in-out infinite;
        will-change: transform;
      }
      @keyframes ch-orb-pulse {
        0%, 100% { box-shadow: 0 0 0 0 rgba(255,255,255,0.0);  }
        50%       { box-shadow: 0 0 0 6px rgba(255,255,255,0.07); }
      }
      .ch-orb-pulse { animation: ch-orb-pulse 2.8s ease-in-out infinite; }
      @keyframes ch-border-glow {
        0%, 100% { opacity: 0.55; }
        50%       { opacity: 1;    }
      }
      .ch-border-glow { animation: ch-border-glow 2.5s ease-in-out infinite; will-change: opacity; }
    `}</style>
  );
}

export default function CreateHub() {
  const [, navigate] = useLocation();
  const summary = useBillingStore((s) => s.summary);
  const { refresh } = useBillingStore();
  const isAdmin = useIsAdmin();
  const { toast } = useToast();

  useEffect(() => { refresh(); }, [refresh]);

  const isPaid = summary
    ? (summary.plan_code === "p15" || summary.plan_code === "p30")
    : true;

  return (
    <div className="scroll-native gpu h-full overflow-y-auto pb-28 hide-scrollbar">
      <CreateHubStyles />

      <div className="px-4 pt-5 pb-2">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          className="mb-7"
        >
          <h2 className="font-display text-[30px] font-bold leading-[1.05] text-white">
            What will you{" "}
            <span className="text-gradient">create</span> today?
          </h2>
          <p className="mt-2 text-[13px] text-white/50">
            Pick a generator. Shape your idea.
          </p>
        </motion.div>

        <div className="flex flex-col gap-3">
          {MODES.map((m, i) => {
            const Icon = m.icon;
            const premiumLocked  = m.premium && !isPaid;
            const comingSoonLocked = m.comingSoon && !isAdmin;

            const handleClick = () => {
              if (comingSoonLocked) {
                toast({
                  title: "Coming Soon",
                  description: "Models are currently being integrated.",
                });
                return;
              }
              navigate(m.path);
            };

            return (
              <motion.button
                key={m.path}
                whileTap={{ scale: comingSoonLocked ? 0.99 : 0.965 }}
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  delay: 0.05 + i * 0.055,
                  type: "spring",
                  stiffness: 340,
                  damping: 26,
                }}
                onClick={handleClick}
                aria-disabled={comingSoonLocked || undefined}
                className="relative overflow-hidden rounded-3xl text-left gpu"
                style={{
                  opacity: comingSoonLocked ? 0.82 : 1,
                  cursor: comingSoonLocked ? "not-allowed" : "pointer",
                  height: 88,
                }}
              >
                {/* ── Aurora animated background ── */}
                <div
                  className="ch-aurora-bg pointer-events-none absolute inset-0"
                  style={{
                    background: m.aurora,
                    opacity: 0.18,
                  }}
                />

                {/* ── Dark glass base layer ── */}
                <div
                  className="pointer-events-none absolute inset-0"
                  style={{
                    background: "rgba(8,6,18,0.82)",
                    backdropFilter: "blur(12px)",
                    WebkitBackdropFilter: "blur(12px)",
                  }}
                />

                {/* ── Shimmer sweep ── */}
                <div
                  className="pointer-events-none absolute inset-0 overflow-hidden"
                  style={{ borderRadius: 24 }}
                >
                  <span
                    className="ch-shimmer pointer-events-none absolute inset-y-0"
                    style={{
                      width: "45%",
                      background:
                        "linear-gradient(105deg, transparent 0%, rgba(255,255,255,0.045) 50%, transparent 100%)",
                    }}
                  />
                </div>

                {/* ── Neon border ── */}
                <div
                  className="ch-border-glow pointer-events-none absolute inset-0 rounded-3xl"
                  style={{
                    boxShadow: `inset 0 0 0 1px ${m.borderColor}`,
                  }}
                />

                {/* ── Subtle inner bottom glow ── */}
                <div
                  className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 rounded-b-3xl"
                  style={{
                    background: `linear-gradient(0deg, ${m.glowColor.replace("0.7", "0.08")} 0%, transparent 100%)`,
                  }}
                />

                {/* ── Content row ── */}
                <div className="relative flex h-full items-center gap-4 px-4">

                  {/* Icon orb */}
                  <motion.div
                    whileTap={{ rotate: comingSoonLocked ? 0 : -8, scale: 0.9 }}
                    transition={{ type: "spring", stiffness: 500, damping: 18 }}
                    className="ch-orb-pulse grid shrink-0 place-items-center rounded-2xl"
                    style={{
                      width: 54,
                      height: 54,
                      background: m.iconBg,
                      boxShadow: m.iconShadow,
                    }}
                  >
                    <Icon
                      style={{
                        width: 23,
                        height: 23,
                        color: "white",
                        filter: "drop-shadow(0 0 8px rgba(255,255,255,0.55))",
                      }}
                      strokeWidth={2.1}
                    />
                  </motion.div>

                  {/* Text block */}
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <h3
                        className="font-display font-semibold leading-tight text-white"
                        style={{ fontSize: 16, letterSpacing: "-0.018em" }}
                      >
                        {m.title}
                      </h3>

                      {m.premium && (
                        <span
                          className="flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider"
                          style={
                            premiumLocked
                              ? { background: "rgba(251,191,36,0.12)", color: "#fbbf24", border: "1px solid rgba(251,191,36,0.28)" }
                              : { background: "rgba(124,58,237,0.20)", color: "#c084fc", border: "1px solid rgba(124,58,237,0.32)" }
                          }
                        >
                          <Crown style={{ width: 9, height: 9 }} />
                          {premiumLocked ? "Premium" : "Active"}
                        </span>
                      )}

                      {comingSoonLocked && (
                        <span
                          className="flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider"
                          style={{
                            background: "rgba(251,191,36,0.12)",
                            color: "#fbbf24",
                            border: "1px solid rgba(251,191,36,0.30)",
                          }}
                        >
                          <Lock style={{ width: 9, height: 9 }} />
                          Coming Soon
                        </span>
                      )}
                    </div>

                    <p
                      className="mt-0.5 text-white/52"
                      style={{ fontSize: 12, lineHeight: 1.4 }}
                    >
                      {m.desc}
                    </p>
                  </div>

                  {/* Arrow */}
                  <motion.span
                    className="inline-block shrink-0"
                    whileTap={{ x: comingSoonLocked ? 0 : 5 }}
                    transition={{ type: "spring", stiffness: 600, damping: 22 }}
                  >
                    <ArrowRight
                      style={{
                        width: 18,
                        height: 18,
                        color: comingSoonLocked ? "rgba(255,255,255,0.22)" : "rgba(255,255,255,0.5)",
                      }}
                    />
                  </motion.span>
                </div>
              </motion.button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
