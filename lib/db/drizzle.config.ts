import { defineConfig } from "drizzle-kit";
import path from "path";

function buildConnectionUrl(): string {
  const host = process.env["PGHOST"];
  const port = process.env["PGPORT"] ?? "5432";
  const user = process.env["PGUSER"];
  const password = process.env["PGPASSWORD"] ?? "";
  const database = process.env["PGDATABASE"];

  if (host && user && database) {
    const pwd = password ? `:${encodeURIComponent(password)}` : "";
    return `postgresql://${user}${pwd}@${host}:${port}/${database}`;
  }

  const url = process.env["DATABASE_URL"];
  if (url) return url;

  throw new Error("No database connection available. Set PGHOST/PGUSER/PGDATABASE or DATABASE_URL.");
}

const connectionUrl = buildConnectionUrl();

export default defineConfig({
  schema: path.join(__dirname, "./src/schema/index.ts"),
  dialect: "postgresql",
  dbCredentials: {
    url: connectionUrl,
  },
});
