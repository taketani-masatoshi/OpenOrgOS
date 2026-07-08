import {
  daysUntil,
  getModuleDataDir,
  isModuleEnabled,
  loadModuleDataFile,
} from "../../../../src/lib/module-business-data.js";
import {
  pmManagementContractsFileSchema,
  pmServiceRequestsFileSchema,
} from "../../../../schemas/business-modules.js";

export const MODULE_ID = "property_management";

export function runPropertyManagementShow(opts: { json?: boolean }): void {
  const reqs = loadModuleDataFile(MODULE_ID, "service-requests.yaml", pmServiceRequestsFileSchema);
  const contracts = loadModuleDataFile(MODULE_ID, "management-contracts.yaml", pmManagementContractsFileSchema);
  const open = reqs?.data.service_requests.filter((r) => r.status === "open") ?? [];
  const summary = {
    module: MODULE_ID,
    enabled: isModuleEnabled(MODULE_ID),
    data_dir: getModuleDataDir(MODULE_ID),
    service_requests: reqs?.data.service_requests.length ?? 0,
    open_requests: open.length,
    active_contracts:
      contracts?.data.management_contracts.filter((c) => c.status === "active" || c.status === "executed")
        .length ?? 0,
  };
  if (opts.json) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }
  console.log(`# property_management\n`);
  console.log(
    `open requests: ${summary.open_requests} · contracts active: ${summary.active_contracts} · total SR: ${summary.service_requests}`
  );
}

export function runPropertyManagementValidate(): void {
  const issues: string[] = [];
  if (!isModuleEnabled(MODULE_ID)) issues.push("module not enabled");
  if (!loadModuleDataFile(MODULE_ID, "service-requests.yaml", pmServiceRequestsFileSchema)) {
    issues.push("service-requests.yaml missing");
  }
  if (!loadModuleDataFile(MODULE_ID, "management-contracts.yaml", pmManagementContractsFileSchema)) {
    issues.push("management-contracts.yaml missing");
  }
  if (issues.length) {
    console.error("✗ property_management:");
    for (const i of issues) console.error(`  - ${i}`);
    process.exit(1);
  }
  console.log("✓ property_management — PM data OK");
}

export function runPropertyManagementAction(_opts: Record<string, unknown>): void {
  const reqs = loadModuleDataFile(MODULE_ID, "service-requests.yaml", pmServiceRequestsFileSchema);
  if (!reqs) {
    console.error("service-requests.yaml not found");
    process.exit(1);
  }
  console.log("# Open service requests\n");
  const today = new Date().toISOString().slice(0, 10);
  for (const r of reqs.data.service_requests.filter((x) => x.status === "open")) {
    const sla = r.sla_due ? ` · SLA ${r.sla_due}${daysUntil(r.sla_due) < 0 ? " OVERDUE" : ""}` : "";
    console.log(`- ${r.id} ${r.title} (${r.pm_property_id})${sla}`);
  }
  if (!reqs.data.service_requests.some((x) => x.status === "open")) console.log("(none open)");
}
