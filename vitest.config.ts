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
      "@orgos/workflow-canvas": path.join(__dirname, "src/lib/workflow-canvas/index.ts"),
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    globalSetup: ["tests/global-setup-mal-payroll.ts"],
    setupFiles: ["tests/setup-tenant.ts", "tests/setup-restore-protocol.ts"],
    env: {
      // ADR 0037 — default off in unit tests; settlement-stepup.test.ts enables it.
      ORGOS_SETTLEMENT_STEPUP: "0",
    },
    // Several suites (escalate/queue/routing/phase2/phase3) share the `mal`
    // tenant's routing-queue on disk. Running test files sequentially removes
    // cross-file races on those shared JSONL/work-order files so CI is reliable.
    fileParallelism: false,
    // Long sequential suites can exceed birpc's 60s onTaskUpdate window and
    // fail the run even when every test passed. Ignore those worker RPC errors
    // in CI; assertion failures still fail the process via test results.
    dangerouslyIgnoreUnhandledErrors: process.env.CI === "true",
    // setup-restore-protocol serializes fixture restores across concurrent
    // Vitest processes. Lock wait defaults to 90s (ORGOS_TEST_LOCK_TIMEOUT_MS);
    // hookTimeout must stay above that so beforeAll is not killed first.
    hookTimeout: 120_000,
    testTimeout: 120_000,
  },
});
