#!/usr/bin/env node
import { existsSync } from "node:fs";
import { join } from "node:path";
import { startWireConsoleServer } from "../src/lib/wire-console/server.js";
import { WIRE_CONSOLE_SPA_DIST } from "../src/lib/wire-console/paths.js";
import { resetWireConsoleTestTenant } from "../tests/helpers/wire-console-test-fixture.js";

async function main(): Promise<void> {
  if (!existsSync(join(WIRE_CONSOLE_SPA_DIST, "index.html"))) {
    console.error("Wire Console SPA not built. Run: npm run wire-console:build");
    process.exit(1);
  }
  resetWireConsoleTestTenant();
  const port = Number(process.env.WIRE_CONSOLE_SMOKE_PORT ?? 9472);
  const server = await startWireConsoleServer({ host: "127.0.0.1", port });
  process.env.WIRE_CONSOLE_SMOKE_URL = server.url;
  console.log(`wire-console smoke server ${server.url}`);
  await new Promise<void>(() => {
    /* keep alive for playwright webServer */
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
