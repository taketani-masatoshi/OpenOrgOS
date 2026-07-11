import { formatPlatformExtensionReport, runPlatformExtensionChecks } from "../lib/platform-extension-check.js";

export interface PlatformExtensionCheckOptions {
  json?: boolean;
}

export function runPlatformExtensionCheck(opts: PlatformExtensionCheckOptions = {}): void {
  const checks = runPlatformExtensionChecks();
  if (opts.json) {
    console.log(JSON.stringify({ ok: checks.every((c) => c.ok), checks }, null, 2));
    if (!checks.every((c) => c.ok)) process.exit(1);
    return;
  }
  console.log(formatPlatformExtensionReport(checks));
  if (!checks.every((c) => c.ok)) process.exit(1);
}
