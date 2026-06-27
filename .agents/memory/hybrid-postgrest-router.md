---
name: Hybrid PostgREST router
description: dbCompat.ts routes queries to Supabase PostgREST vs Replit heliumdb based on HELIUMDB_TABLES set; FK-join selects require two-step batch fetch.
---

## Rule
`dbCompat.ts` now has two query backends gated by `HELIUMDB_TABLES`:
- Tables in the set → `QueryBuilder` (Replit PG via pg Pool)
- All others → `SupabaseRestBuilder` (Supabase PostgREST via service-role fetch)

`HELIUMDB_TABLES` = conversations, messages, users, credit_ledger, usage_receipts, render_jobs, socia_gpt_memory, studio_projects, super_admins, admin_audit_log, ai_enforcement_events, ai_governance_config.

**Why:** After migration to Replit, app-data tables (posts, comments, follows, likes, etc.) only exist in Supabase. Routing everything to heliumdb caused "relation X does not exist" 500 errors across the entire app.

## FK-join selects break SupabaseRestBuilder
PostgREST FK-join syntax (`alias:table!fk_constraint_name(cols)`) fails with "Could not find a relationship" if the FK constraint doesn't exist or is named differently in Supabase's schema cache.

**Fix pattern:** Replace FK-join select with a flat `select("*")`, then batch-fetch authors/viewers/users in a second query and merge.

Routes fixed this way:
- `comments` → `attachCommentAuthors()` helper (GET, POST, PUT routes)
- `pulses` feed, pulse_views, admin-reported → `attachUsers(rows, idCol, fieldName)` helper  
- `reports` (owner reports) → inline IIFE two-step

**How to apply:** Any time a `.select()` string contains `!` (FK join) and the table routes to Supabase (not heliumdb), convert to two-step: flat select then batch user fetch by the FK column.

## SupabaseRestBuilder capability
Supports: select, insert, update, delete, upsert, eq/neq/gt/gte/lt/lte/in/is/ilike/like/or/not/contains, order, limit, range, single, maybeSingle, count. Returns `{ data, error, count }` matching Supabase JS client shape.
