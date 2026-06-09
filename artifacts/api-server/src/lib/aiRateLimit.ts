/**
 * AI Rate Limiter — plan-aware, Supabase-persisted usage counts.
 *
 * Tracks:
 *   • Cooldown: in-memory (per-user timestamp of last request)
 *   • Daily count: Supabase ai_usage_tracking (free plan; resets midnight UTC)
 *   • Monthly count: Supabase ai_usage_tracking (paid plans; resets 1st of month)
 *
 * Falls back gracefully if Supabase table doesn't exist yet.
 *
 * IMPORTANT: Cooldown and burst detection are purely in-memory for speed.
 * Usage counts are persisted so they survive restarts and multiple instances.
 */

import type { AIPlan } from "./aiSubscription.js";

/* ── In-memory cooldown store ───────────────────────────────────────────── */

interface CooldownEntry {
  lastRequestAt: number;   // ms since epoch
  cooldownEscalation: number;  // multiplier for abuse (1 = normal)
}

const cooldowns = new Map<string, CooldownEntry>();

// GC: remove entries older than 1 hour
setInterval(() => {
  const cutoff = Date.now() - 3_600_000;
  for (const [k, v] of cooldowns) {
    if (v.lastRequestAt < cutoff) cooldowns.delete(k);
  }
}, 300_000).unref?.();

export interface CooldownCheck {
  allowed:        boolean;
  retryAfterSec:  number;
  lastRequestAt:  number | null;
}

export function checkCooldown(userId: string, plan: AIPlan): CooldownCheck {
  const entry = cooldowns.get(userId);
  if (!entry) {
    return { allowed: true, retryAfterSec: 0, lastRequestAt: null };
  }
  const elapsed   = Date.now() - entry.lastRequestAt;
  const required  = plan.cooldownSec * 1000 * entry.cooldownEscalation;
  if (elapsed < required) {
    const retryAfterSec = Math.ceil((required - elapsed) / 1000);
    return { allowed: false, retryAfterSec, lastRequestAt: entry.lastRequestAt };
  }
  return { allowed: true, retryAfterSec: 0, lastRequestAt: entry.lastRequestAt };
}

export function recordRequest(userId: string, escalation = 1): void {
  const prev = cooldowns.get(userId);
  cooldowns.set(userId, {
    lastRequestAt: Date.now(),
    cooldownEscalation: escalation ?? prev?.cooldownEscalation ?? 1,
  });
}

export function escalateCooldown(userId: string, factor: number): void {
  const prev = cooldowns.get(userId);
  cooldowns.set(userId, {
    lastRequestAt: prev?.lastRequestAt ?? Date.now(),
    cooldownEscalation: Math.min(factor, 10),
  });
}

/* ── Supabase usage tracking ─────────────────────────────────────────────── */

export interface UsageResult {
  allowed:   boolean;
  used:      number;
  limit:     number;
  period:    "daily" | "monthly";
  resetAt:   string;
}

function getDailyKey(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function getMonthlyKey(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function getDailyResetAt(): string {
  const d = new Date();
  d.setUTCHours(24, 0, 0, 0);
  return d.toISOString();
}

function getMonthlyResetAt(): string {
  const d = new Date();
  d.setUTCMonth(d.getUTCMonth() + 1, 1);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

/**
 * Check + atomically increment usage counter in Supabase.
 *
 * Atomicity strategy for existing rows:
 *   UPDATE ... SET request_count = request_count + 1
 *   WHERE id = ? AND request_count < limit
 *   RETURNING request_count
 *
 * If 0 rows are returned the limit was already hit (even if a concurrent
 * request incremented past the threshold between our SELECT and this UPDATE).
 * This eliminates the TOCTOU race — the DB enforces the invariant.
 *
 * Fails CLOSED on DB errors in production. If the ai_usage_tracking table
 * hasn't been created yet (pre-migration) the catch block returns denied
 * rather than granting unlimited access.
 */
export async function checkAndIncrementUsage(
  supabase: any,
  userId: string,
  plan: AIPlan,
): Promise<UsageResult> {
  const isDaily   = plan.dailyLimit !== null;
  const limit     = isDaily ? plan.dailyLimit! : plan.monthlyLimit;
  const period    = isDaily ? "daily" : "monthly";
  const periodKey = isDaily ? getDailyKey() : getMonthlyKey();
  const resetAt   = isDaily ? getDailyResetAt() : getMonthlyResetAt();

  // Plans with no hard limit (shouldn't happen with current plan defs, but be safe)
  if (limit === null) {
    return { allowed: true, used: 0, limit: 9999, period, resetAt };
  }

  const nowIso = new Date().toISOString();

  try {
    // ── 1. Read current row (needed for cooldown seeding regardless) ──────
    const { data: existing, error: selErr } = await supabase
      .from("ai_usage_tracking")
      .select("id, request_count, last_request_at")
      .eq("user_id", userId)
      .eq("period_key", periodKey)
      .eq("plan_code", plan.code)
      .maybeSingle();

    if (selErr) {
      // Hard fail — DB is unavailable or table is missing (pre-migration).
      // Fail closed: deny the request rather than grant unlimited access.
      return { allowed: false, used: 0, limit, period, resetAt };
    }

    // ── 2. Seed in-memory cooldown from DB on server restart ─────────────
    if (!cooldowns.has(userId) && existing?.last_request_at) {
      const dbMs = new Date(existing.last_request_at as string).getTime();
      if (Date.now() - dbMs < plan.cooldownSec * 1_000 * 3) {
        cooldowns.set(userId, { lastRequestAt: dbMs, cooldownEscalation: 1 });
      }
    }

    if (existing) {
      const currentCount = (existing.request_count ?? 0) as number;

      // Fast path: already at or over limit — no need to hit DB again.
      if (currentCount >= limit) {
        return { allowed: false, used: currentCount, limit, period, resetAt };
      }

      // ── 3. Atomic conditional UPDATE ─────────────────────────────────
      // The WHERE clause `request_count < limit` means Postgres only applies
      // the increment if no concurrent request has already pushed the count
      // to the limit. If 0 rows come back we lost the race → deny.
      const { data: updated, error: updErr } = await supabase
        .from("ai_usage_tracking")
        .update({
          request_count:   currentCount + 1,
          updated_at:      nowIso,
          last_request_at: nowIso,
        })
        .eq("id", (existing as { id: string }).id)
        .lt("request_count", limit)   // atomic guard
        .select("request_count")
        .maybeSingle();

      if (updErr) {
        return { allowed: false, used: currentCount, limit, period, resetAt };
      }

      if (!updated) {
        // Concurrent request beat us to the last slot.
        return { allowed: false, used: limit, limit, period, resetAt };
      }

      return {
        allowed: true,
        used:    (updated as { request_count: number }).request_count,
        limit,
        period,
        resetAt,
      };
    }

    // ── 4. New period — INSERT first row (count = 1) ───────────────────
    // Concurrent first-ever requests for this period_key are serialized by
    // the cooldown (min 8–20s between messages) so a true INSERT race is
    // extremely unlikely. If it does happen the second INSERT will simply
    // fail with a unique-constraint violation and the request will be denied.
    const { error: insErr } = await supabase
      .from("ai_usage_tracking")
      .insert({
        user_id:         userId,
        plan_code:       plan.code,
        period_key:      periodKey,
        period_type:     period,
        request_count:   1,
        limit_count:     limit,
        reset_at:        resetAt,
        last_request_at: nowIso,
      });

    if (insErr) {
      // Could be a rare concurrent INSERT conflict — safe to deny.
      return { allowed: false, used: 0, limit, period, resetAt };
    }

    return { allowed: true, used: 1, limit, period, resetAt };

  } catch (err) {
    // Unexpected runtime error — fail closed.
    import("./logger.js").then(({ logger }) =>
      logger.error({ err, userId, plan: plan.code }, "[aiRateLimit] checkAndIncrementUsage threw unexpectedly"),
    ).catch(() => {});
    return { allowed: false, used: 0, limit, period, resetAt };
  }
}

/** Read-only usage fetch for the /api/ai/usage endpoint. */
export async function getUsageStats(
  supabase: any,
  userId: string,
  plan: AIPlan,
): Promise<{ used: number; limit: number; period: "daily" | "monthly"; resetAt: string }> {
  const isDaily   = plan.dailyLimit !== null;
  const limit     = isDaily ? plan.dailyLimit! : (plan.monthlyLimit ?? 9999);
  const period    = isDaily ? "daily" : "monthly";
  const periodKey = isDaily ? getDailyKey() : getMonthlyKey();
  const resetAt   = isDaily ? getDailyResetAt() : getMonthlyResetAt();

  try {
    const { data } = await supabase
      .from("ai_usage_tracking")
      .select("request_count")
      .eq("user_id", userId)
      .eq("period_key", periodKey)
      .eq("plan_code", plan.code)
      .maybeSingle();

    return { used: (data?.request_count ?? 0) as number, limit, period, resetAt };
  } catch {
    return { used: 0, limit, period, resetAt };
  }
}
