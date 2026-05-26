import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { ImageIcon, Film, Wand2, Layers, ArrowRight, Sparkles, MessageCircle, Crown, Lock } from "lucide-react";
import { useBillingStore } from "@/lib/billing";
import { useEffect } from "react";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { useToast } from "@/hooks/use-toast";

/**
 * `comingSoon: true` modules are locked for normal users until their
 * backend models / API keys are wired up. Admin users (detected via
 * `useIsAdmin`) bypass the lock and get full access. Toggle by
 * flipping the flag — no other code changes required.
 */
const MODES = [
  {
    path: "/studio",
    title: "AI Preset Studio",
    desc: "1-click pro looks. 26 presets, no prompts.",
    icon: Sparkles,
    glow: "from-fuchsia-500/55 via-purple-500/35 to-transparent",
    iconBg: "linear-gradient(135deg, #a855f7 0%, #ec4899 50%, #6366f1 100%)",
    iconShadow: "0 12px 30px -8px rgba(236,72,153,0.7)",
    premium: false,
    comingSoon: true,
  },
  {
    path: "/create/prompt-image",
    title: "Prompt to Image",
    desc: "Type your idea, get art.",
    icon: ImageIcon,
    glow: "from-purple-500/45 via-fuchsia-500/30 to-transparent",
    iconBg: "linear-gradient(135deg, #a855f7 0%, #d946ef 100%)",
    iconShadow: "0 8px 24px -6px rgba(168,85,247,0.55)",
    premium: false,
    comingSoon: false,
  },
  {
    path: "/create/prompt-video",
    title: "Prompt to Video",
    desc: "Bring words to motion.",
    icon: Film,
    glow: "from-pink-500/45 via-rose-500/30 to-transparent",
    iconBg: "linear-gradient(135deg, #ec4899 0%, #f43f5e 100%)",
    iconShadow: "0 8px 24px -6px rgba(236,72,153,0.55)",
    premium: false,
    comingSoon: false,
  },
  {
    path: "/create/image-video",
    title: "Image to Video",
    desc: "Animate any photo.",
    icon: Wand2,
    glow: "from-blue-500/45 via-cyan-500/30 to-transparent",
    iconBg: "linear-gradient(135deg, #3b82f6 0%, #06b6d4 100%)",
    iconShadow: "0 8px 24px -6px rgba(59,130,246,0.55)",
    premium: false,
    comingSoon: false,
  },
  {
    path: "/create/multi-frame",
    title: "AI Cinematic Studio",
    desc: "Multi-frame cinematic video. Professional AI film editor.",
    icon: Layers,
    glow: "from-indigo-500/55 via-purple-500/35 to-transparent",
    iconBg: "linear-gradient(135deg, #6366f1 0%, #a855f7 50%, #ec4899 100%)",
    iconShadow: "0 12px 30px -8px rgba(139,92,246,0.7)",
    premium: true,
    comingSoon: true,
  },
  {
    path: "/socia-gpt",
    title: "Socia GPT",
    desc: "Your AI assistant. Fix prompts, debug errors, get ideas.",
    icon: MessageCircle,
    glow: "from-purple-500/55 via-fuchsia-400/30 to-transparent",
    iconBg: "linear-gradient(135deg, #a855f7 0%, #ec4899 50%, #6366f1 100%)",
    iconShadow: "0 12px 28px -8px rgba(168,85,247,0.65)",
    premium: false,
    comingSoon: false,
  },
];

export default function CreateHub() {
  const [, navigate] = useLocation();
  const summary = useBillingStore((s) => s.summary);
  const { refresh } = useBillingStore();
  const isAdmin = useIsAdmin();
  const { toast } = useToast();

  useEffect(() => { refresh(); }, [refresh]);

  const isPaid = summary ? (summary.plan_code === "p15" || summary.plan_code === "p30") : true;

  return (
    <div className="px-5 pb-24 pt-5">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="mb-7"
      >
        <h2 className="font-display text-[30px] font-bold leading-[1.05] text-white">
          What will you <span className="text-gradient">create</span> today?
        </h2>
        <p className="mt-2 text-[13.5px] text-white/55">Pick a generator. Shape your idea.</p>
      </motion.div>

      <div className="flex flex-col gap-2.5">
        {MODES.map((m, i) => {
          const Icon = m.icon;
          const premiumLocked = m.premium && !isPaid;
          /* Coming-soon lock applies to everyone *except* admins so we
             can keep iterating on these modules without exposing
             half-wired backends to regular users. */
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
              whileTap={{ scale: comingSoonLocked ? 0.99 : 0.97 }}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                delay: 0.04 + i * 0.045,
                type: "spring",
                stiffness: 360,
                damping: 28,
              }}
              onClick={handleClick}
              aria-disabled={comingSoonLocked || undefined}
              className="card-premium group relative overflow-hidden rounded-3xl p-4 text-left gpu"
              style={comingSoonLocked
                ? { opacity: 0.78, cursor: "not-allowed" }
                : undefined}
            >
              {/* Premium shimmer border for cinematic studio */}
              {m.premium && (
                <div
                  className="pointer-events-none absolute inset-0 rounded-3xl"
                  style={{ border: "1px solid rgba(139,92,246,0.28)", background: "linear-gradient(135deg, rgba(124,58,237,0.06) 0%, rgba(236,72,153,0.04) 100%)" }}
                />
              )}

              {/* Subtle "locked" glow sheen — kept under the content so
                  it never blocks pointer events. */}
              {comingSoonLocked && (
                <div
                  className="pointer-events-none absolute inset-0 rounded-3xl"
                  style={{
                    background:
                      "linear-gradient(135deg, rgba(251,191,36,0.05), rgba(168,85,247,0.04))",
                    boxShadow: "inset 0 0 0 1px rgba(251,191,36,0.18)",
                  }}
                />
              )}

              <div className="relative flex items-center gap-3.5">
                <motion.div
                  whileTap={{ rotate: comingSoonLocked ? 0 : -6 }}
                  transition={{ type: "spring", stiffness: 500, damping: 18 }}
                  className="grid h-[52px] w-[52px] shrink-0 place-items-center rounded-2xl"
                  style={{ background: m.iconBg, boxShadow: m.iconShadow }}
                >
                  <Icon className="h-[22px] w-[22px] text-white" strokeWidth={2.2} />
                </motion.div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <h3 className="font-display text-[16.5px] font-semibold leading-tight text-white">{m.title}</h3>
                    {m.premium && (
                      <span
                        className="flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider"
                        style={premiumLocked
                          ? { background: "rgba(251,191,36,0.12)", color: "#fbbf24", border: "1px solid rgba(251,191,36,0.25)" }
                          : { background: "rgba(124,58,237,0.18)", color: "#c084fc", border: "1px solid rgba(124,58,237,0.3)" }
                        }
                      >
                        <Crown className="h-2.5 w-2.5" />
                        {premiumLocked ? "Premium" : "Active"}
                      </span>
                    )}
                    {comingSoonLocked && (
                      <span
                        className="flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider"
                        style={{
                          background: "rgba(251,191,36,0.14)",
                          color: "#fbbf24",
                          border: "1px solid rgba(251,191,36,0.32)",
                        }}
                      >
                        <Lock className="h-2.5 w-2.5" />
                        Coming Soon
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-[12px] text-white/55">{m.desc}</p>
                </div>
                <motion.span
                  className="inline-block"
                  whileTap={{ x: comingSoonLocked ? 0 : 4 }}
                  transition={{ type: "spring", stiffness: 600, damping: 22 }}
                >
                  <ArrowRight className="h-[18px] w-[18px] text-white/40" />
                </motion.span>
              </div>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
