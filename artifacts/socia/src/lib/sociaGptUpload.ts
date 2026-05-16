import { supabase } from "./supabase";
import type { ChatAttachment } from "./sociaGptClient";

/** Mime allow-lists (mirror what the storage bucket policy enforces). */
const IMAGE_MIMES = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"];
const AUDIO_MIMES = ["audio/webm", "audio/ogg", "audio/mp4", "audio/mpeg", "audio/mp3", "audio/wav"];
const VIDEO_MIMES = ["video/mp4", "video/webm", "video/quicktime", "video/x-matroska"];

const MAX_BYTES = 25 * 1024 * 1024; // 25 MB

export type AttachmentKind = "image" | "audio" | "video";

export function detectAttachmentKind(file: File): AttachmentKind | null {
  const mime = (file.type || "").toLowerCase();
  if (IMAGE_MIMES.includes(mime)) return "image";
  if (AUDIO_MIMES.includes(mime)) return "audio";
  if (VIDEO_MIMES.includes(mime)) return "video";
  /* Fall back to file extension for browsers that don't set type reliably. */
  const ext = (file.name.split(".").pop() || "").toLowerCase();
  if (["jpg","jpeg","png","webp","gif"].includes(ext))         return "image";
  if (["mp3","wav","ogg","m4a","webm"].includes(ext))           return "audio";
  if (["mp4","mov","webm","mkv"].includes(ext))                 return "video";
  return null;
}

function safeName(name: string): string {
  return (name || "file")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .slice(0, 80) || "file";
}

/**
 * Upload a chat attachment to the public `socia-gpt-uploads` bucket and
 * return everything the chat route needs. Throws a friendly Error on size /
 * mime / network failures so the UI can show it inline.
 */
export async function uploadSociaGptFile(file: File): Promise<ChatAttachment> {
  if (file.size > MAX_BYTES) {
    throw new Error(`File is too large (${(file.size / 1_048_576).toFixed(1)} MB). Max 25 MB.`);
  }
  const kind = detectAttachmentKind(file);
  if (!kind) throw new Error(`Unsupported file type: ${file.type || file.name}`);

  const { data: sess } = await supabase.auth.getSession();
  const userId = sess?.session?.user?.id;
  if (!userId) throw new Error("You're signed out. Please sign in again.");

  const path = `${userId}/${Date.now()}_${safeName(file.name)}`;
  const { error } = await supabase.storage
    .from("socia-gpt-uploads")
    .upload(path, file, { contentType: file.type || undefined, cacheControl: "3600", upsert: false });
  if (error) throw new Error(`Upload failed: ${error.message}`);

  const { data: urlData } = supabase.storage.from("socia-gpt-uploads").getPublicUrl(path);
  if (!urlData?.publicUrl) throw new Error("Could not resolve public URL");

  return {
    kind,
    url:  urlData.publicUrl,
    path,
    mime: file.type || (kind === "image" ? "image/jpeg" : kind === "audio" ? "audio/webm" : "video/mp4"),
    name: file.name,
    size: file.size,
  };
}
