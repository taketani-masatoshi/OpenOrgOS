import { writeFileSync, readFileSync, existsSync, readdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { setTenantId, getTenantDir } from "../../src/lib/tenant.js";

/** Isolated tenant for finance / GL / ledger vitest — safe for journal writes. */
export const FINANCE_FIXTURE_TENANT = "_fixture-books";

export function useFinanceFixtureTenant(): void {
  setTenantId(FINANCE_FIXTURE_TENANT);
}

/** Reset fixture journal ledger between tests (append-only file accumulates otherwise). */
export function resetFixtureJournalEntries(): void {
  useFinanceFixtureTenant();
  const base = join(getTenantDir(), "data/finance");
  writeFileSync(join(base, "journal-entries.yaml"), "version: 1\nentries: []\n", "utf-8");
  writeFileSync(join(base, "period-locks.yaml"), "version: 1\nlocks: []\n", "utf-8");
  // Clear monthly-close transaction state left by aborted/resumed closes.
  if (!existsSync(base)) return;
  for (const name of readdirSync(base)) {
    if (/^monthly-close\.\d{4}-\d{2}\.state\.yaml$/.test(name)) {
      unlinkSync(join(base, name));
    }
  }
}

const STATEMENT_ROLES: Record<string, readonly [string | null, string]> = {
  "1100": ["current", "cash"],
  "1200": ["noncurrent", "fixed_asset"],
  "1210": ["noncurrent", "fixed_asset"],
  "1290": ["noncurrent", "fixed_asset"],
  "1150": ["current", "receivable"],
  "1300": ["noncurrent", "receivable"],
  "2100": ["noncurrent", "loan"],
  "2120": ["current", "payable"],
  "2130": ["current", "payable"],
  "2140": ["current", "payable"],
  "2160": ["current", "payable"],
  "2110": ["current", "payable"],
  "2165": ["current", "payable"],
  "2170": ["current", "receivable"],
  "3100": [null, "equity"],
  "3200": [null, "equity"],
};

/**
 * Tests restore the fixture chart from git HEAD, which has no statement roles.
 * Tag the live file after that restore so close and statements can use bs_class / cf_role.
 */
export function applyFixtureStatementRoles(): void {
  useFinanceFixtureTenant();
  const path = join(getTenantDir(), "data/finance/chart-of-accounts.yaml");
  if (!existsSync(path)) return;
  const lines = readFileSync(path, "utf-8").split("\n");
  if (lines.some((line) => line.includes("bs_class:"))) return;
  const out: string[] = [];
  let code: string | null = null;
  for (const line of lines) {
    const match = line.match(/code: "(\d{4})"/);
    if (match) code = match[1] ?? null;
    out.push(line);
    if (!line.startsWith("    type:")) continue;
    const role = code ? STATEMENT_ROLES[code] : undefined;
    if (!role) continue;
    if (role[0]) out.push(`    bs_class: ${role[0]}`);
    out.push(`    cf_role: ${role[1]}`);
    code = null;
  }
  writeFileSync(path, out.join("\n"));
}
