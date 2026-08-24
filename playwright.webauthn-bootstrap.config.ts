import { defineConfig } from "@playwright/test";

const port = process.env.WIRE_CONSOLE_WEBAUTHN_BOOTSTRAP_SMOKE_PORT ?? "9474";
const baseUrl =
  process.env.WIRE_CONSOLE_WEBAUTHN_BOOTSTRAP_BASE_URL ?? `http://localhost:${port}`;

export default defineConfig({
  testDir: "e2e",
  testMatch: "wire-console-webauthn-bootstrap.smoke.spec.ts",
  timeout: 90_000,
  workers: 1,
  use: {
    baseURL: baseUrl,
    trace: "off",
  },
  webServer: process.env.WIRE_CONSOLE_WEBAUTHN_BOOTSTRAP_BASE_URL
    ? undefined
    : {
        command: "node --import tsx scripts/run-wire-console-webauthn-bootstrap-smoke-server.ts",
        url: `${baseUrl}/health`,
        reuseExistingServer: false,
        timeout: 120_000,
      },
});
