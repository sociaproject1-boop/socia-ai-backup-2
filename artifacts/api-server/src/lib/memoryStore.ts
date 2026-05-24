/**
 * Socia GPT memory store — thin Supabase wrapper using service-role.
 *
 * The chat route reads memory before building the system prompt; the
 * snapshot endpoint writes; the reset endpoint deletes. RLS gates client
 * reads/deletes to owner-only (see migration 40); writes only happen
 * server-side, so we use the service-role client for everything here
 * for consistency.
 */
import { getServiceClient } from "./renderJobsDb.js";
import { logger } from "./logger.js";
import {
  VALID_PROFILES, MEMORY_MAX_CHARS,
  type SociaGptProfile,
} from "./sociaGptProfiles.js";

const TABLE = "socia_gpt_memory";

export interface MemoryRow {
  user_id:          string;
  profile:          SociaGptProfile;
  summary:          string;
  turn_count:       number;
  snapshot_at_turn: number;
  updated_at:       string;
}

/** Read the current memory row for (user, profile), or null if none yet. */
export async function readMemory(
  userId: string, profile: SociaGptProfile,
): Promise<MemoryRow | null> {
  if (!VALID_PROFILES.has(profile)) return null;
  const { data, error } = await getServiceClient()
    .from(TABLE)
    .select("*")
    .eq("user_id", userId)
    .eq("profile", profile)
    .maybeSingle();
  if (error) {
    logger.warn({ err: error.message, userId, profile }, "[memoryStore] read failed");
    return null;
  }
  return (data as MemoryRow | null) ?? null;
}

/**
 * Upsert a memory snapshot. Truncates to MEMORY_MAX_CHARS so a runaway
 * summary can never blow up the row size or token budget.
 */
export async function writeMemory(
  userId: string, profile: SociaGptProfile,
  summary: string, turnCount: number,
): Promise<void> {
  if (!VALID_PROFILES.has(profile)) return;
  const trimmed = summary.trim().slice(0, MEMORY_MAX_CHARS);
  if (trimmed.length === 0) return; // never persist empty summaries
  const { error } = await getServiceClient()
    .from(TABLE)
    .upsert({
      user_id:          userId,
      profile,
      summary:          trimmed,
      turn_count:       turnCount,
      snapshot_at_turn: turnCount,
      updated_at:       new Date().toISOString(),
    }, { onConflict: "user_id,profile" });
  if (error) {
    logger.warn({ err: error.message, userId, profile }, "[memoryStore] write failed");
  }
}

/** Reset (delete) memory for a single profile. Other profiles are untouched. */
export async function resetMemory(
  userId: string, profile: SociaGptProfile,
): Promise<void> {
  if (!VALID_PROFILES.has(profile)) return;
  const { error } = await getServiceClient()
    .from(TABLE)
    .delete()
    .eq("user_id", userId)
    .eq("profile", profile);
  if (error) {
    logger.warn({ err: error.message, userId, profile }, "[memoryStore] reset failed");
  }
}
