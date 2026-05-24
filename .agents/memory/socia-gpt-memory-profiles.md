---
name: Socia GPT memory profiles
description: Architecture rules for the per-profile persistent memory system in Socia GPT (chat).
---

# Socia GPT — per-profile persistent memory

Five profiles (`assistant` / `creative` / `coding` / `cinematic` / `business`)
are orthogonal to the existing `mode` (industry/output-format steering).
Each (user, profile) gets one row in `socia_gpt_memory` holding a compact
text summary that the chat route injects into the system prompt.

## Inviolable rules

1. **Memory failures NEVER block chat.** Both the read path (`readMemory`
   in chat route) and the write path (`/memory/snapshot` endpoint) wrap
   in try/catch and return `{ok:true, skipped:true}` on failure. If you
   add a new failure mode, preserve this contract — a Supabase outage
   or Grok cooldown must degrade gracefully, not surface as a chat error.

2. **`buildSystemPrompt` must remain byte-identical for default callers.**
   The new signature accepts either a `SociaGptMode` string (legacy) or
   `{mode, profile, memory}`. For `profile === "assistant"` and empty
   `memory`, the output must equal the old `buildSystemPrompt(mode)`.
   The persona block and memory block are only appended when non-default
   / non-empty. Don't change this without a coordinated client update.

3. **Snapshot `turn_count` is LIFETIME, not slim-window.** The client
   sends `totalUserTurns` (count across the full conversation) alongside
   the slim 30-turn transcript. The server prefers that value and only
   falls back to deriving from the slim window if it's missing. If you
   change the snapshot payload shape, keep this — without it, the
   per-profile `turnsSinceSnapshot` cadence comparison goes wrong.

4. **Cadence is periodic, NOT per-message.** `SNAPSHOT_EVERY_N_TURNS = 10`
   (mirrored in both client and server constants). User constraint:
   "do NOT summarize every message". Auto-trigger lives in `streamChat`'s
   done handler. Also triggered (best-effort) before chat clear, gated
   on `!busy` so we never persist a half-streamed assistant reply.

5. **Profile isolation is enforced by composite PK `(user_id, profile)`.**
   `resetMemory(profile)` deletes only one row. Don't add a "reset all
   memory" path that wipes other profiles without an explicit user
   confirmation per profile — the user explicitly asked for easy reset
   AND profile isolation.

## DB / RLS shape

Table: `public.socia_gpt_memory` (migration 40). RLS: SELECT + DELETE
gated to `auth.uid() = user_id`. INSERT/UPDATE have NO client policy —
writes happen server-side via service-role only.

## Where the wiring lives

- Server profiles + constants: `src/lib/sociaGptProfiles.ts`
- Server memory I/O: `src/lib/memoryStore.ts` (service-role)
- Server routes: `src/routes/sociaGptMemory.ts` (GET/POST/DELETE)
- System prompt assembly: `src/lib/sociaGptSystem.ts` (`buildSystemPrompt`)
- Client store + API helpers: `artifacts/socia/src/lib/sociaGptClient.ts`
- Header UI (ProfilePill + dropdown): `artifacts/socia/src/pages/SociaGpt.tsx`

## Why not split chat history per profile

Considered; rejected. The user constraint was "do NOT break existing
message history". Splitting the persisted list per profile would force
a destructive migration of the v0 zustand store. We kept history
shared and made only memory profile-isolated. The persist version was
bumped v0→v1 with a defensive migrate that explicitly preserves
`messages` and `mode`.
