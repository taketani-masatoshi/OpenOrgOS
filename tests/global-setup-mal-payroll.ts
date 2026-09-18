import { existsSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
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
account_code: "5300"
`;

export default function setup(): (() => void) | void {
  assertDisposableTestWorkspace(ROOT_DIR);
  if (existsSync(PAYROLL)) return;
  writeFileSync(PAYROLL, SYNTHETIC);
  return () => {
    rmSync(PAYROLL, { force: true });
  };
}
