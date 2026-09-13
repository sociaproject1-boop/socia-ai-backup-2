/**
 * dbCompat.ts — Hybrid database router.
 *
 * Routes queries to the correct backend based on where each table lives:
 *
 *  • HELIUMDB_TABLES  → Replit PostgreSQL (pg Pool, direct SQL)
 *  • everything else  → Supabase PostgreSQL (PostgREST REST API, service role)
 *
 * Both paths expose the same Supabase-client-compatible API so existing routes
 * need no changes — just `svc.from("table").select/insert/update/delete`.
 */
import pg from "pg";

const { Pool } = pg;

/* ── Replit PG pool ────────────────────────────────────────────────────── */
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

const connectionString = process.env["DATABASE_URL"] || getReplitConnectionString() || "";

if (!connectionString) {
  throw new Error("DATABASE_URL must be set.");
}

const pool = new Pool({ connectionString });

/* ── Supabase PostgREST config ─────────────────────────────────────────── */
const SB_URL = (process.env["SUPABASE_URL"] ?? process.env["VITE_SUPABASE_URL"] ?? "").replace(/\/$/, "");
const SB_KEY = process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "";

/**
 * Tables that live in the Replit heliumdb PostgreSQL instance.
 * All other tables are routed to Supabase via PostgREST.
 */
const HELIUMDB_TABLES = new Set([
  "conversations", "messages",       // Drizzle-managed chat log
  "users",                           // User profiles (synced on auth)
  "credit_ledger",                   // Creator billing credits
  "usage_receipts",                  // AI usage tracking
  "render_jobs",                     // AI render queue
  "socia_gpt_memory",                // SociaGPT memory profiles
  "studio_projects",                 // Studio project blobs
  "super_admins",                    // Admin accounts (bcrypt)
  "admin_audit_log",                 // Admin activity audit
  "ai_enforcement_events",           // AI governance events
  "ai_governance_config",            // AI governance config
]);

/**
 * Parse a PostgREST-style select string into a PostgreSQL column list.
 * Handles nested relationship selects like:
 *   author:users!posts_author_id_fkey(id, name)
 *   media:post_media(id, url)
 */
function parseSelectCols(rawSelect: string, mainTable: string): string {
  // Split at depth-0 commas so nested parens don't confuse us
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of rawSelect) {
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      const p = current.trim();
      if (p) parts.push(p);
      current = "";
    } else {
      current += ch;
    }
  }
  const last = current.trim();
  if (last) parts.push(last);

  const exprs: string[] = [];
  for (const part of parts) {
    // Relationship select: alias:table!fk_hint(cols) or alias:table(cols)
    const relMatch = part.trim().match(/^(\w+):(\w+)(?:!(\w+))?\((.+)\)$/s);
    if (!relMatch) {
      const t = part.trim();
      // Plain column — quote if simple identifier
      if (!t || t === "*" || t.includes("(") || t.includes(" ") || t.includes(".")) {
        exprs.push(t || "*");
      } else {
        exprs.push(`"${t}"`);
      }
      continue;
    }

    const [, alias, relTable, fkHint, innerCols] = relMatch as [string, string, string, string | undefined, string];

    // Build flat inner column list (skip nested relationships in inner select for simplicity)
    const innerExprs: string[] = [];
    let idepth = 0;
    let icur = "";
    for (const ch of innerCols) {
      if (ch === "(") idepth++;
      else if (ch === ")") idepth--;
      if (ch === "," && idepth === 0) {
        const p = icur.trim();
        if (p) innerExprs.push(p);
        icur = "";
      } else {
        icur += ch;
      }
    }
    const ilast = icur.trim();
    if (ilast) innerExprs.push(ilast);

    const innerSql = innerExprs
      .filter((c) => !c.includes("("))   // drop nested relations
      .map((c) => {
        const t = c.trim();
        return t === "*" || t.includes(" ") ? t : `"${t}"`;
      })
      .join(", ") || "*";

    if (fkHint) {
      // FK hint format: mainTable_fkCol_fkey  (FK lives on the current table)
      const withoutFkey = fkHint.replace(/_fkey$/, "");
      let fkCol: string;
      if (withoutFkey.toLowerCase().startsWith(mainTable.toLowerCase() + "_")) {
        fkCol = withoutFkey.slice(mainTable.length + 1);
      } else {
        // Fallback: last two underscore-separated segments → col name
        const segs = withoutFkey.split("_");
        fkCol = segs.length >= 2 ? segs.slice(-2).join("_") : (segs[segs.length - 1] ?? "id");
      }
      // Cast both sides to text to handle uuid vs text type mismatches (e.g. users.id=text, pulses.user_id=uuid)
      exprs.push(
        `(SELECT row_to_json(t.*) FROM (SELECT ${innerSql} FROM "${relTable}" t WHERE t."id"::text = "${mainTable}"."${fkCol}"::text LIMIT 1) t) AS "${alias}"`
      );
    } else {
      // No FK hint: decide direction by convention
      // If the related table is "users" or the alias is a well-known singular role → forward FK
      const SINGULAR_ROLES = new Set(["user", "author", "creator", "sender", "receiver", "owner", "admin", "reporter", "viewer", "parent", "target", "actor", "manager"]);
      const isForwardFk = relTable === "users" || SINGULAR_ROLES.has(alias.toLowerCase());
      if (isForwardFk) {
        // FK on current table: currentTable.{alias}_id → relTable.id
        const fkCol = `${alias}_id`;
        // Cast both sides to text to handle uuid vs text type mismatches
        exprs.push(
          `(SELECT row_to_json(t.*) FROM (SELECT ${innerSql} FROM "${relTable}" t WHERE t."id"::text = "${mainTable}"."${fkCol}"::text LIMIT 1) t) AS "${alias}"`
        );
      } else {
        // FK on related table: relTable.{mainTable_singular}_id → mainTable.id
        const singular = mainTable.endsWith("s") ? mainTable.slice(0, -1) : mainTable;
        const fkBackCol = `${singular}_id`;
        exprs.push(
          `(SELECT COALESCE(json_agg(t.*), '[]'::json) FROM (SELECT ${innerSql} FROM "${relTable}" t WHERE t."${fkBackCol}" = "${mainTable}"."id") t) AS "${alias}"`
        );
      }
    }
  }

  return exprs.join(", ") || "*";
}

type FilterOp = "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "in" | "is" | "ilike" | "like";

interface WhereClause {
  col:  string;
  op:   FilterOp;
  val:  unknown;
}

interface NotClause {
  col: string;
  op:  string;
  val: unknown;
}

type OrderDir = { col: string; asc: boolean };

class QueryBuilder {
  private _table:     string;
  private _select:    string | null = null;
  private _insert:    Record<string, unknown> | Record<string, unknown>[] | null = null;
  private _update:    Record<string, unknown> | null = null;
  private _delete:    boolean = false;
  private _upsert:    Record<string, unknown> | Record<string, unknown>[] | null = null;
  private _onConflict: string | null = null;
  private _ignoreDups: boolean = false;
  private _wheres:    WhereClause[] = [];
  private _orFilter:  string | null = null;
  private _order:     OrderDir[] = [];
  private _limit:     number | null = null;
  private _single:    boolean = false;
  private _maybeSingle: boolean = false;
  private _countOnly:  boolean = false;
  private _head:       boolean = false;
  private _offset:     number | null = null;
  private _notClauses: NotClause[] = [];

  constructor(table: string) {
    this._table = table;
  }

  select(cols?: string, opts?: { count?: string; head?: boolean }) {
    if (cols === undefined) cols = "*";
    this._select = cols;
    if (opts?.count) this._countOnly = true;
    if (opts?.head) { this._head = true; this._countOnly = true; }
    return this;
  }
  insert(data: Record<string, unknown> | Record<string, unknown>[]) {
    this._insert = data; return this;
  }
  update(data: Record<string, unknown>) {
    this._update = data; return this;
  }
  delete() {
    this._delete = true; return this;
  }
  upsert(data: Record<string, unknown> | Record<string, unknown>[], opts?: { onConflict?: string; ignoreDuplicates?: boolean }) {
    this._upsert = data;
    this._onConflict = opts?.onConflict ?? null;
    this._ignoreDups = opts?.ignoreDuplicates ?? false;
    return this;
  }
  eq(col: string, val: unknown)    { this._wheres.push({ col, op: "eq",    val }); return this; }
  neq(col: string, val: unknown)   { this._wheres.push({ col, op: "neq",   val }); return this; }
  gt(col: string, val: unknown)    { this._wheres.push({ col, op: "gt",    val }); return this; }
  gte(col: string, val: unknown)   { this._wheres.push({ col, op: "gte",   val }); return this; }
  lt(col: string, val: unknown)    { this._wheres.push({ col, op: "lt",    val }); return this; }
  lte(col: string, val: unknown)   { this._wheres.push({ col, op: "lte",   val }); return this; }
  in(col: string, vals: unknown[]) { this._wheres.push({ col, op: "in",    val: vals }); return this; }
  is(col: string, val: unknown)    { this._wheres.push({ col, op: "is",    val }); return this; }
  ilike(col: string, val: unknown) { this._wheres.push({ col, op: "ilike", val }); return this; }
  like(col: string, val: unknown)  { this._wheres.push({ col, op: "like",  val }); return this; }
  or(filter: string)               { this._orFilter = filter; return this; }
  order(col: string, opts?: { ascending?: boolean }) { this._order.push({ col, asc: opts?.ascending !== false }); return this; }
  limit(n: number)                 { this._limit = n; return this; }
  range(from: number, to: number)  { this._offset = from; this._limit = to - from + 1; return this; }
  not(col: string, op: string, val: unknown) { this._notClauses.push({ col, op, val }); return this; }
  single()                         { this._single = true; this._limit = 1; return this; }
  maybeSingle()                    { this._maybeSingle = true; this._limit = 1; return this; }
  async catch<T = never>(onRejected?: ((reason: unknown) => T | PromiseLike<T>) | null): Promise<unknown | T> {
    return this.then(undefined, onRejected ?? undefined);
  }
  async finally(onFinally?: (() => void) | null): Promise<unknown> {
    try { return await this._execute(); } finally { onFinally?.(); }
  }
  get [Symbol.toStringTag]() { return "QueryBuilder" as const; }

  private buildWhere(startIdx: number): { clause: string; params: unknown[] } {
    const params: unknown[] = [];
    const parts: string[] = [];
    let i = startIdx;

    for (const w of this._wheres) {
      const col = `"${w.col}"`;
      switch (w.op) {
        case "eq":    parts.push(`${col} = $${i++}`);     params.push(w.val); break;
        case "neq":   parts.push(`${col} != $${i++}`);    params.push(w.val); break;
        case "gt":    parts.push(`${col} > $${i++}`);     params.push(w.val); break;
        case "gte":   parts.push(`${col} >= $${i++}`);    params.push(w.val); break;
        case "lt":    parts.push(`${col} < $${i++}`);     params.push(w.val); break;
        case "lte":   parts.push(`${col} <= $${i++}`);    params.push(w.val); break;
        case "in":    {
          const arr = w.val as unknown[];
          const placeholders = arr.map((_, j) => `$${i + j}`).join(", ");
          parts.push(`${col} IN (${placeholders})`);
          params.push(...arr);
          i += arr.length;
          break;
        }
        case "is":
          if (w.val === null) parts.push(`${col} IS NULL`);
          else { parts.push(`${col} IS $${i++}`); params.push(w.val); }
          break;
        case "ilike": parts.push(`${col} ILIKE $${i++}`); params.push(w.val); break;
        case "like":  parts.push(`${col} LIKE $${i++}`);  params.push(w.val); break;
      }
    }

    if (this._orFilter) {
      /* PostgREST-style or() filter parser.
       * Handles:
       *   col.op.val                          → simple condition
       *   and(col.op.val,col2.op.val2)        → AND group (for thread filters)
       * Operator mapping: eq→= neq→!= gt→> lt→< gte→>= lte→<= ilike→ILIKE like→LIKE */
      const SQL_OP: Record<string, string> = {
        eq: "=", neq: "!=", gt: ">", lt: "<", gte: ">=", lte: "<=",
        ilike: "ILIKE", like: "LIKE",
      };

      const splitTopLevel = (s: string): string[] => {
        const result: string[] = [];
        let depth = 0;
        let cur = "";
        for (const ch of s) {
          if (ch === "(") depth++;
          else if (ch === ")") depth--;
          if (ch === "," && depth === 0) { result.push(cur.trim()); cur = ""; }
          else cur += ch;
        }
        if (cur.trim()) result.push(cur.trim());
        return result;
      };

      const parseCondition = (cond: string): string => {
        const andMatch = cond.match(/^and\((.+)\)$/s);
        if (andMatch) {
          const inner = splitTopLevel(andMatch[1]!);
          const innerSql = inner.map(parseCondition).filter(Boolean);
          return innerSql.length ? `(${innerSql.join(" AND ")})` : "";
        }
        const m = cond.match(/^(\w+)\.(eq|neq|gt|lt|gte|lte|ilike|like|is)\.(.+)$/);
        if (!m) return "";
        const [, col, op, valStr] = m;
        if (op === "is") {
          if (valStr === "null") return `"${col}" IS NULL`;
          if (valStr === "true") return `"${col}" IS TRUE`;
          if (valStr === "false") return `"${col}" IS FALSE`;
          return "";
        }
        const ph = `$${i++}`;
        params.push(valStr);
        return `"${col}"::text ${SQL_OP[op!] ?? "="} ${ph}`;
      };

      const orParts = splitTopLevel(this._orFilter).map(parseCondition).filter(Boolean);
      if (orParts.length) parts.push(`(${orParts.join(" OR ")})`);
    }

    for (const n of this._notClauses) {
      const col = `"${n.col}"`;
      const op = n.op.toLowerCase();
      if (op === "is" && n.val === null) {
        parts.push(`${col} IS NOT NULL`);
      } else if (op === "eq") {
        parts.push(`${col} != $${i++}`); params.push(n.val);
      } else if (op === "in") {
        const arr = n.val as unknown[];
        if (arr.length === 0) { parts.push("FALSE"); }
        else {
          const placeholders = arr.map((_, j) => `$${i + j}`).join(", ");
          parts.push(`${col} NOT IN (${placeholders})`);
          params.push(...arr);
          i += arr.length;
        }
      } else {
        parts.push(`NOT (${col} ${op.toUpperCase()} $${i++})`); params.push(n.val);
      }
    }

    return { clause: parts.length ? `WHERE ${parts.join(" AND ")}` : "", params };
  }

  async then(resolve?: ((result: any) => any) | null, reject?: ((err: any) => any) | null): Promise<any> {
    try {
      const result = await this._execute();
      return resolve ? resolve(result) : result;
    } catch (err) {
      if (reject) return reject(err);
      throw err;
    }
  }

  private async _execute(): Promise<{ data: unknown; error: { message: string } | null; count?: number | null }> {
    const client = await pool.connect();
    try {
      // INSERT
      if (this._insert !== null) {
        const rows = Array.isArray(this._insert) ? this._insert : [this._insert];
        if (rows.length === 0) return { data: null, error: null };
        const cols = Object.keys(rows[0]!);
        const allParams: unknown[] = [];
        const valueSets = rows.map((row) => {
          const start = allParams.length + 1;
          const vals = cols.map((c) => row[c]);
          allParams.push(...vals);
          return `(${cols.map((_, j) => `$${start + j}`).join(", ")})`;
        });
        const colList = cols.map((c) => `"${c}"`).join(", ");
        const sql = `INSERT INTO "${this._table}" (${colList}) VALUES ${valueSets.join(", ")} ON CONFLICT DO NOTHING`;
        await client.query(sql, allParams);
        return { data: null, error: null };
      }

      // UPSERT
      if (this._upsert !== null) {
        const rows = Array.isArray(this._upsert) ? this._upsert : [this._upsert];
        if (rows.length === 0) return { data: null, error: null };
        const cols = Object.keys(rows[0]!);
        const allParams: unknown[] = [];
        const valueSets = rows.map((row) => {
          const start = allParams.length + 1;
          const vals = cols.map((c) => row[c]);
          allParams.push(...vals);
          return `(${cols.map((_, j) => `$${start + j}`).join(", ")})`;
        });
        const colList = cols.map((c) => `"${c}"`).join(", ");
        let sql = `INSERT INTO "${this._table}" (${colList}) VALUES ${valueSets.join(", ")}`;
        if (this._onConflict) {
          const conflictCols = this._onConflict.split(",").map((c) => `"${c.trim()}"`).join(", ");
          if (this._ignoreDups) {
            sql += ` ON CONFLICT (${conflictCols}) DO NOTHING`;
          } else {
            const updateCols = cols.filter((c) => !this._onConflict!.split(",").map((x) => x.trim()).includes(c));
            if (updateCols.length > 0) {
              sql += ` ON CONFLICT (${conflictCols}) DO UPDATE SET ${updateCols.map((c) => `"${c}" = EXCLUDED."${c}"`).join(", ")}`;
            } else {
              sql += ` ON CONFLICT (${conflictCols}) DO NOTHING`;
            }
          }
        } else {
          sql += ` ON CONFLICT DO NOTHING`;
        }
        sql += ` RETURNING *`;
        const r = await client.query(sql, allParams);
        return { data: r.rows, error: null };
      }

      // DELETE
      if (this._delete) {
        const { clause, params } = this.buildWhere(1);
        await client.query(`DELETE FROM "${this._table}" ${clause}`, params);
        return { data: null, error: null };
      }

      // UPDATE
      if (this._update !== null) {
        const setCols = Object.keys(this._update);
        const setParams = Object.values(this._update);
        const setClause = setCols.map((c, i) => `"${c}" = $${i + 1}`).join(", ");
        const { clause, params } = this.buildWhere(setCols.length + 1);
        const allParams = [...setParams, ...params];
        const r = await client.query(`UPDATE "${this._table}" SET ${setClause} ${clause} RETURNING *`, allParams);
        const data = this._single ? (r.rows[0] ?? null) : r.rows;
        return { data, error: null };
      }

      // SELECT / COUNT
      const { clause, params } = this.buildWhere(1);

      if (this._countOnly) {
        const r = await client.query(`SELECT COUNT(*) FROM "${this._table}" ${clause}`, params);
        return { data: null, error: null, count: parseInt(r.rows[0].count, 10) };
      }

      const cols = !this._select || this._select.trim() === "*"
        ? "*"
        : parseSelectCols(this._select, this._table);
      let sql = `SELECT ${cols} FROM "${this._table}" ${clause}`;
      if (this._order.length) {
        sql += ` ORDER BY ${this._order.map((o) => `"${o.col}" ${o.asc ? "ASC" : "DESC"}`).join(", ")}`;
      }
      if (this._limit !== null) sql += ` LIMIT ${this._limit}`;
      if (this._offset !== null) sql += ` OFFSET ${this._offset}`;

      const r = await client.query(sql, params);

      if (this._single) {
        if (!r.rows.length) return { data: null, error: { message: "Row not found" } };
        return { data: r.rows[0], error: null };
      }
      if (this._maybeSingle) {
        return { data: r.rows[0] ?? null, error: null };
      }
      return { data: r.rows, error: null };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { data: null, error: { message: msg } };
    } finally {
      client.release();
    }
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
 * SupabaseRestBuilder — PostgREST-backed query builder for Supabase tables.
 * Mirrors the QueryBuilder API so routes need zero changes.
 * ═══════════════════════════════════════════════════════════════════════════ */
class SupabaseRestBuilder {
  private _table:      string;
  private _select:     string = "*";
  private _method:     "GET" | "POST" | "PATCH" | "DELETE" = "GET";
  private _body:       unknown = null;
  private _filters:    Array<[string, string]> = [];
  private _order:      string[] = [];
  private _limit:      number | null = null;
  private _offset:     number | null = null;
  private _single:     boolean = false;
  private _maybeSingle: boolean = false;
  private _countOnly:  boolean = false;
  private _upsert:     boolean = false;
  private _onConflict: string | null = null;
  private _ignoreDups: boolean = false;

  constructor(table: string) { this._table = table; }

  select(cols?: string, opts?: { count?: string; head?: boolean }) {
    this._select = cols ?? "*";
    if (opts?.count) this._countOnly = true;
    return this;
  }
  insert(data: unknown)  { this._method = "POST";   this._body = data; return this; }
  update(data: unknown)  { this._method = "PATCH";  this._body = data; return this; }
  delete()               { this._method = "DELETE"; return this; }
  upsert(data: unknown, opts?: { onConflict?: string; ignoreDuplicates?: boolean }) {
    this._method = "POST"; this._body = data; this._upsert = true;
    this._onConflict = opts?.onConflict ?? null;
    this._ignoreDups = opts?.ignoreDuplicates ?? false;
    return this;
  }
  onConflict(col: string) { this._onConflict = col; return this; }
  ignoreDuplicates()       { this._ignoreDups = true; return this; }

  eq(col: string, val: unknown)    { this._filters.push([col, `eq.${val}`]);         return this; }
  neq(col: string, val: unknown)   { this._filters.push([col, `neq.${val}`]);        return this; }
  gt(col: string, val: unknown)    { this._filters.push([col, `gt.${val}`]);         return this; }
  gte(col: string, val: unknown)   { this._filters.push([col, `gte.${val}`]);        return this; }
  lt(col: string, val: unknown)    { this._filters.push([col, `lt.${val}`]);         return this; }
  lte(col: string, val: unknown)   { this._filters.push([col, `lte.${val}`]);        return this; }
  in(col: string, vals: unknown[]) { this._filters.push([col, `in.(${vals.join(",")})`]); return this; }
  is(col: string, val: unknown)    { this._filters.push([col, `is.${val}`]);         return this; }
  ilike(col: string, val: unknown) { this._filters.push([col, `ilike.${String(val)}`]);  return this; }
  like(col: string, val: unknown)  { this._filters.push([col, `like.${String(val)}`]);   return this; }
  or(filter: string)               { this._filters.push(["or", `(${filter})`]);      return this; }
  not(col: string, op: string, val: unknown) { this._filters.push([col, `not.${op}.${val}`]); return this; }
  contains(col: string, val: unknown) { this._filters.push([col, `cs.${JSON.stringify(val)}`]); return this; }

  order(col: string, opts?: { ascending?: boolean; nullsFirst?: boolean }) {
    const dir  = opts?.ascending !== false ? "asc" : "desc";
    const nuls = opts?.nullsFirst ? ".nullsfirst" : "";
    this._order.push(`${col}.${dir}${nuls}`);
    return this;
  }
  limit(n: number)               { this._limit  = n;  return this; }
  range(from: number, to: number){ this._offset = from; this._limit = to - from + 1; return this; }

  single()      { this._single      = true; return this._exec(); }
  maybeSingle() { this._maybeSingle = true; return this._exec(); }

  then(resolve: (r: unknown) => void, reject?: (e: unknown) => void) {
    return this._exec().then(resolve, reject);
  }
  catch<T = never>(onRejected?: ((reason: unknown) => T | PromiseLike<T>) | null) {
    return this._exec().catch(onRejected ?? undefined);
  }
  finally(onFinally?: (() => void) | null) {
    return this._exec().finally(onFinally ?? undefined);
  }
  get [Symbol.toStringTag]() { return "SupabaseRestBuilder" as const; }

  private async _exec(): Promise<{ data: unknown; error: { message: string } | null; count?: number | null }> {
    if (!SB_URL || !SB_KEY) {
      console.error("[dbCompat] Supabase URL/service key not set — cannot query table:", this._table);
      return { data: null, error: { message: "Supabase not configured" } };
    }

    const baseUrl = `${SB_URL}/rest/v1/${encodeURIComponent(this._table)}`;
    const params  = new URLSearchParams();

    /* SELECT columns (also used as response projection for mutations) */
    if (this._method === "GET") {
      params.set("select", this._select);
    }

    /* Filters */
    for (const [col, val] of this._filters) {
      params.append(col, val);
    }

    /* ORDER / LIMIT / OFFSET */
    if (this._order.length)    params.set("order",  this._order.join(","));
    if (this._limit  !== null) params.set("limit",  String(this._limit));
    if (this._offset !== null) params.set("offset", String(this._offset));

    /* Upsert on_conflict column */
    if (this._upsert && this._onConflict) params.set("on_conflict", this._onConflict);

    /* Headers */
    const headers: Record<string, string> = {
      apikey:          SB_KEY,
      Authorization:   `Bearer ${SB_KEY}`,
      "Content-Type":  "application/json",
    };

    const preferParts: string[] = [];
    if (this._method === "POST")  preferParts.push(this._upsert
      ? (this._ignoreDups ? "resolution=ignore-duplicates" : "resolution=merge-duplicates")
      : "return=representation");
    if (this._method === "PATCH" || this._method === "DELETE") preferParts.push("return=representation");
    if (this._countOnly) { preferParts.push("count=exact"); headers["Range"] = "0-0"; }
    if (preferParts.length) headers["Prefer"] = preferParts.join(",");

    const url = params.toString() ? `${baseUrl}?${params.toString()}` : baseUrl;

    try {
      const res = await fetch(url, {
        method:  this._method,
        headers,
        body: this._body !== null ? JSON.stringify(this._body) : undefined,
      });

      /* Count-only: read Content-Range header */
      if (this._countOnly) {
        const cr    = res.headers.get("content-range") ?? "";
        const total = cr.includes("/") ? parseInt(cr.split("/")[1] ?? "0", 10) : 0;
        return { data: null, error: null, count: isNaN(total) ? 0 : total };
      }

      if (!res.ok) {
        let msg = `HTTP ${res.status} from Supabase`;
        try { const e = await res.json() as { message?: string; error?: string }; msg = e.message ?? e.error ?? msg; } catch { /* */ }
        return { data: null, error: { message: msg } };
      }

      const text = await res.text();
      if (!text.trim()) {
        return { data: (this._single || this._maybeSingle) ? null : [], error: null };
      }

      const parsed: unknown = JSON.parse(text);

      if (this._single) {
        if (Array.isArray(parsed)) {
          if (!parsed.length) return { data: null, error: { message: "Row not found" } };
          return { data: parsed[0], error: null };
        }
        return { data: parsed, error: null };
      }
      if (this._maybeSingle) {
        if (Array.isArray(parsed)) return { data: parsed[0] ?? null, error: null };
        return { data: parsed ?? null, error: null };
      }
      return { data: parsed, error: null };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[dbCompat] Supabase fetch error on table "${this._table}":`, msg);
      return { data: null, error: { message: msg } };
    }
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
 * Supabase RPC caller via PostgREST /rest/v1/rpc/:fn
 * ═══════════════════════════════════════════════════════════════════════════ */
async function callSupabaseRpc(fn: string, args: Record<string, unknown> = {}): Promise<{ data: unknown; error: { message: string } | null }> {
  if (!SB_URL || !SB_KEY) return { data: null, error: { message: "Supabase not configured" } };
  try {
    const res = await fetch(`${SB_URL}/rest/v1/rpc/${fn}`, {
      method:  "POST",
      headers: {
        apikey:         SB_KEY,
        Authorization:  `Bearer ${SB_KEY}`,
        "Content-Type": "application/json",
        Prefer:         "return=representation",
      },
      body: JSON.stringify(args),
    });
    const data = await res.json() as unknown;
    if (!res.ok) return { data: null, error: { message: (data as { message?: string })?.message ?? `RPC ${fn} failed` } };
    return { data, error: null };
  } catch (err) {
    return { data: null, error: { message: err instanceof Error ? err.message : String(err) } };
  }
}

/** Drop-in replacement for createClient(url, key).from(table) usage.
 *  Routes each table to the correct backend automatically. */
export function createDbClient() {
  return {
    from: (table: string): QueryBuilder | SupabaseRestBuilder =>
      HELIUMDB_TABLES.has(table) ? new QueryBuilder(table) : new SupabaseRestBuilder(table),

    rpc: async (fn: string, args?: Record<string, unknown>): Promise<{ data: unknown; error: { message: string } | null }> => {
      return callSupabaseRpc(fn, args ?? {});
    },

    storage: {
      from: (_bucket: string) => ({
        createSignedUrl: async (_path: string, _expires: number) => ({
          data: null as { signedUrl: string } | null,
          error: { message: "Storage not available in this environment" } as { message: string } | null,
        }),
        upload: async (_path: string, _body: unknown) => ({
          data: null as unknown,
          error: { message: "Storage not available in this environment" } as { message: string } | null,
        }),
        remove: async (_paths: string[]) => ({
          data: null as unknown,
          error: { message: "Storage not available in this environment" } as { message: string } | null,
        }),
      }),
    },

    auth: {
      admin: {
        signOut:        async (_uid: string, _scope?: string) => ({ error: null }),
        updateUserById: async (_uid: string, _updates: Record<string, unknown>) => ({
          data: null as unknown,
          error: null as { message: string } | null,
        }),
        deleteUser: async (_uid: string) => ({ error: null }),
      },
    },
  };
}

/** Convenience: create a compat client (url/key ignored — routing by HELIUMDB_TABLES) */
export function createClient(_url?: string, _key?: string, _opts?: unknown) {
  return createDbClient();
}
