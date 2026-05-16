import { spawn } from "node:child_process";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ffmpegStaticPath from "ffmpeg-static";
import { logger } from "./logger.js";

// `ffmpeg-static` ships a typed `string | null` default export — the path to
// the bundled binary. Falls back to the system `ffmpeg` if for any reason the
// static binary isn't present (Replit Nix env always has 6.x).
const FFMPEG_BIN: string = (ffmpegStaticPath as unknown as string) || "ffmpeg";

export class StitchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StitchError";
  }
}

/**
 * Downloads each remote MP4 URL into a fresh temp directory, then concatenates
 * them into a single MP4 with ffmpeg. Re-encodes (libx264) so that segments
 * with slightly different timebases / SAR / framerates merge cleanly — pure
 * stream-copy concat is fragile across providers.
 *
 * Returns a Buffer of the merged MP4. The temp directory is removed in a
 * `finally` block regardless of outcome.
 */
export async function stitchMp4Urls(
  urls: string[],
  opts: { width?: number; height?: number; fps?: number } = {},
): Promise<Buffer> {
  if (urls.length === 0) throw new StitchError("No segments to stitch.");
  if (urls.length === 1) {
    // Trivial case — just download and return.
    const buf = await downloadToBuffer(urls[0]);
    return buf;
  }

  const dir = await mkdtemp(join(tmpdir(), "socia-stitch-"));
  try {
    // 1. Download every segment in parallel.
    const segPaths: string[] = [];
    await Promise.all(
      urls.map(async (url, i) => {
        const buf = await downloadToBuffer(url);
        const p = join(dir, `seg_${String(i).padStart(3, "0")}.mp4`);
        await writeFile(p, buf);
        segPaths.push(p);
      }),
    );
    // Preserve order (Promise.all doesn't guarantee push order).
    segPaths.sort();

    // 2. Build the concat demuxer list file.
    const listPath = join(dir, "concat.txt");
    const listBody = segPaths.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join("\n");
    await writeFile(listPath, listBody);

    // 3. Run ffmpeg. Re-encode for safety; drop audio (Luma clips are silent).
    const outPath = join(dir, "merged.mp4");
    const args = [
      "-y",
      "-f", "concat",
      "-safe", "0",
      "-i", listPath,
      "-vf", `scale=${opts.width ?? "trunc(iw/2)*2"}:${opts.height ?? "trunc(ih/2)*2"}${opts.fps ? `,fps=${opts.fps}` : ""}`,
      "-c:v", "libx264",
      "-preset", "medium",
      "-crf", "20",
      "-pix_fmt", "yuv420p",
      "-movflags", "+faststart",
      "-an",
      outPath,
    ];

    logger.info({ segments: segPaths.length, ffmpeg: FFMPEG_BIN }, "Stitching segments with ffmpeg");
    await runFfmpeg(args);

    return await readFile(outPath);
  } finally {
    // Always clean up — even on failure.
    rm(dir, { recursive: true, force: true }).catch((err) => {
      logger.warn({ err, dir }, "Failed to clean up stitch temp dir");
    });
  }
}

async function downloadToBuffer(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new StitchError(`Failed to download segment: HTTP ${res.status}`);
  const ab = await res.arrayBuffer();
  return Buffer.from(ab);
}

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(FFMPEG_BIN, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderrTail = "";
    proc.stderr.on("data", (c: Buffer) => {
      // Keep the last ~4KB of stderr so error messages are useful but not huge.
      stderrTail = (stderrTail + c.toString()).slice(-4096);
    });
    proc.on("error", (err) => reject(new StitchError(`ffmpeg spawn failed: ${err.message}`)));
    proc.on("close", (code) => {
      if (code === 0) return resolve();
      reject(new StitchError(`ffmpeg exited with code ${code}\n${stderrTail}`));
    });
  });
}
