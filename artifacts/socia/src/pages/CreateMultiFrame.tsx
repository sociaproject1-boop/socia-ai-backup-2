/**
 * ████████████████████████████████████████████████████████████████
 * ██  AI FILM DIRECTOR STUDIO                                    ██
 * ██  Production-Grade · Director-Level · Cinematic Platform     ██
 * ██  Runway · Kling · Veo · Adobe Firefly · CapCut Pro Level   ██
 * ████████████████████████████████████████████████████████████████
 */

import {
  useCallback, useEffect, useRef, useState, memo, useMemo,
} from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence, Reorder, useDragControls } from "framer-motion";
import {
  ArrowLeft, Plus, X, Sparkles, AlertCircle, Crown, Lock,
  Loader2, Save, Play, Film, Settings2, Check, Layers,
  Clapperboard, Sliders, MoveHorizontal, Camera, Coins,
  Upload, Cpu, FileVideo, Download, History, Clock,
  RefreshCw, Trash2, Copy, GripVertical, ImageIcon,
  Pause, Maximize2, Volume2, VolumeX, Mic,
  MessageSquare, Star, Music, User, Shirt, TreePine, Sun,
  Eye, Wind, MonitorPlay, PanelLeft, PanelRight,
  Theater, Zap, Grid, ChevronDown, Heart, Radio,
  SkipBack, SkipForward, Circle, Crosshair, MousePointer, Wand2,
  BellRing, AlertTriangle, Filter, RotateCcw, ChevronRight,
} from "lucide-react";
import React from "react";
import { useAppStore } from "@/lib/store";
import type { GenResult } from "@/lib/ai";
import { submitRenderJob, useRenderJob, saveProject, type FrameVoiceTrack } from "@/lib/useRenderJob";
import { saveToDevice } from "@/lib/download";
import VoicePreview from "@/components/studio/VoicePreview";
import { supabase } from "@/lib/supabase";
import { VideoPlayerModal } from "@/components/ui/VideoPlayerModal";
import { useBillingStore } from "@/lib/billing";
import { VerticalStoryboard } from "@/components/studio/VerticalStoryboard";
import { ModelSelectorModal } from "@/components/models/ModelSelectorModal";
import { useStudioModelStore, type StudioModelId } from "@/store/modelStore";
import type { AiModelId } from "@/data/aiModels";
import klingOmniCover from "@assets/image-8_1779541488524.jpg";
import runwayCover    from "@assets/model-covers/runway-gen4.png";
import veoCover       from "@assets/model-covers/veo.png";
import pikaCover      from "@assets/model-covers/pika.png";
import lumaCover      from "@assets/model-covers/luma.png";

/* Cover images per model id (null = use gradient fallback).
   These also power the model pill in the studio header. */
const MODEL_COVERS: Partial<Record<RenderEngineId, string>> = {
  "kling-3-omni": klingOmniCover,
  "runway-gen4":  runwayCover,
  "veo-ultra":    veoCover,
  "pika":         pikaCover,
  "luma":         lumaCover,
};
/* Per-model badges shown on each cinematic card */
const MODEL_BADGES: Partial<Record<RenderEngineId, string[]>> = {
  "kling-3-omni":   ["Cinema Grade", "Lip Sync", "Multi-Shot", "Pro Storytelling"],
  "kling-cinematic":["Smooth Motion", "Film Look"],
  "kling-standard": ["Fast", "Balanced"],
  "runway-gen4":    ["Hollywood", "Commercial"],
  "veo-ultra":      ["Ultra HD", "Art Cinema"],
  "pika":           ["Fast", "Stylized", "Social"],
  "luma":           ["Smooth Motion", "Immersive"],
  "anime-motion":   ["Anime", "Stylized"],
  "hyper-real":     ["Editorial", "Photoreal"],
};

/* ═══════════════════════════════════════════════════════════════════
   DESIGN TOKENS
═══════════════════════════════════════════════════════════════════ */
const BG_DEEP     = "#05000f";
const BG_MID      = "#080012";
const GLASS       = "rgba(255,255,255,0.04)";
const GLASS_HEAVY = "rgba(255,255,255,0.07)";
const BORDER      = "rgba(255,255,255,0.08)";
const BORDER_MID  = "rgba(255,255,255,0.12)";
const ACCENT_GRAD = "linear-gradient(135deg,#7c3aed,#ec4899,#3b82f6)";
const GOLD_GRAD   = "linear-gradient(135deg,#f59e0b,#fbbf24,#f97316)";
const GLOW_PURPLE = "rgba(139,92,246,0.5)";
const GLOW_PINK   = "rgba(236,72,153,0.5)";
const GLOW_GOLD   = "rgba(245,158,11,0.5)";

/* ═══════════════════════════════════════════════════════════════════
   TYPES
═══════════════════════════════════════════════════════════════════ */
type RenderEngineId  = "kling-3-omni"|"kling-standard"|"kling-cinematic"|"runway-gen3"|"runway-gen4"|"veo-ultra"|"pika"|"luma"|"anime-motion"|"hyper-real";
type TransitionType  = "fade"|"dissolve"|"zoom"|"flash"|"warp"|"slide-left"|"slide-right"|"cinematic-blur"|"glitch"|"anime-cut"|"film-burn"|"speed-ramp";
type CameraMove      = "static"|"dolly-in"|"dolly-out"|"orbit"|"pan-left"|"pan-right"|"tilt-up"|"tilt-down"|"handheld"|"drone-shot"|"cinematic-push"|"crash-zoom"|"tracking-shot"|"shoulder-cam";
type MotionStrength  = "subtle"|"balanced"|"strong"|"extreme";
type AspectRatio     = "9:16"|"16:9"|"1:1"|"4:5"|"3:4"|"21:9";
type GlobalStyle     = "cinematic"|"hyperreal"|"anime"|"documentary"|"noir"|"dreamlike";
type ExportQuality   = "720p"|"1080p"|"2k"|"4k";
type ExportFormat    = "mp4"|"mov";
type VoiceType       = "cinematic-male"|"soft-female"|"emotional-female"|"deep-narrator"|"documentary"|"anime-girl"|"anime-boy"|"villain"|"horror-whisper"|"child"|"robotic"|"cyberpunk-ai"|"calm-mentor"|"dramatic-trailer";
type EmotionType     = "calm"|"romantic"|"angry"|"sad"|"fear"|"inspirational"|"serious"|"happy"|"tense"|"emotional"|"mysterious"|"aggressive";
type SubtitleStyle   = "minimal"|"bold"|"glow"|"cinematic"|"typewriter"|"handwritten";
type AmbientSound    = "none"|"epic-score"|"ambient-drone"|"rain"|"wind"|"crowd-roar"|"nature"|"ocean-waves"|"city-night"|"horror-tension"|"romance-strings"|"fire"|"thunder"|"scifi-hum"|"silence";
type ColorGrade      = "none"|"teal-orange"|"noir"|"cyberpunk"|"warm-cinema"|"dreamy"|"documentary"|"horror"|"anime"|"vintage"|"blockbuster";
type FacialBehavior  = "none"|"turn-head"|"look-camera"|"blink"|"smile"|"cry"|"shock"|"laugh"|"whisper"|"yell"|"look-away"|"nodding";
type BeatEffect      = "none"|"camera-shake"|"zoom-punch"|"flash"|"vignette"|"blur"|"chromatic"|"slow-mo"|"speed-ramp"|"film-burn"|"glitch"|"lens-flare";
type BeatType        = "establish"|"action"|"dialogue"|"reveal"|"climax"|"pause"|"dream"|"flashback";
type FpsOption       = 24|30|60;
type MobileView      = "scenes"|"preview"|"director"|"settings";

interface RenderEngine {
  id: RenderEngineId; name: string; tagline: string; quality: string;
  speed: string; speedScore: number;
  creditsPerSeg: number; creditLabel: "Low"|"Medium"|"High"|"Extreme";
  bestFor: string; available: boolean; gradient: string; glow: string;
  cinematicRating: number;
  gpuIntensity: "Light"|"Medium"|"Heavy"|"Extreme";
  realism: number;
}
interface SceneBeat {
  id: string; label: string;
  startSec: number; endSec: number;
  cameraMove: CameraMove; motionStrength: MotionStrength;
  facialBehavior: FacialBehavior; effect: BeatEffect;
  dialogueTiming: "none"|"start"|"mid"|"end";
}
interface StudioFrame {
  id: string; imageUrl: string|null; uploading: boolean; uploadError?: string;
  /* Scene basics */
  title: string; durationSec: number;
  /* Directing */
  directorInstructions: string; dialogue: string;
  characterVoice: VoiceType; emotion: EmotionType; beatType: BeatType;
  /* Camera */
  cameraMove: CameraMove; motionStrength: MotionStrength;
  /* Transition */
  transition: TransitionType; transDuration: number;
  /* Prompt */
  promptOverride: string;
  /* Color Grade */
  colorGrade: ColorGrade;
  /* Beat Timeline */
  beats: SceneBeat[];
  /* Audio */
  ambientSound: AmbientSound;
  dialogueVolume: number; soundtrackVolume: number; ambientVolume: number;
  fadeIn: number; fadeOut: number; cinematicDucking: boolean;
  /* Subtitles */
  subtitlesEnabled: boolean; subtitleStyle: SubtitleStyle;
  subtitlePosition: "top"|"middle"|"bottom";
  /* Continuity */
  keepFace: boolean; keepOutfit: boolean; keepHairstyle: boolean;
  keepEnvironment: boolean; keepLighting: boolean; keepCinematicTone: boolean;
}
interface GlobalCfg {
  aspect: AspectRatio; fps: FpsOption; globalStyle: GlobalStyle;
  defaultTransition: TransitionType; defaultDuration: number;
  globalPrompt: string; renderEngine: RenderEngineId;
  exportQuality: ExportQuality; exportFormat: ExportFormat;
  soundtrackType: AmbientSound;
}
interface RenderHistoryEntry {
  id: string; timestamp: number; engine: string; aspect: AspectRatio;
  frameCount: number; segmentCount: number; quality: ExportQuality;
  format: ExportFormat; videoUrl: string; thumbnailUrl: string; durationSec: number;
  status: "success"|"failed"|"cancelled";
  errorMessage?: string; projectTitle?: string;
  creditsUsed?: number;
}
interface DraftData { cfg: GlobalCfg; frames: StudioFrame[]; savedAt: number; projectTitle: string }

/* ═══════════════════════════════════════════════════════════════════
   CONSTANTS
═══════════════════════════════════════════════════════════════════ */
const MIN_FRAMES = 2, MAX_FRAMES = 10, MIN_DUR = 2, MAX_DUR = 30;
const LS_DRAFT   = "socia_studio_draft_v4";
const LS_HISTORY = "socia_studio_history_v4";

const ENGINES: RenderEngine[] = [
  { id:"kling-3-omni",    name:"Kling 3.0 Omni",  tagline:"Cinema Grade AI · Perfect Lip Sync · Pro Storytelling", quality:"Cinema", speed:"Medium",speedScore:70, creditsPerSeg:40, creditLabel:"High", bestFor:"Cinematic Films · Lip Sync · Multi-Shot", available:true,  gradient:"linear-gradient(135deg,#b026ff,#ec4899)", glow:"rgba(176,38,255,0.6)",  cinematicRating:10,gpuIntensity:"Heavy",   realism:95 },
  { id:"kling-standard",  name:"Kling Standard",  tagline:"Fast, balanced. Reels & TikTok ready.",    quality:"Balanced", speed:"Fast",      speedScore:85, creditsPerSeg:20, creditLabel:"Low",     bestFor:"Reels · TikTok · Stories", available:true,  gradient:"linear-gradient(135deg,#3b82f6,#6366f1)", glow:"rgba(99,102,241,0.5)",  cinematicRating:7, gpuIntensity:"Light",   realism:72 },
  { id:"kling-cinematic", name:"Kling Cinematic", tagline:"Smooth camera physics. Film-like motion.",  quality:"High",     speed:"Medium",    speedScore:65, creditsPerSeg:30, creditLabel:"Medium",  bestFor:"Music · Brand Films",      available:true,  gradient:"linear-gradient(135deg,#6366f1,#a855f7)", glow:"rgba(168,85,247,0.5)",  cinematicRating:9, gpuIntensity:"Medium",  realism:86 },
  { id:"runway-gen3",     name:"Runway Gen-3",    tagline:"Fast cinematic motion. Turbo image-to-video.", quality:"High",  speed:"Medium",   speedScore:60, creditsPerSeg:35, creditLabel:"Medium",  bestFor:"Reels · Hooks · Quick Cinematic", available:false, gradient:"linear-gradient(135deg,#f97316,#ec4899)", glow:"rgba(249,115,22,0.5)", cinematicRating:8, gpuIntensity:"Medium",  realism:86 },
  { id:"runway-gen4",     name:"Runway Gen-4",    tagline:"Hollywood-grade. Commercial realism.",      quality:"Premium",  speed:"Slow",      speedScore:45, creditsPerSeg:50, creditLabel:"High",    bestFor:"Ads · Product Films",      available:false, gradient:"linear-gradient(135deg,#ec4899,#f43f5e)", glow:"rgba(236,72,153,0.5)",  cinematicRating:9, gpuIntensity:"Heavy",   realism:92 },
  { id:"veo-ultra",       name:"Veo",              tagline:"Ultra-realistic motion. Cinematic camera control.", quality:"Ultra", speed:"Very Slow", speedScore:25, creditsPerSeg:80, creditLabel:"Extreme", bestFor:"Short Films · Art Cinema", available:false, gradient:"linear-gradient(135deg,#06b6d4,#3b82f6)", glow:"rgba(6,182,212,0.55)",  cinematicRating:10,gpuIntensity:"Extreme",  realism:97 },
  { id:"pika",            name:"Pika",            tagline:"Fast stylized AI video. Social-ready.",     quality:"Stylized", speed:"Fast",      speedScore:90, creditsPerSeg:18, creditLabel:"Low",     bestFor:"Reels · TikTok · Shorts",  available:false, gradient:"linear-gradient(135deg,#a855f7,#ec4899)", glow:"rgba(168,85,247,0.55)", cinematicRating:8, gpuIntensity:"Light",   realism:74 },
  { id:"luma",            name:"Luma",            tagline:"Smooth cinematic motion. Immersive transitions.",   quality:"High", speed:"Medium",    speedScore:68, creditsPerSeg:32, creditLabel:"Medium",  bestFor:"Music · Dreamlike · 3D",   available:true,  gradient:"linear-gradient(135deg,#8b5cf6,#06b6d4)", glow:"rgba(139,92,246,0.55)", cinematicRating:9, gpuIntensity:"Medium",  realism:86 },
  { id:"anime-motion",    name:"Anime Motion",    tagline:"Stylized anime & manga movement.",          quality:"Stylized", speed:"Medium",    speedScore:60, creditsPerSeg:25, creditLabel:"Medium",  bestFor:"Anime · Webtoon · Manga",  available:false, gradient:"linear-gradient(135deg,#22d3ee,#3b82f6)", glow:"rgba(6,182,212,0.5)",   cinematicRating:8, gpuIntensity:"Medium",  realism:65 },
  { id:"hyper-real",      name:"Hyper Real",      tagline:"Ultra-realistic humans, skin, fashion.",    quality:"Editorial",speed:"Slow",      speedScore:40, creditsPerSeg:45, creditLabel:"High",    bestFor:"Fashion · Portrait · Beauty",available:false, gradient:"linear-gradient(135deg,#10b981,#06b6d4)", glow:"rgba(16,185,129,0.5)",  cinematicRating:8, gpuIntensity:"Heavy",   realism:94 },
];
const PIPELINE_STAGES: {label:string;icon:typeof Upload;weight:number;detail:string}[] = [
  {label:"Uploading Assets",          icon:Upload,    weight:0.07, detail:"Preparing scene images for rendering"},
  {label:"Building Cinematic Prompts",icon:Theater,   weight:0.10, detail:"Translating director instructions to AI"},
  {label:"AI Motion Rendering",       icon:Cpu,       weight:0.45, detail:"Generating inter-frame motion with AI"},
  {label:"Dialogue Synthesis",        icon:Mic,       weight:0.10, detail:"Synchronizing voice and lip movement"},
  {label:"Scene Blending",            icon:Layers,    weight:0.10, detail:"Merging scenes with transitions"},
  {label:"Color Grading",             icon:Wand2,     weight:0.08, detail:"Applying cinematic color grade"},
  {label:"Encoding Final Film",       icon:FileVideo, weight:0.07, detail:"Encoding to H.265 for export"},
  {label:"Export Ready",              icon:Sparkles,  weight:0.03, detail:"Your film is ready"},
];
/* Clean monochrome glyph icons only — no emoji. The transition system
   reads `label` for display; the `icon` is a subtle accent character. */
const TRANSITIONS: {v:TransitionType;label:string;icon:string}[] = [
  {v:"fade",          label:"Fade",         icon:"◑"}, {v:"dissolve",     label:"Dissolve",    icon:"⬡"},
  {v:"zoom",          label:"Zoom In",      icon:"⊕"}, {v:"flash",        label:"Flash",       icon:"◈"},
  {v:"warp",          label:"Warp",         icon:"⟐"}, {v:"slide-left",   label:"Slide ←",    icon:"←"},
  {v:"slide-right",   label:"Slide →",     icon:"→"}, {v:"cinematic-blur",label:"Cine Blur",  icon:"◎"},
  {v:"glitch",        label:"Glitch",       icon:"▤"}, {v:"anime-cut",    label:"Anime Cut",  icon:"◇"},
  {v:"film-burn",     label:"Film Burn",    icon:"◆"}, {v:"speed-ramp",  label:"Speed Ramp", icon:"⇉"},
];
const CAMERAS: {v:CameraMove;label:string;icon:string;preview:string}[] = [
  {v:"static",        label:"Static",       icon:"⬜", preview:"○ fixed point"},
  {v:"dolly-in",      label:"Dolly In",     icon:"▶", preview:"→ push forward"},
  {v:"dolly-out",     label:"Dolly Out",    icon:"◀", preview:"← pull back"},
  {v:"orbit",         label:"Orbit",        icon:"↻", preview:"↻ circle around"},
  {v:"pan-left",      label:"Pan ←",        icon:"←", preview:"← sweep left"},
  {v:"pan-right",     label:"Pan →",        icon:"→", preview:"→ sweep right"},
  {v:"tilt-up",       label:"Tilt Up",      icon:"↑", preview:"↑ rise up"},
  {v:"tilt-down",     label:"Tilt Down",    icon:"↓", preview:"↓ lower down"},
  {v:"handheld",      label:"Handheld",     icon:"〜", preview:"〜 organic shake"},
  {v:"drone-shot",    label:"Drone",        icon:"✦", preview:"✦ aerial float"},
  {v:"cinematic-push",label:"Cine Push",    icon:"▷", preview:"▷ slow glide"},
  {v:"crash-zoom",    label:"Crash Zoom",   icon:"⇉", preview:"⇉ snap snap zoom"},
  {v:"tracking-shot", label:"Tracking",     icon:"⇶", preview:"⇶ follow subject"},
  {v:"shoulder-cam",  label:"Shoulder",     icon:"◉", preview:"◉ POV follow"},
];
const MOTION_LEVELS: {v:MotionStrength;label:string;desc:string;color:string}[] = [
  {v:"subtle",   label:"Subtle",   desc:"Barely-there",     color:"rgba(99,102,241,0.7)"},
  {v:"balanced", label:"Balanced", desc:"Natural feel",     color:"rgba(168,85,247,0.7)"},
  {v:"strong",   label:"Strong",   desc:"Dynamic energy",   color:"rgba(236,72,153,0.7)"},
  {v:"extreme",  label:"Extreme",  desc:"Full kinetic",     color:"rgba(239,68,68,0.7)"},
];
/* Professional cinematic mood chips — no emoji. The colored accent dot
   (driven by `color`) replaces the emoji visually; consumers should
   render a small swatch + label, not the emoji string. The `emoji`
   field is kept empty for backward compatibility with existing JSX. */
const EMOTIONS: {v:EmotionType;label:string;emoji:string;color:string;desc:string}[] = [
  {v:"calm",          label:"Calm",          emoji:"", color:"#06b6d4", desc:"Peaceful, still, breathing"},
  {v:"romantic",      label:"Romantic",      emoji:"", color:"#ec4899", desc:"Warm, tender, intimate"},
  {v:"angry",         label:"Angry",         emoji:"", color:"#dc2626", desc:"Intense, fierce, confrontational"},
  {v:"sad",           label:"Sad",           emoji:"", color:"#6366f1", desc:"Sorrowful, heavy, tearful"},
  {v:"fear",          label:"Fear",          emoji:"", color:"#7c3aed", desc:"Dread, anxiety, suspense"},
  {v:"inspirational", label:"Inspirational", emoji:"", color:"#f59e0b", desc:"Uplifting, powerful, hopeful"},
  {v:"serious",       label:"Serious",       emoji:"", color:"#64748b", desc:"Focused, grave, weighty"},
  {v:"happy",         label:"Happy",         emoji:"", color:"#22d3ee", desc:"Joy, light, celebratory"},
  {v:"tense",         label:"Tense",         emoji:"", color:"#ef4444", desc:"Edge-of-seat, high stakes"},
  {v:"emotional",     label:"Emotional",     emoji:"", color:"#a855f7", desc:"Deep feeling, vulnerable"},
  {v:"mysterious",    label:"Mysterious",    emoji:"", color:"#8b5cf6", desc:"Enigmatic, dark, unknown"},
  {v:"aggressive",    label:"Aggressive",    emoji:"", color:"#f43f5e", desc:"Bold, forceful, kinetic"},
];
const BEATS: {v:BeatType;label:string;color:string}[] = [
  {v:"establish",  label:"Establish",  color:"#3b82f6"},
  {v:"action",     label:"Action",     color:"#ef4444"},
  {v:"dialogue",   label:"Dialogue",   color:"#22d3ee"},
  {v:"reveal",     label:"Reveal",     color:"#a855f7"},
  {v:"climax",     label:"Climax",     color:"#f59e0b"},
  {v:"pause",      label:"Pause",      color:"#6b7280"},
  {v:"dream",      label:"Dream",      color:"#6366f1"},
  {v:"flashback",  label:"Flashback",  color:"#b45309"},
];
/* Professional voice catalog — emoji icons removed in favor of a
   typography-first chip. `icon` left as empty string so existing JSX
   that interpolates it stays valid. */
const VOICES: {v:VoiceType;label:string;icon:string;tone:string;style:string;langs:string}[] = [
  {v:"cinematic-male",     label:"Cinematic Male",      icon:"", tone:"Rich baritone",     style:"Movie trailer, drama",    langs:"EN · ES · FR"},
  {v:"soft-female",        label:"Soft Female",         icon:"", tone:"Gentle soprano",    style:"Narration, romance",      langs:"EN · JP · KO"},
  {v:"emotional-female",   label:"Emotional Female",    icon:"", tone:"Expressive alto",   style:"Drama, emotional scenes", langs:"EN · ES · IT"},
  {v:"deep-narrator",      label:"Deep Narrator",       icon:"", tone:"Deep authoritative",style:"Documentary, epic",       langs:"EN · DE · FR"},
  {v:"documentary",        label:"Documentary",         icon:"", tone:"Measured neutral",  style:"Factual, journalistic",   langs:"EN · FR · ES"},
  {v:"anime-girl",         label:"Anime Girl",          icon:"", tone:"Bright energetic",  style:"Anime, J-drama",          langs:"JP · EN · KO"},
  {v:"anime-boy",          label:"Anime Boy",           icon:"", tone:"Young spirited",    style:"Shonen, action anime",    langs:"JP · EN · KO"},
  {v:"villain",            label:"Villain",             icon:"", tone:"Cold sinister",     style:"Horror, thriller",        langs:"EN · DE · RU"},
  {v:"horror-whisper",     label:"Horror Whisper",      icon:"", tone:"Breathy haunting",  style:"Horror, suspense",        langs:"EN · FR · ES"},
  {v:"child",              label:"Child Voice",         icon:"", tone:"Innocent young",    style:"Family, heartwarming",    langs:"EN · ES · FR"},
  {v:"robotic",            label:"Robotic",             icon:"", tone:"Synthetic processed",style:"Sci-fi, tech",          langs:"EN · JP"},
  {v:"cyberpunk-ai",       label:"Cyberpunk AI",        icon:"", tone:"Glitchy digital",   style:"Sci-fi, cyberpunk",       langs:"EN · JP · KO"},
  {v:"calm-mentor",        label:"Calm Mentor",         icon:"", tone:"Warm wise",         style:"Motivational, spiritual", langs:"EN · ES · FR"},
  {v:"dramatic-trailer",   label:"Dramatic Trailer",    icon:"", tone:"Thunderous epic",   style:"Movie trailers, hype",    langs:"EN · ES"},
];
/* Ambient sound chips — emoji removed. */
const AMBIENTS: {v:AmbientSound;label:string;icon:string}[] = [
  {v:"none",            label:"None",        icon:""},
  {v:"silence",         label:"Silence",     icon:""},
  {v:"epic-score",      label:"Epic Score",  icon:""},
  {v:"ambient-drone",   label:"Ambient",     icon:""},
  {v:"rain",            label:"Rain",        icon:""},
  {v:"wind",            label:"Wind",        icon:""},
  {v:"crowd-roar",      label:"Crowd",       icon:""},
  {v:"nature",          label:"Forest",      icon:""},
  {v:"ocean-waves",     label:"Ocean",       icon:""},
  {v:"city-night",      label:"City Noise",  icon:""},
  {v:"horror-tension",  label:"Horror Atm",  icon:""},
  {v:"romance-strings", label:"Romance",     icon:""},
  {v:"fire",            label:"Fire",        icon:""},
  {v:"thunder",         label:"Thunder",     icon:""},
  {v:"scifi-hum",       label:"Sci-Fi Hum",  icon:""},
];
/* Color grade chips — geometric glyphs only, no emoji. */
const COLOR_GRADES: {v:ColorGrade;label:string;desc:string;icon:string;css:string}[] = [
  {v:"none",        label:"None",         desc:"No grade applied",           icon:"○", css:"none"},
  {v:"teal-orange", label:"Teal & Orange",desc:"Hollywood blockbuster look",  icon:"◐", css:"hue-rotate(5deg) saturate(1.3) contrast(1.1)"},
  {v:"noir",        label:"Noir",         desc:"High-contrast B&W shadows",   icon:"◼", css:"grayscale(0.7) contrast(1.4) brightness(0.9)"},
  {v:"cyberpunk",   label:"Cyberpunk",    desc:"Neon purple-pink-blue",       icon:"◈", css:"hue-rotate(270deg) saturate(1.6) contrast(1.2)"},
  {v:"warm-cinema", label:"Warm Cinema",  desc:"Golden warm film tones",      icon:"◑", css:"sepia(0.3) saturate(1.2) brightness(1.05)"},
  {v:"dreamy",      label:"Dreamy",       desc:"Soft pastel ethereal",        icon:"◇", css:"brightness(1.1) saturate(0.8) blur(0.3px)"},
  {v:"documentary", label:"Documentary",  desc:"Desaturated natural tones",   icon:"▤", css:"saturate(0.7) contrast(0.95) brightness(1.02)"},
  {v:"horror",      label:"Horror",       desc:"Deep shadows, muted color",   icon:"▣", css:"saturate(0.4) contrast(1.5) brightness(0.75)"},
  {v:"anime",       label:"Anime",        desc:"Vivid saturated illustration", icon:"◆", css:"saturate(1.8) contrast(1.1) brightness(1.08)"},
  {v:"vintage",     label:"Vintage Film", desc:"Warm sepia grain",            icon:"▥", css:"sepia(0.6) contrast(0.9) brightness(0.95)"},
  {v:"blockbuster", label:"Blockbuster",  desc:"Punchy cinematic colors",     icon:"★", css:"saturate(1.4) contrast(1.15) brightness(1.0)"},
];
/* Facial behavior cues — geometric glyph icons only. */
const FACIAL_BEHAVIORS: {v:FacialBehavior;label:string;icon:string}[] = [
  {v:"none",        label:"None",         icon:"○"},
  {v:"turn-head",   label:"Turn Head",    icon:"↪"},
  {v:"look-camera", label:"Look at Cam",  icon:"◉"},
  {v:"look-away",   label:"Look Away",    icon:"◎"},
  {v:"blink",       label:"Blink",        icon:"━"},
  {v:"smile",       label:"Smile",        icon:"◡"},
  {v:"cry",         label:"Cry",          icon:"◠"},
  {v:"shock",       label:"Shock",        icon:"◇"},
  {v:"laugh",       label:"Laugh",        icon:"◠"},
  {v:"whisper",     label:"Whisper",      icon:"⋯"},
  {v:"yell",        label:"Yell",         icon:"◢"},
  {v:"nodding",     label:"Nodding",      icon:"↕"},
];
/* Beat effects — monochrome geometric glyphs, no emoji. */
const BEAT_EFFECTS: {v:BeatEffect;label:string;icon:string;color:string}[] = [
  {v:"none",         label:"None",         icon:"○", color:"#6b7280"},
  {v:"camera-shake", label:"Shake",        icon:"〜", color:"#ef4444"},
  {v:"zoom-punch",   label:"Zoom Punch",   icon:"⊕", color:"#f59e0b"},
  {v:"flash",        label:"Flash",        icon:"◈", color:"#fbbf24"},
  {v:"vignette",     label:"Vignette",     icon:"◎", color:"#6366f1"},
  {v:"blur",         label:"Blur",         icon:"◌", color:"#06b6d4"},
  {v:"chromatic",    label:"Chromatic",    icon:"⬛", color:"#ec4899"},
  {v:"slow-mo",      label:"Slow Mo",      icon:"◷", color:"#3b82f6"},
  {v:"speed-ramp",   label:"Speed Ramp",   icon:"⇉", color:"#f43f5e"},
  {v:"film-burn",    label:"Film Burn",    icon:"◆", color:"#f97316"},
  {v:"glitch",       label:"Glitch",       icon:"▤", color:"#a855f7"},
  {v:"lens-flare",   label:"Lens Flare",   icon:"✦", color:"#fde68a"},
];
const ASPECTS: {v:AspectRatio;label:string;sub:string;wr:number;hr:number}[] = [
  {v:"9:16", label:"9:16",  sub:"Portrait",   wr:9,  hr:16},
  {v:"16:9", label:"16:9",  sub:"Landscape",  wr:16, hr:9},
  {v:"1:1",  label:"1:1",   sub:"Square",     wr:1,  hr:1},
  {v:"4:5",  label:"4:5",   sub:"Instagram",  wr:4,  hr:5},
  {v:"3:4",  label:"3:4",   sub:"Classic",    wr:3,  hr:4},
  {v:"21:9", label:"21:9",  sub:"Ultrawide",  wr:21, hr:9},
];
const STYLES: {v:GlobalStyle;label:string;emoji:string;desc:string}[] = [
  {v:"cinematic",   label:"Cinematic",    emoji:"", desc:"Anamorphic film look"},
  {v:"hyperreal",   label:"Hyperreal",    emoji:"", desc:"8K photorealistic"},
  {v:"anime",       label:"Anime",        emoji:"", desc:"Vibrant animated"},
  {v:"documentary", label:"Documentary",  emoji:"", desc:"Authentic realism"},
  {v:"noir",        label:"Noir",         emoji:"", desc:"Moody shadows"},
  {v:"dreamlike",   label:"Dreamlike",    emoji:"", desc:"Ethereal atmosphere"},
];
const EXPORT_QUALITIES: {v:ExportQuality;label:string;desc:string}[] = [
  {v:"720p",  label:"720p",  desc:"HD"},
  {v:"1080p", label:"1080p", desc:"FHD"},
  {v:"2k",    label:"2K",    desc:"QHD"},
  {v:"4k",    label:"4K",    desc:"UHD"},
];
const CREDIT_COLOR: Record<RenderEngine["creditLabel"],string> = {
  Low:"#22d3ee", Medium:"#a78bfa", High:"#f59e0b", Extreme:"#ef4444",
};
const DEFAULT_CFG: GlobalCfg = {
  aspect:"9:16", fps:24, globalStyle:"cinematic", defaultTransition:"fade",
  defaultDuration:5, globalPrompt:"", renderEngine:"kling-3-omni",
  exportQuality:"1080p", exportFormat:"mp4", soundtrackType:"none",
};

/* ═══════════════════════════════════════════════════════════════════
   HELPERS
═══════════════════════════════════════════════════════════════════ */
const mkBeat = (startSec: number, endSec: number, label = "New Beat"): SceneBeat => ({
  id: Math.random().toString(36).slice(2),
  label, startSec, endSec,
  cameraMove: "static", motionStrength: "balanced",
  facialBehavior: "none", effect: "none", dialogueTiming: "none",
});
const mkFrame = (cfg: Pick<GlobalCfg,"defaultTransition"|"defaultDuration">): StudioFrame => ({
  id: Math.random().toString(36).slice(2),
  imageUrl: null, uploading: false,
  title: "", durationSec: cfg.defaultDuration, transDuration: 0.8,
  transition: cfg.defaultTransition, motionStrength: "balanced",
  promptOverride: "", cameraMove: "static",
  colorGrade: "none", beats: [],
  directorInstructions: "", dialogue: "",
  characterVoice: "cinematic-male", emotion: "calm", beatType: "establish",
  ambientSound: "none",
  dialogueVolume: 80, soundtrackVolume: 60, ambientVolume: 40,
  fadeIn: 0, fadeOut: 0, cinematicDucking: true,
  subtitlesEnabled: false, subtitleStyle: "cinematic", subtitlePosition: "bottom",
  keepFace: false, keepOutfit: false, keepHairstyle: false,
  keepEnvironment: false, keepLighting: false, keepCinematicTone: false,
});

const normalizeFrame = (f: Partial<StudioFrame>): StudioFrame => ({ ...mkFrame(DEFAULT_CFG), ...f });

function buildSegmentPrompt(f: StudioFrame, cfg: GlobalCfg): string {
  const mMap: Record<MotionStrength,string> = {
    subtle:"subtle minimal motion", balanced:"moderate natural movement",
    strong:"dynamic high-energy motion", extreme:"extreme intense kinetic motion",
  };
  const camMap: Record<CameraMove,string> = {
    static:"static locked camera","dolly-in":"dolly push-in","dolly-out":"dolly pull-out",
    orbit:"orbiting arc","pan-left":"pan left","pan-right":"pan right","tilt-up":"tilt up",
    "tilt-down":"tilt down",handheld:"handheld naturalistic","drone-shot":"aerial drone shot",
    "cinematic-push":"cinematic push","crash-zoom":"crash zoom snap","tracking-shot":"tracking shot following subject",
    "shoulder-cam":"shoulder-mounted POV camera",
  };
  const styleMap: Record<GlobalStyle,string> = {
    cinematic:"cinematic anamorphic film look with depth of field",
    hyperreal:"hyper-realistic 8K photographic detail",
    anime:"vibrant anime illustration style with smooth animation",
    documentary:"authentic documentary realism, natural lighting",
    noir:"film noir, moody deep shadows, high contrast",
    dreamlike:"ethereal dreamlike atmosphere, soft light, surreal",
  };
  const emotionMap: Record<EmotionType,string> = {
    calm:"peaceful serene calm atmosphere, gentle breathing, stillness",
    romantic:"romantic warm tender mood, soft intimate lighting",
    angry:"intense fierce anger, confrontational energy, tense muscles",
    sad:"sorrowful melancholic sadness, tearful expressions, heavy atmosphere",
    fear:"dread and anxiety, suspenseful horror, fearful expressions",
    inspirational:"uplifting hopeful energy, triumphant cinematic power",
    serious:"focused grave serious tone, weighty atmosphere",
    happy:"joyful celebratory happiness, bright warm energy",
    tense:"edge-of-seat tension, high stakes suspense, breathless pacing",
    emotional:"deep vulnerable emotion, heartfelt expressions, raw feeling",
    mysterious:"enigmatic mysterious dark atmosphere, unknown suspense",
    aggressive:"bold forceful aggressive kinetic energy, intense physicality",
  };
  const parts: string[] = [];
  const prompt = f.promptOverride.trim() || cfg.globalPrompt.trim();
  if (prompt) parts.push(prompt);
  if (f.directorInstructions.trim()) parts.push(`Director note: ${f.directorInstructions.trim()}`);
  if (f.dialogue.trim()) parts.push(`Voice: "${f.dialogue.trim()}"`);
  parts.push(styleMap[cfg.globalStyle]);
  parts.push(emotionMap[f.emotion]);
  parts.push(camMap[f.cameraMove]);
  parts.push(mMap[f.motionStrength]);
  parts.push(`${f.durationSec}s scene`);
  if (cfg.renderEngine === "kling-cinematic") parts.push("ultra-smooth cinematic motion, real camera physics");
  const cons: string[] = [];
  if (f.keepFace) cons.push("consistent character face");
  if (f.keepOutfit) cons.push("same outfit");
  if (f.keepHairstyle) cons.push("same hairstyle");
  if (f.keepEnvironment) cons.push("same environment");
  if (f.keepLighting) cons.push("same cinematic lighting");
  if (f.keepCinematicTone) cons.push("consistent cinematic tone and color palette");
  if (cons.length) parts.push(cons.join(", "));
  return parts.join(", ");
}

const LS_COOLDOWN  = "socia_studio_cooldown_v1";
/* Plan-aware render cooldown in seconds (free blocked by paywall, not needed here) */
const PLAN_COOLDOWN: Record<string,number> = { free:0, p15:8, p30:3 };
const PLAN_PRIORITY: Record<string,{label:string;color:string;rank:number}> = {
  free: {label:"No Access",   color:"rgba(255,255,255,0.25)", rank:3},
  p15:  {label:"Priority 2 — Pro",       color:"#6366f1", rank:2},
  p30:  {label:"Priority 1 — Ultimate",  color:"#a855f7", rank:1},
};
const saveCooldown  = () => { try { localStorage.setItem(LS_COOLDOWN, String(Date.now())); } catch {} };
const loadCooldown  = (): number => { try { return parseInt(localStorage.getItem(LS_COOLDOWN) ?? "0"); } catch { return 0; } };

const loadDraft    = (): DraftData|null => { try { const s = localStorage.getItem(LS_DRAFT); return s ? JSON.parse(s) : null; } catch { return null; } };
const saveDraft    = (d: DraftData)     => { try { localStorage.setItem(LS_DRAFT, JSON.stringify(d)); } catch {} };
const loadHistory  = (): RenderHistoryEntry[] => { try { const s = localStorage.getItem(LS_HISTORY); return s ? JSON.parse(s) : []; } catch { return []; } };
const appendHistory = (e: RenderHistoryEntry) => { try { const h = loadHistory(); h.unshift(e); localStorage.setItem(LS_HISTORY, JSON.stringify(h.slice(0,20))); } catch {} };
const removeHistEntry = (id: string) => { try { const h = loadHistory().filter(e => e.id !== id); localStorage.setItem(LS_HISTORY, JSON.stringify(h)); } catch {} };
const totalRuntime  = (frames: StudioFrame[]) => frames.reduce((a,f) => a + f.durationSec, 0);
const fmtTime       = (s: number) => s >= 60 ? `${Math.floor(s/60)}m ${s%60}s` : `${s}s`;
const estCredits    = (eid: RenderEngineId, segs: number) => (ENGINES.find(e => e.id === eid)?.creditsPerSeg ?? 20) * segs;

async function compressImage(file: File): Promise<Blob> {
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        const MAX = 900, scale = Math.min(1, MAX / Math.max(img.width, img.height));
        const w = Math.round(img.width*scale), h = Math.round(img.height*scale);
        const canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = h;
        canvas.getContext("2d")!.drawImage(img,0,0,w,h);
        canvas.toBlob(b => resolve(b ?? file), "image/jpeg", 0.85);
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  });
}

/* ═══════════════════════════════════════════════════════════════════
   CINEMATIC PAYWALL — full-screen premium modal
═══════════════════════════════════════════════════════════════════ */
function CinematicPaywall() {
  const [,navigate] = useLocation();
  const FEATURES = [
    {icon:Film,  label:"6 AI rendering engines",             sub:"Kling, Runway, Veo Ultra & more"},
    {icon:Layers,label:"Up to 10 cinematic scenes",          sub:"Full storyboard in one project"},
    {icon:Camera,label:"11 professional camera moves",       sub:"Dolly, orbit, drone, push & more"},
    {icon:Theater,label:"15 directing controls per scene",   sub:"Dialogue, emotion, beat, voice"},
    {icon:Sparkles,label:"4K HDR export",                    sub:"Cinema-grade resolution"},
    {icon:Sliders,label:"10 transition types",               sub:"Fade, warp, glitch, anime cut"},
    {icon:Mic,   label:"Character voice acting",             sub:"8 voice personas per scene"},
    {icon:Music, label:"Ambient sound design",               sub:"11 cinematic soundscapes"},
    {icon:RefreshCw,label:"Auto-save drafts",               sub:"Never lose your project"},
    {icon:History,label:"Full render history",              sub:"Re-download any past film"},
  ];
  return (
    <div className="flex min-h-full flex-col" style={{background:BG_DEEP}}>
      {/* Cinematic letterbox bars */}
      <div className="sticky top-0 z-10 h-8 w-full" style={{background:"linear-gradient(180deg,rgba(5,0,15,1),rgba(5,0,15,0))"}}/>

      {/* Hero */}
      <div className="relative flex flex-col items-center overflow-hidden px-6 pb-8 pt-2 text-center">
        {/* Ambient field */}
        <div className="pointer-events-none absolute inset-0">
          <div style={{background:"transparent",position:"absolute",inset:0}}/>
          {[{x:-80,y:60,s:260},{x:100,y:100,s:200},{x:20,y:220,s:150}].map((o,i)=>(
            <motion.div key={i} animate={{y:[0,-18,0],scale:[1,1.1,1]}} transition={{duration:5+i*1.5,repeat:Infinity,ease:"easeInOut"}}
              style={{position:"absolute",left:`calc(50% + ${o.x}px)`,top:o.y,width:o.s,height:o.s,background:"transparent",borderRadius:"50%"}}/>
          ))}
        </div>

        {/* Icon */}
        <motion.div initial={{scale:0.4,opacity:0}} animate={{scale:1,opacity:1}} transition={{type:"spring",stiffness:260,damping:22}}
          className="relative mb-5 mt-4 grid h-28 w-28 place-items-center rounded-[32px]"
          style={{background:ACCENT_GRAD,boxShadow:`0 0 80px -10px ${GLOW_PURPLE},0 0 160px -30px ${GLOW_PINK}`}}>
          <Clapperboard className="h-14 w-14 text-white"/>
          <motion.div animate={{rotate:360}} transition={{duration:20,repeat:Infinity,ease:"linear"}}
            className="absolute -inset-1 rounded-[36px]" style={{border:"1px dashed rgba(255,255,255,0.12)"}}/>
          <div className="absolute -right-2.5 -top-2.5 grid h-9 w-9 place-items-center rounded-full" style={{background:GOLD_GRAD,boxShadow:`0 0 20px ${GLOW_GOLD}`}}>
            <Crown className="h-4.5 w-4.5 text-black h-5 w-5"/>
          </div>
        </motion.div>

        <motion.p initial={{opacity:0}} animate={{opacity:1}} transition={{delay:0.1}}
          className="mb-2 rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-widest"
          style={{color:"rgba(245,158,11,0.8)",borderColor:"rgba(245,158,11,0.25)",background:"rgba(245,158,11,0.07)"}}>
          Unlock AI Cinematic Studio
        </motion.p>

        <motion.h1 initial={{opacity:0,y:16}} animate={{opacity:1,y:0}} transition={{delay:0.15}}
          className="font-display text-4xl font-black leading-none tracking-tight text-white">
          AI Film Director<br/>
          <span style={{backgroundImage:ACCENT_GRAD,WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>Studio</span>
        </motion.h1>
        <motion.p initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} transition={{delay:0.22}}
          className="mt-3 max-w-xs text-[14px] leading-relaxed text-white/50">
          The complete AI film creation platform. Runway-level quality, CapCut-level ease. Production-grade cinematic films from your photos.
        </motion.p>
      </div>

      {/* Engine previews */}
      <div className="mb-4 px-4">
        <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.12em] text-white/30">AI Rendering Engines</p>
        <div className="flex gap-2 overflow-x-auto pb-1 hide-scrollbar">
          {ENGINES.map((e,i) => (
            <motion.div key={e.id} initial={{opacity:0,x:20}} animate={{opacity:1,x:0}} transition={{delay:0.25+i*0.05}}
              className="flex shrink-0 flex-col overflow-hidden rounded-2xl border" style={{width:130,background:GLASS,borderColor:BORDER}}>
              <div className="h-1.5 w-full" style={{background:e.gradient}}/>
              <div className="flex flex-col gap-1 p-3">
                <p className="text-[12px] font-bold text-white">{e.name}</p>
                <p className="text-[9px] leading-tight text-white/40">{e.tagline}</p>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-[9px] text-white/25">{e.speed}</span>
                  {!e.available && <span className="rounded-full border border-white/15 px-1.5 py-px text-[8px] text-white/30">Soon</span>}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Feature list */}
      <div className="mx-4 mb-4 rounded-3xl p-5" style={{background:GLASS_HEAVY,border:`1px solid ${BORDER}`}}>
        <p className="mb-4 text-[10px] font-bold uppercase tracking-[0.12em] text-white/30">What you unlock</p>
        <div className="grid grid-cols-1 gap-3">
          {FEATURES.map(({icon:Icon,label,sub},i) => (
            <motion.div key={i} initial={{opacity:0,x:-8}} animate={{opacity:1,x:0}} transition={{delay:0.3+i*0.03}}
              className="flex items-center gap-3">
              <div className="grid h-8 w-8 shrink-0 place-items-center rounded-xl"
                style={{background:"linear-gradient(135deg,rgba(124,58,237,0.3),rgba(236,72,153,0.2))"}}>
                <Icon className="h-4 w-4 text-purple-300"/>
              </div>
              <div>
                <p className="text-[13px] font-semibold text-white">{label}</p>
                <p className="text-[11px] text-white/40">{sub}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Plan cards */}
      <div className="mx-4 mb-4 grid grid-cols-2 gap-3">
        <div className="overflow-hidden rounded-3xl" style={{background:GLASS,border:`1px solid ${BORDER}`}}>
          <div className="h-1" style={{background:"linear-gradient(90deg,#6366f1,#a855f7)"}}/>
          <div className="p-4 text-center">
            <p className="text-[11px] font-bold text-purple-300">Pro Plan</p>
            <p className="mt-2 font-display text-2xl font-black text-white">₱3,000<span className="text-xs font-normal text-white/35">/mo</span></p>
            <p className="mt-1 text-[10px] text-white/35">10 scenes · 1080p · All engines</p>
          </div>
        </div>
        <div className="overflow-hidden rounded-3xl" style={{background:"rgba(245,158,11,0.07)",border:"1px solid rgba(245,158,11,0.25)"}}>
          <div className="h-1" style={{background:GOLD_GRAD}}/>
          <div className="p-4 text-center">
            <p className="text-[11px] font-bold text-yellow-400">3T Ultimate</p>
            <p className="mt-2 font-display text-2xl font-black text-white">₱3,000<span className="text-xs font-normal text-yellow-500/50">/mo</span></p>
            <p className="mt-1 text-[10px] text-yellow-400/60">4K Ultra · Priority queue</p>
          </div>
        </div>
      </div>

      {/* CTAs */}
      <div className="flex flex-col gap-3 px-4 pb-16">
        <motion.button whileTap={{scale:0.97}} onClick={() => navigate("/billing/upgrade")}
          className="flex h-16 w-full items-center justify-center gap-3 rounded-3xl font-display text-[16px] font-black text-white"
          style={{background:ACCENT_GRAD,boxShadow:`0 16px 48px -10px ${GLOW_PURPLE}`}}>
          <Clapperboard className="h-6 w-6"/> Unlock AI Cinematic Studio
        </motion.button>
        <button onClick={() => navigate("/billing/upgrade")}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-3xl text-sm font-bold"
          style={{background:"rgba(245,158,11,0.1)",border:"1px solid rgba(245,158,11,0.3)",color:"rgba(251,191,36,0.9)"}}>
          <Crown className="h-4 w-4"/> 3T Ultimate · ₱3,000/mo
        </button>
        <p className="text-center text-[11px] text-white/20">GCash · Maya · Bank transfer · Manual review</p>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   SCENE CARD — premium filmstrip thumbnail
═══════════════════════════════════════════════════════════════════ */
const CARD_W = 112;
const CARD_H = 160;

const SceneCard = memo(function SceneCard({
  frame, index, isSelected, onSelect, onPickFile, onRemove, onDuplicate, total, uploadProgress,
}: {
  frame: StudioFrame; index: number; isSelected: boolean; total: number;
  uploadProgress?: number;
  onSelect: () => void; onPickFile: (f: File) => void;
  onRemove: () => void; onDuplicate: () => void;
}) {
  const inputRef  = useRef<HTMLInputElement>(null);
  const dragCtrl  = useDragControls();
  const emotion   = EMOTIONS.find(e => e.v === frame.emotion)!;
  const beat      = BEATS.find(b => b.v === frame.beatType)!;
  const camera    = CAMERAS.find(c => c.v === frame.cameraMove)!;

  return (
    <div className="flex shrink-0 flex-col items-center gap-2" style={{width: CARD_W + 12}}>
      <Reorder.Item value={frame} dragListener={false} dragControls={dragCtrl}
        style={{touchAction:"pan-y", width: CARD_W}}>
        <motion.div whileTap={{scale:0.97}} onClick={onSelect}
          className="relative cursor-pointer select-none overflow-hidden"
          style={{
            width: CARD_W, height: CARD_H,
            borderRadius: 16,
            background: frame.imageUrl ? "transparent" : "rgba(255,255,255,0.04)",
            border: isSelected ? "2px solid rgba(139,92,246,0.9)" : `1px solid ${BORDER}`,
            boxShadow: isSelected ? `0 0 28px -4px ${GLOW_PURPLE}, 0 0 52px -16px ${GLOW_PINK}` : "none",
            transition: "border 0.2s, box-shadow 0.2s",
          }}>

          {/* Thumbnail */}
          {frame.imageUrl ? (
            <img src={frame.imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover" loading="lazy"/>
          ) : frame.uploading ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-4"
              style={{background:"rgba(8,3,22,0.9)"}}>
              <Loader2 className="h-5 w-5 animate-spin text-purple-400 shrink-0"/>
              <div className="w-full flex flex-col gap-1.5">
                <div className="h-1.5 w-full overflow-hidden rounded-full" style={{background:"rgba(255,255,255,0.1)"}}>
                  {uploadProgress !== undefined ? (
                    <div className="h-full rounded-full transition-all duration-300"
                      style={{width:`${uploadProgress}%`,background:"linear-gradient(90deg,#7C3AED,#EC4899)"}}/>
                  ) : (
                    <motion.div className="h-full w-2/5 rounded-full"
                      style={{background:"linear-gradient(90deg,#7C3AED,#EC4899)"}}
                      animate={{x:["-100%","180%"]}} transition={{duration:1.4,repeat:Infinity,ease:"easeInOut"}}/>
                  )}
                </div>
                <p className="text-center text-[9px] font-semibold text-white/45">
                  {uploadProgress !== undefined ? `${uploadProgress}%` : "Uploading…"}
                </p>
              </div>
            </div>
          ) : (
            <button onClick={e => { e.stopPropagation(); inputRef.current?.click(); }}
              className="absolute inset-0 flex flex-col items-center justify-center gap-3 transition hover:bg-white/[0.05]">
              <div className="grid h-14 w-14 place-items-center rounded-2xl"
                style={{background:"rgba(139,92,246,0.14)",border:"1px dashed rgba(139,92,246,0.35)"}}>
                <ImageIcon className="h-7 w-7 text-purple-400"/>
              </div>
              <div className="flex flex-col items-center gap-0.5">
                <p className="text-[11px] font-bold text-white/60">Add Photo</p>
                <p className="text-[9px] text-white/25">Tap to upload</p>
              </div>
            </button>
          )}

          {/* Error — tap to retry */}
          {frame.uploadError && (
            <button onClick={e => { e.stopPropagation(); inputRef.current?.click(); }}
              className="absolute inset-0 flex flex-col items-center justify-center gap-1"
              style={{background:"rgba(80,0,0,0.95)"}}>
              <AlertCircle className="h-5 w-5 text-red-300"/>
              <span className="text-[9px] font-bold text-red-300">Tap to retry</span>
            </button>
          )}

          {/* Gradient overlay when has image */}
          {frame.imageUrl && (
            <div className="pointer-events-none absolute inset-0"
              style={{background:"linear-gradient(to bottom,rgba(0,0,0,0.5) 0%,transparent 35%,transparent 50%,rgba(0,0,0,0.8) 100%)"}}/>
          )}

          {/* Beat stripe at very top */}
          <div className="absolute left-0 right-0 top-0 h-[3px]" style={{background:beat.color}}/>

          {/* Scene number badge */}
          <div className="absolute left-2 top-3 grid h-5 w-5 place-items-center rounded-full text-[10px] font-black"
            style={{background:isSelected?"rgba(139,92,246,0.9)":"rgba(0,0,0,0.6)",color:"white"}}>
            {index + 1}
          </div>

          {/* Drag handle */}
          <button onPointerDown={e => { e.stopPropagation(); dragCtrl.start(e); }}
            className="absolute right-1.5 top-2.5 grid h-6 w-5 cursor-grab place-items-center rounded-md active:cursor-grabbing touch-none"
            style={{background:"rgba(0,0,0,0.4)"}}>
            <GripVertical className="h-3.5 w-3.5 text-white/60"/>
          </button>

          {/* Emotion dot */}
          {frame.emotion !== "calm" && (
            <div className="absolute left-2 top-9 h-2 w-2 rounded-full" style={{background:emotion.color}}/>
          )}

          {/* Bottom metadata */}
          {frame.imageUrl && (
            <div className="absolute bottom-1.5 left-1.5 right-1.5 flex items-end justify-between pointer-events-none gap-1">
              <span className="rounded-md px-1.5 py-px text-[8px] font-bold text-white/80"
                style={{background:"rgba(0,0,0,0.85)"}}>
                {camera.icon}
              </span>
              <span className="rounded-md px-1.5 py-px text-[8px] font-black text-white"
                style={{background:"rgba(0,0,0,0.85)"}}>
                {frame.durationSec}s
              </span>
            </div>
          )}

          {/* Replace overlay on hover */}
          {frame.imageUrl && (
            <button onClick={e => { e.stopPropagation(); inputRef.current?.click(); }}
              className="absolute inset-0 flex flex-col items-center justify-center gap-1 opacity-0 transition hover:opacity-100"
              style={{background:"rgba(0,0,0,0.5)"}}>
              <Upload className="h-5 w-5 text-white"/>
              <span className="text-[9px] font-bold text-white">Replace</span>
            </button>
          )}

          {/* Selected pulse ring */}
          {isSelected && (
            <motion.div className="pointer-events-none absolute inset-0 rounded-2xl"
              style={{border:"2px solid rgba(139,92,246,0.5)"}}
              animate={{opacity:[1,0.4,1]}} transition={{duration:2,repeat:Infinity,ease:"easeInOut"}}/>
          )}
        </motion.div>
      </Reorder.Item>

      {/* Quick actions */}
      <div className="flex flex-col items-center gap-1">
        <p className="max-w-[90px] truncate text-center text-[9px] font-semibold text-white/45">
          {frame.title || `Scene ${index + 1}`}
        </p>
        <div className="flex items-center gap-1.5">
          <button onClick={e => { e.stopPropagation(); onDuplicate(); }} disabled={total >= MAX_FRAMES}
            className="grid h-6 w-6 place-items-center rounded-md text-white/30 transition hover:text-white/70 disabled:opacity-20"
            style={{background:"rgba(255,255,255,0.04)"}}>
            <Copy className="h-3 w-3"/>
          </button>
          {total > MIN_FRAMES && (
            <button onClick={e => { e.stopPropagation(); onRemove(); }}
              className="grid h-6 w-6 place-items-center rounded-md text-white/30 transition hover:text-red-400"
              style={{background:"rgba(255,255,255,0.04)"}}>
              <Trash2 className="h-3 w-3"/>
            </button>
          )}
        </div>
      </div>

      <input ref={inputRef} type="file"
        accept="image/jpeg,image/png,image/webp,image/jpg,image/*"
        style={{position:"absolute",opacity:0,width:"1px",height:"1px",overflow:"hidden",clip:"rect(0,0,0,0)",pointerEvents:"none"}}
        onChange={e => { const f = e.target.files?.[0]; if (f) onPickFile(f); e.target.value = ""; }}/>
    </div>
  );
});

/* ─── WorkflowStepsBar — step-by-step guidance for Beginner Mode ─── */
function WorkflowStepsBar({ filledCount, canGenerate }: {
  filledCount: number;
  canGenerate: boolean;
}) {
  const steps = [
    { n: 1, label: "Upload Photos", done: filledCount >= 2, active: filledCount < 2 },
    { n: 2, label: "Choose Style",  done: canGenerate,      active: filledCount >= 2 && !canGenerate },
    { n: 3, label: "Generate",      done: false,            active: canGenerate },
  ];
  return (
    <div className="flex items-center gap-0 shrink-0 overflow-x-auto hide-scrollbar px-4 py-2.5"
      style={{background:"rgba(255,255,255,0.015)",borderBottom:"1px solid rgba(255,255,255,0.05)"}}>
      {steps.map((s, i) => (
        <React.Fragment key={s.n}>
          <div className={`flex items-center gap-1.5 shrink-0 transition-opacity ${s.done || s.active ? "opacity-100" : "opacity-30"}`}>
            <div className={`grid h-5 w-5 shrink-0 place-items-center rounded-full text-[9px] font-black ${
              s.done ? "bg-green-500" : s.active ? "bg-purple-500" : "bg-white/10"
            }`}>
              {s.done ? <Check className="h-3 w-3 text-white"/> : <span className="text-white">{s.n}</span>}
            </div>
            <span className={`text-[10px] font-semibold whitespace-nowrap ${
              s.done ? "text-green-400" : s.active ? "text-white" : "text-white/35"
            }`}>{s.label}</span>
          </div>
          {i < steps.length - 1 && (
            <ChevronRight className="mx-2 h-3 w-3 shrink-0 text-white/15"/>
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   TRANSITION CONNECTOR
═══════════════════════════════════════════════════════════════════ */
function TransitionConnector({frame, onClick}: {frame: StudioFrame; onClick: () => void}) {
  const t = TRANSITIONS.find(t => t.v === frame.transition)!;
  return (
    <button onClick={onClick}
      className="flex shrink-0 flex-col items-center justify-center gap-1 self-center transition hover:opacity-70"
      style={{width: 38, height: CARD_H}}>
      <div className="flex flex-col items-center gap-1 rounded-2xl px-1 py-3"
        style={{background:"rgba(255,255,255,0.02)",border:`1px dashed ${BORDER}`}}>
        <span className="text-[13px] text-white/40">{t.icon}</span>
        <span className="text-[7px] leading-tight text-center text-white/25">{t.label}</span>
        <span className="text-[7px] text-white/20">{frame.transDuration}s</span>
      </div>
    </button>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   SCENE BEAT TIMELINE — professional time-based director system
═══════════════════════════════════════════════════════════════════ */
const BEAT_COLORS = ["#7c3aed","#ec4899","#3b82f6","#10b981","#f59e0b","#ef4444","#06b6d4","#8b5cf6","#f97316","#84cc16"];

function SceneBeatTimeline({
  frame, onUpdate,
}: { frame: StudioFrame; onUpdate: (p: Partial<StudioFrame>) => void }) {
  const timelineRef = useRef<HTMLDivElement>(null);
  const [selectedId, setSelectedId] = useState<string|null>(null);
  const [dragging, setDragging] = useState<{
    beatId: string; mode: "move"|"resize-l"|"resize-r";
    startX: number; origStart: number; origEnd: number;
  }|null>(null);

  const selectedBeat = frame.beats.find(b => b.id === selectedId) ?? null;

  const pxPerSec = useCallback(() => {
    const w = timelineRef.current?.clientWidth ?? 600;
    return w / frame.durationSec;
  }, [frame.durationSec]);

  const clampBeat = useCallback((start: number, end: number): [number, number] => {
    const minDur = 0.5;
    let s = Math.max(0, Math.min(start, frame.durationSec - minDur));
    let e = Math.min(frame.durationSec, Math.max(end, s + minDur));
    return [parseFloat(s.toFixed(2)), parseFloat(e.toFixed(2))];
  }, [frame.durationSec]);

  const updateBeat = useCallback((id: string, patch: Partial<SceneBeat>) => {
    onUpdate({ beats: frame.beats.map(b => b.id === id ? { ...b, ...patch } : b) });
  }, [frame.beats, onUpdate]);

  const addBeat = useCallback(() => {
    const sorted = [...frame.beats].sort((a, b) => a.startSec - b.startSec);
    let start = 0;
    for (const b of sorted) {
      if (b.startSec - start >= 1) break;
      start = b.endSec;
    }
    if (start >= frame.durationSec - 0.5) start = 0;
    const end = Math.min(start + Math.min(3, frame.durationSec / 2), frame.durationSec);
    const colorIdx = frame.beats.length % BEAT_COLORS.length;
    const nb = mkBeat(start, end, `Beat ${frame.beats.length + 1}`);
    onUpdate({ beats: [...frame.beats, { ...nb, _color: BEAT_COLORS[colorIdx] } as SceneBeat] });
    setSelectedId(nb.id);
  }, [frame.beats, frame.durationSec, onUpdate]);

  const removeBeat = useCallback((id: string) => {
    onUpdate({ beats: frame.beats.filter(b => b.id !== id) });
    if (selectedId === id) setSelectedId(null);
  }, [frame.beats, selectedId, onUpdate]);

  const duplicateBeat = useCallback((id: string) => {
    const b = frame.beats.find(x => x.id === id)!;
    const dur = b.endSec - b.startSec;
    const [s, e] = clampBeat(b.endSec, b.endSec + dur);
    const nb = { ...b, id: Math.random().toString(36).slice(2), startSec: s, endSec: e, label: b.label + " (copy)" };
    onUpdate({ beats: [...frame.beats, nb] });
    setSelectedId(nb.id);
  }, [frame.beats, clampBeat, onUpdate]);

  const splitBeat = useCallback((id: string) => {
    const b = frame.beats.find(x => x.id === id)!;
    const mid = parseFloat(((b.startSec + b.endSec) / 2).toFixed(2));
    const second: SceneBeat = { ...b, id: Math.random().toString(36).slice(2), startSec: mid, label: b.label + " B" };
    const updated = frame.beats.map(x => x.id === id ? { ...x, endSec: mid } : x).concat(second);
    onUpdate({ beats: updated.sort((a, k) => a.startSec - k.startSec) });
    setSelectedId(second.id);
  }, [frame.beats, onUpdate]);

  /* Drag handlers */
  const onMouseDown = useCallback((e: React.MouseEvent, beatId: string, mode: "move"|"resize-l"|"resize-r") => {
    e.stopPropagation();
    e.preventDefault();
    const b = frame.beats.find(x => x.id === beatId)!;
    setDragging({ beatId, mode, startX: e.clientX, origStart: b.startSec, origEnd: b.endSec });
    setSelectedId(beatId);
  }, [frame.beats]);

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: MouseEvent) => {
      const pps = pxPerSec();
      const dx = (e.clientX - dragging.startX) / pps;
      const b = frame.beats.find(x => x.id === dragging.beatId)!;
      const dur = dragging.origEnd - dragging.origStart;
      let ns = dragging.origStart, ne = dragging.origEnd;
      if (dragging.mode === "move") {
        ns = dragging.origStart + dx; ne = ns + dur;
        const [cs, ce] = clampBeat(ns, ne);
        if (ce - cs === dur) { ns = cs; ne = ce; } else { return; }
      } else if (dragging.mode === "resize-l") {
        ns = dragging.origStart + dx;
        [ns, ne] = clampBeat(ns, dragging.origEnd);
      } else {
        ne = dragging.origEnd + dx;
        [ns, ne] = clampBeat(dragging.origStart, ne);
      }
      if (b.startSec !== ns || b.endSec !== ne) {
        onUpdate({ beats: frame.beats.map(x => x.id === dragging.beatId ? { ...x, startSec: ns, endSec: ne } : x) });
      }
    };
    const onUp = () => setDragging(null);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, [dragging, frame.beats, pxPerSec, clampBeat, onUpdate]);

  const beatColor = (idx: number) => BEAT_COLORS[idx % BEAT_COLORS.length];

  const sorted = useMemo(() => [...frame.beats].sort((a, b) => a.startSec - b.startSec), [frame.beats]);

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <div className="grid h-8 w-8 place-items-center rounded-xl" style={{background:"rgba(139,92,246,0.2)"}}>
          <Film className="h-4 w-4 text-purple-400"/>
        </div>
        <div>
          <div className="flex items-center gap-1.5">
            <p className="text-[13px] font-black text-white">Scene Beat Timeline</p>
            <span className="rounded-full border border-emerald-400/40 bg-emerald-400/10 px-1.5 py-px text-[8px] font-black uppercase tracking-wider text-emerald-300">Live</span>
          </div>
          <p className="text-[10px] text-white/35">{frame.durationSec}s scene · {frame.beats.length} beat{frame.beats.length !== 1 ? "s" : ""} · sent to the render engine as a beat timeline</p>
        </div>
        <button onClick={addBeat}
          className="ml-auto flex items-center gap-1.5 rounded-xl border px-3 py-2 text-[11px] font-bold text-purple-200 transition hover:bg-purple-500/20"
          style={{background:"rgba(139,92,246,0.15)",borderColor:"rgba(139,92,246,0.4)"}}>
          <Plus className="h-3.5 w-3.5"/> Add Beat
        </button>
      </div>

      {/* Timeline track */}
      <div className="relative overflow-hidden rounded-2xl border select-none" style={{background:"rgba(0,0,0,0.4)",borderColor:"rgba(255,255,255,0.08)"}}>
        {/* Time ruler */}
        <div className="relative flex h-6 items-center border-b" style={{borderColor:"rgba(255,255,255,0.06)"}}>
          {Array.from({length: frame.durationSec + 1}, (_, i) => i).map(sec => (
            <div key={sec} className="absolute top-0 flex h-full flex-col items-center"
              style={{left:`${(sec / frame.durationSec) * 100}%`}}>
              <div className="h-2 w-px" style={{background:"rgba(255,255,255,0.15)"}}/>
              {(sec % 2 === 0 || frame.durationSec <= 6) && (
                <span className="text-[8px] text-white/25 pl-0.5">{sec}s</span>
              )}
            </div>
          ))}
        </div>

        {/* Beat area */}
        <div ref={timelineRef} className="relative h-16 w-full"
          style={{cursor: dragging ? (dragging.mode === "move" ? "grabbing" : "ew-resize") : "default"}}>
          {/* Empty state */}
          {frame.beats.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center gap-2">
              <Film className="h-4 w-4 text-white/15"/>
              <p className="text-[12px] text-white/20">Click "Add Beat" to define time-based actions</p>
            </div>
          )}

          {/* Beat blocks */}
          {sorted.map((beat, idx) => {
            const left = `${(beat.startSec / frame.durationSec) * 100}%`;
            const width = `${((beat.endSec - beat.startSec) / frame.durationSec) * 100}%`;
            const color = beatColor(idx);
            const isSel = beat.id === selectedId;
            const cam = CAMERAS.find(c => c.v === beat.cameraMove);
            const eff = BEAT_EFFECTS.find(e => e.v === beat.effect);
            return (
              <motion.div key={beat.id}
                className="absolute top-2 flex h-12 cursor-grab flex-col overflow-hidden rounded-lg border transition-shadow"
                style={{
                  left, width,
                  background: `${color}22`,
                  borderColor: isSel ? color : `${color}60`,
                  boxShadow: isSel ? `0 0 0 2px ${color}80` : "none",
                  minWidth: 32,
                }}
                onMouseDown={e => onMouseDown(e, beat.id, "move")}>
                {/* Top color bar */}
                <div className="h-1 w-full shrink-0" style={{background:color}}/>
                {/* Content */}
                <div className="flex min-w-0 flex-1 items-center gap-1 px-1.5">
                  <span className="text-[10px]">{cam?.icon ?? "⬜"}</span>
                  <span className="min-w-0 flex-1 truncate text-[9px] font-bold text-white/80">{beat.label}</span>
                  {beat.effect !== "none" && <span className="shrink-0 text-[9px]">{eff?.icon}</span>}
                </div>
                <div className="flex shrink-0 items-center justify-between px-1.5 pb-1">
                  <span className="text-[8px] text-white/35">{beat.startSec.toFixed(1)}s</span>
                  <span className="text-[8px] text-white/35">{beat.endSec.toFixed(1)}s</span>
                </div>
                {/* Resize handles */}
                <div className="absolute bottom-0 left-0 top-0 w-2 cursor-ew-resize rounded-l-lg"
                  style={{background:`${color}30`}}
                  onMouseDown={e => onMouseDown(e, beat.id, "resize-l")}/>
                <div className="absolute bottom-0 right-0 top-0 w-2 cursor-ew-resize rounded-r-lg"
                  style={{background:`${color}30`}}
                  onMouseDown={e => onMouseDown(e, beat.id, "resize-r")}/>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* Beat editor */}
      {selectedBeat ? (
        <motion.div key={selectedBeat.id} initial={{opacity:0,y:8}} animate={{opacity:1,y:0}}
          className="overflow-hidden rounded-2xl border"
          style={{background:"rgba(0,0,0,0.3)",borderColor:beatColor(sorted.findIndex(b=>b.id===selectedBeat.id))}}>
          {/* Beat header */}
          <div className="flex items-center gap-2 border-b px-4 py-3"
            style={{borderColor:"rgba(255,255,255,0.08)",background:`${beatColor(sorted.findIndex(b=>b.id===selectedBeat.id))}15`}}>
            <div className="h-3 w-3 rounded-full shrink-0" style={{background:beatColor(sorted.findIndex(b=>b.id===selectedBeat.id))}}/>
            <input
              value={selectedBeat.label}
              onChange={e => updateBeat(selectedBeat.id, {label:e.target.value})}
              className="flex-1 bg-transparent text-[13px] font-bold text-white focus:outline-none placeholder:text-white/30"
              placeholder="Beat name…"
            />
            <span className="shrink-0 text-[10px] text-white/30">
              {selectedBeat.startSec.toFixed(1)}s – {selectedBeat.endSec.toFixed(1)}s
            </span>
            <div className="flex shrink-0 items-center gap-1">
              <button onClick={() => splitBeat(selectedBeat.id)}
                className="grid h-7 w-7 place-items-center rounded-lg text-white/35 transition hover:bg-white/10 hover:text-white/70"
                title="Split beat">
                <MoveHorizontal className="h-3.5 w-3.5"/>
              </button>
              <button onClick={() => duplicateBeat(selectedBeat.id)}
                className="grid h-7 w-7 place-items-center rounded-lg text-white/35 transition hover:bg-white/10 hover:text-white/70"
                title="Duplicate">
                <Copy className="h-3.5 w-3.5"/>
              </button>
              <button onClick={() => removeBeat(selectedBeat.id)}
                className="grid h-7 w-7 place-items-center rounded-lg text-white/35 transition hover:bg-red-500/20 hover:text-red-400"
                title="Remove beat">
                <Trash2 className="h-3.5 w-3.5"/>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 p-4">
            {/* Camera movement */}
            <div className="col-span-2">
              <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-white/35">Camera Movement</p>
              <div className="flex flex-wrap gap-1.5">
                {CAMERAS.map(({v,label,icon,preview}) => (
                  <button key={v} onClick={() => updateBeat(selectedBeat.id, {cameraMove:v})}
                    title={preview}
                    className={"flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-[11px] font-semibold transition "+(
                      selectedBeat.cameraMove===v ? "border-purple-500/50 bg-purple-500/18 text-purple-200" : "border-white/[0.07] bg-white/[0.03] text-white/50 hover:border-white/15"
                    )}>
                    <span className="text-[12px]">{icon}</span>{label}
                  </button>
                ))}
              </div>
            </div>

            {/* Motion strength */}
            <div>
              <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-white/35">Motion Strength</p>
              <div className="flex flex-col gap-1.5">
                {MOTION_LEVELS.map(({v,label,desc,color}) => (
                  <button key={v} onClick={() => updateBeat(selectedBeat.id, {motionStrength:v})}
                    className={"flex items-center gap-2 rounded-xl border px-3 py-2 text-left text-[11px] font-semibold transition "+(
                      selectedBeat.motionStrength===v ? "text-white" : "border-white/[0.07] bg-white/[0.03] text-white/45 hover:border-white/15"
                    )}
                    style={selectedBeat.motionStrength===v ? {background:`${color}30`,borderColor:`${color}60`} : {}}>
                    <div className="h-2 w-2 rounded-full shrink-0" style={{background:color}}/>
                    <div>
                      <p className="text-[11px] font-bold">{label}</p>
                      <p className="text-[9px] text-white/30">{desc}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Facial behavior */}
            <div>
              <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-white/35">Facial Behavior</p>
              <div className="flex flex-col gap-1">
                {FACIAL_BEHAVIORS.map(({v,label,icon}) => (
                  <button key={v} onClick={() => updateBeat(selectedBeat.id, {facialBehavior:v})}
                    className={"flex items-center gap-2 rounded-xl border px-3 py-2 text-[11px] font-semibold transition "+(
                      selectedBeat.facialBehavior===v ? "border-cyan-500/50 bg-cyan-500/12 text-cyan-200" : "border-white/[0.07] bg-white/[0.03] text-white/45 hover:border-white/15"
                    )}>
                    <span>{icon}</span>{label}
                    {selectedBeat.facialBehavior===v && <Check className="ml-auto h-3 w-3 text-cyan-400"/>}
                  </button>
                ))}
              </div>
            </div>

            {/* Beat effects */}
            <div className="col-span-2">
              <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-white/35">Beat Effect</p>
              <div className="flex flex-wrap gap-1.5">
                {BEAT_EFFECTS.map(({v,label,icon,color}) => (
                  <button key={v} onClick={() => updateBeat(selectedBeat.id, {effect:v})}
                    className={"flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-[11px] font-semibold transition "+(
                      selectedBeat.effect===v ? "text-white" : "border-white/[0.07] bg-white/[0.03] text-white/45 hover:border-white/15"
                    )}
                    style={selectedBeat.effect===v ? {background:`${color}25`,borderColor:`${color}60`} : {}}>
                    <span>{icon}</span>{label}
                  </button>
                ))}
              </div>
            </div>

            {/* Dialogue timing */}
            <div className="col-span-2">
              <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-white/35">Dialogue Timing</p>
              <div className="flex gap-2">
                {(["none","start","mid","end"] as const).map(t => (
                  <button key={t} onClick={() => updateBeat(selectedBeat.id, {dialogueTiming:t})}
                    className={"flex-1 rounded-xl border py-2 text-[11px] font-bold capitalize transition "+(
                      selectedBeat.dialogueTiming===t ? "border-yellow-500/50 bg-yellow-500/15 text-yellow-200" : "border-white/[0.07] bg-white/[0.03] text-white/40 hover:border-white/15"
                    )}>
                    {t === "none" ? "No Sync" : t === "start" ? "▶ Start" : t === "mid" ? "⏸ Mid" : "⏹ End"}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </motion.div>
      ) : (
        frame.beats.length > 0 && (
          <div className="flex items-center justify-center gap-2 rounded-2xl border py-6"
            style={{background:"rgba(255,255,255,0.02)",borderColor:"rgba(255,255,255,0.06)"}}>
            <MousePointer className="h-4 w-4 text-white/20"/>
            <p className="text-[12px] text-white/30">Click a beat to edit</p>
          </div>
        )
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   DIRECTOR HINT CHIPS — quick-insert example instructions
═══════════════════════════════════════════════════════════════════ */
const DIRECTOR_HINTS = [
  "dramatic cinematic push in","emotional lighting","realistic rain movement",
  "cinematic fog","handheld camera motion","cinematic depth of field",
  "realistic facial expression","emotional eye contact","subtle breathing movement",
  "realistic cloth simulation","movie-like lighting","slow motion reveal",
  "golden hour glow","anamorphic lens flare","shallow focus portrait",
];

const SUBTITLE_STYLES: {v:SubtitleStyle;label:string;desc:string;preview:string}[] = [
  {v:"minimal",     label:"Minimal",     desc:"Clean white, no shadow",    preview:"Simple clean text"},
  {v:"bold",        label:"Bold",        desc:"Heavy weight, outlined",    preview:"BOLD IMPACT TEXT"},
  {v:"glow",        label:"Glow",        desc:"Neon luminous edges",       preview:"✦ Glowing Text ✦"},
  {v:"cinematic",   label:"Cinematic",   desc:"Film caption style",        preview:"— Cinematic —"},
  {v:"typewriter",  label:"Typewriter",  desc:"Types letter by letter",    preview:"Type_writer..."},
  {v:"handwritten", label:"Handwritten", desc:"Natural script feel",       preview:"Handwritten"},
];

/* ═══════════════════════════════════════════════════════════════════
   SCENE DIRECTOR PANEL — full directing system
═══════════════════════════════════════════════════════════════════ */
type DirectorSection = "directing"|"timeline"|"overview"|"camera"|"color"|"transition"|"audio"|"subs";

function SceneDirectorContent({
  frame, onUpdate,
}: {
  frame: StudioFrame; onUpdate: (p: Partial<StudioFrame>) => void;
}) {
  const [section, setSection] = useState<DirectorSection>("directing");
  const [voicePreviewId, setVoicePreviewId] = useState<string|null>(null);

  const TABS: {id:DirectorSection;label:string;icon:typeof Camera}[] = [
    {id:"directing",  label:"Direct",   icon:Theater},
    {id:"timeline",   label:"Timeline", icon:Film},
    {id:"overview",   label:"Scene",    icon:Layers},
    {id:"camera",     label:"Camera",   icon:Camera},
    {id:"color",      label:"Grade",    icon:Wand2},
    {id:"transition", label:"Cut",      icon:Zap},
    {id:"audio",      label:"Audio",    icon:Volume2},
    {id:"subs",       label:"Subs",     icon:MessageSquare},
  ];

  return (
    <div className="flex h-full flex-col">
      {/* Section tabs */}
      <div className="flex gap-1 overflow-x-auto px-4 py-3 hide-scrollbar shrink-0" style={{borderBottom:`1px solid ${BORDER}`}}>
        {TABS.map(({id,label,icon:Icon}) => (
          <button key={id} onClick={() => setSection(id)}
            className={"flex shrink-0 items-center gap-1.5 rounded-xl border px-3 py-2 text-[11px] font-bold transition "+(
              section===id ? "border-purple-500/50 bg-purple-500/15 text-white" : "border-white/[0.07] bg-white/[0.03] text-white/40 hover:text-white/70"
            )}>
            <Icon className="h-3 w-3"/>{label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">

        {/* ─── OVERVIEW ─── */}
        {section === "overview" && (
          <>
            {/* Scene title */}
            <div>
              <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-white/35">Scene Title</p>
              <input value={frame.title} onChange={e => onUpdate({title:e.target.value})}
                placeholder="e.g. Opening reveal, Chase scene…"
                className="w-full rounded-xl border px-3 py-2.5 text-[13px] text-white placeholder:text-white/25 focus:outline-none"
                style={{background:GLASS,borderColor:BORDER}}/>
            </div>

            {/* Duration */}
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <p className="text-[10px] font-bold uppercase tracking-wider text-white/35">Duration</p>
                <div className="flex items-center gap-1.5">
                  <input type="number" min={MIN_DUR} max={MAX_DUR} value={frame.durationSec}
                    onChange={e => { const v = Math.max(MIN_DUR,Math.min(MAX_DUR,+e.target.value)); onUpdate({durationSec:isNaN(v)?MIN_DUR:v}); }}
                    className="h-7 w-14 rounded-xl border px-2 text-center text-xs font-black text-white focus:outline-none"
                    style={{background:GLASS,borderColor:BORDER}}/>
                  <span className="text-[11px] text-white/35">sec</span>
                </div>
              </div>
              <input type="range" min={MIN_DUR} max={MAX_DUR} value={frame.durationSec}
                onChange={e => onUpdate({durationSec:+e.target.value})} className="h-1 w-full accent-purple-500"/>
              <div className="mt-1 flex justify-between text-[9px] text-white/20"><span>{MIN_DUR}s</span><span>{MAX_DUR}s</span></div>
            </div>

            {/* Beat type */}
            <div>
              <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-white/35">Cinematic Beat</p>
              <div className="flex flex-wrap gap-1.5">
                {BEATS.map(({v,label,color}) => (
                  <button key={v} onClick={() => onUpdate({beatType:v})}
                    className={"rounded-xl border px-2.5 py-1.5 text-[11px] font-semibold transition "+(
                      frame.beatType===v ? "text-white" : "text-white/40 hover:text-white/70"
                    )}
                    style={{
                      background: frame.beatType===v ? `${color}30` : GLASS,
                      borderColor: frame.beatType===v ? `${color}70` : BORDER,
                    }}>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Emotion */}
            <div>
              <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-white/35">Emotion</p>
              <div className="flex flex-wrap gap-1.5">
                {EMOTIONS.map(({v,label,emoji,color}) => (
                  <button key={v} onClick={() => onUpdate({emotion:v})}
                    className={"flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-[11px] font-semibold transition "+(
                      frame.emotion===v ? "text-white" : "text-white/40 hover:text-white/65"
                    )}
                    style={{
                      background: frame.emotion===v ? `${color}25` : GLASS,
                      borderColor: frame.emotion===v ? `${color}60` : BORDER,
                    }}>
                    <span className="text-[12px]">{emoji}</span>{label}
                  </button>
                ))}
              </div>
            </div>

            {/* Scene prompt */}
            <div>
              <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-white/35">
                Scene Prompt <span className="normal-case text-white/20">(overrides global)</span>
              </p>
              <textarea value={frame.promptOverride} onChange={e => onUpdate({promptOverride:e.target.value})}
                rows={3} placeholder="Describe the visuals, action, mood of this scene…"
                className="w-full resize-none rounded-xl border px-3 py-2.5 text-[12px] leading-relaxed text-white placeholder:text-white/25 focus:outline-none"
                style={{background:GLASS,borderColor:BORDER}}/>
            </div>
          </>
        )}

        {/* ═══ TIMELINE ═══ */}
        {section === "timeline" && (
          <SceneBeatTimeline frame={frame} onUpdate={onUpdate}/>
        )}

        {/* ═══ COLOR GRADE ═══ */}
        {section === "color" && (
          <>
            <div className="flex items-center gap-2">
              <Wand2 className="h-4 w-4 text-purple-400"/>
              <p className="text-[13px] font-black text-white">Cinematic Color Grade</p>
              <span className="ml-auto rounded-full border border-emerald-400/40 bg-emerald-400/10 px-1.5 py-px text-[8px] font-black uppercase tracking-wider text-emerald-300">Baked into export</span>
            </div>
            <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-[11px] text-white/55">
              The grade on frame&nbsp;1 becomes the project grade and is rendered straight into the exported MP4 via FFmpeg.
            </div>
            {/* Selected grade preview */}
            {frame.colorGrade !== "none" && frame.imageUrl && (
              <div className="relative overflow-hidden rounded-2xl border" style={{borderColor:"rgba(139,92,246,0.3)"}}>
                <div className="relative h-28">
                  <img src={frame.imageUrl} className="h-full w-full object-cover" alt=""/>
                  <div className="absolute inset-0" style={{backdropFilter:COLOR_GRADES.find(g=>g.v===frame.colorGrade)?.css}}/>
                  <div className="absolute right-2 bottom-2 rounded-lg border px-2 py-1 text-[10px] font-bold text-white"
                    style={{background:"rgba(0,0,0,0.6)",borderColor:"rgba(255,255,255,0.15)"}}>
                    {COLOR_GRADES.find(g=>g.v===frame.colorGrade)?.label}
                  </div>
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              {COLOR_GRADES.map(({v,label,desc,icon}) => {
                const sel = frame.colorGrade === v;
                return (
                  <button key={v} onClick={() => onUpdate({colorGrade:v})}
                    className={"relative overflow-hidden rounded-2xl border text-left transition "+(
                      sel ? "border-purple-500/50 bg-purple-500/10" : "border-white/[0.07] bg-white/[0.02] hover:border-white/14"
                    )}>
                    {sel && <div className="absolute left-0 inset-y-0 w-[3px]" style={{background:"linear-gradient(180deg,#7c3aed,#ec4899)"}}/>}
                    {/* Simulated grade strip */}
                    <div className="h-8 w-full flex items-center justify-center text-xl"
                      style={{
                        background:
                          v==="noir"         ? "linear-gradient(135deg,#111,#333,#111)" :
                          v==="teal-orange"  ? "linear-gradient(135deg,#0d4a4a,#7c3a00,#0d4a4a)" :
                          v==="cyberpunk"    ? "linear-gradient(135deg,#2d0060,#004060,#2d0060)" :
                          v==="warm-cinema"  ? "linear-gradient(135deg,#4a2800,#7c5500,#4a2800)" :
                          v==="dreamy"       ? "linear-gradient(135deg,#3a2060,#604080,#3a2060)" :
                          v==="horror"       ? "linear-gradient(135deg,#200000,#400000,#200000)" :
                          v==="anime"        ? "linear-gradient(135deg,#001840,#400080,#001840)" :
                          v==="vintage"      ? "linear-gradient(135deg,#3a2800,#5a4000,#3a2800)" :
                          v==="blockbuster"  ? "linear-gradient(135deg,#001a3a,#1a003a,#001a3a)" :
                          v==="documentary"  ? "linear-gradient(135deg,#1a1a20,#2a2a30,#1a1a20)" :
                          "linear-gradient(135deg,#080808,#181818)"
                      }}>
                      <span>{icon}</span>
                    </div>
                    <div className="px-3 py-2">
                      <p className={`text-[12px] font-bold ${sel?"text-purple-200":"text-white/75"}`}>{label}</p>
                      <p className="text-[10px] text-white/30 leading-tight">{desc}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </>
        )}

        {/* ─── CAMERA ─── */}
        {section === "camera" && (
          <>
            <div>
              <p className="mb-3 text-[10px] font-bold uppercase tracking-wider text-white/35">Camera Movement</p>
              <div className="flex flex-col gap-1.5">
                {CAMERAS.map(({v,label,icon,preview}) => (
                  <button key={v} onClick={() => onUpdate({cameraMove:v})}
                    className={"flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition "+(
                      frame.cameraMove===v ? "border-purple-500/50 bg-purple-500/18 text-white" : "border-white/[0.07] bg-white/[0.03] text-white/50 hover:border-white/15"
                    )}>
                    <span className="text-[20px] shrink-0">{icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className={`text-[13px] font-bold ${frame.cameraMove===v?"text-purple-200":"text-white/80"}`}>{label}</p>
                      <p className="text-[10px] text-white/30">{preview}</p>
                    </div>
                    {frame.cameraMove===v && <Check className="h-4 w-4 shrink-0 text-purple-400"/>}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-white/35">Motion Strength</p>
              <div className="grid grid-cols-2 gap-2">
                {MOTION_LEVELS.map(({v,label,desc,color}) => (
                  <button key={v} onClick={() => onUpdate({motionStrength:v})}
                    className={"flex flex-col items-start rounded-xl border px-3 py-2.5 text-left transition "+(
                      frame.motionStrength===v ? "text-white" : "border-white/[0.07] bg-white/[0.03] text-white/45 hover:border-white/15"
                    )}
                    style={frame.motionStrength===v ? {background:`${color}30`,borderColor:`${color}60`} : {}}>
                    <span className="text-[13px] font-black">{label}</span>
                    <span className="text-[10px] opacity-60">{desc}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Character Continuity — AI Continuity System */}
            <div>
              <div className="mb-3 flex items-center gap-1.5">
                <p className="text-[10px] font-bold uppercase tracking-wider text-white/35">AI Continuity System</p>
                <span className="rounded-full px-1.5 py-px text-[8px] font-bold text-purple-400"
                  style={{background:"rgba(124,58,237,0.15)",border:"1px solid rgba(124,58,237,0.25)"}}>◈</span>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {([
                  {k:"keepFace" as const,         icon:User,      label:"Same Face",          desc:"Match identity"},
                  {k:"keepOutfit" as const,        icon:Shirt,     label:"Same Outfit",         desc:"Match clothing"},
                  {k:"keepHairstyle" as const,     icon:Sparkles,  label:"Same Hairstyle",      desc:"Match hair"},
                  {k:"keepEnvironment" as const,   icon:TreePine,  label:"Same Environment",    desc:"Match setting"},
                  {k:"keepLighting" as const,      icon:Sun,       label:"Same Lighting",       desc:"Match illumination"},
                  {k:"keepCinematicTone" as const, icon:Film,      label:"Cinematic Tone",      desc:"Match color palette"},
                ] as {k:keyof StudioFrame;icon:React.ElementType;label:string;desc:string}[]).map(({k,icon:Icon,label,desc}) => (
                  <button key={String(k)} onClick={() => onUpdate({[k]:!frame[k as keyof StudioFrame]})}
                    className={"flex flex-col items-start rounded-xl border p-2.5 text-left transition "+(
                      frame[k as keyof StudioFrame]
                        ? "border-purple-500/40 bg-purple-500/12"
                        : "border-white/[0.06] bg-white/[0.02] hover:border-white/10"
                    )}>
                    <div className="flex w-full items-center justify-between">
                      <Icon className={`h-3.5 w-3.5 ${frame[k as keyof StudioFrame] ? "text-purple-400" : "text-white/25"}`}/>
                      <div className={`grid h-4 w-4 place-items-center rounded-full border transition ${frame[k as keyof StudioFrame] ? "border-purple-500 bg-purple-500" : "border-white/15"}`}>
                        {frame[k as keyof StudioFrame] && <Check className="h-2.5 w-2.5 text-white"/>}
                      </div>
                    </div>
                    <p className={`mt-1.5 text-[11px] font-bold leading-tight ${frame[k as keyof StudioFrame] ? "text-white" : "text-white/40"}`}>{label}</p>
                    <p className="text-[9px] text-white/20">{desc}</p>
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {/* ─── TRANSITION ─── */}
        {section === "transition" && (
          <>
            <div>
              <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-white/35">Transition Type</p>
              <div className="flex flex-wrap gap-1.5">
                {TRANSITIONS.map(({v,label,icon}) => (
                  <button key={v} onClick={() => onUpdate({transition:v})}
                    className={"flex items-center gap-1.5 rounded-xl border px-2.5 py-2 text-[11px] font-semibold transition "+(
                      frame.transition===v ? "border-pink-500/50 bg-pink-500/18 text-pink-200" : "border-white/[0.07] bg-white/[0.03] text-white/50 hover:border-white/15"
                    )}>
                    <span>{icon}</span>{label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <p className="text-[10px] font-bold uppercase tracking-wider text-white/35">Transition Duration</p>
                <span className="text-[12px] font-black text-white">{frame.transDuration.toFixed(1)}s</span>
              </div>
              <input type="range" min={0.2} max={3.0} step={0.1} value={frame.transDuration}
                onChange={e => onUpdate({transDuration:+e.target.value})} className="h-1 w-full accent-pink-500"/>
              <div className="mt-1 flex justify-between text-[9px] text-white/20"><span>0.2s (snap)</span><span>3.0s (slow)</span></div>
            </div>
          </>
        )}

        {/* ═══ DIRECTING ═══ */}
        {section === "directing" && (
          <>
            {/* Director Instructions — large cinematic textarea */}
            <div className="rounded-2xl border overflow-hidden" style={{borderColor:"rgba(139,92,246,0.3)",background:"rgba(139,92,246,0.06)"}}>
              <div className="flex items-center gap-2 border-b px-4 py-2.5" style={{borderColor:"rgba(139,92,246,0.2)"}}>
                <Clapperboard className="h-4 w-4 text-purple-400"/>
                <span className="text-[11px] font-black uppercase tracking-wider text-purple-300">Director Instructions</span>
                <span className="ml-auto text-[9px] text-purple-400/50">Influences motion · camera · atmosphere · realism</span>
              </div>
              <div className="px-4 pt-2 pb-3">
                <textarea
                  value={frame.directorInstructions}
                  onChange={e => onUpdate({directorInstructions:e.target.value})}
                  rows={5}
                  placeholder={"dramatic cinematic push in\nemotional lighting\nrealistic facial expression\ncinematic depth of field\nsubtle breathing movement…"}
                  className="w-full resize-none bg-transparent text-[13px] leading-relaxed text-white placeholder:text-white/20 focus:outline-none"
                />
                {/* Hint chips */}
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {DIRECTOR_HINTS.slice(0,8).map(hint => (
                    <button key={hint} onClick={() => {
                      const curr = frame.directorInstructions.trim();
                      onUpdate({directorInstructions: curr ? `${curr}\n${hint}` : hint});
                    }}
                      className="rounded-full border px-2.5 py-1 text-[10px] font-medium text-purple-300/70 transition hover:border-purple-500/50 hover:text-purple-200"
                      style={{background:"rgba(139,92,246,0.08)",borderColor:"rgba(139,92,246,0.2)"}}>
                      + {hint}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Dialogue */}
            <div className="rounded-2xl border overflow-hidden" style={{borderColor:"rgba(6,182,212,0.3)",background:"rgba(6,182,212,0.05)"}}>
              <div className="flex items-center gap-2 border-b px-4 py-2.5" style={{borderColor:"rgba(6,182,212,0.2)"}}>
                <Mic className="h-4 w-4 text-cyan-400"/>
                <span className="text-[11px] font-black uppercase tracking-wider text-cyan-300">Dialogue</span>
                <span className="ml-auto text-[9px] text-cyan-400/50">Narration · speech · voice-over</span>
              </div>
              <textarea
                value={frame.dialogue}
                onChange={e => onUpdate({dialogue:e.target.value})}
                rows={3}
                placeholder={`"I waited for you…"\n"We don't have much time left."\n"This changes everything."`}
                className="w-full resize-none bg-transparent px-4 pt-3 pb-3 text-[13px] leading-relaxed text-white placeholder:text-white/20 focus:outline-none"
              />
              {frame.dialogue.trim() && (
                <div className="flex items-center gap-2 border-t px-4 py-2.5" style={{borderColor:"rgba(6,182,212,0.2)"}}>
                  <span className="text-[10px] text-cyan-400/60">{frame.dialogue.trim().split(/\s+/).length} words</span>
                  <span className="text-[10px] text-white/20">·</span>
                  <span className="text-[10px] text-cyan-400/60">~{Math.ceil(frame.dialogue.trim().split(/\s+/).length / 2.5)}s read time</span>
                  <div className="ml-auto flex items-center gap-1.5">
                    <div className="h-1.5 w-1.5 rounded-full bg-cyan-500 animate-pulse"/>
                    <span className="text-[10px] text-cyan-300/70">Live TTS ready</span>
                  </div>
                </div>
              )}
            </div>

            {/* Voice Preview — real-time TTS via fal.ai Kokoro */}
            {frame.dialogue.trim() && (
              <VoicePreview
                dialogueText={frame.dialogue}
                voiceType={frame.characterVoice}
                emotion={frame.emotion}
              />
            )}

            {/* Character Voice — expanded cards */}
            <div>
              <div className="mb-3 flex items-center gap-2">
                <Volume2 className="h-4 w-4 text-white/40"/>
                <span className="text-[11px] font-black uppercase tracking-wider text-white/40">Character Voice</span>
              </div>
              <div className="flex flex-col gap-2">
                {VOICES.map(({v,label,icon,tone,style,langs}) => {
                  const sel = frame.characterVoice === v;
                  return (
                    <button key={v} onClick={() => onUpdate({characterVoice:v})}
                      className={"relative overflow-hidden rounded-2xl border text-left transition "+(
                        sel ? "border-cyan-500/50 bg-cyan-500/10" : "border-white/[0.07] bg-white/[0.02] hover:border-white/14"
                      )}>
                      {sel && <div className="absolute left-0 inset-y-0 w-[3px]" style={{background:"linear-gradient(180deg,#06b6d4,#3b82f6)"}}/>}
                      <div className="flex items-center gap-3 px-4 py-3">
                        <span className="text-2xl shrink-0">{icon}</span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className={`text-[13px] font-bold ${sel?"text-cyan-200":"text-white/80"}`}>{label}</p>
                            {sel && <span className="rounded-full px-1.5 py-px text-[8px] font-bold text-cyan-300" style={{background:"rgba(6,182,212,0.2)"}}>Selected</span>}
                          </div>
                          <p className="text-[11px] text-white/35">{tone} · {style}</p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-[9px] text-white/25">{langs}</p>
                          <button onClick={e => { e.stopPropagation(); setVoicePreviewId(voicePreviewId===v?null:v); }}
                            className={"mt-1 flex items-center gap-1 rounded-lg border px-2 py-1 text-[10px] font-semibold transition "+(
                              voicePreviewId===v ? "border-cyan-500/50 bg-cyan-500/20 text-cyan-200" : "border-white/10 bg-white/[0.04] text-white/35 hover:text-white/70"
                            )}>
                            {voicePreviewId===v ? <Pause className="h-2.5 w-2.5"/> : <Play className="h-2.5 w-2.5"/>}
                            Preview
                          </button>
                        </div>
                      </div>
                      {/* Preview bar (simulated) */}
                      {voicePreviewId === v && (
                        <div className="border-t px-4 py-2.5" style={{borderColor:"rgba(6,182,212,0.2)"}}>
                          <div className="flex items-center gap-3">
                            <div className="flex gap-0.5 items-end h-5">
                              {[4,7,5,9,6,8,5,7,4,6,9,5].map((h,i) => (
                                <motion.div key={i} animate={{scaleY:[1,h/5,1]}} transition={{duration:0.6,repeat:Infinity,delay:i*0.05}}
                                  className="w-1 rounded-full" style={{height:h*2,background:"linear-gradient(180deg,#06b6d4,#3b82f6)",transformOrigin:"bottom"}}/>
                              ))}
                            </div>
                            <p className="text-[11px] text-cyan-300/70">Voice preview · {label}</p>
                            <div className="ml-auto flex items-center gap-1.5">
                              <div className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-pulse"/>
                              <span className="text-[10px] text-cyan-400/60">Playing sample</span>
                            </div>
                          </div>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {/* ═══ AUDIO MIXER ═══ */}
        {section === "audio" && (
          <>
            {/* Ambient sound */}
            <div>
              <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-white/35">Ambient Sound</p>
              <div className="flex flex-col gap-1.5">
                {AMBIENTS.map(({v,label,icon}) => (
                  <button key={v} onClick={() => onUpdate({ambientSound:v})}
                    className={"flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition "+(
                      frame.ambientSound===v ? "border-emerald-500/40 bg-emerald-500/10 text-white" : "border-white/[0.07] bg-white/[0.03] text-white/45 hover:border-white/12"
                    )}>
                    <span className="text-[18px]">{icon}</span>
                    <span className="flex-1 text-[13px] font-semibold">{label}</span>
                    {frame.ambientSound===v && <Check className="h-4 w-4 text-emerald-400"/>}
                  </button>
                ))}
              </div>
            </div>

            {/* Audio mixer */}
            <div className="rounded-2xl border p-4 space-y-4" style={{background:GLASS_HEAVY,borderColor:BORDER}}>
              <p className="text-[10px] font-black uppercase tracking-wider text-white/35">Scene Audio Mixer</p>
              {([
                {label:"Dialogue",   key:"dialogueVolume"   as const, color:"#06b6d4", icon:""},
                {label:"Soundtrack", key:"soundtrackVolume" as const, color:"#a855f7", icon:""},
                {label:"Ambient",    key:"ambientVolume"    as const, color:"#10b981", icon:""},
              ]).map(({label,key,color,icon}) => (
                <div key={key}>
                  <div className="mb-1.5 flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[12px]">{icon}</span>
                      <span className="text-[11px] font-semibold text-white/60">{label}</span>
                    </div>
                    <span className="text-[12px] font-black" style={{color}}>{frame[key]}%</span>
                  </div>
                  <div className="relative h-2 w-full overflow-hidden rounded-full" style={{background:"rgba(255,255,255,0.08)"}}>
                    <div className="absolute left-0 inset-y-0 rounded-full transition-all" style={{width:`${frame[key]}%`,background:color}}/>
                  </div>
                  <input type="range" min={0} max={100} value={frame[key]}
                    onChange={e => onUpdate({[key]:+e.target.value})}
                    className="mt-1 h-0 w-full opacity-0 absolute"
                    style={{marginTop:-12, position:"relative", zIndex:10}}/>
                  <input type="range" min={0} max={100} value={frame[key]}
                    onChange={e => onUpdate({[key]:+e.target.value})}
                    className="mt-[-8px] h-1 w-full cursor-pointer" style={{accentColor:color}}/>
                </div>
              ))}

              {/* Cinematic ducking */}
              <button onClick={() => onUpdate({cinematicDucking:!frame.cinematicDucking})}
                className={"flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition "+(
                  frame.cinematicDucking ? "border-purple-500/35 bg-purple-500/10" : "border-white/[0.06] bg-white/[0.02] hover:border-white/12"
                )}>
                <Music className={`h-4 w-4 shrink-0 ${frame.cinematicDucking?"text-purple-400":"text-white/25"}`}/>
                <div className="flex-1 min-w-0">
                  <p className={`text-[12px] font-semibold ${frame.cinematicDucking?"text-white":"text-white/45"}`}>Cinematic Ducking</p>
                  <p className="text-[10px] text-white/25">Auto-lower music when dialogue plays</p>
                </div>
                <div className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border transition ${frame.cinematicDucking?"border-purple-500 bg-purple-500":"border-white/20"}`}>
                  {frame.cinematicDucking && <Check className="h-3 w-3 text-white"/>}
                </div>
              </button>
            </div>

            {/* Fade controls */}
            <div className="rounded-2xl border p-4 space-y-4" style={{background:GLASS,borderColor:BORDER}}>
              <p className="text-[10px] font-black uppercase tracking-wider text-white/35">Scene Fades</p>
              {([
                {label:"Fade In",  key:"fadeIn"  as const, icon:"▶"},
                {label:"Fade Out", key:"fadeOut" as const, icon:"◼"},
              ]).map(({label,key,icon}) => (
                <div key={key}>
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-[11px] font-semibold text-white/55">
                      <span>{icon}</span>{label}
                    </span>
                    <span className="text-[12px] font-black text-white">{frame[key].toFixed(1)}s</span>
                  </div>
                  <input type="range" min={0} max={3} step={0.1} value={frame[key]}
                    onChange={e => onUpdate({[key]:+e.target.value})} className="h-1 w-full accent-purple-500"/>
                  <div className="mt-1 flex justify-between text-[9px] text-white/20"><span>None</span><span>3.0s</span></div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* ═══ SUBTITLES ═══ */}
        {section === "subs" && (
          <>
            <div className="rounded-2xl border border-emerald-400/30 bg-emerald-400/[0.06] px-3 py-2 text-[11px] text-emerald-200/90">
              <span className="font-black uppercase tracking-wider text-emerald-300">Live</span>
              <span className="ml-2 text-emerald-100/70">When enabled, dialogue lines are burned into the exported MP4 via FFmpeg — they cannot be turned off in the player.</span>
            </div>
            {/* Enable toggle */}
            <button onClick={() => onUpdate({subtitlesEnabled:!frame.subtitlesEnabled})}
              className={"flex w-full items-center gap-4 rounded-2xl border p-4 text-left transition "+(
                frame.subtitlesEnabled ? "border-yellow-500/40 bg-yellow-500/08" : "border-white/[0.07] bg-white/[0.02] hover:border-white/12"
              )}>
              <div className={"grid h-12 w-12 shrink-0 place-items-center rounded-2xl transition "+(
                frame.subtitlesEnabled ? "bg-yellow-500/20" : "bg-white/[0.04]"
              )}>
                <MessageSquare className={`h-6 w-6 ${frame.subtitlesEnabled?"text-yellow-400":"text-white/25"}`}/>
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-[14px] font-bold ${frame.subtitlesEnabled?"text-white":"text-white/50"}`}>Cinematic Subtitles</p>
                <p className="text-[11px] text-white/30">Auto-generate animated captions from dialogue</p>
              </div>
              <div className={`grid h-7 w-12 place-items-center rounded-full transition ${frame.subtitlesEnabled?"bg-yellow-500":"bg-white/10"}`}
                style={{padding:3}}>
                <div className={`h-5 w-5 rounded-full bg-white shadow transition-transform ${frame.subtitlesEnabled?"translate-x-2.5":"-translate-x-2.5"}`}/>
              </div>
            </button>

            {frame.subtitlesEnabled && (
              <>
                {/* Subtitle style */}
                <div>
                  <p className="mb-3 text-[10px] font-bold uppercase tracking-wider text-white/35">Subtitle Style</p>
                  <div className="grid grid-cols-2 gap-2">
                    {SUBTITLE_STYLES.map(({v,label,desc,preview}) => {
                      const sel = frame.subtitleStyle === v;
                      return (
                        <button key={v} onClick={() => onUpdate({subtitleStyle:v})}
                          className={"overflow-hidden rounded-2xl border text-left transition "+(
                            sel ? "border-yellow-500/50 bg-yellow-500/10" : "border-white/[0.07] bg-white/[0.02] hover:border-white/14"
                          )}>
                          {/* Preview strip */}
                          <div className="flex h-10 items-center justify-center"
                            style={{background:"linear-gradient(135deg,rgba(5,0,15,1),rgba(20,10,40,1))"}}>
                            <span className={`text-[11px] font-semibold ${sel?"text-yellow-200":"text-white/50"}`}
                              style={v==="bold"?{fontWeight:900,WebkitTextStroke:"0.5px rgba(255,255,255,0.3)"}
                                :v==="glow"?{textShadow:"0 0 12px rgba(251,191,36,0.8)"}
                                :v==="cinematic"?{fontStyle:"italic",letterSpacing:"0.06em"}:{}}>
                              {preview}
                            </span>
                          </div>
                          <div className="px-3 py-2">
                            <p className={`text-[12px] font-bold ${sel?"text-yellow-200":"text-white/70"}`}>{label}</p>
                            <p className="text-[10px] text-white/30">{desc}</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Position */}
                <div>
                  <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-white/35">Subtitle Position</p>
                  <div className="grid grid-cols-3 gap-2">
                    {(["top","middle","bottom"] as const).map(pos => (
                      <button key={pos} onClick={() => onUpdate({subtitlePosition:pos})}
                        className={"flex flex-col items-center gap-1.5 rounded-xl border py-3 transition "+(
                          frame.subtitlePosition===pos ? "border-yellow-500/50 bg-yellow-500/10 text-yellow-200" : "border-white/[0.07] bg-white/[0.03] text-white/40 hover:border-white/14"
                        )}>
                        <div className="flex h-8 w-8 flex-col justify-between rounded-lg p-1"
                          style={{background:"rgba(0,0,0,0.4)"}}>
                          {pos==="top" && <div className="h-1 w-full rounded-full bg-current"/>}
                          {pos==="middle" && <><div className="h-px w-full"/><div className="h-1 w-full rounded-full bg-current"/><div className="h-px w-full"/></>}
                          {pos==="bottom" && <><div className="flex-1"/><div className="h-1 w-full rounded-full bg-current"/></>}
                        </div>
                        <span className="text-[11px] font-semibold capitalize">{pos}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Subtitle preview */}
                {frame.dialogue.trim() && (
                  <div className="relative overflow-hidden rounded-2xl" style={{height:120,background:"linear-gradient(135deg,rgba(5,0,15,1),rgba(20,5,40,1))"}}>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <p className="text-[10px] text-white/15">Preview Frame</p>
                    </div>
                    <div className={`absolute inset-x-4 ${frame.subtitlePosition==="top"?"top-3":frame.subtitlePosition==="middle"?"top-1/2 -translate-y-1/2":"bottom-3"}`}>
                      <p className={`text-center text-[13px] leading-snug ${frame.subtitleStyle==="bold"?"font-black text-white":frame.subtitleStyle==="glow"?"font-semibold text-yellow-200":frame.subtitleStyle==="cinematic"?"font-medium italic tracking-wide text-white":"font-semibold text-white"}`}
                        style={frame.subtitleStyle==="glow"?{textShadow:"0 0 16px rgba(251,191,36,0.9)"}
                          :frame.subtitleStyle==="bold"?{WebkitTextStroke:"0.5px rgba(0,0,0,0.8)"}:{}}>
                        {frame.dialogue.trim().slice(0,80)}{frame.dialogue.trim().length>80?"…":""}
                      </p>
                    </div>
                    <div className="absolute right-2 top-2 rounded-md px-1.5 py-px text-[8px] text-white/30"
                      style={{background:"rgba(0,0,0,0.5)"}}>
                      PREVIEW
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   LIVE PREVIEW PLAYER — cinematic center stage
═══════════════════════════════════════════════════════════════════ */
function LivePreviewPlayer({
  frames, cfg, selectedId, onSelectId,
}: {
  frames: StudioFrame[]; cfg: GlobalCfg;
  selectedId: string|null; onSelectId: (id: string) => void;
}) {
  const [isPlaying, setIsPlaying]       = useState(false);
  const [playIdx, setPlayIdx]           = useState(0);
  const [showSafeZones, setShowSafeZones] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval>|null>(null);

  const filledFrames = useMemo(() => frames.filter(f => f.imageUrl), [frames]);
  const displayIdx   = useMemo(() => {
    if (selectedId) {
      const idx = filledFrames.findIndex(f => f.id === selectedId);
      return idx >= 0 ? idx : 0;
    }
    return isPlaying ? playIdx : 0;
  }, [selectedId, filledFrames, isPlaying, playIdx]);

  const currentFrame  = filledFrames[displayIdx] ?? null;
  const aspectData    = ASPECTS.find(a => a.v === cfg.aspect)!;
  const emotion       = EMOTIONS.find(e => e.v === (currentFrame?.emotion ?? "neutral"))!;
  const beat          = BEATS.find(b => b.v === (currentFrame?.beatType ?? "establish"))!;
  const engine        = ENGINES.find(e => e.id === cfg.renderEngine)!;
  const totalDur      = totalRuntime(frames);
  const elapsedDur    = filledFrames.slice(0,displayIdx).reduce((a,f) => a+f.durationSec, 0);

  useEffect(() => {
    if (!isPlaying) { if (intervalRef.current) clearInterval(intervalRef.current); return; }
    intervalRef.current = setInterval(() => {
      setPlayIdx(p => {
        const next = p + 1;
        if (next >= filledFrames.length) { setIsPlaying(false); return 0; }
        return next;
      });
    }, (filledFrames[playIdx]?.durationSec ?? 5) * 1000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [isPlaying, playIdx, filledFrames]);

  const togglePlay = () => {
    if (!filledFrames.length) return;
    setIsPlaying(p => !p);
    if (!isPlaying) setPlayIdx(0);
  };

  return (
    <div className="relative flex h-full flex-col items-center justify-center overflow-hidden" style={{background:BG_MID}}>
      {/* Ambient glow */}
      {currentFrame?.imageUrl && (
        <div className="pointer-events-none absolute inset-0" style={{
          background: `radial-gradient(ellipse 80% 80% at 50% 50%, ${emotion.color}18, transparent 70%)`,
          transition: "background 0.8s ease",
        }}/>
      )}

      {/* Cinematic viewport */}
      <div className="relative flex flex-col items-center justify-center flex-1 w-full px-4 py-4">
        <div className="relative overflow-hidden shadow-2xl"
          style={{
            aspectRatio: `${aspectData.wr}/${aspectData.hr}`,
            maxHeight: "100%",
            maxWidth: "100%",
            width: cfg.aspect === "16:9" || cfg.aspect === "21:9" ? "100%" : "auto",
            height: cfg.aspect === "9:16" || cfg.aspect === "4:5" || cfg.aspect === "3:4" ? "100%" : "auto",
            borderRadius: 12,
            border: `1px solid ${BORDER_MID}`,
            boxShadow: `0 0 0 1px rgba(255,255,255,0.04), 0 24px 80px rgba(0,0,0,0.7)`,
            background: "#000",
          }}>

          {/* Scene image */}
          <AnimatePresence mode="wait">
            {currentFrame?.imageUrl ? (
              <motion.img key={currentFrame.id}
                initial={{opacity:0,scale:1.04}} animate={{opacity:1,scale:1}} exit={{opacity:0}}
                transition={{duration:0.4}}
                src={currentFrame.imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover"/>
            ) : (
              <motion.div key="empty" initial={{opacity:0}} animate={{opacity:1}}
                className="absolute inset-0 flex flex-col items-center justify-center gap-3"
                style={{background:"rgba(10,5,25,1)"}}>
                <MonitorPlay className="h-12 w-12 text-white/10"/>
                <p className="text-[13px] text-white/20">Upload frames to preview</p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Cinematic letterbox (for 21:9) */}
          {cfg.aspect === "21:9" && (
            <>
              <div className="pointer-events-none absolute top-0 inset-x-0 h-6" style={{background:"#000"}}/>
              <div className="pointer-events-none absolute bottom-0 inset-x-0 h-6" style={{background:"#000"}}/>
            </>
          )}

          {/* Safe zones grid */}
          {showSafeZones && (
            <div className="pointer-events-none absolute inset-0">
              <div className="absolute inset-[10%] border border-white/20 rounded"/>
              <div className="absolute inset-0 border-l border-white/10" style={{left:"33%",right:"67%"}}/>
              <div className="absolute inset-0 border-l border-white/10" style={{left:"67%"}}/>
              <div className="absolute inset-0 border-t border-white/10" style={{top:"33%",bottom:"67%"}}/>
              <div className="absolute inset-0 border-t border-white/10" style={{top:"67%"}}/>
            </div>
          )}

          {/* Top overlay: scene info */}
          {currentFrame && (
            <div className="absolute left-0 right-0 top-0 p-3 flex items-start justify-between pointer-events-none"
              style={{background:"linear-gradient(to bottom,rgba(0,0,0,0.7),transparent)"}}>
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-1.5">
                  <div className="h-2 w-2 rounded-full" style={{background:beat.color}}/>
                  <span className="text-[10px] font-bold uppercase text-white/70">{beat.label}</span>
                </div>
                {currentFrame.title && <p className="text-[12px] font-bold text-white">{currentFrame.title}</p>}
              </div>
              <div className="flex items-center gap-1.5 rounded-md px-2 py-1"
                style={{background:"rgba(0,0,0,0.9)"}}>
                <span className="text-[12px]">{emotion.emoji}</span>
                <span className="text-[10px] font-bold text-white/80">{emotion.label}</span>
              </div>
            </div>
          )}

          {/* Bottom overlay: camera + duration */}
          {currentFrame && (
            <div className="absolute bottom-0 left-0 right-0 p-3 flex items-end justify-between pointer-events-none"
              style={{background:"linear-gradient(to top,rgba(0,0,0,0.8),transparent)"}}>
              <div className="flex items-center gap-1.5">
                <Camera className="h-3 w-3 text-white/50"/>
                <span className="text-[10px] font-semibold text-white/70">
                  {CAMERAS.find(c => c.v === currentFrame.cameraMove)?.label}
                </span>
              </div>
              <span className="text-[11px] font-black text-white">{currentFrame.durationSec}s</span>
            </div>
          )}

          {/* Play button overlay */}
          {filledFrames.length > 0 && (
            <button onClick={togglePlay}
              className="absolute inset-0 flex items-center justify-center opacity-0 transition hover:opacity-100 focus:opacity-100"
              style={{background:"rgba(0,0,0,0.3)"}}>
              <div className="grid h-14 w-14 place-items-center rounded-full"
                style={{background:"rgba(255,255,255,0.9)",boxShadow:"0 8px 32px rgba(0,0,0,0.5)"}}>
                {isPlaying
                  ? <Pause className="h-6 w-6 text-black" fill="currentColor"/>
                  : <Play className="h-6 w-6 text-black ml-1" fill="currentColor"/>}
              </div>
            </button>
          )}
        </div>
      </div>

      {/* Controls bar */}
      <div className="flex w-full shrink-0 items-center gap-2 px-4 pb-3">
        {/* Engine badge */}
        <div className="flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 shrink-0"
          style={{background:GLASS,borderColor:BORDER}}>
          <div className="h-2 w-2 rounded-full" style={{background:engine.gradient}}/>
          <span className="text-[10px] font-bold text-white/60">{engine.name}</span>
        </div>

        {/* Scrubber */}
        <div className="flex flex-1 flex-col gap-1">
          <div className="flex h-6 items-center gap-0.5 overflow-hidden rounded-full"
            style={{background:"rgba(255,255,255,0.05)"}}>
            {filledFrames.map((f,i) => (
              <button key={f.id} onClick={() => { onSelectId(f.id); setPlayIdx(i); }}
                className="relative h-full transition hover:brightness-125"
                style={{
                  flex: f.durationSec,
                  background: i===displayIdx
                    ? BEAT_TYPE_COLORS[f.beatType] || "#7c3aed"
                    : `rgba(255,255,255,${0.06+i*0.01})`,
                }}>
                {f.imageUrl && (
                  <img src={f.imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover opacity-40"/>
                )}
              </button>
            ))}
          </div>
          <div className="flex justify-between text-[9px] text-white/20">
            <span>{fmtTime(elapsedDur)}</span>
            <span>{fmtTime(totalDur)}</span>
          </div>
        </div>

        {/* Control buttons */}
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={() => setPlayIdx(p => Math.max(0,p-1))}
            className="grid h-7 w-7 place-items-center rounded-full text-white/40 transition hover:text-white/80"
            style={{background:GLASS}}>
            <SkipBack className="h-3.5 w-3.5"/>
          </button>
          <button onClick={togglePlay}
            className="grid h-8 w-8 place-items-center rounded-full text-white transition"
            style={{background:ACCENT_GRAD}}>
            {isPlaying ? <Pause className="h-3.5 w-3.5" fill="currentColor"/> : <Play className="h-3.5 w-3.5 ml-0.5" fill="currentColor"/>}
          </button>
          <button onClick={() => setPlayIdx(p => Math.min(filledFrames.length-1,p+1))}
            className="grid h-7 w-7 place-items-center rounded-full text-white/40 transition hover:text-white/80"
            style={{background:GLASS}}>
            <SkipForward className="h-3.5 w-3.5"/>
          </button>
          <button onClick={() => setShowSafeZones(s => !s)}
            className={"grid h-7 w-7 place-items-center rounded-full transition "+(showSafeZones ? "text-cyan-400" : "text-white/30 hover:text-white/60")}
            style={{background:GLASS}}>
            <Grid className="h-3.5 w-3.5"/>
          </button>
        </div>
      </div>
    </div>
  );
}

const BEAT_TYPE_COLORS: Record<string,string> = Object.fromEntries(BEATS.map(b => [b.v, b.color]));

/* ═══════════════════════════════════════════════════════════════════
   GLOBAL SETTINGS PANEL
═══════════════════════════════════════════════════════════════════ */
function GlobalSettingsPanel({
  cfg, frames, onChange, onApplyAll, beginnerMode = false,
}: {
  cfg: GlobalCfg; frames: StudioFrame[];
  onChange: (p: Partial<GlobalCfg>) => void; onApplyAll: () => void;
  beginnerMode?: boolean;
}) {
  const engine = ENGINES.find(e => e.id === cfg.renderEngine)!;
  const [showAdvanced, setShowAdvanced] = React.useState(false);

  return (
    <div className="flex flex-col gap-6 px-4 py-5">
      {/* Beginner mode banner */}
      {beginnerMode && (
        <div className="flex items-center justify-between rounded-2xl border px-4 py-3"
          style={{background:"rgba(139,92,246,0.05)",borderColor:"rgba(139,92,246,0.18)"}}>
          <div>
            <p className="text-[11px] font-bold text-purple-300/80">Beginner Mode</p>
            <p className="text-[9px] text-white/30">Simplified options — switch to Pro for full controls</p>
          </div>
          <div className="h-2 w-2 rounded-full bg-purple-400"/>
        </div>
      )}

      {/* ── Rendering Engine ── */}
      <div>
        <p className="mb-3 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-white/35">
          <Zap className="h-3 w-3"/> Rendering Engine
        </p>
        {beginnerMode ? (
          <div className="flex flex-col gap-2.5">
            {ENGINES.filter(e => e.available).map(e => {
              const sel = cfg.renderEngine === e.id;
              const isRec = e.id === "kling-standard";
              const simpleLabel = isRec ? "Standard" : "Cinematic Pro";
              const simpleDesc = isRec
                ? "Fast results · Good quality · Saves credits"
                : "Best quality · More detailed · Takes longer";
              return (
                <button key={e.id} onClick={() => onChange({renderEngine:e.id})}
                  className="relative overflow-hidden rounded-2xl border text-left transition"
                  style={sel
                    ? {background:"rgba(12,4,30,0.95)",border:`1px solid ${e.glow.replace("0.5","0.55")}`,boxShadow:`0 0 24px -8px ${e.glow}`}
                    : {background:"rgba(255,255,255,0.02)",borderColor:"rgba(255,255,255,0.07)"}}>
                  <div className="absolute left-0 top-0 h-full w-[3px]" style={{background:e.gradient}}/>
                  <div className="px-4 py-3.5">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[14px] font-black text-white">{simpleLabel}</span>
                          {isRec && (
                            <span className="rounded-full px-2 py-0.5 text-[9px] font-bold"
                              style={{background:"rgba(34,197,94,0.15)",border:"1px solid rgba(34,197,94,0.3)",color:"#86efac"}}>
                              ⭐ Recommended
                            </span>
                          )}
                          {sel && (
                            <span className="rounded-full px-2 py-px text-[9px] font-black"
                              style={{background:`${e.glow.replace("0.5","0.18")}`,border:`1px solid ${e.glow.replace("0.5","0.35")}`,color:"#e9d5ff"}}>
                              ✓ Selected
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-[11px] text-white/45">{simpleDesc}</p>
                      </div>
                      <div className="shrink-0 rounded-xl px-2.5 py-2 text-center" style={{background:"rgba(0,0,0,0.35)"}}>
                        <p className="text-[11px] font-black" style={{color:CREDIT_COLOR[e.creditLabel]}}>{e.creditLabel}</p>
                        <p className="text-[9px] text-white/25">credits</p>
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {ENGINES.map(e => {
              const sel = cfg.renderEngine === e.id;
              const GPU_CLR: Record<RenderEngine["gpuIntensity"],string> = {Light:"#22c55e",Medium:"#f59e0b",Heavy:"#f97316",Extreme:"#ef4444"};
              return (
                <button key={e.id} onClick={() => e.available && onChange({renderEngine:e.id})}
                  className={"relative overflow-hidden rounded-2xl border text-left transition "+(
                    !e.available ? "cursor-not-allowed opacity-40" : ""
                  )}
                  style={sel
                    ? {background:"rgba(12,4,30,0.95)",border:`1px solid ${e.glow.replace("0.5","0.55")}`,boxShadow:`0 0 28px -8px ${e.glow}`}
                    : {background:"rgba(255,255,255,0.02)",borderColor:"rgba(255,255,255,0.07)"}}>
                  <div className="absolute left-0 top-0 h-full w-[3px]" style={{background:e.gradient}}/>
                  <div className="pl-4 pr-3 py-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[13px] font-black text-white">{e.name}</span>
                          {!e.available && <span className="rounded-full border border-white/15 px-1.5 py-px text-[9px] text-white/30">Coming Soon</span>}
                          {sel && <span className="rounded-full px-2 py-px text-[9px] font-black" style={{background:`${e.glow.replace("0.5","0.2")}`,border:`1px solid ${e.glow.replace("0.5","0.4")}`,color:"#e9d5ff"}}>● Active</span>}
                        </div>
                        <p className="mt-0.5 text-[10px] text-white/35">{e.tagline}</p>
                      </div>
                      <div className="shrink-0 rounded-lg px-2 py-1 text-center" style={{background:"rgba(0,0,0,0.35)"}}>
                        <p className="text-[8px] text-white/25 leading-none">GPU</p>
                        <p className="text-[11px] font-black leading-tight" style={{color:GPU_CLR[e.gpuIntensity]}}>{e.gpuIntensity}</p>
                      </div>
                    </div>
                    <div className="mt-2.5 grid grid-cols-3 gap-2">
                      {([
                        {label:"Speed",  val:e.speedScore,    color:"#22c55e"},
                        {label:"Realism",val:e.realism,       color:"#3b82f6"},
                        {label:"Cinema", val:e.cinematicRating*10, color:"#a855f7"},
                      ] as {label:string;val:number;color:string}[]).map(({label,val,color}) => (
                        <div key={label}>
                          <div className="mb-1 flex justify-between text-[9px]">
                            <span className="text-white/30">{label}</span>
                            <span className="font-bold" style={{color}}>{Math.round(val/10)}/10</span>
                          </div>
                          <div className="h-1 w-full overflow-hidden rounded-full" style={{background:"rgba(255,255,255,0.08)"}}>
                            <div className="h-full rounded-full transition-all duration-500"
                              style={{width:`${val}%`,background:color,boxShadow:`0 0 4px ${color}`}}/>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="mt-2 flex items-center justify-between text-[10px]">
                      <span className="text-white/25">Best for: <b className="text-white/45">{e.bestFor}</b></span>
                      <span className="font-black" style={{color:CREDIT_COLOR[e.creditLabel]}}>{e.creditLabel} credits/seg</span>
                    </div>
                    <div className="mt-1.5 flex items-center gap-0.5">
                      {Array.from({length:10},(_,i) => (
                        <div key={i} className="h-1.5 flex-1 rounded-full transition"
                          style={{background: i < e.cinematicRating ? e.gradient : "rgba(255,255,255,0.08)"}}/>
                      ))}
                      <span className="ml-1.5 text-[9px] text-white/30">Cinematic</span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Aspect ratio */}
      <div>
        <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.12em] text-white/35">Aspect Ratio</p>
        <div className="grid grid-cols-3 gap-2">
          {ASPECTS.map(({v,label,sub}) => (
            <button key={v} onClick={() => onChange({aspect:v})}
              className={"flex flex-col items-center rounded-2xl border py-3 transition "+(
                cfg.aspect===v ? "border-purple-500/50 bg-purple-500/15 text-white" : "border-white/[0.07] bg-white/[0.03] text-white/50 hover:border-white/12"
              )}>
              <span className="text-sm font-black">{label}</span>
              <span className="text-[9px] opacity-60">{sub}</span>
            </button>
          ))}
        </div>
      </div>

      {/* FPS — Advanced only */}
      {!beginnerMode && <div>
        <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.12em] text-white/35">Frame Rate</p>
        <div className="grid grid-cols-3 gap-2">
          {([24,30,60] as FpsOption[]).map(fps => (
            <button key={fps} onClick={() => onChange({fps})}
              className={"flex flex-col items-center rounded-2xl border py-3 transition "+(
                cfg.fps===fps ? "border-cyan-500/50 bg-cyan-500/12 text-white" : "border-white/[0.07] bg-white/[0.03] text-white/45 hover:border-white/12"
              )}>
              <span className="text-sm font-black">{fps}</span>
              <span className="text-[9px] opacity-60">fps</span>
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-[10px] text-white/20">24fps = cinematic · 30fps = broadcast · 60fps = smooth</p>
      </div>}

      {/* Cinematic style — Advanced only */}
      {!beginnerMode && <div>
        <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.12em] text-white/35">AI Style</p>
        <div className="grid grid-cols-2 gap-2">
          {STYLES.map(({v,label,emoji,desc}) => (
            <button key={v} onClick={() => onChange({globalStyle:v})}
              className={"flex items-center gap-2.5 rounded-2xl border px-3 py-2.5 text-left transition "+(
                cfg.globalStyle===v ? "border-pink-500/40 bg-pink-500/10 text-white" : "border-white/[0.07] bg-white/[0.03] text-white/45 hover:border-white/12"
              )}>
              <span className="text-xl">{emoji}</span>
              <div>
                <p className="text-[12px] font-semibold">{label}</p>
                <p className="text-[9px] text-white/30">{desc}</p>
              </div>
            </button>
          ))}
        </div>
      </div>}

      {/* Export */}
      <div>
        <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.12em] text-white/35">Export Settings</p>
        <div className="mb-3 grid grid-cols-4 gap-2">
          {EXPORT_QUALITIES.map(({v,label,desc}) => (
            <button key={v} onClick={() => onChange({exportQuality:v})}
              className={"flex flex-col items-center rounded-2xl border py-2.5 transition "+(
                cfg.exportQuality===v ? "border-purple-500/50 bg-purple-500/15 text-white" : "border-white/[0.07] bg-white/[0.03] text-white/45 hover:border-white/12"
              )}>
              <span className="text-[12px] font-black">{label}</span>
              <span className="text-[9px] opacity-60">{desc}</span>
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          {(["mp4","mov"] as ExportFormat[]).map(fmt => (
            <button key={fmt} onClick={() => onChange({exportFormat:fmt})}
              className={"flex flex-1 items-center justify-center gap-1.5 rounded-2xl border py-2.5 text-[12px] font-bold uppercase transition "+(
                cfg.exportFormat===fmt ? "border-blue-500/50 bg-blue-500/15 text-blue-200" : "border-white/[0.07] bg-white/[0.03] text-white/40 hover:border-white/12"
              )}>
              <FileVideo className="h-3.5 w-3.5"/>{fmt}
            </button>
          ))}
        </div>
      </div>

      {/* Global prompt */}
      <div>
        <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.12em] text-white/35">Global Cinematic Prompt</p>
        <textarea value={cfg.globalPrompt} onChange={e => onChange({globalPrompt:e.target.value})} rows={3}
          placeholder="Overall mood, setting, visual style — used across all scenes…"
          className="w-full resize-none rounded-2xl border px-3.5 py-3 text-[12px] leading-relaxed text-white placeholder:text-white/25 focus:outline-none"
          style={{background:GLASS,borderColor:BORDER}}/>
      </div>

      {/* Default duration */}
      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/35">Default Duration</p>
          <div className="flex items-center gap-1.5">
            <input type="number" min={MIN_DUR} max={MAX_DUR} value={cfg.defaultDuration}
              onChange={e => { const v = Math.max(MIN_DUR,Math.min(MAX_DUR,+e.target.value)); onChange({defaultDuration:isNaN(v)?MIN_DUR:v}); }}
              className="h-7 w-14 rounded-xl border px-2 text-center text-xs font-black text-white focus:outline-none"
              style={{background:GLASS,borderColor:BORDER}}/>
            <span className="text-[11px] text-white/35">sec</span>
          </div>
        </div>
        <input type="range" min={MIN_DUR} max={MAX_DUR} value={cfg.defaultDuration}
          onChange={e => onChange({defaultDuration:+e.target.value})} className="h-1 w-full accent-purple-500"/>
        <button onClick={onApplyAll}
          className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-2xl border py-2.5 text-[12px] font-semibold text-white/50 transition hover:text-white"
          style={{background:GLASS,borderColor:BORDER}}>
          <Check className="h-3.5 w-3.5"/> Apply {cfg.defaultDuration}s to all {frames.length} scenes
        </button>
      </div>

      {/* Soundtrack */}
      {(!beginnerMode || showAdvanced) && <div>
        <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.12em] text-white/35">Soundtrack</p>
        <div className="grid grid-cols-2 gap-1.5">
          {AMBIENTS.slice(0,6).map(({v,label,icon}) => (
            <button key={v} onClick={() => onChange({soundtrackType:v})}
              className={"flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-[11px] font-semibold transition "+(
                cfg.soundtrackType===v ? "border-emerald-500/40 bg-emerald-500/10 text-white" : "border-white/[0.07] bg-white/[0.03] text-white/40 hover:border-white/12"
              )}>
              <span className="text-[14px]">{icon}</span>{label}
            </button>
          ))}
        </div>
      </div>}
      {beginnerMode && (
        <button onClick={() => setShowAdvanced(s => !s)}
          className="flex items-center justify-center gap-2 rounded-2xl border py-3 text-[11px] font-semibold text-white/40 transition hover:text-white/60"
          style={{background:"rgba(255,255,255,0.03)",borderColor:"rgba(255,255,255,0.07)"}}>
          <ChevronRight className={`h-3.5 w-3.5 transition-transform ${showAdvanced ? "rotate-90" : ""}`}/>
          {showAdvanced ? "Hide Advanced" : "Show Advanced Settings"}
        </button>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   CINEMATIC RENDER SCREEN
═══════════════════════════════════════════════════════════════════ */
function CinematicRenderScreen({
  engine, segmentCount, progress, phaseIdx, etaSec,
  onBackground, planCode, queuePosition,
}: {
  engine: RenderEngine; segmentCount: number; progress: number;
  phaseIdx: number; etaSec: number; onBackground: () => void; planCode: string;
  queuePosition?: number;
}) {
  const priority = PLAN_PRIORITY[planCode] ?? PLAN_PRIORITY.p15;
  const R = 80, C = 2 * Math.PI * R;
  const dash = C - (C * Math.min(progress, 100)) / 100;
  const etaStr = etaSec > 0
    ? etaSec >= 60 ? `${Math.floor(etaSec/60)}m ${etaSec%60}s` : `${etaSec}s`
    : "Almost done…";

  return (
    <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
      className="absolute inset-0 z-50 flex flex-col"
      style={{background:"rgba(0,0,0,0.98)"}}>

      {/* ── Ambient glow layers ── */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <motion.div className="absolute rounded-full"
          style={{width:480,height:480,left:"50%",top:"35%",x:"-50%",y:"-50%",
            background:engine.glow.replace("0.5","0.18"),filter:"blur(90px)"}}
          animate={{scale:[1,1.12,1],opacity:[0.6,1,0.6]}} transition={{repeat:Infinity,duration:4,ease:"easeInOut"}}/>
        <motion.div className="absolute rounded-full"
          style={{width:240,height:240,left:"20%",top:"15%",
            background:"rgba(124,58,237,0.08)",filter:"blur(60px)"}}
          animate={{x:[0,30,0],y:[0,-20,0]}} transition={{repeat:Infinity,duration:7,ease:"easeInOut"}}/>
        <motion.div className="absolute rounded-full"
          style={{width:200,height:200,right:"10%",bottom:"20%",
            background:"rgba(236,72,153,0.07)",filter:"blur(50px)"}}
          animate={{x:[0,-20,0],y:[0,15,0]}} transition={{repeat:Infinity,duration:5.5,ease:"easeInOut"}}/>
        {/* Film grain overlay */}
        <div className="absolute inset-0 opacity-[0.03]"
          style={{backgroundImage:"url('data:image/svg+xml,<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"200\" height=\"200\"><filter id=\"n\"><feTurbulence type=\"fractalNoise\" baseFrequency=\"0.65\" numOctaves=\"3\" stitchTiles=\"stitch\"/><feColorMatrix type=\"saturate\" values=\"0\"/></filter><rect width=\"200\" height=\"200\" filter=\"url(%23n)\" opacity=\"1\"/></svg>')"}}/>
      </div>

      {/* ── Header ── */}
      <div className="relative flex items-center justify-between px-5 pt-5">
        <div className="flex items-center gap-2.5">
          <div className="grid h-9 w-9 place-items-center rounded-xl" style={{background:engine.gradient}}>
            <Clapperboard className="h-4.5 w-4.5 text-white"/>
          </div>
          <div>
            <p className="text-[13px] font-black text-white">{engine.name}</p>
            <p className="text-[11px] text-white/35">{segmentCount} segment{segmentCount!==1?"s":""}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[10px] font-bold"
            style={{background:"rgba(74,222,128,0.08)",border:"1px solid rgba(74,222,128,0.2)",color:"#4ade80"}}>
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-400"/>
            {queuePosition && queuePosition > 0 ? `Queue #${queuePosition}` : "Rendering…"}
          </div>
          <div className="flex items-center gap-1 rounded-full px-2.5 py-1 text-[9px] font-bold"
            style={{background:`${priority.color}18`,border:`1px solid ${priority.color}40`,color:priority.color}}>
            {priority.label}
          </div>
        </div>
      </div>

      {/* ── Glowing progress ring ── */}
      <div className="relative flex flex-1 flex-col items-center justify-center gap-5">
        <div className="relative">
          <svg width="200" height="200" className="-rotate-90">
            {/* Track */}
            <circle cx="100" cy="100" r={R} fill="none"
              stroke="rgba(255,255,255,0.06)" strokeWidth="10"/>
            {/* Glow layer */}
            <motion.circle cx="100" cy="100" r={R} fill="none"
              stroke={engine.glow.replace("0.5","0.3")} strokeWidth="14"
              strokeDasharray={C} strokeDashoffset={dash}
              strokeLinecap="round"
              style={{filter:`drop-shadow(0 0 12px ${engine.glow.replace("0.5","0.9")})`}}
              animate={{strokeDashoffset:dash}} transition={{duration:0.6,ease:"easeOut"}}/>
            {/* Main arc */}
            <motion.circle cx="100" cy="100" r={R} fill="none"
              stroke="url(#ringGrad)" strokeWidth="10"
              strokeDasharray={C} strokeDashoffset={dash}
              strokeLinecap="round"
              animate={{strokeDashoffset:dash}} transition={{duration:0.6,ease:"easeOut"}}/>
            <defs>
              <linearGradient id="ringGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#7c3aed"/>
                <stop offset="50%" stopColor="#ec4899"/>
                <stop offset="100%" stopColor="#3b82f6"/>
              </linearGradient>
            </defs>
          </svg>
          {/* Center content */}
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <motion.p className="text-[32px] font-black text-white leading-none"
              key={Math.round(progress)}
              initial={{scale:0.9,opacity:0.5}} animate={{scale:1,opacity:1}}>
              {Math.round(progress)}%
            </motion.p>
            <p className="mt-1 text-[10px] font-semibold text-white/40">Rendering</p>
          </div>
        </div>

        {/* ETA + current phase */}
        <div className="flex flex-col items-center gap-1">
          <motion.p className="text-[15px] font-black text-white"
            key={phaseIdx}
            initial={{y:8,opacity:0}} animate={{y:0,opacity:1}} transition={{duration:0.3}}>
            {PIPELINE_STAGES[Math.min(phaseIdx, PIPELINE_STAGES.length-1)].label}
          </motion.p>
          <p className="text-[12px] text-white/40">
            {PIPELINE_STAGES[Math.min(phaseIdx, PIPELINE_STAGES.length-1)].detail}
          </p>
          {etaSec > 0 && (
            <div className="mt-1 flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-bold text-white/60"
              style={{background:"rgba(255,255,255,0.06)"}}>
              <Clock className="h-3 w-3"/> ETA {etaStr}
            </div>
          )}
        </div>
      </div>

      {/* ── Pipeline stage list ── */}
      <div className="relative px-5 pb-2">
        <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.12em] text-white/25">Render Pipeline</p>
        <div className="flex flex-col gap-1">
          {PIPELINE_STAGES.map(({label,icon:Icon},i) => {
            const done = i < phaseIdx;
            const active = i === phaseIdx;
            return (
              <motion.div key={i}
                animate={{opacity: done||active ? 1 : 0.3}}
                className="flex items-center gap-2.5 rounded-xl px-3 py-2"
                style={active ? {background:"rgba(124,58,237,0.12)",border:"1px solid rgba(124,58,237,0.25)"} : {}}>
                <div className={"grid h-6 w-6 shrink-0 place-items-center rounded-lg border transition "+(
                  done ? "border-green-500/40 bg-green-500/15"
                    : active ? "border-purple-500/50 bg-purple-500/20"
                    : "border-white/[0.07] bg-transparent"
                )}>
                  {done ? <Check className="h-3 w-3 text-green-400"/>
                    : active
                    ? <motion.div animate={{rotate:360}} transition={{repeat:Infinity,duration:1.2,ease:"linear"}}>
                        <Loader2 className="h-3 w-3 text-purple-400"/>
                      </motion.div>
                    : <Icon className="h-3 w-3 text-white/20"/>}
                </div>
                <span className={`flex-1 text-[11px] font-semibold ${done?"text-green-400/70":active?"text-white":"text-white/25"}`}>
                  {label}
                </span>
                <span className={`text-[10px] ${done?"text-green-500/50":active?"text-purple-400/70":"text-white/15"}`}>
                  {done ? "✓" : active ? "●" : `${Math.round(PIPELINE_STAGES.slice(0,i+1).reduce((a,s)=>a+s.weight,0)*100)}%`}
                </span>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* ── Background rendering CTA ── */}
      <div className="relative px-5 pb-6 pt-3">
        <button onClick={onBackground}
          className="flex w-full items-center justify-center gap-2 rounded-2xl py-3 text-[13px] font-bold text-white/60 transition hover:text-white/80"
          style={{background:"rgba(255,255,255,0.04)",border:`1px solid ${BORDER}`}}>
          <BellRing className="h-4 w-4"/>
          Send to Background · Notify when done
        </button>
        <p className="mt-2 text-center text-[10px] text-white/20">
          You can continue editing while your film renders
        </p>
      </div>
    </motion.div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   RESULT SCREEN
═══════════════════════════════════════════════════════════════════ */
function ResultScreen({
  result, saveStatus, saveError, onClose, onSave, onPlay,
}: {
  result: GenResult&{segmentCount:number}; saveStatus:"idle"|"saving"|"done";
  saveError: string|null; onClose: () => void; onSave: () => void; onPlay: () => void;
}) {
  return (
    <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
      className="absolute inset-0 z-50 flex flex-col" style={{background:"rgba(3,0,10,0.98)"}}>
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-1/3 -translate-x-1/2 -translate-y-1/2 h-96 w-96 rounded-full opacity-20"
          style={{background:GLOW_PURPLE,filter:"blur(100px)"}}/>
      </div>
      <div className="relative flex items-center justify-between p-4">
        <button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-full transition"
          style={{background:GLASS,border:`1px solid ${BORDER}`}}>
          <X className="h-4 w-4 text-white"/>
        </button>
        <div className="text-center">
          <div className="flex items-center justify-center gap-1.5">
            <div className="h-2 w-2 rounded-full bg-green-400" style={{boxShadow:"0 0 8px rgba(74,222,128,0.9)"}}/>
            <p className="text-[13px] font-black text-white">Export Ready</p>
          </div>
          <p className="text-[10px] text-white/35">{result.segmentCount} segments · {result.durationSec}s</p>
        </div>
        <div className="w-9"/>
      </div>
      <div className="relative flex flex-1 items-center justify-center px-8">
        <button onClick={onPlay}
          className="relative w-full max-w-[200px] overflow-hidden shadow-2xl"
          style={{aspectRatio:"9/16",borderRadius:20,border:"1px solid rgba(255,255,255,0.15)"}}>
          <img src={result.url} alt="" className="absolute inset-0 h-full w-full object-cover"/>
          <div className="absolute inset-0" style={{background:"linear-gradient(to bottom,rgba(0,0,0,0.3),transparent 40%,transparent 60%,rgba(0,0,0,0.6))"}}/>
          <div className="absolute inset-0 grid place-items-center">
            <motion.div whileHover={{scale:1.08}} whileTap={{scale:0.94}}
              className="grid h-16 w-16 place-items-center rounded-full bg-white/95 shadow-2xl">
              <Play className="h-7 w-7 text-black ml-1" fill="currentColor"/>
            </motion.div>
          </div>
          <div className="absolute bottom-3 left-3 right-3">
            <div className="flex items-center gap-1.5 rounded-xl px-3 py-2" style={{background:"rgba(0,0,0,0.9)"}}>
              <Check className="h-3 w-3 text-green-400"/>
              <span className="text-[11px] font-bold text-white">Film Ready</span>
            </div>
          </div>
        </button>
      </div>
      <div className="relative flex flex-col gap-2.5 px-5 pt-4" style={{paddingBottom:`calc(env(safe-area-inset-bottom,0px) + 20px)`}}>
        <motion.button whileTap={{scale:0.98}} onClick={onSave} disabled={saveStatus==="saving"}
          className="flex h-14 w-full items-center justify-center gap-2.5 rounded-2xl text-sm font-black text-black disabled:opacity-50"
          style={{background:"linear-gradient(135deg,#fff,#e5e7eb)"}}>
          {saveStatus==="saving" ? <Loader2 className="h-4 w-4 animate-spin"/>
            : saveStatus==="done" ? <Check className="h-4 w-4 text-green-600"/>
            : <Download className="h-4 w-4"/>}
          {saveStatus==="saving" ? "Saving…" : saveStatus==="done" ? "Saved to Device!" : "Save Film to Device"}
        </motion.button>
        {saveError && <p className="text-center text-[11px] text-red-400">{saveError}</p>}
      </div>
    </motion.div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   RENDER HISTORY PANEL
═══════════════════════════════════════════════════════════════════ */
/* ── Map API render job → local history entry ────────────────────── */
interface ApiJob {
  id: string; status: string; render_engine: string; output_url?: string;
  thumbnail_url?: string; duration_sec?: number; failure_reason?: string;
  created_at: string; input_payload?: { images?: string[]; aspect?: string; quality?: string };
}
function apiJobToEntry(job: ApiJob): RenderHistoryEntry {
  const payload = (job.input_payload ?? {}) as { images?: string[]; aspect?: string; quality?: string };
  const frameCount   = (payload.images ?? []).length || 2;
  const segmentCount = Math.max(0, frameCount - 1);
  const validQualities: ExportQuality[] = ["720p", "1080p", "2k", "4k"];
  const quality = validQualities.includes(payload.quality as ExportQuality)
    ? (payload.quality as ExportQuality)
    : "1080p";
  return {
    id:           job.id,
    timestamp:    new Date(job.created_at).getTime(),
    engine:       job.render_engine,
    aspect:       (payload.aspect ?? "9:16") as AspectRatio,
    frameCount,
    segmentCount,
    quality,
    format:       "mp4" as ExportFormat,
    videoUrl:     job.output_url ?? "",
    thumbnailUrl: job.thumbnail_url ?? "",
    durationSec:  job.duration_sec ?? 0,
    status:       job.status === "completed" ? "success" : job.status === "cancelled" ? "cancelled" : "failed",
    errorMessage: job.failure_reason ?? undefined,
    projectTitle: undefined,
    creditsUsed:  0,
  };
}

function RenderHistoryPanel({
  onClose, onRetry, onDuplicate,
}: {
  onClose: () => void;
  onRetry: (e: RenderHistoryEntry) => void;
  onDuplicate: (e: RenderHistoryEntry) => void;
}) {
  const [history, setHistory]   = useState<RenderHistoryEntry[]>(() => loadHistory());
  const [loading, setLoading]   = useState(true);
  const [playing, setPlaying]   = useState<string|null>(null);
  const [filter, setFilter]     = useState<"all"|"success"|"failed">("all");
  const [deletingId, setDeletingId] = useState<string|null>(null);

  /* Load from API on mount, fall back to localStorage */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token ?? null;
        const res = await fetch("/api/render/my-jobs", {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok || cancelled) return;
        const json = await res.json() as { jobs?: ApiJob[] };
        const apiEntries = (json.jobs ?? [])
          .filter(j => ["completed","failed","cancelled"].includes(j.status))
          .map(apiJobToEntry);
        if (!cancelled) {
          setHistory(prev => {
            /* Merge: API is authoritative for IDs it returns; keep local entries not in API */
            const apiIds = new Set(apiEntries.map(e => e.id));
            const localOnly = prev.filter(e => !apiIds.has(e.id));
            return [...apiEntries, ...localOnly];
          });
        }
      } catch { /* silently keep localStorage data */ }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, []);

  const remove = async (id: string) => {
    setDeletingId(id);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token ?? null;
      await fetch(`/api/render/job/${id}`, {
        method:  "DELETE",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
    } catch { /* ignore */ }
    removeHistEntry(id);
    setHistory(h => h.filter(e => e.id !== id));
    setDeletingId(null);
  };

  const retryViaApi = async (e: RenderHistoryEntry) => {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token ?? null;
      await fetch(`/api/render/job/${e.id}/retry`, {
        method:  "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      /* Optimistically remove from history (it's now re-queued) */
      setHistory(h => h.filter(x => x.id !== e.id));
    } catch { /* fall through to UI retry */ }
    onRetry(e);
  };

  const successCount = history.filter(e => e.status === "success").length;
  const failedCount  = history.filter(e => e.status === "failed").length;

  const visible = filter === "all" ? history
    : filter === "success" ? history.filter(e => e.status === "success")
    : history.filter(e => e.status === "failed");

  return (
    <motion.div initial={{x:"100%"}} animate={{x:0}} exit={{x:"100%"}}
      transition={{type:"spring",stiffness:400,damping:38}}
      className="absolute inset-0 z-50 flex flex-col"
      style={{background:"#000000"}}>

      {/* Header */}
      <div className="flex items-center gap-3 border-b px-4 py-3" style={{borderColor:BORDER}}>
        <button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-full transition"
          style={{background:GLASS}}>
          <ArrowLeft className="h-4 w-4 text-white"/>
        </button>
        <div className="flex-1">
          <h2 className="text-sm font-black text-white">Render History</h2>
          <p className="text-[11px] text-white/35">
            {successCount} exported · {failedCount} failed
          </p>
        </div>
        <History className="h-4 w-4 text-white/20"/>
      </div>

      {/* Stats row */}
      {history.length > 0 && (
        <div className="grid grid-cols-3 gap-2 border-b px-4 py-3" style={{borderColor:BORDER}}>
          {[
            {label:"Total",   val:history.length,  color:"text-white/60"},
            {label:"Success", val:successCount,     color:"text-green-400"},
            {label:"Failed",  val:failedCount,      color:"text-red-400"},
          ].map(({label,val,color}) => (
            <div key={label} className="flex flex-col items-center rounded-xl py-2" style={{background:GLASS}}>
              <p className={`text-[18px] font-black ${color}`}>{val}</p>
              <p className="text-[9px] text-white/30">{label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Filter tabs */}
      {history.length > 0 && (
        <div className="flex gap-1.5 border-b px-4 py-2.5" style={{borderColor:BORDER}}>
          <Filter className="h-3.5 w-3.5 text-white/20 self-center mr-1"/>
          {([
            {id:"all" as const,    label:`All (${history.length})`},
            {id:"success" as const,label:`✓ Exports (${successCount})`},
            {id:"failed" as const, label:`✗ Failed (${failedCount})`},
          ]).map(({id,label}) => (
            <button key={id} onClick={() => setFilter(id)}
              className={"rounded-full px-3 py-1 text-[10px] font-bold transition "+(
                filter === id
                  ? "bg-white/10 text-white"
                  : "text-white/30 hover:text-white/50"
              )}>
              {label}
            </button>
          ))}
        </div>
      )}

      {/* List */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {loading ? (
          <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
            <Loader2 className="h-8 w-8 animate-spin text-white/20"/>
            <p className="text-[12px] text-white/30">Loading render history…</p>
          </div>
        ) : !visible.length ? (
          <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
            <History className="h-12 w-12 text-white/10"/>
            <p className="text-sm font-semibold text-white/25">
              {!history.length ? "No films rendered yet" : "No renders match this filter"}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {visible.map(e => {
              const isFailed = e.status === "failed";
              return (
                <div key={e.id} className="overflow-hidden rounded-2xl"
                  style={{
                    background: isFailed ? "rgba(239,68,68,0.04)" : GLASS,
                    border: `1px solid ${isFailed ? "rgba(239,68,68,0.2)" : BORDER}`,
                  }}>
                  <div className="flex items-start gap-3 p-3">
                    {/* Thumbnail / failed state */}
                    <div className="relative h-20 w-14 shrink-0 overflow-hidden rounded-xl border bg-black"
                      style={{borderColor: isFailed ? "rgba(239,68,68,0.25)" : "rgba(255,255,255,0.1)"}}>
                      {!isFailed && e.thumbnailUrl && (
                        <img src={e.thumbnailUrl} alt="" className="absolute inset-0 h-full w-full object-cover" loading="lazy"/>
                      )}
                      {isFailed ? (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1"
                          style={{background:"rgba(239,68,68,0.12)"}}>
                          <AlertTriangle className="h-5 w-5 text-red-400"/>
                          <span className="text-[8px] text-red-400/70 font-bold">FAILED</span>
                        </div>
                      ) : (
                        <button onClick={() => setPlaying(playing===e.id?null:e.id)}
                          className="absolute inset-0 flex items-center justify-center"
                          style={{background:"rgba(0,0,0,0.35)"}}>
                          <Play className="h-4 w-4 text-white" fill="currentColor"/>
                        </button>
                      )}
                    </div>

                    {/* Details */}
                    <div className="flex-1 min-w-0">
                      {/* Title + status badge */}
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {e.projectTitle && (
                          <p className="text-[12px] font-black text-white truncate max-w-[120px]">{e.projectTitle}</p>
                        )}
                        <span className={`rounded-full px-1.5 py-px text-[8px] font-black ${
                          isFailed
                            ? "bg-red-500/15 border border-red-500/30 text-red-400"
                            : "bg-green-500/15 border border-green-500/30 text-green-400"
                        }`}>
                          {isFailed ? "✗ Failed" : "✓ Success"}
                        </span>
                      </div>

                      <p className="text-[11px] text-white/40">
                        {e.frameCount} scenes · {isFailed ? "–" : `${e.durationSec}s`}
                      </p>
                      <p className="text-[10px] text-white/30">{e.engine} · {e.quality.toUpperCase()}</p>
                      <p className="mt-0.5 flex items-center gap-1 text-[10px] text-white/20">
                        <Clock className="h-2.5 w-2.5"/>
                        {new Date(e.timestamp).toLocaleString()}
                        {e.creditsUsed !== undefined && e.creditsUsed > 0 && (
                          <span className="ml-1 text-yellow-500/50">· {e.creditsUsed} cr</span>
                        )}
                      </p>

                      {/* Error message for failed */}
                      {isFailed && e.errorMessage && (
                        <p className="mt-1.5 rounded-lg border border-red-500/15 bg-red-500/08 px-2.5 py-1.5 text-[10px] text-red-400/80 leading-tight">
                          {e.errorMessage.slice(0, 90)}{e.errorMessage.length > 90 ? "…" : ""}
                        </p>
                      )}

                      {/* Action buttons */}
                      <div className="mt-2 flex gap-1.5 flex-wrap">
                        {!isFailed && (
                          <a href={e.videoUrl} download
                            className="flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-[11px] font-semibold text-white/60 transition hover:text-white"
                            style={{background:"rgba(255,255,255,0.06)"}}>
                            <Download className="h-3 w-3"/> Export
                          </a>
                        )}
                        <button onClick={() => retryViaApi(e)}
                          className="flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-[11px] font-semibold transition"
                          style={{
                            background: isFailed ? "rgba(239,68,68,0.12)" : "rgba(124,58,237,0.12)",
                            border: `1px solid ${isFailed ? "rgba(239,68,68,0.25)" : "rgba(124,58,237,0.25)"}`,
                            color: isFailed ? "#f87171" : "#c084fc",
                          }}>
                          <RefreshCw className="h-3 w-3"/> {isFailed ? "Retry" : "Re-render"}
                        </button>
                        <button onClick={() => onDuplicate(e)}
                          className="flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-[11px] font-semibold text-cyan-400/70 transition hover:text-cyan-300"
                          style={{background:"rgba(6,182,212,0.08)",border:"1px solid rgba(6,182,212,0.2)"}}>
                          <Copy className="h-3 w-3"/> Duplicate
                        </button>
                        <button onClick={() => remove(e.id)} disabled={deletingId === e.id}
                          className="ml-auto grid h-7 w-7 place-items-center rounded-xl text-white/20 transition hover:text-red-400 disabled:opacity-40"
                          style={{background:GLASS}}>
                          {deletingId === e.id
                            ? <Loader2 className="h-3 w-3 animate-spin"/>
                            : <Trash2 className="h-3 w-3"/>}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Inline video player */}
                  {playing === e.id && !isFailed && (
                    <div className="border-t p-3" style={{borderColor:BORDER}}>
                      <video src={e.videoUrl} controls autoPlay className="w-full rounded-2xl"/>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </motion.div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   PROJECT RECOVERY PANEL
═══════════════════════════════════════════════════════════════════ */
function ProjectRecoveryPanel({
  frameCount, filledCount, projectId, onReset, onClearCache, onForceSync,
}: {
  frameCount: number; filledCount: number; projectId: string | null;
  onReset: () => void; onClearCache: () => void; onForceSync: () => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [tapCount, setTapCount] = useState(0);
  const [showDebug, setShowDebug] = useState(false);
  const tapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleDiagTap = () => {
    const next = tapCount + 1;
    if (tapTimer.current) clearTimeout(tapTimer.current);
    if (next >= 5) { setShowDebug(s => !s); setTapCount(0); return; }
    setTapCount(next);
    tapTimer.current = setTimeout(() => setTapCount(0), 1500);
  };

  const draftRaw = (() => {
    try { const s = localStorage.getItem(LS_DRAFT); return s ? JSON.parse(s) as {frames?:unknown[]} : null; } catch { return null; }
  })();
  const draftCount = Array.isArray(draftRaw?.frames) ? draftRaw!.frames.length : 0;
  const isCorrupted = frameCount > MAX_FRAMES || (draftCount > MAX_FRAMES);

  return (
    <div className="mx-4 mb-6 mt-2 rounded-2xl border overflow-hidden" style={{borderColor:BORDER,background:"rgba(255,255,255,0.02)"}}>
      <button onClick={() => setExpanded(s => !s)}
        className="flex w-full items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <RotateCcw className="h-3.5 w-3.5 text-white/30"/>
          <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-white/30">Recovery Tools</span>
          {isCorrupted && (
            <span className="rounded-full bg-red-500/20 px-2 py-0.5 text-[10px] font-bold text-red-400">
              State issue
            </span>
          )}
        </div>
        <ChevronDown className={"h-3.5 w-3.5 text-white/20 transition-transform " + (expanded ? "rotate-180" : "")}/>
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-2">
          {/* Diagnostics */}
          <div className="rounded-xl p-3 space-y-1.5 text-[12px]" style={{background:"rgba(255,255,255,0.03)"}}>
            <button onClick={handleDiagTap} className="w-full text-left mb-2">
              <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-white/20">
                Diagnostics {tapCount > 0 ? `— ${5 - tapCount} taps for debug` : ""}
              </span>
            </button>
            {[
              ["Active scenes", `${frameCount} / ${MAX_FRAMES}`, frameCount > MAX_FRAMES],
              ["Filled scenes (images)", String(filledCount), false],
              ["Draft cache scenes", `${draftCount}`, draftCount !== frameCount && draftCount > 0],
              ["Project ID", projectId ? projectId.slice(0, 14) + "…" : "Not saved yet", false],
            ].map(([k, v, warn]) => (
              <div key={k as string} className="flex justify-between gap-2">
                <span className="text-white/35 shrink-0">{k}</span>
                <span className={"font-bold font-mono text-[11px] text-right " + ((warn as boolean) ? "text-amber-400" : "text-white/55")}>{v}</span>
              </div>
            ))}
          </div>

          {/* Debug panel (5-tap unlock) */}
          {showDebug && (
            <div className="rounded-xl p-3 space-y-1.5 border text-[11px]" style={{borderColor:"rgba(234,179,8,0.25)",background:"rgba(234,179,8,0.04)"}}>
              <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-yellow-500/50 mb-2">Debug Mode</p>
              {([
                ["LS draft size", draftRaw ? `${JSON.stringify(draftRaw).length} chars` : "empty"],
                ["LS keys (studio)", Object.keys(localStorage).filter(k => k.startsWith("socia_studio")).join(", ") || "none"],
                ["Draft vs state mismatch", draftCount !== frameCount ? `YES (${draftCount} vs ${frameCount})` : "no"],
                ["User Agent", navigator.userAgent.slice(0, 48) + "…"],
                ["Memory", (performance as unknown as {memory?: {usedJSHeapSize?:number}}).memory?.usedJSHeapSize
                  ? `${Math.round(((performance as unknown as {memory:{usedJSHeapSize:number}}).memory.usedJSHeapSize) / 1024 / 1024)}MB` : "N/A"],
              ] as [string,string][]).map(([k, v]) => (
                <div key={k} className="flex justify-between gap-2">
                  <span className="text-yellow-300/35 shrink-0">{k}</span>
                  <span className="font-bold font-mono text-[10px] text-right text-yellow-300/60 break-all">{v}</span>
                </div>
              ))}
            </div>
          )}

          {/* Action buttons */}
          <button
            onClick={async () => { setSyncing(true); await onForceSync().finally(() => setSyncing(false)); }}
            disabled={syncing}
            className="flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-[12px] font-semibold text-blue-300/80 transition hover:text-blue-200 disabled:opacity-40"
            style={{background:"rgba(59,130,246,0.08)",border:"1px solid rgba(59,130,246,0.15)"}}>
            {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin"/> : <RefreshCw className="h-3.5 w-3.5"/>}
            Force Sync to Server
          </button>

          <button onClick={onClearCache}
            className="flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-[12px] font-semibold text-amber-300/80 transition hover:text-amber-200"
            style={{background:"rgba(245,158,11,0.08)",border:"1px solid rgba(245,158,11,0.15)"}}>
            <Trash2 className="h-3.5 w-3.5"/>
            Clear Corrupted Cache
          </button>

          <button onClick={onReset}
            className="flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-[12px] font-semibold text-red-400/70 transition hover:text-red-300"
            style={{background:"rgba(239,68,68,0.06)",border:"1px solid rgba(239,68,68,0.12)"}}>
            <RotateCcw className="h-3.5 w-3.5"/>
            Reset Entire Project
          </button>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   MAIN — AI FILM DIRECTOR STUDIO
═══════════════════════════════════════════════════════════════════ */
export default function CreateMultiFrame() {
  const [,navigate] = useLocation();
  useAppStore(s => s.user);
  const summary = useBillingStore(s => s.summary);
  const { refresh } = useBillingStore();
  useEffect(() => { refresh(); }, [refresh]);

  /* ─────────── ENGINE AVAILABILITY (server-driven) ───────────
     Fetch /api/engines/availability and override each ENGINES[i].available
     to reflect what the server can ACTUALLY run right now. This is the
     anti-fake rule — the picker must never claim a provider is live
     when its API key isn't configured server-side. Engines not present
     in the server response are left untouched (their hardcoded default
     stands — e.g. anime-motion / hyper-real are studio-only placeholders
     with no backend yet).

     We mutate ENGINES in place (single module, single page) and bump
     `availabilityTick` to force a re-render of the engine picker. */
  const [availabilityTick, setAvailabilityTick] = useState(0);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/engines/availability");
        if (!res.ok) return;
        const body = await res.json() as { engines?: Array<{ id: string; available: boolean; reason?: string }> };
        // Mirror availability + reason into AI_MODELS too — the studio's
        // ModelSelectorModal reads from AI_MODELS (via useSelectedModel),
        // so without this sync the picker would show stale "available"
        // flags from the hardcoded data file even after the server says
        // otherwise. We mutate in-place because AI_MODELS is a module-
        // level singleton consumed across the studio; the modal re-reads
        // on every open and uses availabilityTick to force a re-render.
        try {
          const { AI_MODELS_BY_ID } = await import("@/data/aiModels");
          for (const live of body.engines ?? []) {
            const m = AI_MODELS_BY_ID[live.id as keyof typeof AI_MODELS_BY_ID];
            if (m) {
              m.available = live.available;
              m.unavailableReason = live.available ? undefined : live.reason;
            }
          }
        } catch { /* AI_MODELS sync is best-effort */ }
        if (cancelled || !Array.isArray(body.engines)) return;
        const byId = new Map(body.engines.map(e => [e.id, e]));
        let changed = false;
        for (const e of ENGINES) {
          const live = byId.get(e.id);
          if (live && live.available !== e.available) {
            e.available = live.available;
            changed = true;
          }
        }
        if (changed) setAvailabilityTick(t => t + 1);

        // Reconcile cfg.renderEngine: if the currently-selected engine
        // is now unavailable (e.g. operator removed the provider key,
        // or the user's persisted choice is stale), auto-switch to the
        // first available engine in ENGINES so the Generate button
        // doesn't submit something the server will refuse. We pick by
        // ENGINES order so the studio's curated "best default" wins.
        const liveSelected = byId.get((useStudioModelStore.getState().selectedModelId) as string);
        if (liveSelected && liveSelected.available === false) {
          const fallback = ENGINES.find(e => e.available);
          if (fallback) {
            setCfg(c => c.renderEngine === fallback.id ? c : { ...c, renderEngine: fallback.id as RenderEngineId });
            setStudioSelectedModelId(fallback.id as StudioModelId);
          }
        }
      } catch { /* leave hardcoded defaults */ }
    })();
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // Reference availabilityTick so the linter knows we use it for re-render.
  void availabilityTick;

  /* Plan gate — requires Pro ₱3,000 (p30), or owner bypass */
  const isPaid   = summary ? (summary.plan_code === "p30" || summary.is_owner) : null;
  const planCode = summary?.plan_code ?? "free";

  /* Project state */
  const [projectTitle, setProjectTitle] = useState(() => loadDraft()?.projectTitle ?? "Untitled Film");
  const [editingTitle, setEditingTitle] = useState(false);
  const [modelSelectorOpen, setModelSelectorOpen] = useState(false);
  const studioSelectedModelId    = useStudioModelStore(s => s.selectedModelId);
  const setStudioSelectedModelId = useStudioModelStore(s => s.setSelectedModelId);
  const [cfg, setCfg] = useState<GlobalCfg>(() => {
    const d = loadDraft();
    const base = d ? {...DEFAULT_CFG, ...d.cfg} : DEFAULT_CFG;
    // Hydrate selected model from persisted zustand store so the user's last
    // picked AI model survives reload (overrides both draft and default).
    const persistedRaw = useStudioModelStore.getState().selectedModelId;
    const isKnown = ENGINES.some(e => e.id === persistedRaw);
    return isKnown ? { ...base, renderEngine: persistedRaw as RenderEngineId } : base;
  });

  /* Keep the persisted modelStore in lockstep with cfg.renderEngine — covers
     every path that mutates it (ModelSelector sheet + GlobalSettingsPanel). */
  useEffect(() => {
    if (cfg.renderEngine !== studioSelectedModelId) {
      setStudioSelectedModelId(cfg.renderEngine as StudioModelId);
    }
  }, [cfg.renderEngine, studioSelectedModelId, setStudioSelectedModelId]);
  const [frames, setFrames] = useState<StudioFrame[]>(() => {
    const d = loadDraft();
    if (d && Array.isArray(d.frames) && d.frames.length >= MIN_FRAMES) {
      /* Deduplicate frame IDs and hard-cap at MAX_FRAMES to prevent phantom scene bugs */
      const seen = new Set<string>();
      const cleaned = d.frames.map(f => {
        const norm = normalizeFrame(f);
        if (!norm.id || seen.has(norm.id)) norm.id = Math.random().toString(36).slice(2);
        seen.add(norm.id);
        return norm;
      }).slice(0, MAX_FRAMES);
      if (cleaned.length >= MIN_FRAMES) return cleaned;
    }
    return [
      {...mkFrame(DEFAULT_CFG), title:"Opening Shot"},
      {...mkFrame(DEFAULT_CFG), title:"Scene 2"},
    ];
  });

  /* Selection & view */
  const [selectedId, setSelectedId] = useState<string|null>(null);
  const [mobileView, setMobileView] = useState<MobileView>("scenes");
  const [showLeftPanel, setShowLeftPanel] = useState(false);
  const [showHistory, setShowHistory]     = useState(false);
  const [rightPanelTab, setRightPanelTab] = useState<"settings"|"scene">("settings");
  const [navTool, setNavTool]             = useState<string>("scenes");

  /* Beginner / Pro mode — persisted in localStorage */
  const [beginnerMode, setBeginnerMode]   = useState<boolean>(() =>
    localStorage.getItem("socia_studio_mode_v1") !== "advanced"
  );
  const toggleMode = useCallback(() =>
    setBeginnerMode(m => {
      const next = !m;
      try { localStorage.setItem("socia_studio_mode_v1", next ? "beginner" : "advanced"); } catch {}
      return next;
    }), []);

  /* Upload progress tracking (UI-only) */
  const [uploadProgressMap, setUploadProgressMap] = useState<Record<string, number>>({});

  /* Upload & project persistence */
  const globalInputRef      = useRef<HTMLInputElement>(null);
  const frameInputRef       = useRef<HTMLInputElement>(null);
  const pendingUploadIdRef  = useRef<string | null>(null);
  const triggerFrameUpload  = useCallback((id: string) => {
    pendingUploadIdRef.current = id;
    frameInputRef.current?.click();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const projectIdRef     = useRef<string|null>(null);
  const [isDragging, setIsDragging]   = useState(false);
  const [uploadToast, setUploadToast] = useState<{msg:string;type:"error"|"success"}|null>(null);
  const showToast = (msg: string, type: "error"|"success" = "error") => {
    setUploadToast({msg, type});
    setTimeout(() => setUploadToast(null), 4000);
  };

  /* Auto-save — localStorage (fast) + backend (persistent) */
  const [autoSave, setAutoSave] = useState<"idle"|"saving"|"saved">("idle");
  const draftTimer = useRef<ReturnType<typeof setTimeout>|null>(null);
  useEffect(() => {
    setAutoSave("saving");
    if (draftTimer.current) clearTimeout(draftTimer.current);
    draftTimer.current = setTimeout(() => {
      saveDraft({cfg,frames,savedAt:Date.now(),projectTitle});
      /* Backend save — fire-and-forget, fail silently */
      saveProject({
        projectId: projectIdRef.current ?? undefined,
        title: projectTitle,
        frames: frames as unknown[],
        config: cfg as unknown,
      }).then(r => {
        if (!projectIdRef.current) projectIdRef.current = r.projectId;
      }).catch(() => {});
      setAutoSave("saved");
      setTimeout(() => setAutoSave("idle"), 2500);
    }, 1800);
    return () => { if (draftTimer.current) clearTimeout(draftTimer.current); };
  }, [cfg, frames, projectTitle]);

  /* Gen state */
  const [generating, setGenerating]   = useState(false);
  const [genError, setGenError]       = useState<string|null>(null);
  const [isQuota, setIsQuota]         = useState(false);
  const [result, setResult]           = useState<(GenResult&{segmentCount:number})|null>(null);
  const [videoOpen, setVideoOpen]     = useState(false);
  const [saveStatus, setSaveStatus]   = useState<"idle"|"saving"|"done">("idle");
  const [saveError, setSaveError]     = useState<string|null>(null);
  /* Render pipeline */
  const [renderPhase, setRenderPhase]     = useState(0);
  const [renderProgress, setRenderProgress] = useState(0);
  const [renderETA, setRenderETA]         = useState(0);
  const [backgroundRender, setBackgroundRender] = useState(false);
  const renderTimerRef = useRef<ReturnType<typeof setInterval>|null>(null);
  const abortRef = useRef<AbortController|null>(null);
  /* Real backend render job */
  const [currentJobId, setCurrentJobId] = useState<string|null>(null);
  const renderJob = useRenderJob(currentJobId);
  /* Anti-abuse cooldown */
  const [cooldownSec, setCooldownSec] = useState(0);
  const planCooldownMs = (PLAN_COOLDOWN[planCode] ?? 0) * 1000;
  /* Cooldown countdown */
  useEffect(() => {
    if (!planCooldownMs) return;
    const tick = () => {
      const elapsed = Date.now() - loadCooldown();
      setCooldownSec(Math.max(0, Math.ceil((planCooldownMs - elapsed) / 1000)));
    };
    tick();
    const id = setInterval(tick, 400);
    return () => clearInterval(id);
  }, [planCooldownMs]);
  /* Unmount cleanup */
  useEffect(() => {
    return () => {
      if (renderTimerRef.current) clearInterval(renderTimerRef.current);
      abortRef.current?.abort();
    };
  }, []);

  /* Map real backend stage → PIPELINE_STAGES phaseIdx */
  const STAGE_TO_PHASE: Record<string, number> = {
    queued:                0,
    preparing_assets:      0,
    building_prompt_graph: 1,
    generating_motion:     2,
    voice_synthesis:       3,
    transition_rendering:  4,
    scene_blending:        4,
    color_grading:         5,
    audio_mixing:          5,
    encoding:              6,
    uploading:             6,
    completed:             7,
    failed:                7,
    cancelled:             7,
  };

  /* Sync renderJob Socket.IO events → cinematic render UI state */
  useEffect(() => {
    if (!currentJobId || !generating) return;
    setRenderProgress(renderJob.progress);
    setRenderPhase(STAGE_TO_PHASE[renderJob.stage] ?? 0);
    setRenderETA(renderJob.eta);

    if (renderJob.done) {
      if (renderTimerRef.current) { clearInterval(renderTimerRef.current); renderTimerRef.current = null; }
      if (renderJob.error) {
        setGenError(renderJob.error);
        setIsQuota(renderJob.error.includes("quota") || renderJob.error.includes("QUOTA"));
        appendHistory({
          id: Math.random().toString(36).slice(2), timestamp: Date.now(),
          engine: engine.name, aspect: cfg.aspect, frameCount: filledFrames.length,
          segmentCount, quality: cfg.exportQuality, format: cfg.exportFormat,
          videoUrl: "", thumbnailUrl: "", durationSec: 0,
          status: "failed", errorMessage: renderJob.error, projectTitle, creditsUsed: 0,
        });
      } else if (renderJob.outputUrl) {
        const syntheticResult: GenResult & { segmentCount: number } = {
          url:         renderJob.thumbnailUrl ?? renderJob.outputUrl ?? "",
          videoUrl:    renderJob.outputUrl ?? undefined,
          type:        "video",
          durationSec: renderJob.durationSec ?? 0,
          prompt:      cfg.globalPrompt,
          segmentCount,
        };
        setResult(syntheticResult);
        appendHistory({
          id: Math.random().toString(36).slice(2), timestamp: Date.now(),
          engine: engine.name, aspect: cfg.aspect, frameCount: filledFrames.length,
          segmentCount, quality: cfg.exportQuality, format: cfg.exportFormat,
          videoUrl: renderJob.outputUrl, thumbnailUrl: renderJob.thumbnailUrl ?? "",
          durationSec: renderJob.durationSec ?? 0,
          status: "success", projectTitle, creditsUsed: credits,
        });
      }
      setGenerating(false);
      setBackgroundRender(false);
      setCurrentJobId(null);
      refresh();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [renderJob.stage, renderJob.progress, renderJob.done, renderJob.error, currentJobId]);

  /* Derived */
  const filledFrames = useMemo(() => frames.filter(f => f.imageUrl), [frames]);
  const segmentCount = useMemo(() => Math.max(0, filledFrames.length - 1), [filledFrames]);
  const canGenerate  = !generating && cooldownSec === 0 && filledFrames.length >= MIN_FRAMES && frames.every(f => !f.uploading);
  const priority     = PLAN_PRIORITY[planCode] ?? PLAN_PRIORITY.p15;
  const credits      = estCredits(cfg.renderEngine, segmentCount);
  const engine       = ENGINES.find(e => e.id === cfg.renderEngine)!;
  const selectedFrame = frames.find(f => f.id === selectedId) ?? null;

  /* Handlers */
  const updateCfg   = useCallback((p: Partial<GlobalCfg>)  => setCfg(c => ({...c,...p})), []);
  const updateFrame = useCallback((id: string, p: Partial<StudioFrame>) =>
    setFrames(prev => prev.map(f => f.id === id ? {...f,...p} : f)), []);

  const addFrame = useCallback(() => {
    if (frames.length >= MAX_FRAMES) return;
    const f = {...mkFrame(cfg), title:`Scene ${frames.length + 1}`};
    setFrames(p => [...p, f]);
    setSelectedId(f.id);
    if (mobileView === "director") setMobileView("scenes");
  }, [frames.length, cfg, mobileView]);

  const removeFrame = useCallback((id: string) => {
    if (frames.length <= MIN_FRAMES) return;
    setFrames(p => p.filter(f => f.id !== id));
    if (selectedId === id) setSelectedId(null);
  }, [frames.length, selectedId]);

  const duplicateFrame = useCallback((id: string) => {
    if (frames.length >= MAX_FRAMES) return;
    setFrames(p => {
      const idx = p.findIndex(f => f.id === id);
      if (idx < 0) return p;
      const copy = {...p[idx], id:Math.random().toString(36).slice(2), title:`${p[idx].title} (copy)`};
      return [...p.slice(0,idx+1), copy, ...p.slice(idx+1)];
    });
  }, [frames.length]);

  /* ── Project recovery / reset handlers ── */
  const resetProject = useCallback(() => {
    if (!window.confirm("Reset project? All scenes, uploads, and cached data will be cleared. This cannot be undone.")) return;
    try {
      localStorage.removeItem(LS_DRAFT);
      localStorage.removeItem(LS_HISTORY);
      localStorage.removeItem(LS_COOLDOWN);
    } catch {}
    const fresh = [
      {...mkFrame(DEFAULT_CFG), title:"Opening Shot"},
      {...mkFrame(DEFAULT_CFG), title:"Scene 2"},
    ];
    setFrames(fresh);
    setSelectedId(null);
    setCfg(DEFAULT_CFG);
    setProjectTitle("Untitled Film");
    projectIdRef.current = null;
    setResult(null);
    setGenerating(false);
    setCurrentJobId(null);
    setMobileView("scenes");
    showToast("Project reset — starting fresh.", "success");
  }, [showToast]);

  const clearCorruptedState = useCallback(() => {
    try {
      localStorage.removeItem(LS_DRAFT);
      localStorage.removeItem(LS_HISTORY);
      localStorage.removeItem(LS_COOLDOWN);
    } catch {}
    const seen = new Set<string>();
    setFrames(prev => {
      const deduped = prev
        .map(f => {
          if (!f.id || seen.has(f.id)) { f = {...f, id:Math.random().toString(36).slice(2)}; }
          seen.add(f.id);
          return f;
        })
        .slice(0, MAX_FRAMES);
      return deduped.length >= MIN_FRAMES ? deduped
        : [{...mkFrame(DEFAULT_CFG),title:"Opening Shot"},{...mkFrame(DEFAULT_CFG),title:"Scene 2"}];
    });
    showToast("Corrupted cache cleared.", "success");
  }, [showToast]);

  const forceSyncProject = useCallback(async () => {
    try {
      saveDraft({cfg, frames, savedAt:Date.now(), projectTitle});
      const r = await saveProject({
        projectId: projectIdRef.current ?? undefined,
        title: projectTitle,
        frames: frames as unknown[],
        config: cfg as unknown,
      });
      if (!projectIdRef.current) projectIdRef.current = r.projectId;
      showToast("Project synced to server.", "success");
    } catch {
      showToast("Sync failed — check connection.", "error");
    }
  }, [cfg, frames, projectTitle, showToast]);

  const uploadFile = useCallback(async (id: string, file: File) => {
    /* Validate type */
    const valid = /^image\/(jpeg|jpg|png|webp)$/i.test(file.type) || /\.(jpg|jpeg|png|webp)$/i.test(file.name);
    if (!valid) {
      showToast("Only JPG, PNG, or WebP images are supported", "error");
      return;
    }
    /* Simulate upload progress */
    let pct = 0;
    setUploadProgressMap(prev => ({...prev, [id]: 0}));
    const progressInterval = setInterval(() => {
      pct = Math.min(88, pct + (88 - pct) * 0.1);
      setUploadProgressMap(prev => ({...prev, [id]: Math.round(pct)}));
    }, 200);
    const clearProgress = (snap100 = false) => {
      clearInterval(progressInterval);
      if (snap100) {
        setUploadProgressMap(prev => ({...prev, [id]: 100}));
        setTimeout(() => setUploadProgressMap(prev => { const n = {...prev}; delete n[id]; return n; }), 600);
      } else {
        setUploadProgressMap(prev => { const n = {...prev}; delete n[id]; return n; });
      }
    };

    updateFrame(id, {uploading:true, uploadError:undefined});
    try {
      const blob = await compressImage(file).catch(() => file);
      const path = `multiframe/${Date.now()}_${id}.jpg`;
      const {data,error} = await supabase.storage.from("chat-images").upload(path, blob, {upsert:true, contentType:"image/jpeg"});
      if (error || !data) throw new Error(error?.message ?? "Upload failed");
      clearProgress(true);
      const {data:urlData} = supabase.storage.from("chat-images").getPublicUrl(data.path);
      updateFrame(id, {imageUrl:urlData.publicUrl, uploading:false});
    } catch (e) {
      clearProgress();
      const msg = (e as {message?:string}).message || "Upload failed";
      updateFrame(id, {uploading:false, uploadError:msg});
      showToast(`Upload failed — tap the scene to retry`, "error");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [updateFrame]);

  /* Multi-file upload — creates new scenes for each file */
  const handleGlobalFiles = useCallback((files: FileList | File[]) => {
    const fileArr = Array.from(files).filter(f =>
      /^image\/(jpeg|jpg|png|webp)$/i.test(f.type) || /\.(jpg|jpeg|png|webp)$/i.test(f.name)
    );
    if (!fileArr.length) {
      showToast("Only JPG, PNG, or WebP images are supported", "error");
      return;
    }
    setFrames(prev => {
      const slots = MAX_FRAMES - prev.length;
      if (slots <= 0) {
        showToast(`Maximum ${MAX_FRAMES} scenes reached`, "error");
        return prev;
      }
      const toProcess = fileArr.slice(0, slots);
      const newFrames = toProcess.map((file, i) => {
        const f = {...mkFrame(cfg), title: `Scene ${prev.length + i + 1}`};
        /* Kick off upload after this render — frame will be in state by then */
        setTimeout(() => uploadFile(f.id, file), 0);
        return f;
      });
      /* Select the first new scene */
      setTimeout(() => setSelectedId(newFrames[0]?.id ?? null), 50);
      return [...prev, ...newFrames];
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg, uploadFile]);

  const cancelRender = () => {
    abortRef.current?.abort();
    if (renderTimerRef.current) { clearInterval(renderTimerRef.current); renderTimerRef.current = null; }
    // Cancel the real backend job if one exists
    if (currentJobId) {
      (async () => {
        try {
          const { data: sessionData } = await supabase.auth.getSession();
          const token = sessionData.session?.access_token ?? null;
          await fetch(`/api/render/job/${currentJobId}/cancel`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
          });
        } catch { /* ignore — job will expire naturally */ }
      })();
      setCurrentJobId(null);
    }
    setGenerating(false); setBackgroundRender(false); setRenderProgress(0); setRenderPhase(0);
    appendHistory({
      id:Math.random().toString(36).slice(2), timestamp:Date.now(),
      engine:engine.name, aspect:cfg.aspect, frameCount:filledFrames.length,
      segmentCount, quality:cfg.exportQuality, format:cfg.exportFormat,
      videoUrl:"", thumbnailUrl:"", durationSec:0,
      status:"cancelled", errorMessage:"Cancelled by user", projectTitle, creditsUsed:0,
    });
  };

  const generate = async () => {
    if (!canGenerate) return;
    saveCooldown();
    setGenerating(true); setGenError(null); setIsQuota(false); setResult(null);
    setRenderPhase(0); setRenderProgress(0); setRenderETA(segmentCount * 65);
    setBackgroundRender(false);

    try {
      const ordered = frames.filter(f => f.imageUrl);
      const images  = ordered.map(f => f.imageUrl!);
      const prompts = ordered.map(f => buildSegmentPrompt(f, cfg));
      const lumaAspect = (cfg.aspect==="16:9"?"16:9":cfg.aspect==="1:1"?"1:1":"9:16") satisfies "9:16"|"16:9"|"1:1";

      /* ── Extract voice tracks from frames that have dialogue ── */
      const frameVoiceTracks: FrameVoiceTrack[] = ordered
        .map((f, i) => ({
          sceneIndex:   i,
          dialogueText: f.dialogue.trim(),
          voiceType:    f.characterVoice,
          emotion:      f.emotion,
          language:     "en",
        }))
        .filter(t => t.dialogueText.length > 0);

      /* ── Per-frame beat + direction + continuity payloads ───
         Index aligns with `ordered` (i.e. with `images[]`). Frame N's
         data describes the segment that animates frame N → frame N+1,
         so only the first N-1 entries actually matter — but we send all
         N for clarity. The backend's `composeSegmentPrompt` reads only
         the first segmentCount entries. */
      const frameBeats = ordered.map(f => f.beats.map(b => ({
        startSec:        b.startSec,
        endSec:          b.endSec,
        cameraMove:      b.cameraMove,
        motionStrength:  b.motionStrength,
        facialBehavior:  b.facialBehavior,
        effect:          b.effect,
      })));
      const frameDirections = ordered.map(f => ({
        cameraMove:     f.cameraMove,
        motionStrength: f.motionStrength,
        emotion:        f.emotion,
      }));
      const frameContinuity = ordered.map(f => ({
        keepFace:          f.keepFace,
        keepOutfit:        f.keepOutfit,
        keepHairstyle:     f.keepHairstyle,
        keepEnvironment:   f.keepEnvironment,
        keepLighting:      f.keepLighting,
        keepCinematicTone: f.keepCinematicTone,
      }));
      /* Project grade: use the first frame's grade as the project grade.
         FFmpeg bakes it into the entire exported MP4. */
      const projectColorGrade = ordered[0]?.colorGrade ?? "none";
      /* Burn captions when any frame has subtitlesEnabled AND we have
         dialogue lines to display. The backend confirms both. */
      const subtitlesEnabled = ordered.some(f => f.subtitlesEnabled) && frameVoiceTracks.length > 0;

      /* ── Submit async render job to real backend ── */
      const { jobId } = await submitRenderJob({
        images,
        framePrompts:      prompts,
        globalPrompt:      cfg.globalPrompt,
        aspect:            lumaAspect,
        renderEngine:      cfg.renderEngine,
        quality:           cfg.exportQuality,
        format:            cfg.exportFormat,
        codec:             "h264",
        transition:        cfg.defaultTransition,
        soundtrackType:    cfg.soundtrackType,
        frameVoiceTracks:  frameVoiceTracks.length > 0 ? frameVoiceTracks : undefined,
        frameBeats,
        frameDirections,
        frameContinuity,
        projectColorGrade,
        subtitlesEnabled,
      });

      /* Store job ID — the useRenderJob hook picks up Socket.IO events
         and drives renderPhase/renderProgress/renderETA via the sync useEffect above. */
      setCurrentJobId(jobId);
      // generating stays true until the useEffect sees renderJob.done
    } catch (err) {
      const e = err as {message?:string;code?:string};
      const msg = e.message || "Failed to start render job.";
      setGenError(msg);
      setIsQuota(e.code === "QUOTA_EXCEEDED");
      appendHistory({
        id:Math.random().toString(36).slice(2), timestamp:Date.now(),
        engine:engine.name, aspect:cfg.aspect, frameCount:filledFrames.length,
        segmentCount, quality:cfg.exportQuality, format:cfg.exportFormat,
        videoUrl:"", thumbnailUrl:"", durationSec:0,
        status:"failed", errorMessage:msg, projectTitle, creditsUsed:0,
      });
      setGenerating(false);
      setBackgroundRender(false);
    }
  };

  const onSave = async () => {
    if (!result?.videoUrl || saveStatus==="saving") return;
    setSaveStatus("saving"); setSaveError(null);
    try {
      await saveToDevice(result.videoUrl, {kind:"video", filename:`${projectTitle.replace(/\s+/g,"-").toLowerCase()}-${cfg.exportQuality}`});
      setSaveStatus("done"); setTimeout(() => setSaveStatus("idle"), 2500);
    } catch (e) {
      setSaveError((e as {message?:string}).message || "Couldn't save.");
      setSaveStatus("idle");
    }
  };

  /* ── Loading ── */
  if (isPaid === null) return (
    <div className="flex h-full items-center justify-center" style={{background:BG_DEEP}}>
      <div className="flex flex-col items-center gap-4">
        <div className="grid h-16 w-16 place-items-center rounded-3xl" style={{background:ACCENT_GRAD}}>
          <Clapperboard className="h-8 w-8 text-white"/>
        </div>
        <Loader2 className="h-5 w-5 animate-spin text-purple-400"/>
      </div>
    </div>
  );

  /* ── Paywall ── */
  if (!isPaid) return (
    <div className="flex h-full flex-col" style={{background:BG_DEEP}}>
      <div className="sticky top-0 z-20 flex items-center gap-3 px-4"
        style={{paddingTop:`calc(env(safe-area-inset-top,0px) + 12px)`,paddingBottom:12,background:"#000000",borderBottom:`1px solid ${BORDER}`}}>
        <button onClick={() => navigate("/create")} className="grid h-9 w-9 place-items-center rounded-full"
          style={{background:GLASS,border:`1px solid ${BORDER}`}}>
          <ArrowLeft className="h-4 w-4 text-white"/>
        </button>
        <h2 className="flex-1 text-center font-display text-base font-black text-white">AI Film Director Studio</h2>
        <div className="grid h-9 w-9 place-items-center rounded-full"
          style={{background:"rgba(245,158,11,0.12)",border:"1px solid rgba(245,158,11,0.3)"}}>
          <Lock className="h-3.5 w-3.5 text-yellow-400"/>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto"><CinematicPaywall/></div>
    </div>
  );

  /* ══════════════════════════════════════════════════════════
     STUDIO UI — 5-panel director layout
  ══════════════════════════════════════════════════════════ */

  /* ── TIMELINE section (shared between mobile & desktop) ── */
  const TimelineStrip = (
    <div className="flex flex-col" style={{background:"rgba(4,0,14,0.95)"}}>
      {/* Timeline header */}
      <div className="flex items-center justify-between px-4 py-2 shrink-0" style={{borderBottom:`1px solid ${BORDER}`}}>
        <div className="flex items-center gap-2">
          <Film className="h-3.5 w-3.5 text-white/30"/>
          <span className="text-[11px] font-bold text-white/45">{frames.length} scenes · {fmtTime(totalRuntime(frames))}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-white/25">{cfg.aspect} · {cfg.fps}fps · {cfg.exportQuality.toUpperCase()}</span>
        </div>
      </div>
      {/* Filmstrip */}
      <div className="overflow-x-auto hide-scrollbar" style={{willChange:"transform"}}>
        <div className="flex items-start px-4 pt-3 pb-3" style={{gap:0,transform:"translateZ(0)"}}>
          <Reorder.Group axis="x" values={frames} onReorder={setFrames}
            className="flex" style={{gap:0,listStyle:"none",padding:0}}>
            {frames.map((frame,i) => (
              <div key={frame.id} className="flex shrink-0 items-center">
                <SceneCard
                  frame={frame} index={i} isSelected={selectedId===frame.id} total={frames.length}
                  uploadProgress={uploadProgressMap[frame.id]}
                  onSelect={() => {
                    setSelectedId(selectedId===frame.id ? null : frame.id);
                    if (selectedId !== frame.id) {
                      if (window.innerWidth < 1024) setMobileView("director");
                    }
                  }}
                  onPickFile={f => uploadFile(frame.id, f)}
                  onRemove={() => removeFrame(frame.id)}
                  onDuplicate={() => duplicateFrame(frame.id)}/>
                {i < frames.length-1 && (
                  <TransitionConnector frame={frame}
                    onClick={() => setSelectedId(frame.id)}/>
                )}
              </div>
            ))}
          </Reorder.Group>
          {/* Add scene */}
          {frames.length < MAX_FRAMES && (
            <motion.button whileTap={{scale:0.95}} onClick={addFrame}
              className="flex shrink-0 flex-col items-center justify-center gap-2 rounded-2xl transition"
              style={{width:CARD_W, height:CARD_H, background:"rgba(139,92,246,0.06)", border:"1px dashed rgba(139,92,246,0.3)", marginLeft:4}}>
              <div className="grid h-11 w-11 place-items-center rounded-2xl" style={{background:"rgba(139,92,246,0.15)"}}>
                <Plus className="h-6 w-6 text-purple-400"/>
              </div>
              <span className="text-[10px] font-bold text-purple-400/70">Add Scene</span>
              <span className="text-[9px] text-white/20">{frames.length}/{MAX_FRAMES}</span>
            </motion.button>
          )}
        </div>
      </div>
    </div>
  );

  /* ── GENERATE BAR (compact 3-part action row) ── */
  const estMinutes = segmentCount > 0 ? Math.max(1, Math.ceil(segmentCount * 0.5)) : 0;

  return (
    <div className="relative flex h-full flex-col overflow-hidden" style={{background:BG_DEEP}}>
      {/* Ambient background glows — GPU-composited on own layer */}
      <div className="pointer-events-none absolute inset-0" style={{willChange:"transform",transform:"translateZ(0)"}}>
        <div className="absolute -right-32 -top-32 h-96 w-96 rounded-full opacity-8" style={{background:GLOW_PURPLE,filter:"blur(100px)",willChange:"opacity"}}/>
        <div className="absolute -bottom-32 -left-32 h-96 w-96 rounded-full opacity-8" style={{background:GLOW_PINK,filter:"blur(100px)",willChange:"opacity"}}/>
      </div>

      {/* ══ TOP TOOLBAR ══ */}
      <div className="relative z-20 flex items-center gap-2 px-3 shrink-0"
        style={{paddingTop:`calc(env(safe-area-inset-top,0px) + 10px)`,paddingBottom:10,background:"#000000",borderBottom:`1px solid ${BORDER}`}}>
        {/* Back */}
        <button onClick={() => navigate("/create")}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full transition active:scale-95"
          style={{background:GLASS,border:`1px solid ${BORDER}`}}>
          <ArrowLeft className="h-4 w-4 text-white"/>
        </button>

        {/* Studio logo — desktop only */}
        <div className="hidden lg:flex shrink-0 items-center gap-2">
          <div className="grid h-8 w-8 place-items-center rounded-xl"
            style={{background:"linear-gradient(135deg,#7c3aed,#ec4899)"}}>
            <Clapperboard className="h-4 w-4 text-white"/>
          </div>
          <div className="flex flex-col leading-none">
            <span className="text-[11px] font-black uppercase tracking-[0.12em] text-white">AI Cinematic</span>
            <span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-white/35">Studio</span>
          </div>
        </div>


        {/* Project title */}
        <div className="flex min-w-0 flex-1 flex-col items-center">
          {editingTitle ? (
            <input
              autoFocus
              value={projectTitle}
              onChange={e => setProjectTitle(e.target.value)}
              onBlur={() => setEditingTitle(false)}
              onKeyDown={e => e.key==="Enter" && setEditingTitle(false)}
              className="w-full max-w-[200px] rounded-xl border bg-transparent px-3 py-1.5 text-center text-[14px] font-black text-white focus:outline-none"
              style={{borderColor:"rgba(139,92,246,0.5)"}}/>
          ) : (
            <button onClick={() => setEditingTitle(true)} className="group flex items-center gap-1.5">
              <span className="font-display text-[14px] font-black text-white">{projectTitle}</span>
            </button>
          )}
          {/* Auto-save indicator */}
          <div className="flex items-center gap-1 mt-0.5">
            {autoSave === "saving" && <Loader2 className="h-2.5 w-2.5 animate-spin text-white/25"/>}
            {autoSave === "saved"  && <Circle className="h-2 w-2 fill-green-500 text-green-500"/>}
            <span className="text-[9px] text-white/25">
              {autoSave==="saving" ? "Saving…" : autoSave==="saved" ? "Saved just now" : `${filledFrames.length}/${MAX_FRAMES} scenes`}
            </span>
          </div>
        </div>

        {/* ── AI Model selector pill ── */}
        {(() => {
          const activeEngine = ENGINES.find(e => e.id === cfg.renderEngine) ?? ENGINES[0];
          const cover = MODEL_COVERS[cfg.renderEngine];
          return (
            <motion.button
              onClick={() => setModelSelectorOpen(true)}
              whileTap={{ scale: 0.95 }}
              className="group flex items-center gap-2 rounded-full shrink-0 transition"
              style={{
                padding: "4px 12px 4px 4px",
                background: "rgba(176,38,255,0.10)",
                border: "1px solid rgba(176,38,255,0.30)",
                boxShadow: "0 0 14px rgba(176,38,255,0.18)",
              }}
              title="Choose AI Model"
            >
              <div style={{
                width: 26, height: 26, borderRadius: "50%",
                overflow: "hidden",
                background: activeEngine.gradient,
                border: "1px solid rgba(176,38,255,0.45)",
                flexShrink: 0,
              }}>
                {cover && <img src={cover} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} draggable={false} />}
              </div>
              <div className="flex flex-col items-start leading-none">
                <span style={{ fontSize: 8, fontWeight: 800, letterSpacing: "0.12em", color: "rgba(176,38,255,0.85)", textTransform: "uppercase" }}>Model</span>
                <span className="text-[11px] font-black text-white max-w-[90px] truncate">{activeEngine.name}</span>
              </div>
              <ChevronDown className="h-3 w-3 text-purple-300/70" />
            </motion.button>
          );
        })()}

        {/* Real account credits */}
        {summary?.credits !== undefined && (
          <button onClick={() => navigate("/billing")}
            className="flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 shrink-0 transition active:scale-95"
            style={{background:"rgba(124,58,237,0.08)",borderColor:"rgba(124,58,237,0.25)"}}>
            <Zap className="h-3 w-3 text-purple-400" fill="currentColor"/>
            <span className="text-[11px] font-bold text-purple-200">
              {summary.credits.toLocaleString()}
            </span>
          </button>
        )}

        {/* Background render badge */}
        {generating && backgroundRender && (
          <motion.div initial={{scale:0.8,opacity:0}} animate={{scale:1,opacity:1}}
            className="flex items-center gap-1 rounded-full text-[11px] font-bold"
            style={{background:"rgba(124,58,237,0.12)",border:"1px solid rgba(124,58,237,0.3)"}}>
            <button onClick={() => setBackgroundRender(false)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-purple-300 transition hover:text-white">
              <Loader2 className="h-3 w-3 animate-spin"/>
              {Math.round(renderProgress)}%
            </button>
            <button onClick={cancelRender}
              className="flex items-center gap-1 border-l border-purple-500/20 px-2 py-1.5 text-red-400/60 transition hover:text-red-400"
              title="Cancel render">
              <X className="h-3 w-3"/>
            </button>
          </motion.div>
        )}

        {/* Beginner / Pro mode toggle */}
        <button onClick={toggleMode}
          title={beginnerMode ? "Switch to Pro Mode" : "Switch to Beginner Mode"}
          className="hidden sm:flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[10px] font-bold transition shrink-0"
          style={beginnerMode
            ? {background:"rgba(139,92,246,0.1)",borderColor:"rgba(139,92,246,0.3)",color:"#c4b5fd"}
            : {background:GLASS,borderColor:BORDER,color:"rgba(255,255,255,0.4)"}}>
          {beginnerMode ? "Beginner" : "Pro Mode"}
        </button>

        {/* Export button */}
        {result?.videoUrl && (
          <button onClick={() => saveToDevice(result.videoUrl ?? "", {kind:"video",filename:`${projectTitle.replace(/\s+/g,"-").toLowerCase()}-${cfg.exportQuality}`})}
            className="hidden sm:flex items-center gap-1.5 rounded-xl border px-3 py-2 text-[11px] font-bold text-white transition active:scale-95"
            style={{background:"rgba(124,58,237,0.15)",borderColor:"rgba(124,58,237,0.4)"}}>
            <Download className="h-3.5 w-3.5"/>
            Export
          </button>
        )}

        {/* History */}
        <button onClick={() => setShowHistory(true)}
          className="relative grid h-9 w-9 shrink-0 place-items-center rounded-full transition hover:text-white/80"
          style={{background:GLASS,border:`1px solid ${BORDER}`}}>
          <History className="h-4 w-4 text-white/45"/>
          {loadHistory().some(e => e.status === "failed") && (
            <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-red-500"
              style={{boxShadow:"0 0 6px rgba(239,68,68,0.8)"}}/>
          )}
        </button>
      </div>

      {/* ══ MAIN CONTENT AREA ══ */}
      <div className="relative flex min-h-0 flex-1 overflow-hidden"
        onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
        onDragEnter={e => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragging(false); }}
        onDrop={e => { e.preventDefault(); setIsDragging(false); if (e.dataTransfer.files.length) handleGlobalFiles(e.dataTransfer.files); }}>
        {/* Drag-and-drop overlay */}
        <AnimatePresence>
          {isDragging && (
            <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
              className="pointer-events-none absolute inset-0 z-50 flex flex-col items-center justify-center gap-4"
              style={{background:"rgba(124,58,237,0.18)",border:"2px dashed rgba(139,92,246,0.7)",borderRadius:16}}>
              <Upload className="h-14 w-14 text-purple-300"/>
              <p className="font-display text-2xl font-black text-white">Drop photos to add scenes</p>
              <p className="text-sm text-white/50">JPG · PNG · WebP — up to {MAX_FRAMES} scenes</p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── LEFT NAV SIDEBAR (desktop, always visible, icon-only) ── */}
        <div className="hidden lg:flex h-full w-[52px] shrink-0 flex-col items-center border-r py-2 gap-0.5"
          style={{borderColor:BORDER,background:"rgba(4,0,14,0.98)"}}>
          {([
            {id:"scenes",      label:"Scenes",      icon:Layers},
            {id:"media",       label:"Media",       icon:ImageIcon},
            {id:"transitions", label:"Transitions", icon:Film},
            {id:"filters",     label:"Filters",     icon:Sliders},
          ] as {id:string;label:string;icon:typeof Layers}[]).map(({id,label,icon:Icon}) => (
            <button key={id}
              title={label}
              onClick={() => setNavTool(id)}
              className="group relative flex h-11 w-11 flex-col items-center justify-center rounded-xl transition-all"
              style={navTool===id
                ? {background:"rgba(124,58,237,0.18)",color:"#c4b5fd"}
                : {color:"rgba(255,255,255,0.28)"}}>
              <Icon className="h-4.5 w-4.5"/>
              {navTool===id && (
                <motion.div layoutId="nav-indicator"
                  className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-r-full"
                  style={{background:"#8b5cf6"}}/>
              )}
            </button>
          ))}
          <div className="flex-1"/>
          {/* Settings at bottom */}
          <button
            title="Settings"
            onClick={() => { setNavTool("settings"); setRightPanelTab("settings"); }}
            className="flex h-11 w-11 flex-col items-center justify-center rounded-xl transition-all"
            style={navTool==="settings"
              ? {background:"rgba(124,58,237,0.18)",color:"#c4b5fd"}
              : {color:"rgba(255,255,255,0.28)"}}>
            <Settings2 className="h-4.5 w-4.5"/>
          </button>
          {/* Plan badge */}
          <div className="mb-1 flex h-8 w-8 items-center justify-center rounded-full"
            style={{background:isPaid ? "rgba(245,158,11,0.1)" : "rgba(255,255,255,0.04)"}}>
            {isPaid ? <Crown className="h-3.5 w-3.5 text-yellow-400"/> : <Lock className="h-3.5 w-3.5 text-white/20"/>}
          </div>
        </div>

        {/* ── CENTER COLUMN ── */}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">

          {/* DESKTOP: Preview → Stats → Timeline */}
          <div className="hidden lg:flex lg:flex-col lg:flex-1 lg:overflow-hidden">
            {/* Preview — hero section */}
            <div className="min-h-0 flex-1 overflow-hidden">
              <LivePreviewPlayer frames={frames} cfg={cfg}
                selectedId={selectedId} onSelectId={id => setSelectedId(id)}/>
            </div>

            {/* Stats bar */}
            <div className="flex shrink-0 items-center gap-6 border-t px-5 py-2.5"
              style={{borderColor:BORDER,background:"rgba(5,0,15,0.6)"}}>
              {[
                {label:"Duration",   value: filledFrames.length > 0 ? fmtTime(totalRuntime(filledFrames)) : "—"},
                {label:"Scenes",     value: String(filledFrames.length || "—")},
                {label:"Resolution", value: cfg.exportQuality},
                {label:"Frame Rate", value: `${cfg.fps} fps`},
                {label:"Engine",     value: engine.name},
              ].map(({label,value}) => (
                <div key={label} className="flex flex-col gap-0.5">
                  <span className="text-[8px] font-bold uppercase tracking-[0.12em] text-white/20">{label}</span>
                  <span className="text-[11px] font-bold text-white/55">{value}</span>
                </div>
              ))}
            </div>

            {/* Timeline */}
            <div className="shrink-0" style={{borderTop:`1px solid ${BORDER}`}}>
              {TimelineStrip}
            </div>
          </div>

          {/* MOBILE: Tab-based views */}
          <div className="flex flex-1 flex-col overflow-hidden lg:hidden">
            <AnimatePresence mode="wait">
              {mobileView === "scenes" && (
                <motion.div key="scenes" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
                  className="flex flex-1 flex-col overflow-hidden">
                  <VerticalStoryboard
                    frames={frames}
                    selectedId={selectedId}
                    onSelectId={setSelectedId}
                    onUpdateFrame={updateFrame}
                    onAddFrame={addFrame}
                    onRemoveFrame={removeFrame}
                    onDuplicateFrame={duplicateFrame}
                    onTriggerUpload={triggerFrameUpload}
                  />
                </motion.div>
              )}

              {mobileView === "preview" && (
                <motion.div key="preview" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
                  className="flex-1 overflow-hidden">
                  <LivePreviewPlayer frames={frames} cfg={cfg}
                    selectedId={selectedId} onSelectId={id => setSelectedId(id)}/>
                </motion.div>
              )}

            </AnimatePresence>
          </div>
        </div>

        {/* ── RIGHT PANEL (desktop: tabbed Settings / Scene Director) ── */}
        <div className="hidden lg:flex h-full w-[272px] xl:w-[292px] shrink-0 flex-col border-l"
          style={{borderColor:BORDER,background:"rgba(4,0,14,0.98)"}}>

          {/* Tab header */}
          <div className="flex shrink-0 items-center border-b" style={{borderColor:BORDER}}>
            <button
              onClick={() => setRightPanelTab("settings")}
              className="flex-1 py-2.5 text-[11px] font-bold transition"
              style={rightPanelTab==="settings"
                ? {color:"#c4b5fd",borderBottom:"1.5px solid #8b5cf6"}
                : {color:"rgba(255,255,255,0.3)"}}>
              Settings
            </button>
            <button
              onClick={() => setRightPanelTab("scene")}
              disabled={!selectedFrame}
              className="flex-1 py-2.5 text-[11px] font-bold transition disabled:opacity-25"
              style={rightPanelTab==="scene" && selectedFrame
                ? {color:"#c4b5fd",borderBottom:"1.5px solid #8b5cf6"}
                : {color:"rgba(255,255,255,0.3)"}}>
              {selectedFrame
                ? `Scene ${frames.findIndex(f=>f.id===selectedId)+1}`
                : "Scene"}
            </button>
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-hidden">
            <AnimatePresence mode="wait">
              {(rightPanelTab === "settings" || !selectedFrame) && (
                <motion.div key="settings-panel" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
                  className="h-full overflow-y-auto">
                  {/* Mode toggle */}
                  <div className="flex items-center justify-between border-b px-4 py-2.5" style={{borderColor:BORDER}}>
                    <div>
                      <p className="text-[11px] font-bold text-white/70">{beginnerMode ? "Beginner Mode" : "Pro Mode"}</p>
                      <p className="text-[9px] text-white/30">{beginnerMode ? "Simplified controls" : "Full controls"}</p>
                    </div>
                    <button onClick={toggleMode}
                      className="rounded-full border px-2.5 py-1 text-[9px] font-bold transition"
                      style={beginnerMode
                        ? {background:"rgba(139,92,246,0.1)",borderColor:"rgba(139,92,246,0.3)",color:"#c4b5fd"}
                        : {background:GLASS,borderColor:BORDER,color:"rgba(255,255,255,0.4)"}}>
                      {beginnerMode ? "Pro" : "Beginner"}
                    </button>
                  </div>
                  <GlobalSettingsPanel cfg={cfg} frames={frames} onChange={updateCfg} beginnerMode={beginnerMode}
                    onApplyAll={() => setFrames(p => p.map(f => ({...f,durationSec:cfg.defaultDuration})))}/>
                  <ProjectRecoveryPanel
                    frameCount={frames.length}
                    filledCount={filledFrames.length}
                    projectId={projectIdRef.current}
                    onReset={resetProject}
                    onClearCache={clearCorruptedState}
                    onForceSync={forceSyncProject}/>
                </motion.div>
              )}
              {rightPanelTab === "scene" && selectedFrame && (
                <motion.div key="scene-panel" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
                  className="flex h-full flex-col overflow-hidden">
                  {/* Scene header */}
                  <div className="flex shrink-0 items-center gap-3 border-b px-4 py-3" style={{borderColor:BORDER}}>
                    <div className="flex-1 min-w-0">
                      <p className="truncate text-[13px] font-black text-white">
                        {selectedFrame.title || `Scene ${frames.findIndex(f=>f.id===selectedId)+1}`}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] text-white/35">{selectedFrame.durationSec}s</span>
                        <div className="h-1.5 w-1.5 rounded-full"
                          style={{background:BEATS.find(b=>b.v===selectedFrame.beatType)?.color}}/>
                        <span className="text-[10px] text-white/35">{BEATS.find(b=>b.v===selectedFrame.beatType)?.label}</span>
                        <span className="text-[12px]">{EMOTIONS.find(e=>e.v===selectedFrame.emotion)?.emoji}</span>
                      </div>
                    </div>
                    {selectedFrame.imageUrl && (
                      <div className="h-14 w-10 overflow-hidden rounded-xl shrink-0" style={{border:`1px solid ${BORDER}`}}>
                        <img src={selectedFrame.imageUrl} alt="" className="h-full w-full object-cover"/>
                      </div>
                    )}
                  </div>
                  <div className="flex-1 overflow-hidden">
                    <SceneDirectorContent
                      frame={selectedFrame}
                      onUpdate={p => updateFrame(selectedFrame.id, p)}/>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Storyboard summary — shown in Settings tab when scenes exist */}
          {rightPanelTab === "settings" && filledFrames.length > 0 && (
            <div className="shrink-0 border-t px-3 py-3" style={{borderColor:BORDER}}>
              <p className="mb-2 text-[8px] font-bold uppercase tracking-[0.12em] text-white/25">
                {filledFrames.length} of {MAX_FRAMES} scenes
              </p>
              <div className="flex gap-1.5 overflow-x-auto pb-1">
                {frames.map((f,i) => (
                  <button key={f.id}
                    onClick={() => { setSelectedId(f.id); setRightPanelTab("scene"); }}
                    className="relative h-10 w-7 shrink-0 overflow-hidden rounded-lg transition"
                    style={{
                      border:`1.5px solid ${selectedId===f.id ? "rgba(124,58,237,0.7)" : BORDER}`,
                      boxShadow: selectedId===f.id ? "0 0 8px rgba(124,58,237,0.4)" : "none",
                    }}>
                    {f.imageUrl
                      ? <img src={f.imageUrl} alt="" className="h-full w-full object-cover"/>
                      : <div className="flex h-full w-full items-center justify-center text-[8px] text-white/20">{i+1}</div>}
                    <div className="absolute inset-x-0 bottom-0 h-0.5"
                      style={{background:BEATS.find(b=>b.v===f.beatType)?.color}}/>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ══ MOBILE BOTTOM TAB BAR ══
          Premium dark cinematic dock — neutral hairline border, deep
          near-black surface, no purple tint. Active indicator is a single
          1px white bar (see below) instead of a gradient pill. */}
      <div className="relative z-20 flex shrink-0 items-center border-t lg:hidden"
        style={{
          borderColor:"rgba(255,255,255,0.06)",
          background:"rgba(10,10,14,0.96)",
          backdropFilter:"blur(20px) saturate(140%)",
          WebkitBackdropFilter:"blur(20px) saturate(140%)",
          paddingBottom:"env(safe-area-inset-bottom,0px)",
        }}>
        {/* Scenes + Preview tabs */}
        {([
          {id:"scenes",  label:"Scenes",  icon:Layers},
          {id:"preview", label:"Preview", icon:MonitorPlay},
        ] as {id:MobileView;label:string;icon:typeof Layers}[]).map(({id,label,icon:Icon}) => (
          <button key={id}
            onClick={() => setMobileView(id)}
            className="flex flex-1 flex-col items-center gap-0.5 py-3 transition select-none">
            <Icon className={`h-5 w-5 transition ${mobileView===id ? "text-white" : "text-white/30"}`}/>
            <span className={`text-[9px] font-semibold transition ${mobileView===id ? "text-white/80" : "text-white/25"}`}>{label}</span>
            {mobileView===id && (
              /* Minimal white hairline indicator — Linear/Arc style. */
              <motion.div layoutId="mobile-tab-indicator" className="absolute bottom-0 h-[2px] w-6 rounded-full"
                style={{background:"rgba(255,255,255,0.85)"}}/>
            )}
          </button>
        ))}
        {/* Render action */}
        <div className="flex flex-1 items-center justify-center py-2">
          <motion.button whileTap={{scale:canGenerate?0.94:1}} onClick={canGenerate ? generate : undefined}
            className="flex flex-col items-center gap-0.5 select-none"
            style={{opacity: generating ? 0.55 : canGenerate ? 1 : 0.35}}>
            <div className="flex h-9 w-9 items-center justify-center rounded-2xl"
              style={{
                /* Softer render pill — quiet glass with a faint purple
                   accent ring instead of a saturated gradient fill. Keeps
                   the action discoverable without competing with the rest
                   of the dock. */
                background: canGenerate
                  ? "linear-gradient(135deg, rgba(176,38,255,0.22), rgba(236,72,153,0.18))"
                  : "rgba(255,255,255,0.05)",
                border: canGenerate
                  ? "1px solid rgba(176,38,255,0.45)"
                  : "1px solid rgba(255,255,255,0.08)",
                boxShadow: canGenerate
                  ? "inset 0 0 0 1px rgba(255,255,255,0.04), 0 0 10px rgba(176,38,255,0.25)"
                  : "none",
              }}>
              <Clapperboard className="h-4 w-4 text-white"/>
            </div>
            <span className="text-[9px] font-bold text-white/50">
              {generating ? "…" : cooldownSec > 0 ? `${cooldownSec}s` : "Render"}
            </span>
          </motion.button>
        </div>
      </div>

      {/* ══ OVERLAYS ══ */}
      <AnimatePresence>
        {generating && !backgroundRender && (
          <CinematicRenderScreen
            engine={engine} segmentCount={segmentCount}
            progress={renderProgress} phaseIdx={renderPhase} etaSec={renderETA}
            onBackground={() => setBackgroundRender(true)} planCode={planCode}
            queuePosition={renderJob.queuePosition}/>
        )}
        {result && !generating && (
          <ResultScreen result={result} saveStatus={saveStatus} saveError={saveError}
            onClose={() => setResult(null)} onSave={onSave} onPlay={() => setVideoOpen(true)}/>
        )}
        {showHistory && (
          <RenderHistoryPanel onClose={() => setShowHistory(false)}
            onRetry={e => { setShowHistory(false); updateCfg({aspect:e.aspect,exportQuality:e.quality,exportFormat:e.format}); }}
            onDuplicate={e => { setShowHistory(false); updateCfg({aspect:e.aspect,exportQuality:e.quality,exportFormat:e.format}); }}/>
        )}
      </AnimatePresence>

      {result?.videoUrl && (
        <VideoPlayerModal videoUrl={result.videoUrl} posterUrl={result.url}
          open={videoOpen} onClose={() => setVideoOpen(false)}/>
      )}

      {/* ── AI Models Orchestrator — fullscreen cinematic modal (Studio scope only).
           Selection flows: ModelSelectorModal → useStudioModelStore (persisted)
           → onSelect callback below → cfg.renderEngine → render pipeline. ── */}
      <ModelSelectorModal
        open={modelSelectorOpen}
        onClose={() => setModelSelectorOpen(false)}
        onUnavailableTap={(m) => {
          // Show the server's exact reason if we have it (e.g.
          // "Missing: RUNWAY_API_KEY.") so the operator knows the
          // precise env var to set; otherwise fall back to a generic
          // message. We do NOT close the modal — the user is browsing
          // the catalog and should see the next row immediately.
          const reason = m.unavailableReason
            ? `${m.name}: ${m.unavailableReason}`
            : `${m.name} requires an API key to enable. Contact the operator to configure it.`;
          showToast(reason, "error");
        }}
        onSelect={(id: AiModelId) => {
          /* The orchestrator and the render pipeline share the same id
             namespace, so we can route the chosen model straight into
             cfg.renderEngine. */
          const next = id as RenderEngineId;
          updateCfg({ renderEngine: next });
          setStudioSelectedModelId(next as StudioModelId);
        }}
      />

      {/* ── Global file input — "Upload First Scene" + drag-and-drop ── */}
      <input
        ref={globalInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/jpg,image/*"
        multiple
        style={{position:"fixed",top:"-300px",left:"-300px",opacity:0,width:"1px",height:"1px",pointerEvents:"none",overflow:"hidden"}}
        onChange={e => {
          if (e.target.files && e.target.files.length > 0) handleGlobalFiles(e.target.files);
          e.target.value = "";
        }}
      />
      {/* ── Per-frame file input — triggered from VerticalStoryboard scene tap ── */}
      <input
        ref={frameInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/jpg,image/*"
        style={{position:"fixed",top:"-300px",left:"-300px",opacity:0,width:"1px",height:"1px",pointerEvents:"none",overflow:"hidden"}}
        onChange={e => {
          const file = e.target.files?.[0];
          if (file && pendingUploadIdRef.current) uploadFile(pendingUploadIdRef.current, file);
          e.target.value = "";
        }}
      />

      {/* ── Upload error / success toast ── */}
      <AnimatePresence>
        {uploadToast && (
          <motion.div
            initial={{opacity:0,y:20,scale:0.95}}
            animate={{opacity:1,y:0,scale:1}}
            exit={{opacity:0,y:20,scale:0.95}}
            transition={{type:"spring",stiffness:400,damping:28}}
            className="fixed bottom-24 left-1/2 z-[200] -translate-x-1/2"
            style={{pointerEvents:"none"}}
          >
            <div className="flex items-center gap-3 rounded-2xl px-5 py-3.5 shadow-2xl"
              style={{
                background: uploadToast.type === "error" ? "#140a0a" : "#0a1a0f",
                border:`1px solid ${uploadToast.type === "error" ? "rgba(239,68,68,0.5)" : "rgba(34,197,94,0.5)"}`,
              }}>
              {uploadToast.type === "error"
                ? <AlertCircle className="h-4 w-4 text-red-300 shrink-0"/>
                : <Check className="h-4 w-4 text-green-300 shrink-0"/>
              }
              <p className="text-sm font-semibold text-white">{uploadToast.msg}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
