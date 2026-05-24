/**
 * Grok (xAI) client — lazy singleton, OpenAI-compatible.
 *
 * Activated only when XAI_API_KEY is present. When absent, the chat route
 * silently falls back to the existing OpenAI integration so nothing breaks.
 *
 * Model IDs are env-overridable so we can swap as xAI ships new versions
 * without code changes:
 *   XAI_MODEL_FAST   (default "grok-4-fast-reasoning")  — default chat model
 *   XAI_MODEL_SMART  (default "grok-4")                 — heavy-reasoning model
 *
 * The xAI API is OpenAI-compatible, so we reuse the official `openai` SDK
 * pointed at `https://api.x.ai/v1`. Streaming, tool-calling, vision and
 * abort-signals all work identically.
 */
import OpenAI from "openai";

const XAI_BASE_URL = "https://api.x.ai/v1";

export const GROK_FAST  = process.env.XAI_MODEL_FAST  || "grok-4-fast-reasoning";
export const GROK_SMART = process.env.XAI_MODEL_SMART || "grok-4";

let cached: OpenAI | null | undefined;

/**
 * Returns a Grok client if XAI_API_KEY is configured, otherwise null.
 * The client is created once and reused (provider preloading per spec).
 */
export function getGrok(): OpenAI | null {
  if (cached !== undefined) return cached;
  const key = process.env.XAI_API_KEY;
  if (!key) {
    cached = null;
    return null;
  }
  cached = new OpenAI({ apiKey: key, baseURL: XAI_BASE_URL });
  return cached;
}

/** True if Grok routing is available. */
export function isGrokAvailable(): boolean {
  return getGrok() !== null;
}
