import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  ArrowLeft, Sparkles, Wand2, ChevronDown, Download, Heart,
  RefreshCw, X, Crown, AlertCircle, Shuffle, Check, Copy,
  Share2, SlidersHorizontal, Sun, Lightbulb, Sunrise, Moon, Zap,
  Film, Camera, Gem, Palette, Box, Leaf, Cpu, Square,
  Building2, Package, Newspaper, Rocket, Cloud, Bot,
  TrendingUp, Monitor, Activity, Clapperboard, Focus, Aperture, Shield,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { generateImage, GenResult } from "@/lib/ai";
import { saveToDevice } from "@/lib/download";
import { useAppStore } from "@/lib/store";

/* ─────────────────────────────────────────────────────────────
   STYLE DEFINITIONS  (icon + label + descriptor only, no emoji)
───────────────────────────────────────────────────────────── */
interface StyleDef { id: string; label: string; desc: string; Icon: LucideIcon }
const STYLES: StyleDef[] = [
  { id: "Cinematic",         label: "Cinematic",     desc: "Film grammar",    Icon: Film       },
  { id: "Hyper Realistic",   label: "Hyper Real",    desc: "True-to-life",    Icon: Aperture   },
  { id: "Luxury Ad",         label: "Luxury Ad",     desc: "Brand campaign",  Icon: Gem        },
  { id: "Fashion Editorial", label: "Editorial",     desc: "Vogue quality",   Icon: Crown      },
  { id: "Anime",             label: "Anime",         desc: "Illustration",    Icon: Palette    },
  { id: "Pixar 3D",          label: "Pixar 3D",      desc: "CG render",       Icon: Box        },
  { id: "Korean Aesthetic",  label: "K-Aesthetic",   desc: "Soft dewy look",  Icon: Leaf       },
  { id: "Dark Moody",        label: "Moody",         desc: "Noir atmosphere", Icon: Moon       },
  { id: "Cyberpunk",         label: "Cyberpunk",     desc: "Neon future",     Icon: Cpu        },
  { id: "Minimalist",        label: "Minimalist",    desc: "Negative space",  Icon: Square     },
  { id: "Street Photo",      label: "Street",        desc: "35mm candid",     Icon: Building2  },
  { id: "Product Photo",     label: "Product",       desc: "E-commerce hero", Icon: Package    },
  { id: "Jewelry Macro",     label: "Jewelry",       desc: "Gem closeup",     Icon: Focus      },
  { id: "Beauty Campaign",   label: "Beauty",        desc: "Beauty shoot",    Icon: Sparkles   },
  { id: "Magazine Cover",    label: "Magazine",      desc: "Cover quality",   Icon: Newspaper  },
  { id: "Futuristic",        label: "Futuristic",    desc: "Sci-fi world",    Icon: Rocket     },
  { id: "Dreamy",            label: "Dreamy",        desc: "Ethereal soft",   Icon: Cloud      },
  { id: "Vintage Film",      label: "Vintage",       desc: "Film grain",      Icon: Clapperboard },
  { id: "AI Influencer",     label: "AI Portrait",   desc: "Digital avatar",  Icon: Bot        },
  { id: "TikTok Viral",      label: "Viral",         desc: "Trending look",   Icon: TrendingUp },
  { id: "Apple Commercial",  label: "Commercial",    desc: "Clean minimal",   Icon: Monitor    },
  { id: "Nike Ad",           label: "Sport",         desc: "Athletic energy", Icon: Activity   },
];

/* ─────────────────────────────────────────────────────────────
   ASPECT RATIOS  — 4 core ratios as a segmented control
───────────────────────────────────────────────────────────── */
const ASPECTS = [
  { id: "1:1",  label: "1:1",  w: 1,  h: 1,  name: "Square"   },
  { id: "4:5",  label: "4:5",  w: 4,  h: 5,  name: "Portrait" },
  { id: "9:16", label: "9:16", w: 9,  h: 16, name: "Story"    },
  { id: "16:9", label: "16:9", w: 16, h: 9,  name: "Wide"     },
  { id: "3:4",  label: "3:4",  w: 3,  h: 4,  name: "Vertical" },
] as const;
type AspectId = typeof ASPECTS[number]["id"];

/* ─────────────────────────────────────────────────────────────
   PRO CONTROLS
───────────────────────────────────────────────────────────── */
const LIGHTING_OPTIONS = [
  { id: "Natural",     label: "Natural",      Icon: Sun      },
  { id: "Studio",      label: "Studio",       Icon: Lightbulb },
  { id: "Golden Hour", label: "Golden Hour",  Icon: Sunrise  },
  { id: "Blue Hour",   label: "Moody",        Icon: Moon     },
  { id: "Neon",        label: "Neon",         Icon: Zap      },
] as const;

const LENS_OPTIONS = [
  { id: "24mm Wide",     label: "24mm",  desc: "Wide"       },
  { id: "35mm Street",   label: "35mm",  desc: "Street"     },
  { id: "50mm Standard", label: "50mm",  desc: "Standard"   },
  { id: "85mm Portrait", label: "85mm",  desc: "Portrait"   },
  { id: "100mm Macro",   label: "100mm", desc: "Macro"      },
  { id: "200mm Tele",    label: "200mm", desc: "Telephoto"  },
] as const;

/* ─────────────────────────────────────────────────────────────
   EXAMPLE PROMPTS
───────────────────────────────────────────────────────────── */
const EXAMPLES = [
  "luxury perfume bottle on black marble with rose petals",
  "cinematic portrait of a woman in golden hour fog",
  "futuristic city with neon reflections on wet pavement",
  "minimalist product shot on clean white surface",
  "anime character under cherry blossom at sunset",
  "dark fashion editorial, black leather coat, harsh shadows",
  "macro shot of morning dew on rose petals, f/2.8",
  "korean beauty portrait, pastel studio, dewy skin",
];

/* ─────────────────────────────────────────────────────────────
   LOCAL ENHANCE HINTS  (client-side preview; real AI runs server-side)
───────────────────────────────────────────────────────────── */
const LOCAL_HINTS: Record<string, string> = {
  "Cinematic":          "cinematic color grading, anamorphic lens, film grain, volumetric lighting",
  "Hyper Realistic":    "hyperrealistic, ultra sharp, 8K detail, natural light, photorealistic skin",
  "Luxury Ad":          "luxury brand campaign, aspirational lighting, premium product focus",
  "Fashion Editorial":  "Vogue editorial, high fashion, dramatic lighting, runway quality",
  "Anime":              "anime art style, vibrant colors, detailed cel shading, Studio Ghibli",
  "Pixar 3D":           "Pixar 3D, subsurface scattering, global illumination, warmly lit",
  "Korean Aesthetic":   "Korean aesthetic, soft pastel tones, dewy skin, minimal composition",
  "Dark Moody":         "dark moody atmosphere, noir lighting, deep inky shadows",
  "Cyberpunk":          "cyberpunk neon city, holographic elements, rain-slicked street",
  "Minimalist":         "ultra minimalist, white background, generous negative space",
  "Street Photo":       "35mm street photography, Kodak grain, candid decisive moment",
  "Product Photo":      "professional product photography, white seamless, 3-point lighting",
  "Jewelry Macro":      "macro jewelry, luxury velvet, specular gems, razor sharp focus",
  "Beauty Campaign":    "beauty campaign, flawless skin, bright clamshell lighting",
  "Magazine Cover":     "magazine cover, bold composition, celebrity portrait lighting",
  "Futuristic":         "futuristic sci-fi, holographic interfaces, chrome glass surfaces",
  "Dreamy":             "dreamy ethereal, soft pastel bokeh, fairy tale atmosphere",
  "Vintage Film":       "vintage Kodak film, warm tones, light leaks, 1970s grain",
  "AI Influencer":      "AI influencer, perfect symmetry, ring light, digital avatar",
  "TikTok Viral":       "TikTok viral aesthetic, bold saturated colors, dynamic crop",
  "Apple Commercial":   "Apple commercial, pure white, perfect shadows, minimal geometry",
  "Nike Ad":            "Nike campaign, dynamic motion, athlete energy, bold composition",
};

/* ─────────────────────────────────────────────────────────────
   LOADING STAGES
───────────────────────────────────────────────────────────── */
const STAGES = [
  { key: "prep",  label: "Initialising",    threshold: 0.00 },
  { key: "craft", label: "Composing prompt",threshold: 0.10 },
  { key: "gen",   label: "Generating",      threshold: 0.20 },
  { key: "enh",   label: "Refining detail", threshold: 0.55 },
  { key: "fin",   label: "Finalising",      threshold: 0.82 },
  { key: "upl",   label: "Uploading",       threshold: 0.93 },
];

/* ─────────────────────────────────────────────────────────────
   HISTORY STORE
───────────────────────────────────────────────────────────── */
interface HistoryItem {
  id: string;
  url: string;
  prompt: string;
  originalPrompt: string;
  style: string;
  aspect: string;
  timestamp: number;
  isFavorite: boolean;
}

const useImageHistoryStore = create<{
  items: HistoryItem[];
  add: (item: Omit<HistoryItem, "id" | "timestamp" | "isFavorite">) => void;
  toggleFav: (id: string) => void;
  remove: (id: string) => void;
}>()(
  persist(
    (set) => ({
      items: [],
      add: (item) =>
        set((s) => ({
          items: [
            { ...item, id: `${Date.now()}_${Math.random().toString(36).slice(2)}`, timestamp: Date.now(), isFavorite: false },
            ...s.items,
          ].slice(0, 48),
        })),
      toggleFav: (id) =>
        set((s) => ({ items: s.items.map((i) => (i.id === id ? { ...i, isFavorite: !i.isFavorite } : i)) })),
      remove: (id) => set((s) => ({ items: s.items.filter((i) => i.id !== id) })),
    }),
    { name: "socia_image_history_v1" },
  ),
);

/* ─────────────────────────────────────────────────────────────
   ASPECT ICON PREVIEW
───────────────────────────────────────────────────────────── */
function AspectRect({ w, h, active }: { w: number; h: number; active: boolean }) {
  const maxW = 22, maxH = 28;
  const scale = Math.min(maxW / w, maxH / h);
  const pw = Math.max(8, Math.round(w * scale));
  const ph = Math.max(8, Math.round(h * scale));
  return (
    <div
      style={{ width: pw, height: ph }}
      className={`rounded-[2px] border-[1.5px] transition-colors ${active ? "border-violet-400/80" : "border-white/22"}`}
    />
  );
}

/* ═══════════════════════════════════════════════════════════
   MAIN PAGE
══════════════════════════════════════════════════════════ */
export default function CreatePromptImage() {
  const [, navigate] = useLocation();
  const activePrompt = useAppStore((s) => s.activePrompt);
  const setActivePrompt = useAppStore((s) => s.setActivePrompt);
  const { add, toggleFav, remove, items: history } = useImageHistoryStore();

  /* prompt */
  const [prompt, setPrompt] = useState(activePrompt || "");
  const [negPrompt, setNegPrompt] = useState("");
  const [showNeg, setShowNeg] = useState(false);
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [showExamples, setShowExamples] = useState(false);

  /* style & aspect */
  const [style, setStyle] = useState<string>("Cinematic");
  const [aspect, setAspect] = useState<AspectId>(
    () => (localStorage.getItem("socia_last_aspect") as AspectId) || "9:16",
  );

  /* pro mode */
  const [showPro, setShowPro] = useState(false);
  const [lighting, setLighting] = useState("");
  const [lens, setLens] = useState("");
  const [seed, setSeed] = useState("");

  /* generation */
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<GenResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isQuotaError, setIsQuotaError] = useState(false);

  /* result ui */
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "done">("idle");
  const [copied, setCopied] = useState(false);
  const [resultFav, setResultFav] = useState(false);
  const [showFullPrompt, setShowFullPrompt] = useState(false);

  /* history */
  const [histFilter, setHistFilter] = useState<"all" | "fav">("all");
  const [expandedCard, setExpandedCard] = useState<string | null>(null);

  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { setPrompt(activePrompt || ""); }, [activePrompt]);
  useEffect(() => () => setActivePrompt(""), [setActivePrompt]);
  useEffect(() => { localStorage.setItem("socia_last_aspect", aspect); }, [aspect]);

  const charCount = prompt.length;
  const canGenerate = !loading && prompt.trim().length > 0;

  /* enhance */
  const handleEnhance = useCallback(async () => {
    if (!prompt.trim() || isEnhancing) return;
    setIsEnhancing(true);
    await new Promise((r) => setTimeout(r, 650));
    const base = prompt.trim().replace(/[,;.!?]+$/, "");
    const hint = LOCAL_HINTS[style] || "ultra high quality, professional, award-winning";
    setPrompt(`${base}, ${hint}`);
    setIsEnhancing(false);
    taRef.current?.focus();
  }, [prompt, style, isEnhancing]);

  const handleShuffle = useCallback(() => {
    setPrompt(EXAMPLES[Math.floor(Math.random() * EXAMPLES.length)]);
    taRef.current?.focus();
  }, []);

  /* generate */
  const handleGenerate = useCallback(async () => {
    if (!canGenerate) return;
    setLoading(true);
    setError(null);
    setIsQuotaError(false);
    setResult(null);
    setResultFav(false);
    setShowFullPrompt(false);
    try {
      const r = await generateImage(prompt, {
        style,
        aspect,
        negativePrompt: showNeg && negPrompt.trim() ? negPrompt : undefined,
        lightingStyle: lighting || undefined,
        cameraLens: lens || undefined,
        hd: true,
        seed: seed || undefined,
      });
      setResult(r);
      add({ url: r.url, prompt: r.prompt, originalPrompt: r.originalPrompt || prompt, style, aspect });
    } catch (err: unknown) {
      const e = err as { message?: string; code?: string };
      setError(e.message || "Generation failed. Please try again.");
      setIsQuotaError(e.code === "QUOTA_EXCEEDED");
    } finally {
      setLoading(false);
    }
  }, [canGenerate, prompt, style, aspect, showNeg, negPrompt, lighting, lens, seed, add]);

  /* save */
  const handleSave = useCallback(async () => {
    if (!result || saveStatus === "saving") return;
    setSaveStatus("saving");
    try {
      await saveToDevice(result.url, { kind: "image", filename: result.prompt });
      setSaveStatus("done");
      setTimeout(() => setSaveStatus("idle"), 2200);
    } catch { setSaveStatus("idle"); }
  }, [result, saveStatus]);

  /* copy */
  const handleCopy = useCallback(async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.originalPrompt || result.prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {/* ignore */}
  }, [result]);

  /* remix */
  const handleRemix = useCallback((item: HistoryItem) => {
    setPrompt(item.originalPrompt || item.prompt);
    setStyle(item.style || "Cinematic");
    setAspect((item.aspect as AspectId) || "9:16");
    setResult(null);
    taRef.current?.focus();
  }, []);

  const filteredHistory = histFilter === "fav"
    ? history.filter((i) => i.isFavorite)
    : history;

  const activeAspect = ASPECTS.find((a) => a.id === aspect) || ASPECTS[2];

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-[#050509]">

      {/* Cinematic style + keyframe layer — scoped here so the rest of
          the app stays untouched. All effects animate transform/opacity
          only (GPU compositor path) to keep 60fps on mid-tier Android. */}
      <CinematicStyles />

      {/* ── LIVE GALAXY BACKGROUND ──────────────────────────── */}
      <GalaxyBackdrop />

      {/* ── HEADER ──────────────────────────────────────────── */}
      <div
        className="relative z-10 flex items-center gap-3 px-4"
        style={{
          paddingTop: `calc(env(safe-area-inset-top,0px) + 14px)`,
          paddingBottom: 14,
          background: "linear-gradient(180deg, rgba(5,5,10,0.92) 0%, rgba(5,5,10,0.55) 80%, transparent 100%)",
          backdropFilter: "blur(14px)",
          WebkitBackdropFilter: "blur(14px)",
        }}
      >
        <motion.button
          whileTap={{ scale: 0.92 }}
          onClick={() => navigate("/create")}
          className="grid h-9 w-9 place-items-center rounded-xl border border-white/10 bg-white/[0.04] text-white/75 backdrop-blur-md transition hover:bg-white/[0.09]"
        >
          <ArrowLeft className="h-4 w-4" />
        </motion.button>
        <div className="min-w-0 flex-1">
          <h2 className="text-[17px] font-semibold tracking-tight text-white leading-tight">
            Prompt to Image
          </h2>
          <p className="text-[11px] text-white/45 leading-tight">
            Turn your ideas into stunning visuals
          </p>
        </div>
        <motion.button
          whileTap={{ scale: 0.94 }}
          onClick={() => setShowPro((v) => !v)}
          className={`flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-[11.5px] font-medium transition-all ${
            showPro
              ? "border-violet-400/50 bg-violet-500/15 text-violet-100 shadow-[0_0_20px_-6px_rgba(167,139,250,0.55)]"
              : "border-white/12 bg-white/[0.04] text-white/65 backdrop-blur-md hover:border-white/20 hover:text-white/85"
          }`}
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          Controls
        </motion.button>
      </div>

      {/* ── SCROLL BODY ─────────────────────────────────────── */}
      <div className="relative z-10 flex-1 overflow-y-auto pb-40 hide-scrollbar">

        {/* PROMPT EDITOR — glassmorphism panel with animated neon border */}
        <div className="px-4 pt-5">
          <div className="cs-prompt-card relative rounded-[26px] [&:focus-within]:scale-[1.005] transition-transform duration-300">
            {/* Animated conic gradient border + soft internal glow.
                pointer-events-none keeps the textarea fully tappable. */}
            <div aria-hidden className="cs-prompt-glow pointer-events-none absolute -inset-[1px] rounded-[27px]" />
            <div aria-hidden className="cs-prompt-inner-glow pointer-events-none absolute inset-0 rounded-[26px]" />

            <div className="relative rounded-[26px] border border-white/[0.09] bg-[rgba(15,12,28,0.62)] backdrop-blur-2xl">

            {/* Top bar */}
            <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-3">
              <div className="flex items-center gap-2">
                <span className="grid h-5 w-5 place-items-center rounded-md bg-gradient-to-br from-violet-500/30 to-fuchsia-500/20 shadow-[inset_0_0_6px_rgba(167,139,250,0.4)]">
                  <Sparkles className="h-3 w-3 text-violet-200" />
                </span>
                <span className="text-[12px] font-semibold tracking-tight text-white/85">Your Prompt</span>
              </div>
              <div className="flex items-center gap-3">
                <span className={`text-[10px] tabular-nums ${charCount > 900 ? "text-amber-400/80" : "text-white/35"}`}>
                  {charCount} / 1000
                </span>
                <button
                  onClick={() => setShowExamples((v) => !v)}
                  className="flex items-center gap-1.5 rounded-full border border-white/12 bg-white/[0.04] px-2.5 py-1 text-[10.5px] text-white/65 transition hover:border-violet-400/30 hover:bg-violet-500/10 hover:text-violet-200"
                >
                  <Lightbulb className="h-3 w-3" />
                  Examples
                </button>
              </div>
            </div>

            {/* Examples dropdown */}
            <AnimatePresence>
              {showExamples && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden border-b border-white/[0.05]"
                >
                  <div className="flex flex-col px-4 py-3 gap-1">
                    {EXAMPLES.map((ex) => (
                      <button
                        key={ex}
                        onClick={() => { setPrompt(ex); setShowExamples(false); taRef.current?.focus(); }}
                        className="rounded-lg border border-transparent px-3 py-2 text-left text-[12px] leading-relaxed text-white/50 transition hover:border-white/[0.06] hover:bg-white/[0.03] hover:text-white/75"
                      >
                        {ex}
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Textarea */}
            <div className="relative px-4 py-3">
              <textarea
                ref={taRef}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={4}
                placeholder="Describe the image you want to create…"
                maxLength={1000}
                className="w-full resize-none bg-transparent text-[14px] leading-[1.65] text-white/85 placeholder:text-white/20 focus:outline-none"
              />
              {isEnhancing && (
                <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-b-xl">
                  <div className="absolute inset-0 animate-pulse bg-white/[0.015]" />
                </div>
              )}
            </div>

            {/* Action bar */}
            <div className="flex items-center gap-2 border-t border-white/[0.05] px-4 py-2.5">
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={handleEnhance}
                disabled={!prompt.trim() || isEnhancing}
                className="flex h-7 items-center gap-1.5 rounded-md border border-white/[0.08] bg-white/[0.04] px-3 text-[11px] font-medium text-white/55 disabled:opacity-30 transition hover:bg-white/[0.07] hover:text-white/75"
              >
                <Wand2 className="h-3 w-3" />
                {isEnhancing ? "Enhancing…" : "Enhance"}
              </motion.button>
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={handleShuffle}
                className="flex h-7 items-center gap-1.5 rounded-md border border-white/[0.08] bg-white/[0.04] px-3 text-[11px] font-medium text-white/50 transition hover:bg-white/[0.07] hover:text-white/70"
              >
                <TrendingUp className="h-3 w-3" />
                Improve Prompt
              </motion.button>
              {prompt.trim() && (
                <button
                  onClick={() => setPrompt("")}
                  className="ml-auto flex h-7 w-7 items-center justify-center rounded-md border border-white/[0.06] text-white/25 transition hover:text-white/50"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>

            {/* Negative prompt toggle */}
            <div className="border-t border-white/[0.06] px-5 py-3">
              <button
                onClick={() => setShowNeg((v) => !v)}
                className="flex w-full items-center gap-1.5 text-[11px] text-white/45 transition hover:text-white/70"
              >
                <ChevronDown className={`h-3 w-3 transition-transform ${showNeg ? "rotate-180" : ""}`} />
                Negative prompt <span className="text-white/30">(optional)</span>
                <span className="ml-auto flex items-center gap-0.5 text-[10px] text-violet-300/80">
                  {showNeg ? "hide" : "Add"} {!showNeg && <span className="text-[12px] leading-none">+</span>}
                </span>
              </button>
              <AnimatePresence>
                {showNeg && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <textarea
                      value={negPrompt}
                      onChange={(e) => setNegPrompt(e.target.value)}
                      rows={2}
                      placeholder="What to exclude: blurry, watermark, distorted face…"
                      className="mt-2.5 w-full resize-none rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-[12px] leading-relaxed text-white/65 placeholder:text-white/25 focus:outline-none focus:border-violet-400/30"
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            </div>
          </div>
        </div>

        {/* STYLE SELECTOR — live cinematic cards */}
        <div className="mt-7 px-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span aria-hidden className="h-[10px] w-[3px] rounded-full bg-gradient-to-b from-fuchsia-400 to-violet-500 shadow-[0_0_8px_rgba(217,70,239,0.7)]" />
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/55">Create Style</p>
            </div>
            <span className="text-[11px] font-medium text-white/45">See all ›</span>
          </div>
        </div>
        <div className="hide-scrollbar flex gap-3 overflow-x-auto px-4 pb-1">
          {STYLES.map((s) => (
            <StyleCard
              key={s.id}
              s={s}
              active={style === s.id}
              onClick={() => setStyle(s.id)}
            />
          ))}
        </div>

        {/* ASPECT RATIO — floating neon cards */}
        <div className="mt-7 px-4">
          <div className="mb-3 flex items-center gap-2">
            <span aria-hidden className="h-[10px] w-[3px] rounded-full bg-gradient-to-b from-violet-400 to-indigo-500 shadow-[0_0_8px_rgba(139,92,246,0.7)]" />
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/55">Aspect Ratio</p>
          </div>
          <div className="grid grid-cols-5 gap-2">
            {ASPECTS.map((a) => (
              <AspectCard
                key={a.id}
                a={a}
                active={aspect === a.id}
                onClick={() => setAspect(a.id)}
              />
            ))}
          </div>
        </div>

        {/* PRO CONTROLS */}
        <AnimatePresence>
          {showPro && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="mx-4 mt-5 rounded-xl border border-white/[0.07] bg-white/[0.02]">

                {/* Panel header */}
                <div className="flex items-center gap-2 border-b border-white/[0.05] px-4 py-3">
                  <Camera className="h-3.5 w-3.5 text-white/30" />
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-white/30">Camera Controls</span>
                </div>

                {/* Lighting */}
                <div className="border-b border-white/[0.05] px-4 py-4">
                  <p className="mb-2.5 text-[10px] text-white/25 uppercase tracking-widest font-medium">Lighting</p>
                  <div className="flex gap-2">
                    {LIGHTING_OPTIONS.map(({ id, label, Icon: LIcon }) => {
                      const active = lighting === id;
                      return (
                        <button
                          key={id}
                          onClick={() => setLighting(lighting === id ? "" : id)}
                          className={`flex flex-1 flex-col items-center gap-1.5 rounded-lg border py-2.5 transition-all ${
                            active
                              ? "border-violet-500/40 bg-gradient-to-b from-violet-900/30 to-indigo-900/15 text-violet-200"
                              : "border-white/[0.07] text-white/30 hover:border-white/[0.12] hover:text-white/55"
                          }`}
                        >
                          <LIcon className="h-3.5 w-3.5" strokeWidth={active ? 2 : 1.5} />
                          <span className="text-[9px] font-medium leading-none">{label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Lens */}
                <div className="border-b border-white/[0.05] px-4 py-4">
                  <p className="mb-2.5 text-[10px] text-white/25 uppercase tracking-widest font-medium">Focal Length</p>
                  <div className="flex gap-1.5">
                    {LENS_OPTIONS.map(({ id, label, desc }) => {
                      const active = lens === id;
                      return (
                        <button
                          key={id}
                          onClick={() => setLens(lens === id ? "" : id)}
                          className={`flex flex-1 flex-col items-center gap-0.5 rounded-lg border py-2 transition-all ${
                            active
                              ? "border-violet-500/40 bg-gradient-to-b from-violet-900/30 to-indigo-900/15 text-white"
                              : "border-white/[0.07] text-white/30 hover:border-white/[0.12] hover:text-white/55"
                          }`}
                        >
                          <span className="text-[11px] font-bold leading-none tabular-nums">{label}</span>
                          <span className="text-[8px] opacity-50 leading-none">{desc}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Seed */}
                <div className="px-4 py-3.5">
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] text-white/25 uppercase tracking-widest font-medium">Seed</span>
                    <input
                      value={seed}
                      onChange={(e) => setSeed(e.target.value.replace(/\D/g, ""))}
                      placeholder="random"
                      className="flex-1 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-1.5 text-[11px] text-white/55 placeholder:text-white/18 focus:outline-none focus:border-white/[0.1]"
                    />
                    {seed && (
                      <button onClick={() => setSeed("")} className="text-white/25 hover:text-white/45">
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Active summary */}
                {(lighting || lens) && (
                  <div className="border-t border-white/[0.05] px-4 py-2.5">
                    <p className="text-[10px] text-white/25">
                      Active: {[lighting, lens].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ERROR */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className={`mx-4 mt-5 flex gap-3 rounded-xl border p-4 ${
                isQuotaError
                  ? "border-amber-500/20 bg-amber-500/[0.06]"
                  : "border-red-500/20 bg-red-500/[0.06]"
              }`}
            >
              {isQuotaError
                ? <Crown className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400/80" />
                : <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-400/80" />}
              <div className="flex-1">
                <p className="text-[12px] leading-relaxed text-white/65">{error}</p>
                {isQuotaError && (
                  <button
                    onClick={() => navigate("/billing/upgrade")}
                    className="mt-1.5 text-[11px] font-medium text-amber-400/80 underline"
                  >
                    Upgrade plan
                  </button>
                )}
              </div>
              <button onClick={() => setError(null)} className="text-white/20 hover:text-white/40">
                <X className="h-3.5 w-3.5" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* GENERATION HISTORY */}
        {history.length > 0 && (
          <div className="mt-8 px-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-white/30">History</p>
              <div className="flex items-center gap-1">
                {(["all", "fav"] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setHistFilter(f)}
                    className={`rounded-md px-2.5 py-1 text-[10px] font-medium transition ${
                      histFilter === f
                        ? "bg-violet-900/25 border border-violet-500/25 text-violet-200"
                        : "text-white/25 hover:text-white/45"
                    }`}
                  >
                    {f === "all" ? `All (${history.length})` : `Saved (${history.filter((i) => i.isFavorite).length})`}
                  </button>
                ))}
              </div>
            </div>
            {filteredHistory.length === 0 ? (
              <p className="py-8 text-center text-[12px] text-white/20">
                No saved images yet
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {filteredHistory.map((item) => (
                  <HistoryCard
                    key={item.id}
                    item={item}
                    isExpanded={expandedCard === item.id}
                    onExpand={() => setExpandedCard(expandedCard === item.id ? null : item.id)}
                    onFav={() => toggleFav(item.id)}
                    onRemix={() => handleRemix(item)}
                    onRemove={() => remove(item.id)}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── GENERATE BAR ────────────────────────────────────── */}
      <div
        className="relative z-10 px-4 pt-3"
        style={{
          paddingBottom: `calc(env(safe-area-inset-bottom,0px) + 16px)`,
          background: "linear-gradient(0deg, rgba(5,5,10,0.96) 0%, rgba(5,5,10,0.78) 60%, rgba(5,5,10,0.0) 100%)",
          backdropFilter: "blur(14px)",
          WebkitBackdropFilter: "blur(14px)",
        }}
      >
        {/* Settings summary chips */}
        {(style !== "Cinematic" || aspect !== "9:16" || lighting || lens) && (
          <div className="mb-2.5 flex flex-wrap gap-1.5">
            <span className="rounded-md border border-violet-500/25 bg-violet-900/15 px-2 py-0.5 text-[10px] text-violet-200/80 backdrop-blur-sm">{style}</span>
            <span className="rounded-md border border-indigo-500/25 bg-indigo-900/15 px-2 py-0.5 text-[10px] text-indigo-200/80 backdrop-blur-sm">{aspect}</span>
            {lighting && <span className="rounded-md border border-white/12 bg-white/[0.04] px-2 py-0.5 text-[10px] text-white/55">{lighting}</span>}
            {lens && <span className="rounded-md border border-white/12 bg-white/[0.04] px-2 py-0.5 text-[10px] text-white/55">{lens.split(" ")[0]}</span>}
          </div>
        )}

        <motion.button
          whileTap={{ scale: canGenerate ? 0.97 : 1 }}
          disabled={!canGenerate}
          onClick={handleGenerate}
          className={`relative flex w-full items-center overflow-hidden rounded-[22px] transition-all duration-200 ${
            canGenerate
              ? "cs-generate-active text-white"
              : "cursor-not-allowed border border-white/[0.06] bg-white/[0.03] text-white/25"
          }`}
          style={{ height: 68 }}
        >
          {canGenerate && (
            <>
              <span aria-hidden className="cs-gen-energy pointer-events-none absolute inset-0" />
              <span aria-hidden className="cs-gen-shimmer pointer-events-none absolute inset-0" />
              <span aria-hidden className="cs-gen-glow pointer-events-none absolute -inset-[2px] rounded-[22px]" />
            </>
          )}

          {/* Main content — centred with flex-1 */}
          <span className="relative z-10 flex flex-1 flex-col items-center justify-center gap-0.5">
            {loading ? (
              <span className="flex items-center gap-2 text-[16px] font-bold">
                <div className="h-[18px] w-[18px] animate-spin rounded-full border-2 border-white/30 border-t-white" />
                Generating…
              </span>
            ) : (
              <>
                <span
                  className="flex items-center gap-2 text-[18px] font-bold tracking-tight"
                  style={{ textShadow: "0 0 28px rgba(255,255,255,0.35)" }}
                >
                  <Sparkles
                    style={{ width: 20, height: 20, filter: "drop-shadow(0 0 10px rgba(255,255,255,0.7))" }}
                    strokeWidth={2.2}
                  />
                  Generate Image
                </span>
                {canGenerate && (
                  <span className="text-[11px] font-medium text-white/60">
                    High quality · Fast generation · Private & secure
                  </span>
                )}
              </>
            )}
          </span>

          {/* Right circle badge */}
          {canGenerate && !loading && (
            <span
              aria-hidden
              className="absolute right-4 grid h-11 w-11 place-items-center rounded-full"
              style={{
                background: "rgba(255,255,255,0.12)",
                border: "1.5px solid rgba(255,255,255,0.22)",
                backdropFilter: "blur(8px)",
              }}
            >
              <Sparkles
                style={{ width: 20, height: 20, color: "white", filter: "drop-shadow(0 0 6px rgba(255,255,255,0.5))" }}
                strokeWidth={2}
              />
            </span>
          )}
        </motion.button>

        {/* ── Bottom info strip (matches reference) ── */}
        <div className="mt-3 grid grid-cols-3 divide-x divide-white/[0.055] overflow-hidden rounded-2xl border border-white/[0.055]"
          style={{ background: "rgba(255,255,255,0.025)" }}>
          {([
            { Icon: Crown,  title: "High Quality",     sub: "Best results"      },
            { Icon: Zap,    title: "Fast Generation",  sub: "No long waiting"   },
            { Icon: Shield, title: "Private & Secure", sub: "Your data is safe" },
          ] as const).map(({ Icon, title, sub }) => (
            <div key={title} className="flex flex-col items-center gap-1 py-2.5 px-1">
              <Icon style={{ width: 13, height: 13, color: "rgba(196,180,255,0.65)", strokeWidth: 1.5 }} />
              <span className="text-center text-[9px] font-semibold leading-tight text-white/62">{title}</span>
              <span className="text-center text-[8.5px] leading-tight text-white/30">{sub}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── OVERLAYS ─────────────────────────────────────────── */}
      <AnimatePresence>
        {loading && <LoadingOverlay />}
        {result && !loading && (
          <ResultOverlay
            result={result}
            aspect={activeAspect}
            isFavorite={resultFav}
            saveStatus={saveStatus}
            copied={copied}
            showFullPrompt={showFullPrompt}
            onToggleFav={() => {
              setResultFav((v) => !v);
              if (history[0]) toggleFav(history[0].id);
            }}
            onClose={() => setResult(null)}
            onSave={handleSave}
            onCopy={handleCopy}
            onRegen={handleGenerate}
            onTogglePrompt={() => setShowFullPrompt((v) => !v)}
            onShare={() => navigate(`/create?prefillUrl=${encodeURIComponent(result.url)}`)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   LOADING OVERLAY
══════════════════════════════════════════════════════════ */
function LoadingOverlay() {
  const startRef = useRef(performance.now());
  const lastRef = useRef(0);
  const [progress, setProgress] = useState(0);
  const tau = 12_000;

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const elapsed = performance.now() - startRef.current;
      const next = Math.min(0.97, 1 - Math.exp(-elapsed / tau));
      if (next > lastRef.current) { lastRef.current = next; setProgress(next); }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const stage = STAGES.reduce((acc, s) => (progress >= s.threshold ? s : acc), STAGES[0]);
  const pct = Math.round(progress * 100);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-9 overflow-hidden"
      style={{ background: "radial-gradient(120% 90% at 50% 50%, rgba(20,8,40,0.96) 0%, rgba(5,5,12,0.99) 70%)" }}
    >
      {/* Galaxy / energy layers — purely decorative, pointer-events:none,
          animates only opacity + transform so it stays on the compositor. */}
      <span aria-hidden className="cs-load-nebula pointer-events-none absolute inset-0" />
      <span aria-hidden className="cs-load-streaks pointer-events-none absolute inset-0" />
      <span aria-hidden className="cs-load-particles pointer-events-none absolute inset-0" />

      {/* Pulse rings behind the dial — communicate "AI is actively working". */}
      <div className="relative" style={{ width: 140, height: 140 }}>
        <span aria-hidden className="cs-load-ring cs-load-ring-1 absolute inset-0 rounded-full" />
        <span aria-hidden className="cs-load-ring cs-load-ring-2 absolute inset-0 rounded-full" />
        <span aria-hidden className="cs-load-ring cs-load-ring-3 absolute inset-0 rounded-full" />

        {/* Spinner ring — same SVG, kept for accurate % progress feedback. */}
        <div className="absolute inset-0 grid place-items-center">
          <div className="relative" style={{ width: 84, height: 84 }}>
            <svg className="absolute inset-0 -rotate-90" width={84} height={84} viewBox="0 0 84 84">
              <circle cx={42} cy={42} r={37} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={3} />
              <circle
                cx={42} cy={42} r={37} fill="none"
                stroke="url(#ringGrad)" strokeWidth={3}
                strokeLinecap="round"
                strokeDasharray={`${2 * Math.PI * 37}`}
                strokeDashoffset={`${2 * Math.PI * 37 * (1 - progress)}`}
                style={{ transition: "stroke-dashoffset 0.5s ease-out", filter: "drop-shadow(0 0 6px rgba(167,139,250,0.55))" }}
              />
              <defs>
                <linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#f0abfc" />
                  <stop offset="50%" stopColor="#a78bfa" />
                  <stop offset="100%" stopColor="#60a5fa" />
                </linearGradient>
              </defs>
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-[15px] font-semibold tabular-nums text-white/95 drop-shadow-[0_0_10px_rgba(167,139,250,0.65)]">{pct}%</span>
              <span className="text-[8.5px] font-medium uppercase tracking-[0.2em] text-violet-300/70">AI</span>
            </div>
          </div>
        </div>
      </div>

      <div className="relative z-10 flex flex-col items-center gap-2">
        <AnimatePresence mode="wait" initial={false}>
          <motion.p
            key={stage.key}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.3 }}
            className="text-[15px] font-semibold tracking-tight text-white/90 drop-shadow-[0_0_12px_rgba(167,139,250,0.35)]"
          >
            {stage.label}
          </motion.p>
        </AnimatePresence>
        <p className="text-[11px] text-white/35">This typically takes 8–15 seconds</p>
      </div>
    </motion.div>
  );
}

/* ═══════════════════════════════════════════════════════════
   CINEMATIC VISUAL LAYER — pure CSS keyframes + decorative components.
   No event handlers, no state, no API touch points. Safe to remove or
   restyle without affecting the generation pipeline.
══════════════════════════════════════════════════════════ */

/**
 * Per-style "vibe" — drives the live overlay on each Create Style card.
 * Keyed by the same `id` used by `setStyle()` and the `LOCAL_HINTS` map,
 * so the active card visual always matches what the AI actually receives.
 */
type Vibe = "cinema" | "crystal" | "luxury" | "editorial" | "anime" | "neon" | "moody" | "dreamy" | "minimal" | "vintage";
const STYLE_VIBE: Record<string, Vibe> = {
  "Cinematic": "cinema", "Hyper Realistic": "crystal", "Luxury Ad": "luxury",
  "Fashion Editorial": "editorial", "Anime": "anime", "Pixar 3D": "dreamy",
  "Korean Aesthetic": "dreamy", "Dark Moody": "moody", "Cyberpunk": "neon",
  "Minimalist": "minimal", "Street Photo": "moody", "Product Photo": "minimal",
  "Jewelry Macro": "crystal", "Beauty Campaign": "luxury", "Magazine Cover": "editorial",
  "Futuristic": "neon", "Dreamy": "dreamy", "Vintage Film": "vintage",
  "AI Influencer": "luxury", "TikTok Viral": "neon",
  "Apple Commercial": "minimal", "Nike Ad": "cinema",
};

/* Vibe-specific gradient backdrops — rich cinematic base tones. */
const VIBE_BG: Record<Vibe, string> = {
  cinema:    "linear-gradient(155deg, #1c0a04 0%, #080302 50%, #140804 100%)",
  crystal:   "linear-gradient(155deg, #061220 0%, #030810 55%, #07182a 100%)",
  luxury:    "linear-gradient(155deg, #18090200 0%, #180902 40%, #100602 100%)",
  editorial: "linear-gradient(155deg, #10060e 0%, #050306 55%, #160a18 100%)",
  anime:     "linear-gradient(155deg, #16022e 0%, #060110 55%, #100826 100%)",
  neon:      "linear-gradient(155deg, #040010 0%, #020108 55%, #000610 100%)",
  moody:     "linear-gradient(155deg, #050508 0%, #020204 55%, #060610 100%)",
  dreamy:    "linear-gradient(155deg, #100622 0%, #070414 55%, #100a22 100%)",
  minimal:   "linear-gradient(155deg, #101014 0%, #060608 55%, #0e0e12 100%)",
  vintage:   "linear-gradient(155deg, #1c0e04 0%, #0a0602 55%, #160e04 100%)",
};

/* Per-style CSS art — rich multi-layer backgrounds that visually suggest
   the photographic content of each style. Composited below cs-vibe overlay. */
const STYLE_ART: Partial<Record<string, string>> = {
  "Cinematic": `
    radial-gradient(9% 11% at 50% 52%, rgba(255,210,110,0.65) 0%, rgba(180,110,28,0.28) 45%, transparent 72%),
    radial-gradient(55% 62% at 48% 54%, rgba(40,14,4,0.8) 0%, transparent 68%),
    radial-gradient(30% 18% at 32% 50%, rgba(70,42,16,0.45) 0%, transparent 55%),
    linear-gradient(152deg, rgba(190,110,35,0.06) 0%, transparent 38%)
  `,
  "Hyper Realistic": `
    conic-gradient(from 40deg at 50% 46%, rgba(215,240,255,0.55) 0deg, transparent 38deg, rgba(90,190,255,0.35) 85deg, transparent 160deg, rgba(195,232,255,0.45) 240deg, transparent 295deg, rgba(215,240,255,0.55) 360deg),
    radial-gradient(28% 36% at 50% 46%, rgba(255,255,255,0.72) 0%, rgba(95,195,255,0.32) 48%, transparent 80%),
    radial-gradient(52% 62% at 50% 50%, rgba(22,72,155,0.45) 0%, transparent 72%)
  `,
  "Luxury Ad": `
    radial-gradient(11% 58% at 54% 46%, rgba(255,200,72,0.72) 0%, rgba(200,138,26,0.38) 44%, transparent 76%),
    radial-gradient(55% 24% at 54% 90%, rgba(255,178,44,0.2) 0%, transparent 66%),
    radial-gradient(62% 55% at 50% 50%, rgba(75,30,6,0.6) 0%, transparent 66%),
    linear-gradient(155deg, rgba(120,60,8,0.12) 0%, transparent 45%)
  `,
  "Fashion Editorial": `
    linear-gradient(92deg, rgba(0,0,0,0.38) 0%, transparent 42%, rgba(0,0,0,0.14) 100%),
    radial-gradient(76% 40% at 50% 0%, rgba(238,218,200,0.16) 0%, transparent 62%),
    radial-gradient(50% 32% at 68% 100%, rgba(148,76,128,0.2) 0%, transparent 62%),
    linear-gradient(176deg, rgba(218,198,182,0.07) 0%, transparent 52%)
  `,
  "Anime": `
    repeating-linear-gradient(90deg, transparent 0px, transparent 20px, rgba(255,36,178,0.045) 21px, transparent 22px),
    radial-gradient(40% 50% at 52% 44%, rgba(255,55,195,0.45) 0%, rgba(200,18,150,0.22) 46%, transparent 76%),
    radial-gradient(22% 26% at 36% 30%, rgba(55,185,255,0.32) 0%, transparent 62%),
    radial-gradient(52% 64% at 50% 72%, rgba(95,0,155,0.32) 0%, transparent 68%)
  `,
  "Dark Moody": `
    radial-gradient(28% 42% at 42% 44%, rgba(195,195,215,0.26) 0%, rgba(145,145,175,0.12) 52%, transparent 76%),
    radial-gradient(62% 52% at 50% 55%, rgba(8,6,12,0.85) 28%, transparent 100%)
  `,
  "Cyberpunk": `
    repeating-linear-gradient(0deg, transparent 0px, transparent 22px, rgba(0,215,255,0.05) 23px, transparent 24px),
    repeating-linear-gradient(90deg, transparent 0px, transparent 22px, rgba(255,0,185,0.04) 23px, transparent 24px),
    radial-gradient(48% 52% at 50% 52%, rgba(0,145,255,0.22) 0%, transparent 66%),
    radial-gradient(32% 28% at 65% 36%, rgba(255,0,195,0.2) 0%, transparent 62%)
  `,
  "Korean Aesthetic": `
    radial-gradient(58% 62% at 50% 42%, rgba(255,198,218,0.28) 0%, rgba(198,178,210,0.14) 56%, transparent 82%),
    radial-gradient(44% 36% at 55% 68%, rgba(178,218,255,0.16) 0%, transparent 62%)
  `,
  "Jewelry Macro": `
    conic-gradient(from 22deg at 50% 50%, rgba(255,245,225,0.4) 0deg, transparent 30deg, rgba(255,220,130,0.45) 70deg, transparent 140deg, rgba(255,245,225,0.35) 220deg, transparent 290deg),
    radial-gradient(32% 38% at 50% 50%, rgba(255,240,200,0.6) 0%, rgba(255,200,80,0.3) 50%, transparent 80%)
  `,
  "Minimalist": `
    radial-gradient(68% 58% at 50% 30%, rgba(255,255,255,0.18) 0%, transparent 66%),
    linear-gradient(180deg, rgba(255,255,255,0.07) 0%, transparent 42%)
  `,
  "Vintage Film": `
    radial-gradient(60% 56% at 50% 52%, rgba(255,195,115,0.28) 0%, transparent 72%),
    linear-gradient(155deg, rgba(200,140,60,0.12) 0%, transparent 48%),
    radial-gradient(45% 38% at 32% 36%, rgba(255,200,100,0.16) 0%, transparent 60%)
  `,
};

/**
 * Live cinematic Style card. Visual only — the click handler is whatever
 * the parent passes (still `setStyle(id)`), so the style → AI pipeline is
 * unchanged. Active card gets motion.layoutId for the spring transition.
 */
function StyleCard({
  s, active, onClick,
}: { s: StyleDef; active: boolean; onClick: () => void }) {
  const vibe = STYLE_VIBE[s.id] ?? "cinema";
  const artBg = STYLE_ART[s.id];

  return (
    <motion.button
      whileTap={{ scale: 0.93 }}
      onClick={onClick}
      className="relative shrink-0 overflow-hidden rounded-[18px]"
      style={{ width: 118, height: 158, background: VIBE_BG[vibe] }}
    >
      {/* ── Layer 1: per-style CSS art background ── */}
      {artBg && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{ background: artBg }}
        />
      )}

      {/* ── Layer 2: animated cinematic vibe overlay ── */}
      <span aria-hidden className={`cs-vibe cs-vibe-${vibe} pointer-events-none absolute inset-0`} />

      {/* ── Layer 3: card shimmer sweep ── */}
      <span aria-hidden className="cs-card-shimmer pointer-events-none absolute inset-0" />

      {/* ── Layer 4: bottom dark gradient for text legibility ── */}
      <span aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-3/4"
        style={{ background: "linear-gradient(0deg, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.55) 45%, transparent 100%)" }} />

      {/* ── Layer 5: top vignette ── */}
      <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-1/3"
        style={{ background: "linear-gradient(180deg, rgba(0,0,0,0.38) 0%, transparent 100%)" }} />

      {/* ── Icon orb (top-left) ── */}
      <span
        className="absolute top-2.5 left-2.5 grid h-8 w-8 place-items-center rounded-xl"
        style={{
          background: "rgba(255,255,255,0.10)",
          backdropFilter: "blur(14px)",
          WebkitBackdropFilter: "blur(14px)",
          boxShadow: active
            ? "0 0 0 1px rgba(255,255,255,0.25), 0 0 16px rgba(167,139,250,0.7), inset 0 1px 0 rgba(255,255,255,0.15)"
            : "0 0 0 1px rgba(255,255,255,0.09), inset 0 1px 0 rgba(255,255,255,0.05)",
        }}
      >
        <s.Icon
          style={{
            width: 15, height: 15,
            color: active ? "white" : "rgba(255,255,255,0.78)",
            strokeWidth: active ? 2.2 : 1.8,
            filter: active ? "drop-shadow(0 0 5px rgba(255,255,255,0.6))" : "none",
          }}
        />
      </span>

      {/* ── Active check badge (top-right) ── */}
      {active && (
        <motion.span
          layoutId="style-check"
          initial={{ scale: 0.4, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="absolute top-2 right-2 grid h-5 w-5 place-items-center rounded-full"
          style={{
            background: "linear-gradient(135deg, #d946ef 0%, #7c3aed 100%)",
            boxShadow: "0 0 14px rgba(217,70,239,0.9), 0 0 28px rgba(167,139,250,0.5)",
          }}
        >
          <Check style={{ width: 10, height: 10, color: "white", strokeWidth: 3.2 }} />
        </motion.span>
      )}

      {/* ── Labels (bottom) ── */}
      <div className="absolute inset-x-0 bottom-0 px-2.5 pb-2.5">
        <p
          className="truncate font-bold leading-snug text-white"
          style={{
            fontSize: 12,
            textShadow: "0 1px 10px rgba(0,0,0,0.9), 0 0 6px rgba(0,0,0,0.7)",
            letterSpacing: "-0.01em",
          }}
        >
          {s.label}
        </p>
        <p
          style={{
            fontSize: 9.5,
            marginTop: 1,
            color: active ? "rgba(196,180,255,0.92)" : "rgba(255,255,255,0.48)",
            textShadow: "0 1px 6px rgba(0,0,0,0.8)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {s.desc}
        </p>
      </div>

      {/* ── Outer neon border ── */}
      {active ? (
        <motion.span
          layoutId="style-glow"
          aria-hidden
          className="pointer-events-none absolute -inset-[1.5px] rounded-[18px]"
          style={{
            boxShadow: [
              "0 0 0 1.5px rgba(167,139,250,0.75)",
              "0 0 22px -4px rgba(167,139,250,0.65)",
              "0 0 44px -10px rgba(217,70,239,0.45)",
              "inset 0 0 22px -8px rgba(217,70,239,0.55)",
            ].join(", "),
          }}
        />
      ) : (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-[18px]"
          style={{ boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.06)" }}
        />
      )}
    </motion.button>
  );
}

/**
 * Aspect ratio card — replaces the segmented control with floating cards
 * matching the reference. Same data (id/w/h/name) wired to the same
 * `setAspect`, so generation params don't change at all.
 */
function AspectCard({
  a, active, onClick,
}: { a: typeof ASPECTS[number]; active: boolean; onClick: () => void }) {
  return (
    <motion.button
      whileTap={{ scale: 0.94 }}
      onClick={onClick}
      className={`relative flex h-[92px] flex-col items-center justify-center gap-1.5 overflow-hidden rounded-2xl border transition-all ${
        active
          ? "border-violet-400/55 bg-gradient-to-b from-violet-600/20 via-violet-700/10 to-indigo-900/10 text-white"
          : "border-white/10 bg-white/[0.03] text-white/70 hover:border-white/20"
      }`}
    >
      {active && (
        <>
          <motion.span
            layoutId="aspect-glow"
            aria-hidden
            className="pointer-events-none absolute -inset-[1px] rounded-2xl"
            style={{ boxShadow: "0 0 0 1px rgba(167,139,250,0.6), 0 0 18px -2px rgba(139,92,246,0.55), inset 0 0 14px -4px rgba(217,70,239,0.4)" }}
          />
          <span aria-hidden className="cs-aspect-pulse pointer-events-none absolute inset-0 rounded-2xl" />
          <span className="absolute top-1.5 right-1.5 grid h-4 w-4 place-items-center rounded-full bg-violet-500 shadow-[0_0_10px_rgba(167,139,250,0.8)]">
            <Check className="h-2.5 w-2.5 text-white" strokeWidth={3} />
          </span>
        </>
      )}
      <span className="relative z-10 flex items-center justify-center" style={{ height: 30 }}>
        <AspectRect w={a.w} h={a.h} active={active} />
      </span>
      <span className={`relative z-10 text-[12px] font-bold leading-none tabular-nums ${active ? "text-white" : "text-white/85"}`}>
        {a.label}
      </span>
      <span className={`relative z-10 text-[9.5px] leading-none ${active ? "text-violet-200/80" : "text-white/40"}`}>
        {a.name}
      </span>
    </motion.button>
  );
}

/** Galaxy backdrop — layered animated gradients + dust particles.
 *  Uses transform/opacity only → GPU compositor. */
function GalaxyBackdrop() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* Deep base */}
      <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, #06010f 0%, #090118 55%, #040012 100%)" }} />
      {/* Nebula + energy layers */}
      <div className="cs-galaxy-nebula absolute inset-0" />
      <div className="cs-galaxy-energy absolute inset-0" />
      <div className="cs-galaxy-dust absolute inset-0" />
      {/* Subtle horizontal scan line */}
      <span className="scan-line absolute inset-x-0 top-0 h-[1.5px]" style={{
        background: "linear-gradient(90deg, transparent 0%, rgba(167,139,250,0.35) 25%, rgba(217,70,239,0.55) 50%, rgba(167,139,250,0.35) 75%, transparent 100%)",
      }} />
      {/* Radial vignette */}
      <div
        className="absolute inset-0"
        style={{ background: "radial-gradient(120% 90% at 50% 25%, transparent 0%, rgba(0,0,0,0.48) 65%, rgba(0,0,0,0.82) 100%)" }}
      />
    </div>
  );
}

/** Single injected stylesheet for the cinematic layer. Inlined so this
 *  page owns its visual upgrade end-to-end — no shared CSS edits. */
function CinematicStyles() {
  return (
    <style>{`
      /* ── GALAXY BACKGROUND ─────────────────────────────────────── */
      @keyframes cs-galaxy-pan-1 {
        0%   { transform: translate3d(-5%, -3%, 0) scale(1.06); }
        50%  { transform: translate3d(5%, 4%, 0) scale(1.12); }
        100% { transform: translate3d(-5%, -3%, 0) scale(1.06); }
      }
      @keyframes cs-galaxy-pan-2 {
        0%   { transform: translate3d(4%, 5%, 0) scale(1.09); opacity: .50; }
        50%  { transform: translate3d(-4%, -5%, 0) scale(1.14); opacity: .90; }
        100% { transform: translate3d(4%, 5%, 0) scale(1.09); opacity: .50; }
      }
      @keyframes cs-galaxy-dust { 0% { background-position: 0 0, 0 0, 0 0; } 100% { background-position: 700px 900px, -500px 700px, 300px -500px; } }

      .cs-galaxy-nebula {
        background:
          radial-gradient(62% 52% at 16% 20%, rgba(167,139,250,0.52) 0%, transparent 62%),
          radial-gradient(58% 48% at 84% 28%, rgba(96,165,250,0.38) 0%, transparent 62%),
          radial-gradient(72% 58% at 28% 86%, rgba(217,70,239,0.34) 0%, transparent 62%),
          radial-gradient(62% 52% at 78% 88%, rgba(56,189,248,0.22) 0%, transparent 62%),
          radial-gradient(45% 38% at 52% 52%, rgba(139,92,246,0.28) 0%, transparent 62%);
        animation: cs-galaxy-pan-1 28s ease-in-out infinite;
        will-change: transform;
      }
      .cs-galaxy-energy {
        background:
          radial-gradient(48% 38% at 66% 52%, rgba(139,92,246,0.42) 0%, transparent 72%),
          radial-gradient(42% 32% at 24% 62%, rgba(244,114,182,0.26) 0%, transparent 72%),
          radial-gradient(35% 28% at 50% 22%, rgba(96,165,250,0.22) 0%, transparent 72%);
        mix-blend-mode: screen;
        animation: cs-galaxy-pan-2 22s ease-in-out infinite;
        will-change: transform, opacity;
      }
      .cs-galaxy-dust {
        background-image:
          radial-gradient(1px 1px at 20px 30px, rgba(255,255,255,0.65), transparent),
          radial-gradient(1px 1px at 120px 80px, rgba(196,180,255,0.65), transparent),
          radial-gradient(1px 1px at 200px 150px, rgba(255,255,255,0.55), transparent),
          radial-gradient(1px 1px at 60px 220px, rgba(96,165,250,0.65), transparent),
          radial-gradient(1px 1px at 280px 60px, rgba(217,70,239,0.5), transparent),
          radial-gradient(1px 1px at 340px 200px, rgba(255,255,255,0.6), transparent),
          radial-gradient(1.5px 1.5px at 160px 140px, rgba(167,139,250,0.5), transparent),
          radial-gradient(1px 1px at 420px 80px, rgba(255,255,255,0.45), transparent);
        background-size: 480px 380px;
        opacity: .7;
        animation: cs-galaxy-dust 80s linear infinite;
        will-change: background-position;
      }

      /* ── PROMPT CARD — spinning conic border + inner glow ──────── */
      @keyframes cs-prompt-spin  { to { transform: rotate(360deg); } }
      @keyframes cs-prompt-pulse { 0%, 100% { opacity: .52; } 50% { opacity: 1; } }
      .cs-prompt-glow {
        background: conic-gradient(from 180deg at 50% 50%,
          rgba(167,139,250,0.65), rgba(96,165,250,0.52), rgba(217,70,239,0.65),
          rgba(56,189,248,0.45), rgba(167,139,250,0.65));
        filter: blur(12px);
        opacity: .52;
        animation: cs-prompt-spin 12s linear infinite, cs-prompt-pulse 5s ease-in-out infinite;
        z-index: 0;
        will-change: transform, opacity;
      }
      .cs-prompt-card:focus-within .cs-prompt-glow { opacity: 1; filter: blur(16px); }
      .cs-prompt-inner-glow {
        background:
          radial-gradient(65% 75% at 50% 0%, rgba(167,139,250,0.22) 0%, transparent 72%),
          radial-gradient(40% 30% at 20% 100%, rgba(217,70,239,0.10) 0%, transparent 60%);
        pointer-events: none;
      }

      /* ── GENERATE BUTTON — premium aurora gradient ──────────────── */
      @keyframes cs-gen-energy    { 0% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } 100% { background-position: 0% 50%; } }
      @keyframes cs-gen-shimmer   { 0% { transform: translateX(-130%) skewX(-12deg); } 100% { transform: translateX(230%) skewX(-12deg); } }
      @keyframes cs-gen-glow-pulse { 0%, 100% { opacity: .52; } 50% { opacity: 1; } }

      .cs-generate-active {
        background: linear-gradient(118deg,
          #5b21b6 0%, #7c3aed 18%, #a855f7 32%,
          #c026d3 52%, #ec4899 70%, #be185d 88%, #7c3aed 100%);
        background-size: 240% 240%;
        animation: cs-gen-energy 5s ease-in-out infinite;
        box-shadow:
          0 12px 40px -10px rgba(139,92,246,0.75),
          0 4px 16px -6px rgba(236,72,153,0.55),
          inset 0 1px 0 rgba(255,255,255,0.18);
        will-change: background-position;
      }
      .cs-gen-energy {
        background: radial-gradient(65% 130% at 50% 50%, rgba(255,255,255,0.20) 0%, transparent 72%);
        mix-blend-mode: screen;
      }
      .cs-gen-shimmer {
        background: linear-gradient(112deg, transparent 28%, rgba(255,255,255,0.65) 50%, transparent 72%);
        animation: cs-gen-shimmer 2.8s ease-in-out infinite;
        will-change: transform;
      }
      .cs-gen-glow {
        background: linear-gradient(118deg, #a855f7, #ec4899, #6366f1, #a855f7);
        background-size: 200% 200%;
        filter: blur(16px);
        z-index: -1;
        animation: cs-gen-energy 5s ease-in-out infinite, cs-gen-glow-pulse 3.5s ease-in-out infinite;
        will-change: opacity, background-position;
      }

      /* ── ASPECT CARD ────────────────────────────────────────────── */
      @keyframes cs-aspect-pulse {
        0%, 100% { box-shadow: inset 0 0 10px rgba(167,139,250,0.28); }
        50%       { box-shadow: inset 0 0 22px rgba(217,70,239,0.52); }
      }
      .cs-aspect-pulse { animation: cs-aspect-pulse 2.6s ease-in-out infinite; will-change: box-shadow; }

      /* ── STYLE CARD SHIMMER ─────────────────────────────────────── */
      @keyframes cs-card-shimmer {
        0%   { transform: translateX(-200%) skewX(-16deg); opacity: 0;   }
        10%  { opacity: .9; }
        90%  { opacity: .9; }
        100% { transform: translateX(260%) skewX(-16deg);  opacity: 0;   }
      }
      .cs-card-shimmer {
        background: linear-gradient(108deg, transparent 28%, rgba(255,255,255,0.09) 50%, transparent 72%);
        animation: cs-card-shimmer 7s ease-in-out infinite;
        will-change: transform, opacity;
      }

      /* ── STYLE CARD VIBES ──────────────────────────────────────── */
      /* All vibes use mix-blend-mode: screen so they punch through the art bg.
         Animations: transform + opacity only → pure GPU compositor path. */
      .cs-vibe { mix-blend-mode: screen; }

      /* Cinema — anamorphic lens flare sweeping left→right */
      @keyframes cs-vibe-cinema {
        0%   { transform: translate3d(-22%, 0, 0) skewX(-4deg); opacity: .20; }
        40%  { opacity: .82; }
        60%  { opacity: .72; }
        100% { transform: translate3d(22%, 0, 0) skewX(-4deg); opacity: .20; }
      }
      .cs-vibe-cinema {
        background:
          linear-gradient(108deg, transparent 28%, rgba(255,190,90,0.55) 50%, transparent 72%),
          radial-gradient(25% 30% at 50% 52%, rgba(255,210,130,0.22) 0%, transparent 70%);
        animation: cs-vibe-cinema 6.5s ease-in-out infinite;
        will-change: transform, opacity;
      }

      /* Crystal — rotating diamond conic gradient */
      @keyframes cs-vibe-crystal {
        0%   { transform: rotate(0deg) scale(1.04); opacity: .60; }
        50%  { transform: rotate(180deg) scale(1.14); opacity: 1; }
        100% { transform: rotate(360deg) scale(1.04); opacity: .60; }
      }
      .cs-vibe-crystal {
        background: conic-gradient(from 0deg at 50% 46%,
          rgba(215,240,255,0.65), rgba(255,255,255,0.50), rgba(90,195,255,0.70),
          rgba(215,240,255,0.50), rgba(255,255,255,0.65), rgba(90,195,255,0.60),
          rgba(215,240,255,0.65));
        filter: blur(3px);
        animation: cs-vibe-crystal 10s linear infinite;
        will-change: transform, opacity;
      }

      /* Luxury — golden vertical light column breathing */
      @keyframes cs-vibe-luxury {
        0%, 100% { transform: scaleY(1) translateY(0);  opacity: .60; }
        50%       { transform: scaleY(1.06) translateY(-2%); opacity: 1;   }
      }
      .cs-vibe-luxury {
        background:
          radial-gradient(14% 65% at 54% 46%, rgba(255,210,75,0.80) 0%, rgba(200,145,28,0.42) 42%, transparent 72%),
          radial-gradient(55% 22% at 54% 90%, rgba(255,185,50,0.22) 0%, transparent 68%);
        animation: cs-vibe-luxury 4s ease-in-out infinite;
        will-change: transform, opacity;
      }

      /* Editorial — soft page-light sweep upward */
      @keyframes cs-vibe-editorial {
        0%, 100% { transform: translate3d(0, 4%, 0); opacity: .42; }
        50%       { transform: translate3d(0, -4%, 0); opacity: .82; }
      }
      .cs-vibe-editorial {
        background:
          linear-gradient(178deg, rgba(240,220,200,0.38) 0%, transparent 48%),
          linear-gradient(18deg, transparent 58%, rgba(200,95,160,0.30) 100%),
          radial-gradient(72% 38% at 50% 0%, rgba(235,215,195,0.18) 0%, transparent 62%);
        animation: cs-vibe-editorial 7.5s ease-in-out infinite;
        will-change: transform, opacity;
      }

      /* Anime — pulsing hot-pink + cyan neon glow */
      @keyframes cs-vibe-anime {
        0%, 100% { opacity: .52; transform: scale(1); }
        50%       { opacity: 1;   transform: scale(1.05); }
      }
      .cs-vibe-anime {
        background:
          radial-gradient(42% 50% at 52% 44%, rgba(255,55,195,0.60) 0%, rgba(200,18,150,0.28) 48%, transparent 74%),
          radial-gradient(24% 28% at 36% 30%, rgba(55,185,255,0.42) 0%, transparent 62%),
          radial-gradient(30% 22% at 72% 68%, rgba(140,0,255,0.28) 0%, transparent 62%);
        animation: cs-vibe-anime 3.8s ease-in-out infinite;
        will-change: opacity, transform;
      }

      /* Neon — scrolling horizontal scanlines + blue core */
      @keyframes cs-vibe-neon { 0% { transform: translate3d(0, -15%, 0); } 100% { transform: translate3d(0, 115%, 0); } }
      .cs-vibe-neon {
        background:
          repeating-linear-gradient(180deg, transparent 0px, transparent 10px, rgba(0,215,255,0.30) 11px, transparent 12px),
          radial-gradient(58% 42% at 50% 50%, rgba(0,180,255,0.38) 0%, transparent 68%),
          radial-gradient(35% 30% at 65% 35%, rgba(255,0,195,0.22) 0%, transparent 60%);
        animation: cs-vibe-neon 5s linear infinite;
        will-change: transform;
      }

      /* Moody — drifting studio spotlight */
      @keyframes cs-vibe-moody {
        0%   { transform: translate3d(-6%, -4%, 0); opacity: .42; }
        50%  { transform: translate3d(6%, 4%, 0);  opacity: .85; }
        100% { transform: translate3d(-6%, -4%, 0); opacity: .42; }
      }
      .cs-vibe-moody {
        background:
          radial-gradient(55% 48% at 36% 40%, rgba(220,220,240,0.28) 0%, transparent 72%),
          radial-gradient(38% 28% at 64% 62%, rgba(160,140,200,0.18) 0%, transparent 62%);
        animation: cs-vibe-moody 8s ease-in-out infinite;
        will-change: transform, opacity;
      }

      /* Dreamy — soft pink + lavender breathing orbs */
      @keyframes cs-vibe-dreamy {
        0%   { transform: translate3d(0, 0, 0) scale(1); opacity: .52; }
        50%  { transform: translate3d(3%, -3%, 0) scale(1.07); opacity: 1; }
        100% { transform: translate3d(0, 0, 0) scale(1); opacity: .52; }
      }
      .cs-vibe-dreamy {
        background:
          radial-gradient(52% 44% at 50% 52%, rgba(244,114,182,0.48) 0%, transparent 72%),
          radial-gradient(42% 32% at 22% 78%, rgba(167,139,250,0.42) 0%, transparent 72%),
          radial-gradient(32% 26% at 78% 30%, rgba(56,189,248,0.28) 0%, transparent 62%);
        animation: cs-vibe-dreamy 9s ease-in-out infinite;
        will-change: transform, opacity;
      }

      /* Minimal — ultra-subtle white top-light */
      @keyframes cs-vibe-minimal { 0%, 100% { opacity: .32; } 50% { opacity: .58; } }
      .cs-vibe-minimal {
        background:
          linear-gradient(180deg, rgba(255,255,255,0.18) 0%, transparent 55%),
          radial-gradient(60% 35% at 50% 0%, rgba(255,255,255,0.12) 0%, transparent 62%);
        animation: cs-vibe-minimal 8s ease-in-out infinite;
        will-change: opacity;
      }

      /* Vintage — warm amber pulsing core */
      @keyframes cs-vibe-vintage {
        0%, 100% { transform: scale(1); opacity: .48; }
        50%       { transform: scale(1.06); opacity: .88; }
      }
      .cs-vibe-vintage {
        background:
          radial-gradient(58% 52% at 50% 52%, rgba(255,195,110,0.55) 0%, transparent 72%),
          radial-gradient(42% 32% at 28% 32%, rgba(255,165,60,0.22) 0%, transparent 62%),
          linear-gradient(155deg, rgba(200,140,55,0.08) 0%, transparent 48%);
        animation: cs-vibe-vintage 5.5s ease-in-out infinite;
        will-change: transform, opacity;
      }

      /* LOADING OVERLAY cinematic layers. */
      @keyframes cs-load-ring { 0% { transform: scale(.6); opacity: .9; } 100% { transform: scale(1.4); opacity: 0; } }
      .cs-load-ring { border: 1.5px solid rgba(167,139,250,0.6); will-change: transform, opacity; }
      .cs-load-ring-1 { animation: cs-load-ring 2.4s ease-out infinite; }
      .cs-load-ring-2 { animation: cs-load-ring 2.4s ease-out infinite .8s; }
      .cs-load-ring-3 { animation: cs-load-ring 2.4s ease-out infinite 1.6s; }

      @keyframes cs-load-nebula { 0%,100% { transform: translate3d(-3%, -2%, 0) scale(1.1); } 50% { transform: translate3d(3%, 2%, 0) scale(1.2); } }
      .cs-load-nebula {
        background:
          radial-gradient(50% 40% at 30% 30%, rgba(167,139,250,0.6) 0%, transparent 60%),
          radial-gradient(60% 50% at 70% 70%, rgba(217,70,239,0.45) 0%, transparent 60%),
          radial-gradient(40% 30% at 50% 50%, rgba(96,165,250,0.4) 0%, transparent 60%);
        opacity: .8; mix-blend-mode: screen;
        animation: cs-load-nebula 12s ease-in-out infinite;
        will-change: transform;
      }

      @keyframes cs-load-streaks { 0% { transform: translate3d(-30%, 0, 0); opacity: 0; } 20% { opacity: .7; } 80% { opacity: .7; } 100% { transform: translate3d(30%, 0, 0); opacity: 0; } }
      .cs-load-streaks {
        background:
          linear-gradient(95deg, transparent 40%, rgba(255,255,255,0.4) 50%, transparent 60%),
          linear-gradient(85deg, transparent 30%, rgba(167,139,250,0.35) 50%, transparent 70%);
        background-size: 200% 100%, 200% 100%;
        animation: cs-load-streaks 4s ease-in-out infinite;
        will-change: transform, opacity;
      }

      @keyframes cs-load-particles { 0% { background-position: 0 0, 0 0, 0 0; } 100% { background-position: 200px 400px, -300px 500px, 400px -300px; } }
      .cs-load-particles {
        background-image:
          radial-gradient(1.5px 1.5px at 30px 60px, rgba(255,255,255,0.8), transparent),
          radial-gradient(1.5px 1.5px at 180px 220px, rgba(217,70,239,0.7), transparent),
          radial-gradient(1.5px 1.5px at 320px 100px, rgba(96,165,250,0.7), transparent);
        background-size: 360px 360px, 360px 360px, 360px 360px;
        opacity: .9;
        animation: cs-load-particles 18s linear infinite;
        will-change: background-position;
      }

      /* Honour the user's reduced-motion preference — kill all animation. */
      @media (prefers-reduced-motion: reduce) {
        .cs-galaxy-nebula, .cs-galaxy-energy, .cs-galaxy-dust,
        .cs-prompt-glow, .cs-generate-active, .cs-gen-shimmer, .cs-gen-glow,
        .cs-aspect-pulse, .cs-vibe, .cs-load-ring, .cs-load-nebula,
        .cs-load-streaks, .cs-load-particles { animation: none !important; }
      }
    `}</style>
  );
}

/* ═══════════════════════════════════════════════════════════
   RESULT OVERLAY
══════════════════════════════════════════════════════════ */
function ResultOverlay({
  result, aspect, isFavorite, saveStatus, copied, showFullPrompt,
  onToggleFav, onClose, onSave, onCopy, onRegen, onTogglePrompt, onShare,
}: {
  result: GenResult;
  aspect: typeof ASPECTS[number];
  isFavorite: boolean;
  saveStatus: "idle" | "saving" | "done";
  copied: boolean;
  showFullPrompt: boolean;
  onToggleFav: () => void;
  onClose: () => void;
  onSave: () => void;
  onCopy: () => void;
  onRegen: () => void;
  onTogglePrompt: () => void;
  onShare: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="absolute inset-0 z-30 flex flex-col bg-[#060606]"
    >
      {/* Top bar */}
      <div
        className="flex items-center justify-between px-4"
        style={{ paddingTop: `calc(env(safe-area-inset-top,0px) + 12px)`, paddingBottom: 12 }}
      >
        <button
          onClick={onClose}
          className="grid h-8 w-8 place-items-center rounded-lg border border-white/[0.08] bg-white/[0.04] text-white/50"
        >
          <X className="h-3.5 w-3.5" />
        </button>
        <span className="text-[12px] font-medium text-white/35">Result</span>
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={onToggleFav}
          className="grid h-8 w-8 place-items-center rounded-lg border border-white/[0.08] bg-white/[0.04]"
        >
          <Heart className={`h-3.5 w-3.5 transition-colors ${isFavorite ? "fill-white text-white" : "text-white/40"}`} />
        </motion.button>
      </div>

      {/* Image */}
      <div className="relative flex flex-1 items-center justify-center overflow-hidden px-4">
        <motion.img
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 280, damping: 26 }}
          src={result.url}
          alt={result.prompt}
          className="max-h-full max-w-full rounded-xl"
          style={{ objectFit: "contain", aspectRatio: `${aspect.w}/${aspect.h}` }}
          loading="eager"
          decoding="async"
        />
      </div>

      {/* Prompt */}
      <div className="mx-4 mt-3">
        <button
          onClick={onTogglePrompt}
          className="flex w-full items-center gap-2 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2.5 text-left"
        >
          <Sparkles className="h-3 w-3 shrink-0 text-white/30" />
          <p className={`flex-1 text-[11px] leading-relaxed text-white/40 ${showFullPrompt ? "" : "line-clamp-1"}`}>
            {result.originalPrompt || result.prompt}
          </p>
          <ChevronDown className={`h-3 w-3 shrink-0 text-white/20 transition-transform ${showFullPrompt ? "rotate-180" : ""}`} />
        </button>
      </div>

      {/* Actions */}
      <div
        className="mt-3 grid grid-cols-4 gap-2 px-4"
        style={{ paddingBottom: `calc(env(safe-area-inset-bottom,0px) + 16px)` }}
      >
        <ActionBtn
          onClick={onSave}
          icon={saveStatus === "done" ? <Check className="h-4 w-4" /> : saveStatus === "saving" ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-white/60" /> : <Download className="h-4 w-4" />}
          label={saveStatus === "done" ? "Saved" : "Download"}
          active={saveStatus === "done"}
        />
        <ActionBtn
          onClick={onCopy}
          icon={copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          label={copied ? "Copied" : "Copy"}
          active={copied}
        />
        <ActionBtn
          onClick={onRegen}
          icon={<RefreshCw className="h-4 w-4" />}
          label="Remix"
        />
        <ActionBtn
          onClick={onShare}
          icon={<Share2 className="h-4 w-4" />}
          label="Share"
        />
      </div>
    </motion.div>
  );
}

function ActionBtn({
  onClick, icon, label, active = false,
}: { onClick: () => void; icon: React.ReactNode; label: string; active?: boolean }) {
  return (
    <motion.button
      whileTap={{ scale: 0.94 }}
      onClick={onClick}
      className={`flex flex-col items-center gap-1.5 rounded-xl border py-3 transition-all ${
        active
          ? "border-white/[0.18] bg-white/[0.07] text-white"
          : "border-white/[0.07] bg-white/[0.03] text-white/50 hover:border-white/[0.12]"
      }`}
    >
      {icon}
      <span className="text-[10px] font-medium">{label}</span>
    </motion.button>
  );
}

/* ═══════════════════════════════════════════════════════════
   HISTORY CARD
══════════════════════════════════════════════════════════ */
function HistoryCard({
  item, isExpanded, onExpand, onFav, onRemix, onRemove,
}: {
  item: HistoryItem;
  isExpanded: boolean;
  onExpand: () => void;
  onFav: () => void;
  onRemix: () => void;
  onRemove: () => void;
}) {
  return (
    <motion.div layout className="overflow-hidden rounded-xl border border-white/[0.06] bg-white/[0.02]">
      <div className="relative cursor-pointer overflow-hidden" style={{ aspectRatio: "4/5" }} onClick={onExpand}>
        <img
          src={item.url}
          alt={item.originalPrompt}
          className="h-full w-full object-cover transition duration-300 hover:scale-[1.02]"
          loading="lazy"
          decoding="async"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />
        {item.isFavorite && (
          <div className="absolute top-2 right-2">
            <Heart className="h-3 w-3 fill-white text-white" />
          </div>
        )}
        <div className="absolute bottom-2 left-2 rounded-md bg-[#000000] px-1.5 py-0.5 text-[9px] font-medium text-white/60">
          {item.style}
        </div>
      </div>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="p-2.5">
              <p className="mb-2 line-clamp-2 text-[10px] leading-relaxed text-white/35">
                {item.originalPrompt}
              </p>
              <div className="flex gap-1.5">
                <button
                  onClick={onRemix}
                  className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-white/[0.08] bg-white/[0.04] py-1.5 text-[10px] font-medium text-white/55"
                >
                  <RefreshCw className="h-2.5 w-2.5" />
                  Remix
                </button>
                <button
                  onClick={onFav}
                  className="grid h-7 w-7 place-items-center rounded-lg border border-white/[0.07] bg-white/[0.03]"
                >
                  <Heart className={`h-2.5 w-2.5 ${item.isFavorite ? "fill-white text-white" : "text-white/25"}`} />
                </button>
                <button
                  onClick={onRemove}
                  className="grid h-7 w-7 place-items-center rounded-lg border border-white/[0.07] bg-white/[0.03]"
                >
                  <X className="h-2.5 w-2.5 text-white/25" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
