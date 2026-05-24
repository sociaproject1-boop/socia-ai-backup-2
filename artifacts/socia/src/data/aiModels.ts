/**
 * aiModels — Single source of truth for the AI Cinematic Studio's
 * model orchestrator. The 5 premium models surfaced in the fullscreen
 * Model Selector live here; CreateMultiFrame's internal ENGINES table
 * still owns the render-pipeline contract (credits-per-segment,
 * speedScore, etc.) for backward compatibility.
 *
 * IMPORTANT: id values MUST match `RenderEngineId` in CreateMultiFrame.tsx
 * so selecting a model here flows straight into cfg.renderEngine and
 * the render pipeline (no translation layer needed).
 */

import klingOmniCover from "@assets/image-8_1779541488524.jpg";
import runwayCover    from "@assets/model-covers/runway-gen4.png";
import veoCover       from "@assets/model-covers/veo.png";
import pikaCover      from "@assets/model-covers/pika.png";
import lumaCover      from "@assets/model-covers/luma.png";

export type AiModelId =
  | "kling-3-omni"
  | "runway-gen4"
  | "veo-ultra"
  | "pika"
  | "luma";

export type QualityLevel = "Cinema" | "Premium" | "Ultra" | "Balanced" | "Stylized";
export type SpeedLevel   = "Fast" | "Medium" | "Slow" | "Very Slow";

export interface AiModel {
  /** Render-engine id — also drives cfg.renderEngine in the studio. */
  id: AiModelId;
  /** Display name. */
  name: string;
  /** One-line tagline. */
  tagline: string;
  /** Longer description shown in the selector modal. */
  description: string;
  /** Cover artwork. */
  cover: string;
  /** Quality tier. */
  quality: QualityLevel;
  /** Speed tier. */
  speed: SpeedLevel;
  /** 0–100 cinematic quality score for the bar. */
  cinematicScore: number;
  /** 0–100 speed score for the bar. */
  speedScore: number;
  /** Credits charged per rendered segment. */
  creditsPerSegment: number;
  /** Short cinematic tags. */
  tags: string[];
  /** Accent gradient used for fallbacks / glow. */
  gradient: string;
  /** Coloured glow shadow. */
  glow: string;
  /** False → shows "Coming Soon" lock. */
  available: boolean;
  /** True → flagship recommended model. */
  featured?: boolean;
}

export const AI_MODELS: AiModel[] = [
  {
    id: "kling-3-omni",
    name: "Kling 3.0 Omni",
    tagline: "Cinema-grade · Perfect lip sync · Pro storytelling",
    description:
      "Cinema-grade AI video generation with perfect lip sync and cinematic storytelling. The flagship engine for multi-shot films, character continuity, and dialogue-driven scenes.",
    cover: klingOmniCover,
    quality: "Cinema",
    speed: "Medium",
    cinematicScore: 98,
    speedScore: 70,
    creditsPerSegment: 40,
    tags: ["Cinematic", "Lip Sync", "Multi-Shot", "Realistic"],
    gradient: "linear-gradient(135deg,#b026ff,#ec4899)",
    glow: "rgba(176,38,255,0.6)",
    available: true,
    featured: true,
  },
  {
    id: "runway-gen4",
    name: "Runway Gen-4",
    tagline: "Hollywood-grade · Commercial realism",
    description:
      "Professional cinematic video engine for high-end storytelling. Best for ads, product films, and commercial-grade shots with photoreal lighting.",
    cover: runwayCover,
    quality: "Premium",
    speed: "Slow",
    cinematicScore: 92,
    speedScore: 45,
    creditsPerSegment: 50,
    tags: ["Hollywood", "Commercial", "Photoreal", "High-End"],
    gradient: "linear-gradient(135deg,#ec4899,#f43f5e)",
    glow: "rgba(236,72,153,0.55)",
    available: false,
  },
  {
    id: "veo-ultra",
    name: "Veo",
    tagline: "Ultra-realistic motion · Cinematic camera control",
    description:
      "Ultra-realistic motion generation with cinematic camera control. Movie-level fidelity, art-cinema aesthetics, and the highest realism scores in the studio.",
    cover: veoCover,
    quality: "Ultra",
    speed: "Very Slow",
    cinematicScore: 96,
    speedScore: 25,
    creditsPerSegment: 80,
    tags: ["Ultra HD", "Art Cinema", "Photoreal", "Camera Control"],
    gradient: "linear-gradient(135deg,#06b6d4,#3b82f6)",
    glow: "rgba(6,182,212,0.55)",
    available: false,
  },
  {
    id: "pika",
    name: "Pika",
    tagline: "Fast · Stylized · Social-ready",
    description:
      "Fast stylized AI video generation optimized for social content. Perfect for Reels, TikTok, Shorts, and kinetic motion graphics that need to ship same-day.",
    cover: pikaCover,
    quality: "Stylized",
    speed: "Fast",
    cinematicScore: 78,
    speedScore: 90,
    creditsPerSegment: 18,
    tags: ["Fast", "Stylized", "Social", "Reels"],
    gradient: "linear-gradient(135deg,#a855f7,#ec4899)",
    glow: "rgba(168,85,247,0.55)",
    available: false,
  },
  {
    id: "luma",
    name: "Luma",
    tagline: "Smooth cinematic motion · Immersive transitions",
    description:
      "Smooth cinematic motion and immersive scene transitions. Best for dreamlike sequences, music videos, and seamless 3D-feeling camera moves.",
    cover: lumaCover,
    quality: "Premium",
    speed: "Medium",
    cinematicScore: 88,
    speedScore: 68,
    creditsPerSegment: 32,
    tags: ["Smooth Motion", "Transitions", "Immersive", "3D Feel"],
    gradient: "linear-gradient(135deg,#8b5cf6,#06b6d4)",
    glow: "rgba(139,92,246,0.55)",
    available: true,
  },
];

export const AI_MODELS_BY_ID: Record<AiModelId, AiModel> = AI_MODELS.reduce(
  (acc, m) => { acc[m.id] = m; return acc; },
  {} as Record<AiModelId, AiModel>,
);

/** Default flagship model. */
export const DEFAULT_AI_MODEL_ID: AiModelId = "kling-3-omni";
