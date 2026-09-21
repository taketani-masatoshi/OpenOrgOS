import { defineConfig } from "vitest/config";

// This suite provisions its own synthetic workspace. Do not inherit the legacy
// setupFiles/globalSetup: they restore committed operational tenant fixtures.
export default defineConfig({
  test: {
    include: ["tests/customer-journey-http.test.ts"],
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 15_000,
  },
});
