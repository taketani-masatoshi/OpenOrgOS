#!/usr/bin/env node
import { existsSync } from "node:fs";
import { join } from "node:path";
import { startWireConsoleServer } from "../src/lib/wire-console/server.js";
import { WIRE_CONSOLE_SPA_DIST } from "../src/lib/wire-console/paths.js";
import { writeWireConsoleWebAuthnBootstrapSmokeFixture } from "../tests/helpers/wire-console-webauthn-e2e-fixture.js";
import { writeWireConsoleOidcSmokeFixture } from "../tests/helpers/wire-console-oidc-e2e-fixture.js";

async function main(): Promise<void> {
  if (!existsSync(join(WIRE_CONSOLE_SPA_DIST, "index.html"))) {
    console.error("Wire Console SPA not built. Run: npm run wire-console:build");
    process.exit(1);
  }

  process.env.ORGOS_ENV = "production";
  process.env.WIRE_CONSOLE_AUTH = "prod";
  process.env.WIRE_CONSOLE_PROD_ADAPTER = "webauthn";
  process.env.ORGOS_SETTLEMENT_CHALLENGE_SECRET =
    process.env.ORGOS_SETTLEMENT_CHALLENGE_SECRET ?? "bootstrap-smoke-settlement-secret";
  process.env.ORGOS_SESSION_PERSIST = "1";
  process.env.WIRE_CONSOLE_WEBAUTHN_RP_ID = "localhost";
  delete process.env.WIRE_CONSOLE_E2E_WEBAUTHN;
  delete process.env.WIRE_CONSOLE_WEBAUTHN_TEST_SECRET;
  delete process.env.WIRE_CONSOLE_WEBAUTHN_ALLOW_TEST_SECRET;
  delete process.env.WIRE_CONSOLE_WEBAUTHN_ALLOW_OPEN_BOOTSTRAP;

  const port = Number(process.env.WIRE_CONSOLE_WEBAUTHN_BOOTSTRAP_SMOKE_PORT ?? 9474);
  process.env.WIRE_CONSOLE_WEBAUTHN_ORIGIN = `http://localhost:${port}`;

  await writeWireConsoleOidcSmokeFixture({
    operatorId: "OP-001",
    approverId: "Demo CEO",
  });
  writeWireConsoleWebAuthnBootstrapSmokeFixture();

  const server = await startWireConsoleServer({ host: "localhost", port });
  console.log(`wire-console webauthn bootstrap smoke server ${server.url}`);

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
