#!/usr/bin/env node
import { existsSync } from "node:fs";
import { join } from "node:path";
import { startWireConsoleServer } from "../src/lib/wire-console/server.js";
import { WIRE_CONSOLE_SPA_DIST } from "../src/lib/wire-console/paths.js";
import { writeWireConsoleOidcSmokeFixture } from "../tests/helpers/wire-console-oidc-e2e-fixture.js";

async function main(): Promise<void> {
  if (!existsSync(join(WIRE_CONSOLE_SPA_DIST, "index.html"))) {
    console.error("Wire Console SPA not built. Run: npm run wire-console:build");
    process.exit(1);
  }

  process.env.WIRE_CONSOLE_AUTH = "prod";
  process.env.WIRE_CONSOLE_PROD_ADAPTER = "oidc";
  delete process.env.WIRE_CONSOLE_OIDC_HS256_SECRET;
  delete process.env.WIRE_CONSOLE_ALLOW_LEGACY_PROD_TOKEN;

  const port = Number(process.env.WIRE_CONSOLE_OIDC_SMOKE_PORT ?? 9474);
  await writeWireConsoleOidcSmokeFixture();

  const server = await startWireConsoleServer({ host: "127.0.0.1", port });
  console.log(`wire-console oidc smoke server ${server.url}`);

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
