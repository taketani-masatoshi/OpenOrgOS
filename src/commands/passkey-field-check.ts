import {
  formatPasskeyFieldCheck,
  runPasskeyFieldCheck,
} from "../lib/wire-console/auth/passkey-field-check.js";
import { recordPasskeyFieldCheckToLog } from "../lib/wire-console/auth/passkey-field-check-record.js";

export async function runPasskeyFieldCheckCli(opts: {
  url: string;
  scope?: "chat" | "wire" | "all";
  json?: boolean;
  record?: boolean;
  operator?: string;
}): Promise<void> {
  const scope =
    opts.scope === "chat" || opts.scope === "wire" || opts.scope === "all"
      ? opts.scope
      : "all";
  const result = await runPasskeyFieldCheck({ url: opts.url, scope });
  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(formatPasskeyFieldCheck(result));
  }
  if (opts.record) {
    const path = recordPasskeyFieldCheckToLog(result, { operator: opts.operator });
    console.log(`Recorded automated checklist → ${path}`);
  }
  if (!result.ok) process.exitCode = 1;
}
