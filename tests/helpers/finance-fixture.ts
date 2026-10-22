import { writeFileSync, readFileSync, existsSync } from "node:fs";
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

const SKIP_PURCHASE_EVIDENCE = new Set(["depreciation", "loan_payment", "capex", "payroll"]);

/**
 * Monthly P/L taxable expenses require purchase_use + invoice_status.
 * Fixture monthly YAML is restored from git without those fields — tag after restore.
 */
export function applyFixtureMonthlyPurchaseEvidence(): void {
  useFinanceFixtureTenant();
  const dir = join(getTenantDir(), "data/finance/monthly");
  if (!existsSync(dir)) return;
  for (const name of ["2026-08.yaml", "2026-09.yaml"]) {
    const path = join(dir, name);
    if (!existsSync(path)) continue;
    const original = readFileSync(path, "utf-8");
    if (original.includes("purchase_use:")) continue;
    const lines = original.split("\n");
    const out: string[] = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      out.push(line);
      const cat = line.match(/^(\s*)category:\s*(\S+)\s*$/);
      if (!cat) continue;
      const indent = cat[1]!;
      const category = cat[2]!;
      if (SKIP_PURCHASE_EVIDENCE.has(category)) continue;
      // Only expense sections: look backward for expenses: before revenue:
      let section: "expenses" | "revenue" | "other" = "other";
      for (let k = i; k >= 0; k--) {
        if (lines[k] === "expenses:") {
          section = "expenses";
          break;
        }
        if (lines[k] === "revenue:") {
          section = "revenue";
          break;
        }
      }
      if (section !== "expenses") continue;
      let hasPurchase = false;
      for (let j = i + 1; j < lines.length; j++) {
        const next = lines[j]!;
        if (next.match(/^\s*-\s/) || next.match(/^[a-z]/)) break;
        if (next.includes("purchase_use:")) hasPurchase = true;
      }
      if (!hasPurchase) {
        out.push(`${indent}purchase_use: taxable_only`);
        out.push(`${indent}invoice_status: qualified`);
      }
    }
    writeFileSync(path, out.join("\n"));
  }
}
