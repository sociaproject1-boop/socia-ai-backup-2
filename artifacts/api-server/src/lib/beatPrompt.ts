/**
 * beatPrompt.ts — Compose per-segment cinematic prompts that genuinely
 * carry the studio's beat-timeline data into the AI provider request.
 *
 * Before this module existed, `frame.beats[]` lived only in the client
 * state and was discarded at submit time. Camera/motion/emotion overrides
 * looked editable but never changed the render output. This file is the
 * bridge: it merges the segment's base prompt with a structured beat
 * description and frame-level continuity flags so providers like Luma /
 * Kling actually condition on them.
 */

export type CameraMove =
  | "static" | "dolly-in" | "dolly-out" | "orbit" | "pan-left" | "pan-right"
  | "tilt-up" | "tilt-down" | "handheld" | "drone-shot" | "cinematic-push"
  | "crash-zoom" | "tracking-shot" | "shoulder-cam";

export type MotionStrength = "subtle" | "balanced" | "strong" | "extreme";

export interface BeatLike {
  startSec?:        number;
  endSec?:          number;
  cameraMove?:      CameraMove | string;
  motionStrength?:  MotionStrength | string;
  facialBehavior?:  string;
  effect?:          string;
  dialogueTiming?:  string;
}

export interface SegmentPromptContext {
  basePrompt:      string;
  cameraMove?:     string;
  motionStrength?: string;
  emotion?:        string;
  beats?:          BeatLike[];
  /** Continuity locks from the StudioFrame. Each true flag becomes a
   *  hard "keep consistent" instruction in the final prompt. */
  keepFace?:        boolean;
  keepOutfit?:      boolean;
  keepHairstyle?:   boolean;
  keepEnvironment?: boolean;
  keepLighting?:    boolean;
  keepCinematicTone?: boolean;
}

function humanizeCamera(v?: string): string {
  if (!v || v === "static") return "static camera";
  return v.replace(/-/g, " ");
}

function humanizeMotion(v?: string): string {
  switch (v) {
    case "subtle":   return "subtle, barely-there motion";
    case "balanced": return "balanced, natural motion";
    case "strong":   return "strong, dynamic motion";
    case "extreme":  return "extreme, full-kinetic motion";
    default:         return "natural motion";
  }
}

/**
 * Compose the final per-segment prompt. Idempotent: if no beat / camera /
 * continuity info is present, the base prompt is returned unchanged so
 * legacy callers keep their previous behavior.
 */
export function composeSegmentPrompt(ctx: SegmentPromptContext): string {
  const parts: string[] = [];
  parts.push(ctx.basePrompt.trim());

  // Frame-level direction
  const directorChunks: string[] = [];
  if (ctx.cameraMove)     directorChunks.push(`camera: ${humanizeCamera(ctx.cameraMove)}`);
  if (ctx.motionStrength) directorChunks.push(humanizeMotion(ctx.motionStrength));
  if (ctx.emotion && ctx.emotion !== "neutral") directorChunks.push(`emotion: ${ctx.emotion}`);
  if (directorChunks.length) parts.push(`Direction — ${directorChunks.join(", ")}.`);

  // Continuity locks
  const locks: string[] = [];
  if (ctx.keepFace)          locks.push("same facial identity");
  if (ctx.keepOutfit)        locks.push("same outfit");
  if (ctx.keepHairstyle)     locks.push("same hairstyle");
  if (ctx.keepEnvironment)   locks.push("same environment");
  if (ctx.keepLighting)      locks.push("same lighting");
  if (ctx.keepCinematicTone) locks.push("same cinematic tone");
  if (locks.length) parts.push(`Continuity — keep ${locks.join(", ")} between frames.`);

  // Beat timeline
  if (ctx.beats && ctx.beats.length > 0) {
    const beatLines = ctx.beats.map((b, i) => {
      const span = (typeof b.startSec === "number" && typeof b.endSec === "number")
        ? `${b.startSec.toFixed(1)}s–${b.endSec.toFixed(1)}s`
        : `beat ${i + 1}`;
      const bits: string[] = [span];
      if (b.cameraMove && b.cameraMove !== "static") bits.push(`camera ${humanizeCamera(String(b.cameraMove))}`);
      if (b.motionStrength) bits.push(humanizeMotion(String(b.motionStrength)));
      if (b.facialBehavior && b.facialBehavior !== "none") bits.push(`face: ${b.facialBehavior}`);
      if (b.effect && b.effect !== "none") bits.push(`effect: ${b.effect}`);
      return `  - ${bits.join(" · ")}`;
    });
    parts.push(`Cinematic beat timeline — the motion MUST follow these beats in order:\n${beatLines.join("\n")}`);
  }

  return parts.join("\n\n");
}
