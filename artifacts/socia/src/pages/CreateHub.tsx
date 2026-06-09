import { useLocation } from "wouter";
import { motion } from "framer-motion";
import {
  ImageIcon, Film, Wand2, Layers, ArrowRight,
  Sparkles, MessageCircle, Crown, Lock,
  Mic2, LayoutTemplate, Captions, ShoppingBag, UserCircle2,
} from "lucide-react";
import { useBillingStore } from "@/lib/billing";
import { useEffect } from "react";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { useAppStore } from "@/lib/store";
import { useToast } from "@/hooks/use-toast";
import { useLoginGate } from "@/lib/useLoginGate";

const MODES = [
  {
    path: "/create/prompt-image",
    title: "Prompt to Image",
    desc: "Type your idea, get stunning AI art.",
    icon: ImageIcon,
    iconBg: "linear-gradient(135deg, #7c3aed 0%, #a855f7 50%, #d946ef 100%)",
    iconShadow: "0 4px 14px -4px rgba(139,92,246,0.55)",
    borderColor: "rgba(139,92,246,0.14)",
    premium: false,
    comingSoon: false,
  },
  {
    path: "/create/prompt-image",
    title: "Image to Image",
    desc: "Transform any photo with AI style transfer.",
    icon: Sparkles,
    iconBg: "linear-gradient(135deg, #a855f7 0%, #ec4899 50%, #6366f1 100%)",
    iconShadow: "0 4px 14px -4px rgba(168,85,247,0.55)",
    borderColor: "rgba(168,85,247,0.14)",
    premium: false,
    comingSoon: true,
  },
  {
    path: "/create/image-video",
    title: "Image to Video",
    desc: "Animate any photo into cinematic motion.",
    icon: Wand2,
    iconBg: "linear-gradient(135deg, #2563eb 0%, #3b82f6 50%, #06b6d4 100%)",
    iconShadow: "0 4px 14px -4px rgba(59,130,246,0.55)",
    borderColor: "rgba(59,130,246,0.14)",
    premium: false,
    comingSoon: false,
  },
  {
    path: "/create/prompt-video",
    title: "Text to Video",
    desc: "Bring words to cinematic motion.",
    icon: Film,
    iconBg: "linear-gradient(135deg, #ec4899 0%, #f43f5e 60%, #fb923c 100%)",
    iconShadow: "0 4px 14px -4px rgba(236,72,153,0.55)",
    borderColor: "rgba(236,72,153,0.14)",
    premium: false,
    comingSoon: false,
  },
  {
    path: "/create/multi-frame",
    title: "AI Cinematic Studio",
    desc: "Multi-frame cinematic video. Professional AI film.",
    icon: Layers,
    iconBg: "linear-gradient(135deg, #4f46e5 0%, #6366f1 30%, #a855f7 65%, #ec4899 100%)",
    iconShadow: "0 4px 14px -4px rgba(99,102,241,0.55)",
    borderColor: "rgba(99,102,241,0.18)",
    premium: true,
    comingSoon: true,
  },
  {
    path: "/socia-gpt",
    title: "Socia GPT",
    desc: "AI assistant — ideas, prompts, multimodal.",
    icon: MessageCircle,
    iconBg: "linear-gradient(135deg, #7c3aed 0%, #a855f7 50%, #ec4899 100%)",
    iconShadow: "0 4px 14px -4px rgba(168,85,247,0.5)",
    borderColor: "rgba(168,85,247,0.14)",
    premium: false,
    comingSoon: false,
  },
  {
    path: "/create/voice",
    title: "AI Voice Generator",
    desc: "Text to lifelike speech in any style.",
    icon: Mic2,
    iconBg: "linear-gradient(135deg, #0ea5e9 0%, #06b6d4 50%, #10b981 100%)",
    iconShadow: "0 4px 14px -4px rgba(6,182,212,0.55)",
    borderColor: "rgba(6,182,212,0.14)",
    premium: false,
    comingSoon: true,
  },
  {
    path: "/create/thumbnail",
    title: "AI Thumbnail Generator",
    desc: "Click-worthy thumbnails, generated instantly.",
    icon: LayoutTemplate,
    iconBg: "linear-gradient(135deg, #f59e0b 0%, #f97316 60%, #ef4444 100%)",
    iconShadow: "0 4px 14px -4px rgba(249,115,22,0.55)",
    borderColor: "rgba(249,115,22,0.14)",
    premium: false,
    comingSoon: true,
  },
  {
    path: "/create/caption",
    title: "AI Caption Generator",
    desc: "Smart captions and hashtags for every post.",
    icon: Captions,
    iconBg: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #a855f7 100%)",
    iconShadow: "0 4px 14px -4px rgba(99,102,241,0.55)",
    borderColor: "rgba(99,102,241,0.14)",
    premium: false,
    comingSoon: true,
  },
  {
    path: "/create/product",
    title: "AI Product Generator",
    desc: "Studio-quality product shots, no camera needed.",
    icon: ShoppingBag,
    iconBg: "linear-gradient(135deg, #10b981 0%, #059669 50%, #0d9488 100%)",
    iconShadow: "0 4px 14px -4px rgba(16,185,129,0.55)",
    borderColor: "rgba(16,185,129,0.14)",
    premium: true,
    comingSoon: true,
  },
  {
    path: "/create/avatar",
    title: "AI Avatar Studio",
    desc: "Generate a hyper-realistic AI version of you.",
    icon: UserCircle2,
    iconBg: "linear-gradient(135deg, #be185d 0%, #ec4899 50%, #f472b6 100%)",
    iconShadow: "0 4px 14px -4px rgba(236,72,153,0.55)",
    borderColor: "rgba(236,72,153,0.14)",
    premium: true,
    comingSoon: true,
  },
];

function CreateHubStyles() {
  return (
    <style>{`
      @keyframes ch-orb-pulse {
        0%, 100% { box-shadow: 0 0 0 0 rgba(255,255,255,0.0);  }
        50%       { box-shadow: 0 0 0 5px rgba(255,255,255,0.06); }
      }
      .ch-orb-pulse { animation: ch-orb-pulse 2.8s ease-in-out infinite; }
    `}</style>
  );
}

export default function CreateHub() {
  const [, navigate] = useLocation();
  const summary = useBillingStore((s) => s.summary);
  const { refresh } = useBillingStore();
  const isAdmin = useIsAdmin();
  const isOwner = useAppStore((s) => s.user?.isOwner === true);
  const { toast } = useToast();
  const { requireLogin } = useLoginGate();

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
          className="mb-6"
        >
          <h2 className="font-display text-[28px] font-bold leading-[1.05] text-white">
            AI Studio{" "}
            <span className="text-gradient">Hub</span>
          </h2>
          <p className="mt-1.5 text-[13px] text-white/50">
            11 AI tools. One creative home.
          </p>
        </motion.div>

        <div className="flex flex-col gap-2.5">
          {MODES.map((m, i) => {
            const Icon = m.icon;
            const premiumLocked    = m.premium && !isPaid;
            const comingSoonLocked = m.comingSoon && !isAdmin && !isOwner;

            const handleClick = () => {
              if (comingSoonLocked) {
                toast({
                  title: "Coming Soon",
                  description: "This tool is being integrated. Stay tuned!",
                });
                return;
              }
              // Gate: guests see LoginRequiredModal; backend enforces 401 as fallback.
              if (!requireLogin(m.title)) return;
              navigate(m.path);
            };

            return (
              <motion.button
                key={`${m.path}-${i}`}
                whileTap={{ scale: comingSoonLocked ? 0.99 : 0.965 }}
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  delay: 0.04 + i * 0.04,
                  type: "spring",
                  stiffness: 340,
                  damping: 26,
                }}
                onClick={handleClick}
                aria-disabled={comingSoonLocked || undefined}
                className="relative overflow-hidden rounded-2xl text-left gpu"
                style={{
                  opacity: comingSoonLocked ? 0.78 : 1,
                  cursor: comingSoonLocked ? "not-allowed" : "pointer",
                  height: 80,
                }}
              >
                <div
                  className="pointer-events-none absolute inset-0"
                  style={{
                    background: "rgba(10,8,20,0.88)",
                    backdropFilter: "blur(12px)",
                    WebkitBackdropFilter: "blur(12px)",
                  }}
                />
                <div
                  className="pointer-events-none absolute inset-0 rounded-2xl"
                  style={{ boxShadow: `inset 0 0 0 1px ${m.borderColor}` }}
                />

                <div className="relative flex h-full items-center gap-3.5 px-3.5">
                  <motion.div
                    whileTap={{ rotate: comingSoonLocked ? 0 : -8, scale: 0.9 }}
                    transition={{ type: "spring", stiffness: 500, damping: 18 }}
                    className="ch-orb-pulse grid shrink-0 place-items-center rounded-xl"
                    style={{
                      width: 48,
                      height: 48,
                      background: m.iconBg,
                      boxShadow: m.iconShadow,
                    }}
                  >
                    <Icon
                      style={{
                        width: 20,
                        height: 20,
                        color: "white",
                        filter: "drop-shadow(0 0 8px rgba(255,255,255,0.55))",
                      }}
                      strokeWidth={2.1}
                    />
                  </motion.div>

                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <h3
                        className="font-display font-semibold leading-tight text-white"
                        style={{ fontSize: 14.5, letterSpacing: "-0.016em" }}
                      >
                        {m.title}
                      </h3>

                      {m.premium && (
                        <span
                          className="flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[8.5px] font-bold uppercase tracking-wider"
                          style={
                            premiumLocked
                              ? { background: "rgba(251,191,36,0.12)", color: "#fbbf24", border: "1px solid rgba(251,191,36,0.28)" }
                              : { background: "rgba(124,58,237,0.20)", color: "#c084fc", border: "1px solid rgba(124,58,237,0.32)" }
                          }
                        >
                          <Crown style={{ width: 8, height: 8 }} />
                          {premiumLocked ? "Premium" : "Active"}
                        </span>
                      )}

                      {comingSoonLocked && (
                        <span
                          className="flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[8.5px] font-bold uppercase tracking-wider"
                          style={{
                            background: "rgba(251,191,36,0.10)",
                            color: "#fbbf24",
                            border: "1px solid rgba(251,191,36,0.26)",
                          }}
                        >
                          <Lock style={{ width: 8, height: 8 }} />
                          Soon
                        </span>
                      )}
                    </div>

                    <p
                      className="mt-0.5 text-white/48"
                      style={{ fontSize: 11.5, lineHeight: 1.4 }}
                    >
                      {m.desc}
                    </p>
                  </div>

                  <ArrowRight
                    style={{
                      width: 16,
                      height: 16,
                      color: comingSoonLocked ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.45)",
                      flexShrink: 0,
                    }}
                  />
                </div>
              </motion.button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
