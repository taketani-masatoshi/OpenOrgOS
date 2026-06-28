#!/usr/bin/env node
import { existsSync } from "node:fs";
import { join } from "node:path";
import { startWireConsoleServer } from "../src/lib/wire-console/server.js";
import { WIRE_CONSOLE_SPA_DIST } from "../src/lib/wire-console/paths.js";
import { writeWireConsoleWebAuthnSmokeFixture } from "../tests/helpers/wire-console-webauthn-e2e-fixture.js";

async function main(): Promise<void> {
  if (!existsSync(join(WIRE_CONSOLE_SPA_DIST, "index.html"))) {
    console.error("Wire Console SPA not built. Run: npm run wire-console:build");
    process.exit(1);
  }

  process.env.WIRE_CONSOLE_AUTH = "prod";
  process.env.WIRE_CONSOLE_PROD_ADAPTER = "webauthn";
  process.env.WIRE_CONSOLE_WEBAUTHN_RP_ID = "localhost";
  delete process.env.WIRE_CONSOLE_E2E_WEBAUTHN;
  const port = Number(process.env.WIRE_CONSOLE_WEBAUTHN_SMOKE_PORT ?? 9473);
  process.env.WIRE_CONSOLE_WEBAUTHN_ORIGIN = `http://localhost:${port}`;
  delete process.env.WIRE_CONSOLE_WEBAUTHN_TEST_SECRET;
  delete process.env.WIRE_CONSOLE_WEBAUTHN_ALLOW_TEST_SECRET;

  writeWireConsoleWebAuthnSmokeFixture();

  const server = await startWireConsoleServer({ host: "localhost", port });
  console.log(`wire-console webauthn smoke server ${server.url}`);

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
