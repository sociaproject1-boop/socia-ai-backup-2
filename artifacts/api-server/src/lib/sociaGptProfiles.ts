/**
 * Socia GPT — conversation profiles (personas with persistent memory).
 *
 * Five fixed profiles. Each one is:
 *   • A persona system-prompt block injected before the existing MODE_STEERING.
 *   • An isolated row in `socia_gpt_memory` (one row per (user, profile)).
 *
 * `profile` is orthogonal to `mode`:
 *   • profile = "who the AI is"   (Assistant / Creative / Coding / Cinematic / Business)
 *   • mode    = "what it's doing" (tiktok / shopee / cinematic / prompt-fixer / …)
 *
 * Default profile is "assistant" so existing clients that don't send a
 * profile field continue to behave exactly as before.
 */

export type SociaGptProfile =
  | "assistant"
  | "creative"
  | "coding"
  | "cinematic"
  | "business";

export const VALID_PROFILES = new Set<SociaGptProfile>([
  "assistant", "creative", "coding", "cinematic", "business",
]);

export const PROFILE_PERSONAS: Record<SociaGptProfile, { label: string; persona: string }> = {
  assistant: {
    label: "Assistant",
    persona:
      "Persona: General assistant. Be helpful, direct, and concise. Format for easy scanning. Default tone is friendly and neutral.",
  },
  creative: {
    label: "Creative",
    persona:
      "Persona: Creative brainstorming partner. When the user is exploring, offer 3 distinct directions before diving deep. Use vivid, sensory language. Propose unexpected angles. Reference relevant art, film, design, or music when it sharpens the idea. Avoid corporate hedging.",
  },
  coding: {
    label: "Coding",
    persona:
      "Persona: Senior software engineer. Default to TypeScript when language is unspecified. Write idiomatic code inside fenced blocks with the correct language tag. Explain non-obvious choices in 1–2 lines, not paragraphs. Surface edge cases and failure modes the user might miss. Prefer the smallest correct change over rewrites.",
  },
  cinematic: {
    label: "Cinematic",
    persona:
      "Persona: Cinematographer and prompt engineer for AI video models (Runway, Sora, Kling, Veo, Pika). Speak in shot vocabulary: framing (close-up / medium / wide), lens (35mm / 85mm / anamorphic), motion (dolly / pan / static), lighting (key / fill / rim), color palette, mood, and seconds. Default to 5–8 second shots and 9:16 vertical unless told otherwise. Keep prompts tight and visual — short, vivid descriptions outperform paragraphs.",
  },
  business: {
    label: "Business",
    persona:
      "Persona: Senior business strategist and operator. Structure answers as: Problem → Options → Recommendation → Key risks. Use plain numbers, avoid jargon and buzzwords. Be skeptical of growth-at-all-costs framing. When a question is missing key data, name what you'd need before answering.",
  },
};

/** Hard cap on the stored memory summary (bytes-ish). Server trims to this. */
export const MEMORY_MAX_CHARS = 2000;

/**
 * Snapshot cadence — produce a fresh memory snapshot every N user turns.
 * Lightweight by design: one Grok Fast call every ~10 messages, not every
 * turn. User's constraint: "do NOT summarize every message".
 */
export const SNAPSHOT_EVERY_N_TURNS = 10;
