#!/usr/bin/env node
/**
 * Batch-update user-facing CLI references: steward → orgos.
 * Excludes migration docs, legacy constants, spec history, deploy dual-env.
 *
 * Usage: node --import tsx scripts/batch-rename-cli-refs.ts
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const SKIP_DIRS = new Set(["node_modules", ".git", "dist"]);
const SKIP_PATH_PARTS = [
  "docs/spec/history/",
  "docs/org-os/cli-migration.md",
  "docs/org-os/orgos-vocabulary.md",
  "src/lib/orgos-cli.ts",
  "scripts/batch-rename-cli-refs.ts",
];
const FILE_RE = /\.(md|mdc|yaml|yml|ts|tsx|json|csv|txt|sh)$|\.cursorindexingignore$/;

function skipFile(rel: string): boolean {
  return SKIP_PATH_PARTS.some((p) => rel === p || rel.includes(p));
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const abs = join(dir, name);
    const st = statSync(abs);
    if (st.isDirectory()) walk(abs, out);
    else if (FILE_RE.test(name) || name === ".cursorindexingignore") out.push(abs);
  }
  return out;
}

function transform(rel: string, content: string): string {
  let next = content.replace(/npm run steward/g, "npm run orgos");
  next = next.replace(/\["run", "steward"/g, '["run", "orgos"');

  const skipTenant =
    rel.startsWith("deploy/") ||
    rel === "tests/cli-branding.test.ts" ||
    rel === "tests/setup-tenant.ts" ||
    rel === "src/lib/orgos-cli.ts" ||
    rel === "docs/org-os/cli-migration.md";

  if (!skipTenant) {
    next = next.replace(/\bSTEWARD_TENANT\b/g, "ORGOS_TENANT");
  }

  // npm package name (not GitHub org steward-os/jurisdiction-*)
  if (!rel.includes("cli-migration.md") && !rel.includes("orgos-vocabulary.md")) {
    next = next.replace(/npm [`']steward-os[`']/g, "npm `orgos-reference`");
    next = next.replace(/npm パッケージ `steward-os`/g, "npm パッケージ `orgos-reference`");
    next = next.replace(/\/ npm `steward-os`/g, " / npm `orgos-reference`");
  }

  if (!rel.includes("cli-migration.md") && !rel.includes("orgos-vocabulary.md")) {
    next = next.replace(/\/opt\/steward-os/g, "/opt/orgos-reference");
  }

  return next;
}

let changed = 0;
for (const abs of walk(ROOT)) {
  const rel = relative(ROOT, abs);
  if (skipFile(rel)) continue;
  const orig = readFileSync(abs, "utf-8");
  const next = transform(rel, orig);
  if (next !== orig) {
    writeFileSync(abs, next);
    changed++;
    console.log(rel);
  }
}
console.log(`\nUpdated ${changed} files.`);
