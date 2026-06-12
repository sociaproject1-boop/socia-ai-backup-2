/**
 * DB Proxy — allows frontend Supabase shim to query/mutate data.
 * Only tables that are safe to expose are allowed.
 * All write operations require authentication.
 */
import { Router } from "express";
import { createDbClient } from "../lib/dbCompat.js";
import { getAuthedUser } from "../lib/replitAuth.js";
import { logger } from "../lib/logger.js";

const router = Router();

const READ_TABLES = new Set([
  "users", "pulses", "follows", "sounds", "streams", "posts",
  "social_posts", "comments", "stars", "trending", "explore",
  "ai_plans", "payment_receipts", "credit_ledger", "funding_pools",
  "alert_settings", "user_notifications", "conversations", "messages",
  "socia_gpt_memory",
  // billing & config tables used by frontend
  "app_config", "community_funding", "plans", "topup_packages",
  "payment_methods_config", "payment_settings", "payment_orders",
  "admins", "typing_status",
]);

const WRITE_TABLES = new Set([
  "users", "pulses", "follows", "sounds", "stars", "messages",
  "conversations", "socia_gpt_memory", "credit_ledger",
  "user_notifications", "alert_settings", "typing_status",
  "payment_orders",
]);

/** POST /api/db-proxy */
router.post("/", async (req, res) => {
  const {
    table, method, select, filters, data,
    order, limit, single, maybeSingle,
  } = req.body as {
    table:       string;
    method:      string;
    select?:     string;
    filters?:    Array<{ key: string; op: string; value: unknown }>;
    data?:       unknown;
    order?:      { col: string; asc: boolean } | null;
    limit?:      number | null;
    single?:     boolean;
    maybeSingle?: boolean;
  };

  if (!table) { res.status(400).json({ data: null, error: { message: "table required" } }); return; }

  const isWrite = method !== "select";

  if (!READ_TABLES.has(table)) {
    res.status(403).json({ data: null, error: { message: `Table '${table}' not accessible` } });
    return;
  }
  if (isWrite && !WRITE_TABLES.has(table)) {
    res.status(403).json({ data: null, error: { message: `Table '${table}' is read-only` } });
    return;
  }

  let authedUserId: string | null = null;
  try {
    authedUserId = getAuthedUser(req).id;
  } catch {
    if (isWrite) {
      res.status(401).json({ data: null, error: { message: "Authentication required" } });
      return;
    }
  }

  try {
    const db = createDbClient();
    let q: any = db.from(table);

    switch (method) {
      case "select":  q = q.select(select ?? "*"); break;
      case "insert":  q = q.insert(data); break;
      case "update":  q = q.update(data); break;
      case "delete":  q = q.delete(); break;
      case "upsert":  q = q.upsert(data); break;
      default:
        res.status(400).json({ data: null, error: { message: `Unknown method: ${method}` } });
        return;
    }

    for (const f of filters ?? []) {
      if (f.op === "eq")     q = q.eq(f.key, f.value);
      else if (f.op === "neq")   q = q.neq(f.key, f.value);
      else if (f.op === "gt")    q = q.gt(f.key, f.value);
      else if (f.op === "gte")   q = q.gte(f.key, f.value);
      else if (f.op === "lt")    q = q.lt(f.key, f.value);
      else if (f.op === "lte")   q = q.lte(f.key, f.value);
      else if (f.op === "in")    q = q.in(f.key, f.value as unknown[]);
      else if (f.op === "is")    q = q.is(f.key, f.value);
      else if (f.op === "ilike") q = q.ilike(f.key, f.value);
      else if (f.op === "like")  q = q.like(f.key, f.value);
      else if (f.op === "or")    q = q.or(f.value as string);
    }

    if (order?.col)  q = q.order(order.col, { ascending: order.asc });
    if (limit)       q = q.limit(limit);

    const result: { data: unknown; error: unknown } = single
      ? await q.single()
      : maybeSingle
      ? await q.maybeSingle()
      : await q;

    res.json(result);
  } catch (err) {
    logger.error({ err, table, method }, "[db-proxy] query failed");
    res.status(500).json({ data: null, error: { message: "Query failed" } });
  }
});

export default router;
