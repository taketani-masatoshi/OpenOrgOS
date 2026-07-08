import { isModuleEnabled, loadModuleDataFile } from "../../../../src/lib/module-business-data.js";
import { brokerageDealsFileSchema } from "../../../../schemas/business-modules.js";

export const MODULE_ID = "real_estate_brokerage";

export function runRealEstateBrokerageShow(opts: { json?: boolean }): void {
  const deals = loadModuleDataFile(MODULE_ID, "deals.yaml", brokerageDealsFileSchema);
  const byStatus: Record<string, number> = {};
  for (const d of deals?.data.deals ?? []) {
    byStatus[d.status] = (byStatus[d.status] ?? 0) + 1;
  }
  const summary = {
    module: MODULE_ID,
    enabled: isModuleEnabled(MODULE_ID),
    deals: deals?.data.deals.length ?? 0,
    by_status: byStatus,
  };
  if (opts.json) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }
  console.log(`# real_estate_brokerage\n`);
  console.log(`deals: ${summary.deals} · ${Object.entries(byStatus).map(([k, v]) => `${k}:${v}`).join(" · ") || "—"}`);
}

export function runRealEstateBrokerageValidate(): void {
  const issues: string[] = [];
  if (!isModuleEnabled(MODULE_ID)) issues.push("module not enabled");
  const deals = loadModuleDataFile(MODULE_ID, "deals.yaml", brokerageDealsFileSchema);
  if (!deals) issues.push("deals.yaml missing");
  else {
    for (const d of deals.data.deals) {
      if (d.status === "negotiating" && !d.important_matters_id) {
        issues.push(`${d.id}: negotiating without important_matters_id`);
      }
    }
  }
  if (issues.length) {
    console.error("✗ real_estate_brokerage:");
    for (const i of issues) console.error(`  - ${i}`);
    process.exit(1);
  }
  console.log("✓ real_estate_brokerage — deals OK");
}

export function runRealEstateBrokerageAction(_opts: Record<string, unknown>): void {
  const deals = loadModuleDataFile(MODULE_ID, "deals.yaml", brokerageDealsFileSchema);
  if (!deals) {
    console.error("deals.yaml not found");
    process.exit(1);
  }
  console.log("# Deal pipeline\n");
  const order = ["lead", "negotiating", "contracted", "closed", "lost"];
  for (const status of order) {
    const rows = deals.data.deals.filter((d) => d.status === status);
    if (!rows.length) continue;
    console.log(`\n## ${status}`);
    for (const d of rows) {
      console.log(`- ${d.id} · listing ${d.listing_id}${d.important_matters_id ? " · IM ok" : " · IM pending"}`);
    }
  }
}
