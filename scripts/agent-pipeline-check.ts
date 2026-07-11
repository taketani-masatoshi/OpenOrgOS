#!/usr/bin/env node
/**
 * Agent catalog · capability · docs · roster · generated artifacts — single check gate.
 */
import { execSync } from "node:child_process";
import {
  bootstrapAllTenantAgentRosters,
  listTenantsMissingAgentRoster,
} from "../src/lib/agent-roster.js";
import { validateGeneratedArtifacts } from "../src/lib/generated-artifacts.js";
import { listTenantsWithLegacyAgentRoster, listRosterManagedTenants } from "../src/lib/tenant-roster-bootstrap.js";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { ROOT_DIR } from "../src/lib/tenant.js";

const FIXTURE_ROOT = join(ROOT_DIR, "tests", "fixtures", "tenant-rosters");

const steps: Array<{ name: string; run: () => string[] }> = [
  {
    name: "agent-ids",
    run: () => {
      const issues: string[] = [];
      for (const issue of validateGeneratedArtifacts()) {
        if (issue.includes("agent-ids") || issue.includes("capability") || issue.includes("generated section")) {
          issues.push(issue);
        }
      }
      return issues;
    },
  },
  {
    name: "tenant-roster-coverage",
    run: () => {
      const issues: string[] = [];
      let missing = listTenantsMissingAgentRoster();
      if (missing.length) {
        bootstrapAllTenantAgentRosters({ force: false });
        missing = listTenantsMissingAgentRoster();
      }
      if (missing.length) {
        issues.push(`tenants missing agents.yaml: ${missing.join(", ")}`);
      }
      const legacy = listTenantsWithLegacyAgentRoster();
      if (legacy.length) {
        issues.push(`tenants with legacy agents-enabled.yaml: ${legacy.join(", ")}`);
      }
      return issues;
    },
  },
  {
    name: "tenant-roster-fixtures",
    run: () => {
      const issues: string[] = [];
      const expected = listRosterManagedTenants();
      if (!existsSync(FIXTURE_ROOT)) {
        issues.push("tests/fixtures/tenant-rosters missing — run npm run agent:roster:fixtures:sync");
        return issues;
      }
      const fixtures = readdirSync(FIXTURE_ROOT)
        .filter((name) => existsSync(join(FIXTURE_ROOT, name, "agents.yaml")))
        .sort();
      if (fixtures.join(",") !== expected.join(",")) {
        issues.push(
          `fixture drift — expected ${expected.length} tenants, got ${fixtures.length}; run npm run agent:roster:fixtures:sync`
        );
      }
      return issues;
    },
  },
];

function runNpmScript(script: string): void {
  execSync(`npm run ${script}`, { stdio: "inherit", cwd: process.cwd() });
}

const externalScripts = ["agent:catalog:check", "agent:capability:check", "agent:docs:check"] as const;

let failed = false;
for (const script of externalScripts) {
  try {
    runNpmScript(script);
    console.log(`✓ ${script}`);
  } catch {
    failed = true;
  }
}

for (const step of steps) {
  const issues = step.run();
  if (issues.length) {
    failed = true;
    for (const issue of issues) console.error(`✗ ${step.name}: ${issue}`);
  } else {
    console.log(`✓ ${step.name}`);
  }
}

const remaining = validateGeneratedArtifacts().filter(
  (issue) => !issue.includes("agent-ids") && !issue.includes("capability") && !issue.includes("generated section")
);
if (remaining.length) {
  failed = true;
  for (const issue of remaining) console.error(`✗ generated: ${issue}`);
} else {
  console.log("✓ community-export-determinism");
}

if (failed) process.exitCode = 1;
else console.log("Agent pipeline check: OK");
