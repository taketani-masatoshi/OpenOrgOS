import { daysUntil, isModuleEnabled, loadModuleDataFile } from "../../../../src/lib/module-business-data.js";
import {
  membershipMembersFileSchema,
  membershipPlansFileSchema,
} from "../../../../schemas/business-modules.js";

export const MODULE_ID = "membership";

export function runMembershipShow(opts: { json?: boolean }): void {
  const members = loadModuleDataFile(MODULE_ID, "members.yaml", membershipMembersFileSchema);
  const active = members?.data.members.filter((m) => m.status === "active") ?? [];
  const summary = {
    module: MODULE_ID,
    enabled: isModuleEnabled(MODULE_ID),
    members: members?.data.members.length ?? 0,
    active: active.length,
  };
  if (opts.json) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }
  console.log(`# membership\n`);
  console.log(`members: ${summary.members} · active: ${summary.active}`);
}

export function runMembershipValidate(): void {
  const issues: string[] = [];
  if (!isModuleEnabled(MODULE_ID)) issues.push("module not enabled");
  if (!loadModuleDataFile(MODULE_ID, "members.yaml", membershipMembersFileSchema)) {
    issues.push("members.yaml missing");
  }
  if (!loadModuleDataFile(MODULE_ID, "plans.yaml", membershipPlansFileSchema)) {
    issues.push("plans.yaml missing");
  }
  if (issues.length) {
    console.error("✗ membership:");
    for (const i of issues) console.error(`  - ${i}`);
    process.exit(1);
  }
  console.log("✓ membership — members OK");
}

export function runMembershipAction(_opts: Record<string, unknown>): void {
  const members = loadModuleDataFile(MODULE_ID, "members.yaml", membershipMembersFileSchema);
  if (!members) {
    console.error("members.yaml not found");
    process.exit(1);
  }
  console.log("# Renewal / lapse watch (90d)\n");
  let count = 0;
  for (const m of members.data.members) {
    if (m.status !== "active" || !m.renews_on) continue;
    const d = daysUntil(m.renews_on);
    if (d >= 0 && d <= 90) {
      console.log(`- ${m.id} · plan ${m.plan_id} · renews ${m.renews_on} (${d}d)`);
      count++;
    }
  }
  if (!count) console.log("(none with renews_on in window — set renews_on in YAML)");
}
