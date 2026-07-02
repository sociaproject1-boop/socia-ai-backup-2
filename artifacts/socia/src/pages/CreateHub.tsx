import { useEffect, memo, useCallback } from "react";
import { useLocation } from "wouter";
import { motion, LazyMotion, domAnimation } from "framer-motion";
import {
  ImageIcon, Film, Wand2, Layers, ArrowRight,
  Sparkles, MessageCircle, Crown, Lock,
  Mic2, LayoutTemplate, Captions, ShoppingBag, UserCircle2,
} from "lucide-react";
import { useBillingStore } from "@/lib/billing";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { useAppStore } from "@/lib/store";
import { useToast } from "@/hooks/use-toast";
import { useLoginGate } from "@/lib/useLoginGate";
import { PresetLibrary } from "@/components/create/PresetLibrary";
import promptImageImg from "../assets/create-icons/prompt-image.webp";
import imageToImageImg from "../assets/create-icons/image-to-image.webp";
import imageVideoImg from "../assets/create-icons/image-video.webp";
import textVideoImg from "../assets/create-icons/text-video.webp";
import cinematicImg from "../assets/create-icons/cinematic.webp";
import gptImg from "../assets/create-icons/gpt.webp";
import voiceImg from "../assets/create-icons/voice.webp";
import thumbnailImg from "../assets/create-icons/thumbnail.webp";
import captionImg from "../assets/create-icons/caption.webp";
import productImg from "../assets/create-icons/product.webp";
import avatarImg from "../assets/create-icons/avatar.webp";
const MODES = [
  {
    path: "/create/prompt-image",
    title: "Prompt to Image",
    desc: "Type your idea, get stunning AI art.",
    icon: ImageIcon,
image: promptImageImg,
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
image: imageToImageImg,
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
image: imageVideoImg,
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
image: textVideoImg,
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
image: cinematicImg,
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
image: gptImg,
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
image: voiceImg,
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
image: thumbnailImg,
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
image: captionImg,
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
image: productImg,
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
image: avatarImg,
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
      *{
        -webkit-tap-highlight-color:transparent;
      }

      .create-scroll{
        overflow-y:auto;
        overscroll-behavior:contain;
        -webkit-overflow-scrolling:touch;
        scroll-behavior:smooth;
        transform:translateZ(0);
        will-change:scroll-position;
      }

      .gpu-card{
        transform:translateZ(0);
        backface-visibility:hidden;
        will-change:transform,opacity;
      }

      @keyframes ch-orb-pulse{
        0%,100%{
          transform:scale(1);
        }

        50%{
          transform:scale(1.05);
        }
      }

      .ch-orb-pulse{
        animation:ch-orb-pulse 2.2s ease-in-out infinite;
      }
    `}</style>
  );
}


function CreateHub() {
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
  <LazyMotion features={domAnimation}>
  <div
    className="create-scroll h-full overflow-y-auto pb-28 overscroll-contain"
    style={{
      WebkitOverflowScrolling: "touch",
    }}
  >
      <CreateHubStyles />

      <div className="pt-5 pb-2">
        <div className="px-4">
          <motion.div
layout={false}
initial={false}
animate={false}
            className="mb-4"
          >
            <h2 className="font-display text-[28px] font-bold leading-[1.05] text-white">
              AI Studio{" "}
              <span className="text-gradient">Hub</span>
            </h2>
            <p className="mt-1.5 text-[13px] text-white/50">
              11 AI tools. One creative home.
            </p>
          </motion.div>
        </div>

        {/* ── AI Preset Studio — above all tools ── */}
        <PresetLibrary />

        <div className="px-4">
          <div
  className="flex flex-col gap-2.5"
  style={{
    contain: "layout paint",
    willChange: "contents",
  }}
>
          {MODES.map((m, i) => {
            const Icon = m.icon;
            const premiumLocked    = m.premium && !isPaid;
            const comingSoonLocked = m.comingSoon && !isAdmin && !isOwner;

            const handleClick = useCallback(() => {
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
}, [comingSoonLocked, requireLogin, navigate, m.path, m.title, toast]);

            return (
              <motion.button
    key={`${m.path}-${i}`}
    layout={false}
    initial={{ opacity: 0, scale: 0.98 }}
    animate={{
      opacity: 1,
      scale: 1,
    }}
    whileHover={{
  scale:1.02,
  y:-3,
}}
    whileTap={{
  scale:0.975,
}}
    transition={{
type:"spring",
stiffness:340,
damping:30,
mass:.9,
}}
                onClick={handleClick}
                aria-disabled={comingSoonLocked || undefined}
                className="relative overflow-hidden rounded-2xl text-left gpu will-change-transform"
                style={{
  opacity: comingSoonLocked ? 0.72 : 1,
  cursor: comingSoonLocked ? "not-allowed" : "pointer",
  height: 86,
  transform: "translateZ(0)",
  willChange: "transform",
  backfaceVisibility: "hidden",
}}
              >
                <div
                  className="pointer-events-none absolute inset-0"
                  style={{
                    background:
"linear-gradient(180deg,rgba(24,22,38,.97) 0%,rgba(16,15,28,.94) 100%)",
                    backdropFilter: "blur(18px) saturate(145%)",
WebkitBackdropFilter: "blur(18px) saturate(145%)",
                  }}
                />
                <div
                  className="pointer-events-none absolute inset-0 rounded-2xl"
                   style={{
  boxShadow: `
    inset 0 0 0 1px ${m.borderColor},
    0 12px 28px rgba(0,0,0,.26),
    0 1px 0 rgba(255,255,255,.03)
  `,
}}
                />

                <div
  className="relative flex h-full items-center gap-4 px-3.5"
  style={{
    transform: "translateZ(0)",
    contain: "layout paint style",
  }}
>
                  

                  <div className="relative flex items-center gap-4 px-4 py-3">

  {/* Preview Image */}
  <img
    src={m.image}
    alt={m.title}
    className="w-20 h-20 rounded-2xl object-cover shrink-0"
  />

  {/* Text */}
  <div className="flex-1 min-w-0">
    <h3 className="text-white font-semibold text-[16px]">
      {m.title}
    </h3>

    <p className="mt-1 text-sm text-white/55 line-clamp-2">
      {m.desc}
    </p>
  </div>

  {/* Arrow */}
  <ArrowRight
    className="text-white/45 shrink-0"
    size={18}
  />

</div>

                  <motion.div
  whileHover={{ x: 1.5 }}
  transition={{ duration: 0.12 }}
>
  <ArrowRight
    style={{
      width: 16,
      height: 16,
      color:
        comingSoonLocked
          ? "rgba(255,255,255,0.18)"
          : "rgba(255,255,255,0.45)",
      flexShrink: 0,
    }}
  />
</motion.div>
                </div>
              </motion.button>
            );
          })}
          </div>
        </div>
      </div>
    </div>
    </LazyMotion>
  );
}
export default memo(CreateHub);
