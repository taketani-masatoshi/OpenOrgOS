import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import { setTenantId, getTenantDir, ROOT_DIR } from "../../src/lib/tenant.js";

/** Isolated tenant for finance / GL / ledger vitest — safe for journal writes. */
export const FINANCE_FIXTURE_TENANT = "_fixture-books";

export function useFinanceFixtureTenant(): void {
  setTenantId(FINANCE_FIXTURE_TENANT);
}

/**
 * Remediations refuse payroll without tenant rates + confirmed standard remuneration.
 * setup-restore can wipe uncommitted fixture files; re-seed from the JP pack example.
 */
export function ensureTenantPayrollRates(tenantId: string): void {
  setTenantId(tenantId);
  const financeDir = join(getTenantDir(), "data/finance");
  mkdirSync(financeDir, { recursive: true });
  const ratesPath = join(financeDir, "payroll-rates-2026.yaml");
  const example = join(
    ROOT_DIR,
    "steward/jurisdiction-packs/JP/modules/jp_payroll/seed/payroll-rates-2026.yaml.example",
  );
  const insurerId = `SYNTHETIC-${tenantId.toUpperCase().replace(/[^A-Z0-9]/g, "-")}-INSURER`;
  if (!existsSync(ratesPath) && existsSync(example)) {
    const rates = YAML.parse(readFileSync(example, "utf-8")) as Record<string, unknown>;
    rates.fiscal_year = "FY2026";
    rates.effective_from = "2026-02";
    rates.effective_to = "2027-03";
    rates.insurer_id = insurerId;
    writeFileSync(ratesPath, YAML.stringify(rates), "utf-8");
  } else if (existsSync(ratesPath)) {
    const rates = YAML.parse(readFileSync(ratesPath, "utf-8")) as Record<string, unknown>;
    let changed = false;
    if (!rates.fiscal_year) {
      rates.fiscal_year = "FY2026";
      changed = true;
    }
    const effectiveFrom = "2026-02";
    if (rates.effective_from !== effectiveFrom) {
      rates.effective_from = effectiveFrom;
      changed = true;
    }
    if (!rates.effective_to) {
      rates.effective_to = "2027-03";
      changed = true;
    }
    if (!rates.insurer_id) {
      rates.insurer_id = insurerId;
      changed = true;
    }
    if (changed) writeFileSync(ratesPath, YAML.stringify(rates), "utf-8");
  }
  const payrollPath = join(financeDir, "payroll.yaml");
  if (!existsSync(payrollPath)) return;
  const payroll = YAML.parse(readFileSync(payrollPath, "utf-8")) as {
    employee_payroll?: Record<string, unknown>;
  } | null;
  const employee = payroll?.employee_payroll;
  if (!employee) return;
  let changed = false;
  if (employee.health_standard_remuneration_yen == null) {
    employee.health_standard_remuneration_yen = 280000;
    changed = true;
  }
  if (employee.pension_standard_remuneration_yen == null) {
    employee.pension_standard_remuneration_yen = 280000;
    changed = true;
  }
  if (changed) writeFileSync(payrollPath, YAML.stringify(payroll), "utf-8");
}

export function ensureFixturePayrollRates(): void {
  ensureTenantPayrollRates(FINANCE_FIXTURE_TENANT);
}

export function ensureDemoPayrollRates(): void {
  ensureTenantPayrollRates("demo");
}

/** Reset fixture journal ledger between tests (append-only file accumulates otherwise). */
export function resetFixtureJournalEntries(): void {
  useFinanceFixtureTenant();
  const base = join(getTenantDir(), "data/finance");
  writeFileSync(join(base, "journal-entries.yaml"), "version: 1\nentries: []\n", "utf-8");
  writeFileSync(join(base, "period-locks.yaml"), "version: 1\nlocks: []\n", "utf-8");
  ensureFixturePayrollRates();
}
/**
 * Bypass post-time guards to inject an intentionally invalid journal (e.g. unknown
 * account codes) so close/adjustment tests can assert fail-closed behaviour.
 */
export function injectRawJournalEntry(entry: Record<string, unknown>): void {
  useFinanceFixtureTenant();
  const path = join(getTenantDir(), "data/finance/journal-entries.yaml");
  const raw = existsSync(path) ? readFileSync(path, "utf-8") : "version: 1\nentries: []\n";
  const doc = (YAML.parse(raw) as { version?: number; entries?: unknown[] } | null) ?? {};
  const entries = Array.isArray(doc.entries) ? doc.entries : [];
  entries.push(entry);
  writeFileSync(
    path,
    YAML.stringify({ version: doc.version ?? 1, entries }, { lineWidth: 0 }),
    "utf-8",
  );
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
  ensureFixturePayrollRates();
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
