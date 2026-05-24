/**
 * Normalized provider result shape — every third-party video provider
 * adapter (Runway, Veo, Pika, …) must return this. Keeping the shape
 * uniform means the dispatcher can extract `.videoUrl` for the
 * downstream pipeline AND log provider/duration/metadata uniformly.
 *
 * NOTE: the public-facing API of `interpolateWithEngine()` still returns
 * `string` (the video URL) so the rest of the pipeline stays unchanged.
 * The dispatcher reads `result.videoUrl` after calling the adapter and
 * logs the metadata for observability/debugging.
 */
export interface ProviderResult {
  /** Public http(s) URL to the rendered MP4 (downloadable by ffmpeg). */
  videoUrl: string;
  /** Stable provider identifier — used for logging and metrics. */
  provider: "runway" | "veo" | "pika";
  /** Reported clip duration in seconds. */
  duration: number;
  /** Terminal status — always "succeeded" if we return; failures throw. */
  status:   "succeeded";
  /** Provider-specific blob (taskId, model, opName, etc.) — log-only. */
  metadata: Record<string, unknown>;
}
