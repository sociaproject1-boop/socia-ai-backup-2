/**
 * aiTopology — config-truth registry for the AI Operations Center.
 *
 * This is the SINGLE source of truth for "which provider powers which
 * feature", "what model / endpoint does it use", "what is the real request
 * flow", and "what is the real failover behaviour". It is derived directly
 * from the live code:
 *
 *   - engineRegistry.ts        (video engines + env gating)
 *   - routes/sociaGpt.ts       (xAI Grok primary → OpenAI fallback)
 *   - routes/generateImage.ts  (OpenAI gpt-image-1)
 *   - lib/usageTracker.ts      (tool_used taxonomy + internal ₱ cost map)
 *
 * NOTHING here is invented. Where a capability does not exist (e.g. a third
 * backup provider, or token tracking for video) it is represented honestly.
 * See `.agents/memory/provider-honesty-contract.md`.
 *
 * Live numeric metrics are NOT stored here — they are aggregated from
 * usage_receipts at request time in routes/aiOps.ts and merged onto this
 * topology by id. This file only describes the static architecture + the
 * runtime credential status (which is read from process.env).
 */

/** Internal PHP→USD basis used by the cost map in usageTracker.ts. */
export const PHP_PER_USD = 56;

export type ProviderId =
  | "xai" | "openai" | "fal" | "runway" | "veo" | "pika";

/** A provider SOCIA actually integrates with. */
export interface ProviderDescriptor {
  id:        ProviderId;
  label:     string;
  /** Human description of the role this provider plays. */
  role:      string;
  /**
   * Env var groups required for this provider to be live. Outer = AND,
   * inner = OR (any one satisfies the group). Mirrors engineRegistry's
   * `requires` semantics. Empty = always-on / no dedicated key.
   */
  envRequires: string[][];
  /** Known model identifiers this provider serves inside SOCIA. */
  models:    string[];
  /** Whether usage of this provider is metered in tokens (vs. per-job). */
  tokenMetered: boolean;
  /** External dashboard link for the owner, when one exists. */
  dashboard?: string;
}

export const PROVIDERS: ProviderDescriptor[] = [
  {
    id: "xai", label: "xAI (Grok)",
    role: "Primary LLM for SociaGPT chat & prompt reasoning.",
    envRequires: [["XAI_API_KEY", "GROK_API_KEY"]],
    models: ["grok-beta", "grok-vision-beta"],
    tokenMetered: true,
    dashboard: "https://console.x.ai",
  },
  {
    id: "openai", label: "OpenAI",
    role: "Image generation (gpt-image-1), prompt enhancement, and SociaGPT fallback LLM.",
    envRequires: [["OPENAI_API_KEY"]],
    models: ["gpt-image-1", "gpt-4o", "gpt-4o-mini", "o1-mini"],
    tokenMetered: true,
    dashboard: "https://platform.openai.com/usage",
  },
  {
    id: "fal", label: "fal.ai",
    role: "Cinematic video engines (Luma Dream Machine, Kling family).",
    envRequires: [["FAL_KEY"]],
    models: ["luma", "kling-1.6-standard", "kling-1.6-pro", "kling-2.1-master", "kling-3-omni"],
    tokenMetered: false,
    dashboard: "https://fal.ai/dashboard",
  },
  {
    id: "runway", label: "Runway",
    role: "Gen-3 / Gen-4 video engines (third-party adapter — no silent failover).",
    envRequires: [["RUNWAY_API_KEY"]],
    models: ["gen3a_turbo", "gen4_turbo"],
    tokenMetered: false,
    dashboard: "https://app.runwayml.com",
  },
  {
    id: "veo", label: "Google Veo (Vertex AI)",
    role: "Veo video engine on Google Vertex AI (third-party adapter — no silent failover).",
    envRequires: [["GOOGLE_VERTEX_PROJECT"], ["GOOGLE_APPLICATION_CREDENTIALS", "GOOGLE_VERTEX_CREDENTIALS_JSON"]],
    models: ["veo-2.0-generate-001"],
    tokenMetered: false,
    dashboard: "https://console.cloud.google.com/vertex-ai",
  },
  {
    id: "pika", label: "Pika",
    role: "Pika 2.2 video engine (third-party adapter — no silent failover).",
    envRequires: [["PIKA_API_KEY"]],
    models: ["pika-2.2"],
    tokenMetered: false,
    dashboard: "https://pika.art",
  },
];

const PROVIDER_BY_ID = new Map(PROVIDERS.map((p) => [p.id, p]));
export function getProvider(id: string): ProviderDescriptor | undefined {
  return PROVIDER_BY_ID.get(id as ProviderId);
}

/**
 * Classify a `model_used` string (as stored on usage_receipts) to a provider.
 * Returns null for unknown models — callers must render that honestly rather
 * than guess.
 */
export function classifyProvider(model: string | null | undefined): ProviderId | null {
  const m = (model ?? "").toLowerCase().trim();
  if (!m) return null;
  if (m.includes("grok")) return "xai";
  if (m.startsWith("gpt") || m.startsWith("o1") || m.startsWith("o3") ||
      m.includes("dall") || m.includes("chatgpt")) return "openai";
  if (m.includes("kling") || m.includes("luma") || m.includes("flux")) return "fal";
  if (m.includes("runway") || m.startsWith("gen3") || m.startsWith("gen4")) return "runway";
  if (m.includes("veo")) return "veo";
  if (m.includes("pika")) return "pika";
  return null;
}

/** A single hop in a request flow. */
export interface FlowStep {
  provider: ProviderId;
  model?:   string;
  /** What this hop does. */
  action:   string;
  /** "fallback" hops only run if the prior hop fails. */
  kind:     "primary" | "fallback" | "selectable";
}

/** Real failover description for a feature. */
export interface FailoverInfo {
  /** Plain-language description of the ACTUAL failover behaviour. */
  summary:  string;
  /** Whether automatic failover to another *provider* exists. */
  automatic: boolean;
}

/**
 * A feature, keyed by the `tool_used` value written to usage_receipts so live
 * metrics merge cleanly. `aliases` lists the human sub-features the spec calls
 * out that are served by this same tool/endpoint (kept honest — they are not
 * separately metered).
 */
export interface FeatureDescriptor {
  /** Matches usage_receipts.tool_used. */
  tool:        string;
  label:       string;
  description: string;
  endpoint:    string;
  /** Sub-capabilities surfaced in the UI that map onto this same tool. */
  aliases:     string[];
  /** Providers that can serve this feature, in priority order. */
  providers:   ProviderId[];
  /** Whether token usage is meaningfully tracked for this feature. */
  tokenTracked: boolean;
  flow:        FlowStep[];
  failover:    FailoverInfo;
}

export const FEATURES: FeatureDescriptor[] = [
  {
    tool: "ai_chat",
    label: "SociaGPT Chat",
    description: "Conversational AI assistant with automatic model routing by prompt complexity.",
    endpoint: "POST /api/socia-gpt",
    aliases: ["AI Assistant", "Smart Prompt Analysis", "AI Prompt Optimizer"],
    providers: ["xai", "openai"],
    tokenTracked: true,
    flow: [
      { provider: "xai", model: "grok-beta / grok-vision-beta", action: "Primary chat completion (Fast/Smart by complexity)", kind: "primary" },
      { provider: "openai", model: "gpt-4o / gpt-4o-mini / o1-mini", action: "Fallback if xAI yields no first byte within 8s", kind: "fallback" },
    ],
    failover: {
      summary: "Automatic: if xAI produces no first byte within 8s the stream aborts and retries on OpenAI. No tertiary provider.",
      automatic: true,
    },
  },
  {
    tool: "image_generation",
    label: "Prompt to Image",
    description: "Text-to-image generation with AI prompt enhancement.",
    endpoint: "POST /api/generate-image",
    aliases: ["Prompt Enhancement", "Content Generation"],
    providers: ["openai"],
    tokenTracked: false,
    flow: [
      { provider: "openai", model: "gpt-4o-mini", action: "Prompt enhancement", kind: "primary" },
      { provider: "openai", model: "gpt-image-1", action: "Image generation", kind: "primary" },
    ],
    failover: {
      summary: "No provider failover — image generation runs solely on OpenAI gpt-image-1. On failure the request errors and credits are refunded.",
      automatic: false,
    },
  },
  {
    tool: "preset_studio",
    label: "AI Preset Studio",
    description: "Curated one-tap creative presets built on image generation.",
    endpoint: "POST /api/presets/*",
    aliases: ["Professional Product Photos", "Realistic Image Generation"],
    providers: ["openai"],
    tokenTracked: false,
    flow: [
      { provider: "openai", model: "gpt-image-1", action: "Preset image generation", kind: "primary" },
    ],
    failover: {
      summary: "No provider failover — runs on OpenAI gpt-image-1. On failure the request errors and credits are refunded.",
      automatic: false,
    },
  },
  {
    tool: "video_generation",
    label: "Image / Prompt to Video",
    description: "Single-clip video generation across selectable cinematic engines.",
    endpoint: "POST /api/generate-video",
    aliases: ["Image to Video", "Prompt to Video", "Cinematic Video Generation"],
    providers: ["fal", "runway", "veo", "pika"],
    tokenTracked: false,
    flow: [
      { provider: "fal", model: "Luma / Kling", action: "Default cinematic engine", kind: "primary" },
      { provider: "runway", model: "gen3a_turbo / gen4_turbo", action: "Selectable engine (own key required)", kind: "selectable" },
      { provider: "veo", model: "veo-2.0-generate-001", action: "Selectable engine (own key required)", kind: "selectable" },
      { provider: "pika", model: "pika-2.2", action: "Selectable engine (own key required)", kind: "selectable" },
    ],
    failover: {
      summary: "fal-backed engines fall back to mock mode in DEVELOPMENT ONLY when FAL_KEY is absent — never in production. Runway/Veo/Pika have NO failover: a missing key throws PROVIDER_NOT_CONFIGURED and the user is refunded.",
      automatic: false,
    },
  },
  {
    tool: "multiframe_video",
    label: "Cinematic Multi-Frame Video",
    description: "Multi-frame storyboard sequences rendered as a cinematic clip.",
    endpoint: "POST /api/generate-multiframe-video",
    aliases: ["AI Cinematic Studio", "Storyboard Sequences"],
    providers: ["fal", "runway", "veo", "pika"],
    tokenTracked: false,
    flow: [
      { provider: "fal", model: "Luma Dream Machine", action: "Multi-frame sequence render", kind: "primary" },
    ],
    failover: {
      summary: "Same as single-clip video: fal mock mode in development only; third-party engines have no silent failover.",
      automatic: false,
    },
  },
  {
    tool: "image_upscale",
    label: "Image Upscale",
    description: "Resolution / quality enhancement of generated images.",
    endpoint: "POST /api/generate-image (upscale mode)",
    aliases: ["Upscaling", "Image Processing"],
    providers: ["openai"],
    tokenTracked: false,
    flow: [
      { provider: "openai", action: "Image enhancement", kind: "primary" },
    ],
    failover: {
      summary: "No provider failover. Provider is reported from the live model recorded on each request.",
      automatic: false,
    },
  },
];

const FEATURE_BY_TOOL = new Map(FEATURES.map((f) => [f.tool, f]));
export function getFeature(tool: string): FeatureDescriptor | undefined {
  return FEATURE_BY_TOOL.get(tool);
}

/**
 * Runtime credential status for a provider, derived from process.env using
 * the same AND/OR semantics as engineRegistry.
 */
export function isProviderConfigured(p: ProviderDescriptor): boolean {
  if (p.envRequires.length === 0) return true;
  return p.envRequires.every((group) =>
    group.some((name) => Boolean((process.env[name] ?? "").trim())),
  );
}

/** The env var groups, flattened to a readable list for the UI. */
export function providerEnvLabels(p: ProviderDescriptor): string[] {
  return p.envRequires.map((group) => group.join(" or "));
}
