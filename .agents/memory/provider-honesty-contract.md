---
name: Provider honesty contract
description: When a route has both a credit gate and a provider switch, the engine allow-list, env-var aliases, and any mock-fallback catch MUST stay aligned — otherwise users are charged for engines that can't run, or auth failures silently return demo content.
---

# Provider honesty contract — three invariants that must hold together

Whenever a credit-gated route dispatches to multiple AI providers (e.g.
`/render/submit` → `interpolateWithEngine` → fal/runway/veo/pika), three
things have to stay in lockstep. Breaking any one of them silently
charges the user for something we can't deliver, or silently delivers a
demo instead of the real thing.

## 1. Allow-list IDs must equal provider-switch IDs

The pre-gate allow-list (the `ALWAYS_ON_ENGINES` set) must contain
exactly the engine IDs that the provider switch has a real `case` for.
Aliases that "look reasonable" (`kling`, `kling-pro`) but have no
matching case will pass the credit gate, then fail with a
non-refundable error code downstream.

**Why:** the gate consumes credits; the worker classifies
`FAL_INVALID_INPUT` as user-attributable (not refundable). Mismatch =
silent over-charge.

**How to apply:** when adding/removing a provider case, grep for the
allow-list and update it in the same commit. Treat the two lists as
one declaration that happens to live in two files.

## 2. Allow-list env checks must equal the adapter's env reads

If the adapter resolves a key from `ENV_A || ENV_B`, the allow-list
must accept either too. Otherwise a correctly-configured server
rejects requests with `ENGINE_UNAVAILABLE` even though the adapter
would succeed.

**Why:** allow-list mirrors "is this engine runnable right now?".
Asymmetric env coverage breaks that mirror.

**How to apply:** store provider env candidates as an *array* of env
var names in the route, mirroring the adapter's `||` chain. Same
commit, same set.

## 3. Mock fallback in the provider switch must be engine-scoped

A global `catch` that converts `FAL_AUTH`/`FAL_BILLING` into a mock
demo MP4 is fine *only* for the fal.ai-backed engines. Once the switch
also routes to third-party providers (Runway/Veo/Pika), their auth
failures must bubble up — silently returning a demo for a paid
Runway/Veo/Pika call is the worst kind of fake.

**Why:** the mock fallback was originally a UX safety net for missing
`FAL_KEY` in dev. After third-party adapters were added, that net
covers them too unless restricted.

**How to apply:** gate the mock-fallback `catch` on
`FAL_BACKED.has(engine)`. When a new provider lands, do NOT add it to
the fal-backed set; let its real failures surface.

## Bonus — refundable error codes

Any new error code that represents an *operator* failure (missing key,
provider outage, unconfigured account) must be added to
`isRefundableFalCode` in `billing.ts`. The default is non-refundable,
and silent over-charges are the cost of forgetting. `PROVIDER_NOT_CONFIGURED`
is the canonical example.

## Bonus — server-side fetch of user URLs

Provider adapters that need to download a user-supplied keyframe
(because the provider API requires inline base64) must validate the
URL host before fetching: refuse `127.x`, `10.x`, `172.16-31.x`,
`192.168.x`, `169.254.x`, `localhost`, IPv6 `::1` / `fe80::/10` /
`fc00::/7` (= `fc00..fdff`), and `.internal`/`.local` suffixes. The
`/^https?:\/\//` check from input validation is NOT enough — it
doesn't stop SSRF to cloud metadata or internal services.
