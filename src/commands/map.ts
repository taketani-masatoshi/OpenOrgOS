import {
  buildTenantMapTree,
  formatMapTree,
  listTenantPathMappings,
  resolveLogicalPath,
} from "../lib/tenant-map.js";
import { getTenantId } from "../lib/tenant.js";

export function runMapList(): void {
  const rows = listTenantPathMappings();
  console.log(`Tenant: ${getTenantId()}\n`);
  console.log("| scope | logical | absolute |");
  console.log("|-------|---------|----------|");
  for (const row of rows) {
    console.log(`| ${row.scope} | ${row.logical} | ${row.absolute} |`);
  }
}

export function runMapResolve(logical: string): void {
  const row = resolveLogicalPath(logical);
  console.log(`${row.logical}`);
  console.log(`  → ${row.absolute} (${row.scope})`);
}

export function runMapTree(): void {
  console.log(`Tenant map tree: ${getTenantId()}\n`);
  console.log(formatMapTree(buildTenantMapTree()));
}
