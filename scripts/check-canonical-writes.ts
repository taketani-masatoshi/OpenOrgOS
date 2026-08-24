#!/usr/bin/env node
/**
 * Fail when src/ or steward/ gain new direct fs writes outside CANONICAL_WRITE_BASELINE.
 * Baseline keys are file:symbol counts (line edits above/below do not drift the key).
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

type ScanHit = { file: string; symbol: string };

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

function scanFile(absPath: string): ScanHit[] {
  const rel = relative(ROOT, absPath).replace(/\\/g, "/");
  if (CANONICAL_WRITE_SCAN_SKIP_FILES.has(rel)) return [];
  const content = readFileSync(absPath, "utf-8");
  const lines = content.split("\n");
  const hits: ScanHit[] = [];
  for (const line of lines) {
    for (const symbol of CANONICAL_WRITE_SYMBOLS) {
      if (!new RegExp(`\\b${symbol}\\s*\\(`).test(line)) continue;
      hits.push({ file: rel, symbol });
    }
  }
  return hits;
}

function aggregateHits(hits: ScanHit[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const hit of hits) {
    const key = canonicalWriteBaselineKey(hit);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

function collectHitCounts(): Map<string, number> {
  const files: string[] = [];
  for (const root of SCAN_ROOTS) {
    walk(join(ROOT, root), files);
  }
  return aggregateHits(files.flatMap(scanFile));
}

function formatBaselineTs(entries: CanonicalWriteBaselineEntry[]): string {
  const body = entries
    .map(
      (e) =>
        `  { file: ${JSON.stringify(e.file)}, symbol: ${JSON.stringify(e.symbol)}, count: ${e.count}, note: ${JSON.stringify(e.note)} },`
    )
    .join("\n");
  return `/**
 * Known direct canonical writes not yet routed through wrapCanonicalWrite / guarded writers.
 * New hits fail scripts/check-canonical-writes.ts — migrate or add here with justification.
 * Generated/updated by: node --import tsx scripts/check-canonical-writes.ts --write
 */
export type CanonicalWriteBaselineEntry = {
  file: string;
  symbol: string;
  count: number;
  note: string;
};

export const CANONICAL_WRITE_BASELINE: CanonicalWriteBaselineEntry[] = [
${body}
];

export function canonicalWriteBaselineKey(entry: Pick<CanonicalWriteBaselineEntry, "file" | "symbol">): string {
  return \`\${entry.file}:\${entry.symbol}\`;
}

export function countCanonicalWriteBaselineEntries(): number {
  return CANONICAL_WRITE_BASELINE.reduce((sum, entry) => sum + entry.count, 0);
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
  const live = collectHitCounts();
  if (write) {
    const entries: CanonicalWriteBaselineEntry[] = [...live.entries()]
      .map(([key, count]) => {
        const sep = key.lastIndexOf(":");
        const file = key.slice(0, sep);
        const symbol = key.slice(sep + 1);
        return {
          file,
          symbol,
          count,
          note: "pending migration to wrapCanonicalWrite / writeYamlFile / writeTrackedFile",
        };
      })
      .sort((a, b) => a.file.localeCompare(b.file) || a.symbol.localeCompare(b.symbol));
    writeFileSync(
      join(ROOT, "src/lib/org/fs-guard/canonical-write-baseline.ts"),
      formatBaselineTs(entries),
      "utf-8"
    );
    const total = entries.reduce((sum, e) => sum + e.count, 0);
    console.log(`Wrote ${entries.length} baseline keys (${total} write sites) to canonical-write-baseline.ts`);
    return;
  }

  const baseline = new Map(
    CANONICAL_WRITE_BASELINE.map((entry) => [canonicalWriteBaselineKey(entry), entry.count])
  );
  const increased: string[] = [];
  const newKeys: string[] = [];
  const stale: string[] = [];

  for (const [key, count] of live) {
    const expected = baseline.get(key);
    if (expected === undefined) {
      newKeys.push(`${key} (${count})`);
      continue;
    }
    if (count > expected) {
      increased.push(`${key} (${expected} -> ${count})`);
    }
  }
  for (const [key, count] of baseline) {
    const actual = live.get(key) ?? 0;
    if (actual < count) {
      stale.push(`${key} (${count} -> ${actual})`);
    }
  }

  if (newKeys.length === 0 && increased.length === 0 && stale.length === 0) {
    const total = [...live.values()].reduce((sum, n) => sum + n, 0);
    console.log(`OK: ${total} direct write(s) match baseline (${baseline.size} file:symbol keys)`);
    return;
  }

  if (newKeys.length) {
    console.error("New direct canonical write keys (not in baseline):");
    for (const line of newKeys) console.error(`  ${line}`);
  }
  if (increased.length) {
    console.error("Increased direct canonical write counts:");
    for (const line of increased) console.error(`  ${line}`);
  }
  if (stale.length) {
    console.error("Stale baseline keys (count decreased — run --write after migration):");
    for (const line of stale) console.error(`  ${line}`);
  }
  process.exit(1);
}

main();
