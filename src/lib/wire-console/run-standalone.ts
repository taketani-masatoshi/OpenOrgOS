#!/usr/bin/env node
import { startWireConsoleServer } from "./server.js";
import { writeWireConsoleManifest, removeWireConsoleManifest } from "./process.js";
import { WIRE_CONSOLE_DEFAULT_PORT } from "./paths.js";

function parseArgs(): { host: string; port: number } {
  const args = process.argv.slice(2);
  let host = "127.0.0.1";
  let port = WIRE_CONSOLE_DEFAULT_PORT;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--host" && args[i + 1]) host = args[++i]!;
    if (args[i] === "--port" && args[i + 1]) port = Number(args[++i]);
  }
  return { host, port };
}

async function main(): Promise<void> {
  const { host, port } = parseArgs();
  const server = await startWireConsoleServer({ host, port });
  writeWireConsoleManifest({
    url: server.url,
    port: server.port,
    pid: process.pid,
    started_at: new Date().toISOString(),
  });
  console.log(`✓ Wire Console ${server.url}`);

  const shutdown = (): void => {
    removeWireConsoleManifest();
    server.close();
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
