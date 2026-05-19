/**
 * aiAutoReplyState.ts — singleton state for the AI auto-reply feature.
 * Lives in memory; fast reads, zero DB overhead on the hot path.
 */

export const ADMIN_EMAIL = "allanalbacen5@gmail.com";

/** How long after the admin manually sends a message before AI takes over again (online mode). */
const TAKEOVER_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes

export type AiReplyMode = "online" | "offline";

interface AiAutoReplyState {
  enabled:             boolean;
  mode:                AiReplyMode;
  lastAdminActivityAt: number;  // unix ms — set whenever admin sends a message
  adminUserId:         string | null;  // cached after first lookup
}

export const aiState: AiAutoReplyState = {
  enabled:             false,
  mode:                "offline",
  lastAdminActivityAt: 0,
  adminUserId:         null,
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
 * Returns true when the AI should auto-reply to an incoming message:
 *  - Feature must be enabled.
 *  - Offline mode  → always reply.
 *  - Online mode   → reply only when admin hasn't been active recently.
 */
export function shouldAiReply(): boolean {
  if (!aiState.enabled) return false;
  if (aiState.mode === "offline") return true;
  return !isAdminActive();
}
