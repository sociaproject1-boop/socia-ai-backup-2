import { useEffect, useState } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useAppStore } from "./store";
import { supabase } from "./supabase";

export interface ClientPreset {
  id: string;
  title: string;
  category: string;
  description: string;
  kind: "image" | "video";
  thumb: { from: string; to: string; emoji: string };
  defaultAspect: "1:1" | "9:16" | "16:9";
  durationSec?: number;
  requiresUploadedImage: boolean;
  // UI presentation fields
  badge?: "New" | "Hot" | "Top Pick" | "Pro" | "Quick";
  featured?: boolean;
  tags?: string[];
  glowColor?: string;
}

export interface PresetGenResult {
  type: "image" | "video";
  url: string;
  videoUrl?: string;
  thumbnailUrl?: string;
  durationSec?: number;
  prompt: string;
  presetUsed: { id: string; title: string; category: string };
  quota?: { remaining: number; limit: number; plan: string } | null;
}

export class PresetGenError extends Error {
  code?: string;
  limit?: number;
  constructor(message: string, code?: string, limit?: number) {
    super(message);
    this.name = "PresetGenError";
    this.code = code;
    this.limit = limit;
  }
}

export interface GenerateFromPresetInput {
  presetId: string;
  imageUrl?: string;
  userText?: string;
  /** Camera movement description (video presets, appended to prompt) */
  cameraMotion?: string;
  /** Lighting override (appended to prompt) */
  lightingOverride?: string;
  /** Extra negative phrases */
  negativePhraseExtra?: string;
  /** Duration override for video presets (5 or 10) */
  durationOverride?: 5 | 10;
}

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) {
    throw new PresetGenError(
      "You're signed out. Please sign in again.",
      "UNAUTHENTICATED",
    );
  }
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

/** Public catalog. No auth needed. */
export async function fetchPresets(): Promise<ClientPreset[]> {
  const res = await fetch("/api/presets");
  if (!res.ok) throw new Error(`Failed to load presets (${res.status})`);
  const data = (await res.json()) as { presets: ClientPreset[] };
  return data.presets;
}

export function usePresets() {
  const [presets, setPresets] = useState<ClientPreset[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    fetchPresets()
      .then((p) => { if (alive) setPresets(p); })
      .catch((e) => { if (alive) setError(e.message || String(e)); });
    return () => { alive = false; };
  }, []);
  return { presets, error, loading: presets == null && !error };
}

/** Upload a user file to Supabase Storage and return a public URL. */
export async function uploadStudioImage(file: File, userId: string): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Please upload an image file.");
  }
  if (file.size > 10 * 1024 * 1024) {
    throw new Error("Image must be smaller than 10MB.");
  }
  const ext = (file.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "") || "png";
  const path = `studio/${userId}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage
    .from("chat-images")
    .upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw new Error(error.message);
  const { data } = supabase.storage.from("chat-images").getPublicUrl(path);
  if (!data?.publicUrl) throw new Error("Failed to get public URL after upload.");
  return data.publicUrl;
}

export async function generateFromPreset(input: GenerateFromPresetInput): Promise<PresetGenResult> {
  const headers = await authHeaders();
  const res = await fetch("/api/generate-from-preset", {
    method: "POST",
    headers,
    body: JSON.stringify(input),
  });
  let data: unknown = null;
  const text = await res.text();
  if (text) {
    try { data = JSON.parse(text); } catch { /* leave data null */ }
  }
  if (!res.ok) {
    const e = (data as { error?: string; code?: string; limit?: number } | null) ?? null;
    throw new PresetGenError(
      e?.error || `Generation failed (HTTP ${res.status}).`,
      e?.code,
      e?.limit,
    );
  }
  if (!data || typeof data !== "object") {
    throw new PresetGenError("Unexpected response from generation server.");
  }
  const result = data as PresetGenResult;
  // Save to local "My Creations" history.
  useCreationsStore.getState().add({
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    presetId: result.presetUsed.id,
    presetTitle: result.presetUsed.title,
    category: result.presetUsed.category,
    type: result.type,
    url: result.url,
    videoUrl: result.videoUrl,
    thumbnailUrl: result.thumbnailUrl,
    durationSec: result.durationSec,
    prompt: result.prompt,
    sourceImageUrl: input.imageUrl,
    userText: input.userText,
    createdAt: new Date().toISOString(),
  });
  return result;
}

export interface Creation {
  id: string;
  presetId: string;
  presetTitle: string;
  category: string;
  type: "image" | "video";
  url: string;
  videoUrl?: string;
  thumbnailUrl?: string;
  durationSec?: number;
  prompt: string;
  sourceImageUrl?: string;
  userText?: string;
  createdAt: string;
}

interface CreationsState {
  items: Creation[];
  add: (c: Creation) => void;
  remove: (id: string) => void;
  clear: () => void;
}

export const useCreationsStore = create<CreationsState>()(
  persist(
    (set) => ({
      items: [],
      add: (c) => set((s) => ({ items: [c, ...s.items].slice(0, 100) })),
      remove: (id) => set((s) => ({ items: s.items.filter((x) => x.id !== id) })),
      clear: () => set({ items: [] }),
    }),
    { name: "socia_creations_v1" },
  ),
);

interface FavoritesState {
  ids: string[];
  toggle: (id: string) => void;
}

export const useFavoritesStore = create<FavoritesState>()(
  persist(
    (set) => ({
      ids: [],
      toggle: (id) =>
        set((s) => ({
          ids: s.ids.includes(id) ? s.ids.filter((x) => x !== id) : [...s.ids, id],
        })),
    }),
    { name: "socia_preset_favs_v1" },
  ),
);
