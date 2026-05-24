---
name: Grok routing resilience (Socia GPT)
description: First-byte timeout, breaker accounting, and retry-scope rules for the Grok→OpenAI fallback chain in Socia GPT.
---

# Grok routing resilience

The Socia GPT SSE route runs a fallback chain (Grok primary → Grok Fast safety net → OpenAI final). Three subtle correctness rules govern it; violate any of them and you get either silent stalls or a cooldown that trips on user behavior instead of real failures.

## 1. First-byte timeout must outlive `create()`

The OpenAI SDK's `chat.completions.create({stream:true})` resolves **immediately** with an `AsyncIterable` — the provider hasn't sent any data yet. A timer that wraps only the `create()` call therefore protects nothing; the actual first-byte latency happens during the first `for await` iteration.

**Rule:** the per-attempt `AbortController` and its timer stay alive until the first non-empty `delta.content` chunk is observed. Only then `clearTimeout(firstByteTimer)`. Aborting the controller mid-iteration makes the SDK throw on the next read, which the catch handles normally.

**Why:** without this, a provider that opens the HTTP stream but never produces tokens will hang for the full HTTP idle timeout (minutes), past any user patience and past our claimed 8s budget.

## 2. Client-aborts must not poison the breaker

The route has a module-level `aborted` flag set by `req.on("close", ...)`. When the user closes the tab, our own `ac.abort()` in the for-await loop causes the SDK to throw an `AbortError` — which would otherwise look identical to a provider failure and call `recordGrokFail(err)`.

**Rule:** every catch in the attempt loop checks `if (aborted) break outer;` **before** any `recordGrokFail` call. Same for the "empty stream" branch.

**Why:** without this, a user who reloads the tab three times in a row trips the 60s Grok cooldown for everyone on that process. The breaker should only count *provider* failures (timeouts, 5xx, malformed responses).

## 3. Retry-once is Grok Smart only

Retries inflate end-to-end latency when the next fallback would be faster. Grok Smart genuinely benefits (cold-start prone, no cheap equivalent until OpenAI gpt-4o). Grok Fast and OpenAI do not.

**Rule:** `attempt.retries = (provider === "xai" && tier === "smart") ? 1 : 0`. Falling through to the next attempt is preferred over retrying the same one for Fast tier.

**Why:** if Grok Fast is timing out, retrying it costs another 8s before users get an answer from OpenAI that would have arrived in ~1s.

## How to apply

When touching `routes/sociaGpt.ts` attempt loop:
- Keep the `outer:` label — `continue outer` / `break outer` are the only way nested retry + fallback control flow stays readable.
- Always pair `setTimeout(firstByteTimer)` with `clearTimeout` in **every** exit path (success, abort, catch, empty-stream). Easy to leak.
- The `committed` boolean (set on first byte) is what distinguishes "safe to fall through" from "tokens already on the wire, must surface error" — don't conflate it with `firstByteSeen`.
