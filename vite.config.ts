import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Client dev server proxies /api to the Express server (see server/index.ts).
// This keeps the EIA_API_KEY server-side: the browser only ever talks to
// same-origin /api/energy/* routes, never to api.eia.gov directly.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:8787",
        changeOrigin: true
      }
    }
  },
  resolve: {
    alias: {
      "@shared": "/shared"
    }
  },
  build: {
    outDir: "dist",
    sourcemap: true
  }
});
