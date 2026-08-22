import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appsRoot = path.resolve(__dirname, "..");

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@ops-shared": path.resolve(appsRoot, "shared"),
    },
  },
  server: {
    port: 5174,
    fs: {
      allow: [appsRoot],
    },
    proxy: {
      "/chat": "http://127.0.0.1:9471",
      "/health": "http://127.0.0.1:9471",
      "/wire": "http://127.0.0.1:9470",
      "/console": "http://127.0.0.1:9470",
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
