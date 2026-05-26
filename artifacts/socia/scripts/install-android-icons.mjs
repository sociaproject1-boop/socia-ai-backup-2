#!/usr/bin/env node
/**
 * install-android-icons.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Copies the staged Socia-branded Android resources (produced by
 * `scripts/generate-android-icons.mjs` into `resources/android-res/`) into
 * the live Gradle project at `android/app/src/main/res/` that Capacitor
 * creates when `npx cap add android` runs.
 *
 * Safety contract:
 *   • NEVER wipes the live res/ tree — copies file-by-file, only touching
 *     paths the generator owns. Any non-icon resources Capacitor or the
 *     developer adds (strings.xml, file_paths.xml, navigation graphs, …)
 *     are left untouched.
 *   • Refuses to run if `android/` doesn't exist yet, telling the user to
 *     run `pnpm cap:add:android` first. This avoids accidentally creating
 *     a half-populated `android/` that would then block `cap add android`.
 *   • Idempotent — safe to re-run after every `cap sync` or whenever the
 *     source logo changes.
 *
 * Workflow on a developer's machine (with Android SDK installed):
 *   1. pnpm --filter @workspace/socia run icons:generate    # build staged assets
 *   2. pnpm --filter @workspace/socia run cap:add:android   # one-time platform add
 *   3. pnpm --filter @workspace/socia run icons:install     # this script
 *   4. # apply AndroidManifest.xml edits documented in android-res/README
 *   5. pnpm --filter @workspace/socia run cap:open:android
 */

import { cp, access, readdir, stat, mkdir } from "node:fs/promises";
import { constants } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const HERE     = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = join(HERE, "..");
const STAGED   = join(PKG_ROOT, "resources", "android-res");
const LIVE     = join(PKG_ROOT, "android", "app", "src", "main", "res");

async function exists(p) {
  try { await access(p, constants.F_OK); return true; } catch { return false; }
}

/** Recursively list every file in `dir`, returning paths relative to `dir`. */
async function walk(dir, base = dir) {
  const out = [];
  for (const entry of await readdir(dir)) {
    const full = join(dir, entry);
    const s = await stat(full);
    if (s.isDirectory()) out.push(...await walk(full, base));
    else out.push(relative(base, full));
  }
  return out;
}

async function main() {
  if (!await exists(STAGED)) {
    console.error("✗ No staged icons at:", STAGED);
    console.error("  Run `pnpm icons:generate` first.");
    process.exit(1);
  }
  if (!await exists(join(PKG_ROOT, "android"))) {
    console.error("✗ No Android platform yet. Run `pnpm cap:add:android` first.");
    console.error("  (That command requires the Android SDK — run it on your dev");
    console.error("   machine, not inside the Replit container.)");
    process.exit(1);
  }

  /* Per-file copy so we never delete unrelated resources the developer
     or Capacitor may have placed in res/ (strings.xml, file_paths.xml,
     navigation graphs, custom drawables, etc.). */
  const files = await walk(STAGED);
  let copied = 0;
  for (const rel of files) {
    const from = join(STAGED, rel);
    const to   = join(LIVE,   rel);
    await mkdir(dirname(to), { recursive: true });
    await cp(from, to, { force: true });
    copied++;
  }
  console.log(`✓ Installed ${copied} Socia icon resources into:`);
  console.log(`  ${LIVE}`);
  console.log("");
  console.log("Next: apply the AndroidManifest.xml edits documented in:");
  console.log(`  ${join(STAGED, "README.md")}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
