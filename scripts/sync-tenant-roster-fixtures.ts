#!/usr/bin/env node
/**
 * Copy tenant data/operator/agents.yaml → tests/fixtures/tenant-rosters/{id}/agents.yaml
 * for Vitest fixture overlay (demo data restore does not wipe committed rosters).
 */
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  bootstrapAllTenantAgentRosters,
  listTenantsMissingAgentRoster,
} from "../src/lib/agent-roster.js";
import { AGENT_ROSTER_REL_PATH } from "../src/lib/tenant-roster-load.js";
import { listRosterManagedTenants } from "../src/lib/tenant-roster-bootstrap.js";
import { ROOT_DIR } from "../src/lib/tenant.js";

const FIXTURE_ROOT = join(ROOT_DIR, "tests", "fixtures", "tenant-rosters");
const write = process.argv.includes("--write");
const bootstrap = process.argv.includes("--bootstrap");

if (bootstrap && write) {
  const missing = listTenantsMissingAgentRoster();
  if (missing.length) {
    const results = bootstrapAllTenantAgentRosters({ force: false });
    const errors = results.filter((r) => r.action === "error");
    if (errors.length) {
      for (const err of errors) console.error(`${err.tenantId}: ${err.detail}`);
      process.exitCode = 1;
      process.exit(1);
    }
  }
}

const tenantIds = listRosterManagedTenants();
const issues: string[] = [];
const planned: Array<{ tenantId: string; src: string; dest: string }> = [];

for (const tenantId of tenantIds) {
  const src = join(ROOT_DIR, "tenants", tenantId, AGENT_ROSTER_REL_PATH);
  const dest = join(FIXTURE_ROOT, tenantId, "agents.yaml");
  if (!existsSync(src)) {
    issues.push(`${tenantId}: missing ${AGENT_ROSTER_REL_PATH}`);
    continue;
  }
  planned.push({ tenantId, src, dest });
}

if (!write) {
  if (issues.length) {
    for (const issue of issues) console.error(issue);
    process.exitCode = 1;
  } else {
    console.log(`Tenant roster fixtures: ${planned.length} ready to sync`);
  }
  process.exit(issues.length ? 1 : 0);
}

mkdirSync(FIXTURE_ROOT, { recursive: true });
const keep = new Set(planned.map((p) => p.tenantId));
for (const name of readdirSync(FIXTURE_ROOT)) {
  if (!keep.has(name)) rmSync(join(FIXTURE_ROOT, name), { recursive: true, force: true });
}

writeFileSync(
  join(FIXTURE_ROOT, "README.md"),
  [
    "# Tenant agent roster fixtures",
    "",
    "正本: `tenants/{id}/data/operator/agents.yaml`",
    "同期: `npm run agent:roster:fixtures:sync`",
    "",
    "Vitest `setup-restore-protocol.ts` が `tenants/demo/data` 復元後に overlay する。",
    "",
  ].join("\n"),
  "utf-8"
);

for (const { tenantId, src, dest } of planned) {
  mkdirSync(dirname(dest), { recursive: true });
  cpSync(src, dest);
  console.log(`✓ ${tenantId}`);
}

console.log(`Synced ${planned.length} tenant roster fixtures`);
