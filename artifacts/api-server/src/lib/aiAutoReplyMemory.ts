/**
 * aiAutoReplyMemory.ts — per-conversation message history for the AI.
 * Keeps the last MAX_MSGS turns so the AI can maintain context.
 * Uses a simple in-memory Map (sufficient for a single-instance server).
 */

const MAX_MSGS = 20;

export interface MemoryEntry {
  role:    "user" | "assistant";
  content: string;
}

const store = new Map<string, MemoryEntry[]>();

/** Stable key regardless of which side is "user" vs "admin". */
function key(a: string, b: string): string {
  return [a, b].sort().join(":");
}

export function addMessage(
  userId:  string,
  adminId: string,
  role:    "user" | "assistant",
  content: string,
): void {
  const k    = key(userId, adminId);
  const msgs = store.get(k) ?? [];
  msgs.push({ role, content });
  if (msgs.length > MAX_MSGS) msgs.splice(0, msgs.length - MAX_MSGS);
  store.set(k, msgs);
}

export function getContext(userId: string, adminId: string): MemoryEntry[] {
  return store.get(key(userId, adminId)) ?? [];
}

export function clearContext(userId: string, adminId: string): void {
  store.delete(key(userId, adminId));
}
