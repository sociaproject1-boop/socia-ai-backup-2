---
name: dbCompat PostgREST select parser
description: dbCompat.ts has a parseSelectCols() function that converts Supabase/PostgREST-style relationship selects into proper PostgreSQL subqueries.
---

## Rule
`artifacts/api-server/src/lib/dbCompat.ts` contains `parseSelectCols(rawSelect, mainTable)` — a depth-0-comma parser that converts PostgREST relationship selects to SQL lateral subqueries.

## Pattern handled
```
author:users!posts_author_id_fkey(id, name, ...)   → row_to_json subquery  (FK hint = FK on mainTable)
media:post_media(id, url, ...)                      → json_agg subquery     (no FK hint = backward FK)
creator:users(id)                                   → row_to_json subquery  (relTable=users → forward FK)
```

**Why:** The server uses `dbCompat.ts` as a Supabase-compatible shim. Routes pass PostgREST select strings directly. Without parsing, PostgreSQL receives `:` characters and throws "syntax error at or near ":"".

**How to apply:** Any new route that uses `.select("alias:table!fk(...)")` style strings automatically goes through `parseSelectCols`. If a new relationship pattern fails, check:
1. FK hint present? → uses `mainTable_fkCol_fkey` → strip prefix + `_fkey`
2. No FK hint + `relTable === "users"` or alias in SINGULAR_ROLES → forward FK, col = `${alias}_id`
3. No FK hint + other → backward FK, col = `${singular(mainTable)}_id`

## Two getServiceClient() implementations — IMPORTANT
- `lib/adminAuth.ts → getServiceClient()` → returns `createDbClient()` (dbCompat compat shim) ✅
- `lib/renderJobsDb.ts → getServiceClient()` → also returns `createDbClient()` ✅ (was returning raw Drizzle `db` — fixed)

If a route imports `getServiceClient` from `renderJobsDb.ts` and gets TS error "Property 'from' does not exist on NodePgDatabase", the fix is to change that import to `adminAuth.ts` or ensure `renderJobsDb.ts` re-exports the dbCompat version.

## dbCompat capabilities (as of this fix)
- `.select(cols?)` — optional, defaults to `*`; PostgREST relationships auto-converted
- `.range(from, to)` → `LIMIT (to-from+1) OFFSET from`
- `.not(col, op, val)` → NOT filter (supports `is null`, `eq`, `in`)
- `.catch()` / `.finally()` / `[Symbol.toStringTag]` → full Promise compatibility
- `.storage` / `.auth` → graceful no-op stubs (no real Supabase storage/auth in this env)
- `.rpc()` → always returns `{data: null, error: null}` — stub only
