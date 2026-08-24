import { defineConfig } from "@playwright/test";

const webauthnSmokePort = process.env.WIRE_CONSOLE_WEBAUTHN_SMOKE_PORT ?? "9473";
const webauthnBaseUrl =
  process.env.WIRE_CONSOLE_WEBAUTHN_BASE_URL ?? `http://localhost:${webauthnSmokePort}`;

export default defineConfig({
  testDir: "e2e",
  testMatch: [
    "wire-console-settlement-stepup.smoke.spec.ts",
    "wire-console-webauthn.smoke.spec.ts",
    "passkey-settings-handoff.smoke.spec.ts",
    "passkey-settings-stability.smoke.spec.ts",
    "wire-console-z-settlement-passkey.smoke.spec.ts",
  ],
  timeout: 60_000,
  workers: 1,
  use: {
    baseURL: webauthnBaseUrl,
    trace: "off",
    locale: "ja-JP",
  },
  webServer: process.env.WIRE_CONSOLE_WEBAUTHN_BASE_URL
    ? undefined
    : {
        command: "node --import tsx scripts/run-wire-console-webauthn-smoke-server.ts",
        url: `${webauthnBaseUrl}/health`,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
