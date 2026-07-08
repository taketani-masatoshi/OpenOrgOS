import { syncAllCsv, syncContractsCsv } from "../lib/sync-csv.js";

export function runSyncAll(): void {
  const result = syncAllCsv();
  console.log("✓ CSV synced from YAML:");
  for (const [key, path] of Object.entries(result)) {
    console.log(`  ${key}: ${path}`);
  }
}

export function runSyncContracts(): void {
  const path = syncContractsCsv();
  console.log(`✓ ${path}`);
}
