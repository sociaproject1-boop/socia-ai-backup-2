#!/usr/bin/env bash
set -euo pipefail

echo "=== [build-prod] Step 0: Build lib packages (force-generate .d.ts declarations) ==="
# --force bypasses the .tsbuildinfo cache so dist/*.d.ts files are always
# regenerated even when the cache thinks nothing has changed (e.g. fresh clone
# where dist/ is gitignored and missing but .tsbuildinfo still exists).
node_modules/.bin/tsc --build --force

echo "=== [build-prod] Step 1: Typecheck api-server ==="
pnpm --filter @workspace/api-server run typecheck

echo "=== [build-prod] Step 2: Build React frontend ==="
NODE_ENV=production pnpm --filter @workspace/socia run build

echo "=== [build-prod] Step 3: Build API server ==="
NODE_ENV=production pnpm --filter @workspace/api-server run build

echo "=== [build-prod] Step 4: Copy frontend dist → API server dist/public ==="
FRONTEND_DIST="artifacts/socia/dist/public"
API_DIST="artifacts/api-server/dist/public"

rm -rf "$API_DIST"
cp -r "$FRONTEND_DIST" "$API_DIST"
echo "  Copied $(find "$API_DIST" -type f | wc -l) files → $API_DIST"

echo "=== [build-prod] Done! ==="
