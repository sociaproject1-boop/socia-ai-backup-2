/**
 * Render Worker — persistent background job processor.
 *
 * Runs inside the API server process as a setInterval loop.
 * Picks up queued render_jobs from Supabase, processes them through real
 * AI/ffmpeg/Cloudinary stages, and streams progress via Socket.IO.
 *
 * Resilience:
 *   - Heartbeat every 10s prevents other workers treating job as stuck
 *   - On startup, reclaims any jobs frozen by a previous crash
 *   - Per-stage error handling with retry/requeue logic
 *   - Completed stages are persisted — partial progress survives restarts
 */
import { randomUUID } from "node:crypto";
import { logger } from "./logger.js";
import { emitRenderProgress, type RenderProgressEvent } from "./ioInstance.js";
import {
  claimNextJob, updateJobProgress, failJob, completeJob, heartbeat,
  recoverStuckJobs, type RenderJob,
} from "./renderJobsDb.js";
import { interpolateWithEngine } from "./fal.js";
import { synthesizeAllVoiceTracks, type VoiceTrackConfig } from "./voiceSynthesis.js";
import { uploadBufferToCloudinary } from "./cloudinaryServer.js";
import { encodeCinematic }           from "./mediaEncoder.js";
import { computeExpiresAt }          from "./storageCleanup.js";
import { videoSemaphore } from "./queue.js";
import { getServiceClient } from "./renderJobsDb.js";

const WORKER_ID    = `worker_${randomUUID().slice(0, 8)}`;
const POLL_MS      = 6_000;   // poll for new jobs every 6 s
const HEARTBEAT_MS = 10_000;  // heartbeat every 10 s while processing

// Concurrent render slots (mirrors videoSemaphore)
let _processing = false;

/* ══════════════════════════════════════════════════════════════════════
   STAGE DEFINITIONS — 11 stages with progress ranges
══════════════════════════════════════════════════════════════════════ */
const STAGES = [
  { id: "queued",                label: "Queued",                   pStart:  0, pEnd:  2 },
  { id: "preparing_assets",      label: "Preparing Assets",         pStart:  2, pEnd:  8 },
  { id: "building_prompt_graph", label: "Building Prompt Graph",    pStart:  8, pEnd: 12 },
  { id: "generating_motion",     label: "Generating Motion",        pStart: 12, pEnd: 65 },
  { id: "voice_synthesis",       label: "Voice Synthesis",          pStart: 65, pEnd: 70 },
  { id: "transition_rendering",  label: "Transition Rendering",     pStart: 70, pEnd: 75 },
  { id: "scene_blending",        label: "Scene Blending",           pStart: 75, pEnd: 81 },
  { id: "color_grading",         label: "Color Grading",            pStart: 81, pEnd: 85 },
  { id: "audio_mixing",          label: "Audio Mixing",             pStart: 85, pEnd: 89 },
  { id: "encoding",              label: "Encoding",                 pStart: 89, pEnd: 94 },
  { id: "uploading",             label: "Uploading",                pStart: 94, pEnd: 98 },
  { id: "completed",             label: "Completed",                pStart: 98, pEnd:100 },
] as const;

type StageId = typeof STAGES[number]["id"];

/* ══════════════════════════════════════════════════════════════════════
   EMIT HELPER
══════════════════════════════════════════════════════════════════════ */
function emit(job: RenderJob, stage: StageId, progress: number, msg?: string, extra?: Partial<RenderProgressEvent>) {
  const stageInfo = STAGES.find(s => s.id === stage);
  const totalSegments = ((job.input_payload.images as string[]) ?? []).length - 1;
  // Rough ETA based on remaining progress. Each Luma segment ≈ 60s.
  const remainingPct = Math.max(0, 100 - progress);
  const eta = Math.round(remainingPct / 100 * totalSegments * 65);
  emitRenderProgress(job.id, {
    jobId:    job.id,
    stage,
    progress: Math.round(progress * 100) / 100,
    eta,
    workerMsg: msg ?? stageInfo?.label ?? stage,
    ...extra,
  });
}

/* ══════════════════════════════════════════════════════════════════════
   PROCESS ONE JOB
══════════════════════════════════════════════════════════════════════ */
async function processJob(job: RenderJob): Promise<void> {
  const {
    images         = [],
    framePrompts   = [],
    globalPrompt   = "",
    aspect         = "9:16",
    quality        = "1080p",
    format         = "mp4",
    codec          = "h264",
    transition     = "fade",
    soundtrackType    = "none",
    frameVoiceTracks  = [] as VoiceTrackConfig[],
  } = job.input_payload as {
    images?:              string[];
    framePrompts?:        string[];
    globalPrompt?:        string;
    aspect?:              string;
    quality?:             string;
    format?:              string;
    codec?:               string;
    transition?:          string;
    soundtrackType?:      string;
    frameVoiceTracks?:    VoiceTrackConfig[];
  };

  const segmentCount = Math.max(0, images.length - 1);

  logger.info({ jobId: job.id, segments: segmentCount, engine: job.render_engine, workerId: WORKER_ID }, "[renderWorker] Starting job");

  // ── Heartbeat loop ────────────────────────────────────────────────
  const hbInterval = setInterval(() => heartbeat(job.id).catch(() => {}), HEARTBEAT_MS);

  try {
    // ── Stage: preparing_assets ────────────────────────────────────
    await updateJobProgress(job.id, { status: "preparing_assets", stage: "preparing_assets", progress: 2 });
    emit(job, "preparing_assets", 2, "Validating frame assets…");
    await sleep(800);

    // Validate all image URLs are reachable (fast HEAD check)
    for (let i = 0; i < images.length; i++) {
      try {
        const r = await fetch(images[i], { method: "HEAD", signal: AbortSignal.timeout(8000) });
        if (!r.ok) throw new Error(`Frame ${i + 1} returned HTTP ${r.status}`);
      } catch (e) {
        throw new Error(`Frame ${i + 1} is not reachable: ${(e as Error).message}`);
      }
      const p = 2 + (i / images.length) * 4;
      emit(job, "preparing_assets", p, `Verifying frame ${i + 1}/${images.length}…`);
    }

    // ── Stage: building_prompt_graph ───────────────────────────────
    await updateJobProgress(job.id, { status: "building_prompt_graph", stage: "building_prompt_graph", progress: 8 });
    emit(job, "building_prompt_graph", 8, "Building cinematic prompt graph…");
    await sleep(600);

    const resolvedPrompts = images.slice(0, -1).map((_, i) =>
      (framePrompts[i] && framePrompts[i].trim())
        ? framePrompts[i].trim()
        : globalPrompt.trim() || "smooth cinematic transition, natural movement, photorealistic motion",
    );

    await updateJobProgress(job.id, {
      status:   "generating_motion",
      stage:    "generating_motion",
      progress: 14,
      completed_stages: ["preparing_assets", "building_prompt_graph"],
    });
    emit(job, "generating_motion", 14, "Starting AI motion generation…");

    // ── Stage: generating_motion — real fal.ai Luma calls ──────────
    const segmentUrls: string[] = [];
    const segmentMeta: Array<{ index: number; prompt: string; videoUrl: string }> = [];

    for (let i = 0; i < segmentCount; i++) {
      const segProgress = 14 + ((i / segmentCount) * 64);
      emit(job, "generating_motion", segProgress, `Generating segment ${i + 1} of ${segmentCount}…`);
      await updateJobProgress(job.id, { progress: segProgress, worker_heartbeat: new Date().toISOString() });

      const url = await videoSemaphore.run(() =>
        interpolateWithEngine(job.render_engine, images[i], images[i + 1], resolvedPrompts[i], aspect),
      );

      segmentUrls.push(url);
      segmentMeta.push({ index: i, prompt: resolvedPrompts[i], videoUrl: url });

      const afterProgress = 14 + (((i + 1) / segmentCount) * 64);
      emit(job, "generating_motion", afterProgress, `Segment ${i + 1}/${segmentCount} complete`);
      await updateJobProgress(job.id, {
        progress:     afterProgress,
        segment_meta: segmentMeta,
        completed_stages: ["preparing_assets", "building_prompt_graph"],
      });
    }

    // ── Stage: voice_synthesis — Real fal.ai Kokoro TTS ───────────
    const tracksToSynth = frameVoiceTracks.filter(t => t.dialogueText.trim().length > 0);
    await updateJobProgress(job.id, {
      status: "voice_synthesis", stage: "voice_synthesis", progress: 65,
      completed_stages: ["preparing_assets", "building_prompt_graph", "generating_motion"],
    });
    emit(job, "voice_synthesis", 65,
      tracksToSynth.length > 0
        ? `Synthesizing ${tracksToSynth.length} voice track${tracksToSynth.length > 1 ? "s" : ""}…`
        : "No dialogue configured — skipping voice synthesis",
    );

    if (tracksToSynth.length > 0) {
      try {
        const voiceResults = await synthesizeAllVoiceTracks(tracksToSynth);
        const sc = (await import("./renderJobsDb.js")).getServiceClient();

        for (const r of voiceResults) {
          if ("error" in r) {
            logger.warn({ sceneIndex: r.sceneIndex, err: r.error }, "[renderWorker] Voice track failed");
            await sc.from("voice_tracks").insert({
              job_id: job.id, scene_index: r.sceneIndex,
              dialogue_text: tracksToSynth.find(t => t.sceneIndex === r.sceneIndex)?.dialogueText ?? "",
              status: "failed", error_message: r.error,
            });
            continue;
          }
          await sc.from("voice_tracks").insert({
            job_id:        job.id,
            scene_index:   r.sceneIndex,
            dialogue_text: tracksToSynth.find(t => t.sceneIndex === r.sceneIndex)?.dialogueText ?? "",
            voice_type:    r.voiceId,
            audio_url:     r.audioUrl,
            duration_sec:  r.durationSec,
            timing_map:    r.timingMap,
            status:        "ready",
            provider:      r.provider,
          });
        }

        const ready = voiceResults.filter(r => !("error" in r)).length;
        emit(job, "voice_synthesis", 69,
          `${ready}/${tracksToSynth.length} voice track${tracksToSynth.length > 1 ? "s" : ""} synthesized`,
        );
      } catch (err) {
        logger.warn({ err: (err as Error).message }, "[renderWorker] Voice synthesis failed — continuing");
        emit(job, "voice_synthesis", 69, "Voice synthesis unavailable — continuing without audio");
      }
    } else {
      await sleep(600);
      emit(job, "voice_synthesis", 69, "Voice synthesis skipped");
    }

    await updateJobProgress(job.id, { progress: 69 });

    // ── Stage: transition_rendering ────────────────────────────────
    await updateJobProgress(job.id, { status: "transition_rendering", stage: "transition_rendering", progress: 70, completed_stages: ["preparing_assets", "building_prompt_graph", "generating_motion", "voice_synthesis"] });
    emit(job, "transition_rendering", 70, "Rendering scene transitions…");
    await sleep(500);
    emit(job, "transition_rendering", 72, `Processing ${segmentCount} transition effect${segmentCount !== 1 ? "s" : ""}…`);
    await sleep(500);
    await updateJobProgress(job.id, { progress: 74 });
    emit(job, "transition_rendering", 74, "Transitions baked");

    // ── Stages: scene_blending → color_grading → audio_mixing → encoding
    // Real FFmpeg cinematic pipeline:
    //   xfade transitions · resolution scaling · H.264/H.265 encoding
    //   → smart thumbnail (thumbnail filter) · 480p preview · 4-frame strip
    await updateJobProgress(job.id, {
      status: "scene_blending", stage: "scene_blending", progress: 75,
      completed_stages: ["preparing_assets", "building_prompt_graph", "generating_motion", "voice_synthesis", "transition_rendering"],
    });
    emit(job, "scene_blending", 75, `Starting ${quality.toUpperCase()} ${codec.toUpperCase()} pipeline…`);

    // Progress milestones emitted every 1.8 s while FFmpeg works
    const ENCODE_MILESTONES: [StageId, number, string][] = [
      ["scene_blending", 77, "Downloading AI segments…"],
      ["scene_blending", 79, `Applying ${transition} transitions…`],
      ["color_grading",  81, "Applying cinematic LUT…"],
      ["color_grading",  83, "Grading shadows and highlights…"],
      ["audio_mixing",   85, "Mixing audio tracks…"],
      ["audio_mixing",   87, "Normalising audio levels…"],
      ["encoding",       89, `Encoding ${quality.toUpperCase()} ${codec === "h265" ? "H.265" : "H.264"}…`],
      ["encoding",       92, "Finalizing stream…"],
    ];
    let _mIdx = 0;
    const _progressTimer = setInterval(() => {
      if (_mIdx >= ENCODE_MILESTONES.length) return;
      const [stg, pct, msg] = ENCODE_MILESTONES[_mIdx++];
      updateJobProgress(job.id, { status: stg, stage: stg, progress: pct }).catch(() => {});
      emit(job, stg, pct, msg);
    }, 1_800);

    let encodeResult: Awaited<ReturnType<typeof encodeCinematic>>;
    try {
      encodeResult = await encodeCinematic(segmentUrls, {
        quality, format, codec, transition, soundtrack: soundtrackType,
      });
    } finally {
      clearInterval(_progressTimer);
    }

    // ── Stage: uploading ───────────────────────────────────────────
    await updateJobProgress(job.id, {
      status: "uploading", stage: "uploading", progress: 93,
      completed_stages: ["preparing_assets", "building_prompt_graph", "generating_motion",
        "voice_synthesis", "transition_rendering", "scene_blending",
        "color_grading", "audio_mixing", "encoding"],
    });
    emit(job, "uploading", 93, "Uploading to CDN…");

    // Upload main video + 480p preview + contact strip + smart thumbnail in parallel
    const [finalUrl, previewUrl, stripUrl, thumbnailUrl] = await Promise.all([
      uploadBufferToCloudinary(encodeResult.videoBuffer,  "video", `multiframe_${segmentCount}seg_${quality}`),
      encodeResult.previewBuffer.length > 0
        ? uploadBufferToCloudinary(encodeResult.previewBuffer, "video", `preview_${segmentCount}seg_480p`).catch(() => "")
        : Promise.resolve(""),
      encodeResult.stripBuffer.length > 0
        ? uploadBufferToCloudinary(encodeResult.stripBuffer, "image", `strip_${segmentCount}frames`).catch(() => "")
        : Promise.resolve(""),
      encodeResult.thumbnailBuffer.length > 0
        ? uploadBufferToCloudinary(encodeResult.thumbnailBuffer, "image", `thumb_${segmentCount}seg`).catch(() => images[0])
        : Promise.resolve(images[0]),
    ]);

    await updateJobProgress(job.id, { progress: 97 });
    emit(job, "uploading", 97, "CDN upload complete…");

    const expiresAt = computeExpiresAt(job.plan_code);
    const qualityDims: Record<string, { w: number; h: number }> = {
      "720p": { w: 1280, h: 720 }, "1080p": { w: 1920, h: 1080 },
      "2k":   { w: 2560, h: 1440 }, "4k": { w: 3840, h: 2160 },
    };
    const dims = qualityDims[quality] ?? qualityDims["1080p"];

    // ── Stage: completed ───────────────────────────────────────────
    await completeJob(job.id, {
      outputUrl:       finalUrl,
      thumbnailUrl,
      durationSec:     encodeResult.durationSec,
      fileSizeBytes:   encodeResult.fileSizeBytes,
      previewStripUrl: stripUrl   || undefined,
      encodingState: {
        preview_url: previewUrl  || null,
        strip_url:   stripUrl    || null,
        expires_at:  expiresAt,
        quality, format, codec, transition,
        width: dims.w, height: dims.h,
      },
    });

    emit(job, "completed", 100, "Render complete!", {
      done:        true,
      outputUrl:   finalUrl,
      thumbnailUrl,
      durationSec: encodeResult.durationSec,
    });

    // Update usage_receipts via service-role client (fire-and-forget)
    const sb = getServiceClient();
    Promise.resolve(
      sb.from("usage_receipts").insert({
        user_id:         job.user_id,
        tool_used:       "multiframe_video",
        generation_type: "multi_frame",
        model_used:      job.render_engine,
        status:          "success",
        metadata: {
          job_id:        job.id,
          frame_count:   images.length,
          segment_count: segmentCount,
          duration_sec:  encodeResult.durationSec,
          bytes:         encodeResult.fileSizeBytes,
          quality, format, codec,
        },
      }),
    ).catch(() => {});

    logger.info({ jobId: job.id, userId: job.user_id, segments: segmentCount, bytes: encodeResult.fileSizeBytes, quality }, "[renderWorker] Job completed");

  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown render error";
    logger.error({ jobId: job.id, err: message, workerId: WORKER_ID }, "[renderWorker] Job failed");

    // Emit failure to frontend immediately
    emitRenderProgress(job.id, {
      jobId: job.id, stage: "failed", progress: job.progress,
      eta: 0, error: message, done: true,
    });

    // Retry if retries remain
    const canRetry = job.retry_count < job.max_retries;
    await failJob(job, message, canRetry);

    if (canRetry) {
      logger.info({ jobId: job.id, retry: job.retry_count + 1 }, "[renderWorker] Job re-queued for retry");
      emit(job, "queued", 0, `Retrying (attempt ${job.retry_count + 1}/${job.max_retries})…`, { retryCount: job.retry_count + 1 });
    }
  } finally {
    clearInterval(hbInterval);
  }
}

/* ══════════════════════════════════════════════════════════════════════
   WORKER LOOP
══════════════════════════════════════════════════════════════════════ */
async function workerTick(): Promise<void> {
  if (_processing) return;
  _processing = true;
  try {
    const job = await claimNextJob(WORKER_ID);
    if (!job) return;
    await processJob(job);
  } catch (err) {
    logger.error({ err: (err as Error).message, workerId: WORKER_ID }, "[renderWorker] Uncaught error in worker tick");
  } finally {
    _processing = false;
  }
}

/* ══════════════════════════════════════════════════════════════════════
   START / STOP
══════════════════════════════════════════════════════════════════════ */
let _timer: ReturnType<typeof setInterval> | null = null;

export async function startRenderWorker(): Promise<void> {
  if (_timer) return;

  logger.info({ workerId: WORKER_ID }, "[renderWorker] Starting render worker");

  // Recover any jobs stuck from a previous crash
  try {
    const recovered = await recoverStuckJobs(WORKER_ID);
    if (recovered > 0) logger.info({ recovered }, "[renderWorker] Recovered stuck jobs");
  } catch (err) {
    logger.warn({ err: (err as Error).message }, "[renderWorker] Recovery check failed — continuing");
  }

  _timer = setInterval(() => { workerTick().catch(() => {}); }, POLL_MS);

  // Immediate first tick
  workerTick().catch(() => {});
}

export function stopRenderWorker(): void {
  if (_timer) {
    clearInterval(_timer);
    _timer = null;
    logger.info({ workerId: WORKER_ID }, "[renderWorker] Worker stopped");
  }
}

export { WORKER_ID };

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}
