#!/usr/bin/env node
import {
  bootstrapAllTenantAgentRosters,
  listTenantsMissingAgentRoster,
} from "../src/lib/agent-roster.js";

const write = process.argv.includes("--write");
const force = process.argv.includes("--force");
const json = process.argv.includes("--json");

const missing = listTenantsMissingAgentRoster();
if (!write) {
  const payload = { missing, count: missing.length };
  if (json) console.log(JSON.stringify(payload, null, 2));
  else console.log(`Tenants missing agents.yaml: ${missing.length ? missing.join(", ") : "none"}`);
  process.exit(0);
}

const results = bootstrapAllTenantAgentRosters({ force });
const created = results.filter((r) => r.action === "created");
const errors = results.filter((r) => r.action === "error");

if (json) {
  console.log(JSON.stringify({ created: created.length, errors: errors.length, results }, null, 2));
} else {
  for (const result of results) {
    if (result.action === "created") console.log(`✓ ${result.tenantId}: ${result.detail}`);
    else if (result.action === "error") console.error(`✗ ${result.tenantId}: ${result.detail}`);
  }
  console.log(`Created ${created.length} · errors ${errors.length}`);
}

if (errors.length) process.exitCode = 1;
