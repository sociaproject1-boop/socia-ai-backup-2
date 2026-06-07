import ws from "ws";
import { createServer } from "node:http";
import app from "./app.js";
import { logger } from "./lib/logger.js";
import { setupSockets } from "./lib/socketServer.js";
import { prewarmTesseract } from "./lib/ocrService.js";
import { startRenderWorker }  from "./lib/renderWorker.js";
import { startStorageCleanup } from "./lib/storageCleanup.js";
import { warmGrok } from "./lib/grokClient.js";
import { startMonitoring } from "./monitoring/index.js";

/* ── WebSocket polyfill for Node.js < 22 ────────────────────────────────────
 * Supabase JS v2 realtime requires WebSocket. Node.js 20 lacks a native
 * globalThis.WebSocket, so every db() call that creates a Supabase client
 * throws "Node.js 20 detected without native WebSocket support" and returns
 * a 500. Setting the polyfill here (before any route handler runs) fixes it.
 * ─────────────────────────────────────────────────────────────────────────── */
if (typeof (globalThis as any).WebSocket === "undefined") {
  (globalThis as any).WebSocket = ws;
  logger.info("[startup] WebSocket polyfill installed (ws package)");
}

/* ── Storage bucket bootstrap ───────────────────────────────────────────────
 * Creates required Supabase Storage buckets if they don't exist.
 * Runs once at startup using the service-role key so no manual Supabase
 * dashboard action is needed.
 * ─────────────────────────────────────────────────────────────────────────── */
async function ensureBuckets(): Promise<void> {
  const supabaseUrl = process.env["VITE_SUPABASE_URL"] ?? process.env["SUPABASE_URL"] ?? "";
  const serviceKey  = process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "";
  if (!supabaseUrl || !serviceKey) {
    logger.warn("[startup] Missing Supabase env vars — skipping bucket bootstrap");
    return;
  }

  const { createClient } = await import("@supabase/supabase-js");
  const svc = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const desired: Array<{ name: string; public: boolean }> = [
    { name: "pulses",          public: true  },
    { name: "avatars",         public: true  },
    { name: "post-media",      public: true  },
    { name: "cover-photos",    public: true  },
    { name: "chat-images",     public: true  },
    { name: "audio-messages",  public: false },
    { name: "socia-gpt-uploads", public: true },
    { name: "payment-receipts",  public: false },
  ];

  const { data: existing, error: listErr } = await svc.storage.listBuckets();
  if (listErr) {
    logger.warn({ err: listErr.message }, "[startup] Could not list buckets — skipping bucket bootstrap");
    return;
  }

  const existingNames = new Set((existing ?? []).map((b: any) => b.name));

  for (const bucket of desired) {
    if (existingNames.has(bucket.name)) continue;
    const { error } = await svc.storage.createBucket(bucket.name, {
      public: bucket.public,
      fileSizeLimit: bucket.name === "pulses" ? 52428800 : 10485760, // 50 MB for stories, 10 MB others
      allowedMimeTypes: bucket.name === "pulses"
        ? ["image/*", "video/*"]
        : undefined,
    });
    if (error) {
      logger.warn({ bucket: bucket.name, err: error.message }, "[startup] Failed to create bucket");
    } else {
      logger.info({ bucket: bucket.name }, "[startup] Created storage bucket ✓");
    }
  }
}

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error("PORT environment variable is required but was not provided.");
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const httpServer = createServer(app);
setupSockets(httpServer);

httpServer.listen(port, () => {
  logger.info({ port }, "Server listening");
  // Ensure required Supabase Storage buckets exist (creates them if missing)
  ensureBuckets().catch((err) =>
    logger.warn({ err: (err as Error).message }, "[startup] Bucket bootstrap failed"),
  );
  // Start Tesseract pre-warm (background — first receipt request won't cold-start)
  prewarmTesseract();
  // Start background render worker (polls for queued jobs every 6s)
  startRenderWorker().catch((err) =>
    logger.warn({ err: (err as Error).message }, "[index] Render worker failed to start"),
  );
  // Start storage cleanup (scans stale temp dirs + recovers abandoned jobs every 30 min)
  startStorageCleanup();
  // Eagerly construct the Grok SDK client so the first chat doesn't pay it.
  warmGrok();
  // Start the isolated System Status + AI Command Center monitor (5-min loop).
  // Failsafe: a monitor failure can never block checkout or affect other routes.
  try {
    startMonitoring();
  } catch (err) {
    logger.warn({ err: (err as Error).message }, "[index] status monitor failed to start");
  }
});
