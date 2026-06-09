/**
 * Socia GPT memory store — Drizzle/PostgreSQL implementation.
 */
import { db, schema } from "./db.js";
import { and, eq } from "drizzle-orm";
import { logger } from "./logger.js";
import {
  VALID_PROFILES, MEMORY_MAX_CHARS,
  type SociaGptProfile,
} from "./sociaGptProfiles.js";

const { sociaGptMemory } = schema;

export interface MemoryRow {
  user_id:          string;
  profile:          SociaGptProfile;
  summary:          string;
  turn_count:       number;
  snapshot_at_turn: number;
  updated_at:       string;
}

export async function readMemory(
  userId: string, profile: SociaGptProfile,
): Promise<MemoryRow | null> {
  if (!VALID_PROFILES.has(profile)) return null;
  try {
    const rows = await db
      .select()
      .from(sociaGptMemory)
      .where(and(eq(sociaGptMemory.userId, userId), eq(sociaGptMemory.profile, profile)))
      .limit(1);
    if (!rows.length) return null;
    const r = rows[0]!;
    return {
      user_id:          r.userId,
      profile:          r.profile as SociaGptProfile,
      summary:          r.summary,
      turn_count:       r.turnCount,
      snapshot_at_turn: r.snapshotAtTurn,
      updated_at:       r.updatedAt?.toISOString() ?? new Date().toISOString(),
    };
  } catch (err) {
    logger.warn({ err, userId, profile }, "[memoryStore] read failed");
    return null;
  }
}

export async function writeMemory(
  userId: string, profile: SociaGptProfile,
  summary: string, turnCount: number,
): Promise<void> {
  if (!VALID_PROFILES.has(profile)) return;
  const trimmed = summary.trim().slice(0, MEMORY_MAX_CHARS);
  if (trimmed.length === 0) return;
  try {
    await db
      .insert(sociaGptMemory)
      .values({
        userId,
        profile,
        summary:         trimmed,
        turnCount,
        snapshotAtTurn:  turnCount,
        updatedAt:       new Date(),
      })
      .onConflictDoUpdate({
        target: [sociaGptMemory.userId, sociaGptMemory.profile],
        set: {
          summary:        trimmed,
          turnCount,
          snapshotAtTurn: turnCount,
          updatedAt:      new Date(),
        },
      });
  } catch (err) {
    logger.warn({ err, userId, profile }, "[memoryStore] write failed");
  }
}

export async function resetMemory(
  userId: string, profile: SociaGptProfile,
): Promise<void> {
  if (!VALID_PROFILES.has(profile)) return;
  try {
    await db
      .delete(sociaGptMemory)
      .where(and(eq(sociaGptMemory.userId, userId), eq(sociaGptMemory.profile, profile)));
  } catch (err) {
    logger.warn({ err, userId, profile }, "[memoryStore] reset failed");
  }
}
