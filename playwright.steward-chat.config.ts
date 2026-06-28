import { defineConfig } from "@playwright/test";

const smokePort = process.env.STEWARD_CHAT_SMOKE_PORT ?? "9473";
const smokeBaseUrl = process.env.STEWARD_CHAT_BASE_URL ?? `http://127.0.0.1:${smokePort}`;

export default defineConfig({
  testDir: "e2e",
  testMatch: ["steward-chat.smoke.spec.ts", "steward-chat.wire.spec.ts", "steward-chat.witness.spec.ts"],
  timeout: 60_000,
  workers: 1,
  use: {
    baseURL: smokeBaseUrl,
    trace: "off",
  },
  webServer: process.env.STEWARD_CHAT_BASE_URL
    ? undefined
    : {
        command: "node --import tsx scripts/run-steward-chat-smoke-server.ts",
        url: `${smokeBaseUrl}/health`,
        reuseExistingServer: false,
        timeout: 120_000,
      },
});
