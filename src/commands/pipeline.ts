import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { runDashboard } from "./dashboard.js";
import { runOpsDaily } from "./ops.js";
import { getTenantId } from "../lib/tenant.js";
import { ROOT_DIR } from "../lib/tenant.js";

export interface PipelineRunOptions {
  tenant?: string;
  skipValidate?: boolean;
}

export function runPipelineList(): void {
  console.log("Pipelines:\n");
  console.log("| name | steps |");
  console.log("|------|-------|");
  console.log("| daily | validate → ops daily → dashboard (+ agent summaries) |");
  console.log("\n例: npm run steward -- pipeline run daily");
  console.log("     npm run steward -- --tenant demo pipeline run daily");
}

export function runPipelineDaily(options: PipelineRunOptions = {}): void {
  const tenant = options.tenant ?? getTenantId();
  const env = { ...process.env, STEWARD_TENANT: tenant };

  console.log(`Pipeline daily · tenant=${tenant}\n`);

  if (!options.skipValidate) {
    console.log("→ validate");
    execFileSync("npm", ["run", "validate"], {
      cwd: ROOT_DIR,
      env,
      stdio: "inherit",
    });
  }

  console.log("\n→ ops daily");
  runOpsDaily();

  console.log("\n→ dashboard (+ agent summaries)");
  runDashboard({ markdown: true });

  console.log("\n✓ Pipeline daily complete");
}
