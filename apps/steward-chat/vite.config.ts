import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    proxy: {
      "/chat": "http://127.0.0.1:9471",
      "/health": "http://127.0.0.1:9471",
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
