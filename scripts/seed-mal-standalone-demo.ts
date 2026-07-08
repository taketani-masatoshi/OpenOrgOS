#!/usr/bin/env node
/**
 * MAL standalone OrgOS demo — peers/witness off · internal approve · validate.
 */

import { runStandaloneOrgDemo } from "./lib/standalone-org-demo.js";

function main(): void {
  console.log("\n=== MAL standalone OrgOS demo ===\n");
  try {
    const result = runStandaloneOrgDemo("mal");
    console.log(`✓ internal approval · ${result.approvalEventId?.slice(0, 8) ?? ""}…`);
    console.log(`✓ audit-chain (${result.chainRecords} records)`);
    console.log("✓ protocol validate (standalone)");
    console.log("✓ tenant data validate");
    console.log("\nMAL standalone OrgOS demo complete\n");
  } catch (e) {
    console.error(`✗ ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  }
}

main();
