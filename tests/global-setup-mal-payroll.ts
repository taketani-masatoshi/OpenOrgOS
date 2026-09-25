import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import { ROOT_DIR } from "../src/lib/tenant.js";
import { assertDisposableTestWorkspace } from "./helpers/test-workspace-guard.js";

/**
 * mal is the default test tenant, and ~19 suites reach computeDashboard /
 * loadAllData through it. Its payroll.yaml carries real names and salaries, so
 * docs/org-os/tenant-github-tip-policy.md keeps it local-only and
 * scripts/check-tenant-tip.sh fails the build if it is ever tracked — which
 * left every one of those suites failing on a clean checkout.
 *
 * Write synthetic figures for the run instead. An operator who has the real
 * file keeps it: we only create what is missing, and only remove what we made.
 *
 * tenants/mal/data/finance is not in setup-restore-protocol's FIXTURE_PATHS, so
 * this survives the per-test fixture restore.
 */
const PAYROLL = join(ROOT_DIR, "tenants/mal/data/finance/payroll.yaml");

const SYNTHETIC = `# Synthetic payroll written by tests/global-setup-mal-payroll.ts.
# The real figures are local-only — see docs/org-os/tenant-github-tip-policy.md.
officer_compensation_annual: 0
employee_payroll:
  monthly_gross_jpy: 280000
  has_withholding: true
  has_social_insurance: true
  health_standard_remuneration_yen: 280000
  pension_standard_remuneration_yen: 280000
account_code: "5300"
`;

const RATES_EXAMPLE = join(
  ROOT_DIR,
  "steward/jurisdiction-packs/JP/modules/jp_payroll/seed/payroll-rates-2026.yaml.example"
);
const RATES = join(ROOT_DIR, "tenants/mal/data/finance/payroll-rates-2026.yaml");

export default function setup(): (() => void) | void {
  assertDisposableTestWorkspace(ROOT_DIR);
  const cleanups: Array<() => void> = [];
  if (!existsSync(PAYROLL)) {
    writeFileSync(PAYROLL, SYNTHETIC);
    cleanups.push(() => {
      rmSync(PAYROLL, { force: true });
    });
  }
  if (!existsSync(RATES) && existsSync(RATES_EXAMPLE)) {
    const rates = YAML.parse(readFileSync(RATES_EXAMPLE, "utf-8")) as Record<string, unknown>;
    rates.fiscal_year = "FY2026";
    rates.effective_from = "2026-04";
    rates.effective_to = "2027-03";
    rates.insurer_id = "SYNTHETIC-MAL-TEST-INSURER";
    writeFileSync(RATES, YAML.stringify(rates));
    cleanups.push(() => {
      rmSync(RATES, { force: true });
    });
  }
  if (cleanups.length === 0) return;
  return () => {
    for (const cleanup of cleanups) cleanup();
  };
}
