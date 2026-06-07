#!/usr/bin/env bash
set -euo pipefail

echo "=== [build-prod] Step 1: Build React frontend ==="
NODE_ENV=production pnpm --filter @workspace/socia run build

echo "=== [build-prod] Step 2: Build API server ==="
NODE_ENV=production pnpm --filter @workspace/api-server run build

echo "=== [build-prod] Step 3: Copy frontend dist → API server dist/public ==="
FRONTEND_DIST="artifacts/socia/dist/public"
API_DIST="artifacts/api-server/dist/public"

rm -rf "$API_DIST"
cp -r "$FRONTEND_DIST" "$API_DIST"
echo "  Copied $(find "$API_DIST" -type f | wc -l) files → $API_DIST"

echo "=== [build-prod] Done! ==="
