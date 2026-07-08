#!/usr/bin/env node
/**
 * Build @orgos/cli installable package under packages/orgos-cli/
 */
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PKG = join(ROOT, "packages", "orgos-cli");
const DIST = join(ROOT, "dist");

function run(cmd, args) {
  const r = spawnSync(cmd, args, { cwd: ROOT, stdio: "inherit" });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

function copyTree(src, dest) {
  if (!existsSync(src)) return;
  mkdirSync(dirname(dest), { recursive: true });
  cpSync(src, dest, { recursive: true });
}

console.log("Building OrgOS Core package…\n");

run("npx", ["tsc", "-p", "tsconfig.build.json", "--noCheck"]);

if (existsSync(PKG)) {
  for (const sub of ["dist", "steward", "schemas", "docs", "tenants", "deploy", "apps"]) {
    const p = join(PKG, sub);
    if (existsSync(p)) rmSync(p, { recursive: true, force: true });
  }
}
mkdirSync(PKG, { recursive: true });
mkdirSync(join(PKG, "bin"), { recursive: true });

copyTree(DIST, join(PKG, "dist"));
copyTree(join(ROOT, "steward"), join(PKG, "steward"));
copyTree(join(ROOT, "schemas"), join(PKG, "schemas"));
copyTree(join(ROOT, "docs"), join(PKG, "docs"));
copyTree(join(ROOT, "tenants", "_template"), join(PKG, "tenants", "_template"));
copyTree(join(ROOT, "deploy"), join(PKG, "deploy"));

if (existsSync(join(ROOT, "apps", "wire-console", "dist"))) {
  copyTree(join(ROOT, "apps", "wire-console", "dist"), join(PKG, "apps", "wire-console", "dist"));
}

console.log("\n✓ Package staged at packages/orgos-cli/");
console.log("  npm pack -w @orgos/cli");
console.log("  cd packages/orgos-cli && npm publish --access public");
