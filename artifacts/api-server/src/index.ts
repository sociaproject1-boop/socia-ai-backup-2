import { createServer } from "node:http";
import app from "./app.js";
import { logger } from "./lib/logger.js";
import { setupSockets } from "./lib/socketServer.js";
import { prewarmTesseract } from "./lib/ocrService.js";
import { startRenderWorker }  from "./lib/renderWorker.js";
import { startStorageCleanup } from "./lib/storageCleanup.js";

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
  // Start Tesseract pre-warm (background — first receipt request won't cold-start)
  prewarmTesseract();
  // Start background render worker (polls for queued jobs every 6s)
  startRenderWorker().catch((err) =>
    logger.warn({ err: (err as Error).message }, "[index] Render worker failed to start"),
  );
  // Start storage cleanup (scans stale temp dirs + recovers abandoned jobs every 30 min)
  startStorageCleanup();
});
