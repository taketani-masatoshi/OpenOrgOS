/**
 * Test suite verification for strict Core scoring (orgos-scoring-methodology §3).
 * Written by `npm test` on success; cleared at test start.
 */
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT_DIR } from "../tenant.js";

export const TEST_SUITE_STATUS_DIR = join(ROOT_DIR, ".orgos-ci");
export const TEST_SUITE_STATUS_PATH = join(TEST_SUITE_STATUS_DIR, "test-suite.json");

export interface TestSuiteStatus {
  passed: boolean;
  at: string;
  source: string;
  testCount?: number;
}

export function clearTestSuiteStatus(): void {
  if (existsSync(TEST_SUITE_STATUS_PATH)) {
    unlinkSync(TEST_SUITE_STATUS_PATH);
  }
}

export function writeTestSuitePassed(source = "npm test", testCount?: number): void {
  mkdirSync(TEST_SUITE_STATUS_DIR, { recursive: true });
  const payload: TestSuiteStatus = {
    passed: true,
    at: new Date().toISOString(),
    source,
    ...(testCount !== undefined ? { testCount } : {}),
  };
  writeFileSync(TEST_SUITE_STATUS_PATH, `${JSON.stringify(payload, null, 2)}\n`, "utf-8");
}

export function writeTestSuiteFailed(source = "npm test"): void {
  mkdirSync(TEST_SUITE_STATUS_DIR, { recursive: true });
  const payload: TestSuiteStatus = {
    passed: false,
    at: new Date().toISOString(),
    source,
  };
  writeFileSync(TEST_SUITE_STATUS_PATH, `${JSON.stringify(payload, null, 2)}\n`, "utf-8");
}

export function readTestSuiteStatus(): TestSuiteStatus | null {
  if (process.env.ORGOS_TEST_SUITE_PASSED === "1") {
    return {
      passed: true,
      at: new Date().toISOString(),
      source: "ORGOS_TEST_SUITE_PASSED",
    };
  }
  if (!existsSync(TEST_SUITE_STATUS_PATH)) return null;
  try {
    return JSON.parse(readFileSync(TEST_SUITE_STATUS_PATH, "utf-8")) as TestSuiteStatus;
  } catch {
    return null;
  }
}

/** Strict Core scoring input — not executed during `status` (reads last `npm test` marker). */
export function resolveTestSuiteVerification(): {
  verified: boolean;
  passed: boolean;
  detail: string;
} {
  const status = readTestSuiteStatus();
  if (!status) {
    return {
      verified: false,
      passed: false,
      detail: "npm test 未検証 — 実行後に Core 厳格が checklist に追従",
    };
  }
  if (status.passed) {
    return {
      verified: true,
      passed: true,
      detail: `npm test 成功 (${status.at.slice(0, 10)} · ${status.source})`,
    };
  }
  return {
    verified: true,
    passed: false,
    detail: `npm test 失敗 (${status.at.slice(0, 10)} · ${status.source})`,
  };
}
