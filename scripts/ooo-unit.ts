#!/usr/bin/env node
/**
 * Run the Vitest files that OOO items cite as evidence and record which ones
 * were fully green. `ooo-score.ts` only credits unit (10) and HTTP (8) points
 * for files listed here, so a scored item cannot rest on a test that fails.
 *
 * Only the cited files are run, not the whole suite: the full suite takes
 * ~30 minutes and contains failures outside the 53 scored acts.
 *
 *   npm run ooo:unit
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import YAML from "yaml";
import { ROOT_DIR } from "../src/lib/tenant.js";

const ITEMS_PATH = join(ROOT_DIR, "docs/org-os/ooo-capability-items.yaml");
const REPORT_PATH = join(ROOT_DIR, "tests", ".ooo-unit-report.json");
const RESULT_PATH = join(ROOT_DIR, "tests", ".ooo-unit-green.json");

interface ItemDef {
  unit?: string[];
  http?: { tests: string[] } | null;
}

interface VitestAssertion {
  status?: string;
}

interface VitestFileResult {
  name?: string;
  status?: string;
  assertionResults?: VitestAssertion[];
}

/** Every test file any item points at, deduplicated and sorted. */
export function citedTestFiles(): string[] {
  const raw = YAML.parse(readFileSync(ITEMS_PATH, "utf-8")) as { items: ItemDef[] };
  const files = new Set<string>();
  for (const item of raw.items) {
    for (const path of item.unit ?? []) files.add(path);
    for (const path of item.http?.tests ?? []) files.add(path);
  }
  return [...files].sort();
}

/**
 * A file counts as green only when it ran and every assertion in it passed.
 * A file that failed to collect has no assertions and must not pass silently.
 */
function collect(report: { testResults?: VitestFileResult[] }): Map<string, boolean> {
  const files = new Map<string, boolean>();
  for (const result of report.testResults ?? []) {
    const name = result.name?.replace(`${ROOT_DIR}/`, "");
    if (!name) continue;
    const assertions = result.assertionResults ?? [];
    const ok =
      result.status === "passed" &&
      assertions.length > 0 &&
      assertions.every((a) => a.status === "passed" || a.status === "skipped");
    files.set(name, ok);
  }
  return files;
}

function main(): void {
  mkdirSync(dirname(REPORT_PATH), { recursive: true });
  rmSync(REPORT_PATH, { force: true });

  const cited = citedTestFiles();
  const missing = cited.filter((p) => !existsSync(join(ROOT_DIR, p)));
  const runnable = cited.filter((p) => existsSync(join(ROOT_DIR, p)));

  const run = spawnSync(
    "npx",
    ["vitest", "run", ...runnable, "--reporter=json", `--outputFile=${REPORT_PATH}`],
    {
      cwd: ROOT_DIR,
      encoding: "utf-8",
      maxBuffer: 128 * 1024 * 1024,
    },
  );

  let report: { testResults?: VitestFileResult[] };
  try {
    report = JSON.parse(readFileSync(REPORT_PATH, "utf-8")) as {
      testResults?: VitestFileResult[];
    };
  } catch {
    const start = run.stdout?.indexOf("{") ?? -1;
    if (start < 0) {
      console.error(run.stdout ?? "");
      console.error(run.stderr ?? "");
      throw new Error("vitest produced no JSON report");
    }
    report = JSON.parse(run.stdout!.slice(start)) as { testResults?: VitestFileResult[] };
  }

  const files = collect(report);
  const green = [...files.entries()].filter(([, ok]) => ok).map(([f]) => f).sort();
  const red = [...files.entries()].filter(([, ok]) => !ok).map(([f]) => f).sort();
  // A cited file that never appeared in the report is not green either.
  const absent = runnable.filter((p) => !files.has(p));

  writeFileSync(
    RESULT_PATH,
    `${JSON.stringify(
      { recorded_at: new Date().toISOString(), green, red: [...red, ...absent].sort(), missing },
      null,
      2,
    )}\n`,
  );

  console.log(`緑 ${green.length} ファイル / 引用 ${cited.length}`);
  if (missing.length) console.log(`不在 ${missing.length}: ${missing.join(", ")}`);
  if (red.length || absent.length) {
    console.log(`赤 ${red.length + absent.length}: ${[...red, ...absent].join(", ")}`);
    process.exit(1);
  }
}

if (process.argv[1]?.endsWith("ooo-unit.ts")) main();
