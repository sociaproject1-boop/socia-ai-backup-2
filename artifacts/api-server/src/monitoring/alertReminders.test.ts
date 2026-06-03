/**
 * alertReminders.test.ts — optional re-notify cadence for long-running incidents
 * (Task: "Stop repeat alerts from piling up during long outages").
 *
 * Invariants under test:
 *   - Default OFF: with no ALERT_REMIND_EVERY_HOURS, an already-notified open
 *     incident stays silent on later sweeps (one alert per incident).
 *   - Opt-in: with reminders enabled, a still-open incident re-notifies only
 *     after a full interval has elapsed since the last send — never per-sweep.
 *   - The reminder REUSES the same incident record (same openedAt, no duplicate
 *     "down"); the payload is flagged `reminder: true`.
 *   - A channel failure on a reminder never throws and is retried next sweep.
 *
 * These modules read process.env at call time and persist incidents to the
 * store; Node runs each test file in its own process, so env + fetch stubs and
 * store mutations here do not leak to other files.
 */
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { evaluateAndDispatch } from "./alerts.js";
import { clearAlertIncident, getAlertIncident, setAlertsEnabledOverride } from "./store.js";
import type { ProviderHealth } from "./types.js";

const realFetch = globalThis.fetch;
const KEY = "paymongo:status";

/** Captured webhook payloads (the generic webhook spreads the AlertPayload). */
let sentBodies: Array<Record<string, unknown>> = [];
let failNext = false;

function outage(at: string): ProviderHealth {
  return {
    id: "paymongo",
    label: "PayMongo",
    category: "payment",
    configured: true,
    status: "OUTAGE",
    message: "probe failed",
    responseMs: null,
    lastChecked: at,
  };
}

before(() => {
  process.env["ALERT_WEBHOOK_URL"] = "https://example.test/hook";
  setAlertsEnabledOverride(true);
  globalThis.fetch = (async (_url: string, init?: RequestInit) => {
    if (failNext) {
      failNext = false;
      return new Response("nope", { status: 500 });
    }
    try {
      sentBodies.push(JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>);
    } catch {
      sentBodies.push({});
    }
    return new Response("ok", { status: 200 });
  }) as typeof fetch;
});

after(() => {
  globalThis.fetch = realFetch;
  delete process.env["ALERT_WEBHOOK_URL"];
  delete process.env["ALERT_REMIND_EVERY_HOURS"];
  setAlertsEnabledOverride(null);
  clearAlertIncident(KEY);
});

beforeEach(() => {
  sentBodies = [];
  failNext = false;
  clearAlertIncident(KEY);
  delete process.env["ALERT_REMIND_EVERY_HOURS"];
});

test("default OFF: an already-notified incident stays silent on later sweeps", async () => {
  const t0 = new Date("2026-06-03T00:00:00.000Z").toISOString();
  await evaluateAndDispatch(outage(t0)); // initial DOWN alert
  assert.equal(sentBodies.length, 1, "initial alert should fire");
  assert.equal(sentBodies[0]!["reminder"], false);

  // Five hours later, still down, but no cadence configured → no reminder.
  const t5h = new Date("2026-06-03T05:00:00.000Z").toISOString();
  await evaluateAndDispatch(outage(t5h));
  assert.equal(sentBodies.length, 1, "no reminder when ALERT_REMIND_EVERY_HOURS is unset");
});

test("opt-in: reminder fires only after a full interval elapses", async () => {
  process.env["ALERT_REMIND_EVERY_HOURS"] = "2";
  const t0 = new Date("2026-06-03T00:00:00.000Z").toISOString();
  await evaluateAndDispatch(outage(t0));
  assert.equal(sentBodies.length, 1, "initial alert");

  // 1h later: under the 2h cadence → still silent.
  await evaluateAndDispatch(outage(new Date("2026-06-03T01:00:00.000Z").toISOString()));
  assert.equal(sentBodies.length, 1, "no reminder before the interval elapses");

  // 2h later: cadence elapsed → one reminder, reusing the same incident.
  const t2h = new Date("2026-06-03T02:00:00.000Z").toISOString();
  await evaluateAndDispatch(outage(t2h));
  assert.equal(sentBodies.length, 2, "reminder fires once the interval has elapsed");
  assert.equal(sentBodies[1]!["reminder"], true, "second send is flagged as a reminder");
  assert.equal(sentBodies[1]!["openedAt"], t0, "reminder reuses the original openedAt");

  const inc = getAlertIncident(KEY);
  assert.ok(inc, "incident still open after reminder");
  assert.equal(inc!.openedAt, t0, "openedAt unchanged (record reused, not duplicated)");
  assert.equal(inc!.notifiedAt, t2h, "cadence clock reset to the reminder time");
});

test("reminder cadence does not re-fire every sweep", async () => {
  process.env["ALERT_REMIND_EVERY_HOURS"] = "2";
  const t0 = new Date("2026-06-03T00:00:00.000Z").toISOString();
  await evaluateAndDispatch(outage(t0));
  await evaluateAndDispatch(outage(new Date("2026-06-03T02:00:00.000Z").toISOString())); // reminder #1
  // Two sweeps 5 min apart, both within the next interval → still silent.
  await evaluateAndDispatch(outage(new Date("2026-06-03T02:05:00.000Z").toISOString()));
  await evaluateAndDispatch(outage(new Date("2026-06-03T02:10:00.000Z").toISOString()));
  assert.equal(sentBodies.length, 2, "no per-sweep spam between reminders");

  // Another full interval later → reminder #2.
  await evaluateAndDispatch(outage(new Date("2026-06-03T04:00:00.000Z").toISOString()));
  assert.equal(sentBodies.length, 3, "next reminder after another full interval");
});

test("fractional cadence (0.5h) is honored", async () => {
  process.env["ALERT_REMIND_EVERY_HOURS"] = "0.5";
  const t0 = new Date("2026-06-03T00:00:00.000Z").toISOString();
  await evaluateAndDispatch(outage(t0));
  // 20 min later: under 30 min → silent.
  await evaluateAndDispatch(outage(new Date("2026-06-03T00:20:00.000Z").toISOString()));
  assert.equal(sentBodies.length, 1, "no reminder before 30 min");
  // 30 min later: cadence elapsed → reminder.
  await evaluateAndDispatch(outage(new Date("2026-06-03T00:30:00.000Z").toISOString()));
  assert.equal(sentBodies.length, 2, "reminder fires at the 30-min mark");
  assert.equal(sentBodies[1]!["reminder"], true);
});

test("invalid cadence value is treated as OFF", async () => {
  process.env["ALERT_REMIND_EVERY_HOURS"] = "not-a-number";
  const t0 = new Date("2026-06-03T00:00:00.000Z").toISOString();
  await evaluateAndDispatch(outage(t0));
  await evaluateAndDispatch(outage(new Date("2026-06-03T10:00:00.000Z").toISOString()));
  assert.equal(sentBodies.length, 1, "garbage cadence disables reminders (default off)");
});

test("a failed reminder send never throws and is retried next sweep", async () => {
  process.env["ALERT_REMIND_EVERY_HOURS"] = "2";
  const t0 = new Date("2026-06-03T00:00:00.000Z").toISOString();
  await evaluateAndDispatch(outage(t0));
  assert.equal(sentBodies.length, 1);

  // Reminder due, but the channel fails → no throw, notifiedAt left empty.
  failNext = true;
  const t2h = new Date("2026-06-03T02:00:00.000Z").toISOString();
  await assert.doesNotReject(() => evaluateAndDispatch(outage(t2h)));
  const inc = getAlertIncident(KEY);
  assert.equal(inc!.notifiedAt, "", "failed reminder leaves notifiedAt empty for retry");

  // Next sweep retries the notification successfully.
  await evaluateAndDispatch(outage(new Date("2026-06-03T02:05:00.000Z").toISOString()));
  assert.equal(sentBodies.length, 2, "retry delivers after a transient channel failure");
});
