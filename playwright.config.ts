import { defineConfig } from "@playwright/test";

const smokePort = process.env.WIRE_CONSOLE_SMOKE_PORT ?? "9472";
const smokeBaseUrl = process.env.WIRE_CONSOLE_BASE_URL ?? `http://127.0.0.1:${smokePort}`;

export default defineConfig({
  testDir: "e2e",
  testMatch: "wire-console.smoke.spec.ts",
  timeout: 90_000,
  workers: 1,
  globalTeardown: "./e2e/wire-console-teardown.ts",
  use: {
    baseURL: smokeBaseUrl,
    trace: "off",
  },
  webServer: process.env.WIRE_CONSOLE_BASE_URL
    ? undefined
    : {
        command: "node --import tsx scripts/run-wire-console-smoke-server.ts",
        url: `${smokeBaseUrl}/health`,
        reuseExistingServer: false,
        timeout: 120_000,
      },
});
