import { defineConfig } from "@playwright/test";

/**
 * Integration suite — runs against the real services in `deploy/integration/`
 * and against a console started with the same environment. Unlike the smoke
 * config it never starts a stubbed server for you: if the environment is not
 * there, the tests skip and record no evidence.
 */
const port = process.env.STEWARD_CHAT_SMOKE_PORT ?? "9473";
const baseURL = process.env.ORGOS_INTEGRATION_BASE_URL ?? `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "e2e",
  testMatch: ["orgos-integration.spec.ts"],
  timeout: 120_000,
  workers: 1,
  use: {
    baseURL,
    trace: "off",
  },
});
