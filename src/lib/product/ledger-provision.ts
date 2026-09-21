import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runTenantInit } from "../tenant-init.js";
import { writeYamlFileAtomic } from "../yaml-atomic.js";
import { getInstallRoot, getTenantsDir } from "../orgos-paths.js";
import { runWithTenantId } from "../tenant.js";
import { upsertLedgerSubscription } from "./ledger-subscription.js";
import type { LedgerPlanId } from "../../../schemas/product/ledger-product.js";
import { getClock } from "../runtime-context.js";
import {
  loadOperatorRegistry,
  saveOperatorRegistry,
} from "../org/operators.js";
import { operatorRegistrySchema } from "../../../schemas/org/operator.js";
import { upsertControlPlaneTenant } from "./ledger-control-plane.js";
import {
  findLedgerSignup,
  listLedgerSignups,
  setLedgerSignupStatus,
} from "./ledger-fleet.js";
import { isLedgerProductTenant } from "./ledger-product-tenant.js";

/** Product-only finance files not covered by tenant-init skeleton. */
const FINANCE_ENSURE_FILES = ["period-locks.yaml"] as const;

const EMPTY_PERIOD_LOCKS = `version: 1
locks: []
`;

const NEUTRAL_EXPENSE_CLAIM = `payable_account_code: "2140"
bank_control_accounts: {}
`;

function ensureLedgerFinanceSkeleton(tenantId: string): void {
  const seedRoot = join(getInstallRoot(), "tenants/_fixture-books/data/finance");
  const destRoot = join(getTenantsDir(), tenantId, "data/finance");
  mkdirSync(destRoot, { recursive: true });

  for (const file of FINANCE_ENSURE_FILES) {
    const dest = join(destRoot, file);
    if (existsSync(dest)) continue;
    const src = join(seedRoot, file);
    if (existsSync(src)) {
      writeFileSync(dest, readFileSync(src, "utf-8"), "utf-8");
    } else if (file === "period-locks.yaml") {
      writeFileSync(dest, EMPTY_PERIOD_LOCKS, "utf-8");
    }
  }

  const journalDest = join(destRoot, "journal-entries.yaml");
  if (!existsSync(journalDest)) {
    writeFileSync(journalDest, "version: 1\nentries: []\n", "utf-8");
  }

  const expenseClaimDest = join(destRoot, "expense-claim-accounting.yaml");
  if (!existsSync(expenseClaimDest)) {
    writeFileSync(expenseClaimDest, NEUTRAL_EXPENSE_CLAIM, "utf-8");
  }

  const fixedAssetsDest = join(destRoot, "fixed-assets.yaml");
  if (!existsSync(fixedAssetsDest)) {
    writeYamlFileAtomic(fixedAssetsDest, {
      as_of: null,
      fiscal_year: "TBD",
      status: "template",
      currency: "JPY",
      assets: [],
      summary: {
        total_acquisition_cost: 0,
        total_accumulated_depreciation: 0,
        total_book_value: 0,
        annual_depreciation_fy_current: 0,
      },
    });
  }

  mkdirSync(join(destRoot, "monthly"), { recursive: true });
}

function writeLedgerProductMeta(tenantId: string): void {
  const productDir = join(getTenantsDir(), tenantId, "data/product");
  mkdirSync(productDir, { recursive: true });
  const metaSrc = join(
    getInstallRoot(),
    "tenants/_template/data/product/ledger.yaml",
  );
  const metaDest = join(productDir, "ledger.yaml");
  if (existsSync(metaSrc) && !existsSync(metaDest)) {
    writeFileSync(metaDest, readFileSync(metaSrc, "utf-8"), "utf-8");
  }
}

function nextOperatorId(existingIds: string[]): string {
  const nums = existingIds
    .map((id) => /^OP-(\d+)$/.exec(id)?.[1])
    .filter(Boolean)
    .map((n) => Number.parseInt(n!, 10));
  const next = nums.length ? Math.max(...nums) + 1 : 1;
  return `OP-${String(next).padStart(3, "0")}`;
}

/**
 * Ensure an active CEO bound to the signup admin email.
 * Returns the CEO operator_id for PassKey bootstrap.
 * Throws if a different active CEO already exists (do not mint setup links for strangers).
 */
export function ensureCeoOperator(input: {
  adminEmail: string;
}): string {
  const adminEmail = input.adminEmail.trim().toLowerCase();
  if (!adminEmail) throw new Error("adminEmail required for CEO provisioning");

  const existing = loadOperatorRegistry();
  const registry = existing ?? operatorRegistrySchema.parse({ version: "1", operators: [] });

  const matchingCeo = registry.operators.find(
    (op) =>
      op.role === "ceo" &&
      op.status === "active" &&
      op.email?.trim().toLowerCase() === adminEmail,
  );
  if (matchingCeo) return matchingCeo.operator_id;

  const otherCeo = registry.operators.find(
    (op) => op.role === "ceo" && op.status === "active",
  );
  if (otherCeo) {
    throw new Error(
      `Active CEO ${otherCeo.operator_id} exists with a different email — refuse to provision signup admin as CEO`,
    );
  }

  const operatorId = nextOperatorId(registry.operators.map((op) => op.operator_id));
  registry.operators.push({
    operator_id: operatorId,
    display_name: "代表者",
    approver_name: "代表者",
    seat_kind: "standard",
    role: "ceo",
    status: "active",
    email: adminEmail,
  });
  saveOperatorRegistry(registry);
  return operatorId;
}

export function isLedgerProvisionComplete(tenantId: string): boolean {
  const dest = join(getTenantsDir(), tenantId);
  if (!existsSync(join(dest, "tenant.yaml"))) return false;
  if (!isLedgerProductTenant(tenantId)) return false;
  const subPath = join(dest, "data/product/subscription.yaml");
  if (!existsSync(subPath)) return false;
  return runWithTenantId(tenantId, () => {
    const registry = loadOperatorRegistry();
    return Boolean(registry?.operators.some((op) => op.role === "ceo" && op.status === "active"));
  });
}

function assertProvisionAllowed(input: {
  tenantId: string;
  companyName: string;
  adminEmail: string;
  plan: LedgerPlanId;
  signupId?: string;
}): void {
  const dest = join(getTenantsDir(), input.tenantId);
  const reservation = listLedgerSignups().find((row) => row.tenant_id === input.tenantId);

  if (existsSync(dest) && isLedgerProvisionComplete(input.tenantId)) {
    if (
      input.signupId &&
      reservation &&
      reservation.signup_id !== input.signupId
    ) {
      throw new Error(`Tenant "${input.tenantId}" already exists and is fully provisioned`);
    }
    // Idempotent continue (CEO / finance ensure are skip-if-exists).
    return;
  }

  if (existsSync(dest) && !isLedgerProvisionComplete(input.tenantId)) {
    if (!input.signupId || !reservation) {
      throw new Error(
        `Incomplete tenant "${input.tenantId}" exists — pass matching signupId to resume`,
      );
    }
    if (
      reservation.signup_id !== input.signupId ||
      reservation.company_name !== input.companyName.trim() ||
      reservation.admin_email !== input.adminEmail.trim().toLowerCase() ||
      reservation.plan !== input.plan
    ) {
      throw new Error(`Tenant "${input.tenantId}" is reserved for another signup`);
    }
    return;
  }

  if (reservation && input.signupId && reservation.signup_id !== input.signupId) {
    throw new Error(`Tenant "${input.tenantId}" is reserved for another signup`);
  }
}

function markProductOnTenantYaml(tenantId: string): void {
  const tenantYaml = join(getTenantsDir(), tenantId, "tenant.yaml");
  if (!existsSync(tenantYaml)) return;
  let raw = readFileSync(tenantYaml, "utf-8");
  if (!raw.includes("product:")) {
    raw += "\nproduct: orgos-ledger\n";
    writeFileSync(tenantYaml, raw, "utf-8");
  }
}

function initTenantWorkspace(input: {
  tenantId: string;
  companyName: string;
}): void {
  const dest = join(getTenantsDir(), input.tenantId);
  if (existsSync(join(dest, "tenant.yaml"))) {
    return;
  }
  // Partial crash (dir without tenant.yaml) — rebuild.
  if (existsSync(dest)) {
    rmSync(dest, { recursive: true, force: true });
  }
  runTenantInit({
    id: input.tenantId,
    name: input.companyName,
    jurisdiction: "JP",
    entityForm: "kk",
    fromModules: [],
    productSkeleton: true,
  });
}

export function provisionLedgerTenant(input: {
  tenantId: string;
  companyName: string;
  adminEmail: string;
  plan: LedgerPlanId;
  signupId?: string;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  accountantParentId?: string;
}): { tenant_id: string; path: string; ceo_operator_id: string } {
  const tenantId = input.tenantId.trim().toLowerCase();
  const dest = join(getTenantsDir(), tenantId);
  assertProvisionAllowed({
    tenantId,
    companyName: input.companyName,
    adminEmail: input.adminEmail,
    plan: input.plan,
    signupId: input.signupId,
  });

  if (input.signupId) {
    const signup = findLedgerSignup(input.signupId);
    if (signup && signup.status !== "provisioned") {
      setLedgerSignupStatus(input.signupId, "provisioning");
    }
  }

  if (!isLedgerProvisionComplete(tenantId)) {
    initTenantWorkspace({ tenantId, companyName: input.companyName });
  }

  ensureLedgerFinanceSkeleton(tenantId);
  writeLedgerProductMeta(tenantId);

  const ceoOperatorId = runWithTenantId(tenantId, () => {
    const ceo = ensureCeoOperator({ adminEmail: input.adminEmail });
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
    return ceo;
  });

  markProductOnTenantYaml(tenantId);
  upsertControlPlaneTenant({
    tenantId,
    companyName: input.companyName,
    plan: input.plan,
    status: "active",
    accountantParentId: input.accountantParentId,
  });

  if (!isLedgerProvisionComplete(tenantId)) {
    throw new Error(`Provision incomplete for tenant "${tenantId}"`);
  }

  if (input.signupId) {
    setLedgerSignupStatus(input.signupId, "provisioned");
  }

  return { tenant_id: tenantId, path: dest, ceo_operator_id: ceoOperatorId };
}
