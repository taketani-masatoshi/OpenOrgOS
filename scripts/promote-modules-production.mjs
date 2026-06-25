#!/usr/bin/env node
/** Patch module.manifest.yaml + readiness.yaml for production_ready promotion. */
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const PROMOTIONS = [
  ["staffing", "staffing-monthly", "assignments/staff + invoice · operations staffing CLI"],
  ["event_space", "event-space-monthly", "bookings/spaces + invoice seed"],
  ["retail_store", "retail-monthly", "inventory/sales + invoice seed"],
  ["logistics", "logistics-monthly", "shipments + invoice seed"],
  ["clinic", "clinic-monthly", "patients/appointments + invoice seed"],
  ["construction", "construction-monthly", "projects + invoice seed"],
  ["education", "education-monthly", "courses/enrollments + invoice seed"],
  ["venture_capital", "vc-monthly", "funds/portfolio + invoice seed"],
  ["software_outsourcing", "software-out-monthly", "SOW/milestones + invoice seed"],
  ["event_operations", "event-ops-monthly", "events/run_of_show + invoice seed"],
  ["real_estate_brokerage", "brokerage-monthly", "listings/deals + invoice seed"],
  ["property_management", "pm-monthly", "pm-properties/contracts + invoice seed"],
];

for (const [mod, tid, notes] of PROMOTIONS) {
  const manifestPath = join(ROOT, "steward/modules", mod, "module.manifest.yaml");
  let raw = readFileSync(manifestPath, "utf-8");
  raw = raw.replace(/required_seeds: \[\]/, `required_seeds:\n  - invoice-${tid}.yaml\n  - invoice-${tid}-body.txt`);
  raw = raw.replace(/notes: .*/, `notes: production_ready — ${notes}`);
  writeFileSync(manifestPath, raw);
  console.log(`manifest ${mod}`);
}

const readinessPath = join(ROOT, "steward/modules/readiness.yaml");
const readiness = YAML.parse(readFileSync(readinessPath, "utf-8"));
for (const [mod, , notes] of PROMOTIONS) {
  if (readiness.modules[mod]) {
    readiness.modules[mod].tier = "production_ready";
    readiness.modules[mod].notes = notes;
  }
}
writeFileSync(readinessPath, YAML.stringify(readiness));
console.log("readiness.yaml updated");
