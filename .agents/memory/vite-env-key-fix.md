---
name: Vite env key truncation fix
description: VITE_SUPABASE_ANON_KEY is silently truncated by Replit to 157 chars; must patch via vite.config.ts
---

## The rule
At the very top of `artifacts/socia/vite.config.ts` (before any import.meta or defineConfig), patch process.env to copy the complete key from SUPABASE_ANON_KEY into VITE_SUPABASE_ANON_KEY if the latter is absent or shorter than 200 chars.

**Why:** Replit strips long env var values when they pass through the VITE_ prefix exposure mechanism. The complete JWT is 208 chars; the truncated version is 157 chars (invalid JWT). The patch runs at vite.config.ts evaluation time (Node.js context), before Vite reads the env.

**How to apply:** Keep the patch block at lines 1–12 of vite.config.ts. The block reads `process.env.SUPABASE_ANON_KEY` and writes it to `process.env.VITE_SUPABASE_ANON_KEY`. Verify: `curl localhost:5000/src/lib/supabase.ts | grep VITE_SUPABASE_ANON_KEY` should return 235+ chars.
