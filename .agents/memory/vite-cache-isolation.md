---
name: Vite cache isolation
description: Two concurrent Vite instances sharing the same cacheDir cause persistent 504 Outdated Optimize Dep errors
---

## The rule
Always set `cacheDir: \`node_modules/.vite-\${port}\`` in vite.config.ts defineConfig when the app may run as multiple Vite instances with different ports.

**Why:** The pnpm monorepo runs a `socia` workflow (port 5000) and an `artifacts/socia: web` workflow (port 21175). Both resolve to the same `artifacts/socia/` directory. When they share `node_modules/.vite`, each restart writes new dep hashes that invalidate the other instance's hashes, causing browsers to receive 504 for every cached dep URL.

**How to apply:** In `artifacts/socia/vite.config.ts`, after extracting `port` from process.env.PORT, add `cacheDir: \`node_modules/.vite-\${port}\`` as the second key in defineConfig. When applying the fix: delete all existing `.vite*` directories first (`rm -rf node_modules/.vite*`), then restart the `socia` workflow.
