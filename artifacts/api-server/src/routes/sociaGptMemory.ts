/**
 * Socia GPT — memory endpoints (per-profile, owner-scoped).
 *
 *   GET    /api/socia-gpt/memory/:profile   → current snapshot for display
 *   POST   /api/socia-gpt/memory/snapshot   → generate + persist a new snapshot
 *   DELETE /api/socia-gpt/memory/:profile   → wipe this profile's memory
 *
 * Snapshots use Grok Fast only (cheap, no second AI dependency). If Grok
 * is unavailable or in cooldown, the endpoint returns { skipped: true }
 * with HTTP 200 so the client's auto-snapshot fire-and-forget doesn't
 * surface noise.
 */
import { Router } from "express";
import { requireAuth, getAuthedUser } from "../lib/replitAuth.js";
import { getGrok, GROK_FAST, shouldSkipGrok } from "../lib/grokClient.js";
import { readMemory, writeMemory, resetMemory } from "../lib/memoryStore.js";
import {
  VALID_PROFILES, PROFILE_PERSONAS, MEMORY_MAX_CHARS,
  type SociaGptProfile,
} from "../lib/sociaGptProfiles.js";
import { logger } from "../lib/logger.js";

const router = Router();

const SNAPSHOT_MAX_INPUT_MESSAGES = 30;
const SNAPSHOT_MAX_TOKENS         = 600;

/* ─── GET /api/socia-gpt/memory/:profile ────────────────────────────── */
router.get("/api/socia-gpt/memory/:profile", requireAuth, async (req, res) => {
  const user = getAuthedUser(req);
  if (!user) { res.status(401).json({ error: "unauthorized" }); return; }

  const profile = req.params["profile"] as SociaGptProfile;
  if (!VALID_PROFILES.has(profile)) {
    res.status(400).json({ error: "invalid profile" }); return;
  }

  const row = await readMemory(user.id, profile);
  res.json({
    profile,
    summary:        row?.summary ?? "",
    turnCount:      row?.turn_count ?? 0,
    snapshotAtTurn: row?.snapshot_at_turn ?? 0,
    updatedAt:      row?.updated_at ?? null,
  });
});

/* ─── DELETE /api/socia-gpt/memory/:profile ─────────────────────────── */
router.delete("/api/socia-gpt/memory/:profile", requireAuth, async (req, res) => {
  const user = getAuthedUser(req);
  if (!user) { res.status(401).json({ error: "unauthorized" }); return; }

  const profile = req.params["profile"] as SociaGptProfile;
  if (!VALID_PROFILES.has(profile)) {
    res.status(400).json({ error: "invalid profile" }); return;
  }

  await resetMemory(user.id, profile);
  res.json({ ok: true });
});

/* ─── POST /api/socia-gpt/memory/snapshot ───────────────────────────── */
router.post("/api/socia-gpt/memory/snapshot", requireAuth, async (req, res) => {
  const user = getAuthedUser(req);
  if (!user) { res.status(401).json({ error: "unauthorized" }); return; }

  const body     = (req.body ?? {}) as Record<string, unknown>;
  const profile  = body["profile"] as SociaGptProfile;
  const rawMsgs  = body["messages"];

  if (!VALID_PROFILES.has(profile)) {
    res.status(400).json({ error: "invalid profile" }); return;
  }
  if (!Array.isArray(rawMsgs) || rawMsgs.length === 0) {
    res.status(400).json({ error: "messages required" }); return;
  }

  // Cheap availability gate. If Grok is unavailable we just no-op — the
  // existing memory row (if any) is still injected into future prompts.
  const grok = getGrok();
  if (!grok || shouldSkipGrok()) {
    res.json({ ok: true, skipped: true, reason: "grok-unavailable" });
    return;
  }

  // Convert the tail of the conversation to plain text for summarization.
  const tail = rawMsgs.slice(-SNAPSHOT_MAX_INPUT_MESSAGES) as Array<{ role?: unknown; content?: unknown }>;
  const transcript = tail.map((m) => {
    const role = m.role === "user" ? "User" : "Assistant";
    const text = typeof m.content === "string" ? m.content.slice(0, 1000) : "";
    return `${role}: ${text}`;
  }).filter((l) => l.length > 0).join("\n\n");
  if (transcript.length === 0) {
    res.json({ ok: true, skipped: true, reason: "empty-transcript" });
    return;
  }

  // Prefer the client-provided lifetime turn count when present; fall back
  // to deriving it from the slim window (smaller, but never wrong-direction).
  const rawTotal  = body["totalUserTurns"];
  const turnCount = typeof rawTotal === "number" && rawTotal > 0
    ? Math.min(rawTotal, 100_000)
    : rawMsgs.filter((m: { role?: unknown }) => m.role === "user").length;
  const existing  = await readMemory(user.id, profile);
  const personaLabel = PROFILE_PERSONAS[profile].label;

  // Memory snapshot prompt. Deliberately strict so the model returns a
  // compact paragraph, not a transcript echo or a "Sure! Here's…" preamble.
  const prompt = [
    existing?.summary ? `PREVIOUS MEMORY:\n${existing.summary}\n` : "",
    `RECENT CONVERSATION (${personaLabel} profile):\n${transcript}\n`,
    `\nUpdate the memory snapshot for this user's ${personaLabel} profile.`,
    `Output ONLY a compact paragraph (max 200 words, max ${MEMORY_MAX_CHARS} chars) capturing DURABLE facts that should persist across sessions:`,
    `- Preferences, goals, recurring topics, names, ongoing projects, style choices, technical stack.`,
    `- Merge with PREVIOUS MEMORY when present — keep what's still relevant, drop what's outdated.`,
    `- Speak in third person ("The user is…", "The user prefers…").`,
    `- Do NOT include the conversation transcript, greetings, filler, or meta-commentary.`,
    `- Do NOT start with "Sure", "Here is", "Memory:", etc. Just the paragraph.`,
  ].filter(Boolean).join("\n");

  try {
    const completion = await grok.chat.completions.create({
      model:       GROK_FAST,
      max_tokens:  SNAPSHOT_MAX_TOKENS,
      temperature: 0.2,
      messages: [{ role: "user", content: prompt }],
    });
    const summary = (completion.choices?.[0]?.message?.content ?? "")
      .trim()
      .slice(0, MEMORY_MAX_CHARS);

    if (summary.length === 0) {
      res.json({ ok: true, skipped: true, reason: "empty-summary" });
      return;
    }

    await writeMemory(user.id, profile, summary, turnCount);
    res.json({ ok: true, summary, turnCount });
  } catch (err) {
    logger.warn(
      { err: (err as Error).message, userId: user.id, profile },
      "[sociaGptMemory] snapshot generation failed",
    );
    // Snapshot failure must NEVER break chat — return 200 with skipped flag.
    res.json({ ok: true, skipped: true, reason: "generation-failed" });
  }
});

export default router;
