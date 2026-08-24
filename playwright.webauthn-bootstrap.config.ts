import { defineConfig } from "@playwright/test";

const bootstrapSmokePort = process.env.WIRE_CONSOLE_WEBAUTHN_BOOTSTRAP_SMOKE_PORT ?? "9478";
const bootstrapBaseUrl =
  process.env.WIRE_CONSOLE_WEBAUTHN_BOOTSTRAP_BASE_URL ?? `http://localhost:${bootstrapSmokePort}`;

export default defineConfig({
  testDir: "e2e",
  testMatch: "wire-console-webauthn-bootstrap-invalid.smoke.spec.ts",
  timeout: 60_000,
  workers: 1,
  use: {
    baseURL: bootstrapBaseUrl,
    trace: "off",
  },
  webServer: process.env.WIRE_CONSOLE_WEBAUTHN_BOOTSTRAP_BASE_URL
    ? undefined
    : {
        command: "node --import tsx scripts/run-wire-console-webauthn-bootstrap-smoke-server.ts",
        url: `${bootstrapBaseUrl}/health`,
        reuseExistingServer: false,
        timeout: 120_000,
      },
});
