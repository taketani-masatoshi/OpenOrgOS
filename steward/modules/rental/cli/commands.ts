import { loadPropertyRevenuePlan } from "../../../../src/lib/data.js";
import {
  checkModuleCatalogOnly,
  loadEnabledModules,
} from "../../../../src/lib/modules.js";
import { getModuleTier } from "../../../../src/lib/module-readiness.js";
import { computeRentalPlanMetrics } from "./plan-metrics.js";

export const MODULE_ID = "rental";

export function runRentalShow(opts: { json?: boolean }): void {
  const enabled = loadEnabledModules().some((m) => m.id === MODULE_ID && m.enabled);
  const plan = loadPropertyRevenuePlan();
  const rows = plan.rental.map((entry) => ({
    property_id: entry.property_id,
    ...computeRentalPlanMetrics(plan, entry.property_id),
  }));
  const payload = {
    module: MODULE_ID,
    enabled,
    rental_count: rows.length,
    rows,
  };
  if (opts.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }
  console.log(`# rental — ${rows.length} property plan(s)`);
  for (const row of rows) {
    console.log(
      `- ${row.property_id}: monthly ${row.monthlyRevenue ?? "—"} · NOI ${row.noi ?? "—"}`,
    );
  }
}

export function runRentalValidate(): void {
  const issues = checkModuleCatalogOnly(MODULE_ID, getModuleTier(MODULE_ID));
  if (issues.length) {
    for (const i of issues) console.error(`✗ ${i.message}`);
    process.exit(1);
  }
  console.log("✓ rental module catalog OK");
}

export function runRentalRentRoll(opts: { json?: boolean; propertyId?: string }): void {
  const plan = loadPropertyRevenuePlan();
  const targets = opts.propertyId
    ? plan.rental.filter((r) => r.property_id === opts.propertyId)
    : plan.rental;
  const rows = targets.map((entry) => ({
    property_id: entry.property_id,
    monthly_rent: entry.monthly_rent,
    vacancy_rate: entry.vacancy_rate,
    management_fee: entry.management_fee,
    ...computeRentalPlanMetrics(plan, entry.property_id),
  }));
  if (opts.json) {
    console.log(JSON.stringify({ rows }, null, 2));
    return;
  }
  console.log("| Property | Rent | Vacancy | Mgmt fee | Monthly rev | NOI |");
  console.log("|---|---:|---:|---:|---:|---:|");
  for (const row of rows) {
    console.log(
      `| ${row.property_id} | ${row.monthly_rent} | ${row.vacancy_rate} | ${row.management_fee} | ${row.monthlyRevenue ?? "—"} | ${row.noi ?? "—"} |`,
    );
  }
}
