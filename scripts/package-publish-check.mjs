#!/usr/bin/env node
/**
 * npm publish dry-run — validates @orgos/cli and @orgos/wire pack + publish metadata.
 */
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function run(cmd, args) {
  const r = spawnSync(cmd, args, { cwd: ROOT, stdio: "inherit" });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

console.log("OrgOS package publish check\n");

run("node", ["scripts/sync-package-versions.mjs"]);
run("npm", ["run", "wire-console:build"]);
run("npm", ["run", "steward-chat:build"]);
run("node", ["scripts/build-orgos-package.mjs"]);

for (const pkg of ["@orgos/cli", "@orgos/wire"]) {
  console.log(`\n— npm pack ${pkg}`);
  run("npm", ["pack", "-w", pkg]);
  console.log(`— npm publish --dry-run ${pkg}`);
  run("npm", ["publish", "-w", pkg, "--access", "public", "--dry-run"]);
}

const cliPkg = join(ROOT, "packages", "orgos-cli", "package.json");
if (!existsSync(cliPkg)) {
  console.error("packages/orgos-cli missing");
  process.exit(1);
}

console.log("\n✓ Publish check passed — tag push + NPM_TOKEN enables release workflow publish");
