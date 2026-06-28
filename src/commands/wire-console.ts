import { startWireConsoleServer } from "../lib/wire-console/server.js";
import { getWireConsoleAuthConfig } from "../lib/wire-console/auth/login.js";
import {
  getWireConsoleStatus,
  spawnWireConsoleServer,
  stopWireConsoleServer,
} from "../lib/wire-console/process.js";
import { WIRE_CONSOLE_DEFAULT_PORT } from "../lib/wire-console/paths.js";
import { anyWireConsoleTenantEnabled, listWireConsoleTenants } from "../lib/wire-console/tenant-registry.js";

export interface WireConsoleStartOptions {
  port?: number;
  host?: string;
  foreground?: boolean;
}

export async function runWireConsoleStart(opts: WireConsoleStartOptions): Promise<void> {
  if (!anyWireConsoleTenantEnabled()) {
    console.error("No tenant has wire_console: true — enable in tenant.yaml or use tenant init --wire-console");
    process.exit(1);
  }

  const tenants = listWireConsoleTenants();
  console.log(`Wire Console tenants: ${tenants.map((t) => t.id).join(", ")}`);

  const auth = getWireConsoleAuthConfig();
  const authHint =
    auth.mode === "prod"
      ? "Prod auth (WIRE_CONSOLE_PROD_TOKEN required)"
      : `Dev login passkey: ${process.env.WIRE_CONSOLE_DEV_PASSKEY ?? "orgos-dev"}`;

  if (opts.foreground) {
    const server = await startWireConsoleServer({
      host: opts.host ?? "127.0.0.1",
      port: opts.port ?? WIRE_CONSOLE_DEFAULT_PORT,
    });
    console.log(`✓ Wire Console ${server.url} (foreground — Ctrl+C to stop)`);
    console.log(`  ${authHint}`);
    await new Promise<void>(() => {
      /* keep alive */
    });
    return;
  }

  const manifest = await spawnWireConsoleServer({
    port: opts.port,
    host: opts.host,
  });
  console.log(`✓ Wire Console ${manifest.url}`);
  console.log(`  pid ${manifest.pid} · manifest .orgos/wire-console.json`);
  console.log(`  ${authHint}`);
}

export function runWireConsoleStop(): void {
  const stopped = stopWireConsoleServer();
  if (stopped) {
    console.log("✓ Wire Console stopped");
  } else {
    console.log("Wire Console is not running");
  }
}

export function runWireConsoleStatus(): void {
  const status = getWireConsoleStatus();
  if (!status.running || !status.manifest) {
    console.log("Wire Console: stopped");
    const tenants = listWireConsoleTenants();
    if (tenants.length) {
      console.log(`  enabled tenants: ${tenants.map((t) => t.id).join(", ")}`);
    }
    return;
  }
  console.log(`Wire Console: running ${status.manifest.url}`);
  console.log(`  pid ${status.manifest.pid} · since ${status.manifest.started_at}`);
}
