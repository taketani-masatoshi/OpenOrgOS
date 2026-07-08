import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    setupFiles: ["tests/setup-tenant.ts"],
    // Several suites (escalate/queue/routing/phase2/phase3) share the `mal`
    // tenant's routing-queue on disk. Running test files sequentially removes
    // cross-file races on those shared JSONL/work-order files so CI is reliable.
    fileParallelism: false,
  },
});
