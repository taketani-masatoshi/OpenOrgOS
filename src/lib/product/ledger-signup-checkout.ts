import { createLedgerCheckoutSession } from "./stripe-checkout.js";
import {
  createLedgerSignup,
  findLedgerSignup,
  listLedgerSignups,
  updateLedgerSignup,
} from "./ledger-fleet.js";
import { listLedgerPlans, resolveLedgerPlan } from "./ledger-plans.js";
import type { LedgerPlanId, LedgerSignup } from "../../../schemas/product/ledger-product.js";
import { sendLedgerMail } from "./ledger-mail.js";

export type StartLedgerSignupCheckoutInput = {
  companyName: string;
  adminEmail: string;
  plan: LedgerPlanId | string;
  tenantId?: string;
  successUrl: string;
  cancelUrl: string;
  sendSignupMail?: boolean;
};

export type StartLedgerSignupCheckoutResult = {
  signup: LedgerSignup;
  checkout_url: string;
  checkout_mode: string;
  resumed: boolean;
};

function slugFromCompanyName(companyName: string): string {
  return (
    companyName
      .toLowerCase()
      .replace(/株式会社|合同会社/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 24) || `ledger-${Date.now()}`
  );
}

function findResumableSignup(input: {
  tenantId: string;
  adminEmail: string;
  plan: LedgerPlanId;
}): LedgerSignup | undefined {
  const email = input.adminEmail.trim().toLowerCase();
  return listLedgerSignups().find(
    (row) =>
      row.tenant_id === input.tenantId &&
      row.admin_email === email &&
      row.plan === input.plan &&
      (row.status === "pending" || row.status === "checkout"),
  );
}

/**
 * Shared Web + CLI signup → Stripe Checkout. Failed checkout leaves the row
 * as pending so the same tenant_id can retry.
 */
export async function startLedgerSignupCheckout(
  input: StartLedgerSignupCheckoutInput,
): Promise<StartLedgerSignupCheckoutResult> {
  const plan = resolveLedgerPlan(
    typeof input.plan === "string" ? input.plan : input.plan,
  );
  const companyName = input.companyName.trim();
  const adminEmail = input.adminEmail.trim().toLowerCase();
  const tenantId = (input.tenantId?.trim().toLowerCase() || slugFromCompanyName(companyName)).slice(
    0,
    48,
  );

  let signup = findResumableSignup({
    tenantId,
    adminEmail,
    plan: plan.id,
  });
  let resumed = false;
  if (signup) {
    resumed = true;
  } else {
    signup = createLedgerSignup({
      tenantId,
      companyName,
      adminEmail,
      plan: plan.id,
    });
  }

  try {
    const successUrl = `${input.successUrl}${input.successUrl.includes("?") ? "&" : "?"}signup_id=${encodeURIComponent(signup.signup_id)}`;
    const checkout = await createLedgerCheckoutSession({
      signupId: signup.signup_id,
      email: adminEmail,
      plan,
      successUrl,
      cancelUrl: input.cancelUrl,
    });
    signup = updateLedgerSignup(signup.signup_id, {
      status: "checkout",
      stripe_checkout_session_id: checkout.session_id,
    });
    if (input.sendSignupMail !== false && !resumed) {
      void sendLedgerMail({
        kind: "signup_received",
        to: adminEmail,
        tenantId,
        companyName,
      });
    }
    return {
      signup,
      checkout_url: checkout.url,
      checkout_mode: checkout.mode,
      resumed,
    };
  } catch (error) {
    // Keep row pending so the same tenant_id can retry.
    updateLedgerSignup(signup.signup_id, { status: "pending" });
    throw error;
  }
}

export function listKnownLedgerPlanIds(): string[] {
  return listLedgerPlans().map((p) => p.id);
}
