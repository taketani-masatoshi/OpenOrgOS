import { defineConfig } from "@playwright/test";

const oidcSmokePort = process.env.WIRE_CONSOLE_OIDC_SMOKE_PORT ?? "9474";
const oidcBaseUrl =
  process.env.WIRE_CONSOLE_OIDC_BASE_URL ?? `http://127.0.0.1:${oidcSmokePort}`;

export default defineConfig({
  testDir: "e2e",
  testMatch: "wire-console-oidc.smoke.spec.ts",
  timeout: 60_000,
  workers: 1,
  use: {
    baseURL: oidcBaseUrl,
    trace: "off",
  },
  webServer: process.env.WIRE_CONSOLE_OIDC_BASE_URL
    ? undefined
    : {
        command: "node --import tsx scripts/run-wire-console-oidc-smoke-server.ts",
        url: `${oidcBaseUrl}/health`,
        reuseExistingServer: false,
        timeout: 120_000,
      },
});
