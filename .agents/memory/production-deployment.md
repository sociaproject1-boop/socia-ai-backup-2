---
name: Production deployment setup
description: How this monorepo is configured for production (autoscale) deployment — build script, static serving, Express 5 quirks.
---

# Production Deployment — Socia Monorepo

## Architecture
Single process in production: the Express API server (`artifacts/api-server`) serves both the REST API at `/api/*` AND the built React frontend static files at `/`.

## Build pipeline
`scripts/build-prod.sh` runs in order:
1. `NODE_ENV=production pnpm --filter @workspace/socia run build` → `artifacts/socia/dist/public/`
2. `NODE_ENV=production pnpm --filter @workspace/api-server run build` → `artifacts/api-server/dist/` (this clears dist/ first!)
3. `cp -r artifacts/socia/dist/public artifacts/api-server/dist/public` — copy frontend into API dist

**Why:** esbuild's `build.mjs` runs `rm -rf dist` before building. If you rebuild the API server alone after running the full build script, it wipes `dist/public/`. Always run the full script.

## Run command (production)
```
PORT=${PORT:-8080} NODE_ENV=production node artifacts/api-server/dist/index.mjs
```
Replit injects `PORT`; API server throws on startup if `PORT` is unset.

## Static serving in app.ts
Added after `/api` router, guarded by `NODE_ENV === 'production'`:
```typescript
const staticDir = process.env["STATIC_DIR"] ?? path.join(__dirname, "public");
app.use(express.static(staticDir, { maxAge: "1d", etag: true }));
// SPA fallback — must use app.use(), NOT app.get("*") which is invalid in Express 5
app.use((_req, res) => { res.sendFile(path.join(staticDir, "index.html")); });
```

**Why `app.use()` not `app.get("*")`:** Express 5 uses path-to-regexp v8 which treats `"*"` as invalid (PathError). The `app.use()` catch-all is Express 5 compatible.

## deployConfig (set via callback)
- `deploymentTarget: "autoscale"`
- `build: ["bash", "scripts/build-prod.sh"]`
- `run: ["bash", "-c", "PORT=${PORT:-8080} NODE_ENV=production node artifacts/api-server/dist/index.mjs"]`

## Splash screen
- `?nosplash=1` query param skips the 3.3 s splash animation for testing/screenshots.
- Screenshot tool always reloads the page — splash fires on every screenshot.

## Supabase FK hints in routes
- `sounds_creator_id_fkey` does NOT exist in the DB → use probe-once cache + graceful fallback
- `posts_author_id_fkey` DOES exist → use the hint for author joins
- `sound_usage_post_id_fkey` — ambiguous; use plain `posts(...)` from sound_usage table
- When multiple paths exist between tables (e.g. posts→users via author, likes, saves), PostgREST returns PGRST201; must use explicit FK hint (`users!posts_author_id_fkey`)
- Always validate UUID params before passing to Supabase — invalid UUIDs cause `22P02` and crash the route

## Lazy env var pattern (api-server)
Module-level `const SUPABASE_URL = process.env[...]` was the root cause of 500s when env vars aren't set at import time. Fixed pattern: read `process.env` inside each function (`db()`, `userDb()`) so the value is read at call time, not module load time.
