#!/usr/bin/env node
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { WireConsoleServerHandle } from "../src/lib/wire-console/server.js";
import { startWireConsoleServer } from "../src/lib/wire-console/server.js";
import { WIRE_CONSOLE_SPA_DIST } from "../src/lib/wire-console/paths.js";
import { resetWireConsoleTestTenant } from "../tests/helpers/wire-console-test-fixture.js";
import {
  removeWireConsoleWitnessPoolConfig,
  startWireConsoleWitnessHubs,
  type WireConsoleWitnessHubs,
} from "../tests/helpers/wire-console-witness-fixture.js";

async function main(): Promise<void> {
  if (!existsSync(join(WIRE_CONSOLE_SPA_DIST, "index.html"))) {
    console.error("Wire Console SPA not built. Run: npm run wire-console:build");
    process.exit(1);
  }

  resetWireConsoleTestTenant();
  process.env.WIRE_CONSOLE_INCLUDE_TEST_TENANTS = "1";
  process.env.WIRE_CONSOLE_SMOKE_PORT = process.env.WIRE_CONSOLE_SMOKE_PORT ?? "9472";
  const port = Number(process.env.WIRE_CONSOLE_SMOKE_PORT);

  let witness: WireConsoleWitnessHubs | undefined;
  let server: WireConsoleServerHandle | undefined;

  const shutdown = (): void => {
    witness?.close();
    witness = undefined;
    removeWireConsoleWitnessPoolConfig();
    server?.close();
    server = undefined;
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  witness = await startWireConsoleWitnessHubs();
  server = await startWireConsoleServer({ host: "127.0.0.1", port });
  process.env.WIRE_CONSOLE_SMOKE_URL = server.url;
  console.log(`wire-console smoke server ${server.url} (witness hubs :19482/:19483)`);

  await new Promise<void>(() => {
    /* keep alive for playwright webServer */
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
