import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import { runTenantInit } from "../tenant-init.js";
import { getInstallRoot, getTenantsDir } from "../orgos-paths.js";
import { setTenantId } from "../tenant.js";
import { upsertLedgerSubscription } from "./ledger-subscription.js";
import type { LedgerPlanId } from "../../../schemas/product/ledger-product.js";
import { getClock } from "../runtime-context.js";
import {
  loadOperatorRegistry,
  saveOperatorRegistry,
} from "../org/operators.js";
import { operatorRegistrySchema } from "../../../schemas/org/operator.js";
import { upsertControlPlaneTenant } from "./ledger-control-plane.js";

const FINANCE_SEED_FILES = [
  "chart-of-accounts.yaml",
  "expense-claim-accounting.yaml",
  "journal-entries.yaml",
  "period-locks.yaml",
  "tax-profile.yaml",
  "opening-balances.yaml",
  "cash-balance.yaml",
  "payroll.yaml",
] as const;

const CASH_ONLY_OPENING = `version: 1
fiscal_year: FY2026
period_start: "2026-09"
as_of: "2026-08-31"
currency: JPY

lines:
  - account_code: "1100"
    debit_yen: 1000000
    credit_yen: 0
  - account_code: "3200"
    debit_yen: 0
    credit_yen: 1000000

notes: OrgOS Ledger product seed — cash-only opening (no fixed-asset register).
`;

function seedFinanceFromFixture(tenantId: string): void {
  const seedRoot = join(getInstallRoot(), "tenants/_fixture-books/data/finance");
  const destRoot = join(getTenantsDir(), tenantId, "data/finance");
  mkdirSync(destRoot, { recursive: true });
  for (const file of FINANCE_SEED_FILES) {
    const src = join(seedRoot, file);
    const dest = join(destRoot, file);
    if (!existsSync(src)) continue;
    if (existsSync(dest) && file !== "opening-balances.yaml") continue;
    cpSync(src, dest);
  }
  writeFileSync(join(destRoot, "opening-balances.yaml"), CASH_ONLY_OPENING, "utf-8");
  const fixedAssetsDest = join(destRoot, "fixed-assets.yaml");
  if (existsSync(fixedAssetsDest)) {
    writeFileSync(
      fixedAssetsDest,
      `as_of: "2026-08-31"
fiscal_year: FY2026
currency: JPY
assets: []
summary:
  total_acquisition_cost: 0
  total_accumulated_depreciation: 0
  total_book_value: 0
  annual_depreciation_fy_current: 0
`,
      "utf-8",
    );
  }
  const monthlySeed = join(seedRoot, "monthly");
  const monthlyDest = join(destRoot, "monthly");
  if (existsSync(monthlySeed) && !existsSync(monthlyDest)) {
    cpSync(monthlySeed, monthlyDest, { recursive: true });
  }
}

function writeLedgerProductMeta(tenantId: string): void {
  const productDir = join(getTenantsDir(), tenantId, "data/product");
  mkdirSync(productDir, { recursive: true });
  const metaSrc = join(
    getInstallRoot(),
    "tenants/_template/data/product/ledger.yaml",
  );
  if (existsSync(metaSrc)) {
    cpSync(metaSrc, join(productDir, "ledger.yaml"));
  }
}

function ensureCeoOperator(input: {
  companyName: string;
  adminEmail: string;
}): void {
  const existing = loadOperatorRegistry();
  const registry = existing ?? operatorRegistrySchema.parse({ version: "1", operators: [] });
  if (registry.operators.some((op) => op.role === "ceo")) return;
  registry.operators.push({
    operator_id: "OP-CEO",
    display_name: input.companyName,
    approver_name: input.companyName,
    seat_kind: "standard",
    role: "ceo",
    status: "active",
    email: input.adminEmail,
  });
  saveOperatorRegistry(registry);
}

export function provisionLedgerTenant(input: {
  tenantId: string;
  companyName: string;
  adminEmail: string;
  plan: LedgerPlanId;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  accountantParentId?: string;
}): { tenant_id: string; path: string } {
  const tenantId = input.tenantId.trim().toLowerCase();
  const dest = join(getTenantsDir(), tenantId);
  if (!existsSync(dest)) {
    runTenantInit({
      id: tenantId,
      name: input.companyName,
      jurisdiction: "JP",
      entityForm: "kk",
    });
  }
  seedFinanceFromFixture(tenantId);
  writeLedgerProductMeta(tenantId);
  setTenantId(tenantId);
  ensureCeoOperator({
    companyName: input.companyName,
    adminEmail: input.adminEmail,
  });
  const trialEnds = new Date(getClock().now());
  trialEnds.setDate(trialEnds.getDate() + 14);
  upsertLedgerSubscription({
    plan: input.plan,
    status: "trialing",
    companyName: input.companyName,
    adminEmail: input.adminEmail,
    stripeCustomerId: input.stripeCustomerId,
    stripeSubscriptionId: input.stripeSubscriptionId,
    trialEndsAt: trialEnds.toISOString(),
  });
  const tenantYaml = join(dest, "tenant.yaml");
  if (existsSync(tenantYaml)) {
    let raw = readFileSync(tenantYaml, "utf-8");
    if (!raw.includes("product:")) {
      raw += "\nproduct: orgos-ledger\n";
      writeFileSync(tenantYaml, raw, "utf-8");
    }
  }
  upsertControlPlaneTenant({
    tenantId,
    companyName: input.companyName,
    plan: input.plan,
    status: "active",
    accountantParentId: input.accountantParentId,
  });
  return { tenant_id: tenantId, path: dest };
}
