import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

/* PORT and BASE_PATH default for standalone (out-of-Replit) usage so a plain
 * `vite` / `vite build` works without any env setup. Replit & Capacitor builds
 * still override them via the workflow / build:cap script. */
const rawPort = process.env.PORT ?? "5173";
const port = Number(rawPort);
if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}
const basePath = process.env.BASE_PATH ?? "/";

// Cartographer and DevBanner are disabled in dev to reduce FS-watching overhead
// and lower idle CPU / credit consumption during active development.
// Re-enable by setting ENABLE_REPLIT_PLUGINS=1 in the environment.
const enableReplitPlugins =
  process.env.NODE_ENV !== "production" &&
  process.env.REPL_ID !== undefined &&
  process.env.ENABLE_REPLIT_PLUGINS === "1";

export default defineConfig({
  base: basePath,
  plugins: [
    react(),
    tailwindcss(),
    runtimeErrorOverlay(),
    ...(enableReplitPlugins
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, ".."),
            }),
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        // Split heavy vendor libraries into separate cached chunks.
        // Each chunk is hashed independently — updating the app code
        // does NOT bust the React or Supabase cache in the browser.
        manualChunks(id) {
          if (id.includes("/node_modules/react-dom/") || id.includes("/node_modules/react/")) {
            return "vendor-react";
          }
          if (id.includes("/node_modules/@supabase/")) {
            return "vendor-supabase";
          }
          if (id.includes("/node_modules/framer-motion/")) {
            return "vendor-motion";
          }
          if (id.includes("/node_modules/lucide-react/")) {
            return "vendor-icons";
          }
          if (id.includes("/node_modules/zustand/") || id.includes("/node_modules/immer/")) {
            return "vendor-state";
          }
        },
      },
    },
  },
  server: {
    port,
    strictPort: true,
    host: "0.0.0.0",
    allowedHosts: true,
    fs: {
      strict: true,
    },
    hmr: {
      overlay: false,
    },
    watch: {
      // Use polling only when explicitly requested (e.g. Docker); otherwise
      // rely on native inotify which is far cheaper on CPU.
      usePolling: false,
    },
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
  },
  optimizeDeps: {
    // Crawl eagerly so the first page load doesn't trigger a re-optimization
    // waterfall that spins up extra CPU work.
    holdUntilCrawlEnd: false,
  },
});
