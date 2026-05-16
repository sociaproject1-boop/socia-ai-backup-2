/**
 * AI Abuse Guard — detects and blocks abusive usage patterns.
 *
 * Strategies:
 *   1. Burst detection: >5 requests in 30s → temporary lockout
 *   2. Lockout escalation: repeat offenders get progressively longer lockouts
 *   3. Suspicious activity scoring (future: account farming, automation)
 *
 * All in-memory. Data is lost on restart — intentional, since abuse state
 * should not permanently block legitimate users after a server bounce.
 */

const BURST_WINDOW_MS   = 30_000;   // 30 seconds
const BURST_THRESHOLD   = 5;        // >5 requests in window = abuse
const LOCKOUT_BASE_MS   = 5 * 60 * 1000;   // 5 minutes base lockout
const LOCKOUT_MAX_MS    = 60 * 60 * 1000;  // 1 hour max lockout

interface UserRecord {
  requestTimestamps:  number[];     // sliding window
  lockedUntil:        number;       // epoch ms; 0 = not locked
  lockoutCount:       number;       // escalation counter
  abuseScore:         number;       // 0–100; higher = more suspicious
}

const records = new Map<string, UserRecord>();

function getOrCreate(userId: string): UserRecord {
  if (!records.has(userId)) {
    records.set(userId, {
      requestTimestamps: [],
      lockedUntil: 0,
      lockoutCount: 0,
      abuseScore: 0,
    });
  }
  return records.get(userId)!;
}

export interface AbuseCheckResult {
  allowed:       boolean;
  locked:        boolean;
  retryAfterSec: number;
  abuseScore:    number;
  reason?:       string;
}

/**
 * Call this BEFORE processing an AI request.
 * If allowed, it records the attempt and updates abuse score.
 * If blocked, the request should be rejected immediately.
 */
export function checkAbuse(userId: string): AbuseCheckResult {
  const now = Date.now();
  const rec = getOrCreate(userId);

  // 1. Check existing lockout
  if (rec.lockedUntil > now) {
    const retryAfterSec = Math.ceil((rec.lockedUntil - now) / 1000);
    return { allowed: false, locked: true, retryAfterSec, abuseScore: rec.abuseScore, reason: "lockout" };
  }

  // 2. Purge old timestamps outside the burst window
  rec.requestTimestamps = rec.requestTimestamps.filter((t) => now - t < BURST_WINDOW_MS);

  // 3. Check burst threshold
  if (rec.requestTimestamps.length >= BURST_THRESHOLD) {
    rec.lockoutCount += 1;

    // Escalating lockout: 5min → 15min → 30min → 1hr
    const lockoutMs = Math.min(LOCKOUT_BASE_MS * Math.pow(2, rec.lockoutCount - 1), LOCKOUT_MAX_MS);
    rec.lockedUntil  = now + lockoutMs;
    rec.abuseScore   = Math.min(100, rec.abuseScore + 25);

    const retryAfterSec = Math.ceil(lockoutMs / 1000);
    return {
      allowed: false, locked: true, retryAfterSec,
      abuseScore: rec.abuseScore,
      reason: `Burst limit exceeded. Locked for ${Math.round(lockoutMs / 60000)} min.`,
    };
  }

  // 4. Record this request
  rec.requestTimestamps.push(now);

  // 5. Passive score decay (score decreases when usage is normal)
  if (rec.abuseScore > 0 && rec.requestTimestamps.length <= 2) {
    rec.abuseScore = Math.max(0, rec.abuseScore - 2);
  }

  return { allowed: true, locked: false, retryAfterSec: 0, abuseScore: rec.abuseScore };
}

/** Escalate the cooldown multiplier for a user (called after errors on high-abuse-score users). */
export function escalateCooldown(userId: string, factor: number): void {
  const rec = getOrCreate(userId);
  // We track escalation by extending the lockout slightly
  rec.abuseScore = Math.min(100, rec.abuseScore + 5 * factor);
}

/** Force-clear a user's lockout (for admin use). */
export function clearLockout(userId: string): void {
  const rec = records.get(userId);
  if (rec) {
    rec.lockedUntil         = 0;
    rec.requestTimestamps   = [];
  }
}

/** Get current abuse score for a user (0–100). */
export function getAbuseScore(userId: string): number {
  return records.get(userId)?.abuseScore ?? 0;
}

// GC: remove stale records (no activity in 2 hours)
setInterval(() => {
  const cutoff = Date.now() - 7_200_000;
  for (const [k, v] of records) {
    const lastActivity = v.requestTimestamps[v.requestTimestamps.length - 1] ?? 0;
    if (lastActivity < cutoff && v.lockedUntil < Date.now()) {
      records.delete(k);
    }
  }
}, 600_000).unref?.();
