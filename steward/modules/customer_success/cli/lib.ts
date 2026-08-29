/**
 * Customer Success module — domain helpers.
 */
import {
  loadCustomerAccounts,
  loadCustomerChurnEvents,
  loadCustomerHealthSignals,
  loadCustomerNps,
  loadCustomerOnboarding,
  loadCustomerQbr,
} from "../../../../src/lib/data.js";
import {
  buildCustomerSuccessView,
  type CustomerSuccessView,
} from "../../../../src/lib/customer-success-view.js";
import { isModuleEnabled } from "../../../../src/lib/module-business-data.js";

export const MODULE_ID = "customer_success";

export function buildModuleCustomerSuccessView(opts?: {
  includeDemo?: boolean;
  driftOnly?: boolean;
}): CustomerSuccessView {
  return buildCustomerSuccessView({
    includeDemo: opts?.includeDemo ?? false,
    driftOnly: opts?.driftOnly ?? false,
  });
}

export function validateCustomerSuccessModuleData(): string[] {
  const issues: string[] = [];
  if (!isModuleEnabled(MODULE_ID)) {
    issues.push("module not enabled in modules.yaml");
  }
  const accounts = loadCustomerAccounts();
  if (!accounts) {
    issues.push("accounts.yaml missing");
    return issues;
  }
  const accountIds = new Set(accounts.accounts.map((a) => a.id));

  const checkRefs = (
    label: string,
    items: Array<{ id: string; account_id: string }> | undefined,
  ) => {
    if (!items) return;
    for (const item of items) {
      if (!accountIds.has(item.account_id)) {
        issues.push(`${label} ${item.id}: unknown account_id ${item.account_id}`);
      }
    }
  };

  checkRefs("signal", loadCustomerHealthSignals()?.signals);
  checkRefs("onboarding", loadCustomerOnboarding()?.onboardings);
  checkRefs("qbr", loadCustomerQbr()?.qbrs);
  checkRefs("nps", loadCustomerNps()?.responses);
  checkRefs("churn", loadCustomerChurnEvents()?.events);

  return issues;
}
