import {
  formatPasskeyFieldCheck,
  runPasskeyFieldCheck,
} from "../lib/wire-console/auth/passkey-field-check.js";

export async function runPasskeyFieldCheckCli(opts: {
  url: string;
  scope?: "chat" | "wire" | "all";
  json?: boolean;
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
  if (!result.ok) process.exitCode = 1;
}
