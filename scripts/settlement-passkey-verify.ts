#!/usr/bin/env node
/**
 * ADR 0037 Phase 4 — Settlement PassKey production readiness gate.
 * Runs prod HTTP checks + settlement step-up unit tests.
 *
 * Usage:
 *   npm run settlement-passkey:verify -- --url https://operator.example.com [--tenant mal]
 *   npm run settlement-passkey:verify -- --url http://127.0.0.1:9470 --skip-unit-tests
 */
import { spawnSync } from "node:child_process";

function parseArgs(): { url: string; tenant: string; skipUnit: boolean } {
  const args = process.argv.slice(2);
  let url = process.env.OPERATOR_CONSOLE_URL?.trim() ?? "";
  let tenant = process.env.ORGOS_TENANT?.trim() ?? "mal";
  let skipUnit = false;

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--url" && args[i + 1]) url = args[++i]!;
    else if (a === "--tenant" && args[i + 1]) tenant = args[++i]!;
    else if (a === "--skip-unit-tests") skipUnit = true;
  }

  if (!url) {
    console.error(
      "Usage: settlement-passkey:verify -- --url https://operator.example.com [--tenant mal] [--skip-unit-tests]"
    );
    process.exit(1);
  }

  return { url: url.replace(/\/$/, ""), tenant, skipUnit };
}

function main(): void {
  const opts = parseArgs();
  console.log(`Settlement PassKey verify · ${opts.url} · tenant=${opts.tenant}\n`);

  const isLocal = /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/i.test(opts.url);
  const prodArgs = [
    "run",
    "prod:verify",
    "--",
    "--url",
    opts.url,
    "--tenant",
    opts.tenant,
    "--skip-witness",
  ];
  if (isLocal) prodArgs.push("--skip-doctor");
  const prod = spawnSync("npm", prodArgs, {
    cwd: process.cwd(),
    encoding: "utf-8",
    stdio: "inherit",
  });
  if (prod.status !== 0) process.exit(prod.status ?? 1);

  if (!opts.skipUnit) {
    console.log("\nRunning settlement step-up unit tests…");
    const unit = spawnSync(
      "npx",
      ["vitest", "run", "tests/settlement-stepup.test.ts"],
      { cwd: process.cwd(), encoding: "utf-8", stdio: "inherit" }
    );
    if (unit.status !== 0) process.exit(unit.status ?? 1);
    console.log("✓ settlement-stepup unit tests");
  }

  console.log("\n✓ Settlement PassKey verify passed");
  console.log(
    "  Manual (iPhone hybrid + Bluetooth): docs/org-os/settlement-passkey-production-verification.md §3–§6"
  );
}

main();
