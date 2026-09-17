import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appsRoot = path.resolve(__dirname, "..");
const coreRoot = path.resolve(appsRoot, "..");

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@ops-shared": path.resolve(appsRoot, "shared"),
      "@wire-console": path.resolve(appsRoot, "wire-console/src"),
      "@orgos/workflow-canvas": path.resolve(coreRoot, "src/lib/workflow-canvas/browser.ts"),
    },
  },
  server: {
    port: 5174,
    fs: {
      allow: [appsRoot, coreRoot],
    },
    proxy: {
      "/chat": "http://127.0.0.1:9471",
      "/health": "http://127.0.0.1:9471",
      "/console": "http://127.0.0.1:9470",
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
