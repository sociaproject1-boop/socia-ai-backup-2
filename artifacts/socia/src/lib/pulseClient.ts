/**
 * pulseClient.ts — API + storage helpers for the PULSE system.
 */
import { supabase } from "@/lib/supabase";

const API_BASE = "/api";

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
  id:         string;
  name?:      string | null;
  username?:  string | null;
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

/* ── Storage ────────────────────────────────────────────────────────────── */

export async function uploadPulseMedia(file: File, userId: string): Promise<string> {
  const ext  = file.name.split(".").pop() ?? (file.type.startsWith("video") ? "mp4" : "jpg");
  const path = `${userId}/${Date.now()}.${ext}`;

  const { data, error } = await supabase.storage.from("pulses").upload(path, file, {
    cacheControl: "3600",
    upsert: false,
    contentType: file.type,
  });
  if (error) throw error;

  const { data: { publicUrl } } = supabase.storage.from("pulses").getPublicUrl(data.path);
  return publicUrl;
}
