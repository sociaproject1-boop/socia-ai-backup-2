/**
 * voiceSynth.ts — Voice synthesis REST endpoints
 *
 * POST /api/voice/preview   — On-demand TTS preview (no job required)
 * GET  /api/voice/tracks/:jobId — Fetch voice tracks for a completed render job
 */

import { Router }                          from "express";
import { requireAuth, getAuthedUser } from "../lib/replitAuth.js";
import { getServiceClient }          from "../lib/adminAuth.js";
import { synthesizeVoiceTrack }            from "../lib/voiceSynthesis.js";
import { logger }                          from "../lib/logger.js";

const router = Router();

/* ─────────────────────────────────────────────────────────────────
   POST /api/voice/preview
   Generates a TTS sample without creating a render job.
   Used for live voice preview in the studio UI.
───────────────────────────────────────────────────────────────── */
router.post("/voice/preview", requireAuth, async (req, res) => {
  const { dialogueText, voiceType, emotion, language, speedOverride } = req.body as {
    dialogueText?:  string;
    voiceType?:     string;
    emotion?:       string;
    language?:      string;
    speedOverride?: number;
  };

  if (!dialogueText?.trim()) {
    return res.status(400).json({ error: "dialogueText is required", code: "MISSING_TEXT" });
  }
  if (dialogueText.length > 1_000) {
    return res.status(400).json({ error: "dialogueText too long (max 1000 chars)", code: "TEXT_TOO_LONG" });
  }

  logger.info(
    { voiceType, emotion, chars: dialogueText.length },
    "[voiceSynth] Preview request",
  );

  try {
    const track = await synthesizeVoiceTrack({
      sceneIndex:   0,
      dialogueText: dialogueText.trim(),
      voiceType:    voiceType  ?? "cinematic-male",
      emotion:      emotion    ?? "calm",
      language:     language   ?? "en",
      speedOverride: typeof speedOverride === "number" ? speedOverride : undefined,
    });

    return res.json({
      audioUrl:    track.audioUrl,
      durationSec: track.durationSec,
      timingMap:   track.timingMap,
      voiceId:     track.voiceId,
      provider:    track.provider,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Voice synthesis failed";
    const isMissingKey = message.includes("FAL_KEY");

    logger.warn({ err: message }, "[voiceSynth] Preview failed");

    return res.status(isMissingKey ? 503 : 500).json({
      error:   message,
      code:    isMissingKey ? "FAL_KEY_MISSING" : "SYNTHESIS_FAILED",
      help:    isMissingKey
        ? "Add FAL_KEY to your server secrets to enable voice synthesis."
        : undefined,
    });
  }
});

/* ─────────────────────────────────────────────────────────────────
   GET /api/voice/tracks/:jobId
   Returns all generated voice tracks for a render job owned by the
   authenticated user.
───────────────────────────────────────────────────────────────── */
router.get("/voice/tracks/:jobId", requireAuth, async (req, res) => {
  const user   = getAuthedUser(req);
  const sb     = getServiceClient();
  const jobId  = req.params["jobId"];

  if (!sb) return res.status(503).json({ error: "Service unavailable" });

  // Verify job ownership
  const { data: job, error: jobErr } = await sb
    .from("render_jobs")
    .select("id")
    .eq("id", jobId)
    .eq("user_id", user.id)
    .single();

  if (jobErr || !job) {
    return res.status(404).json({ error: "Render job not found", code: "JOB_NOT_FOUND" });
  }

  // Fetch tracks via service client
  const sc = sb;
  const { data: tracks, error: tracksErr } = await sc
    .from("voice_tracks")
    .select("scene_index, dialogue_text, voice_type, emotion, audio_url, duration_sec, timing_map, status, provider, created_at")
    .eq("job_id", jobId)
    .order("scene_index", { ascending: true });

  if (tracksErr) {
    logger.warn({ err: tracksErr.message, jobId }, "[voiceSynth] Failed to fetch tracks");
    return res.status(500).json({ error: "Failed to fetch voice tracks" });
  }

  return res.json({ jobId, tracks: tracks ?? [] });
});

export default router;
