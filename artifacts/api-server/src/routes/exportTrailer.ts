import { Router } from "express";
import express from "express";
import { spawn } from "child_process";
import { writeFile, readFile, unlink } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { logger } from "../lib/logger.js";

// ffmpeg-static exports the binary path as default
// eslint-disable-next-line @typescript-eslint/no-var-requires
const ffmpegPath: string | null = (await import("ffmpeg-static" as string)).default as string | null;

const router = Router();

/**
 * POST /api/export/trailer/convert
 * Body: raw WebM binary (Content-Type: video/webm or application/octet-stream)
 * Returns: MP4 binary with Content-Disposition: attachment
 */
router.post(
  "/export/trailer/convert",
  express.raw({ type: "*/*", limit: "500mb" }),
  async (req, res) => {
    if (!ffmpegPath) {
      logger.error("[exportTrailer] ffmpeg-static not found");
      res.status(500).json({ error: "ffmpeg not available on this server" });
      return;
    }

    const body = req.body as Buffer | undefined;
    if (!body || body.length === 0) {
      res.status(400).json({ error: "No video data received" });
      return;
    }

    const id = `trailer-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const inputPath = join(tmpdir(), `${id}.webm`);
    const outputPath = join(tmpdir(), `${id}.mp4`);

    const startMs = Date.now();
    logger.info({ bytes: body.length, id }, "[exportTrailer] Starting WebM → MP4 conversion");

    try {
      await writeFile(inputPath, body);

      await new Promise<void>((resolve, reject) => {
        const args = [
          "-y",
          "-i", inputPath,
          "-c:v", "libx264",
          "-preset", "fast",
          "-crf", "20",
          "-pix_fmt", "yuv420p",
          "-an",                   // no audio — trailer is visual only
          "-movflags", "+faststart",
          outputPath,
        ];

        const proc = spawn(ffmpegPath, args);
        const stderrLines: string[] = [];

        proc.stderr.on("data", (chunk: Buffer) => {
          stderrLines.push(chunk.toString());
        });

        proc.on("close", (code) => {
          if (code === 0) {
            resolve();
          } else {
            const tail = stderrLines.slice(-8).join("").trim();
            reject(new Error(`ffmpeg exited ${code}: ${tail}`));
          }
        });

        proc.on("error", (err) => {
          reject(new Error(`ffmpeg spawn error: ${err.message}`));
        });
      });

      const mp4 = await readFile(outputPath);
      const elapsed = Date.now() - startMs;

      logger.info({ bytes: mp4.length, elapsed, id }, "[exportTrailer] Conversion complete");

      res.set("Content-Type", "video/mp4");
      res.set("Content-Disposition", `attachment; filename="socia-trailer.mp4"`);
      res.set("Content-Length", String(mp4.length));
      res.send(mp4);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error({ err: msg, id }, "[exportTrailer] Conversion failed");
      if (!res.headersSent) {
        res.status(500).json({ error: "Video conversion failed", detail: msg });
      }
    } finally {
      await unlink(inputPath).catch(() => undefined);
      await unlink(outputPath).catch(() => undefined);
    }
  },
);

export default router;
