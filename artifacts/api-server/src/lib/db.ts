import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@workspace/db";

const { Pool } = pg;

function getReplitConnectionString(): string {
  const host = process.env["PGHOST"];
  const port = process.env["PGPORT"] ?? "5432";
  const user = process.env["PGUSER"];
  const password = process.env["PGPASSWORD"];
  const database = process.env["PGDATABASE"];
  if (host && user && password && database) {
    return `postgresql://${user}:${encodeURIComponent(password)}@${host}:${port}/${database}`;
  }
  return "";
}

const connectionString = process.env["DATABASE_URL"] || getReplitConnectionString();

if (!connectionString) {
  throw new Error("No database connection available. Ensure the database is provisioned.");
}

export const pool = new Pool({ connectionString });
export const db = drizzle(pool, { schema });
export { schema };
