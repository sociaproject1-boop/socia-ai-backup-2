import { useAppStore } from "./store";
import { supabase } from "./supabase";

export interface GenOptions {
  aspect?: string;
  style?: string;
  durationSec?: number;
  negativePrompt?: string;
  lightingStyle?: string;
  cameraLens?: string;
  hd?: boolean;
  seed?: string;
}

export interface GenResult {
  url: string;
  videoUrl?: string;
  type: "image" | "video";
  durationSec?: number;
  prompt: string;
  originalPrompt?: string;
  quota?: { remaining: number; limit: number } | null;
}

class GenerationError extends Error {
  code?: string;
  limit?: number;
  constructor(message: string, code?: string, limit?: number) {
    super(message);
    this.name = "GenerationError";
    this.code = code;
    this.limit = limit;
  }
}

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) {
    throw new GenerationError(
      "You're signed out. Please sign in again to generate.",
      "UNAUTHENTICATED",
    );
  }
  return {
    "Content-Type": "application/json",
    Authorization:  `Bearer ${token}`,
  };
}

async function callImageAPI(body: Record<string, unknown>): Promise<GenResult> {
  const headers = await authHeaders();
  const res = await fetch("/api/generate-image", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  const data = await res.json();

  if (!res.ok) {
    const err = data as { error?: string; code?: string; limit?: number };
    throw new GenerationError(
      err.error || "Image generation failed. Please try again.",
      err.code,
      err.limit,
    );
  }

  return data as GenResult;
}

async function callVideoAPI(body: Record<string, unknown>): Promise<{ videoUrl: string; durationSec: number }> {
  const headers = await authHeaders();
  const res = await fetch("/api/generate-video", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  const data = await res.json();

  if (!res.ok) {
    const err = data as { error?: string; code?: string; limit?: number };
    throw new GenerationError(
      err.error || "Video generation failed. Please try again.",
      err.code,
      err.limit,
    );
  }

  const result = data as { videoUrl: string; thumbnailUrl: string; durationSec: number; quota?: { remaining: number; limit: number } | null };
  return result;
}

export async function generateImage(prompt: string, opts?: GenOptions): Promise<GenResult> {
  return callImageAPI({
    prompt,
    style: opts?.style,
    aspect: opts?.aspect || "1:1",
    hd: opts?.hd !== false,
    negativePrompt: opts?.negativePrompt,
    lightingStyle: opts?.lightingStyle,
    cameraLens: opts?.cameraLens,
    seed: opts?.seed,
  });
}

export async function generateVideo(prompt: string, opts?: GenOptions): Promise<GenResult> {
  const imageResult = await callImageAPI({
    prompt,
    style: opts?.style,
    aspect: opts?.aspect || "9:16",
  });

  const videoResult = await callVideoAPI({
    imageUrl: imageResult.url,
    prompt,
    aspect: opts?.aspect || "9:16",
    durationSec: opts?.durationSec || 5,
  });

  return {
    url: imageResult.url,
    videoUrl: videoResult.videoUrl,
    type: "video",
    durationSec: videoResult.durationSec,
    prompt: imageResult.prompt,
    originalPrompt: prompt,
    quota: imageResult.quota,
  };
}

export async function imageToVideo(
  imageUrl: string,
  prompt: string,
  opts?: GenOptions & { endImageUrl?: string },
): Promise<GenResult> {
  const videoResult = await callVideoAPI({
    imageUrl,
    // When endImageUrl is provided the server routes the call to Kling's
    // keyframe-interpolation model so BOTH frames genuinely condition the
    // generation (start + tail). Without it, the standard image-to-video
    // path is used. Either way the response shape is identical.
    endImageUrl: opts?.endImageUrl,
    prompt,
    aspect: opts?.aspect || "9:16",
    durationSec: opts?.durationSec || 5,
  });

  return {
    url: imageUrl,
    videoUrl: videoResult.videoUrl,
    type: "video",
    durationSec: videoResult.durationSec,
    prompt: prompt || "Cinematic animation",
    originalPrompt: prompt,
  };
}

export async function multiFrameVideo(
  images: string[],
  framePrompts: string[],
  globalPrompt: string,
  opts?: { aspect?: GenOptions["aspect"] },
): Promise<GenResult & { segmentCount: number; provider: string }> {
  const headers = await authHeaders();
  const res = await fetch("/api/generate-multiframe-video", {
    method: "POST",
    headers,
    body: JSON.stringify({
      images,
      framePrompts,
      globalPrompt,
      aspect: opts?.aspect || "9:16",
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    const err = data as { error?: string; code?: string; limit?: number };
    throw new GenerationError(
      err.error || "Multi-frame video generation failed.",
      err.code,
      err.limit,
    );
  }

  const result = data as {
    videoUrl: string;
    thumbnailUrl: string;
    durationSec: number;
    frameCount: number;
    provider: string;
    segments: Array<{ index: number; prompt: string; videoUrl: string }>;
    quota?: { remaining: number; limit: number } | null;
  };

  return {
    url: result.thumbnailUrl,
    videoUrl: result.videoUrl,
    type: "video",
    durationSec: result.durationSec,
    prompt: globalPrompt || "Multi-frame storyboard",
    originalPrompt: globalPrompt,
    segmentCount: result.segments.length,
    provider: result.provider,
  };
}

// Keep unused import alive for backwards-compat
void useAppStore;
