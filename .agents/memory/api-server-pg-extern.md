---
name: api-server pg externalization
description: pg must be externalized from the esbuild bundle AND present in api-server's node_modules
---

## The rule
In `artifacts/api-server/build.mjs`, pg must be listed in the `external` array. Additionally, the compiled `pg` package must be symlinked from the pnpm content-addressable store into `artifacts/api-server/node_modules/pg`.

**Why:** pg uses native bindings and dynamic requires that break when bundled by esbuild. Externalizing makes esbuild leave `require('pg')` as-is in the output. But since api-server's `node_modules/` doesn't have pg directly (pnpm hoists it), Node.js can't resolve it at runtime. The symlink bridges the gap.

**How to apply:** 
1. Add `'pg'` to the `external` array in build.mjs
2. Run: `PG_PATH=$(find /root/.local/share/pnpm/store -name "pg" -type d -maxdepth 6 2>/dev/null | head -1)` and `ln -sf $PG_PATH artifacts/api-server/node_modules/pg`
3. Rebuild: `pnpm --filter @workspace/api-server run build`
