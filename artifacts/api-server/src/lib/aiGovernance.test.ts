/**
 * Unit tests for the AI governance engine's PURE resolution + validation logic.
 *
 * These cover the contract that production routing depends on: defaults are
 * permissive (empty stored config == current behavior), stored partials merge
 * over defaults without breaking untouched features, validateConfig refuses any
 * config that would BREAK generation, and getRoutingChain honors priority order,
 * provider/model enablement, and the failover toggle.
 *
 * No DB is touched — every function under test is pure. Supabase env vars are
 * set defensively because importing the module pulls in adminAuth, which reads
 * them at import time. Provider credential env vars are set so isProviderConfigured
 * returns true and the permissive default validates cleanly.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

process.env["VITE_SUPABASE_URL"] = process.env["VITE_SUPABASE_URL"] ?? "https://test.supabase.co";
process.env["VITE_SUPABASE_ANON_KEY"] = process.env["VITE_SUPABASE_ANON_KEY"] ?? "test-anon-key";

// Credentials so every provider counts as "configured" for validation tests.
process.env["XAI_API_KEY"] = process.env["XAI_API_KEY"] ?? "test-xai";
process.env["OPENAI_API_KEY"] = process.env["OPENAI_API_KEY"] ?? "test-openai";
process.env["FAL_KEY"] = process.env["FAL_KEY"] ?? "test-fal";
process.env["RUNWAY_API_KEY"] = process.env["RUNWAY_API_KEY"] ?? "test-runway";
process.env["PIKA_API_KEY"] = process.env["PIKA_API_KEY"] ?? "test-pika";
process.env["GOOGLE_VERTEX_PROJECT"] = process.env["GOOGLE_VERTEX_PROJECT"] ?? "test-proj";
process.env["GOOGLE_VERTEX_CREDENTIALS_JSON"] =
  process.env["GOOGLE_VERTEX_CREDENTIALS_JSON"] ?? "{}";

const {
  defaultConfig,
  resolveConfig,
  validateConfig,
  getRoutingChain,
  isModelEnabled,
  isProviderEnabled,
  isFeatureEnabled,
} = await import("./aiGovernance.js");

/* ── defaultConfig ──────────────────────────────────────────────────────── */

test("defaultConfig is fully permissive", () => {
  const d = defaultConfig();
  assert.equal(d.killSwitch, false);
  assert.equal(d.autoPause, false);
  assert.equal(d.autoThrottle, false);
  // Every provider on.
  for (const [, v] of Object.entries(d.providers)) assert.equal(v.enabled, true);
  // Every model on.
  for (const [, v] of Object.entries(d.models)) assert.equal(v.enabled, true);
  // Known features present and enabled with a non-empty chain.
  assert.ok(d.features["ai_chat"]);
  assert.equal(d.features["ai_chat"]!.enabled, true);
  assert.ok(d.features["ai_chat"]!.chain.length >= 2);
  assert.equal(d.features["ai_chat"]!.chain[0]!.provider, "xai");
  assert.equal(d.features["video_generation"]!.chain[0]!.provider, "fal");
});

/* ── resolveConfig ──────────────────────────────────────────────────────── */

test("resolveConfig(null) equals defaults", () => {
  assert.deepEqual(resolveConfig(null), defaultConfig());
});

test("resolveConfig disables only the named provider, others stay on", () => {
  const cfg = resolveConfig({ providers: { openai: { enabled: false } } });
  assert.equal(cfg.providers["openai"]!.enabled, false);
  assert.equal(cfg.providers["xai"]!.enabled, true);
  assert.equal(cfg.providers["fal"]!.enabled, true);
});

test("resolveConfig replaces a feature chain but leaves untouched features default", () => {
  const cfg = resolveConfig({
    features: {
      ai_chat: {
        chain: [{ provider: "openai", model: null, enabled: true }],
      },
    },
  });
  // Replaced chain sticks (single hop, openai-first).
  assert.equal(cfg.features["ai_chat"]!.chain.length, 1);
  assert.equal(cfg.features["ai_chat"]!.chain[0]!.provider, "openai");
  // Untouched feature keeps its topology default chain.
  assert.deepEqual(
    cfg.features["video_generation"]!.chain.map((h) => h.provider),
    defaultConfig().features["video_generation"]!.chain.map((h) => h.provider),
  );
});

test("resolveConfig honors killSwitch / autoThrottle flags", () => {
  const cfg = resolveConfig({ killSwitch: true, autoThrottle: true, throttleRpm: 30 });
  assert.equal(cfg.killSwitch, true);
  assert.equal(cfg.autoThrottle, true);
  assert.equal(cfg.throttleRpm, 30);
});

/* ── validateConfig ─────────────────────────────────────────────────────── */

test("validateConfig accepts the permissive default", () => {
  const res = validateConfig(defaultConfig());
  assert.equal(res.ok, true, res.errors.join("; "));
});

test("validateConfig rejects an enabled feature whose only provider is disabled", () => {
  // image_generation only runs on openai; disabling openai leaves no usable hop.
  const res = validateConfig({ providers: { openai: { enabled: false } } });
  assert.equal(res.ok, false);
  assert.ok(res.errors.some((e) => /no usable provider/i.test(e)));
});

test("validateConfig allows disabling a provider if the dependent feature is also disabled", () => {
  const res = validateConfig({
    providers: { openai: { enabled: false } },
    features: {
      image_generation: { enabled: false },
      preset_studio: { enabled: false },
      image_upscale: { enabled: false },
      ai_chat: { chain: [{ provider: "xai", model: null, enabled: true }] },
    },
  });
  assert.equal(res.ok, true, res.errors.join("; "));
});

test("validateConfig rejects an unknown provider in a chain", () => {
  const res = validateConfig({
    features: {
      ai_chat: { chain: [{ provider: "nope" as never, model: null, enabled: true }] },
    },
  });
  assert.equal(res.ok, false);
  assert.ok(res.errors.some((e) => /unknown provider/i.test(e)));
});

test("validateConfig rejects a model not belonging to its provider", () => {
  const res = validateConfig({
    features: {
      ai_chat: { chain: [{ provider: "openai", model: "grok-beta", enabled: true }] },
    },
  });
  assert.equal(res.ok, false);
  assert.ok(res.errors.some((e) => /not a known/i.test(e)));
});

test("validateConfig rejects autoThrottle without a positive rpm", () => {
  const res = validateConfig({ autoThrottle: true, throttleRpm: null });
  assert.equal(res.ok, false);
  assert.ok(res.errors.some((e) => /throttleRpm/i.test(e)));
});

test("validateConfig rejects a negative budget cap", () => {
  const res = validateConfig({ budgets: { global: { dailyPhp: -5, monthlyPhp: null } } });
  assert.equal(res.ok, false);
  assert.ok(res.errors.some((e) => /non-negative/i.test(e)));
});

/* ── getRoutingChain ────────────────────────────────────────────────────── */

test("getRoutingChain returns priority order for a permissive feature", () => {
  const cfg = defaultConfig();
  const chain = getRoutingChain(cfg, "ai_chat");
  assert.deepEqual(chain.map((h) => h.provider), ["xai", "openai"]);
});

test("getRoutingChain drops disabled providers", () => {
  const cfg = resolveConfig({ providers: { xai: { enabled: false } } });
  const chain = getRoutingChain(cfg, "ai_chat");
  assert.deepEqual(chain.map((h) => h.provider), ["openai"]);
});

test("getRoutingChain collapses to first hop when failover is disabled", () => {
  const cfg = resolveConfig({ features: { ai_chat: { failoverEnabled: false } } });
  const chain = getRoutingChain(cfg, "ai_chat");
  assert.equal(chain.length, 1);
  assert.equal(chain[0]!.provider, "xai");
});

test("getRoutingChain is empty when every hop is disabled", () => {
  const cfg = resolveConfig({
    providers: { xai: { enabled: false }, openai: { enabled: false } },
  });
  assert.equal(getRoutingChain(cfg, "ai_chat").length, 0);
});

/* ── small enablement helpers ───────────────────────────────────────────── */

test("isProviderEnabled / isModelEnabled / isFeatureEnabled defaults", () => {
  const cfg = defaultConfig();
  assert.equal(isProviderEnabled(cfg, "openai"), true);
  assert.equal(isModelEnabled(cfg, "openai", "gpt-4o"), true);
  assert.equal(isModelEnabled(cfg, "openai", null), true); // null => provider default
  assert.equal(isFeatureEnabled(cfg, "ai_chat"), true);
});

test("isModelEnabled reflects a disabled model", () => {
  const cfg = resolveConfig({ models: { "openai:gpt-4o": { enabled: false } } });
  assert.equal(isModelEnabled(cfg, "openai", "gpt-4o"), false);
  assert.equal(isModelEnabled(cfg, "openai", "gpt-4o-mini"), true);
});
