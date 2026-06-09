---
name: Replit PG migration table target
description: The executeSql code_execution tool connects to a different database than the PGHOST=helium runtime DB; use api-server's pg driver to create schema.
---

## Rule
Never use the `executeSql` code_execution callback to create schema for this project. It connects to a separate internal DB, not the `heliumdb` that PGHOST=helium points to.

**Why:** During the Replit migration we ran `executeSql` to create all 12 tables. The api-server's Drizzle pool (connecting via PGHOST=helium) then errored with "relation does not exist" because `executeSql` wrote to a different Postgres instance entirely.

**How to apply:** To create or alter schema, run SQL via the api-server's own pg driver:
```bash
node --input-type=module << 'EOF'
import pg from './artifacts/api-server/node_modules/pg/lib/index.js';
const { Pool } = pg;
const pool = new Pool({ host: process.env.PGHOST, port: parseInt(process.env.PGPORT||'5432'), user: process.env.PGUSER, password: process.env.PGPASSWORD, database: process.env.PGDATABASE });
await pool.query('CREATE TABLE IF NOT EXISTS ...');
await pool.end();
EOF
```
This correctly targets `heliumdb` which is what the running api-server queries.
