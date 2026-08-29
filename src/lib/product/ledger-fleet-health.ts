import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { runValidateReport } from "../../commands/validate.js";
import { listLedgerSignups } from "./ledger-fleet.js";
import {
  listActiveLedgerProductTenantIds,
  listLedgerProductTenantIds,
} from "./ledger-product-tenant.js";
import { loadLedgerSubscription } from "./ledger-subscription.js";
import { getTenantsDir } from "../orgos-paths.js";
import { runWithTenantId } from "../tenant.js";

export type FleetTenantHealth = {
  tenant_id: string;
  validate_ok: boolean;
  error_count: number;
  warning_count: number;
  subscription_status: string | null;
  plan: string | null;
  trial_expired: boolean;
  has_ceo: boolean;
};

export type FleetHealthReport = {
  checked_at: string;
  tenant_count: number;
  healthy_count: number;
  /** Active product tenants only (drill sandboxes excluded). */
  scope: "active" | "all";
  tenants: FleetTenantHealth[];
  signups_pending: number;
  signups_past_due: number;
};

function tenantHasCeo(tenantId: string): boolean {
  const path = join(getTenantsDir(), tenantId, "data/org/operators.yaml");
  if (!existsSync(path)) return false;
  return /role:\s*ceo/m.test(readFileSync(path, "utf-8"));
}

function isTrialExpired(trialEndsAt: string | undefined): boolean {
  if (!trialEndsAt) return false;
  return Date.parse(trialEndsAt) < Date.now();
}

export function buildFleetHealthReport(
  tenantIds?: string[],
  opts?: { includeDrill?: boolean },
): FleetHealthReport {
  const scope: "active" | "all" = opts?.includeDrill ? "all" : "active";
  const ids =
    tenantIds ??
    (opts?.includeDrill
      ? listLedgerProductTenantIds()
      : listActiveLedgerProductTenantIds());
  const tenants: FleetTenantHealth[] = [];

  for (const tenantId of ids) {
    const row = runWithTenantId(tenantId, () => {
      const report = runValidateReport({ warnings: true });
      const sub = loadLedgerSubscription();
      return {
        tenant_id: tenantId,
        validate_ok: report.ok,
        error_count: report.error_count,
        warning_count: report.warning_count,
        subscription_status: sub?.status ?? null,
        plan: sub?.plan ?? null,
        trial_expired:
          sub?.status === "trialing" && isTrialExpired(sub.trial_ends_at),
        has_ceo: tenantHasCeo(tenantId),
      };
    });
    tenants.push(row);
  }

  const signups = listLedgerSignups();
  return {
    checked_at: new Date().toISOString(),
    tenant_count: tenants.length,
    healthy_count: tenants.filter(
      (row) =>
        row.validate_ok &&
        row.has_ceo &&
        !row.trial_expired &&
        row.subscription_status !== "past_due",
    ).length,
    scope,
    tenants,
    signups_pending: signups.filter((row) =>
      ["pending", "checkout", "paid"].includes(row.status),
    ).length,
    signups_past_due: signups.filter((row) => row.status === "cancelled").length,
  };
}
