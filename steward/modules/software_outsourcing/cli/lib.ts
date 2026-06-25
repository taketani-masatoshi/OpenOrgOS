import { isModuleEnabled, loadModuleDataFile } from "../../../../src/lib/module-business-data.js";
import {
  swMilestonesFileSchema,
  swSowContractsFileSchema,
  swTimesheetsFileSchema,
} from "../../../../schemas/business-modules.js";
import { daysUntil } from "../../../../src/lib/module-business-data.js";

export const MODULE_ID = "software_outsourcing";

export function runSoftwareOutsourcingShow(opts: { json?: boolean }): void {
  const ms = loadModuleDataFile(MODULE_ID, "milestones.yaml", swMilestonesFileSchema);
  const ts = loadModuleDataFile(MODULE_ID, "timesheets.yaml", swTimesheetsFileSchema);
  const pending =
    ms?.data.milestones.filter((m) => m.status !== "done" && daysUntil(m.due_date) <= 14) ?? [];
  const summary = {
    module: MODULE_ID,
    enabled: isModuleEnabled(MODULE_ID),
    milestones: ms?.data.milestones.length ?? 0,
    due_soon: pending.length,
    timesheets_pending:
      ts?.data.timesheets.filter((t) => t.status === "draft" || t.status === "submitted").length ?? 0,
  };
  if (opts.json) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }
  console.log(`# software_outsourcing\n`);
  console.log(`milestones: ${summary.milestones} · due ≤14d: ${summary.due_soon} · timesheets open: ${summary.timesheets_pending}`);
}

export function runSoftwareOutsourcingValidate(): void {
  const issues: string[] = [];
  if (!isModuleEnabled(MODULE_ID)) issues.push("module not enabled");
  if (!loadModuleDataFile(MODULE_ID, "milestones.yaml", swMilestonesFileSchema)) {
    issues.push("milestones.yaml missing");
  }
  if (!loadModuleDataFile(MODULE_ID, "sow-contracts.yaml", swSowContractsFileSchema)) {
    issues.push("sow-contracts.yaml missing");
  }
  if (issues.length) {
    console.error("✗ software_outsourcing:");
    for (const i of issues) console.error(`  - ${i}`);
    process.exit(1);
  }
  console.log("✓ software_outsourcing — milestones OK");
}

export function runSoftwareOutsourcingAction(_opts: Record<string, unknown>): void {
  const ms = loadModuleDataFile(MODULE_ID, "milestones.yaml", swMilestonesFileSchema);
  if (!ms) {
    console.error("milestones.yaml not found");
    process.exit(1);
  }
  console.log("# Milestones due or overdue\n");
  for (const m of ms.data.milestones) {
    if (m.status === "done") continue;
    const d = daysUntil(m.due_date);
    if (d <= 14) {
      console.log(`- ${m.id} ${m.name} · ${m.sow_id} · due ${m.due_date} (${d}d) · ${m.status}`);
    }
  }
}
