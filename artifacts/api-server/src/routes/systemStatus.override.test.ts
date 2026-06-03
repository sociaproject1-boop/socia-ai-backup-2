/**
 * Verifies the owner override route broadcasts the PUBLIC snapshot over
 * Socket.IO on BOTH enable and disable, so banners/checkout buttons recover in
 * realtime instead of waiting for the next scheduled sweep.
 *
 * The REAL router is mounted on an Express app. Supabase auth is satisfied by
 * stubbing global.fetch for the GoTrue getUser endpoint (returning the OWNER
 * user); the Socket.IO server is replaced with a spy via setIo(). A separate,
 * captured `realFetch` is used by the test HTTP client so the stub only ever
 * intercepts the server-side Supabase call.
 */
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server as HttpServer } from "node:http";

// supabaseAuth throws at import time if these are unset, so they must exist
// before the router is (dynamically) imported. Dummy values — every Supabase
// HTTP call is intercepted by the fetch stub installed in before().
process.env["VITE_SUPABASE_URL"] = process.env["VITE_SUPABASE_URL"] ?? "https://test.supabase.co";
process.env["VITE_SUPABASE_ANON_KEY"] = process.env["VITE_SUPABASE_ANON_KEY"] ?? "test-anon-key";

import express from "express";
import { setIo } from "../lib/ioInstance.js";
import { OWNER_EMAIL, setOverride } from "../monitoring/index.js";

const realFetch = globalThis.fetch;

interface Broadcast {
  channel: string;
  payload: {
    payment: { status: string; message: string; checkoutDisabled: boolean; provider: string };
    services: unknown[];
    updatedAt: string;
  } & Record<string, unknown>;
}

/** Assert the broadcast payload is the safe PUBLIC snapshot — and nothing more
 *  (no owner/internal fields like `override`, `providers`, `log`, `alerts`). */
function assertPublicSnapshot(payload: Broadcast["payload"]): void {
  assert.deepEqual(Object.keys(payload).sort(), ["payment", "services", "updatedAt"]);
  assert.deepEqual(
    Object.keys(payload.payment).sort(),
    ["checkoutDisabled", "message", "provider", "status"],
  );
  assert.ok(Array.isArray(payload.services));
  assert.equal(typeof payload.updatedAt, "string");
}

let emitted: Broadcast[] = [];

const fakeIo = {
  emit(channel: string, payload: unknown) {
    emitted.push({ channel, payload: payload as Broadcast["payload"] });
    return true;
  },
} as unknown as Parameters<typeof setIo>[0];

let server: HttpServer;
let baseUrl = "";

before(async () => {
  // Server-side Supabase getUser → resolve to the OWNER so requireOwner passes.
  globalThis.fetch = (async (input: unknown) => {
    const url =
      typeof input === "string"
        ? input
        : (input as { url?: string } | null)?.url ?? String(input);
    if (url.includes("/auth/v1/user")) {
      const user = { id: "owner-id", email: OWNER_EMAIL, aud: "authenticated" };
      // Include both the top-level shape and a nested `user` to be robust to
      // supabase-js getUser response interpretation across versions.
      return new Response(JSON.stringify({ ...user, user }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    throw new Error(`unexpected server-side fetch in test: ${url}`);
  }) as typeof fetch;

  setIo(fakeIo);

  const router = (await import("./systemStatus.js")).default;
  const app = express();
  app.use(express.json());
  app.use("/api", router);

  await new Promise<void>((resolve) => {
    server = createServer(app);
    server.listen(0, () => {
      const addr = server.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
});

after(async () => {
  globalThis.fetch = realFetch;
  setIo(null as unknown as Parameters<typeof setIo>[0]);
  setOverride({ active: false, level: "MAINTENANCE", message: "", setBy: null, setAt: null });
  if (server) await new Promise<void>((r) => server.close(() => r()));
});

beforeEach(() => {
  emitted = [];
});

async function postOverride(body: unknown): Promise<{ status: number; json: any }> {
  const res = await realFetch(`${baseUrl}/api/system-status/override`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer test-jwt" },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: await res.json() };
}

test("enable override broadcasts a snapshot with checkout disabled", async () => {
  const { status, json } = await postOverride({ action: "enable", level: "OUTAGE", message: "down" });
  assert.equal(status, 200);
  assert.equal(json.ok, true);
  assert.equal(json.payment.checkoutDisabled, true);
  assert.equal(emitted.length, 1);
  assert.equal(emitted[0]!.channel, "system:status");
  assert.equal(emitted[0]!.payload.payment.checkoutDisabled, true);
  assertPublicSnapshot(emitted[0]!.payload);
});

test("disable override broadcasts a snapshot with checkout re-enabled", async () => {
  const { status, json } = await postOverride({ action: "disable" });
  assert.equal(status, 200);
  assert.equal(json.ok, true);
  assert.equal(json.payment.checkoutDisabled, false);
  assert.equal(emitted.length, 1);
  assert.equal(emitted[0]!.channel, "system:status");
  assert.equal(emitted[0]!.payload.payment.checkoutDisabled, false);
  assertPublicSnapshot(emitted[0]!.payload);
});
