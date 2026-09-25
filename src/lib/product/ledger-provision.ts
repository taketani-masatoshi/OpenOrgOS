import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runTenantInit } from "../tenant-init.js";
import { writeYamlFileAtomic } from "../yaml-atomic.js";
import { getInstallRoot, getTenantsDir } from "../orgos-paths.js";
import { runWithTenantId, setTenantId } from "../tenant.js";
import { loadLedgerSubscription, upsertLedgerSubscription } from "./ledger-subscription.js";
import type { LedgerPlanId } from "../../../schemas/product/ledger-product.js";
import { getClock } from "../runtime-context.js";
import {
  loadOperatorRegistry,
  saveOperatorRegistry,
} from "../org/operators.js";
import { operatorRegistrySchema } from "../../../schemas/org/operator.js";
import { findControlPlaneTenant, upsertControlPlaneTenant } from "./ledger-control-plane.js";
import { isLedgerProductTenant } from "./ledger-product-tenant.js";
import {
  assertLedgerTenantIdUnoccupied,
  listLedgerSignups,
  withLedgerTenantAllocationLock,
} from "./ledger-fleet.js";

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
      as_of: "2026-08-31",
      fiscal_year: "FY2026",
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

export function provisionLedgerTenant(input: {
  tenantId: string;
  companyName: string;
  adminEmail: string;
  plan: LedgerPlanId;
  signupId?: string;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  accountantParentId?: string;
  entityForm?: string;
}): { tenant_id: string; path: string; ceo_operator_id: string } {
  const tenantId = input.tenantId.trim().toLowerCase();
  const dest = join(getTenantsDir(), tenantId);
  const existingCeoId = withLedgerTenantAllocationLock(() => {
    const reservation = listLedgerSignups().find((row) => row.tenant_id === tenantId);
    if (reservation) {
      if (
        reservation.signup_id !== input.signupId ||
        reservation.company_name !== input.companyName.trim() ||
        reservation.admin_email !== input.adminEmail.trim().toLowerCase() ||
        reservation.plan !== input.plan ||
        !["paid", "provisioned"].includes(reservation.status)
      ) {
        throw new Error(`Tenant "${tenantId}" is reserved for another signup`);
      }
    } else if (input.signupId) {
      throw new Error(`Signup reservation not found for tenant "${tenantId}"`);
    }

    if (existsSync(dest)) {
      const control = findControlPlaneTenant(tenantId);
      if (
        !isLedgerProductTenant(tenantId) || !control ||
        control.company_name !== input.companyName.trim() || control.plan !== input.plan
      ) {
        throw new Error(`Tenant "${tenantId}" already exists with different or incomplete product data`);
      }
      const ceoId = runWithTenantId(tenantId, () => {
        const sub = loadLedgerSubscription();
        if (
          sub?.company_name !== input.companyName.trim() || sub.plan !== input.plan ||
          sub.admin_email?.toLowerCase() !== input.adminEmail.trim().toLowerCase()
        ) return null;
        return loadOperatorRegistry()?.operators.find((op) =>
          op.role === "ceo" && op.status === "active" &&
          op.email?.toLowerCase() === input.adminEmail.trim().toLowerCase(),
        )?.operator_id ?? null;
      });
      if (!ceoId) throw new Error(`Tenant "${tenantId}" already exists with different or incomplete product data`);
      return ceoId;
    }
    if (reservation?.status === "provisioned") {
      throw new Error(`Provisioned tenant "${tenantId}" is missing its directory`);
    }
    assertLedgerTenantIdUnoccupied(tenantId);
    runTenantInit({
      id: tenantId,
      name: input.companyName,
      jurisdiction: "JP",
      entityForm: input.entityForm ?? "kk",
    });
    return null;
  });
  if (existingCeoId) {
    return { tenant_id: tenantId, path: dest, ceo_operator_id: existingCeoId };
  }
  ensureLedgerFinanceSkeleton(tenantId);
  writeLedgerProductMeta(tenantId);
  setTenantId(tenantId);
  const ceoOperatorId = ensureCeoOperator({
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
  return { tenant_id: tenantId, path: dest, ceo_operator_id: ceoOperatorId };
}
