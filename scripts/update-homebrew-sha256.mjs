#!/usr/bin/env node
/**
 * Compute sha256 for Homebrew Formula tarballs after GitHub release tag is published.
 * Usage: node scripts/update-homebrew-sha256.mjs [version]
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const rootPkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf-8"));
const version = process.argv[2] ?? rootPkg.version;
const url = `https://github.com/orgos-reference/orgos/archive/refs/tags/v${version}.tar.gz`;

async function sha256FromUrl(targetUrl) {
  const res = await fetch(targetUrl);
  if (!res.ok) {
    throw new Error(`Failed to fetch ${targetUrl}: ${res.status} ${res.statusText}`);
  }
  const hash = createHash("sha256");
  const reader = res.body?.getReader();
  if (!reader) throw new Error("No response body");
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    hash.update(value);
  }
  return hash.digest("hex");
}

const formulaPaths = [
  "homebrew-tap/Formula/orgos.rb",
  "homebrew-tap/Formula/orgos-wire.rb",
];

try {
  const digest = await sha256FromUrl(url);
  for (const rel of formulaPaths) {
    const path = join(ROOT, rel);
    if (!existsSync(path)) continue;
    let rb = readFileSync(path, "utf-8");
    rb = rb.replace(/sha256 "[^"]+"/, `sha256 "${digest}"`);
    writeFileSync(path, rb, "utf-8");
    console.log(`✓ ${rel} sha256 → ${digest}`);
  }
  console.log(`\nHomebrew sha256 updated for v${version}`);
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  console.error(`\nIf tag v${version} is not published yet, keep sha256 "SKIP_ON_FIRST_RELEASE"`);
  process.exit(1);
}
