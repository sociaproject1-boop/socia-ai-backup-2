/**
 * Socia GPT — multimodal media preprocessor.
 *
 * Turns user-uploaded image / audio / video URLs into the OpenAI multimodal
 * `content` parts the chat completion endpoint expects, with a Whisper
 * transcript appended in plain text for any audio/video track. All temp work
 * happens in `os.tmpdir()` and is cleaned up afterwards (best-effort).
 */
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";
import { speechToText } from "@workspace/integrations-openai-ai-server";
import { logger } from "./logger.js";

/** What the client posts to /api/socia-gpt/chat per attachment. */
export interface ChatAttachment {
  kind: "image" | "audio" | "video";
  url:  string;       // public Supabase Storage URL
  mime: string;
  name: string;
  size: number;       // bytes
}

/** Per-message OpenAI content part — `image_url` is the vision shape. */
export type OpenAIContentPart =
  | { type: "text";      text: string }
  | { type: "image_url"; image_url: { url: string } };

/** Hard caps so a malicious / mistaken upload can't burn the AI budget. */
const MAX_ATTACHMENTS_PER_MSG = 6;
const MAX_DOWNLOAD_BYTES = 25 * 1024 * 1024;     // 25 MB per file
const MAX_VIDEO_FRAMES   = 6;                    // evenly spaced
const FRAME_SIZE_PX      = 768;                  // long edge of extracted frame
const TRANSCRIPT_PREVIEW = 6_000;                // chars; safety cap before sending to model
const FFMPEG_TIMEOUT_MS  = 60_000;

/* ─────────────────────────── helpers ───────────────────────────── */

async function downloadToBuffer(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download failed (HTTP ${res.status})`);
  const len = Number(res.headers.get("content-length") || 0);
  if (len > MAX_DOWNLOAD_BYTES) {
    throw new Error(`file too large (${(len / 1_048_576).toFixed(1)} MB > 25 MB)`);
  }
  const ab = await res.arrayBuffer();
  if (ab.byteLength > MAX_DOWNLOAD_BYTES) {
    throw new Error(`file too large after download`);
  }
  return Buffer.from(ab);
}

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", ...args]);
    let stderr = "";
    p.stderr.on("data", (d) => { stderr += d.toString(); });
    const timer = setTimeout(() => {
      p.kill("SIGKILL");
      reject(new Error("ffmpeg timed out"));
    }, FFMPEG_TIMEOUT_MS);
    p.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-300)}`));
    });
    p.on("error", (err) => { clearTimeout(timer); reject(err); });
  });
}

async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "socia-gpt-"));
  try { return await fn(dir); }
  finally { await fs.rm(dir, { recursive: true, force: true }).catch(() => {}); }
}

function whisperFmtFromMime(mime: string): "wav" | "mp3" | "webm" {
  if (/wav/i.test(mime))  return "wav";
  if (/mpeg|mp3/i.test(mime)) return "mp3";
  return "webm";
}

/* ──────────────────── per-attachment processors ───────────────── */

async function processImage(att: ChatAttachment): Promise<{ parts: OpenAIContentPart[]; note: string }> {
  /* Pass the public URL straight through — OpenAI fetches it server-side. */
  return {
    parts: [{ type: "image_url", image_url: { url: att.url } }],
    note: `[image attached: ${att.name}]`,
  };
}

async function processAudio(att: ChatAttachment): Promise<{ parts: OpenAIContentPart[]; note: string }> {
  const buf = await downloadToBuffer(att.url);
  const fmt = whisperFmtFromMime(att.mime);
  let transcript = "";
  try {
    transcript = (await speechToText(buf, fmt)).trim();
  } catch (err) {
    logger.warn({ err, name: att.name }, "Socia GPT: audio transcription failed");
    transcript = "(audio transcription failed)";
  }
  if (transcript.length > TRANSCRIPT_PREVIEW) {
    transcript = transcript.slice(0, TRANSCRIPT_PREVIEW) + "… [truncated]";
  }
  return {
    parts: [],
    note: `[audio attached: "${att.name}"]\nTranscript:\n"""${transcript}"""`,
  };
}

async function processVideo(att: ChatAttachment): Promise<{ parts: OpenAIContentPart[]; note: string }> {
  const buf = await downloadToBuffer(att.url);
  return withTempDir(async (dir) => {
    const ext = (att.name.split(".").pop() || "mp4").toLowerCase().replace(/[^a-z0-9]/g, "") || "mp4";
    const inputPath = path.join(dir, `in.${ext}`);
    await fs.writeFile(inputPath, buf);

    /* 1) Extract evenly-spaced frames as JPEG @ FRAME_SIZE_PX long edge. */
    const framesGlob = path.join(dir, "frame_%02d.jpg");
    /* fps that yields ~MAX_VIDEO_FRAMES across short clips; ffmpeg will cap with -vframes. */
    await runFfmpeg([
      "-i", inputPath,
      "-vf", `fps=1,scale='if(gt(iw,ih),${FRAME_SIZE_PX},-2)':'if(gt(iw,ih),-2,${FRAME_SIZE_PX})'`,
      "-vframes", String(MAX_VIDEO_FRAMES),
      "-q:v", "5",
      framesGlob,
    ]);
    const frameFiles = (await fs.readdir(dir)).filter((f) => f.startsWith("frame_")).sort();
    const frameParts: OpenAIContentPart[] = [];
    for (const f of frameFiles) {
      const data = await fs.readFile(path.join(dir, f));
      const b64  = data.toString("base64");
      frameParts.push({ type: "image_url", image_url: { url: `data:image/jpeg;base64,${b64}` } });
    }

    /* 2) Extract mono 16k MP3 audio for Whisper. */
    let transcript = "";
    const audioPath = path.join(dir, "audio.mp3");
    try {
      await runFfmpeg([
        "-i", inputPath, "-vn", "-ac", "1", "-ar", "16000",
        "-b:a", "64k", audioPath,
      ]);
      const audioBuf = await fs.readFile(audioPath);
      if (audioBuf.length > 0) {
        transcript = (await speechToText(audioBuf, "mp3")).trim();
      }
    } catch (err) {
      logger.warn({ err, name: att.name }, "Socia GPT: video audio extraction failed");
    }
    if (transcript.length > TRANSCRIPT_PREVIEW) {
      transcript = transcript.slice(0, TRANSCRIPT_PREVIEW) + "… [truncated]";
    }

    const note = transcript
      ? `[video attached: "${att.name}", ${frameParts.length} frames sampled]\nAudio transcript:\n"""${transcript}"""`
      : `[video attached: "${att.name}", ${frameParts.length} frames sampled, no audible speech]`;
    return { parts: frameParts, note };
  });
}

/* ──────────────────────── public entry ─────────────────────────── */

/**
 * Convert a list of user attachments into OpenAI vision content parts plus a
 * plain-text "notes" string the caller should prepend to the user message.
 *
 * Errors per-attachment are caught and surfaced as a small note rather than
 * failing the whole request — so a single bad upload doesn't kill the chat.
 */
export async function buildAttachmentParts(
  attachments: ChatAttachment[],
): Promise<{ parts: OpenAIContentPart[]; notes: string[] }> {
  if (!Array.isArray(attachments) || attachments.length === 0) {
    return { parts: [], notes: [] };
  }
  if (attachments.length > MAX_ATTACHMENTS_PER_MSG) {
    throw new Error(`too many attachments (max ${MAX_ATTACHMENTS_PER_MSG} per message)`);
  }
  const parts: OpenAIContentPart[] = [];
  const notes: string[] = [];

  for (const att of attachments) {
    try {
      let r: { parts: OpenAIContentPart[]; note: string };
      if      (att.kind === "image") r = await processImage(att);
      else if (att.kind === "audio") r = await processAudio(att);
      else if (att.kind === "video") r = await processVideo(att);
      else throw new Error(`unsupported attachment kind: ${String(att.kind)}`);
      parts.push(...r.parts);
      notes.push(r.note);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "attachment failed";
      logger.warn({ err, kind: att.kind, name: att.name }, "Socia GPT: attachment processing failed");
      notes.push(`[attachment "${att.name}" could not be processed: ${msg}]`);
    }
  }
  return { parts, notes };
}

/** Light input validation reused by the route. */
export function validateAttachments(raw: unknown): ChatAttachment[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) throw new Error("attachments must be an array");
  if (raw.length > MAX_ATTACHMENTS_PER_MSG) {
    throw new Error(`too many attachments (max ${MAX_ATTACHMENTS_PER_MSG} per message)`);
  }
  const out: ChatAttachment[] = [];
  for (const a of raw) {
    if (!a || typeof a !== "object") throw new Error("attachment must be an object");
    const o = a as Record<string, unknown>;
    if (o.kind !== "image" && o.kind !== "audio" && o.kind !== "video") {
      throw new Error("attachment.kind must be image|audio|video");
    }
    if (typeof o.url !== "string" || !/^https?:\/\//.test(o.url)) {
      throw new Error("attachment.url must be an http(s) URL");
    }
    if (o.url.length > 2_000) throw new Error("attachment.url too long");
    if (typeof o.mime !== "string" || o.mime.length > 100) {
      throw new Error("attachment.mime invalid");
    }
    if (typeof o.name !== "string" || o.name.length > 256) {
      throw new Error("attachment.name invalid");
    }
    const size = Number(o.size);
    if (!Number.isFinite(size) || size < 0 || size > MAX_DOWNLOAD_BYTES) {
      throw new Error(`attachment.size invalid (max ${MAX_DOWNLOAD_BYTES} bytes)`);
    }
    out.push({ kind: o.kind, url: o.url, mime: o.mime, name: o.name, size });
  }
  return out;
}
