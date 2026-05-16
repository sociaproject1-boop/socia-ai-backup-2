/**
 * mediaEncoder.ts — Real cinematic FFmpeg encoding pipeline
 *
 * Supports:
 * - MP4 / MOV containers
 * - H.264 (libx264) / H.265 (libx265) codecs
 * - 720p / 1080p / 2K / 4K resolution presets
 * - Real xfade transitions with automatic concat fallback
 * - Smart thumbnail extraction (FFmpeg thumbnail filter)
 * - 480p instant preview (ultrafast, streaming-optimised)
 * - 4-frame animated contact strip
 * - Optional ambient audio (sine-tone or silence)
 * - Full temp-dir cleanup in finally block
 */

import { spawn }                         from "node:child_process";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir }                         from "node:os";
import { join }                           from "node:path";
import ffmpegStaticPath                   from "ffmpeg-static";
import { logger }                         from "./logger.js";

const FFMPEG_BIN: string = (ffmpegStaticPath as unknown as string) || "ffmpeg";

/* ── Resolution presets ──────────────────────────────────────────── */
const QUALITY_PRESETS: Record<string, { width: number; height: number; crf: number }> = {
  "720p":  { width: 1280, height:  720, crf: 23 },
  "1080p": { width: 1920, height: 1080, crf: 20 },
  "2k":    { width: 2560, height: 1440, crf: 18 },
  "4k":    { width: 3840, height: 2160, crf: 16 },
};

/* ── Codec map ───────────────────────────────────────────────────── */
const CODEC_MAP: Record<string, string> = {
  h264: "libx264",
  h265: "libx265",
};

/* ── Transition → xfade name (safe FFmpeg 4.3+ subset) ──────────── */
const XFADE_MAP: Record<string, string> = {
  "fade":           "fade",
  "dissolve":       "dissolve",
  "zoom":           "zoom",
  "flash":          "fadeblack",
  "warp":           "wipetl",
  "slide-left":     "slideleft",
  "slide-right":    "slideright",
  "cinematic-blur": "fade",      // blur xfade may be absent; fallback to fade
  "glitch":         "pixelize",
  "anime-cut":      "fade",
  "film-burn":      "fadeblack",
  "speed-ramp":     "slideleft",
};

/* ── Public types ────────────────────────────────────────────────── */
export interface CinematicEncodeOptions {
  quality:    string;   // "720p" | "1080p" | "2k" | "4k"
  format:     string;   // "mp4" | "mov"
  codec:      string;   // "h264" | "h265"
  transition: string;   // TransitionType value from frontend
  soundtrack: string;   // "none" | anything else → ambient sine tone
}

export interface CinematicEncodeResult {
  videoBuffer:     Buffer;   // Full-quality encoded video
  previewBuffer:   Buffer;   // 480p instant-playback preview
  thumbnailBuffer: Buffer;   // Smart best-frame poster (JPEG)
  stripBuffer:     Buffer;   // 4-frame contact sheet (JPEG)
  durationSec:     number;
  fileSizeBytes:   number;
}

/* ── Internal helpers ────────────────────────────────────────────── */
function runFfmpeg(args: string[], label = "ffmpeg"): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(FFMPEG_BIN, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    proc.stderr.on("data", (c: Buffer) => {
      stderr = (stderr + c.toString()).slice(-6_144);
    });
    proc.on("error", (err) => reject(new Error(`${label} spawn: ${err.message}`)));
    proc.on("close", (code) => {
      if (code === 0) return resolve();
      reject(new Error(`${label} exit ${code}\n${stderr}`));
    });
  });
}

async function downloadToBuffer(url: string): Promise<Buffer> {
  const res = await fetch(url, { signal: AbortSignal.timeout(120_000) });
  if (!res.ok) throw new Error(`Segment download failed: HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function probeDuration(filePath: string): Promise<number> {
  return new Promise((resolve) => {
    const proc = spawn(FFMPEG_BIN, ["-v", "quiet", "-i", filePath], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stderr = "";
    proc.stderr.on("data", (c: Buffer) => { stderr += c.toString(); });
    proc.on("close", () => {
      const m = /Duration:\s*(\d+):(\d+):([\d.]+)/.exec(stderr);
      resolve(m
        ? parseInt(m[1], 10) * 3600 + parseInt(m[2], 10) * 60 + parseFloat(m[3])
        : 5.0, // fallback: assume 5 s Luma clip
      );
    });
    proc.on("error", () => resolve(5.0));
  });
}

/* ── Build filter_complex with xfade transitions ─────────────────── */
function buildXfadeArgs(
  segPaths:      string[],
  outPath:       string,
  opts:          CinematicEncodeOptions,
  durations:     number[],
  preset:        { width: number; height: number; crf: number },
): string[] {
  const vcodec     = CODEC_MAP[opts.codec] ?? "libx264";
  const xfade      = XFADE_MAP[opts.transition] ?? "fade";
  const tDur       = 0.5;  // transition overlap seconds
  const { width, height, crf } = preset;
  const N = segPaths.length;

  const args: string[] = ["-y"];
  segPaths.forEach(p => args.push("-i", p));

  const fp: string[] = [];

  // Scale + normalise each input
  for (let i = 0; i < N; i++) {
    fp.push(
      `[${i}:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,` +
      `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=24[v${i}]`,
    );
  }

  // Chain xfade between consecutive segments
  let lastLabel = "v0";
  let cumDur    = 0;
  for (let i = 0; i < N - 1; i++) {
    cumDur += durations[i];
    const offset   = Math.max(0.1, cumDur - (i + 1) * tDur);
    const outLabel = i === N - 2 ? "vout" : `x${i}`;
    fp.push(
      `[${lastLabel}][v${i + 1}]xfade=transition=${xfade}:duration=${tDur}:offset=${offset.toFixed(3)}[${outLabel}]`,
    );
    lastLabel = outLabel;
  }

  if (N === 1) {
    fp[0] = fp[0].replace("[v0]", "[vout]");
  }

  args.push("-filter_complex", fp.join(";"), "-map", "[vout]");
  args.push("-c:v", vcodec, "-preset", "fast", "-crf", String(crf));
  args.push("-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an");
  args.push(outPath);
  return args;
}

/* ── Simple concat fallback (no transitions) ─────────────────────── */
async function concatFallback(
  segPaths: string[],
  outPath:  string,
  preset:   { width: number; height: number; crf: number },
  listPath: string,
): Promise<void> {
  const { width, height, crf } = preset;
  await runFfmpeg([
    "-y",
    "-f", "concat", "-safe", "0", "-i", listPath,
    "-vf",
    `scale=${width}:${height}:force_original_aspect_ratio=decrease,` +
    `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=24`,
    "-c:v", "libx264", "-preset", "fast", "-crf", String(crf),
    "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an",
    outPath,
  ], "ffmpeg-concat-fallback");
}

/* ══════════════════════════════════════════════════════════════════
   PUBLIC API
══════════════════════════════════════════════════════════════════ */

/**
 * encodeCinematic
 *
 * Downloads segment URLs → applies full cinematic pipeline:
 * real xfade transitions, resolution scaling, codec selection,
 * optional audio → generates thumbnail + 480p preview + contact strip.
 */
export async function encodeCinematic(
  segmentUrls: string[],
  opts: CinematicEncodeOptions,
): Promise<CinematicEncodeResult> {
  const preset = QUALITY_PRESETS[opts.quality.toLowerCase()] ?? QUALITY_PRESETS["1080p"];
  const { width, height } = preset;
  const dir = await mkdtemp(join(tmpdir(), "socia-encode-"));

  try {
    // ── 1. Download segments (parallel) ─────────────────────────────
    logger.info(
      { count: segmentUrls.length, quality: opts.quality, codec: opts.codec, transition: opts.transition },
      "[mediaEncoder] Downloading segments",
    );
    const segPaths: string[] = new Array(segmentUrls.length);
    await Promise.all(
      segmentUrls.map(async (url, i) => {
        const buf = await downloadToBuffer(url);
        const p   = join(dir, `seg_${String(i).padStart(3, "0")}.mp4`);
        await writeFile(p, buf);
        segPaths[i] = p;
      }),
    );

    // ── 2. Probe durations for xfade offset calculation ─────────────
    const durations = await Promise.all(segPaths.map(probeDuration));
    const totalDur  = Math.max(
      1,
      durations.reduce((a, b) => a + b, 0) - Math.max(0, (segPaths.length - 1) * 0.5),
    );

    // ── 3. Concat list for fallback ──────────────────────────────────
    const listPath = join(dir, "concat.txt");
    await writeFile(
      listPath,
      segPaths.map(p => `file '${p.replace(/'/g, "'\\''")}'`).join("\n"),
    );

    // ── 4. Encode main video ─────────────────────────────────────────
    const ext     = opts.format === "mov" ? "mov" : "mp4";
    const outPath = join(dir, `out.${ext}`);

    logger.info(
      { quality: opts.quality, width, height, crf: preset.crf, transition: opts.transition },
      "[mediaEncoder] Encoding main video",
    );

    try {
      await runFfmpeg(buildXfadeArgs(segPaths, outPath, opts, durations, preset), "ffmpeg-xfade");
    } catch (xErr) {
      logger.warn(
        { err: (xErr as Error).message.slice(0, 300) },
        "[mediaEncoder] xfade failed — falling back to simple concat",
      );
      await concatFallback(segPaths, outPath, preset, listPath);
    }

    const videoBuffer = await readFile(outPath);

    // ── 5. Audio mixing (add silent or ambient track) ────────────────
    // We add audio in a post-pass so the main encode remains codec-agnostic.
    const audioOutPath = join(dir, `out_audio.${ext}`);
    const audioDur     = Math.ceil(totalDur);
    const hasAmbient   = opts.soundtrack && opts.soundtrack !== "none";

    try {
      if (hasAmbient) {
        // Ambient sine tone at very low volume (placeholder until real audio)
        await runFfmpeg([
          "-y",
          "-i", outPath,
          "-f", "lavfi", "-i", `sine=frequency=220:sample_rate=44100:duration=${audioDur}`,
          "-c:v", "copy",
          "-c:a", "aac", "-b:a", "128k",
          "-af", "volume=0.12",
          "-shortest",
          audioOutPath,
        ], "ffmpeg-audio-mix");
      } else {
        // Silent stereo track for compatibility
        await runFfmpeg([
          "-y",
          "-i", outPath,
          "-f", "lavfi", "-i", `anullsrc=channel_layout=stereo:sample_rate=44100`,
          "-c:v", "copy",
          "-c:a", "aac", "-b:a", "64k",
          "-shortest",
          audioOutPath,
        ], "ffmpeg-audio-silence");
      }
      // Replace videoBuffer with audio version if successful
      const audioBuffer = await readFile(audioOutPath);
      const finalPath = outPath;
      await writeFile(finalPath, audioBuffer);
    } catch (audioErr) {
      logger.warn({ err: (audioErr as Error).message }, "[mediaEncoder] Audio mix failed, keeping silent video");
    }

    const finalVideoBuffer = await readFile(outPath);

    // ── 6. Thumbnail + preview + strip (parallel, all non-critical) ──
    const thumbPath   = join(dir, "thumb.jpg");
    const previewPath = join(dir, "preview.mp4");
    const stripPath   = join(dir, "strip.jpg");
    const thumbW      = Math.min(width, 1280);
    const thumbH      = Math.min(height, 720);

    await Promise.allSettled([
      // Smart thumbnail: FFmpeg thumbnail filter analyses N frames → picks best
      runFfmpeg([
        "-y", "-i", outPath,
        "-vf", `thumbnail=200,scale=${thumbW}:${thumbH}:force_original_aspect_ratio=decrease`,
        "-frames:v", "1", "-q:v", "3",
        thumbPath,
      ], "ffmpeg-thumbnail").catch(() =>
        runFfmpeg(["-y", "-ss", "1", "-i", outPath, "-frames:v", "1", "-q:v", "3", thumbPath], "ffmpeg-thumb-t1s"),
      ),

      // 480p preview — ultrafast, movflags faststart for immediate browser playback
      runFfmpeg([
        "-y", "-i", outPath,
        "-vf", "scale=854:480:force_original_aspect_ratio=decrease,pad=854:480:(ow-iw)/2:(oh-ih)/2",
        "-c:v", "libx264", "-preset", "ultrafast", "-crf", "28",
        "-movflags", "+faststart", "-an",
        previewPath,
      ], "ffmpeg-preview"),

      // 4-frame contact strip (one frame every 3 s, tiled 4×1)
      runFfmpeg([
        "-y", "-i", outPath,
        "-vf", "fps=1/3,scale=320:-1,tile=4x1",
        "-frames:v", "1", "-q:v", "4",
        stripPath,
      ], "ffmpeg-strip"),
    ]);

    const [thumbnailBuffer, previewBuffer, stripBuffer] = await Promise.all([
      readFile(thumbPath).catch(() => Buffer.alloc(0)),
      readFile(previewPath).catch(() => Buffer.alloc(0)),
      readFile(stripPath).catch(() => Buffer.alloc(0)),
    ]);

    return {
      videoBuffer:     finalVideoBuffer,
      previewBuffer,
      thumbnailBuffer,
      stripBuffer,
      durationSec:     Math.round(totalDur),
      fileSizeBytes:   finalVideoBuffer.byteLength,
    };
  } finally {
    rm(dir, { recursive: true, force: true }).catch(err => {
      logger.warn({ err, dir }, "[mediaEncoder] Failed to clean temp dir");
    });
  }
}
