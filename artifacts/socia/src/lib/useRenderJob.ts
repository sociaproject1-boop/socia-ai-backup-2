/**
 * useRenderJob — live render job progress via Socket.IO.
 *
 * Usage:
 *   const job = useRenderJob(jobId);  // jobId null = disconnected
 *   job.stage, job.progress, job.eta, job.done, job.error, job.outputUrl
 *
 * Socket.IO lifecycle:
 *   - Connects once per app session (shared singleton socket).
 *   - Joins room "render:{jobId}" on mount, leaves on unmount.
 *   - Falls back to HTTP polling via /api/render/job/:id when socket
 *     is not connected or when a progress event is missed.
 */
import { useEffect, useRef, useState, useCallback } from "react";
import { io, type Socket } from "socket.io-client";

export interface RenderJobState {
  jobId:         string | null;
  stage:         string;
  progress:      number;
  eta:           number;
  workerMsg:     string;
  done:          boolean;
  error:         string | null;
  outputUrl:     string | null;
  thumbnailUrl:  string | null;
  durationSec:   number | null;
  retryCount:    number;
  connected:     boolean;
  queuePosition: number;
}

interface RenderProgressEvent {
  jobId:        string;
  stage:        string;
  progress:     number;
  eta:          number;
  workerMsg?:   string;
  error?:       string;
  done?:        boolean;
  outputUrl?:   string;
  thumbnailUrl?: string;
  durationSec?: number;
  retryCount?:  number;
}

const INITIAL_STATE: Omit<RenderJobState, "jobId" | "connected"> = {
  stage:         "queued",
  progress:      0,
  eta:           0,
  workerMsg:     "Queued…",
  done:          false,
  error:         null,
  outputUrl:     null,
  thumbnailUrl:  null,
  durationSec:   null,
  retryCount:    0,
  queuePosition: 0,
};

/* ── Shared socket singleton ──────────────────────────────────────── */
let _socket: Socket | null = null;

function getSocket(): Socket {
  if (_socket && _socket.connected) return _socket;
  if (_socket) { _socket.disconnect(); _socket = null; }
  _socket = io(undefined, {
    path:                "/api/socket.io/",
    transports:          ["websocket", "polling"],
    autoConnect:         true,
    reconnectionAttempts: 10,
    reconnectionDelay:   2000,
  });
  return _socket;
}

/* ── HTTP polling fallback ────────────────────────────────────────── */
async function pollJobStatus(jobId: string): Promise<RenderProgressEvent | null> {
  try {
    const res = await fetch(`/api/render/job/${jobId}`, {
      headers: {
        Authorization: `Bearer ${(await getStoredToken()) ?? ""}`,
      },
    });
    if (!res.ok) return null;
    const d = await res.json() as {
      status: string; stage: string; progress: number;
      failureReason?: string; outputUrl?: string; thumbnailUrl?: string;
      durationSec?: number; retryCount?: number;
    };
    const terminal = ["completed", "failed", "cancelled"].includes(d.status);
    return {
      jobId,
      stage:        d.stage ?? d.status,
      progress:     d.progress ?? 0,
      eta:          0,
      error:        d.failureReason ?? undefined,
      done:         terminal,
      outputUrl:    d.outputUrl ?? undefined,
      thumbnailUrl: d.thumbnailUrl ?? undefined,
      durationSec:  d.durationSec ?? undefined,
      retryCount:   d.retryCount ?? undefined,
    };
  } catch {
    return null;
  }
}

async function getStoredToken(): Promise<string | null> {
  try {
    const { supabase } = await import("./supabase");
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  } catch { return null; }
}

/* ── Queue position polling ───────────────────────────────────────── */
async function fetchQueuePosition(jobId: string): Promise<number> {
  try {
    const token = await getStoredToken();
    const res = await fetch(`/api/render/queue-position/${jobId}`, {
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    });
    if (!res.ok) return 0;
    const d = await res.json() as { position?: number };
    return d.position ?? 0;
  } catch { return 0; }
}

/* ── Hook ─────────────────────────────────────────────────────────── */
export function useRenderJob(jobId: string | null): RenderJobState {
  const [state, setState] = useState<RenderJobState>({
    jobId,
    connected: false,
    ...INITIAL_STATE,
  });
  const pollRef     = useRef<ReturnType<typeof setInterval> | null>(null);
  const queuePollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const doneRef     = useRef(false);

  const applyEvent = useCallback((evt: RenderProgressEvent) => {
    if (doneRef.current && !evt.done) return; // ignore stale events after done
    if (evt.done) doneRef.current = true;

    setState(prev => ({
      ...prev,
      jobId:        evt.jobId,
      stage:        evt.stage,
      progress:     evt.progress,
      eta:          evt.eta,
      workerMsg:    evt.workerMsg ?? evt.stage,
      done:         evt.done ?? false,
      error:        evt.error ?? null,
      outputUrl:    evt.outputUrl ?? prev.outputUrl,
      thumbnailUrl: evt.thumbnailUrl ?? prev.thumbnailUrl,
      durationSec:  evt.durationSec ?? prev.durationSec,
      retryCount:   evt.retryCount ?? prev.retryCount,
    }));
  }, []);

  useEffect(() => {
    if (!jobId) return;
    doneRef.current = false;

    // Reset state for the new job
    setState({
      jobId,
      connected: false,
      ...INITIAL_STATE,
    });

    const socket = getSocket();

    const onConnect = () => {
      setState(prev => ({ ...prev, connected: true }));
      socket.emit("join_render", jobId);
      // Stop HTTP polling if socket is now live
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    };

    const onDisconnect = () => {
      setState(prev => ({ ...prev, connected: false }));
      // Start HTTP polling as fallback
      if (!pollRef.current && !doneRef.current) {
        pollRef.current = setInterval(async () => {
          const evt = await pollJobStatus(jobId);
          if (evt) {
            applyEvent(evt);
            if (evt.done && pollRef.current) {
              clearInterval(pollRef.current);
              pollRef.current = null;
            }
          }
        }, 4000);
      }
    };

    const onProgress = (evt: RenderProgressEvent) => {
      if (evt.jobId !== jobId) return;
      applyEvent(evt);
    };

    socket.on("connect",          onConnect);
    socket.on("disconnect",       onDisconnect);
    socket.on("render:progress",  onProgress);

    if (socket.connected) {
      onConnect();
    } else {
      // Start HTTP polling immediately while waiting for socket
      pollRef.current = setInterval(async () => {
        const evt = await pollJobStatus(jobId);
        if (evt) {
          applyEvent(evt);
          if (evt.done && pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
          }
        }
      }, 4000);
    }

    return () => {
      socket.off("connect",         onConnect);
      socket.off("disconnect",      onDisconnect);
      socket.off("render:progress", onProgress);
      socket.emit("leave_render", jobId);
      if (pollRef.current)      { clearInterval(pollRef.current);      pollRef.current      = null; }
      if (queuePollRef.current) { clearInterval(queuePollRef.current); queuePollRef.current = null; }
    };
  }, [jobId, applyEvent]);

  // Poll queue position while job is in "queued" stage
  useEffect(() => {
    if (!jobId || state.stage !== "queued" || state.done) {
      if (queuePollRef.current) { clearInterval(queuePollRef.current); queuePollRef.current = null; }
      return;
    }

    const doFetch = async () => {
      const pos = await fetchQueuePosition(jobId);
      setState(prev => ({ ...prev, queuePosition: pos }));
    };

    doFetch();
    queuePollRef.current = setInterval(doFetch, 8000);
    return () => {
      if (queuePollRef.current) { clearInterval(queuePollRef.current); queuePollRef.current = null; }
    };
  }, [jobId, state.stage, state.done]);

  return state;
}

/* ── Submit render job ────────────────────────────────────────────── */
export interface FrameVoiceTrack {
  sceneIndex:   number;
  dialogueText: string;
  voiceType:    string;
  emotion:      string;
  language?:    string;
}

export async function submitRenderJob(params: {
  images:             string[];
  framePrompts:       string[];
  globalPrompt:       string;
  aspect:             string;
  renderEngine:       string;
  projectId?:         string;
  quality?:           string;
  format?:            string;
  codec?:             string;
  transition?:        string;
  soundtrackType?:    string;
  frameVoiceTracks?:  FrameVoiceTrack[];
  /** Per-frame beat timelines, indexed against `images[]`. Each beat
   *  carries cinematic motion data the worker injects into the AI
   *  provider prompt via composeSegmentPrompt. */
  frameBeats?:        Array<Array<{
    startSec?:       number;
    endSec?:         number;
    cameraMove?:     string;
    motionStrength?: string;
    facialBehavior?: string;
    effect?:         string;
  }>>;
  /** Per-frame camera / motion / emotion direction. */
  frameDirections?:   Array<{ cameraMove?: string; motionStrength?: string; emotion?: string }>;
  /** Per-frame continuity locks (same face, same outfit, etc). */
  frameContinuity?:   Array<{
    keepFace?: boolean; keepOutfit?: boolean; keepHairstyle?: boolean;
    keepEnvironment?: boolean; keepLighting?: boolean; keepCinematicTone?: boolean;
  }>;
  /** Project-wide color grade preset; baked into the exported MP4. */
  projectColorGrade?: string;
  /** When true and dialogue is present, captions are burned in. */
  subtitlesEnabled?:  boolean;
}): Promise<{ jobId: string; billing: Record<string, unknown> }> {
  const token = await getStoredToken();
  const res = await fetch("/api/render/submit", {
    method:  "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(params),
  });

  const data = await res.json() as { jobId?: string; error?: string; code?: string; billing?: Record<string, unknown> };
  if (!res.ok) {
    const err = new Error(data.error ?? "Failed to submit render job") as Error & { code?: string };
    err.code = data.code;
    throw err;
  }

  return { jobId: data.jobId!, billing: data.billing ?? {} };
}

/* ── Project persistence ──────────────────────────────────────────── */
export async function saveProject(params: {
  projectId?: string;
  title:      string;
  frames:     unknown[];
  config:     unknown;
}): Promise<{ projectId: string }> {
  const token = await getStoredToken();
  const url    = params.projectId
    ? `/api/projects/${params.projectId}`
    : "/api/projects";
  const res = await fetch(url, {
    method:  params.projectId ? "PUT" : "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ title: params.title, frames: params.frames, config: params.config }),
  });
  if (!res.ok) throw new Error("Failed to save project");
  const d = await res.json() as { projectId?: string; id?: string };
  return { projectId: d.projectId ?? d.id ?? params.projectId ?? "" };
}
