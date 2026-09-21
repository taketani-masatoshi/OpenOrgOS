#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import {
  clearTestSuiteStatus,
  writeTestSuiteFailed,
  writeTestSuitePassed,
} from "../src/lib/protocol/test-suite-status.js";
import { ROOT_DIR } from "../src/lib/tenant.js";
import { assertDisposableTestWorkspace } from "../tests/helpers/test-workspace-guard.js";

assertDisposableTestWorkspace(ROOT_DIR);
clearTestSuiteStatus();
const vitestArgs = ["vitest", "run", ...process.argv.slice(2)];
const result = spawnSync("npx", vitestArgs, { stdio: "inherit", env: process.env });
if (result.status === 0) {
  writeTestSuitePassed("npm test");
  process.exit(0);
}
writeTestSuiteFailed("npm test");
process.exit(result.status ?? 1);
