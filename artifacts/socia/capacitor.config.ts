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
};

export default config;
