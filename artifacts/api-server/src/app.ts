import express, { type Express, type Request, type Response } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import path from "path";
import { fileURLToPath } from "url";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

// Build the CORS origin whitelist from environment variables.
// - REPLIT_DOMAINS: comma-separated production domain names (no scheme)
// - REPLIT_DEV_DOMAIN: the *.replit.dev preview domain (no scheme)
// - Localhost variants for local development
const _productionOrigins: string[] = (process.env["REPLIT_DOMAINS"] ?? "")
  .split(",")
  .map((d) => d.trim())
  .filter(Boolean)
  .map((d) => `https://${d}`);

const _devOrigin = process.env["REPLIT_DEV_DOMAIN"]
  ? `https://${process.env["REPLIT_DEV_DOMAIN"]}`
  : null;

const ALLOWED_ORIGINS = new Set<string>([
  ..._productionOrigins,
  ...(_devOrigin ? [_devOrigin] : []),
  "http://localhost:3000",
  "http://localhost:5000",
  "http://localhost:5173",
  "http://localhost:21175",
  "http://localhost:80",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:5000",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:80",
]);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no Origin header (server-to-server, curl, native mobile)
      if (!origin) return callback(null, true);
      if (ALLOWED_ORIGINS.has(origin)) return callback(null, true);
      // Vite dev server includes the port in the Origin header (e.g. https://xxx.replit.dev:5000).
      // Strip the port and re-check so the dev domain still matches.
      try {
        const stripped = new URL(origin);
        stripped.port = "";
        if (ALLOWED_ORIGINS.has(stripped.origin)) return callback(null, true);
      } catch { /* invalid URL — fall through to reject */ }
      logger.warn({ origin }, "CORS: rejected request from unlisted origin");
      callback(new Error(`CORS: origin not allowed: ${origin}`));
    },
    credentials: true,
  }),
);
app.use(cookieParser());

// PayMongo webhook MUST receive the raw request body so the HMAC signature
// can be verified byte-for-byte. Mount express.raw() for this path BEFORE
// the global express.json() — otherwise json() will parse and replace req.body.
app.use("/api/paymongo/webhook", express.raw({ type: "application/json", limit: "1mb" }));

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

// ── Production: serve the built React frontend ─────────────────────────────
// In production (NODE_ENV=production) the API server is the only process.
// It serves the Vite-built static files at "/" and falls back to index.html
// for all non-API routes so client-side routing (React Router / Wouter) works.
// The build step copies artifacts/socia/dist/public → artifacts/api-server/dist/public.
if (process.env["NODE_ENV"] === "production") {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const staticDir = process.env["STATIC_DIR"] ?? path.join(__dirname, "public");

  app.use(express.static(staticDir, { maxAge: "1d", etag: true }));

  // SPA catch-all: serve index.html for all non-API, non-asset paths.
  // Uses app.use() (Express 5 compatible — app.get("*") is invalid in Express 5).
  app.use((_req: Request, res: Response) => {
    res.sendFile(path.join(staticDir, "index.html"));
  });

  logger.info({ staticDir }, "[static] Serving frontend in production mode");
}

export default app;
