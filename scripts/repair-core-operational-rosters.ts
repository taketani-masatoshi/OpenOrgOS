#!/usr/bin/env node
import { repairCoreOperationalAgentGaps } from "../src/lib/agent-roster.js";

const write = process.argv.includes("--write");
const results = repairCoreOperationalAgentGaps({ dryRun: !write });
const changed = results.filter((r) => r.added.length > 0);

if (!write) {
  if (!changed.length) {
    console.log("Core operational roster gaps: none");
    process.exit(0);
  }
  for (const row of changed) {
    console.log(`${row.tenantId}: missing ${row.added.join(", ")}`);
  }
  console.log(`Run with --write to add ${changed.length} tenant(s).`);
  process.exit(1);
}

for (const row of changed) {
  console.log(`✓ ${row.tenantId}: added ${row.added.join(", ")}`);
}
console.log(`Repaired ${changed.length} tenant roster(s).`);
