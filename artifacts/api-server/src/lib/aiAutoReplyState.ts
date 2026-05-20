/**
 * aiAutoReplyState.ts — singleton state for the AI auto-reply feature.
 * Lives in memory; fast reads, zero DB overhead on the hot path.
 */

export const ADMIN_EMAIL = "allanalbacen5@gmail.com";

/** How long after the admin manually sends a message before AI takes over again. */
const TAKEOVER_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes

/** If no heartbeat in this window the owner is considered offline. */
const OWNER_ONLINE_TIMEOUT_MS = 45_000; // 45 s (3 × 15 s heartbeat)

export type AiReplyMode = "online" | "offline";

interface AiAutoReplyState {
  enabled:              boolean;
  mode:                 AiReplyMode;
  lastAdminActivityAt:  number;        // unix ms — set whenever admin sends a message
  adminUserId:          string | null; // cached after first lookup
  /** Real-time owner presence — true = app is open and owner is active */
  ownerOnline:          boolean;
  /** Timestamp of the last heartbeat received from the owner */
  ownerLastHeartbeatAt: number;
}

export const aiState: AiAutoReplyState = {
  enabled:              false,
  mode:                 "offline",
  lastAdminActivityAt:  0,
  adminUserId:          null,
  ownerOnline:          false,
  ownerLastHeartbeatAt: 0,
};

/** Call whenever the admin manually sends a message (online-mode takeover). */
export function markAdminActive(): void {
  aiState.lastAdminActivityAt = Date.now();
}

/** True if the admin has been manually active within the cooldown window. */
export function isAdminActive(): boolean {
  return Date.now() - aiState.lastAdminActivityAt < TAKEOVER_COOLDOWN_MS;
}

/**
 * Update owner real-time presence.
 * Called by the presence/heartbeat endpoint for every owner ping.
 */
export function setOwnerOnline(online: boolean): void {
  aiState.ownerOnline          = online;
  aiState.ownerLastHeartbeatAt = Date.now();
}

/**
 * Derives the effective owner-online state, accounting for stale heartbeats.
 * If the last heartbeat was > 45 s ago, treat the owner as offline even if
 * the flag was never explicitly cleared (e.g. browser crash / hard close).
 */
export function isOwnerEffectivelyOnline(): boolean {
  if (!aiState.ownerOnline) return false;
  return Date.now() - aiState.ownerLastHeartbeatAt < OWNER_ONLINE_TIMEOUT_MS;
}

/**
 * Returns true when the AI should auto-reply to an incoming message.
 *
 * Presence-aware logic:
 *  - AI disabled              → never reply
 *  - "offline" mode (manual)  → always reply (full auto, ignores presence)
 *  - "online" mode + owner ONLINE  → hybrid: yield if owner typed recently
 *  - "online" mode + owner OFFLINE → full auto: AI always replies
 */
export function shouldAiReply(): boolean {
  if (!aiState.enabled) return false;

  // Manual "offline" mode → always full auto regardless of presence
  if (aiState.mode === "offline") return true;

  // "online" mode — check real-time owner presence
  if (isOwnerEffectivelyOnline()) {
    // Owner is at their device — give them a window to reply themselves
    return !isAdminActive();
  }

  // Owner is offline/away → AI takes over
  return true;
}
