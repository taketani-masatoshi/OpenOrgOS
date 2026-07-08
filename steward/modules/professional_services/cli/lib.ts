import {
  daysUntil,
  isModuleEnabled,
  loadModuleDataFile,
  getModuleDataDir,
} from "../../../../src/lib/module-business-data.js";
import { psProjectsFileSchema } from "../../../../schemas/business-modules.js";

export const MODULE_ID = "professional_services";

export function runProfessionalServicesShow(opts: { json?: boolean }): void {
  const loaded = loadModuleDataFile(MODULE_ID, "projects.yaml", psProjectsFileSchema);
  const projects = loaded?.data.projects ?? [];
  const active = projects.filter((p) => p.status === "active");
  const billable = active.filter((p) => p.contract_id);
  const summary = {
    module: MODULE_ID,
    enabled: isModuleEnabled(MODULE_ID),
    data_dir: getModuleDataDir(MODULE_ID),
    source: loaded?.path ?? null,
    total: projects.length,
    active: active.length,
    billable: billable.length,
  };
  if (opts.json) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }
  console.log(`# professional_services\n`);
  console.log(`projects: ${summary.total} · active: ${summary.active} · billable (CTR linked): ${summary.billable}`);
  console.log(`data: ${summary.data_dir}`);
}

export function runProfessionalServicesValidate(): void {
  const issues: string[] = [];
  if (!isModuleEnabled(MODULE_ID)) issues.push("module not enabled in modules.yaml");
  const loaded = loadModuleDataFile(MODULE_ID, "projects.yaml", psProjectsFileSchema);
  if (!loaded) {
    issues.push("projects.yaml missing — copy from seed");
  } else {
    const ids = new Set<string>();
    for (const p of loaded.data.projects) {
      if (ids.has(p.id)) issues.push(`duplicate project id ${p.id}`);
      ids.add(p.id);
      if (p.status === "active" && !p.contract_id) issues.push(`${p.id}: active without contract_id`);
    }
  }
  if (issues.length) {
    console.error("✗ professional_services:");
    for (const i of issues) console.error(`  - ${i}`);
    process.exit(1);
  }
  console.log("✓ professional_services — projects OK");
}

export function runProfessionalServicesAction(_opts: Record<string, unknown>): void {
  const loaded = loadModuleDataFile(MODULE_ID, "projects.yaml", psProjectsFileSchema);
  if (!loaded) {
    console.error("projects.yaml not found");
    process.exit(1);
  }
  const rows = loaded.data.projects.filter((p) => p.status === "active" && p.contract_id);
  console.log("# Billing-ready projects\n");
  if (!rows.length) {
    console.log("(none — enable active projects with contract_id)");
    return;
  }
  for (const p of rows) {
    console.log(`- ${p.id} ${p.name} · ${p.client ?? "—"} · ${p.contract_id}`);
  }
  console.log("\n次: npm run orgos -- invoice generate (billing in modules.yaml)");
}
