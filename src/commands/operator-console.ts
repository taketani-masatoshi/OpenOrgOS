import { setTenantEnv } from "../lib/orgos-cli.js";
import { startOperatorConsoleServer } from "../lib/operator-console/combined-server.js";
import { formatProdAuthWarnings, runProdAuthChecks } from "../lib/console-auth/prod-checklist.js";

export interface OperatorConsoleStartOptions {
  host?: string;
  port?: number;
  tenant?: string;
}

export async function runOperatorConsoleStart(
  opts: OperatorConsoleStartOptions = {}
): Promise<void> {
  if (opts.tenant) setTenantEnv(opts.tenant);

  const warnings = formatProdAuthWarnings(runProdAuthChecks("all"));
  if (warnings.length) {
    console.warn("⚠ Operator Console auth warnings:");
    for (const w of warnings) console.warn(`  · ${w}`);
  }

  const handle = await startOperatorConsoleServer({
    host: opts.host,
    port: opts.port,
  });

  console.log(`✓ Operator Console (same origin)`);
  console.log(`  Chat:  ${handle.chatUrl}`);
  console.log(`  Wire:  ${handle.wireUrl}`);
  console.log(`  APIs:  /chat/v1/* · /console/v1/* (shared session cookie)`);
  console.log(`  Build: npm run operator-console:build  (Wire SPA at /wire/)`);
  console.log("  Press Ctrl+C to stop");

  await new Promise<void>((resolve) => {
    process.on("SIGINT", () => {
      handle.close();
      resolve();
    });
  });
}
