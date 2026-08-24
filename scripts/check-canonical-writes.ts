#!/usr/bin/env node
/**
 * Fail when src/ or steward/ gain new direct fs writes outside CANONICAL_WRITE_BASELINE.
 * Usage: node --import tsx scripts/check-canonical-writes.ts [--write]
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import {
  CANONICAL_WRITE_BASELINE,
  CANONICAL_WRITE_SCAN_SKIP_DIRS,
  CANONICAL_WRITE_SCAN_SKIP_FILES,
  CANONICAL_WRITE_SYMBOLS,
  canonicalWriteBaselineKey,
  type CanonicalWriteBaselineEntry,
} from "../src/lib/org/fs-guard/canonical-write-baseline.js";

const ROOT = process.cwd();
const SCAN_ROOTS = ["src", "steward"];

type Hit = CanonicalWriteBaselineEntry;

function walk(dir: string, out: string[]): void {
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    if (CANONICAL_WRITE_SCAN_SKIP_DIRS.has(name.name)) continue;
    const abs = join(dir, name.name);
    if (name.isDirectory()) {
      walk(abs, out);
      continue;
    }
    if (!/\.(ts|tsx|mjs|js)$/.test(name.name)) continue;
    out.push(abs);
  }
}

function scanFile(absPath: string): Hit[] {
  const rel = relative(ROOT, absPath).replace(/\\/g, "/");
  if (CANONICAL_WRITE_SCAN_SKIP_FILES.has(rel)) return [];
  const content = readFileSync(absPath, "utf-8");
  const lines = content.split("\n");
  const hits: Hit[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const symbol of CANONICAL_WRITE_SYMBOLS) {
      if (!new RegExp(`\\b${symbol}\\s*\\(`).test(line)) continue;
      hits.push({
        file: rel,
        line: i + 1,
        symbol,
        note: "pending migration to wrapCanonicalWrite / writeYamlFile / writeTrackedFile",
      });
    }
  }
  return hits;
}

function collectHits(): Hit[] {
  const files: string[] = [];
  for (const root of SCAN_ROOTS) {
    walk(join(ROOT, root), files);
  }
  return files.flatMap(scanFile);
}

function formatBaselineTs(entries: Hit[]): string {
  const body = entries
    .map(
      (e) =>
        `  { file: ${JSON.stringify(e.file)}, line: ${e.line}, symbol: ${JSON.stringify(e.symbol)}, note: ${JSON.stringify(e.note)} },`
    )
    .join("\n");
  return `/**
 * Known direct canonical writes not yet routed through wrapCanonicalWrite / guarded writers.
 * New hits fail scripts/check-canonical-writes.ts — migrate or add here with justification.
 * Generated/updated by: node --import tsx scripts/check-canonical-writes.ts --write
 */
export type CanonicalWriteBaselineEntry = {
  file: string;
  line: number;
  symbol: string;
  note: string;
};

export const CANONICAL_WRITE_BASELINE: CanonicalWriteBaselineEntry[] = [
${body}
];

export function canonicalWriteBaselineKey(entry: CanonicalWriteBaselineEntry): string {
  return \`\${entry.file}:\${entry.line}:\${entry.symbol}\`;
}

export function countCanonicalWriteBaselineEntries(): number {
  return CANONICAL_WRITE_BASELINE.length;
}

/** Files that implement or bootstrap the guard — not tenant canonical writes. */
export const CANONICAL_WRITE_SCAN_SKIP_FILES = new Set([
  "src/lib/utils.ts",
  "src/lib/yaml-atomic.ts",
  "src/lib/org/fs-guard/guarded-write.ts",
  "src/lib/org/fs-guard/lease.ts",
  "src/lib/org/fs-guard/store.ts",
  "src/lib/org/fs-guard/policy.ts",
  "src/lib/org/fs-guard/write-hook.ts",
  "src/lib/org/fs-guard/canonical-write-baseline.ts",
  "src/lib/operator-runtime/shell.ts",
  "scripts/check-canonical-writes.ts",
]);

export const CANONICAL_WRITE_SCAN_SKIP_DIRS = new Set([
  "node_modules",
  "tests",
  "dist",
  "apps/steward-chat/dist",
  "apps/wire-console/dist",
]);

export const CANONICAL_WRITE_SYMBOLS = [
  "writeFileSync",
  "appendFileSync",
  "copyFileSync",
  "cpSync",
  "renameSync",
] as const;
`;
}

function main(): void {
  const write = process.argv.includes("--write");
  const hits = collectHits();
  if (write) {
    const sorted = [...hits].sort(
      (a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.symbol.localeCompare(b.symbol)
    );
    writeFileSync(
      join(ROOT, "src/lib/org/fs-guard/canonical-write-baseline.ts"),
      formatBaselineTs(sorted),
      "utf-8"
    );
    console.log(`Wrote ${sorted.length} baseline entries to canonical-write-baseline.ts`);
    return;
  }

  const baselineKeys = new Set(CANONICAL_WRITE_BASELINE.map(canonicalWriteBaselineKey));
  const hitKeys = new Set(hits.map(canonicalWriteBaselineKey));
  const unlisted = hits.filter((h) => !baselineKeys.has(canonicalWriteBaselineKey(h)));
  const stale = CANONICAL_WRITE_BASELINE.filter((b) => !hitKeys.has(canonicalWriteBaselineKey(b)));

  if (unlisted.length === 0 && stale.length === 0) {
    console.log(`OK: ${hits.length} direct write(s) match baseline (${baselineKeys.size} entries)`);
    return;
  }

  if (unlisted.length) {
    console.error("New direct canonical writes (not in baseline):");
    for (const h of unlisted) {
      console.error(`  ${h.file}:${h.line} ${h.symbol}`);
    }
  }
  if (stale.length) {
    console.error("Stale baseline entries (no longer in code):");
    for (const s of stale) {
      console.error(`  ${s.file}:${s.line} ${s.symbol}`);
    }
  }
  process.exit(1);
}

main();
