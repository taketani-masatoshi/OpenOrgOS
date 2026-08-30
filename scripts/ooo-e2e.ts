#!/usr/bin/env node
/**
 * Run the Operator Console E2E suite and record which spec files were fully
 * green. `ooo-score.ts` only credits the 12+20 point E2E evidence for files
 * listed here, so the score cannot claim verification we did not reproduce.
 *
 *   npm run ooo:e2e
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { ROOT_DIR } from "../src/lib/tenant.js";

const REPORT_PATH = join(ROOT_DIR, "tests", ".ooo-e2e-report.json");
const RESULT_PATH = join(ROOT_DIR, "tests", ".ooo-e2e-green.json");

interface PwSuite {
  title?: string;
  file?: string;
  suites?: PwSuite[];
  specs?: Array<{ file?: string; ok: boolean }>;
}

function collect(suite: PwSuite, out: Map<string, boolean>): void {
  for (const spec of suite.specs ?? []) {
    const file = (spec.file ?? suite.file ?? "").split("/").pop();
    if (!file) continue;
    out.set(file, (out.get(file) ?? true) && spec.ok);
  }
  for (const child of suite.suites ?? []) collect({ ...child, file: child.file ?? suite.file }, out);
}

/**
 * Configs whose specs count as reproducible verification. The webauthn suite is
 * separate because it needs a virtual authenticator, but it is the only place
 * PassKey acts are actually exercised.
 */
const CONFIGS = [
  "playwright.steward-chat.config.ts",
  "playwright.steward-chat-webauthn.config.ts",
  "playwright.webauthn.config.ts",
];

function runConfig(config: string, files: Map<string, boolean>): void {
  rmSync(REPORT_PATH, { force: true });
  const run = spawnSync(
    "npx",
    ["playwright", "test", `--config=${config}`, "--reporter=json"],
    {
      cwd: ROOT_DIR,
      env: { ...process.env, PLAYWRIGHT_JSON_OUTPUT_NAME: REPORT_PATH },
      encoding: "utf-8",
      maxBuffer: 64 * 1024 * 1024,
    },
  );

  let report: { suites?: PwSuite[] };
  try {
    report = JSON.parse(readFileSync(REPORT_PATH, "utf-8")) as { suites?: PwSuite[] };
  } catch {
    // Playwright writes JSON to stdout when the env var is ignored.
    const start = run.stdout?.indexOf("{") ?? -1;
    if (start < 0) {
      console.error(run.stdout ?? "");
      console.error(run.stderr ?? "");
      throw new Error(`playwright produced no JSON report for ${config}`);
    }
    report = JSON.parse(run.stdout!.slice(start)) as { suites?: PwSuite[] };
  }

  for (const suite of report.suites ?? []) collect(suite, files);
}

function main(): void {
  mkdirSync(dirname(REPORT_PATH), { recursive: true });

  const files = new Map<string, boolean>();
  for (const config of CONFIGS) runConfig(config, files);

  const green = [...files.entries()].filter(([, ok]) => ok).map(([file]) => file).sort();
  const red = [...files.entries()].filter(([, ok]) => !ok).map(([file]) => file).sort();
  writeFileSync(
    RESULT_PATH,
    `${JSON.stringify({ recorded_at: new Date().toISOString(), green, red }, null, 2)}\n`,
  );

  console.log(`緑 ${green.length} 本: ${green.join(", ") || "-"}`);
  if (red.length) {
    console.log(`赤 ${red.length} 本: ${red.join(", ")}`);
    process.exit(1);
  }
}

main();
