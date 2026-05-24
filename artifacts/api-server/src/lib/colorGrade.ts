/**
 * colorGrade.ts — Real cinematic color grading via FFmpeg `eq` + `curves`.
 *
 * Each preset is a deterministic FFmpeg filter chain that runs as a single
 * additional pass over the encoded video. NOT a CSS preview — this bakes
 * the look into the exported MP4.
 *
 * Preset IDs mirror the studio's `ColorGrade` union in CreateMultiFrame.tsx.
 * `none` is a sentinel meaning "skip this pass entirely" — the worker
 * should NOT call applyColorGrade for it.
 */

export type ColorGradePreset =
  | "none"
  | "teal-orange"
  | "noir"
  | "cyberpunk"
  | "warm-cinema"
  | "dreamy"
  | "documentary"
  | "horror"
  | "anime"
  | "vintage"
  | "blockbuster";

/**
 * Build the `-vf` filter string for a given preset.
 *
 * Returns `null` when the preset is "none" or unrecognized → caller
 * should skip the grading pass entirely.
 *
 * `eq=contrast:saturation:brightness:gamma` is the baseline. `curves` is
 * layered on top for the bolder looks (teal/orange split-tone, vintage
 * roll-off, etc). All filters here ship with FFmpeg core — no LUT files
 * required, so this runs identically in any environment with `ffmpeg`.
 */
export function colorGradeFilter(preset: ColorGradePreset | string): string | null {
  switch (preset) {
    case "teal-orange":
      // Hollywood classic: cool shadows, warm highlights, mild contrast bump.
      return "eq=contrast=1.15:saturation=1.20:brightness=0.02," +
             "curves=red='0/0 0.4/0.35 0.6/0.65 1/1':blue='0/0 0.4/0.5 0.6/0.45 1/0.95'";
    case "noir":
      // High-contrast desaturated B&W with crushed blacks.
      return "eq=contrast=1.35:saturation=0.05:brightness=-0.02,curves=all='0/0 0.3/0.18 0.7/0.85 1/1'";
    case "cyberpunk":
      // Magenta/cyan dual-tone with juiced saturation.
      return "eq=contrast=1.20:saturation=1.50:gamma=0.95," +
             "curves=red='0/0 0.5/0.55 1/1':blue='0/0.05 0.5/0.6 1/1'";
    case "warm-cinema":
      // Sun-baked golden hour, mild gamma lift on shadows.
      return "eq=contrast=1.10:saturation=1.18:gamma=1.08," +
             "curves=red='0/0.04 1/1':blue='0/0 1/0.92'";
    case "dreamy":
      // Soft pastel lift, low contrast, hazy whites.
      return "eq=contrast=0.92:saturation=1.05:brightness=0.04:gamma=1.10";
    case "documentary":
      // Neutral, slightly punchy, NHK-doc feel.
      return "eq=contrast=1.08:saturation=1.05:brightness=0.0";
    case "horror":
      // Crushed shadows, sickly green tint, drained skin tones.
      return "eq=contrast=1.30:saturation=0.75:brightness=-0.04:gamma=0.92," +
             "curves=green='0/0 0.5/0.55 1/0.95':red='0/0 1/0.92'";
    case "anime":
      // Vivid saturation + steep contrast curve for cel-shaded look.
      return "eq=contrast=1.18:saturation=1.45:brightness=0.02";
    case "vintage":
      // Faded blacks, sepia warm tint, low saturation.
      return "eq=contrast=0.95:saturation=0.78:brightness=0.03," +
             "curves=all='0/0.08 0.5/0.5 1/0.92':red='0/0.04 1/1':blue='0/0 1/0.85'";
    case "blockbuster":
      // Big-budget contrast + cool teal lift in shadows.
      return "eq=contrast=1.22:saturation=1.25:brightness=0.0," +
             "curves=blue='0/0.06 0.5/0.55 1/1':red='0/0 0.5/0.5 1/0.95'";
    case "none":
    default:
      return null;
  }
}

/**
 * Build the full ffmpeg arg list for a grading pass.
 * Caller is responsible for spawning ffmpeg and managing temp files.
 */
export function colorGradeArgs(
  inputPath: string,
  outputPath: string,
  preset: ColorGradePreset | string,
): string[] | null {
  const vf = colorGradeFilter(preset);
  if (!vf) return null;
  return [
    "-y", "-i", inputPath,
    "-vf", vf,
    // Re-encode video; copy audio stream untouched.
    "-c:v", "libx264", "-preset", "fast", "-crf", "20",
    "-pix_fmt", "yuv420p", "-movflags", "+faststart",
    "-c:a", "copy",
    outputPath,
  ];
}
