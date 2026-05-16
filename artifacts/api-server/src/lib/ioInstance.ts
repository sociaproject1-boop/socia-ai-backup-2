/**
 * Shared Socket.IO server instance.
 * socketServer.ts registers the instance here after setup.
 * renderWorker.ts reads it to emit progress events.
 */
import type { Server } from "socket.io";

let _io: Server | null = null;

export function setIo(io: Server): void {
  _io = io;
}

export function getIo(): Server | null {
  return _io;
}

/** Emit a render-job progress event to the job's socket room. */
export function emitRenderProgress(jobId: string, payload: RenderProgressEvent): void {
  if (!_io) return;
  _io.to(`render:${jobId}`).emit("render:progress", payload);
}

export interface RenderProgressEvent {
  jobId:     string;
  stage:     string;
  progress:  number;   // 0–100
  eta:       number;   // seconds remaining
  workerMsg?: string;  // optional human-readable status message
  error?:    string;
  done?:     boolean;
  outputUrl?:     string;
  thumbnailUrl?:  string;
  durationSec?:   number;
  retryCount?:    number;
}
