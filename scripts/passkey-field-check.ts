#!/usr/bin/env node
/**
 * Automated passkey field / production readiness gate.
 * Manual Touch ID / hybrid: docs/org-os/passkey-field-validation-log.md
 *
 * Usage:
 *   npm run passkey:field-check -- --url https://operator.example.com
 *   npm run passkey:field-check -- --url http://127.0.0.1:9470 --json
 */
import {
  formatPasskeyFieldCheck,
  runPasskeyFieldCheck,
} from "../src/lib/wire-console/auth/passkey-field-check.js";

function parseArgs(): {
  url: string;
  json: boolean;
  scope: "chat" | "wire" | "all";
  record: boolean;
  operator?: string;
} {
  const args = process.argv.slice(2);
  let url = process.env.OPERATOR_CONSOLE_URL?.trim() ?? "";
  let json = false;
  let record = false;
  let operator: string | undefined;
  let scope: "chat" | "wire" | "all" = "all";

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--url" && args[i + 1]) url = args[++i]!;
    else if (a === "--json") json = true;
    else if (a === "--record") record = true;
    else if (a === "--operator" && args[i + 1]) operator = args[++i];
    else if (a === "--scope" && args[i + 1]) {
      const s = args[++i]!;
      if (s === "chat" || s === "wire" || s === "all") scope = s;
    }
  }

  if (!url) {
    console.error(
      "Usage: passkey:field-check -- --url https://operator.example.com [--json] [--record] [--operator name] [--scope chat|wire|all]",
    );
    process.exit(1);
  }

  return { url: url.replace(/\/$/, ""), json, scope, record, operator };
}

async function main(): Promise<void> {
  const opts = parseArgs();
  const result = await runPasskeyFieldCheck({ url: opts.url, scope: opts.scope });
  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(formatPasskeyFieldCheck(result));
  }
  if (opts.record) {
    const { recordPasskeyFieldCheckToLog } = await import(
      "../src/lib/wire-console/auth/passkey-field-check-record.js"
    );
    const path = recordPasskeyFieldCheckToLog(result, { operator: opts.operator });
    console.log(`Recorded automated checklist → ${path}`);
  }
  if (!result.ok) process.exit(1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
