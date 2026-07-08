import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { runDashboard } from "./dashboard.js";
import { runOpsDaily } from "./ops.js";
import { runExecutiveBrief } from "./executive.js";
import { getTenantId } from "../lib/tenant.js";
import { ROOT_DIR } from "../lib/tenant.js";
import { listWorkOrders } from "../lib/escalate.js";
import { listAuditEvents } from "../lib/audit-log.js";
import { checkExecutiveBackupForWeekly } from "../lib/executive-backup.js";
import { ORGOS_TENANT_ENV, LEGACY_TENANT_ENV } from "../lib/orgos-cli.js";

export interface PipelineRunOptions {
  tenant?: string;
  skipValidate?: boolean;
}

export function runPipelineList(): void {
  console.log("Pipelines:\n");
  console.log("| name | steps |");
  console.log("|------|-------|");
  console.log("| daily | validate → ops daily → dashboard (+ agent summaries) |");
  console.log("| weekly | daily + routing-queue pending + audit log summary |");
  console.log("\n例: npm run orgos -- pipeline run daily");
  console.log("     npm run orgos -- pipeline run weekly");
}

export function runPipelineDaily(options: PipelineRunOptions = {}): void {
  const tenant = options.tenant ?? getTenantId();
  const env = { ...process.env, [ORGOS_TENANT_ENV]: tenant, [LEGACY_TENANT_ENV]: tenant };

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

export function runPipelineWeekly(options: PipelineRunOptions = {}): void {
  runPipelineDaily(options);

  const pending = listWorkOrders("pending");
  const blocked = listWorkOrders("blocked");
  const audit = listAuditEvents({ tenant: options.tenant ?? getTenantId() }).slice(-10);

  console.log("\n=== Weekly routing-queue ===");
  if (pending.length === 0 && blocked.length === 0) {
    console.log("✓ No pending/blocked work orders");
  } else {
    for (const w of [...pending, ...blocked]) {
      console.log(`  ${w.id} · ${w.to_agent} · ${w.status} · ${w.subject ?? "—"}`);
    }
  }

  console.log("\n=== Recent audit events ===");
  if (audit.length === 0) {
    console.log("(none)");
  } else {
    for (const e of audit) {
      console.log(`  ${e.timestamp.slice(0, 10)} ${e.event} ${e.ref}`);
    }
  }

  console.log("\n=== Executive backup (weekly) ===");
  const backup = checkExecutiveBackupForWeekly();
  console.log(backup.ok ? `✓ ${backup.message}` : `⚠ ${backup.message}`);
  if (!backup.ok) {
    console.error("\n✗ Weekly pipeline: executive backup overdue or missing stamp");
    process.exit(1);
  }

  if (process.env.STEWARD_WEEKLY_BRIEF !== "0") {
    console.log("\n→ executive brief --week");
    runExecutiveBrief({ markdown: true });
  }

  console.log("\n✓ Pipeline weekly complete");
}
