import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appsRoot = path.resolve(__dirname, "..");

/** Combined Operator Console sets VITE_BASE=/wire/ and VITE_OUT_DIR=dist-combined */
const base = process.env.VITE_BASE?.trim() || "/";
const outDir = process.env.VITE_OUT_DIR?.trim() || "dist";

export default defineConfig({
  plugins: [react()],
  base,
  resolve: {
    alias: {
      "@ops-shared": path.resolve(appsRoot, "shared"),
    },
  },
  build: {
    outDir,
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    fs: {
      allow: [appsRoot],
    },
    proxy: {
      "/console": "http://127.0.0.1:9470",
      "/health": "http://127.0.0.1:9470",
    },
  },
});
