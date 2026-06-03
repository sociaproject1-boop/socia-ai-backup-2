/**
 * FAILSAFE invariant tests for probePaymongo().
 *
 * A network error or timeout reaching PayMongo from OUR server is a MONITOR
 * failure, NOT a confirmed PayMongo outage. Such errors must map to UNKNOWN
 * (which keeps checkout enabled), never to OUTAGE. Only a trusted 5xx FROM
 * PayMongo itself is allowed to map to OUTAGE.
 *
 * We stub global.fetch to simulate each transport outcome.
 */
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { probePaymongo } from "./healthChecks.js";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

test("missing key → UNKNOWN (never blocks checkout)", async () => {
  const r = await probePaymongo(undefined);
  assert.equal(r.status, "UNKNOWN");
});

test("network error → UNKNOWN, not OUTAGE (monitor failure is failsafe)", async () => {
  globalThis.fetch = (async () => {
    throw new TypeError("fetch failed");
  }) as typeof fetch;
  const r = await probePaymongo("sk_test_abc");
  assert.equal(r.status, "UNKNOWN");
  assert.notEqual(r.status, "OUTAGE");
  assert.match(r.message, /checkout remains available/i);
});

test("timeout / AbortError → UNKNOWN, not OUTAGE", async () => {
  globalThis.fetch = (async () => {
    const err = new Error("aborted");
    err.name = "AbortError";
    throw err;
  }) as typeof fetch;
  const r = await probePaymongo("sk_test_abc");
  assert.equal(r.status, "UNKNOWN");
  assert.notEqual(r.status, "OUTAGE");
  assert.match(r.message, /timed out/i);
});

test("trusted PayMongo 5xx → OUTAGE (the only probe path that disables checkout)", async () => {
  globalThis.fetch = (async () => new Response("error", { status: 503 })) as typeof fetch;
  const r = await probePaymongo("sk_test_abc");
  assert.equal(r.status, "OUTAGE");
});

test("reachable 2xx → ONLINE", async () => {
  globalThis.fetch = (async () => new Response("{}", { status: 200 })) as typeof fetch;
  const r = await probePaymongo("sk_test_abc");
  assert.equal(r.status, "ONLINE");
});

test("authenticated 401 still counts as reachable → ONLINE (not OUTAGE)", async () => {
  globalThis.fetch = (async () => new Response("unauthorized", { status: 401 })) as typeof fetch;
  const r = await probePaymongo("sk_test_abc");
  assert.equal(r.status, "ONLINE");
  assert.notEqual(r.status, "OUTAGE");
});

test("rate-limited 429 is reachable, not an outage (only 5xx disables checkout)", async () => {
  globalThis.fetch = (async () => new Response("rate limited", { status: 429 })) as typeof fetch;
  const r = await probePaymongo("sk_test_abc");
  assert.notEqual(r.status, "OUTAGE");
  assert.equal(r.status, "ONLINE");
});
