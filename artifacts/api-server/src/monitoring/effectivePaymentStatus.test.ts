/**
 * FAILSAFE invariant tests for effectivePaymentStatus().
 *
 * Core guarantee under test: a monitoring failure can NEVER disable checkout.
 * Only a CONFIRMED PayMongo probe result of MAINTENANCE/OUTAGE, or an explicit
 * owner override, may set `checkoutDisabled`. A non-confirmed status (UNKNOWN)
 * — which is what a probe/network failure maps to — must keep checkout open.
 *
 * These are pure state-machine tests: we drive the in-memory store directly
 * (setHealth / setOverride) and assert the derived effective status.
 */
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { effectivePaymentStatus } from "./monitor.js";
import { setHealth, setOverride } from "./store.js";
import type { PaymentOverride, ProviderHealth, StatusLevel } from "./types.js";

function paymongoHealth(status: StatusLevel): ProviderHealth {
  return {
    id: "paymongo",
    label: "PayMongo",
    category: "payment",
    configured: true,
    status,
    message: `paymongo ${status}`,
    responseMs: 100,
    lastChecked: new Date().toISOString(),
  };
}

const INACTIVE_OVERRIDE: PaymentOverride = {
  active: false,
  level: "MAINTENANCE",
  message: "",
  setBy: null,
  setAt: null,
};

// Override state is process-global; make every test independent.
beforeEach(() => setOverride({ ...INACTIVE_OVERRIDE }));
afterEach(() => setOverride({ ...INACTIVE_OVERRIDE }));

test("UNKNOWN probe never disables checkout (monitor failure is failsafe)", () => {
  setHealth(paymongoHealth("UNKNOWN"));
  const r = effectivePaymentStatus();
  assert.equal(r.status, "UNKNOWN");
  assert.equal(r.checkoutDisabled, false);
});

test("DEGRADED probe never disables checkout", () => {
  setHealth(paymongoHealth("DEGRADED"));
  const r = effectivePaymentStatus();
  assert.equal(r.status, "DEGRADED");
  assert.equal(r.checkoutDisabled, false);
});

test("ONLINE probe never disables checkout", () => {
  setHealth(paymongoHealth("ONLINE"));
  assert.equal(effectivePaymentStatus().checkoutDisabled, false);
});

test("confirmed MAINTENANCE disables checkout", () => {
  setHealth(paymongoHealth("MAINTENANCE"));
  const r = effectivePaymentStatus();
  assert.equal(r.status, "MAINTENANCE");
  assert.equal(r.checkoutDisabled, true);
});

test("confirmed OUTAGE disables checkout", () => {
  setHealth(paymongoHealth("OUTAGE"));
  const r = effectivePaymentStatus();
  assert.equal(r.status, "OUTAGE");
  assert.equal(r.checkoutDisabled, true);
});

test("owner override disables checkout even when the probe is healthy", () => {
  setHealth(paymongoHealth("ONLINE"));
  setOverride({
    active: true,
    level: "OUTAGE",
    message: "manual takedown",
    setBy: "owner@example.com",
    setAt: new Date().toISOString(),
  });
  const r = effectivePaymentStatus();
  assert.equal(r.status, "OUTAGE");
  assert.equal(r.checkoutDisabled, true);
  assert.equal(r.message, "manual takedown");
});

test("owner override (MAINTENANCE) wins over an UNKNOWN probe", () => {
  setHealth(paymongoHealth("UNKNOWN"));
  setOverride({
    active: true,
    level: "MAINTENANCE",
    message: "",
    setBy: "owner@example.com",
    setAt: new Date().toISOString(),
  });
  const r = effectivePaymentStatus();
  assert.equal(r.status, "MAINTENANCE");
  assert.equal(r.checkoutDisabled, true);
});
