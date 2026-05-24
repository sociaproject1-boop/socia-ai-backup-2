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
 *
 * Health tracker (in-memory, per-process):
 *   3 consecutive failures → skip Grok for 60s and fall through to OpenAI.
 *   Resets on any success. Keeps a single bad provider from tanking UX.
 */
import OpenAI from "openai";
import { logger } from "./logger.js";

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

/** True if Grok routing is available (key set + not in cooldown). */
export function isGrokAvailable(): boolean {
  return getGrok() !== null && !shouldSkipGrok();
}

/** Eager init at boot — pays SDK construction cost up front. */
export function warmGrok(): void {
  const c = getGrok();
  if (c) logger.info({ fast: GROK_FAST, smart: GROK_SMART }, "[grok] client warmed");
}

/* ── Health tracker ──────────────────────────────────────────────────── */

let grokFailureStreak = 0;
let grokSkipUntil     = 0;
const COOLDOWN_MS = 60_000;
const FAILURE_THRESHOLD = 3;

/** Reset the failure streak on any successful Grok response. */
export function recordGrokOk(): void {
  if (grokFailureStreak > 0 || grokSkipUntil !== 0) {
    grokFailureStreak = 0;
    grokSkipUntil     = 0;
  }
}

/** Bump the failure streak; trip the breaker after FAILURE_THRESHOLD. */
export function recordGrokFail(err: unknown): void {
  grokFailureStreak++;
  if (grokFailureStreak >= FAILURE_THRESHOLD) {
    grokSkipUntil     = Date.now() + COOLDOWN_MS;
    grokFailureStreak = 0;
    logger.warn(
      { err: err instanceof Error ? err.message : String(err), cooldownMs: COOLDOWN_MS },
      "[grok] tripped breaker — routing to OpenAI fallback",
    );
  }
}

/** True if Grok is currently in cooldown and should be skipped. */
export function shouldSkipGrok(): boolean {
  if (grokSkipUntil === 0) return false;
  if (Date.now() >= grokSkipUntil) {
    grokSkipUntil = 0;
    return false;
  }
  return true;
}
