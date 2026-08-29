import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appsRoot = path.join(__dirname, "apps");

export default defineConfig({
  resolve: {
    alias: {
      "@ops-shared": path.join(appsRoot, "shared"),
      "@wire-console": path.join(appsRoot, "wire-console/src"),
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    setupFiles: ["tests/setup-tenant.ts", "tests/setup-restore-protocol.ts"],
    env: {
      // ADR 0037 — default off in unit tests; settlement-stepup.test.ts enables it.
      ORGOS_SETTLEMENT_STEPUP: "0",
    },
    // Several suites (escalate/queue/routing/phase2/phase3) share the `mal`
    // tenant's routing-queue on disk. Running test files sequentially removes
    // cross-file races on those shared JSONL/work-order files so CI is reliable.
    fileParallelism: false,
    // setup-restore-protocol serializes fixture restores across concurrent
    // Vitest processes. Lock wait defaults to 90s (ORGOS_TEST_LOCK_TIMEOUT_MS);
    // hookTimeout must stay above that so beforeAll is not killed first.
    hookTimeout: 120_000,
    testTimeout: 60_000,
  },
});
