import { spawnSync, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const workspace = mkdtempSync(join(tmpdir(), "orgos-customer-journey-"));
const results = join(root, "test-results", "customer-journey");
mkdirSync(results, { recursive: true });
const runDir = mkdtempSync(join(results, "run-"));
const startedAt = new Date().toISOString();
const env = { ...process.env };
// Never inherit operator paths, authentication, billing credentials or cloud
// runtime settings into this synthetic test process.
for (const key of Object.keys(env)) {
  if (/^(ORGOS_|STEWARD_|WIRE_|STRIPE_|OPENAI_|ANTHROPIC_|OLLAMA_)/.test(key)) delete env[key];
}
Object.assign(env, {
  ORGOS_HOME: root,
  ORGOS_WORKSPACE: workspace,
  ORGOS_CUSTOMER_JOURNEY_RUN_ROOT: workspace,
  ORGOS_TENANT: "cux-journey-001",
  ORGOS_AUDIT_LOG: join(workspace, "audit.jsonl"),
  ORGOS_AUDIT_BRIDGE_DISABLED: "1",
  ORGOS_HUMAN_APPROVAL_STORE: join(workspace, "human-approval.json"),
  ORGOS_HUMAN_APPROVAL_SECRET: "synthetic-customer-journey-only",
  ORGOS_STRIPE_SECRETS_FILE: join(workspace, "stripe.env"),
  ORGOS_SETTLEMENT_STEPUP: "0",
  ORGOS_VALIDATE_SKIP_SYSTEM_BACKUP_CHECK: "1",
  ORGOS_LLM_MOCK: "1",
  ORGOS_CSRF: "0",
  ORGOS_SESSION_PERSIST: "0",
  STEWARD_CHAT_AUTH: "1",
  NODE_ENV: "test",
});
let head = null;
let diffSha256 = null;
try {
  head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  diffSha256 = createHash("sha256")
    .update(execFileSync("git", ["diff", "HEAD", "--", ".", ":(exclude)tenants"], { cwd: root }))
    .digest("hex");
} catch {
  /* A source archive may not contain Git metadata. */
}

let exitCode = 1;
try {
  const result = spawnSync(
    process.execPath,
    [
      join(root, "node_modules/vitest/vitest.mjs"),
      "run",
      "--config",
      "vitest.customer-journey.config.ts",
      "--reporter=default",
      "--reporter=json",
      `--outputFile.json=${join(runDir, "vitest.json")}`,
    ],
    { cwd: root, env, stdio: "inherit", timeout: 180_000, killSignal: "SIGKILL" }
  );
  let report;
  try {
    report = JSON.parse(readFileSync(join(runDir, "vitest.json"), "utf8"));
  } catch {
    /* Failed before reporting. */
  }
  // Empty, skipped or interrupted runs cannot become positive evidence.
  const passed =
    result.status === 0 &&
    report?.success === true &&
    report.numTotalTests > 0 &&
    report.numPassedTests === report.numTotalTests;
  exitCode = passed ? 0 : 1;
  writeFileSync(
    join(runDir, "evidence.json"),
    JSON.stringify(
      {
        version: 1,
        data_kind: "synthetic",
        verification: "http-integration",
        production_verified: false,
        started_at: startedAt,
        completed_at: new Date().toISOString(),
        source: {
          head,
          tracked_diff_sha256: diffSha256,
          harness_sha256: createHash("sha256")
            .update(
              [
                "scripts/run-customer-journey.mjs",
                "vitest.customer-journey.config.ts",
                "tests/customer-journey-http.test.ts",
                "tests/test-workspace-guard.test.ts",
                "tests/helpers/test-workspace-guard.ts",
                "tests/commercial-readiness.test.ts",
                "tests/reconciliation-safety.test.ts",
                "tests/reconciliation-recovery.test.ts",
              ]
                .map((path) => readFileSync(join(root, path)))
                .join("\n")
            )
            .digest("hex"),
        },
        passed,
        exit_code: result.status,
        signal: result.signal,
        tests: report
          ? {
              total: report.numTotalTests,
              passed: report.numPassedTests,
              failed: report.numFailedTests,
            }
          : null,
        duration_ms: Date.now() - Date.parse(startedAt),
        limitations: [
          "synthetic session; no Passkey ceremony",
          "CSRF and settlement step-up disabled",
          "no browser, external AI, payment or customer outcome verification",
        ],
      },
      null,
      2
    ) + "\n"
  );
  console.log(`Customer journey evidence: ${runDir}`);
} finally {
  // Only remove the directory allocated by this process.
  rmSync(workspace, { recursive: true, force: true });
}
process.exitCode = exitCode;
