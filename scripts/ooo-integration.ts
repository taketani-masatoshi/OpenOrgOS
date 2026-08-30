#!/usr/bin/env node
/**
 * Run the integration suite against the real services in `deploy/integration/`
 * and record which checks actually passed. Skipped checks are recorded as
 * skipped, never as green: an item whose external dependency was never
 * exercised must not collect verification points for it.
 *
 *   npm run ooo:integration
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { ROOT_DIR } from "../src/lib/tenant.js";

const ENV_FILE = join(ROOT_DIR, "deploy/integration/.env");
const REPORT_PATH = join(ROOT_DIR, "tests", ".ooo-integration-report.json");
const RESULT_PATH = join(ROOT_DIR, "tests", ".ooo-integration-green.json");

interface PwSuite {
  title?: string;
  suites?: PwSuite[];
  specs?: Array<{
    title?: string;
    ok: boolean;
    tests?: Array<{ results?: Array<{ status?: string }> }>;
  }>;
}

/** Load `deploy/integration/.env` without adding a dotenv dependency. */
function loadEnvFile(): Record<string, string> {
  if (!existsSync(ENV_FILE)) return {};
  const env: Record<string, string> = {};
  for (const line of readFileSync(ENV_FILE, "utf-8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return env;
}

function collect(
  suite: PwSuite,
  out: Map<string, "passed" | "skipped" | "failed">,
): void {
  for (const spec of suite.specs ?? []) {
    const title = spec.title ?? "";
    if (!title) continue;
    const statuses = (spec.tests ?? []).flatMap((t) =>
      (t.results ?? []).map((r) => r.status ?? "unknown"),
    );
    const state = statuses.includes("failed")
      ? "failed"
      : statuses.every((s) => s === "skipped")
        ? "skipped"
        : "passed";
    out.set(title, state);
  }
  for (const child of suite.suites ?? []) collect(child, out);
}

function main(): void {
  mkdirSync(dirname(REPORT_PATH), { recursive: true });
  rmSync(REPORT_PATH, { force: true });

  const run = spawnSync(
    "npx",
    ["playwright", "test", "--config=playwright.integration.config.ts", "--reporter=json"],
    {
      cwd: ROOT_DIR,
      env: { ...process.env, ...loadEnvFile(), PLAYWRIGHT_JSON_OUTPUT_NAME: REPORT_PATH },
      encoding: "utf-8",
      maxBuffer: 64 * 1024 * 1024,
    },
  );

  let report: { suites?: PwSuite[] };
  try {
    report = JSON.parse(readFileSync(REPORT_PATH, "utf-8")) as { suites?: PwSuite[] };
  } catch {
    const start = run.stdout?.indexOf("{") ?? -1;
    if (start < 0) {
      console.error(run.stdout ?? "");
      console.error(run.stderr ?? "");
      throw new Error("playwright produced no JSON report");
    }
    report = JSON.parse(run.stdout!.slice(start)) as { suites?: PwSuite[] };
  }

  const results = new Map<string, "passed" | "skipped" | "failed">();
  for (const suite of report.suites ?? []) collect(suite, results);

  const green = [...results].filter(([, s]) => s === "passed").map(([t]) => t).sort();
  const skipped = [...results].filter(([, s]) => s === "skipped").map(([t]) => t).sort();
  const failed = [...results].filter(([, s]) => s === "failed").map(([t]) => t).sort();

  writeFileSync(
    RESULT_PATH,
    `${JSON.stringify(
      { recorded_at: new Date().toISOString(), green, skipped, failed },
      null,
      2,
    )}\n`,
  );

  console.log(`本物で通った ${green.length} 件: ${green.join(" / ") || "-"}`);
  if (skipped.length) console.log(`環境が無く未実施 ${skipped.length} 件: ${skipped.join(" / ")}`);
  if (failed.length) {
    console.log(`失敗 ${failed.length} 件: ${failed.join(" / ")}`);
    process.exit(1);
  }
}

main();
