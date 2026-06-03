/**
 * monitoring/registry.ts — the single, config-driven source of truth for
 * every provider the platform depends on. Adding a new provider is a
 * one-object edit here; the monitor, the public snapshot, and both owner
 * dashboards pick it up automatically.
 *
 * NOTHING in this file imports payment/checkout/auth/AI-gen logic. It only
 * declares metadata + which environment keys indicate "configured".
 */
import type { ProbeKind, ProviderCategory } from "./types.js";

/** The one account allowed to see full status + flip overrides. */
export const OWNER_EMAIL = "allanalbacen5@gmail.com";

/** How often the background monitor re-checks every provider. */
export const MONITOR_INTERVAL_MS = 5 * 60 * 1000;

/** Per-probe network timeout. Kept tight so a hung provider can never
 *  slow the monitor loop or stack up. */
export const PROBE_TIMEOUT_MS = 8_000;

/** Above this round-trip time a reachable provider is flagged DEGRADED. */
export const SLOW_RESPONSE_MS = 3_500;

export interface ProviderDefinition {
  id: string;
  label: string;
  category: ProviderCategory;
  /** Env var names that, if ANY is present, mean the provider is configured. */
  envKeys: string[];
  probe: ProbeKind;
  /** Statuspage summary.json URL (probe === "statuspage"). */
  statusUrl?: string;
  /** API base used for a plain reachability probe (probe === "reachability"). */
  reachUrl?: string;
  /** Owner-facing external links. */
  links?: { dashboard?: string; topUp?: string; usage?: string; status?: string };
}

/**
 * Provider catalogue. Order here is the display order in the dashboards.
 * Providers without a configured key still appear (as "Not configured") so
 * the owner can see the full dependency surface at a glance.
 */
export const PROVIDERS: ProviderDefinition[] = [
  // ── Payments ──────────────────────────────────────────────────────────
  {
    id: "paymongo",
    label: "PayMongo",
    category: "payment",
    envKeys: ["PAYMONGO_SECRET_KEY"],
    probe: "paymongo",
    links: {
      dashboard: "https://dashboard.paymongo.com",
      status: "https://status.paymongo.com",
    },
  },

  // ── AI providers ──────────────────────────────────────────────────────
  {
    id: "openai",
    label: "OpenAI",
    category: "ai",
    envKeys: ["AI_INTEGRATIONS_OPENAI_API_KEY", "OPENAI_API_KEY"],
    probe: "statuspage",
    statusUrl: "https://status.openai.com/api/v2/summary.json",
    reachUrl: "https://api.openai.com/v1/models",
    links: {
      dashboard: "https://platform.openai.com/usage",
      topUp: "https://platform.openai.com/settings/organization/billing/overview",
      usage: "https://platform.openai.com/usage",
      status: "https://status.openai.com",
    },
  },
  {
    id: "fal",
    label: "Fal.ai",
    category: "ai",
    envKeys: ["FAL_KEY", "FAL_API_KEY"],
    probe: "reachability",
    reachUrl: "https://fal.run/",
    links: {
      dashboard: "https://fal.ai/dashboard",
      topUp: "https://fal.ai/dashboard/billing",
      usage: "https://fal.ai/dashboard/usage",
      status: "https://status.fal.ai",
    },
  },
  {
    id: "runway",
    label: "Runway",
    category: "ai",
    envKeys: ["RUNWAY_API_KEY"],
    probe: "reachability",
    reachUrl: "https://api.dev.runwayml.com/",
    links: {
      dashboard: "https://dev.runwayml.com",
      topUp: "https://dev.runwayml.com/billing",
      status: "https://status.runwayml.com",
    },
  },
  {
    id: "xai",
    label: "xAI (Grok)",
    category: "ai",
    envKeys: ["XAI_API_KEY"],
    probe: "reachability",
    reachUrl: "https://api.x.ai/v1/models",
    links: {
      dashboard: "https://console.x.ai",
      topUp: "https://console.x.ai",
      status: "https://status.x.ai",
    },
  },
  {
    id: "replicate",
    label: "Replicate",
    category: "ai",
    envKeys: ["REPLICATE_API_TOKEN", "REPLICATE_API_KEY"],
    probe: "reachability",
    reachUrl: "https://api.replicate.com/v1/models",
    links: {
      dashboard: "https://replicate.com/account/billing",
      topUp: "https://replicate.com/account/billing#billing",
      status: "https://replicatestatus.com",
    },
  },
  {
    id: "kling",
    label: "Kling AI",
    category: "ai",
    envKeys: ["KLING_API_KEY", "KLING_ACCESS_KEY"],
    probe: "config",
    links: {
      dashboard: "https://klingai.com",
      status: "https://klingai.com",
    },
  },
  {
    id: "stability",
    label: "Stability AI",
    category: "ai",
    envKeys: ["STABILITY_API_KEY", "STABILITY_AI_API_KEY"],
    probe: "reachability",
    reachUrl: "https://api.stability.ai/v1/user/account",
    links: {
      dashboard: "https://platform.stability.ai/account/credits",
      topUp: "https://platform.stability.ai/account/credits",
      status: "https://stabilityai.instatus.com",
    },
  },
];

/**
 * Maps each user-facing Socia feature to the upstream provider(s) it relies
 * on, so "Service Health" can derive a feature's status from real probes
 * instead of guessing. The WORST status among a feature's providers wins.
 */
export interface ServiceDefinition {
  id: string;
  label: string;
  providerIds: string[];
}

export const SERVICES: ServiceDefinition[] = [
  { id: "chat",          label: "Socia GPT (Chat)",      providerIds: ["xai", "openai"] },
  { id: "prompt_image",  label: "Prompt → Image",        providerIds: ["openai", "fal"] },
  { id: "prompt_video",  label: "Prompt → Video",        providerIds: ["fal", "runway"] },
  { id: "image_video",   label: "Image → Video",         providerIds: ["fal", "runway"] },
  { id: "cinematic",     label: "AI Cinematic Studio",   providerIds: ["fal", "runway", "openai"] },
  { id: "billing",       label: "Billing & Checkout",    providerIds: ["paymongo"] },
];

/** True if any of the provider's candidate env keys is present + non-empty. */
export function isConfigured(def: ProviderDefinition): boolean {
  return def.envKeys.some((k) => (process.env[k] ?? "").trim().length > 0);
}
