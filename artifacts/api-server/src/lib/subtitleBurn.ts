/**
 * subtitleBurn.ts — Generate a valid SRT file from per-scene dialogue +
 * build the FFmpeg arg list to permanently burn it into the final MP4.
 *
 * Uses FFmpeg's `subtitles` filter (libass-backed) so timing, multiline,
 * UTF-8 and styling all work without any external dependencies. The
 * resulting captions are part of the encoded video stream, not a
 * sidecar — players that strip subtitle tracks cannot hide them, which is
 * exactly the TikTok / Reels expectation.
 *
 * No-op when no dialogue is present → caller should skip the pass.
 */

export interface SubtitleScene {
  /** 0-based index matching segment order. */
  sceneIndex: number;
  /** Dialogue line to display while this segment plays. */
  dialogueText: string;
}

/**
 * Format a number of seconds as `HH:MM:SS,mmm` per SRT spec.
 */
function formatSrtTimestamp(sec: number): string {
  if (!isFinite(sec) || sec < 0) sec = 0;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const ms = Math.round((sec - Math.floor(sec)) * 1000);
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms, 3)}`;
}

/**
 * Wrap a long line on word boundaries so captions don't overflow the
 * frame. Two-line max — TikTok-safe. Pure formatting; the burn-in step
 * is responsible for font size + safe-area positioning.
 */
function wrapDialogue(text: string, maxCharsPerLine = 38): string {
  const words = text.trim().split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if (cur.length === 0) { cur = w; continue; }
    if ((cur.length + 1 + w.length) > maxCharsPerLine && lines.length < 1) {
      lines.push(cur);
      cur = w;
    } else {
      cur += " " + w;
    }
  }
  if (cur) lines.push(cur);
  return lines.join("\n");
}

/**
 * Build a valid SRT string from per-scene dialogue + the measured
 * duration of each segment from `probeDuration`.
 *
 * Cumulative timing: scene i runs from sum(durations[0..i-1]) to
 * sum(durations[0..i]). xfade overlap (0.5s) is small enough to ignore
 * for caption readability.
 */
export function buildSrtFromScenes(
  scenes: SubtitleScene[],
  segmentDurations: number[],
): string {
  if (scenes.length === 0) return "";
  // Pre-compute scene-start times
  const starts: number[] = new Array(segmentDurations.length);
  let acc = 0;
  for (let i = 0; i < segmentDurations.length; i++) {
    starts[i] = acc;
    acc += segmentDurations[i] ?? 5;
  }

  const filtered = scenes
    .filter(s => s.dialogueText && s.dialogueText.trim().length > 0)
    .sort((a, b) => a.sceneIndex - b.sceneIndex);

  const lines: string[] = [];
  filtered.forEach((s, idx) => {
    const i = s.sceneIndex;
    if (i < 0 || i >= starts.length) return;
    const start = starts[i] ?? 0;
    const end   = start + (segmentDurations[i] ?? 5) - 0.1; // small breath
    lines.push(String(idx + 1));
    lines.push(`${formatSrtTimestamp(start)} --> ${formatSrtTimestamp(end)}`);
    lines.push(wrapDialogue(s.dialogueText));
    lines.push("");
  });
  return lines.join("\n");
}

/**
 * Whether burning is needed at all (any non-empty dialogue line).
 */
export function shouldBurnSubtitles(scenes: SubtitleScene[]): boolean {
  return scenes.some(s => s.dialogueText && s.dialogueText.trim().length > 0);
}

/**
 * Build the FFmpeg arg list for the burn-in pass.
 *
 * The `subtitles` filter loads libass and renders directly into the
 * video stream. `force_style` overrides the default ASS styling with
 * TikTok-safe values: bold sans, large size, white-on-black-outline,
 * positioned ~12% from the bottom of the frame.
 *
 * IMPORTANT: the path passed to the filter must be escaped for FFmpeg's
 * filter-graph parser. Colons and backslashes are the common breaks.
 */
export function subtitleBurnArgs(
  inputPath: string,
  srtPath: string,
  outputPath: string,
): string[] {
  // Escape FFmpeg filter-graph special chars in the path.
  const escapedSrt = srtPath.replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "\\'");
  const forceStyle = [
    "FontName=Inter",
    "FontSize=22",
    "PrimaryColour=&HFFFFFFFF",       // white
    "OutlineColour=&H80000000",       // 50% black
    "BorderStyle=1",
    "Outline=2",
    "Shadow=1",
    "Alignment=2",                     // bottom-center
    "MarginV=60",
    "Bold=1",
  ].join(",");
  return [
    "-y", "-i", inputPath,
    "-vf", `subtitles='${escapedSrt}':force_style='${forceStyle}'`,
    "-c:v", "libx264", "-preset", "fast", "-crf", "20",
    "-pix_fmt", "yuv420p", "-movflags", "+faststart",
    "-c:a", "copy",
    outputPath,
  ];
}
