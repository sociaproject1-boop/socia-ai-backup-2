/**
 * postsClient.ts — Social posts & feed API client.
 * All requests hit the api-server (prefixed with BASE_URL).
 */
import { supabase } from "./supabase";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const jwt = data.session?.access_token;
  if (!jwt) return {};
  return { Authorization: `Bearer ${jwt}` };
}

export interface PostMedia {
  id: string;
  url: string;
  type: "photo" | "video";
  width?: number;
  height?: number;
  duration?: number;
  position: number;
}

export interface PostAuthor {
  id: string;
  name: string;
  username: string;
  avatar_url: string | null;
  is_verified: boolean;
  is_owner: boolean;
  subscription_status?: string;
  is_monetized?: boolean;
}

export interface SoundCreator {
  id:         string;
  name:       string | null;
  username:   string | null;
  avatar_url: string | null;
}

export interface PostSound {
  id:          string;
  title:       string;
  cover_image: string | null;
  audio_url:   string;
  usage_count: number;
  creator_id:  string | null;
  creator:     SoundCreator | null;
}

export interface SocialPost {
  id: string;
  author_id: string;
  caption: string | null;
  type: "photo" | "video" | "multi";
  view_count: number;
  created_at: string;
  author: PostAuthor;
  media: PostMedia[];
  like_count: number;
  comment_count: number;
  save_count?: number;
  has_liked?: boolean;
  has_saved?: boolean;
  sound_id?: string | null;
  sound?: PostSound | null;
}

export interface Comment {
  id: string;
  post_id: string;
  author_id: string;
  content: string;
  created_at: string;
  parent_comment_id?: string | null;
  author: {
    id: string;
    name: string;
    username: string;
    avatar_url: string | null;
  };
}

export interface Notification {
  id: string;
  type: "like" | "comment" | "reply" | "follow" | "mention" | "stars";
  read: boolean;
  created_at: string;
  post_id: string | null;
  comment_id: string | null;
  metadata?: { amount?: number; transaction_id?: string } | null;
  actor: {
    id: string;
    name: string;
    username: string;
    avatar_url: string | null;
  } | null;
}

/* ── Feeds ──────────────────────────────────────────────────────────────── */

export async function fetchFeed(opts?: {
  limit?: number;
  offset?: number;
  viewerId?: string;
  sort?: "trending" | "newest";
}): Promise<SocialPost[]> {
  const params = new URLSearchParams();
  if (opts?.limit)    params.set("limit",    String(opts.limit));
  if (opts?.offset)   params.set("offset",   String(opts.offset));
  if (opts?.viewerId) params.set("viewerId", opts.viewerId);
  if (opts?.sort)     params.set("sort",     opts.sort);

  const r = await fetch(`${BASE}/api/posts?${params}`, {
    headers: await authHeaders(),
  });
  if (!r.ok) throw new Error(`Feed error: ${r.status}`);
  const j = await r.json();
  return j.posts ?? [];
}

export async function fetchFollowingFeed(opts?: {
  limit?: number;
  offset?: number;
  viewerId?: string;
}): Promise<SocialPost[]> {
  const params = new URLSearchParams();
  if (opts?.limit)  params.set("limit",  String(opts.limit));
  if (opts?.offset) params.set("offset", String(opts.offset));

  const r = await fetch(`${BASE}/api/posts/feed/following?${params}`, {
    headers: await authHeaders(),
  });
  if (!r.ok) {
    if (r.status === 401) return [];
    throw new Error(`Following feed error: ${r.status}`);
  }
  const j = await r.json();
  return j.posts ?? [];
}

export async function fetchSavedFeed(opts?: {
  limit?: number;
  offset?: number;
}): Promise<SocialPost[]> {
  const params = new URLSearchParams();
  if (opts?.limit)  params.set("limit",  String(opts.limit));
  if (opts?.offset) params.set("offset", String(opts.offset));

  const r = await fetch(`${BASE}/api/posts/feed/saved?${params}`, {
    headers: await authHeaders(),
  });
  if (!r.ok) {
    if (r.status === 401) return [];
    throw new Error(`Saved feed error: ${r.status}`);
  }
  const j = await r.json();
  return j.posts ?? [];
}

export async function fetchUserPosts(uid: string, opts?: {
  limit?: number;
  offset?: number;
  viewerId?: string;
}): Promise<SocialPost[]> {
  const params = new URLSearchParams();
  if (opts?.limit)    params.set("limit",    String(opts.limit));
  if (opts?.offset)   params.set("offset",   String(opts.offset));
  if (opts?.viewerId) params.set("viewerId", opts.viewerId);

  const r = await fetch(`${BASE}/api/posts/user/${uid}?${params}`, {
    headers: await authHeaders(),
  });
  if (!r.ok) throw new Error(`User posts error: ${r.status}`);
  const j = await r.json();
  return j.posts ?? [];
}

export async function fetchSinglePost(id: string, viewerId?: string): Promise<SocialPost | null> {
  const params = new URLSearchParams();
  if (viewerId) params.set("viewerId", viewerId);

  const r = await fetch(`${BASE}/api/posts/${id}?${params}`, {
    headers: await authHeaders(),
  });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`Post error: ${r.status}`);
  const j = await r.json();
  return j.post ?? null;
}

/* ── Post CRUD ──────────────────────────────────────────────────────────── */

export async function createPost(payload: {
  caption?: string;
  type: "photo" | "video" | "multi";
  media: Array<{ url: string; type: "photo" | "video"; width?: number; height?: number; duration?: number }>;
  sound_id?: string | null;
}): Promise<SocialPost> {
  const headers = await authHeaders();
  const r = await fetch(`${BASE}/api/posts`, {
    method:  "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body:    JSON.stringify(payload),
  });
  if (!r.ok) {
    const j = await r.json().catch(() => ({}));
    throw new Error(j.error ?? `Create post error: ${r.status}`);
  }
  const j = await r.json();
  return j.post;
}

/** Create a text-only Moments post (no media). Uses existing POST /api/posts. */
export async function createTextPost(caption: string): Promise<SocialPost> {
  return createPost({ caption, type: "photo", media: [] });
}

export async function deletePost(postId: string): Promise<void> {
  const headers = await authHeaders();
  const r = await fetch(`${BASE}/api/posts/${postId}`, {
    method: "DELETE",
    headers,
  });
  if (!r.ok) throw new Error(`Delete error: ${r.status}`);
}

/* ── Like / Save ────────────────────────────────────────────────────────── */

export async function toggleLike(postId: string): Promise<{ liked: boolean }> {
  const headers = await authHeaders();
  const r = await fetch(`${BASE}/api/posts/${postId}/like`, {
    method: "POST",
    headers,
  });
  if (!r.ok) throw new Error(`Like error: ${r.status}`);
  return r.json();
}

export async function toggleSave(postId: string): Promise<{ saved: boolean }> {
  const headers = await authHeaders();
  const r = await fetch(`${BASE}/api/posts/${postId}/save`, {
    method: "POST",
    headers,
  });
  if (!r.ok) throw new Error(`Save error: ${r.status}`);
  return r.json();
}

/* ── Comments ───────────────────────────────────────────────────────────── */

export async function fetchComments(postId: string, opts?: {
  parentId?: string;
  limit?: number;
  offset?: number;
}): Promise<Comment[]> {
  const params = new URLSearchParams();
  if (opts?.parentId) params.set("parentId", opts.parentId);
  if (opts?.limit)    params.set("limit",    String(opts.limit));
  if (opts?.offset)   params.set("offset",   String(opts.offset));

  const r = await fetch(`${BASE}/api/posts/${postId}/comments?${params}`);
  if (!r.ok) throw new Error(`Comments error: ${r.status}`);
  const j = await r.json();
  return j.comments ?? [];
}

export async function addComment(postId: string, content: string, parentCommentId?: string): Promise<Comment> {
  const headers = await authHeaders();
  const r = await fetch(`${BASE}/api/posts/${postId}/comments`, {
    method:  "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body:    JSON.stringify({ content, parent_comment_id: parentCommentId ?? null }),
  });
  if (!r.ok) throw new Error(`Comment error: ${r.status}`);
  const j = await r.json();
  return j.comment;
}

export async function editComment(postId: string, commentId: string, content: string): Promise<Comment> {
  const headers = await authHeaders();
  const r = await fetch(`${BASE}/api/posts/${postId}/comments/${commentId}`, {
    method:  "PUT",
    headers: { ...headers, "Content-Type": "application/json" },
    body:    JSON.stringify({ content }),
  });
  if (!r.ok) throw new Error(`Edit comment error: ${r.status}`);
  const j = await r.json();
  return j.comment;
}

export async function deleteComment(postId: string, commentId: string): Promise<void> {
  const headers = await authHeaders();
  const r = await fetch(`${BASE}/api/posts/${postId}/comments/${commentId}`, {
    method: "DELETE",
    headers,
  });
  if (!r.ok) throw new Error(`Delete comment error: ${r.status}`);
}

/* ── Reports ────────────────────────────────────────────────────────────── */

export type ReportReason = "spam" | "inappropriate" | "harassment" | "misinformation" | "other";

export async function reportPost(postId: string, reason: ReportReason, notes?: string): Promise<void> {
  const headers = await authHeaders();
  await fetch(`${BASE}/api/posts/${postId}/report`, {
    method:  "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body:    JSON.stringify({ reason, notes }),
  });
}

export async function reportComment(postId: string, commentId: string, reason: ReportReason, notes?: string): Promise<void> {
  const headers = await authHeaders();
  await fetch(`${BASE}/api/posts/${postId}/comments/${commentId}/report`, {
    method:  "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body:    JSON.stringify({ reason, notes }),
  });
}

/* ── View counter ───────────────────────────────────────────────────────── */

export async function recordView(postId: string): Promise<void> {
  await fetch(`${BASE}/api/posts/${postId}/view`, { method: "POST" }).catch(() => {});
}

/* ── Notifications ──────────────────────────────────────────────────────── */

export async function fetchNotifications(opts?: { limit?: number; offset?: number }): Promise<{
  notifications: Notification[];
  unread: number;
}> {
  const params = new URLSearchParams();
  if (opts?.limit)  params.set("limit",  String(opts.limit));
  if (opts?.offset) params.set("offset", String(opts.offset));

  const headers = await authHeaders();
  const r = await fetch(`${BASE}/api/notifications?${params}`, { headers });
  if (!r.ok) return { notifications: [], unread: 0 };
  return r.json();
}

export async function markAllNotificationsRead(): Promise<void> {
  const headers = await authHeaders();
  await fetch(`${BASE}/api/notifications/read-all`, { method: "PUT", headers });
}

export async function markNotificationRead(id: string): Promise<void> {
  const headers = await authHeaders();
  await fetch(`${BASE}/api/notifications/${id}/read`, { method: "PUT", headers });
}

/* ── Media upload ───────────────────────────────────────────────────────── */

export async function uploadPostMedia(
  file: File,
  userId: string,
  onProgress?: (pct: number) => void,
): Promise<string> {
  const ext  = file.name.split(".").pop() ?? "bin";
  const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

  const { data, error } = await supabase.storage
    .from("post-media")
    .upload(path, file, { upsert: false });

  if (error) throw new Error(error.message);

  const { data: urlData } = supabase.storage.from("post-media").getPublicUrl(data.path);
  if (onProgress) onProgress(100);
  return urlData.publicUrl;
}

export async function uploadCoverPhoto(file: File, userId: string): Promise<string> {
  const ext  = file.name.split(".").pop() ?? "jpg";
  const path = `${userId}/cover.${ext}`;

  await supabase.storage.from("cover-photos").remove([path]).catch(() => {});

  const { data, error } = await supabase.storage
    .from("cover-photos")
    .upload(path, file, { upsert: true });

  if (error) throw new Error(error.message);

  const { data: urlData } = supabase.storage.from("cover-photos").getPublicUrl(data.path);
  return `${urlData.publicUrl}?t=${Date.now()}`;
}

/* ── Alert settings (owner) ─────────────────────────────────────────────── */

export interface AlertSettingsPayload {
  email_enabled: boolean;
  sms_enabled: boolean;
  webhook_enabled: boolean;
  email_address: string | null;
  phone_number: string | null;
  webhook_url: string | null;
}

export async function getAlertSettings() {
  const headers = await authHeaders();
  const r = await fetch(`${BASE}/api/alert-settings`, { headers });
  if (!r.ok) throw new Error(`Alert settings error: ${r.status}`);
  return r.json();
}

export async function saveAlertSettings(payload: AlertSettingsPayload) {
  const headers = await authHeaders();
  const r = await fetch(`${BASE}/api/alert-settings`, {
    method:  "PUT",
    headers: { ...headers, "Content-Type": "application/json" },
    body:    JSON.stringify(payload),
  });
  if (!r.ok) throw new Error(`Save settings error: ${r.status}`);
  const j = await r.json();
  return j.settings;
}

export async function sendTestAlertToChannels() {
  const headers = await authHeaders();
  const r = await fetch(`${BASE}/api/alert-settings/test`, { method: "POST", headers });
  if (!r.ok) throw new Error(`Test error: ${r.status}`);
  return r.json();
}
