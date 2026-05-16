import { useEffect, useRef, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  ImagePlus,
  X,
  Sparkles,
  Loader2,
  Download,
  RotateCcw,
  Film,
  ImageIcon,
  Heart,
  ChevronDown,
  ChevronUp,
  Zap,
  Share2,
  Clock,
} from "lucide-react";
import { useAppStore } from "@/lib/store";
import {
  usePresets,
  generateFromPreset,
  uploadStudioImage,
  useFavoritesStore,
  PresetGenError,
  type ClientPreset,
  type PresetGenResult,
} from "@/lib/presetClient";

// ── Camera motion presets ──────────────────────────────────────────────────────
const CAMERA_MOTIONS = [
  { id: "slow-push", label: "Slow Push-In", emoji: "🎯", value: "slow cinematic push-in dolly toward the subject" },
  { id: "orbit", label: "Orbit Shot", emoji: "🔄", value: "smooth 360 orbit rotation around the subject" },
  { id: "handheld", label: "Handheld", emoji: "📱", value: "subtle authentic handheld creator vlog camera movement" },
  { id: "dramatic-reveal", label: "Dramatic Reveal", emoji: "🎭", value: "dramatic reveal starting from extreme close-up and pulling back wide" },
  { id: "drone", label: "Drone Flyover", emoji: "🚁", value: "smooth aerial drone flyover with rising motion" },
  { id: "macro-sweep", label: "Macro Sweep", emoji: "🔍", value: "ultra-close macro sweep revealing fine surface details slowly" },
  { id: "luxury-rotate", label: "Luxury Rotation", emoji: "💎", value: "slow elegant luxury product rotation with perfect reflections" },
  { id: "parallax", label: "Parallax", emoji: "✨", value: "subtle parallax depth motion with layered foreground elements shifting" },
];

// ── Lighting style presets ────────────────────────────────────────────────────
const LIGHTING_STYLES = [
  { id: "studio", label: "Studio", emoji: "💡", value: "professional studio three-point lighting setup" },
  { id: "golden-hour", label: "Golden Hour", emoji: "🌅", value: "warm golden hour sun backlight at sunset with soft orange haze" },
  { id: "dramatic", label: "Dramatic", emoji: "🎭", value: "dramatic single key light from camera-left creating deep shadows" },
  { id: "natural", label: "Natural", emoji: "☀️", value: "soft natural diffused daylight streaming from a window" },
  { id: "neon", label: "Neon Glow", emoji: "🌃", value: "vibrant neon accent lights with colorful reflections and atmosphere" },
  { id: "soft-beauty", label: "Soft Beauty", emoji: "✨", value: "large beauty softbox with minimal shadows and even even illumination" },
];

// ── Simple client-side prompt enhancer ───────────────────────────────────────
function enhancePromptText(text: string, preset: ClientPreset): string {
  if (!text.trim()) return text;
  const lower = text.toLowerCase();
  const additions: string[] = [];

  if (lower.match(/shoe|sneaker|boot|trainer/)) additions.push("sleek premium design with clean sole edges");
  else if (lower.match(/dress|shirt|jacket|outfit|top|pants|jeans/)) additions.push("refined editorial styling");
  else if (lower.match(/bottle|perfume|fragrance|cologne/)) additions.push("luxury glass with light refractions");
  else if (lower.match(/bag|purse|wallet|pouch/)) additions.push("premium material texture and hardware detail");
  else if (lower.match(/watch|timepiece/)) additions.push("polished dial and case details");
  else if (lower.match(/food|dish|meal|drink|coffee|cake/)) additions.push("appetising fresh presentation");
  else if (lower.match(/face|portrait|person|woman|man|girl|boy/)) additions.push("natural skin texture and authentic expression");

  if (preset.kind === "video") additions.push("cinematic motion");
  if (preset.category.includes("Luxury") || preset.category.includes("luxury")) additions.push("premium elevated aesthetic");

  return text.trim() + (additions.length ? `, ${additions.join(", ")}` : "");
}

// ── Generation overlay ────────────────────────────────────────────────────────
function GenerationOverlay({ phase, preset }: { phase: "preparing" | "rendering" | "finishing"; preset: ClientPreset }) {
  const phases = {
    preparing: { label: "Preparing AI…", sub: "Reading preset configuration" },
    rendering: {
      label: preset.kind === "video" ? "Generating video…" : "Creating image…",
      sub: preset.kind === "video" ? "This can take 1–3 minutes" : "Usually 15–30 seconds",
    },
    finishing: { label: "Almost ready…", sub: "Uploading your creation" },
  };
  const { label, sub } = phases[phase];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center"
      style={{ background: "rgba(0,0,0,0.96)" }}
    >
      {/* Pulsing ring animation */}
      <div className="relative mb-8">
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            className="absolute rounded-full"
            animate={{ scale: [1, 2.2, 1], opacity: [0.5, 0, 0.5] }}
            transition={{ duration: 2.2, repeat: Infinity, delay: i * 0.55, ease: "easeOut" }}
            style={{
              width: 80,
              height: 80,
              left: "50%",
              top: "50%",
              transform: "translate(-50%, -50%)",
              background: `radial-gradient(circle, ${["rgba(168,85,247,0.6)", "rgba(236,72,153,0.5)", "rgba(99,102,241,0.5)"][i]} 0%, transparent 70%)`,
            }}
          />
        ))}
        <div
          className="relative grid h-20 w-20 place-items-center rounded-full"
          style={{ background: "linear-gradient(135deg,#a855f7,#ec4899)" }}
        >
          <Sparkles className="h-8 w-8 text-white" />
        </div>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={phase}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          className="text-center"
        >
          <p className="text-[20px] font-bold text-white">{label}</p>
          <p className="mt-1 text-[13px] text-white/55">{sub}</p>
        </motion.div>
      </AnimatePresence>

      {/* Phase dots */}
      <div className="mt-7 flex gap-2.5">
        {(["preparing", "rendering", "finishing"] as const).map((p) => (
          <motion.div
            key={p}
            animate={{ scale: phase === p ? 1.4 : 1, opacity: phase === p ? 1 : 0.3 }}
            className="h-2 w-2 rounded-full bg-purple-400"
          />
        ))}
      </div>

      {phase === "rendering" && preset.kind === "video" && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 8 }}
          className="mt-5 max-w-xs px-6 text-center text-[11.5px] text-white/40"
        >
          Video generation uses powerful AI — please keep this screen open.
        </motion.p>
      )}
    </motion.div>
  );
}

// ── Result overlay ─────────────────────────────────────────────────────────────
function ResultOverlay({
  result,
  preset,
  isFavorite,
  onToggleFav,
  onClose,
  onRegen,
  onShare,
}: {
  result: PresetGenResult;
  preset: ClientPreset;
  isFavorite: boolean;
  onToggleFav: () => void;
  onClose: () => void;
  onRegen: () => void;
  onShare: () => void;
}) {
  const url = result.type === "video" ? result.videoUrl! : result.url;
  const [showPrompt, setShowPrompt] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
      style={{ background: "rgba(0,0,0,0.85)" }}
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 60, scale: 0.97, opacity: 0 }}
        animate={{ y: 0, scale: 1, opacity: 1 }}
        exit={{ y: 60, scale: 0.97, opacity: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 28 }}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-md overflow-hidden rounded-t-3xl sm:rounded-3xl"
        style={{
          background: "rgba(10,4,24,0.98)",
          border: "1px solid rgba(168,85,247,0.3)",
          boxShadow: "0 0 60px -15px rgba(168,85,247,0.4)",
          maxHeight: "90vh",
          overflowY: "auto",
        }}
      >
        {/* Close */}
        <button
          onClick={onClose}
          className="absolute right-3 top-3 z-10 grid h-8 w-8 place-items-center rounded-full bg-[#000000] text-white"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Media */}
        {result.type === "video" ? (
          <video
            src={url}
            controls
            autoPlay
            playsInline
            className="w-full bg-black"
            style={{ maxHeight: "60vh", objectFit: "contain" }}
          />
        ) : (
          <img src={url} alt="" className="w-full object-cover" />
        )}

        {/* Bottom sheet */}
        <div className="p-4">
          {/* Preset label */}
          <div className="mb-2 flex items-center justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-white/35">
                {result.presetUsed.category}
              </p>
              <p className="text-[15px] font-bold text-white">{result.presetUsed.title}</p>
            </div>
            <button
              onClick={onToggleFav}
              className="grid h-9 w-9 place-items-center rounded-full transition-all active:scale-90"
              style={{ background: "rgba(255,255,255,0.07)" }}
              aria-label="Favorite"
            >
              <Heart
                className="h-4 w-4"
                style={{ color: isFavorite ? "#f472b6" : "rgba(255,255,255,0.6)", fill: isFavorite ? "#f472b6" : "none" }}
              />
            </button>
          </div>

          {/* Prompt toggle */}
          <button
            onClick={() => setShowPrompt((v) => !v)}
            className="mb-3 flex w-full items-center gap-1 text-[11px] text-white/40"
          >
            {showPrompt ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            {showPrompt ? "Hide prompt" : "Show AI prompt"}
          </button>
          <AnimatePresence>
            {showPrompt && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <p className="mb-3 rounded-xl p-2.5 text-[11px] leading-relaxed text-white/55"
                  style={{ background: "rgba(255,255,255,0.04)" }}>
                  {result.prompt}
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Action buttons */}
          <div className="flex gap-2">
            <button
              onClick={onShare}
              className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-white/70 transition active:scale-95"
              style={{ background: "rgba(255,255,255,0.07)" }}
              aria-label="Share to Feed"
            >
              <Share2 className="h-4 w-4" />
            </button>
            <a
              href={url}
              download
              target="_blank"
              rel="noreferrer"
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 text-[13px] font-medium text-white transition active:scale-95"
              style={{ background: "rgba(255,255,255,0.09)" }}
            >
              <Download className="h-4 w-4" />
              Save
            </a>
            <button
              onClick={() => { onClose(); setTimeout(onRegen, 200); }}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 text-[13px] font-semibold text-white transition active:scale-95"
              style={{ background: "linear-gradient(135deg,#a855f7,#ec4899)" }}
            >
              <RotateCcw className="h-4 w-4" />
              Regenerate
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Chip selector ─────────────────────────────────────────────────────────────
function ChipGroup<T extends string>({
  label,
  options,
  selected,
  onSelect,
}: {
  label: string;
  options: { id: string; label: string; emoji: string; value: T }[];
  selected: string | null;
  onSelect: (id: string | null, value: T | null) => void;
}) {
  return (
    <div className="mb-4">
      <p className="mb-2 text-[12px] font-medium text-white/60">{label}</p>
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => {
          const active = selected === opt.id;
          return (
            <motion.button
              key={opt.id}
              whileTap={{ scale: 0.94 }}
              onClick={() => onSelect(active ? null : opt.id, active ? null : opt.value)}
              className="rounded-xl px-2.5 py-1.5 text-[11.5px] font-medium transition-all"
              style={
                active
                  ? {
                      background: "linear-gradient(135deg,#a855f7,#ec4899)",
                      color: "#fff",
                      boxShadow: "0 4px 14px -4px rgba(168,85,247,0.55)",
                    }
                  : {
                      background: "rgba(255,255,255,0.07)",
                      color: "rgba(255,255,255,0.65)",
                      border: "1px solid rgba(255,255,255,0.07)",
                    }
              }
            >
              {opt.emoji} {opt.label}
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}

// ── Main preset page ──────────────────────────────────────────────────────────
export default function StudioPreset() {
  const [, params] = useRoute("/studio/:presetId");
  const [, navigate] = useLocation();
  const { presets, loading } = usePresets();
  const me = useAppStore((s) => s.user);
  const favoriteIds = useFavoritesStore((s) => s.ids);
  const toggleFav = useFavoritesStore((s) => s.toggle);

  const preset: ClientPreset | undefined = presets?.find((p) => p.id === params?.presetId);
  const presetMissing = !!presets && !preset;

  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [userText, setUserText] = useState("");
  const [genPhase, setGenPhase] = useState<"idle" | "preparing" | "rendering" | "finishing">("idle");
  const [result, setResult] = useState<PresetGenResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Advanced settings
  const [cameraMotionId, setCameraMotionId] = useState<string | null>(null);
  const [cameraMotionValue, setCameraMotionValue] = useState<string | null>(null);
  const [lightingId, setLightingId] = useState<string | null>(null);
  const [lightingValue, setLightingValue] = useState<string | null>(null);
  const [negativeExtra, setNegativeExtra] = useState("");
  const [durationOverride, setDurationOverride] = useState<5 | 10 | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);

  // Reset state when preset changes
  useEffect(() => {
    setImageUrl(null);
    setUserText("");
    setResult(null);
    setError(null);
    setCameraMotionId(null);
    setCameraMotionValue(null);
    setLightingId(null);
    setLightingValue(null);
    setNegativeExtra("");
    setDurationOverride(null);
    setShowAdvanced(false);
  }, [preset?.id]);

  if (loading) {
    return (
      <div className="grid h-[60vh] place-items-center text-white/60">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }
  if (presetMissing || !preset) {
    return (
      <div className="px-5 pt-8 text-center">
        <p className="text-white/70">Preset not found.</p>
        <button
          onClick={() => navigate("/studio")}
          className="mt-4 rounded-xl px-4 py-2 text-sm text-white"
          style={{ background: "rgba(255,255,255,0.1)" }}
        >
          Back to Studio
        </button>
      </div>
    );
  }

  const Icon = preset.kind === "video" ? Film : ImageIcon;
  const needsImage = preset.kind === "video" || preset.requiresUploadedImage;
  const busy = genPhase !== "idle";
  const canGenerate = !busy && (!needsImage || !!imageUrl);
  const isFavorite = favoriteIds.includes(preset.id);

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (!me?.id) { setError("Please sign in again."); return; }
    setError(null);
    setUploading(true);
    setUploadProgress(0);

    // Simulated progress (0 → 88% during upload)
    const timer = setInterval(() => {
      setUploadProgress((v) => v < 88 ? v + (88 - v) * 0.12 : v);
    }, 150);

    try {
      const url = await uploadStudioImage(f, me.id);
      clearInterval(timer);
      setUploadProgress(100);
      setTimeout(() => { setImageUrl(url); setUploading(false); setUploadProgress(0); }, 350);
    } catch (err) {
      clearInterval(timer);
      setError(err instanceof Error ? err.message : "Upload failed");
      setUploading(false);
      setUploadProgress(0);
    }
  }

  async function onGenerate() {
    if (!canGenerate || !preset) return;
    setError(null);
    setResult(null);
    setGenPhase("preparing");
    await new Promise((r) => setTimeout(r, 900));
    setGenPhase("rendering");

    try {
      const r = await generateFromPreset({
        presetId: preset.id,
        imageUrl: imageUrl || undefined,
        userText: userText.trim() || undefined,
        cameraMotion: cameraMotionValue || undefined,
        lightingOverride: lightingValue || undefined,
        negativePhraseExtra: negativeExtra.trim() || undefined,
        durationOverride: durationOverride ?? undefined,
      });
      setGenPhase("finishing");
      await new Promise((re) => setTimeout(re, 700));
      setResult(r);
    } catch (err) {
      const msg =
        err instanceof PresetGenError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Generation failed.";
      setError(msg);
    } finally {
      setGenPhase("idle");
    }
  }

  function onEnhanceText() {
    if (!userText.trim()) {
      setUserText(preset!.badge === "Quick" ? "" : "");
      return;
    }
    const enhanced = enhancePromptText(userText, preset!);
    if (enhanced !== userText) setUserText(enhanced);
  }

  function onShareToFeed() {
    if (!result) return;
    const url = result.type === "video" ? result.videoUrl : result.url;
    navigate(`/create?prefillUrl=${encodeURIComponent(url ?? "")}&prefillCaption=${encodeURIComponent(`Made with ${preset!.title} preset in AI Studio`)}`);
  }

  return (
    <div
      className="relative min-h-screen pb-32"
      style={{
        background:
          `radial-gradient(ellipse 60% 35% at 20% -5%, ${preset.thumb.from}20 0%, transparent 55%),` +
          "radial-gradient(ellipse 50% 30% at 80% 110%, rgba(236,72,153,0.08) 0%, transparent 55%)," +
          "#030010",
      }}
    >
      {/* Top bar */}
      <div className="sticky top-0 z-20 px-4 pt-4 pb-2"
        style={{ background: "#000000" }}>
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate("/studio")}
            className="grid h-9 w-9 place-items-center rounded-full text-white/80 active:scale-95"
            style={{ background: "#0a0a0a", border: "1px solid rgba(255,255,255,0.06)" }}
            aria-label="Back"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[10.5px] uppercase tracking-wider text-white/35">{preset.category}</p>
            <h1 className="truncate font-display text-[19px] font-bold leading-tight text-white">{preset.title}</h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => toggleFav(preset.id)}
              className="grid h-9 w-9 place-items-center rounded-full active:scale-90 transition-all"
              style={{ background: "#0a0a0a", border: "1px solid rgba(255,255,255,0.06)" }}
              aria-label="Favorite"
            >
              <Heart
                className="h-4 w-4"
                style={{ color: isFavorite ? "#f472b6" : "rgba(255,255,255,0.7)", fill: isFavorite ? "#f472b6" : "none" }}
              />
            </button>
            <span
              className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium text-white"
              style={{ background: `linear-gradient(135deg, ${preset.thumb.from}, ${preset.thumb.to})` }}
            >
              <Icon className="h-3 w-3" />
              {preset.kind === "video" ? `${durationOverride ?? preset.durationSec ?? 5}s` : preset.defaultAspect}
            </span>
          </div>
        </div>
      </div>

      <div className="px-4 pt-3">
        {/* Preset description */}
        <p className="mb-4 text-[13px] text-white/55">{preset.description}</p>

        {/* Smart hint chip */}
        <motion.div
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2 }}
          className="mb-4 flex items-center gap-2 rounded-xl p-2.5"
          style={{ background: `linear-gradient(135deg, ${preset.thumb.from}22, ${preset.thumb.to}15)`, border: "1px solid rgba(255,255,255,0.08)" }}
        >
          <div className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-base"
            style={{ background: `linear-gradient(135deg, ${preset.thumb.from}88, ${preset.thumb.to}88)` }}>
            {preset.thumb.emoji}
          </div>
          <p className="text-[11.5px] text-white/65 leading-snug">
            AI preset handles <span className="text-white/85 font-medium">lighting, camera, mood & style</span> automatically.
            {needsImage ? " Upload a photo to transform." : " No photo needed — just tap Generate."}
          </p>
        </motion.div>

        {/* Upload area (if required) */}
        {needsImage && (
          <div className="mb-4">
            <label className="mb-2 block text-[12px] font-medium text-white/65">
              {preset.kind === "video" ? "Source image (will be animated)" : "Source image (will be transformed)"}
            </label>
            {imageUrl ? (
              <div className="relative overflow-hidden rounded-2xl" style={{ border: "1px solid rgba(255,255,255,0.1)" }}>
                <img src={imageUrl} alt="" className="aspect-square w-full object-cover" />
                <div className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-black/70 to-transparent" />
                <button
                  onClick={() => setImageUrl(null)}
                  className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full bg-[#000000] text-white"
                  aria-label="Remove"
                >
                  <X className="h-4 w-4" />
                </button>
                <div className="absolute bottom-2 left-2 rounded-full bg-[#000000] px-2.5 py-1 text-[10.5px] font-medium text-green-400">
                  ✓ Ready
                </div>
              </div>
            ) : (
              <button
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="relative flex w-full flex-col items-center justify-center gap-3 overflow-hidden rounded-2xl py-10 text-white/55 transition active:scale-[0.99] disabled:opacity-60"
                style={{ border: "2px dashed rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.03)" }}
              >
                {uploading ? (
                  <>
                    <Loader2 className="h-7 w-7 animate-spin text-purple-400" />
                    <span className="text-[12px]">Uploading…</span>
                    {/* Progress bar */}
                    <div className="absolute inset-x-4 bottom-3 h-1.5 overflow-hidden rounded-full bg-white/10">
                      <motion.div
                        animate={{ width: `${uploadProgress}%` }}
                        className="h-full rounded-full"
                        style={{ background: "linear-gradient(90deg,#a855f7,#ec4899)" }}
                        transition={{ duration: 0.3 }}
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <div
                      className="grid h-14 w-14 place-items-center rounded-2xl"
                      style={{ background: "linear-gradient(135deg,#a855f7,#ec4899)", boxShadow: "0 8px 24px -8px rgba(168,85,247,0.5)" }}
                    >
                      <ImagePlus className="h-6 w-6 text-white" />
                    </div>
                    <div className="text-center">
                      <p className="text-[14px] font-semibold text-white/80">Tap to upload a photo</p>
                      <p className="mt-0.5 text-[11.5px] text-white/40">JPG, PNG, WebP · max 10MB</p>
                    </div>
                  </>
                )}
              </button>
            )}
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPickFile} />
          </div>
        )}

        {/* Subject text input */}
        <label className="mb-2 block text-[12px] font-medium text-white/65">
          {needsImage ? "Add a hint (optional)" : "Describe the subject"}
        </label>
        <div className="relative mb-1">
          <textarea
            value={userText}
            onChange={(e) => setUserText(e.target.value.slice(0, 500))}
            rows={2}
            placeholder={needsImage ? "e.g. black ceramic mug, gold logo visible…" : "e.g. a young Asian woman with shoulder-length hair…"}
            className="app-input w-full resize-none rounded-2xl px-3 py-2.5 pr-20 text-[13.5px] text-white placeholder-white/30 outline-none"
          />
          {userText.trim() && (
            <button
              onClick={onEnhanceText}
              className="absolute right-2 top-2 flex items-center gap-1 rounded-lg px-2 py-1 text-[10.5px] font-medium text-purple-300 transition active:scale-95"
              style={{ background: "rgba(168,85,247,0.18)" }}
            >
              <Zap className="h-2.5 w-2.5" />
              Enhance
            </button>
          )}
        </div>
        <p className="mb-4 text-[10.5px] text-white/35">
          The preset already controls lighting, lens, and mood. Your text steers the subject.
        </p>

        {/* Camera motion (video only) */}
        {preset.kind === "video" && (
          <ChipGroup
            label="📹 Camera Motion"
            options={CAMERA_MOTIONS}
            selected={cameraMotionId}
            onSelect={(id, val) => { setCameraMotionId(id); setCameraMotionValue(val); }}
          />
        )}

        {/* Lighting style */}
        <ChipGroup
          label="💡 Lighting Style"
          options={LIGHTING_STYLES}
          selected={lightingId}
          onSelect={(id, val) => { setLightingId(id); setLightingValue(val); }}
        />

        {/* Duration selector (video) */}
        {preset.kind === "video" && (
          <div className="mb-4">
            <p className="mb-2 text-[12px] font-medium text-white/60">⏱ Duration</p>
            <div className="flex gap-2">
              {([5, 10] as const).map((d) => {
                const active = (durationOverride ?? preset.durationSec ?? 5) === d;
                return (
                  <button
                    key={d}
                    onClick={() => setDurationOverride(d)}
                    className="flex-1 rounded-xl py-2 text-[12.5px] font-medium transition-all active:scale-95"
                    style={
                      active
                        ? { background: "linear-gradient(135deg,#a855f7,#ec4899)", color: "#fff" }
                        : { background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.6)", border: "1px solid rgba(255,255,255,0.07)" }
                    }
                  >
                    {d}s {d === 10 ? "(more credits)" : ""}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Advanced settings collapse */}
        <button
          onClick={() => setShowAdvanced((v) => !v)}
          className="mb-3 flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-[12.5px] font-medium text-white/60 transition active:scale-[0.99]"
          style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.07)" }}
        >
          {showAdvanced ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          Advanced Settings
          <span className="ml-auto text-[10.5px] text-white/35">{showAdvanced ? "hide" : "show"}</span>
        </button>

        <AnimatePresence>
          {showAdvanced && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="mb-4 overflow-hidden"
            >
              <div className="rounded-2xl p-3" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
                <label className="mb-1 block text-[12px] font-medium text-white/60">
                  Negative prompt extra
                </label>
                <textarea
                  value={negativeExtra}
                  onChange={(e) => setNegativeExtra(e.target.value.slice(0, 200))}
                  rows={2}
                  placeholder="Things to avoid, e.g.: blur, oversaturated, low quality…"
                  className="app-input w-full resize-none rounded-xl px-3 py-2 text-[12.5px] text-white placeholder-white/25 outline-none"
                />
                <p className="mt-1 text-[10px] text-white/30">{negativeExtra.length}/200</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Error */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="mb-4 rounded-xl p-3 text-[12.5px] text-red-300"
              style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)" }}
            >
              {error}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Missing photo hint */}
        {needsImage && !imageUrl && !busy && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mb-4 flex items-center gap-2 rounded-xl p-3 text-[12px] text-amber-300/80"
            style={{ background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.15)" }}
          >
            <Clock className="h-4 w-4 shrink-0" />
            Upload a photo above to unlock the Generate button.
          </motion.div>
        )}

        {/* Generate button */}
        <motion.button
          whileTap={{ scale: 0.98 }}
          disabled={!canGenerate}
          onClick={onGenerate}
          className="relative w-full overflow-hidden rounded-2xl py-4 text-[15px] font-bold text-white transition-all disabled:opacity-50"
          style={{
            background: "linear-gradient(135deg,#a855f7 0%,#ec4899 50%,#6366f1 100%)",
            boxShadow: canGenerate ? "0 16px 40px -12px rgba(168,85,247,0.65)" : "none",
          }}
        >
          {/* Shimmer effect */}
          {canGenerate && (
            <motion.div
              animate={{ x: ["-110%", "210%"] }}
              transition={{ duration: 2, repeat: Infinity, ease: "linear", repeatDelay: 2.5 }}
              className="pointer-events-none absolute inset-0 -skew-x-12"
              style={{ background: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.14) 50%, transparent 100%)" }}
            />
          )}
          <span className="relative flex items-center justify-center gap-2">
            <Sparkles className="h-4 w-4" />
            {preset.kind === "video" ? "Generate Video" : "Generate Image"}
          </span>
        </motion.button>

        {/* Credits note */}
        <p className="mt-2 text-center text-[10.5px] text-white/30">
          Uses AI credits from your balance · Free plan gets a daily quota
        </p>
      </div>

      {/* Generation overlay */}
      <AnimatePresence>
        {busy && <GenerationOverlay phase={genPhase as "preparing" | "rendering" | "finishing"} preset={preset!} />}
      </AnimatePresence>

      {/* Result overlay */}
      <AnimatePresence>
        {result && (
          <ResultOverlay
            result={result}
            preset={preset!}
            isFavorite={isFavorite}
            onToggleFav={() => toggleFav(preset.id)}
            onClose={() => setResult(null)}
            onRegen={onGenerate}
            onShare={onShareToFeed}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
