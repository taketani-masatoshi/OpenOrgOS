#!/usr/bin/env node
/**
 * Run `steward protocol validate` for every tenant in ci-validate-tenants.yaml.
 * Used by npm run validate:protocol:tenants · CI · npm run check.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import { setTenantId } from "../src/lib/tenant.js";
import { validateProtocolState } from "../src/lib/protocol/validate.js";

const ROOT = join(import.meta.dirname, "..");
const LIST_PATH = join(ROOT, "steward/platform/protocol/ci-validate-tenants.yaml");

interface TenantList {
  tenants: string[];
}

function loadTenantList(): string[] {
  const doc = YAML.parse(readFileSync(LIST_PATH, "utf-8")) as TenantList;
  if (!Array.isArray(doc.tenants) || doc.tenants.length === 0) {
    throw new Error(`${LIST_PATH}: tenants[] required`);
  }
  return doc.tenants;
}

function main(): void {
  const tenants = loadTenantList();
  let failed = 0;

  for (const tenant of tenants) {
    setTenantId(tenant);
    const result = validateProtocolState();
    if (result.ok) {
      console.log(`✓ ${tenant} protocol validate`);
      continue;
    }
    failed++;
    console.error(`✗ ${tenant} protocol validate failed:`);
    for (const issue of result.issues) {
      console.error(`    [${issue.code}] ${issue.message}`);
    }
  }

  if (failed > 0) {
    console.error(`\n${failed}/${tenants.length} tenant(s) failed protocol validate`);
    process.exit(1);
  }
  console.log(`\n✓ All ${tenants.length} tenants passed protocol validate`);
}

main();
