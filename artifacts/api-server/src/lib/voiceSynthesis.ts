/**
 * voiceSynthesis.ts — Real TTS pipeline via fal.ai Kokoro
 *
 * Provider: fal.ai Kokoro (open-source, runs on fal.ai infra, requires FAL_KEY)
 * Fallback:  descriptive error — never silently produces fake audio
 *
 * Voice type  → Kokoro voice ID mapping
 * Emotion     → speech speed + text preprocessing
 * Language    → Kokoro language tag
 */

import { logger } from "./logger.js";

const FAL_BASE         = "https://queue.fal.run";
const KOKORO_MODEL     = "fal-ai/kokoro";
const POLL_INTERVAL_MS = 3_000;
const TIMEOUT_MS       = 120_000; // 2 min

/* ── Voice type → Kokoro voice ID ────────────────────────────────── */
const VOICE_ID_MAP: Record<string, string> = {
  "cinematic-male":    "am_michael",
  "soft-female":       "af_bella",
  "emotional-female":  "af_sarah",
  "deep-narrator":     "am_adam",
  "documentary":       "bm_george",
  "anime-girl":        "af_bella",
  "anime-boy":         "am_michael",
  "villain":           "am_adam",
  "horror-whisper":    "bf_emma",
  "child":             "af_sarah",
  "robotic":           "am_michael",
  "cyberpunk-ai":      "am_adam",
  "calm-mentor":       "bm_george",
  "dramatic-trailer":  "am_michael",
};

/* ── Emotion → base speed multiplier ─────────────────────────────── */
const EMOTION_SPEED: Record<string, number> = {
  calm:          0.85,
  romantic:      0.88,
  angry:         1.20,
  sad:           0.78,
  fear:          1.12,
  inspirational: 1.05,
  serious:       0.92,
  happy:         1.15,
  tense:         1.18,
  emotional:     0.82,
  mysterious:    0.88,
  aggressive:    1.28,
};

/* ── Public types ─────────────────────────────────────────────────── */
export interface VoiceTrackConfig {
  sceneIndex:    number;
  dialogueText:  string;
  voiceType:     string;   // matches VoiceType in frontend
  emotion:       string;   // matches EmotionType in frontend
  language?:     string;   // "en" | "es" | "fr" | ...
  speedOverride?: number;  // 0.5–2.0, overrides emotion speed
}

export interface GeneratedVoiceTrack {
  sceneIndex:  number;
  audioUrl:    string;
  durationSec: number;
  timingMap:   Array<{ word: string; startMs: number; endMs: number }>;
  voiceId:     string;
  provider:    "kokoro";
}

export interface FailedVoiceTrack {
  sceneIndex: number;
  error:      string;
}

/* ── HTTP helpers ─────────────────────────────────────────────────── */
function falKey(): string {
  const k = (process.env["FAL_KEY"] || process.env["FAL_API_KEY"] || "").trim();
  if (!k) throw new Error("FAL_KEY not set — voice synthesis unavailable.");
  return k;
}

function authHeaders(): Record<string, string> {
  return {
    Authorization: `Key ${falKey()}`,
    "Content-Type": "application/json",
  };
}

async function submitTtsRequest(
  model: string,
  input: Record<string, unknown>,
): Promise<string> {
  const res = await fetch(`${FAL_BASE}/${model}`, {
    method:  "POST",
    headers: authHeaders(),
    body:    JSON.stringify(input),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`fal.ai TTS submit failed (${res.status}): ${body.slice(0, 300)}`);
  }
  const data = await res.json() as { request_id?: string };
  if (!data.request_id) throw new Error("fal.ai TTS: no request_id returned");
  logger.info({ requestId: data.request_id, model }, "[voiceSynthesis] TTS job submitted");
  return data.request_id;
}

interface KokoroAudioResult {
  audio?:   { url?: string; content_type?: string };
  timings?: { word_start_times?: number[] };
}

async function pollTtsUntilDone(
  model:     string,
  requestId: string,
): Promise<KokoroAudioResult> {
  const deadline = Date.now() + TIMEOUT_MS;

  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));

    const statusRes = await fetch(
      `${FAL_BASE}/${model}/requests/${requestId}/status`,
      { headers: authHeaders() },
    );
    if (!statusRes.ok) throw new Error(`TTS poll error: ${statusRes.status}`);

    const status = await statusRes.json() as { status: string; error?: string };

    if (status.status === "COMPLETED") {
      const resultRes = await fetch(
        `${FAL_BASE}/${model}/requests/${requestId}`,
        { headers: authHeaders() },
      );
      if (!resultRes.ok) throw new Error(`TTS result fetch error: ${resultRes.status}`);
      return await resultRes.json() as KokoroAudioResult;
    }

    if (status.status === "FAILED") {
      throw new Error(`Kokoro TTS failed: ${status.error ?? "unknown"}`);
    }
  }

  throw new Error("Kokoro TTS timed out after 2 minutes");
}

/* ── Text preprocessing per emotion ──────────────────────────────── */
function preprocessForEmotion(text: string, emotion: string): string {
  let t = text.trim();
  if (emotion === "sad" || emotion === "emotional") {
    t = t.replace(/\. /g, "... ");
  }
  if (emotion === "tense" || emotion === "fear") {
    t = t.replace(/,\s/g, ". ");
  }
  if (emotion === "mysterious") {
    t = t.replace(/\.\s/g, ". . . ");
  }
  return t;
}

/* ── Timing map helpers ───────────────────────────────────────────── */
function buildTimingMap(
  timings: KokoroAudioResult["timings"],
  text:    string,
  speed:   number,
): Array<{ word: string; startMs: number; endMs: number }> {
  const words = text.split(/\s+/).filter(Boolean);
  if (!words.length) return [];

  const starts = timings?.word_start_times ?? [];

  if (starts.length >= words.length) {
    return words.map((word, i) => ({
      word,
      startMs: Math.round(starts[i] * 1000),
      endMs:   Math.round((starts[i + 1] ?? starts[i] + 0.3) * 1000),
    }));
  }

  // Estimate when no timing data is available
  const msPerWord = Math.round(350 / speed);
  return words.map((word, i) => ({
    word,
    startMs: i * msPerWord,
    endMs:   (i + 1) * msPerWord,
  }));
}

function estimateDurationSec(text: string, speed: number): number {
  const words = text.split(/\s+/).filter(Boolean).length;
  return (words / (140 * speed)) * 60; // 140 wpm base rate
}

/* ══════════════════════════════════════════════════════════════════
   PUBLIC API
══════════════════════════════════════════════════════════════════ */

/**
 * synthesizeVoiceTrack — Real TTS generation for a single scene.
 * Uses Kokoro voice model via fal.ai queue API.
 */
export async function synthesizeVoiceTrack(
  config: VoiceTrackConfig,
): Promise<GeneratedVoiceTrack> {
  const voiceId = VOICE_ID_MAP[config.voiceType] ?? "am_michael";
  const speed   = config.speedOverride ?? (EMOTION_SPEED[config.emotion] ?? 1.0);
  const text    = preprocessForEmotion(config.dialogueText, config.emotion);

  logger.info(
    { sceneIndex: config.sceneIndex, voiceId, speed, emotion: config.emotion, chars: text.length },
    "[voiceSynthesis] Synthesizing voice track",
  );

  const requestId = await submitTtsRequest(KOKORO_MODEL, {
    prompt: text,
    voice:  voiceId,
    speed,
  });

  const result    = await pollTtsUntilDone(KOKORO_MODEL, requestId);
  const audioUrl  = result.audio?.url;

  if (!audioUrl) throw new Error("Kokoro returned no audio URL");

  const timingMap  = buildTimingMap(result.timings, text, speed);
  const durationSec = timingMap.length > 0
    ? (timingMap[timingMap.length - 1].endMs / 1000) + 0.5
    : estimateDurationSec(text, speed);

  logger.info(
    { sceneIndex: config.sceneIndex, durationSec, words: timingMap.length },
    "[voiceSynthesis] Voice track ready",
  );

  return {
    sceneIndex:  config.sceneIndex,
    audioUrl,
    durationSec: Math.round(durationSec * 10) / 10,
    timingMap,
    voiceId,
    provider:    "kokoro",
  };
}

/**
 * synthesizeAllVoiceTracks — Generate TTS for multiple scenes concurrently.
 * Individual failures are isolated — one failed scene does not block the rest.
 */
export async function synthesizeAllVoiceTracks(
  tracks: VoiceTrackConfig[],
): Promise<Array<GeneratedVoiceTrack | FailedVoiceTrack>> {
  const active = tracks.filter(t => t.dialogueText.trim().length > 0);
  if (!active.length) return [];

  const results = await Promise.allSettled(active.map(t => synthesizeVoiceTrack(t)));

  return results.map((r, i) => {
    if (r.status === "fulfilled") return r.value;
    const msg = r.reason instanceof Error ? r.reason.message : String(r.reason);
    logger.warn({ sceneIndex: active[i].sceneIndex, err: msg }, "[voiceSynthesis] Track failed");
    return { sceneIndex: active[i].sceneIndex, error: msg };
  });
}

export { VOICE_ID_MAP, EMOTION_SPEED };
