/**
 * rateLimit — Per-IP sliding-window rate limiter.
 *
 * In-memory single-instance implementation (suitable for the current
 * single-pod Replit deployment). For multi-instance deploys, swap the
 * underlying Map for Redis with the SAME public API (`take(key)`).
 *
 * IP extraction is TRUST-GATED:
 *   - When `TRUST_PROXY_HEADERS=1` (set in production behind Cloudflare /
 *     Replit's edge proxy), we honor `cf-connecting-ip`, `x-forwarded-for`,
 *     `x-real-ip` — because the upstream proxy strips client-supplied copies
 *     and writes the real client IP.
 *   - Otherwise (dev / direct origin), those headers are CLIENT-CONTROLLED
 *     and a spoofable bypass. We use `req.socket.remoteAddress` only.
 *
 * Provides:
 *   - `createRateLimiter(opts)` — returns Express middleware
 *   - `getClientIp(req)`        — pure helper, also reused by auth audit
 *
 * Behaviour on limit hit: returns 429 with `{ code: "RATE_LIMITED",
 * retryAfter: seconds }` and sets `Retry-After` header. Never throws.
 *
 * IMPORTANT: this is an additive safety layer. The per-user atomic gate
 * (gateAndConsume) is still the source of truth for credit accounting.
 * This middleware only blocks burst abuse before it reaches credit logic.
 */
import type { Request, Response, NextFunction } from "express";
import { logger } from "./logger.js";

export interface RateLimitOptions {
  /** Distinct name shown in logs and 429 payload. */
  name: string;
  /** Window length in seconds. */
  windowSec: number;
  /** Max requests allowed within the window per key. */
  max: number;
  /**
   * Optional key extractor. Defaults to client IP. Use this to scope the
   * limit to e.g. `IP+username` so password attacks can't be amortized
   * across many usernames from the same IP.
   */
  keyOf?: (req: Request) => string | null;
}

interface Bucket {
  /** Timestamps (ms) of requests inside the current window. */
  hits: number[];
  /** Configured window length (ms) — used by the janitor to know when this
   *  bucket has truly aged out, independent of the global default. */
  windowMs: number;
}

const buckets = new Map<string, Bucket>();

/**
 * Periodic janitor: drops buckets whose newest hit is older than the
 * bucket's own window (with a small safety floor) so long-window limits
 * like admin-setup (3600s) aren't reset prematurely.
 */
const SWEEP_INTERVAL_MS = 60_000;
const MIN_STALE_MS = 60_000;
setInterval(() => {
  const now = Date.now();
  for (const [k, b] of buckets) {
    const newest = b.hits[b.hits.length - 1] ?? 0;
    const staleAfter = Math.max(b.windowMs, MIN_STALE_MS);
    if (b.hits.length === 0 || now - newest > staleAfter) {
      buckets.delete(k);
    }
  }
}, SWEEP_INTERVAL_MS).unref();

/**
 * Whether to trust upstream proxy headers for client IP. Set to "1" in
 * production where requests come through CF / Replit's edge proxy. Off by
 * default so dev environments don't accept spoofable headers.
 */
function trustProxy(): boolean {
  return process.env["TRUST_PROXY_HEADERS"] === "1";
}

/**
 * Extract the real client IP. See file header for trust model.
 */
export function getClientIp(req: Request): string {
  if (trustProxy()) {
    const cf = req.header("cf-connecting-ip");
    if (cf) return normalizeIp(cf);
    const fwd = req.header("x-forwarded-for");
    if (fwd) return normalizeIp(fwd.split(",")[0]?.trim() ?? "");
    const real = req.header("x-real-ip");
    if (real) return normalizeIp(real);
  }
  // Untrusted environment OR no proxy headers present: use the transport
  // peer address, which is unspoofable from outside.
  return normalizeIp(req.socket.remoteAddress ?? req.ip ?? "unknown");
}

function normalizeIp(ip: string): string {
  if (!ip) return "unknown";
  // Strip IPv6 mapped-v4 prefix and zone identifiers
  let v = ip.replace(/^::ffff:/i, "").replace(/%.+$/, "");
  // Strip optional port suffix on IPv4 (1.2.3.4:5678)
  if (v.includes(".") && v.includes(":")) v = v.split(":")[0] ?? v;
  return v;
}

export function createRateLimiter(opts: RateLimitOptions) {
  const { name, windowSec, max } = opts;
  const windowMs = windowSec * 1_000;
  const keyOf = opts.keyOf ?? ((req: Request) => `${name}:${getClientIp(req)}`);

  return function rateLimitMiddleware(req: Request, res: Response, next: NextFunction): void {
    const key = keyOf(req);
    if (!key) {
      next();
      return;
    }
    const now = Date.now();
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { hits: [], windowMs };
      buckets.set(key, bucket);
    } else if (bucket.windowMs !== windowMs) {
      // Defensive: same key used by two limiters with different windows.
      // Keep the largest so janitor doesn't prematurely evict.
      bucket.windowMs = Math.max(bucket.windowMs, windowMs);
    }
    // Drop expired hits.
    bucket.hits = bucket.hits.filter((t) => now - t < windowMs);

    if (bucket.hits.length >= max) {
      const oldest = bucket.hits[0] ?? now;
      const retryAfter = Math.max(1, Math.ceil((windowMs - (now - oldest)) / 1000));
      res.setHeader("Retry-After", String(retryAfter));
      res.setHeader("X-RateLimit-Limit", String(max));
      res.setHeader("X-RateLimit-Remaining", "0");
      res.setHeader("X-RateLimit-Reset", String(Math.ceil((oldest + windowMs) / 1000)));
      logger.warn({ name, key, max, windowSec, retryAfter }, "[rateLimit] blocked");
      res.status(429).json({
        code: "RATE_LIMITED",
        message: `Too many requests. Try again in ${retryAfter}s.`,
        retryAfter,
      });
      return;
    }

    bucket.hits.push(now);
    res.setHeader("X-RateLimit-Limit", String(max));
    res.setHeader("X-RateLimit-Remaining", String(Math.max(0, max - bucket.hits.length)));
    next();
  };
}

/**
 * Test-only: clear all buckets. Not exposed via routes.
 */
export function __resetRateLimitersForTest(): void {
  buckets.clear();
}
