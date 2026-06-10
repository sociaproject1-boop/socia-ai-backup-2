/**
 * supabase.ts — Native Supabase Auth client + API helpers.
 *
 * Authentication: uses @supabase/supabase-js directly (signIn, signUp,
 * signOut, password reset, Google OAuth all work natively via Supabase Auth).
 *
 * Data access: routes through the Express API backend (/api/db-proxy,
 * /api/rpc/:fn, /api/users/:id, etc.) so backend security and business
 * logic is preserved.
 *
 * The Supabase access token is tracked in a module-level variable and
 * included as an Authorization header on every backend API call so the
 * server-side requireAuth middleware can verify the caller's identity.
 */
import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

/* ── Types ──────────────────────────────────────────────────────────────── */
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
  is_owner?:         boolean;
  is_verified?:      boolean;
  is_online?:        boolean;
  social_facebook?:  string;
  social_instagram?: string;
  social_tiktok?:    string;
  cover_photo_url?:  string | null;
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
  headline?:            string;
  pronunciation?:       string;
  interests?:           string;
  skills?:              string;
  languages?:           string;
  timezone?:            string;
  mood_emoji?:          string;
  mood_status?:         string;
  subscription_status?: string;
  plan_code?:           string;
  credits_balance?:     string | number;
}

export interface UserSearchResult {
  id:         string;
  name:       string;
  username:   string;
  avatar_url: string;
}

/* ── Supabase real client (internal — do NOT export this directly) ───────── */
const SUPABASE_URL  = import.meta.env["VITE_SUPABASE_URL"]     as string | undefined;
const SUPABASE_ANON = import.meta.env["VITE_SUPABASE_ANON_KEY"] as string | undefined;

export const isSupabaseReady = Boolean(SUPABASE_URL && SUPABASE_ANON);

const _realClient: SupabaseClient = isSupabaseReady
  ? createClient(SUPABASE_URL!, SUPABASE_ANON!, {
      auth: {
        flowType:           "pkce",
        detectSessionInUrl: true,
        autoRefreshToken:   true,
        persistSession:     true,
        storageKey:         "socia_supabase_auth",
      },
    })
  : createClient("https://placeholder.supabase.co", "placeholder", {
      auth: { persistSession: false },
    });

/* ── Access-token tracking ────────────────────────────────────────────────── *
 * The Supabase JS client stores the session in localStorage. We mirror the
 * current access token here so every backend API call can include it as an
 * Authorization header without making an async getSession() call.             */
let _accessToken: string | null = null;

/* Seed from localStorage on module init (synchronous — no network needed) */
_realClient.auth.getSession().then(({ data }) => {
  _accessToken = data.session?.access_token ?? null;
}).catch(() => {});

/* Keep updated on every auth event */
_realClient.auth.onAuthStateChange((_event, session) => {
  _accessToken = session?.access_token ?? null;
});

/* ── Auth headers helper ─────────────────────────────────────────────────── */
function apiHeaders(extra?: Record<string, string>): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json", ...extra };
  if (_accessToken) h["Authorization"] = `Bearer ${_accessToken}`;
  return h;
}

/* ── DB query shim (routes through /api/db-proxy) ────────────────────────── *
 * Preserves backend security model — all data reads/writes go through the
 * Express server which enforces auth and business logic.                       */
type QueryResult<T = unknown> = Promise<{ data: T | null; error: { message: string } | null; count?: number | null }>;

function buildQuery(table: string) {
  const state = {
    method:       "select" as "select" | "insert" | "update" | "delete" | "upsert",
    selectCols:   "*",
    filters:      [] as Array<{ key: string; op: string; value: unknown }>,
    data:         null as unknown,
    orderCol:     null as string | null,
    orderAsc:     true,
    limitN:       null as number | null,
    single_:      false,
    maybeSingle_: false,
    countOnly:    false,
  };

  function exec(): QueryResult {
    return fetch("/api/db-proxy", {
      method:      "POST",
      headers:     apiHeaders(),
      body:        JSON.stringify({
        table,
        method:      state.method,
        select:      state.selectCols,
        filters:     state.filters,
        data:        state.data,
        order:       state.orderCol ? { col: state.orderCol, asc: state.orderAsc } : null,
        limit:       state.limitN,
        single:      state.single_,
        maybeSingle: state.maybeSingle_,
        countOnly:   state.countOnly,
      }),
      credentials: "include",
    }).then((r) => r.json()) as QueryResult;
  }

  const q: Record<string, unknown> = {
    select(cols: string, opts?: { count?: string; head?: boolean }) {
      state.method = "select"; state.selectCols = cols;
      if (opts?.count) state.countOnly = true;
      return q;
    },
    insert(data: unknown) { state.method = "insert"; state.data = data; return q; },
    update(data: unknown) { state.method = "update"; state.data = data; return q; },
    delete() { state.method = "delete"; return q; },
    upsert(data: unknown) { state.method = "upsert"; state.data = data; return q; },
    eq(col: string, val: unknown)    { state.filters.push({ key: col, op: "eq",    value: val }); return q; },
    neq(col: string, val: unknown)   { state.filters.push({ key: col, op: "neq",   value: val }); return q; },
    gt(col: string, val: unknown)    { state.filters.push({ key: col, op: "gt",    value: val }); return q; },
    gte(col: string, val: unknown)   { state.filters.push({ key: col, op: "gte",   value: val }); return q; },
    lt(col: string, val: unknown)    { state.filters.push({ key: col, op: "lt",    value: val }); return q; },
    lte(col: string, val: unknown)   { state.filters.push({ key: col, op: "lte",   value: val }); return q; },
    in(col: string, vals: unknown[]) { state.filters.push({ key: col, op: "in",    value: vals }); return q; },
    is(col: string, val: unknown)    { state.filters.push({ key: col, op: "is",    value: val }); return q; },
    ilike(col: string, val: unknown) { state.filters.push({ key: col, op: "ilike", value: val }); return q; },
    like(col: string, val: unknown)  { state.filters.push({ key: col, op: "like",  value: val }); return q; },
    or(filter: string) { state.filters.push({ key: "__or", op: "or", value: filter }); return q; },
    order(col: string, opts?: { ascending?: boolean }) {
      state.orderCol = col; state.orderAsc = opts?.ascending !== false; return q;
    },
    limit(n: number) { state.limitN = n; return q; },
    single()      { state.single_      = true; state.limitN = 1; return exec(); },
    maybeSingle() { state.maybeSingle_ = true; state.limitN = 1; return exec(); },
    then(resolve: (r: unknown) => void, reject?: (e: unknown) => void) { exec().then(resolve, reject); },
  };
  return q;
}

/* ── Storage shim (uses Cloudinary via /api/upload) ─────────────────────── */
function makeStorage() {
  return {
    from(_bucket: string) {
      return {
        upload: async (_path: string, _file: Blob, _opts?: unknown) =>
          ({ data: null, error: { message: "Use Cloudinary upload via /api/upload" } }),
        getPublicUrl: (_path: string) => ({ data: { publicUrl: "" } }),
        download: async (_path: string) => ({ data: null, error: { message: "Storage not available" } }),
      };
    },
  };
}

/* ── Exported `supabase` facade ────────────────────────────────────────── *
 * `auth` → real Supabase Auth (native sign-in, OAuth, password reset, etc.)
 * `from()` → /api/db-proxy (backend controls data access)
 * `rpc()` → /api/rpc/:fn (backend controls RPC calls)
 * `channel()` / `removeChannel()` → real Supabase Realtime
 * `storage` → Cloudinary shim via /api/upload                               */
export const supabase = {
  /* ── Auth ── */
  get auth() { return _realClient.auth; },

  /* ── Data ── */
  from: (table: string) => buildQuery(table),

  rpc: async (fn: string, args?: Record<string, unknown>) => {
    try {
      const res = await fetch(`/api/rpc/${fn}`, {
        method:      "POST",
        headers:     apiHeaders(),
        body:        JSON.stringify(args ?? {}),
        credentials: "include",
      });
      const data: unknown = await res.json();
      return { data, error: null };
    } catch (e) {
      return { data: null, error: { message: (e as Error).message } };
    }
  },

  /* ── Realtime ── */
  channel: (name: string, opts?: Parameters<SupabaseClient["channel"]>[1]) =>
    _realClient.channel(name, opts),

  removeChannel: (ch: ReturnType<SupabaseClient["channel"]>) =>
    _realClient.removeChannel(ch),

  /* ── Storage ── */
  storage: makeStorage(),
};

/* ── Online presence + owner badge helpers ─────────────────────────────── */
export async function setOnlineStatus(online: boolean): Promise<void> {
  try {
    await fetch("/api/presence", {
      method:      "POST",
      headers:     apiHeaders(),
      body:        JSON.stringify({ online }),
      credentials: "include",
    });
  } catch {}
}

export async function claimOwnerBadge(): Promise<boolean> {
  try {
    const res = await fetch("/api/owner/claim", {
      method:      "POST",
      headers:     _accessToken ? { Authorization: `Bearer ${_accessToken}` } : {},
      credentials: "include",
    });
    const data = await res.json() as { claimed?: boolean };
    return Boolean(data?.claimed);
  } catch { return false; }
}

/* ── localStorage profile cache ─────────────────────────────────────────── */
const cacheKey = (uid: string) => `socia_profile_${uid}`;

export function cacheProfile(uid: string, data: Partial<DbUser>) {
  try { localStorage.setItem(cacheKey(uid), JSON.stringify(data)); } catch {}
}

export function getCachedProfile(uid: string): Partial<DbUser> | null {
  try {
    const raw = localStorage.getItem(cacheKey(uid));
    return raw ? (JSON.parse(raw) as Partial<DbUser>) : null;
  } catch { return null; }
}

/* ── API helpers (via backend) ──────────────────────────────────────────── */
export async function fetchProfile(uid: string): Promise<DbUser | null> {
  try {
    const res = await fetch(`/api/users/${uid}`, {
      headers:     _accessToken ? { Authorization: `Bearer ${_accessToken}` } : {},
      credentials: "include",
    });
    if (!res.ok) return null;
    const data = await res.json() as DbUser;
    cacheProfile(uid, data);
    return data;
  } catch { return null; }
}

export async function upsertProfile(
  uid: string,
  fields: Partial<Omit<DbUser, "id" | "created_at">>,
): Promise<{ error: string | null }> {
  const toCache = { ...getCachedProfile(uid), ...fields } as Record<string, unknown>;
  toCache._local_updated_at = Date.now();
  cacheProfile(uid, toCache as Partial<DbUser>);
  try {
    const res = await fetch(`/api/users/${uid}`, {
      method:      "PATCH",
      headers:     apiHeaders(),
      body:        JSON.stringify(fields),
      credentials: "include",
    });
    const data = await res.json() as { error?: string };
    if (!res.ok) return { error: data.error ?? "Update failed" };
    const committed = { ...getCachedProfile(uid) } as Record<string, unknown>;
    delete committed._local_updated_at;
    cacheProfile(uid, committed as Partial<DbUser>);
    return { error: null };
  } catch (e) { return { error: (e as Error).message }; }
}

export async function ensureProfile(
  uid: string,
  fields: Partial<Omit<DbUser, "id" | "created_at">>,
): Promise<{ error: string | null }> {
  return upsertProfile(uid, fields);
}

export async function searchUsers(query: string, limit = 20): Promise<UserSearchResult[]> {
  const q = query.trim();
  if (!q) return [];
  try {
    const res = await fetch(
      `/api/users/search?q=${encodeURIComponent(q)}&limit=${limit}`,
      {
        headers:     _accessToken ? { Authorization: `Bearer ${_accessToken}` } : {},
        credentials: "include",
      },
    );
    if (!res.ok) return [];
    return await res.json() as UserSearchResult[];
  } catch { return []; }
}

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
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) { resolve(file); return; }
      ctx.drawImage(img, 0, 0, w, h);
      canvas.toBlob((blob) => resolve(blob ?? file), "image/jpeg", quality);
    };
    img.onerror = () => { URL.revokeObjectURL(objectUrl); resolve(file); };
    img.src = objectUrl;
  });
}

export async function uploadAvatar(file: File, userId: string): Promise<string> {
  const compressed = await compressImage(file);
  const formData = new FormData();
  formData.append("file", compressed, `${userId}.jpg`);
  formData.append("type", "avatar");
  formData.append("userId", userId);
  const headers: Record<string, string> = {};
  if (_accessToken) headers["Authorization"] = `Bearer ${_accessToken}`;
  const res = await fetch("/api/upload", {
    method:      "POST",
    headers,
    body:        formData,
    credentials: "include",
  });
  if (!res.ok) throw new Error("Avatar upload failed");
  const data = await res.json() as { url: string };
  return `${data.url}?t=${Date.now()}`;
}
