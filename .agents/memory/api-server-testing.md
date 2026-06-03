---
name: api-server testing
description: How automated tests are run in artifacts/api-server (no vitest/jest).
---

# api-server testing

`artifacts/api-server` has no vitest/jest. Tests use Node's built-in test
runner (`node:test` + `node:assert/strict`) executed through `tsx` (from the
monorepo pnpm catalog) via the `test` script:
`pnpm --filter @workspace/api-server test`.

- Test files: `src/**/*.test.ts`. They are typechecked by `tsc` but excluded
  from the esbuild production bundle (build entry is `src/index.ts` only).
- Node runs each test FILE in its own process, so `globalThis.fetch` / `setIo`
  stubs in one file don't leak into another.
- `supabaseAuth.ts` throws at IMPORT time if `VITE_SUPABASE_URL` /
  `VITE_SUPABASE_ANON_KEY` are unset — set dummy env and `await import()` any
  route that transitively imports it; don't static-import such routes in tests.
- `store.ts` writes runtime state under `.monitoring/` (gitignored); reset
  override state in test teardown.
