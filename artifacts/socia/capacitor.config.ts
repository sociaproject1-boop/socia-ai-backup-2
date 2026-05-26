import type { CapacitorConfig } from "@capacitor/cli";

/* ──────────────────────────────────────────────────────────────────────── *
 *  Capacitor configuration — Socia Android wrapper                          *
 *  ────────────────────────────────────────────────────────────────────────  *
 *  • appId        — Java-style reverse-DNS package name (must contain a    *
 *                   dot, lowercase, no hyphens). Do NOT change after       *
 *                   shipping the first APK — Android treats a different    *
 *                   appId as a completely different app.                    *
 *  • webDir       — must point at the Vite build output (`dist/`). Run    *
 *                   `pnpm --filter @workspace/socia build` before          *
 *                   `npx cap sync` so the latest assets are copied.        *
 *  • server.androidScheme — "https" lets Android trust localhost-served    *
 *                   content as a secure context, which is REQUIRED for     *
 *                   `getUserMedia`, WebRTC, and the Web Crypto APIs we    *
 *                   rely on.                                                *
 *  ────────────────────────────────────────────────────────────────────── */

const config: CapacitorConfig = {
  appId:   "socia.app",
  appName: "socia.app",
  /* Vite emits to `dist/public/` (set in vite.config.ts) — point Capacitor
   * at the same folder so `cap sync` copies the freshly-built bundle. */
  webDir:  "dist/public",
  server: {
    androidScheme: "https",
  },
  android: {
    allowMixedContent: false,
  },
  /* SplashScreen — provided by @capacitor/splash-screen (installed as a
   * runtime dep). Plays alongside the Android 12+ themed splash defined
   * in `values/styles.xml#SplashTheme`. backgroundColor must match
   * colors.xml#splashBackground (#05060B) so there is no flash between
   * the native themed splash and the plugin's overlay. The plugin must
   * also be registered by adding `SplashScreen.hide()` in MainActivity
   * (Capacitor does this automatically when @capacitor/splash-screen is
   * present at `cap sync` time, no manual edit required). */
  plugins: {
    SplashScreen: {
      launchShowDuration:           1200,
      launchAutoHide:               true,
      launchFadeOutDuration:        450,
      backgroundColor:              "#05060BFF",
      androidSplashResourceName:    "splash",
      androidScaleType:             "CENTER_CROP",
      showSpinner:                  false,
      splashFullScreen:             true,
      splashImmersive:              true,
    },
  },
};

export default config;
