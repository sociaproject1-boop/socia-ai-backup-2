/**
 * pulseClient.ts — API + storage helpers for the PULSE system.
 *
 * File upload: Cloudinary unsigned preset (same as rest of app).
 * No Supabase Storage bucket required.
 */
import { supabase } from "@/lib/supabase";

const API_BASE   = "/api";
const CLOUD_NAME = "devyx5yyk";
const UPLOAD_PRESET = "socia_upload";

async function authHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  return {
    Authorization: `Bearer ${session?.access_token ?? ""}`,
    "Content-Type": "application/json",
  };
}

/* ── Types ─────────────────────────────────────────────────────────────── */

export interface Pulse {
  id:            string;
  user_id:       string;
  type:          "image" | "video" | "text";
  media_url?:    string | null;
  text_content?: string | null;
  text_bg?:      string | null;
  text_color?:   string | null;
  music_url?:    string | null;
  music_name?:   string | null;
  visibility:    "public" | "followers" | "friends" | "private";
  created_at:    string;
  expires_at:    string;
  is_viewed?:    boolean;
}

export interface PulseUser {
  id:          string;
  name?:       string | null;
  username?:   string | null;
  avatar_url?: string | null;
}

export interface PulseFeedGroup {
  user:         PulseUser;
  pulses:       Pulse[];
  has_unviewed: boolean;
}

/* ── Feed ───────────────────────────────────────────────────────────────── */

export async function fetchPulseFeed(): Promise<PulseFeedGroup[]> {
  const h = await authHeaders();
  const res = await fetch(`${API_BASE}/pulses/feed`, { headers: h });
  if (!res.ok) throw new Error("Failed to fetch pulse feed");
  return res.json() as Promise<PulseFeedGroup[]>;
}

export async function fetchUserPulses(userId: string): Promise<Pulse[]> {
  const h = await authHeaders();
  const res = await fetch(`${API_BASE}/pulses/user/${userId}`, { headers: h });
  if (!res.ok) throw new Error("Failed to fetch user pulses");
  return res.json() as Promise<Pulse[]>;
}

/* ── CRUD ───────────────────────────────────────────────────────────────── */

export async function createPulse(payload: {
  type:          "image" | "video" | "text";
  media_url?:    string;
  text_content?: string;
  text_bg?:      string;
  text_color?:   string;
  music_url?:    string;
  music_name?:   string;
  visibility?:   string;
}): Promise<Pulse> {
  const h = await authHeaders();
  const res = await fetch(`${API_BASE}/pulses`, {
    method: "POST",
    headers: h,
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).error ?? "Failed to create pulse");
  }
  return res.json() as Promise<Pulse>;
}

export async function deletePulse(id: string): Promise<void> {
  const h = await authHeaders();
  const res = await fetch(`${API_BASE}/pulses/${id}`, { method: "DELETE", headers: h });
  if (!res.ok) throw new Error("Failed to delete pulse");
}

/* ── Views ──────────────────────────────────────────────────────────────── */

export async function recordPulseView(id: string): Promise<{ view_count: number }> {
  const h = await authHeaders();
  const res = await fetch(`${API_BASE}/pulses/${id}/view`, { method: "POST", headers: h });
  if (!res.ok) throw new Error("Failed to record view");
  return res.json() as Promise<{ view_count: number }>;
}

export async function fetchPulseViews(id: string): Promise<{ views: any[]; count: number }> {
  const h = await authHeaders();
  const res = await fetch(`${API_BASE}/pulses/${id}/views`, { headers: h });
  if (!res.ok) throw new Error("Failed to fetch views");
  return res.json() as Promise<{ views: any[]; count: number }>;
}

/* ── Reactions & Reports ─────────────────────────────────────────────────── */

export async function reactToPulse(id: string, emoji: string): Promise<void> {
  const h = await authHeaders();
  await fetch(`${API_BASE}/pulses/${id}/react`, {
    method: "POST",
    headers: h,
    body: JSON.stringify({ emoji }),
  });
}

export async function reportPulse(id: string, reason: string): Promise<void> {
  const h = await authHeaders();
  await fetch(`${API_BASE}/pulses/${id}/report`, {
    method: "POST",
    headers: h,
    body: JSON.stringify({ reason }),
  });
}

/* ── Admin ──────────────────────────────────────────────────────────────── */

export async function fetchReportedPulses(): Promise<any[]> {
  const h = await authHeaders();
  const res = await fetch(`${API_BASE}/pulses/admin/reported`, { headers: h });
  if (!res.ok) throw new Error("Failed to fetch reported pulses");
  return res.json() as Promise<any[]>;
}

export async function adminDeletePulse(id: string): Promise<void> {
  const h = await authHeaders();
  const res = await fetch(`${API_BASE}/pulses/admin/${id}`, { method: "DELETE", headers: h });
  if (!res.ok) throw new Error("Failed to delete pulse");
}

/* ── Storage — Cloudinary unsigned upload ────────────────────────────────── */

export async function uploadPulseMedia(file: File, _userId: string): Promise<string> {
  const isVideo = file.type.startsWith("video");
  const resourceType = isVideo ? "video" : "image";

  const form = new FormData();
  form.append("file", file);
  form.append("upload_preset", UPLOAD_PRESET);
  form.append("folder", "pulses");

  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/${resourceType}/upload`,
    { method: "POST", body: form }
  );

  if (!res.ok) {
    const errData = await res.json().catch(() => ({})) as any;
    throw new Error(errData?.error?.message ?? "Media upload failed");
  }

  const data = await res.json() as { secure_url: string };
  return data.secure_url;
}
