#!/usr/bin/env node
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  startStewardChatServer,
  STEWARD_CHAT_SPA_DIST,
} from "../src/lib/steward-chat/server.js";
import { writeWireConsoleWebAuthnSmokeFixture } from "../tests/helpers/wire-console-webauthn-e2e-fixture.js";

async function main(): Promise<void> {
  if (!existsSync(join(STEWARD_CHAT_SPA_DIST, "index.html"))) {
    console.error("Steward Chat SPA not built. Run: npm run steward-chat:build");
    process.exit(1);
  }

  process.env.WIRE_CONSOLE_AUTH = "prod";
  process.env.WIRE_CONSOLE_PROD_ADAPTER = "webauthn";
  process.env.WIRE_CONSOLE_WEBAUTHN_RP_ID = "localhost";
  delete process.env.WIRE_CONSOLE_E2E_WEBAUTHN;
  const port = Number(process.env.STEWARD_CHAT_WEBAUTHN_SMOKE_PORT ?? 9477);
  process.env.WIRE_CONSOLE_WEBAUTHN_ORIGIN = `http://localhost:${port}`;
  process.env.WIRE_CONSOLE_WEBAUTHN_SMOKE_PORT = String(port);
  delete process.env.WIRE_CONSOLE_WEBAUTHN_TEST_SECRET;
  delete process.env.WIRE_CONSOLE_WEBAUTHN_ALLOW_TEST_SECRET;
  process.env.STEWARD_CHAT_AUTH = "1";
  process.env.ORGOS_CSRF = "0";
  process.env.ORGOS_RATE_LIMIT = "0";

  writeWireConsoleWebAuthnSmokeFixture();

  const server = startStewardChatServer({ host: "127.0.0.1", port });
  console.log(`steward-chat webauthn smoke server ${server.url}`);

  const shutdown = (): void => server.close();
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  await new Promise<void>(() => {
    /* keep alive for playwright webServer */
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
