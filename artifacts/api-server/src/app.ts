import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
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
  "http://localhost:5173",
  "http://localhost:21175",
  "http://localhost:80",
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

export default app;
