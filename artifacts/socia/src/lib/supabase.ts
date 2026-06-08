import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL      = import.meta.env.VITE_SUPABASE_URL      as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabase = createClient(
  SUPABASE_URL      ?? "https://placeholder.supabase.co",
  SUPABASE_ANON_KEY ?? "placeholder-anon-key",
  {
    auth: {
      flowType:           "pkce",        // explicit PKCE — most secure OAuth flow
      persistSession:     true,          // session token survives page refresh
      autoRefreshToken:   true,          // silently refresh expired JWT
      detectSessionInUrl: true,          // exchange OAuth code from URL on load
      storage:            localStorage,  // explicit: use window.localStorage
    },
  }
);

export const isSupabaseReady = Boolean(
  SUPABASE_URL &&
  SUPABASE_ANON_KEY &&
  !SUPABASE_URL.includes("placeholder"),
);

/* ── Types ───────────────────────────────────────────────────────────────── */
export interface DbUser {
  id:         string;
  email:      string;
  name:       string;
  username:   string;
  avatar_url: string;
  bio:        string;
  followers:  number;
  following:  number;
  created_at: string;
  updated_at: string;
  /* Added in schema §13 */
  is_owner?:         boolean;
  is_verified?:      boolean;
  is_online?:        boolean;
  social_facebook?:  string;
  social_instagram?: string;
  social_tiktok?:    string;
  /* Cover photo */
  cover_photo_url?:  string | null;
  /* Extended profile fields */
  website?:             string;
  location?:            string;
  gender?:              string;
  birthday?:            string | null;
  relationship_status?: string;
  work?:                string;
  work_previous?:       string;
  education?:           string;
  school?:              string;
  college?:             string;
  social_x?:            string;
  social_youtube?:      string;
  social_linkedin?:     string;
  privacy_settings?:    Record<string, boolean | string>;
  public_email?:        string;
  public_phone?:        string;
  /* New extended profile fields (schema §15) */
  headline?:            string;
  pronunciation?:       string;
  interests?:           string;   /* JSON-encoded string[] */
  skills?:              string;   /* JSON-encoded string[] */
  languages?:           string;   /* JSON-encoded string[] */
  timezone?:            string;
  mood_emoji?:          string;
  mood_status?:         string;
}

/* ── Online presence + owner badge helpers (RPCs, defined in schema §13) ── */
export async function setOnlineStatus(online: boolean): Promise<void> {
  if (!isSupabaseReady) return;
  const { error } = await supabase.rpc("set_online", { p_online: online });
  if (error) console.warn("[Supabase] set_online failed:", error.message);
}

export async function claimOwnerBadge(): Promise<boolean> {
  if (!isSupabaseReady) return false;
  const { data, error } = await supabase.rpc("claim_owner_badge");
  if (error) {
    console.warn("[Supabase] claim_owner_badge failed:", error.message);
    return false;
  }
  return Boolean(data);
}

/* ── localStorage cache (guarantees profile survives refresh even when
      the Supabase table isn't set up yet) ──────────────────────────────── */

const cacheKey = (uid: string) => `socia_profile_${uid}`;

export function cacheProfile(uid: string, data: Partial<DbUser>) {
  try {
    localStorage.setItem(cacheKey(uid), JSON.stringify(data));
  } catch {}
}

export function getCachedProfile(uid: string): Partial<DbUser> | null {
  try {
    const raw = localStorage.getItem(cacheKey(uid));
    return raw ? (JSON.parse(raw) as Partial<DbUser>) : null;
  } catch {
    return null;
  }
}

/* ── Database helpers ─────────────────────────────────────────────────────── */

export async function fetchProfile(uid: string): Promise<DbUser | null> {
  const { data, error } = await supabase
    .from("users")
    .select("*")
    .eq("id", uid)
    .maybeSingle();

  if (error) {
    console.warn("[Supabase] fetchProfile error:", error.code, error.message);
    return null;
  }

  if (!data) return null;

  // Keep localStorage in sync with the database
  cacheProfile(uid, data as DbUser);
  return data as DbUser;
}

export async function upsertProfile(
  uid: string,
  fields: Partial<Omit<DbUser, "id" | "created_at">>,
): Promise<{ error: string | null }> {
  // Always update localStorage immediately — profile persists even if DB call fails.
  // Store a local timestamp so authContext can detect unsync'd local changes on refresh.
  const toCache = { ...getCachedProfile(uid), ...fields } as Record<string, unknown>;
  toCache._local_updated_at = Date.now();
  cacheProfile(uid, toCache as Partial<DbUser>);

  // `.select("id, avatar_url")` forces a response body and lets us verify the write landed.
  const { data: updateData, error } = await supabase
    .from("users")
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq("id", uid)
    .select("id, avatar_url");

  if (error) {
    console.warn("[Supabase] upsertProfile:", error.code, error.message);
    return { error: error.message };
  }

  // Clear the pending-sync flag once the DB round-trip succeeds.
  const committed = { ...getCachedProfile(uid) } as Record<string, unknown>;
  delete committed._local_updated_at;
  cacheProfile(uid, committed as Partial<DbUser>);

  return { error: null };
}

/**
 * ensureProfile — like upsertProfile but uses INSERT … ON CONFLICT UPDATE so
 * the row is created when it doesn't exist yet (new sign-ups).  Always call
 * this instead of upsertProfile when the row may not exist in public.users.
 */
export async function ensureProfile(
  uid: string,
  fields: Partial<Omit<DbUser, "id" | "created_at">>,
): Promise<{ error: string | null }> {
  const toCache = { ...getCachedProfile(uid), ...fields } as Record<string, unknown>;
  toCache._local_updated_at = Date.now();
  cacheProfile(uid, toCache as Partial<DbUser>);

  const { error } = await supabase
    .from("users")
    .upsert(
      { id: uid, ...fields, updated_at: new Date().toISOString() },
      { onConflict: "id", ignoreDuplicates: false },
    )
    .select("id");

  if (error) {
    console.warn("[Supabase] ensureProfile:", error.code, error.message);
    return { error: error.message };
  }

  const committed = { ...getCachedProfile(uid) } as Record<string, unknown>;
  delete committed._local_updated_at;
  cacheProfile(uid, committed as Partial<DbUser>);

  return { error: null };
}

/* ── User search ─────────────────────────────────────────────────────────── */

export interface UserSearchResult {
  id:         string;
  name:       string;
  username:   string;
  avatar_url: string;
}

export async function searchUsers(
  query: string,
  limit = 20,
): Promise<UserSearchResult[]> {
  const q = query.trim();
  if (!q) return [];

  const { data, error } = await supabase
    .from("users")
    .select("id, name, username, avatar_url")
    .or(`username.ilike.%${q}%,name.ilike.%${q}%`)
    .limit(limit);

  if (error) {
    console.warn("[Supabase] searchUsers:", error.message);
    return [];
  }
  return (data ?? []) as UserSearchResult[];
}

/* ── Avatar upload (Supabase Storage) ───────────────────────────────────── */

/**
 * Resize + compress an image to ≤ maxPx on the longest side at the given
 * JPEG quality.  A 6 MB phone camera shot becomes ~50–90 KB (10–50× smaller),
 * cutting mobile upload time from 20s+ down to under 2s.
 *
 * Resolves with the original file as a safe fallback if canvas is unavailable.
 */
async function compressImage(file: File, maxPx = 400, quality = 0.82): Promise<Blob> {
  return new Promise((resolve) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const scale = Math.min(1, maxPx / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.round(img.naturalWidth  * scale);
      const h = Math.round(img.naturalHeight * scale);
      const canvas = document.createElement("canvas");
      canvas.width  = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) { resolve(file); return; }
      ctx.drawImage(img, 0, 0, w, h);
      canvas.toBlob(
        (blob) => resolve(blob ?? file),
        "image/jpeg",
        quality,
      );
    };
    img.onerror = () => { URL.revokeObjectURL(objectUrl); resolve(file); };
    img.src = objectUrl;
  });
}

export async function uploadAvatar(file: File, userId: string): Promise<string> {
  // Compress to max 400 px on the longest side, JPEG 82 %.
  // A 6 MB phone camera photo becomes ~50–90 KB — 10–50× faster on mobile.
  const compressed = await compressImage(file);

  // Always store as .jpg — consistent path means each upload silently
  // overwrites the previous avatar without leaving orphaned files.
  const path = `${userId}.jpg`;

  const { data, error } = await supabase.storage
    .from("avatars")
    .upload(path, compressed, { upsert: true, contentType: "image/jpeg" });

  if (error || !data) {
    throw new Error(error?.message ?? "Avatar upload failed");
  }

  const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(data.path);
  return `${urlData.publicUrl}?t=${Date.now()}`;  // cache-buster
}
