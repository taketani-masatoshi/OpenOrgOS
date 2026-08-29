import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { runDashboard } from "./dashboard.js";
import { runOpsDaily } from "./ops.js";
import { runExecutiveBrief } from "./executive.js";
import { getTenantId } from "../lib/tenant.js";
import { ROOT_DIR } from "../lib/tenant.js";
import { listWorkOrders, runEscalation } from "../lib/escalate.js";
import { listAuditEvents } from "../lib/audit-log.js";
import { checkExecutiveBackupForWeekly } from "../lib/executive-backup.js";
import { runJpBankCorporatePipelineCashflow } from "../lib/jp-bank-corporate/pipeline.js";
import { ORGOS_TENANT_ENV, LEGACY_TENANT_ENV } from "../lib/orgos-cli.js";
import { runEventsChainAttest } from "./company-events.js";
import { runEventsAuditMonthly } from "./company-events.js";
import { runIsoAuditRun } from "./iso-audit.js";

export interface PipelineRunOptions {
  tenant?: string;
  skipValidate?: boolean;
}

export function escalatePipelineFailure(opts: {
  pipeline: "weekly" | "monthly";
  step: string;
  message: string;
  tenant?: string;
}): void {
  try {
    const result = runEscalation({
      fromAgent: "records_audit",
      tenant: opts.tenant ?? getTenantId(),
      input: {
        subject: `Pipeline ${opts.pipeline} FAIL: ${opts.step}`,
        background: `Automated ${opts.pipeline} pipeline failed during records_audit step.`,
        requirements: [
          `Investigate: ${opts.message}`,
          "Run: orgos events chain verify",
          opts.pipeline === "weekly"
            ? "Retry: orgos events chain attest"
            : "Retry: orgos events audit monthly",
        ].join("\n"),
        path: "docs/org-os/records-audit-runbook.md",
        text: `records_audit pipeline ${opts.pipeline} ${opts.step}`,
      },
    });
    if (result.workOrders.length > 0) {
      console.error(`→ Work order created: ${result.workOrders.map((w) => w.id).join(", ")}`);
    }
  } catch (e) {
    console.error(`→ Escalation skipped: ${e instanceof Error ? e.message : String(e)}`);
  }
}

function recordPipelineFailure(
  failures: Array<{ step: string; message: string }>,
  step: string,
  message: string,
): void {
  failures.push({ step, message });
  console.error(`✗ ${step}: ${message}`);
}

export function runPipelineList(): void {
  console.log("Pipelines:\n");
  console.log("| name | steps |");
  console.log("|------|-------|");
  console.log("| daily | validate → ops daily → dashboard → jp bank cashflow (if enabled) |");
  console.log("| weekly | daily + routing-queue pending + audit log + ISO internal audit + events chain attest + executive backup |");
  console.log("| monthly | daily + company events monthly audit (records_audit) |");
  console.log("\n例: npm run orgos -- pipeline run daily");
  console.log("     npm run orgos -- pipeline run weekly");
  console.log("     npm run orgos -- pipeline run monthly");
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

  const cashflow = runJpBankCorporatePipelineCashflow();
  if (cashflow.ran) {
    console.log("\n→ jp bank cashflow generate (weekly)");
    for (const path of cashflow.output_paths) {
      console.log(`  ${path}`);
    }
  }

  console.log("\n✓ Pipeline daily complete");
}

export function runPipelineWeekly(options: PipelineRunOptions = {}): void {
  runPipelineDaily(options);
  const failures: Array<{ step: string; message: string }> = [];

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

  console.log("\n→ iso audit run (internal_audit weekly)");
  try {
    runIsoAuditRun({});
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    recordPipelineFailure(failures, "iso internal audit", message);
    escalatePipelineFailure({
      pipeline: "weekly",
      step: "iso internal audit",
      message,
      tenant: options.tenant,
    });
  }

  console.log("\n→ events chain attest (records_audit weekly)");
  try {
    runEventsChainAttest({});
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    recordPipelineFailure(failures, "events chain attest", message);
    escalatePipelineFailure({
      pipeline: "weekly",
      step: "events chain attest",
      message,
      tenant: options.tenant,
    });
  }

  console.log("\n=== Executive backup (weekly) ===");
  const backup = checkExecutiveBackupForWeekly();
  console.log(backup.ok ? `✓ ${backup.message}` : `⚠ ${backup.message}`);
  if (!backup.ok) {
    recordPipelineFailure(
      failures,
      "executive backup",
      backup.message,
    );
    escalatePipelineFailure({
      pipeline: "weekly",
      step: "executive backup",
      message: backup.message,
      tenant: options.tenant,
    });
  }

  if (process.env.STEWARD_WEEKLY_BRIEF !== "0") {
    console.log("\n→ executive brief --week");
    runExecutiveBrief({ markdown: true });
  }

  if (failures.length > 0) {
    console.error(`\n✗ Weekly pipeline failed (${failures.length} step(s))`);
    for (const f of failures) {
      console.error(`  · ${f.step}: ${f.message}`);
    }
    process.exit(1);
  }

  console.log("\n✓ Pipeline weekly complete");
}

export async function runPipelineMonthly(options: PipelineRunOptions = {}): Promise<void> {
  runPipelineDaily(options);
  const failures: Array<{ step: string; message: string }> = [];

  console.log("\n→ events audit monthly (records_audit)");
  try {
    await runEventsAuditMonthly({ notify: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    recordPipelineFailure(failures, "events audit monthly", message);
    escalatePipelineFailure({
      pipeline: "monthly",
      step: "events audit monthly",
      message,
      tenant: options.tenant,
    });
  }

  if (failures.length > 0) {
    console.error(`\n✗ Monthly pipeline failed (${failures.length} step(s))`);
    for (const f of failures) {
      console.error(`  · ${f.step}: ${f.message}`);
    }
    process.exit(1);
  }

  console.log("\n✓ Pipeline monthly complete");
}
