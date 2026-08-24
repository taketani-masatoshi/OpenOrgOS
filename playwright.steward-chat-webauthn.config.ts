import { defineConfig } from "@playwright/test";

const webauthnSmokePort = process.env.STEWARD_CHAT_WEBAUTHN_SMOKE_PORT ?? "9477";
const webauthnBaseUrl =
  process.env.STEWARD_CHAT_WEBAUTHN_BASE_URL ?? `http://localhost:${webauthnSmokePort}`;

export default defineConfig({
  testDir: "e2e",
  testMatch: "steward-chat-webauthn.smoke.spec.ts",
  timeout: 60_000,
  workers: 1,
  use: {
    baseURL: webauthnBaseUrl,
    trace: "off",
    locale: "ja-JP",
  },
  webServer: process.env.STEWARD_CHAT_WEBAUTHN_BASE_URL
    ? undefined
    : {
        command: "node --import tsx scripts/run-steward-chat-webauthn-smoke-server.ts",
        url: `${webauthnBaseUrl}/health`,
        reuseExistingServer: false,
        timeout: 120_000,
      },
});
