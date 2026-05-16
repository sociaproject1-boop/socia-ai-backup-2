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
  TrendingUp, Monitor, Activity, Clapperboard, Focus, Aperture,
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

  const wordCount = prompt.trim() ? prompt.trim().split(/\s+/).length : 0;
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
    <div className="relative flex h-full flex-col bg-[#090909]">

      {/* ── HEADER ──────────────────────────────────────────── */}
      <div
        className="flex items-center gap-3 border-b border-white/[0.05] bg-[#090909] px-4"
        style={{ paddingTop: `calc(env(safe-area-inset-top,0px) + 12px)`, paddingBottom: 12 }}
      >
        <button
          onClick={() => navigate("/create")}
          className="grid h-8 w-8 place-items-center rounded-lg border border-white/[0.08] bg-white/[0.04] text-white/60 transition hover:bg-white/[0.08]"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1">
          <h2 className="text-[14px] font-semibold tracking-tight text-white">Prompt to Image</h2>
          <p className="text-[11px] text-white/30">AI generation · gpt-image-1</p>
        </div>
        <button
          onClick={() => setShowPro((v) => !v)}
          className={`flex h-8 items-center gap-1.5 rounded-lg border px-3 text-[11px] font-medium transition ${
            showPro
              ? "border-violet-500/40 bg-violet-900/25 text-violet-200"
              : "border-white/[0.07] bg-transparent text-white/40 hover:border-white/[0.12] hover:text-white/60"
          }`}
        >
          <SlidersHorizontal className="h-3 w-3" />
          Controls
        </button>
      </div>

      {/* ── SCROLL BODY ─────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto pb-40 hide-scrollbar">

        {/* PROMPT EDITOR */}
        <div className="px-4 pt-5">
          <div className="rounded-xl border border-white/[0.11] bg-white/[0.04] [&:focus-within]:border-violet-500/35 transition-colors duration-200">

            {/* Top bar */}
            <div className="flex items-center justify-between border-b border-white/[0.05] px-4 py-2.5">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-white/30">Prompt</span>
              <div className="flex items-center gap-3">
                <span className={`text-[10px] tabular-nums ${wordCount > 60 ? "text-amber-500/70" : "text-white/20"}`}>
                  {wordCount} words
                </span>
                <button
                  onClick={() => setShowExamples((v) => !v)}
                  className="flex items-center gap-1 rounded-md border border-white/[0.06] bg-white/[0.03] px-2 py-1 text-[10px] text-white/40 transition hover:bg-white/[0.06]"
                >
                  <Lightbulb className="h-2.5 w-2.5" />
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
                className="flex h-7 w-7 items-center justify-center rounded-md border border-white/[0.08] bg-white/[0.04] text-white/40 transition hover:bg-white/[0.07]"
              >
                <Shuffle className="h-3 w-3" />
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
            <div className="border-t border-white/[0.05] px-4 py-2.5">
              <button
                onClick={() => setShowNeg((v) => !v)}
                className="flex w-full items-center gap-1.5 text-[10px] text-white/25 transition hover:text-white/45"
              >
                <ChevronDown className={`h-3 w-3 transition-transform ${showNeg ? "rotate-180" : ""}`} />
                Negative prompt
                <span className="ml-auto text-[9px]">{showNeg ? "hide" : "add"}</span>
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
                      className="mt-2.5 w-full resize-none rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2.5 text-[12px] leading-relaxed text-white/55 placeholder:text-white/18 focus:outline-none focus:border-white/[0.1]"
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>

        {/* STYLE SELECTOR */}
        <div className="mt-6 px-4">
          <p className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-white/30">Style</p>
        </div>
        <div className="hide-scrollbar flex gap-2 overflow-x-auto px-4 pb-0.5">
          {STYLES.map(({ id, label, desc, Icon }) => {
            const active = style === id;
            return (
              <motion.button
                key={id}
                whileTap={{ scale: 0.95 }}
                onClick={() => setStyle(id)}
                className={`relative flex shrink-0 flex-col items-center gap-1.5 rounded-xl border px-3 py-3 transition-all ${
                  active
                    ? "border-violet-500/40 bg-gradient-to-b from-violet-900/30 to-indigo-900/20 text-white"
                    : "border-white/[0.07] bg-white/[0.03] text-white/40 hover:border-white/[0.13] hover:bg-white/[0.05] hover:text-white/65"
                }`}
                style={{ minWidth: 72 }}
              >
                <Icon className={`h-[18px] w-[18px] ${active ? "text-violet-300" : ""}`} strokeWidth={active ? 2 : 1.5} />
                <span className="text-center text-[11px] font-medium leading-none">{label}</span>
                <span className={`text-center text-[9px] leading-none ${active ? "text-violet-300/60" : "text-white/20"}`}>{desc}</span>
                {active && (
                  <motion.div
                    layoutId="style-indicator"
                    className="absolute inset-0 rounded-xl border border-violet-500/40"
                    style={{ boxShadow: "0 0 16px -4px rgba(139,92,246,0.25), inset 0 0 0 1px rgba(139,92,246,0.1)" }}
                    transition={{ type: "spring", stiffness: 400, damping: 32 }}
                  />
                )}
              </motion.button>
            );
          })}
        </div>

        {/* ASPECT RATIO — segmented control */}
        <div className="mt-6 px-4">
          <p className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-white/30">Aspect Ratio</p>
          <div className="relative flex rounded-xl border border-white/[0.07] bg-white/[0.02] p-1">
            {ASPECTS.map((a) => {
              const active = aspect === a.id;
              return (
                <button
                  key={a.id}
                  onClick={() => setAspect(a.id)}
                  className="relative flex flex-1 flex-col items-center gap-2 rounded-lg py-3 transition-all"
                >
                  {active && (
                    <motion.div
                      layoutId="aspect-bg"
                      className="absolute inset-0 rounded-lg border border-violet-500/35 bg-gradient-to-b from-violet-900/25 to-indigo-900/15"
                      style={{ boxShadow: "0 0 12px -4px rgba(139,92,246,0.2)" }}
                      transition={{ type: "spring", stiffness: 420, damping: 32 }}
                    />
                  )}
                  <span className="relative z-10 flex items-center justify-center" style={{ height: 28, width: "100%" }}>
                    <AspectRect w={a.w} h={a.h} active={active} />
                  </span>
                  <span className={`relative z-10 text-[11px] font-semibold leading-none tabular-nums transition-colors ${active ? "text-white" : "text-white/35"}`}>
                    {a.label}
                  </span>
                  <span className={`relative z-10 text-[9px] leading-none transition-colors ${active ? "text-violet-300/70" : "text-white/18"}`}>
                    {a.name}
                  </span>
                </button>
              );
            })}
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
        className="border-t border-white/[0.06] bg-[#090909] px-4 pt-3"
        style={{ paddingBottom: `calc(env(safe-area-inset-bottom,0px) + 16px)` }}
      >
        {/* Settings summary chips */}
        {(style !== "Cinematic" || aspect !== "9:16" || lighting || lens) && (
          <div className="mb-2.5 flex flex-wrap gap-1.5">
            <span className="rounded-md border border-violet-500/20 bg-violet-900/15 px-2 py-0.5 text-[10px] text-violet-300/70">{style}</span>
            <span className="rounded-md border border-indigo-500/20 bg-indigo-900/15 px-2 py-0.5 text-[10px] text-indigo-300/70">{aspect}</span>
            {lighting && <span className="rounded-md border border-white/[0.07] bg-white/[0.03] px-2 py-0.5 text-[10px] text-white/40">{lighting}</span>}
            {lens && <span className="rounded-md border border-white/[0.07] bg-white/[0.03] px-2 py-0.5 text-[10px] text-white/40">{lens.split(" ")[0]}</span>}
          </div>
        )}

        <motion.button
          whileTap={{ scale: canGenerate ? 0.97 : 1 }}
          disabled={!canGenerate}
          onClick={handleGenerate}
          className={`relative flex h-13 w-full items-center justify-center gap-2.5 overflow-hidden rounded-xl text-[15px] font-semibold tracking-tight transition-all duration-200 ${
            canGenerate
              ? "bg-gradient-to-r from-violet-600 via-purple-600 to-indigo-600 text-white shadow-[0_4px_28px_-6px_rgba(139,92,246,0.55)] hover:shadow-[0_4px_36px_-4px_rgba(139,92,246,0.7)] hover:brightness-110"
              : "bg-white/[0.05] text-white/20 cursor-not-allowed border border-white/[0.05]"
          }`}
          style={{ height: 52 }}
        >
          {loading ? (
            <>
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-white/80" />
              Generating…
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4" />
              Generate Image
            </>
          )}
        </motion.button>
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
      transition={{ duration: 0.25 }}
      className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-8"
      style={{ background: "rgba(9,9,9,0.97)" }}
    >
      {/* Spinner ring */}
      <div className="relative" style={{ width: 64, height: 64 }}>
        <svg className="absolute inset-0 -rotate-90" width={64} height={64} viewBox="0 0 64 64">
          <circle cx={32} cy={32} r={27} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={3} />
          <circle
            cx={32} cy={32} r={27} fill="none"
            stroke="url(#ringGrad)" strokeWidth={3}
            strokeLinecap="round"
            strokeDasharray={`${2 * Math.PI * 27}`}
            strokeDashoffset={`${2 * Math.PI * 27 * (1 - progress)}`}
            style={{ transition: "stroke-dashoffset 0.5s ease-out" }}
          />
          <defs>
            <linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#a78bfa" />
              <stop offset="100%" stopColor="#818cf8" />
            </linearGradient>
          </defs>
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-[11px] font-semibold tabular-nums text-white/60">{pct}%</span>
        </div>
      </div>

      <div className="flex flex-col items-center gap-2">
        <AnimatePresence mode="wait" initial={false}>
          <motion.p
            key={stage.key}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.25 }}
            className="text-[14px] font-medium text-white/70"
          >
            {stage.label}
          </motion.p>
        </AnimatePresence>
        <p className="text-[11px] text-white/22">This typically takes 8–15 seconds</p>
      </div>
    </motion.div>
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
