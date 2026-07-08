import { defineConfig } from "@playwright/test";

const smokePort = process.env.OPERATOR_CONSOLE_SMOKE_PORT ?? "9476";
const smokeBaseUrl = process.env.OPERATOR_CONSOLE_BASE_URL ?? `http://127.0.0.1:${smokePort}`;

export default defineConfig({
  testDir: "e2e",
  testMatch: "operator-console*.spec.ts",
  timeout: 60_000,
  workers: 1,
  use: {
    baseURL: smokeBaseUrl,
    trace: "off",
  },
  webServer: process.env.OPERATOR_CONSOLE_BASE_URL
    ? undefined
    : {
        command: "node --import tsx scripts/run-operator-console-e2e-server.ts",
        url: `${smokeBaseUrl}/health`,
        reuseExistingServer: false,
        timeout: 180_000,
      },
});
