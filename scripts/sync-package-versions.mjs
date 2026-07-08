#!/usr/bin/env node
/**
 * Sync root package.json version to publishable workspace packages.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const rootPkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf-8"));
const version = rootPkg.version;

const targets = [
  "packages/orgos-cli/package.json",
  "packages/orgos-wire/package.json",
];

for (const rel of targets) {
  const path = join(ROOT, rel);
  const pkg = JSON.parse(readFileSync(path, "utf-8"));
  pkg.version = version;
  if (pkg.peerDependencies?.["@orgos/cli"]) {
    pkg.peerDependencies["@orgos/cli"] = version;
  }
  writeFileSync(path, `${JSON.stringify(pkg, null, 2)}\n`, "utf-8");
  console.log(`✓ ${rel} → ${version}`);
}

const installSh = join(ROOT, "install.sh");
if (existsSync(installSh)) {
  let sh = readFileSync(installSh, "utf-8");
  sh = sh.replace(/ORGOS_VERSION="\$\{ORGOS_VERSION:-[^"]+"\}/, `ORGOS_VERSION="\${ORGOS_VERSION:-${version}}"`);
  writeFileSync(installSh, sh, "utf-8");
  console.log(`✓ install.sh ORGOS_VERSION default → ${version}`);
}

const formulaPaths = [
  "homebrew-tap/Formula/orgos.rb",
  "homebrew-tap/Formula/orgos-wire.rb",
];
const tarballUrl = `https://github.com/orgos-reference/orgos/archive/refs/tags/v${version}.tar.gz`;
for (const rel of formulaPaths) {
  const path = join(ROOT, rel);
  if (!existsSync(path)) continue;
  let rb = readFileSync(path, "utf-8");
  rb = rb.replace(
    /url "https:\/\/github\.com\/orgos-reference\/orgos\/archive\/refs\/tags\/v[^"]+\.tar\.gz"/,
    `url "${tarballUrl}"`
  );
  writeFileSync(path, rb, "utf-8");
  console.log(`✓ ${rel} url → v${version}`);
}

console.log(`\nVersion sync complete (${version})`);
