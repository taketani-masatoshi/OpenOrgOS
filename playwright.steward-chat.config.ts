import { defineConfig } from "@playwright/test";

const smokePort = process.env.STEWARD_CHAT_SMOKE_PORT ?? "9473";
const smokeBaseUrl = process.env.STEWARD_CHAT_BASE_URL ?? `http://127.0.0.1:${smokePort}`;

export default defineConfig({
  testDir: "e2e",
  testMatch: [
    "steward-chat.smoke.spec.ts",
    "steward-chat.runboard.spec.ts",
    "steward-chat.wire.spec.ts",
    "steward-chat.witness.spec.ts",
    "steward-chat-ledger-customer.spec.ts",
    "steward-chat-esign.spec.ts",
    "steward-chat.receipt.spec.ts",
    "steward-chat-console-ia.spec.ts",
    "steward-chat.money.spec.ts",
    "steward-chat.books.spec.ts",
    "steward-chat.mail.spec.ts",
    "steward-chat.stripe.spec.ts",
    "steward-chat.claims.spec.ts",
    "steward-chat.governance.spec.ts",
    "steward-chat.tax.spec.ts",
    "steward-chat.ops.spec.ts",
    "steward-chat.product.spec.ts",
  ],
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
