/**
 * soundsClient.ts — Frontend API client for the Socia Sound Ecosystem.
 */
import { supabase } from "./supabase";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const CLOUD_NAME    = "devyx5yyk";
const UPLOAD_PRESET = "socia_upload";

async function authHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  return {
    Authorization: `Bearer ${session?.access_token ?? ""}`,
    "Content-Type": "application/json",
  };
}

/* ── Types ─────────────────────────────────────────────────────────────── */

export interface SoundCreator {
  id:          string;
  name:        string | null;
  username:    string | null;
  avatar_url:  string | null;
}

export interface Sound {
  id:               string;
  title:            string;
  cover_image:      string | null;
  audio_url:        string;
  source_type:      "original" | "remix" | "user_upload";
  duration_seconds: number | null;
  usage_count:      number;
  created_at:       string;
  creator_id:       string | null;
  creator:          SoundCreator | null;
}

/* ── API calls ─────────────────────────────────────────────────────────── */

export async function fetchSounds(opts?: {
  q?:      string;
  limit?:  number;
  offset?: number;
}): Promise<Sound[]> {
  const params = new URLSearchParams();
  if (opts?.q)       params.set("q",      opts.q);
  if (opts?.limit)   params.set("limit",  String(opts.limit));
  if (opts?.offset)  params.set("offset", String(opts.offset));
  const r = await fetch(`${BASE}/api/sounds?${params}`, { headers: await authHeaders() });
  if (!r.ok) throw new Error("Failed to load sounds");
  const data = await r.json() as { sounds: Sound[] };
  return data.sounds;
}

export async function fetchTrendingSounds(): Promise<Sound[]> {
  const r = await fetch(`${BASE}/api/sounds/trending`, { headers: await authHeaders() });
  if (!r.ok) throw new Error("Failed to load trending sounds");
  const data = await r.json() as { sounds: Sound[] };
  return data.sounds;
}

export async function fetchSound(id: string): Promise<Sound> {
  const r = await fetch(`${BASE}/api/sounds/${id}`, { headers: await authHeaders() });
  if (!r.ok) throw new Error("Sound not found");
  return r.json() as Promise<Sound>;
}

export async function fetchSoundVideos(soundId: string, opts?: {
  limit?:  number;
  offset?: number;
}): Promise<{ posts: any[]; has_more: boolean }> {
  const params = new URLSearchParams();
  if (opts?.limit)   params.set("limit",  String(opts.limit));
  if (opts?.offset)  params.set("offset", String(opts.offset));
  const r = await fetch(`${BASE}/api/sounds/${soundId}/videos?${params}`, { headers: await authHeaders() });
  if (!r.ok) throw new Error("Failed to load sound videos");
  return r.json() as Promise<{ posts: any[]; has_more: boolean }>;
}

export async function createSound(payload: {
  title:             string;
  cover_image?:      string;
  audio_url:         string;
  source_type?:      string;
  duration_seconds?: number;
}): Promise<Sound> {
  const r = await fetch(`${BASE}/api/sounds`, {
    method:  "POST",
    headers: await authHeaders(),
    body:    JSON.stringify(payload),
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({})) as any;
    throw new Error(err.error ?? "Failed to create sound");
  }
  return r.json() as Promise<Sound>;
}

export async function recordSoundUsage(soundId: string, postId: string): Promise<void> {
  await fetch(`${BASE}/api/sounds/${soundId}/use`, {
    method:  "POST",
    headers: await authHeaders(),
    body:    JSON.stringify({ post_id: postId }),
  });
}

/* ── Cloudinary upload ─────────────────────────────────────────────────── */

export async function uploadSoundAudio(file: File): Promise<{ url: string; duration?: number }> {
  const form = new FormData();
  form.append("file", file);
  form.append("upload_preset", UPLOAD_PRESET);
  form.append("folder", "sounds/audio");

  const r = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/video/upload`,
    { method: "POST", body: form }
  );
  if (!r.ok) throw new Error("Audio upload failed");
  const data = await r.json() as { secure_url: string; duration?: number };
  return { url: data.secure_url, duration: data.duration };
}

export async function uploadSoundCover(file: File): Promise<string> {
  const form = new FormData();
  form.append("file", file);
  form.append("upload_preset", UPLOAD_PRESET);
  form.append("folder", "sounds/covers");

  const r = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`,
    { method: "POST", body: form }
  );
  if (!r.ok) throw new Error("Cover upload failed");
  const data = await r.json() as { secure_url: string };
  return data.secure_url;
}

/* ── Utility ────────────────────────────────────────────────────────────── */

export function formatDuration(seconds: number | null): string {
  if (!seconds) return "";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
