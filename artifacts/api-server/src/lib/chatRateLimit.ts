/**
 * Lightweight in-memory token bucket per user for the Socia GPT chat endpoint.
 *
 * HONEST LIMITATIONS:
 *   - Resets on server restart.
 *   - Does not survive across multiple replicas.
 * For Socia's current single-instance deployment this is acceptable; if the
 * service ever scales horizontally, swap this for Supabase or Redis.
 */
const REQUESTS_PER_MINUTE = 12;
const WINDOW_MS = 60_000;

interface Bucket { count: number; windowStart: number; }
const buckets = new Map<string, Bucket>();

export function takeChatToken(userId: string): { allowed: true } | { allowed: false; retryAfterSec: number } {
  const now = Date.now();
  const b = buckets.get(userId);
  if (!b || now - b.windowStart > WINDOW_MS) {
    buckets.set(userId, { count: 1, windowStart: now });
    return { allowed: true };
  }
  if (b.count >= REQUESTS_PER_MINUTE) {
    const retryAfterSec = Math.max(1, Math.ceil((WINDOW_MS - (now - b.windowStart)) / 1000));
    return { allowed: false, retryAfterSec };
  }
  b.count += 1;
  return { allowed: true };
}

// Periodic GC so the map can't grow unbounded on a long-running process.
setInterval(() => {
  const cutoff = Date.now() - WINDOW_MS * 2;
  for (const [k, b] of buckets) if (b.windowStart < cutoff) buckets.delete(k);
}, WINDOW_MS).unref?.();
