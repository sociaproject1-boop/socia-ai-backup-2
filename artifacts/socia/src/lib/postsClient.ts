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
}

export interface Comment {
  id: string;
  post_id: string;
  author_id: string;
  content: string;
  created_at: string;
  author: {
    id: string;
    name: string;
    username: string;
    avatar_url: string | null;
  };
}

export async function fetchFeed(opts?: {
  limit?: number;
  offset?: number;
  userId?: string;
}): Promise<SocialPost[]> {
  const params = new URLSearchParams();
  if (opts?.limit)  params.set("limit",  String(opts.limit));
  if (opts?.offset) params.set("offset", String(opts.offset));
  if (opts?.userId) params.set("userId", opts.userId);

  const r = await fetch(`${BASE}/api/posts?${params}`, {
    headers: await authHeaders(),
  });
  if (!r.ok) throw new Error(`Feed error: ${r.status}`);
  const j = await r.json();
  return j.posts ?? [];
}

export async function fetchUserPosts(uid: string, opts?: { limit?: number; offset?: number }): Promise<SocialPost[]> {
  const params = new URLSearchParams();
  if (opts?.limit)  params.set("limit",  String(opts.limit));
  if (opts?.offset) params.set("offset", String(opts.offset));

  const r = await fetch(`${BASE}/api/posts/user/${uid}?${params}`, {
    headers: await authHeaders(),
  });
  if (!r.ok) throw new Error(`User posts error: ${r.status}`);
  const j = await r.json();
  return j.posts ?? [];
}

export async function createPost(payload: {
  caption?: string;
  type: "photo" | "video" | "multi";
  media: Array<{ url: string; type: "photo" | "video"; width?: number; height?: number; duration?: number }>;
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

export async function deletePost(postId: string): Promise<void> {
  const headers = await authHeaders();
  const r = await fetch(`${BASE}/api/posts/${postId}`, {
    method: "DELETE",
    headers,
  });
  if (!r.ok) throw new Error(`Delete error: ${r.status}`);
}

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

export async function fetchComments(postId: string): Promise<Comment[]> {
  const r = await fetch(`${BASE}/api/posts/${postId}/comments`);
  if (!r.ok) throw new Error(`Comments error: ${r.status}`);
  const j = await r.json();
  return j.comments ?? [];
}

export async function addComment(postId: string, content: string): Promise<Comment> {
  const headers = await authHeaders();
  const r = await fetch(`${BASE}/api/posts/${postId}/comments`, {
    method:  "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body:    JSON.stringify({ content }),
  });
  if (!r.ok) throw new Error(`Comment error: ${r.status}`);
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

/**
 * Upload a file to the post-media Supabase bucket.
 * Returns the public URL.
 */
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

/**
 * Upload a cover photo for the profile.
 */
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

/**
 * Get/save alert settings (owner only).
 */
export interface AlertSettingsPayload {
  email_enabled: boolean;
  sms_enabled: boolean;
  webhook_enabled: boolean;
  email_address: string | null;
  phone_number: string | null;
  webhook_url: string | null;
}

export async function getAlertSettings(): Promise<{
  settings: AlertSettingsPayload | null;
  env: { email_enabled: boolean; sms_enabled: boolean; webhook_enabled: boolean };
}> {
  const headers = await authHeaders();
  const r = await fetch(`${BASE}/api/alert-settings`, { headers });
  if (!r.ok) throw new Error(`Alert settings error: ${r.status}`);
  return r.json();
}

export async function saveAlertSettings(payload: AlertSettingsPayload): Promise<AlertSettingsPayload> {
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

export async function sendTestAlertToChannels(): Promise<{
  delivered: number;
  results: Array<{ channel: string; success: boolean; error?: string }>;
}> {
  const headers = await authHeaders();
  const r = await fetch(`${BASE}/api/alert-settings/test`, {
    method: "POST",
    headers,
  });
  if (!r.ok) throw new Error(`Test error: ${r.status}`);
  return r.json();
}
