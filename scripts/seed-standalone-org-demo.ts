#!/usr/bin/env node
/**
 * Standalone OrgOS demo — single tenant, no peers, witness off.
 */

import { runStandaloneOrgDemo } from "./lib/standalone-org-demo.js";

const TENANT = process.env.STANDALONE_DEMO_TENANT ?? "hk-demo";

function main(): void {
  console.log(`\n=== Standalone OrgOS demo (${TENANT}) ===\n`);
  try {
    const result = runStandaloneOrgDemo(TENANT);
    console.log(`✓ org.identity.presented`);
    console.log(`✓ org.authority.delegated`);
    console.log(`✓ internal approval.granted · ${result.approvalEventId?.slice(0, 8) ?? ""}…`);
    console.log(`✓ audit-chain verify (${result.chainRecords} record(s))`);
    console.log("✓ protocol validate (standalone)");
    console.log("✓ tenant data validate");
    console.log("\nStandalone OrgOS demo complete — no peers · witness off\n");
  } catch (e) {
    console.error(`✗ ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  }
}

main();
