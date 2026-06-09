/**
 * dbCompat.ts — PostgreSQL compatibility adapter.
 *
 * Provides a Supabase-client-compatible API backed by direct PostgreSQL
 * queries (via pg Pool). This lets existing routes that call
 * `supabase.from("table").select/insert/update/delete` continue to work
 * without a full rewrite to Drizzle.
 *
 * This is intentionally a minimal shim — it covers the patterns actually
 * used in this codebase, not the full Supabase PostgREST API.
 */
import pg from "pg";

const { Pool } = pg;

if (!process.env["DATABASE_URL"]) {
  throw new Error("DATABASE_URL must be set.");
}

const pool = new Pool({ connectionString: process.env["DATABASE_URL"] });

type FilterOp = "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "in" | "is" | "ilike" | "like";

interface WhereClause {
  col:  string;
  op:   FilterOp;
  val:  unknown;
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

  constructor(table: string) {
    this._table = table;
  }

  select(cols: string, opts?: { count?: string; head?: boolean }) {
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
  single()                         { this._single = true; this._limit = 1; return this; }
  maybeSingle()                    { this._maybeSingle = true; this._limit = 1; return this; }

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
      const orParts = this._orFilter.split(",").map((part) => {
        const m = part.trim().match(/^(\w+)\.(ilike|eq|neq|gt|lt|gte|lte)\.(.+)$/);
        if (!m) return "";
        const [, col, op, valStr] = m;
        const ph = `$${i++}`;
        params.push(op === "ilike" ? valStr : valStr);
        return `"${col}" ${op === "ilike" ? "ILIKE" : op!.toUpperCase()} ${ph}`;
      }).filter(Boolean);
      if (orParts.length) parts.push(`(${orParts.join(" OR ")})`);
    }

    return { clause: parts.length ? `WHERE ${parts.join(" AND ")}` : "", params };
  }

  async then(resolve: (result: any) => void, reject?: (err: any) => void): Promise<void> {
    try {
      const result = await this._execute();
      resolve(result);
    } catch (err) {
      if (reject) reject(err);
      else throw err;
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

      const cols = !this._select || this._select === "*" ? "*"
        : this._select.split(",").map((c) => {
            const t = c.trim();
            if (t.includes("(") || t === "*" || t.includes(" ")) return t;
            return `"${t}"`;
          }).join(", ");
      let sql = `SELECT ${cols} FROM "${this._table}" ${clause}`;
      if (this._order.length) {
        sql += ` ORDER BY ${this._order.map((o) => `"${o.col}" ${o.asc ? "ASC" : "DESC"}`).join(", ")}`;
      }
      if (this._limit) sql += ` LIMIT ${this._limit}`;

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

/** Drop-in replacement for createClient(url, key).from(table) usage */
export function createDbClient() {
  return {
    from: (table: string) => new QueryBuilder(table),
    rpc: async (fn: string, _args?: Record<string, unknown>) => {
      // Stub — RPC calls are not supported. Return graceful no-op.
      console.warn(`[dbCompat] rpc("${fn}") called — not supported, returning null`);
      return { data: null, error: null };
    },
  };
}

/** Convenience: create a compat client (ignores url/key — uses DATABASE_URL) */
export function createClient(_url?: string, _key?: string, _opts?: unknown) {
  return createDbClient();
}
