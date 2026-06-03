/**
 * alertsToggle.test.ts — the owner's persisted alert on/off toggle must truly
 * govern whether dispatchAlert sends, INDEPENDENTLY of channel configuration.
 *
 * Invariant under test (Task: "Let the owner manage alert settings from the
 * dashboard"): setAlertsEnabledOverride(false) mutes every channel even when a
 * channel is armed; setAlertsEnabledOverride(true) re-arms delivery; resetting
 * to null falls back to the ALERTS_ENABLED env default. The toggle never throws.
 *
 * These modules are env-free at import time (store + alerts import only fs,
 * registry and the logger), so they can be imported statically. getAlertConfig
 * reads process.env at CALL time, which the test controls. Node runs each test
 * file in its own process, so the fetch stub here does not leak to other files.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { dispatchAlert } from "./alerts.js";
import { getAlertsEnabledOverride, setAlertsEnabledOverride } from "./store.js";

const realFetch = globalThis.fetch;
let attemptedSends = 0;

const TEST_ALERT = {
  kind: "down" as const,
  topic: "status" as const,
  providerId: "paymongo",
  label: "Test",
  status: "OUTAGE" as const,
  message: "toggle test",
  at: new Date().toISOString(),
};

before(() => {
  // Arm a single channel (webhook) so "muted" can only come from the toggle,
  // not from a missing channel.
  process.env["ALERT_WEBHOOK_URL"] = "https://example.test/hook";
  // Count every outbound channel call and always succeed.
  globalThis.fetch = (async () => {
    attemptedSends += 1;
    return new Response("ok", { status: 200 });
  }) as typeof fetch;
});

after(() => {
  globalThis.fetch = realFetch;
  delete process.env["ALERT_WEBHOOK_URL"];
  delete process.env["ALERTS_ENABLED"];
  setAlertsEnabledOverride(null);
});

test("override=false mutes delivery even when a channel is armed", async () => {
  setAlertsEnabledOverride(false);
  attemptedSends = 0;
  const r = await dispatchAlert(TEST_ALERT);
  assert.equal(r.attempted, 0, "no channel should be attempted when muted");
  assert.equal(r.delivered, 0);
  assert.equal(attemptedSends, 0, "fetch must not be called when alerts are off");
});

test("override=true delivers to the armed channel", async () => {
  setAlertsEnabledOverride(true);
  attemptedSends = 0;
  const r = await dispatchAlert(TEST_ALERT);
  assert.equal(r.attempted, 1, "the armed webhook channel should be attempted");
  assert.equal(r.delivered, 1);
  assert.equal(attemptedSends, 1);
});

test("override=null follows the ALERTS_ENABLED env default (enabled)", async () => {
  setAlertsEnabledOverride(null);
  delete process.env["ALERTS_ENABLED"]; // unset => default enabled
  attemptedSends = 0;
  const r = await dispatchAlert(TEST_ALERT);
  assert.equal(r.attempted, 1);
  assert.equal(getAlertsEnabledOverride(), null);
});

test("override=null with ALERTS_ENABLED=false stays muted", async () => {
  setAlertsEnabledOverride(null);
  process.env["ALERTS_ENABLED"] = "false";
  attemptedSends = 0;
  const r = await dispatchAlert(TEST_ALERT);
  assert.equal(r.attempted, 0);
  assert.equal(r.delivered, 0);
});

test("dispatchAlert never throws regardless of toggle state", async () => {
  setAlertsEnabledOverride(false);
  await assert.doesNotReject(() => dispatchAlert(TEST_ALERT));
});
