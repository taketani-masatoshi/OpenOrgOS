import { spawnSync } from "node:child_process";

/**
 * Re-run the demo skeleton seeder. Unit tests restore `tenants/demo/data` from
 * git HEAD before every test, so a spec that needs demo peers or a pending
 * notice must (re)create them itself rather than trust server startup.
 */
export function reseedDemoWire(): void {
  const r = spawnSync("node", ["--import", "tsx", "scripts/seed-demo-wire-skeleton.ts"], {
    cwd: process.cwd(),
    env: { ...process.env, ORGOS_TENANT: "demo" },
    encoding: "utf-8",
  });
  if (r.status !== 0) {
    throw new Error(`demo wire seed failed: ${r.stderr || r.stdout}`);
  }
}
