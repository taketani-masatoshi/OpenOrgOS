import { isModuleEnabled, loadModuleDataFile } from "../../../../src/lib/module-business-data.js";
import { staffingAssignmentsFileSchema } from "../../../../schemas/business-modules.js";

export const MODULE_ID = "staffing";

export function runStaffingShow(opts: { json?: boolean }): void {
  const assignments = loadModuleDataFile(MODULE_ID, "assignments.yaml", staffingAssignmentsFileSchema);
  const active = assignments?.data.assignments.filter((a) => a.status === "active") ?? [];
  const summary = {
    module: MODULE_ID,
    enabled: isModuleEnabled(MODULE_ID),
    assignments: assignments?.data.assignments.length ?? 0,
    active: active.length,
  };
  if (opts.json) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }
  console.log(`# staffing\n`);
  console.log(`assignments: ${summary.assignments} · active: ${summary.active}`);
}

export function runStaffingValidate(): void {
  const issues: string[] = [];
  if (!isModuleEnabled(MODULE_ID)) issues.push("module not enabled");
  if (!loadModuleDataFile(MODULE_ID, "assignments.yaml", staffingAssignmentsFileSchema)) {
    issues.push("assignments.yaml missing");
  }
  if (issues.length) {
    console.error("✗ staffing:");
    for (const i of issues) console.error(`  - ${i}`);
    process.exit(1);
  }
  console.log("✓ staffing — assignments OK");
}

export function runStaffingAction(_opts: Record<string, unknown>): void {
  const assignments = loadModuleDataFile(MODULE_ID, "assignments.yaml", staffingAssignmentsFileSchema);
  if (!assignments) {
    console.error("assignments.yaml not found");
    process.exit(1);
  }
  console.log("# Active assignments\n");
  for (const a of assignments.data.assignments.filter((x) => x.status === "active")) {
    console.log(
      `- ${a.id} · staff ${a.staff_id} → client ${a.client_id} · ${a.start_date}${a.end_date ? `–${a.end_date}` : ""}${a.bill_rate_yen ? ` · ¥${a.bill_rate_yen}/h` : ""}`
    );
  }
}
