import {
  formatPlatformRegistryReport,
  verifyPlatformRegistry,
} from "../lib/platform-registry-verify.js";

export interface PlatformRegistryVerifyOptions {
  json?: boolean;
}

export function runPlatformRegistryVerify(opts: PlatformRegistryVerifyOptions = {}): void {
  const issues = verifyPlatformRegistry();
  if (opts.json) {
    console.log(JSON.stringify({ ok: issues.length === 0, issues }, null, 2));
    if (issues.length > 0) process.exit(1);
    return;
  }
  console.log(formatPlatformRegistryReport(issues));
  if (issues.length > 0) process.exit(1);
}
