/**
 * supabase.ts — Replit Auth + PostgreSQL compatibility shim.
 *
 * This module replaces the Supabase client with:
 *   - Auth: Replit Auth (via /api/auth/session endpoint)
 *   - DB reads: REST API calls to the backend
 *   - Realtime: stubbed (no real-time subscriptions)
 *   - Storage: Cloudinary-backed upload via /api/upload endpoint
 *
 * All exported names are kept identical so existing imports continue to work.
 */

/* ── Types ─────────────────────────────────────────────────────────────── */
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

/* ── Always ready — no env vars needed ────────────────────────────────── */
export const isSupabaseReady = true;

/* ── Auth session state ─────────────────────────────────────────────────── */
interface SessionUser {
  id:    string;
  email: string | null;
  name?: string | null;
}

interface Session {
  user: SessionUser;
  access_token: string;
}

let _session: Session | null = null;
let _sessionFetched = false;

async function fetchSession(): Promise<Session | null> {
  if (_sessionFetched) return _session;
  try {
    const res = await fetch("/api/auth/session", { credentials: "include" });
    if (!res.ok) { _sessionFetched = true; return null; }
    const data = await res.json() as { user?: SessionUser; access_token?: string } | null;
    if (data?.user) {
      _session = { user: data.user, access_token: data.access_token ?? "" };
    }
    _sessionFetched = true;
    return _session;
  } catch {
    _sessionFetched = true;
    return null;
  }
}

/* ── Fake realtime channel (no-op stub) ──────────────────────────────── */
function makeChannel() {
  return {
    on:      (_: string, __: string, ___: object, ____: () => void) => makeChannel(),
    subscribe: (_cb?: (status: string) => void) => { _cb?.("SUBSCRIBED"); return makeChannel(); },
    unsubscribe: () => Promise.resolve(),
    send:    () => Promise.resolve("ok"),
  };
}

/* ── Auth ────────────────────────────────────────────────────────────────── */
const auth = {
  async getSession() {
    const session = await fetchSession();
    return { data: { session }, error: null };
  },

  async getUser() {
    const session = await fetchSession();
    return { data: { user: session?.user ?? null }, error: null };
  },

  onAuthStateChange(cb: (event: string, session: Session | null) => void) {
    fetchSession().then((session) => {
      cb(session ? "SIGNED_IN" : "INITIAL_SESSION", session);
    });
    return {
      data: {
        subscription: {
          unsubscribe: () => {},
        },
      },
    };
  },

  async signInWithPassword({ email, password }: { email: string; password: string }) {
    try {
      const res = await fetch("/api/auth/signin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
        credentials: "include",
      });
      const data = await res.json() as { user?: SessionUser; error?: string; access_token?: string };
      if (!res.ok || data.error) return { data: { user: null, session: null }, error: { message: data.error ?? "Sign in failed" } };
      if (data.user) {
        _session = { user: data.user, access_token: data.access_token ?? "" };
        _sessionFetched = true;
      }
      return { data: { user: data.user, session: _session }, error: null };
    } catch (e) {
      return { data: { user: null, session: null }, error: { message: (e as Error).message } };
    }
  },

  async signUp({ email, password, options }: { email: string; password: string; options?: { data?: Record<string, unknown> } }) {
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, ...options?.data }),
        credentials: "include",
      });
      const data = await res.json() as { user?: SessionUser; error?: string; access_token?: string };
      if (!res.ok || data.error) return { data: { user: null, session: null }, error: { message: data.error ?? "Sign up failed" } };
      if (data.user) {
        _session = { user: data.user, access_token: data.access_token ?? "" };
        _sessionFetched = true;
      }
      return { data: { user: data.user, session: _session }, error: null };
    } catch (e) {
      return { data: { user: null, session: null }, error: { message: (e as Error).message } };
    }
  },

  async signInWithOAuth(_opts: { provider: string; options?: { redirectTo?: string } }) {
    window.location.href = "/api/auth/login";
    return { data: { url: "/api/auth/login", provider: "replit" }, error: null };
  },

  async signOut() {
    _session = null;
    _sessionFetched = false;
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    return { error: null };
  },

  async resetPasswordForEmail(_email: string, _opts?: { redirectTo?: string }) {
    return { data: {}, error: { message: "Password reset via email is not supported. Please use Replit authentication." } };
  },

  async updateUser(_fields: { password?: string; email?: string }) {
    return { data: { user: null }, error: { message: "Profile updates are not supported via this method. Use the profile editor." } };
  },
};

/* ── DB query shim ────────────────────────────────────────────────────── */
type QueryResult<T = unknown> = Promise<{ data: T | null; error: { message: string } | null; count?: number | null }>;

function buildQuery(table: string) {
  const state = {
    method:     "select" as "select" | "insert" | "update" | "delete" | "upsert",
    selectCols: "*",
    filters:    [] as Array<{ key: string; op: string; value: unknown }>,
    data:       null as unknown,
    orderCol:   null as string | null,
    orderAsc:   true,
    limitN:     null as number | null,
    single_:    false,
    maybeSingle_: false,
    countOnly:  false,
    head_:      false,
  };

  function exec(): QueryResult {
    return fetch("/api/db-proxy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
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

  const q: any = {
    select(cols: string, opts?: { count?: string; head?: boolean }) {
      state.method = "select"; state.selectCols = cols;
      if (opts?.count) state.countOnly = true;
      if (opts?.head) state.head_ = true;
      return q;
    },
    insert(data: unknown) { state.method = "insert"; state.data = data; return q; },
    update(data: unknown) { state.method = "update"; state.data = data; return q; },
    delete() { state.method = "delete"; return q; },
    upsert(data: unknown, _opts?: unknown) { state.method = "upsert"; state.data = data; return q; },
    eq(col: string, val: unknown) { state.filters.push({ key: col, op: "eq", value: val }); return q; },
    neq(col: string, val: unknown) { state.filters.push({ key: col, op: "neq", value: val }); return q; },
    gt(col: string, val: unknown) { state.filters.push({ key: col, op: "gt", value: val }); return q; },
    gte(col: string, val: unknown) { state.filters.push({ key: col, op: "gte", value: val }); return q; },
    lt(col: string, val: unknown) { state.filters.push({ key: col, op: "lt", value: val }); return q; },
    lte(col: string, val: unknown) { state.filters.push({ key: col, op: "lte", value: val }); return q; },
    in(col: string, vals: unknown[]) { state.filters.push({ key: col, op: "in", value: vals }); return q; },
    is(col: string, val: unknown) { state.filters.push({ key: col, op: "is", value: val }); return q; },
    ilike(col: string, val: unknown) { state.filters.push({ key: col, op: "ilike", value: val }); return q; },
    like(col: string, val: unknown) { state.filters.push({ key: col, op: "like", value: val }); return q; },
    or(filter: string) { state.filters.push({ key: "__or", op: "or", value: filter }); return q; },
    order(col: string, opts?: { ascending?: boolean }) { state.orderCol = col; state.orderAsc = opts?.ascending !== false; return q; },
    limit(n: number) { state.limitN = n; return q; },
    single() { state.single_ = true; state.limitN = 1; return exec(); },
    maybeSingle() { state.maybeSingle_ = true; state.limitN = 1; return exec(); },
    then(resolve: (r: unknown) => void, reject?: (e: unknown) => void) { exec().then(resolve, reject); },
  };
  return q;
}

/* ── Storage shim ──────────────────────────────────────────────────────── */
function makeStorage() {
  return {
    from(_bucket: string) {
      return {
        upload: async (_path: string, _file: Blob, _opts?: unknown) => {
          return { data: null, error: { message: "Storage not available — use Cloudinary upload" } };
        },
        getPublicUrl: (_path: string) => ({ data: { publicUrl: "" } }),
        download: async (_path: string) => ({ data: null, error: { message: "Storage not available" } }),
      };
    },
  };
}

/* ── Main supabase export ─────────────────────────────────────────────── */
export const supabase = {
  auth,
  from:   (table: string) => buildQuery(table),
  rpc:    async (fn: string, args?: Record<string, unknown>) => {
    try {
      const res = await fetch("/api/rpc/" + fn, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(args ?? {}),
        credentials: "include",
      });
      const data = await res.json();
      return { data, error: null };
    } catch (e) {
      return { data: null, error: { message: (e as Error).message } };
    }
  },
  channel: (_name: string, _opts?: unknown) => makeChannel(),
  removeChannel: async (_ch: unknown) => "ok" as const,
  storage: makeStorage(),
};

/* ── Online presence + owner badge helpers ─────────────────────────────── */
export async function setOnlineStatus(online: boolean): Promise<void> {
  try {
    await fetch("/api/presence", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ online }),
      credentials: "include",
    });
  } catch {}
}

export async function claimOwnerBadge(): Promise<boolean> {
  try {
    const res = await fetch("/api/owner/claim", { method: "POST", credentials: "include" });
    const data = await res.json() as { claimed?: boolean };
    return Boolean(data?.claimed);
  } catch { return false; }
}

/* ── localStorage cache ─────────────────────────────────────────────────── */
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

/* ── Database helpers ─────────────────────────────────────────────────── */
export async function fetchProfile(uid: string): Promise<DbUser | null> {
  try {
    const res = await fetch(`/api/users/${uid}`, { credentials: "include" });
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
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fields),
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
    const res = await fetch(`/api/users/search?q=${encodeURIComponent(q)}&limit=${limit}`, { credentials: "include" });
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
  const res = await fetch("/api/upload", { method: "POST", body: formData, credentials: "include" });
  if (!res.ok) throw new Error("Avatar upload failed");
  const data = await res.json() as { url: string };
  return `${data.url}?t=${Date.now()}`;
}
