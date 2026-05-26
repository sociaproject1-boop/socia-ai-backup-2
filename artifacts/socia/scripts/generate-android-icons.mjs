#!/usr/bin/env node
/**
 * generate-android-icons.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Produces the full set of Android launcher / adaptive-icon / splash assets
 * from a single high-res source PNG at `resources/icon-source.png`.
 *
 * Output tree (staged at `resources/android-res/`, mirrors what
 * Capacitor's `android/app/src/main/res/` expects — `icons:install`
 * copies it in after `cap add android` creates the real project):
 *   mipmap-{mdpi,hdpi,xhdpi,xxhdpi,xxxhdpi}/
 *     ic_launcher.png            ← legacy square launcher (pre-API 26)
 *     ic_launcher_round.png      ← legacy round launcher
 *     ic_launcher_foreground.png ← adaptive foreground (108dp canvas, 66% safe)
 *   mipmap-anydpi-v26/
 *     ic_launcher.xml            ← adaptive icon (foreground + background)
 *     ic_launcher_round.xml
 *   drawable/
 *     splash.png                 ← single-density splash (centered logo on bg)
 *     ic_stat_notify.png         ← monochrome notification icon (24dp @ xxxhdpi)
 *   values/
 *     ic_launcher_background.xml ← adaptive background color resource
 *     colors.xml                 ← splash + brand colors
 *     styles.xml                 ← AppTheme + SplashTheme
 *
 * Why one script (not Capacitor Assets):
 *   `@capacitor/assets` writes directly into `android/`, which only exists
 *   after `npx cap add android` runs — and that requires the Android SDK,
 *   which isn't available in this Replit container. This script generates
 *   the resources into `resources/android-res/` so they live in the repo
 *   without blocking `cap add android` (which refuses to run when an
 *   `android/` folder already exists).
 *
 *   Re-run any time the source logo changes:  `pnpm icons:generate`
 *   Then push to the live project:            `pnpm icons:install`
 */

import sharp from "sharp";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE       = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT   = join(HERE, "..");
const SRC_ICON   = join(PKG_ROOT, "resources", "icon-source.png");
/* Staging location — intentionally OUTSIDE `android/`. Capacitor refuses
   to run `cap add android` if that folder already exists, so we keep the
   generated artwork in a sibling staging tree and let `icons:install`
   copy it into the live Gradle project AFTER `cap add android` runs. */
const RES_ROOT   = join(PKG_ROOT, "resources", "android-res");

/* Brand — deep near-black background lets the neon gradient pop on every
   device skin. Hex must stay in sync with values/ic_launcher_background.xml
   and the splash drawable below. */
const BG_HEX = "#05060B";
const BG_RGB = { r: 0x05, g: 0x06, b: 0x0b, alpha: 1 };

/* Android launcher density buckets. `legacy` is the pre-API-26 square
   launcher size (in px); `adaptive` is the 108dp adaptive-icon canvas. */
const DENSITIES = [
  { name: "mdpi",    legacy: 48,  adaptive: 108 },
  { name: "hdpi",    legacy: 72,  adaptive: 162 },
  { name: "xhdpi",   legacy: 96,  adaptive: 216 },
  { name: "xxhdpi",  legacy: 144, adaptive: 324 },
  { name: "xxxhdpi", legacy: 192, adaptive: 432 },
];

async function ensureDir(p) { await mkdir(p, { recursive: true }); }

/** Build a circular alpha mask the size of the legacy launcher icon. */
function circleMask(size) {
  const r = size / 2;
  const svg = `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
    <circle cx="${r}" cy="${r}" r="${r}" fill="white"/>
  </svg>`;
  return Buffer.from(svg);
}

/**
 * Legacy square launcher — uses the source artwork directly (it already has
 * a rounded-rect frame baked in, so we don't add another rounding pass).
 */
async function writeLegacySquare(outPath, size) {
  await sharp(SRC_ICON)
    .resize(size, size, { fit: "cover", kernel: "lanczos3" })
    .png({ compressionLevel: 9 })
    .toFile(outPath);
}

/** Legacy round launcher — same artwork, circle-masked. */
async function writeLegacyRound(outPath, size) {
  const base = await sharp(SRC_ICON)
    .resize(size, size, { fit: "cover", kernel: "lanczos3" })
    .png()
    .toBuffer();
  await sharp(base)
    .composite([{ input: circleMask(size), blend: "dest-in" }])
    .png({ compressionLevel: 9 })
    .toFile(outPath);
}

/**
 * Adaptive foreground — Android applies its own mask, so we must:
 *   1) draw onto a transparent 108dp canvas
 *   2) constrain the visible artwork to the inner 66dp safe zone so it
 *      doesn't get clipped by any system shape (circle / squircle / etc.)
 * The source logo already lives inside a rounded frame, so we render it
 * AS the foreground (no neon clipping) rather than trying to extract just
 * the "S" glyph. The black backdrop ensures consistency with the legacy
 * launcher when device skins fall back to it.
 */
async function writeAdaptiveForeground(outPath, canvas) {
  const safe = Math.round(canvas * (66 / 108));
  const logo = await sharp(SRC_ICON)
    .resize(safe, safe, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  const offset = Math.round((canvas - safe) / 2);
  await sharp({
    create: { width: canvas, height: canvas, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([{ input: logo, top: offset, left: offset }])
    .png({ compressionLevel: 9 })
    .toFile(outPath);
}

/**
 * Splash — single PNG, 1080×1920 portrait, centered logo at ~33% width on
 * the brand background. Capacitor's splash plugin (or Android 12+ themed
 * splash) scales this for every device.
 */
async function writeSplash(outPath) {
  const W = 1080, H = 1920;
  const LOGO = Math.round(W * 0.36);
  const logo = await sharp(SRC_ICON)
    .resize(LOGO, LOGO, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  await sharp({ create: { width: W, height: H, channels: 4, background: BG_RGB } })
    .composite([{ input: logo, top: Math.round((H - LOGO) / 2), left: Math.round((W - LOGO) / 2) }])
    .png({ compressionLevel: 9 })
    .toFile(outPath);
}

/**
 * Notification icon — Android requires a fully-white silhouette on a
 * transparent background for status-bar / heads-up notifications. We can't
 * fabricate a clean monochrome glyph from the gradient artwork, so we
 * approximate by thresholding the alpha of the source. Designers can drop
 * a hand-tuned `ic_stat_notify.png` later; until then this prevents the
 * default Android cog icon from showing in notifications.
 */
async function writeNotificationIcon(outPath) {
  const SIZE = 96; // 24dp @ xxxhdpi
  const src  = await sharp(SRC_ICON).resize(SIZE, SIZE, { fit: "contain" }).ensureAlpha().raw().toBuffer();
  const out  = Buffer.alloc(SIZE * SIZE * 4);
  for (let i = 0; i < SIZE * SIZE; i++) {
    const r = src[i * 4], g = src[i * 4 + 1], b = src[i * 4 + 2];
    // Treat anything brighter than near-black as foreground.
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const on  = lum > 30 ? 255 : 0;
    out[i * 4]     = 255;
    out[i * 4 + 1] = 255;
    out[i * 4 + 2] = 255;
    out[i * 4 + 3] = on;
  }
  await sharp(out, { raw: { width: SIZE, height: SIZE, channels: 4 } })
    .png({ compressionLevel: 9 })
    .toFile(outPath);
}

const ADAPTIVE_XML = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background"/>
    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
    <monochrome android:drawable="@mipmap/ic_launcher_foreground"/>
</adaptive-icon>
`;

const COLORS_XML = `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">${BG_HEX}</color>
    <color name="colorPrimary">#7C3AED</color>
    <color name="colorPrimaryDark">${BG_HEX}</color>
    <color name="colorAccent">#22D3EE</color>
    <color name="splashBackground">${BG_HEX}</color>
    <color name="splashStatusBar">${BG_HEX}</color>
</resources>
`;

/* AppTheme.NoActionBar matches what `cap add android` scaffolds, so the
   webview chrome stays consistent. SplashTheme is what AndroidManifest's
   launcher activity should use (android:theme="@style/SplashTheme") so the
   first frame is the branded dark splash instead of a white flash. */
const STYLES_XML = `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <style name="AppTheme" parent="Theme.AppCompat.DayNight.NoActionBar">
        <item name="colorPrimary">@color/colorPrimary</item>
        <item name="colorPrimaryDark">@color/colorPrimaryDark</item>
        <item name="colorAccent">@color/colorAccent</item>
    </style>
    <style name="AppTheme.NoActionBarLaunch" parent="AppTheme">
        <item name="android:background">@drawable/splash</item>
    </style>
    <style name="SplashTheme" parent="Theme.SplashScreen">
        <item name="windowSplashScreenBackground">@color/splashBackground</item>
        <item name="windowSplashScreenAnimatedIcon">@mipmap/ic_launcher_foreground</item>
        <item name="windowSplashScreenAnimationDuration">450</item>
        <item name="postSplashScreenTheme">@style/AppTheme</item>
    </style>
</resources>
`;

async function main() {
  /* Wipe only the subdirectories this script owns — never the staging
     root itself, because `resources/android-res/README.md` (workflow +
     AndroidManifest docs) lives there and must survive regeneration. */
  const ownedDirs = [
    "drawable",
    "mipmap-anydpi-v26",
    ...DENSITIES.map((d) => `mipmap-${d.name}`),
    "values",
  ];
  for (const sub of ownedDirs) {
    await rm(join(RES_ROOT, sub), { recursive: true, force: true });
  }
  await ensureDir(RES_ROOT);
  console.log("→ Wiped generated subfolders under:", RES_ROOT);

  for (const d of DENSITIES) {
    const dir = join(RES_ROOT, `mipmap-${d.name}`);
    await ensureDir(dir);
    console.log(`→ ${d.name}: legacy ${d.legacy}px, adaptive ${d.adaptive}px`);
    await Promise.all([
      writeLegacySquare(join(dir, "ic_launcher.png"), d.legacy),
      writeLegacyRound(join(dir, "ic_launcher_round.png"), d.legacy),
      writeAdaptiveForeground(join(dir, "ic_launcher_foreground.png"), d.adaptive),
    ]);
  }

  const anydpi = join(RES_ROOT, "mipmap-anydpi-v26");
  await ensureDir(anydpi);
  await writeFile(join(anydpi, "ic_launcher.xml"), ADAPTIVE_XML);
  await writeFile(join(anydpi, "ic_launcher_round.xml"), ADAPTIVE_XML);

  const drawable = join(RES_ROOT, "drawable");
  await ensureDir(drawable);
  await writeSplash(join(drawable, "splash.png"));
  await writeNotificationIcon(join(drawable, "ic_stat_notify.png"));

  const values = join(RES_ROOT, "values");
  await ensureDir(values);
  await writeFile(join(values, "ic_launcher_background.xml"),
    `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">${BG_HEX}</color>\n</resources>\n`);
  await writeFile(join(values, "colors.xml"),  COLORS_XML);
  await writeFile(join(values, "styles.xml"),  STYLES_XML);

  console.log("✓ Android icon resources generated at:", RES_ROOT);
}

main().catch((err) => { console.error(err); process.exit(1); });
