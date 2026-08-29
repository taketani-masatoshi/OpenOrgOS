import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import { getTenantsDir } from "../orgos-paths.js";
import { listLedgerProductTenantIds } from "./ledger-product-tenant.js";
import { runWithTenantId } from "../tenant.js";
import {
  loadLedgerSubscription,
  saveLedgerSubscription,
  upsertLedgerSubscription,
} from "./ledger-subscription.js";
import { findLedgerSignup, setLedgerSignupStatus } from "./ledger-fleet.js";
import { provisionLedgerTenant } from "./ledger-provision.js";
import { sendLedgerMail } from "./ledger-mail.js";
import { mintPasskeyBootstrapToken } from "../wire-console/auth/passkey-bootstrap.js";
import type { LedgerPlanId, LedgerSubscriptionStatus } from "../../../schemas/product/ledger-product.js";
import type { StripeWebhookEvent } from "./stripe-checkout.js";

export function findTenantIdByStripeCustomer(customerId: string): string | null {
  const needle = customerId.trim();
  if (!needle) return null;
  for (const tenantId of listLedgerProductTenantIds()) {
    const sub = runWithTenantId(tenantId, () => loadLedgerSubscription());
    if (sub?.stripe_customer_id === needle) return tenantId;
  }
  const tenantsDir = getTenantsDir();
  if (!existsSync(tenantsDir)) return null;
  for (const tenantId of listLedgerProductTenantIds()) {
    const path = join(tenantsDir, tenantId, "data/product/subscription.yaml");
    if (!existsSync(path)) continue;
    try {
      const raw = YAML.parse(readFileSync(path, "utf-8")) as {
        stripe_customer_id?: string;
      };
      if (raw.stripe_customer_id === needle) return tenantId;
    } catch {
      /* ignore */
    }
  }
  return null;
}

function mapStripeSubscriptionStatus(status?: string): LedgerSubscriptionStatus {
  switch (status) {
    case "active":
      return "active";
    case "past_due":
    case "unpaid":
      return "past_due";
    case "canceled":
    case "cancelled":
      return "cancelled";
    case "trialing":
      return "trialing";
    default:
      return "active";
  }
}

export function applySubscriptionStatusForTenant(
  tenantId: string,
  status: LedgerSubscriptionStatus,
): void {
  runWithTenantId(tenantId, () => {
    const existing = loadLedgerSubscription();
    if (!existing) return;
    saveLedgerSubscription({
      ...existing,
      status,
      updated_at: new Date().toISOString(),
    });
  });
}

export function handleStripeWebhookEvent(event: StripeWebhookEvent): {
  handled: boolean;
  tenant_id?: string;
  action?: string;
} {
  const object = event.data.object as Record<string, unknown>;

  if (event.type === "checkout.session.completed") {
    const signupId = object.client_reference_id as string | undefined;
    if (!signupId) return { handled: false };
    const signup = findLedgerSignup(signupId);
    if (!signup || signup.status === "provisioned") {
      return { handled: true, action: "signup_already_provisioned" };
    }
    setLedgerSignupStatus(signupId, "paid");
    if (process.env.ORGOS_LEDGER_AUTO_PROVISION === "1") {
      provisionLedgerTenant({
        tenantId: signup.tenant_id,
        companyName: signup.company_name,
        adminEmail: signup.admin_email,
        plan: signup.plan,
        stripeCustomerId: object.customer as string | undefined,
        stripeSubscriptionId: object.subscription as string | undefined,
      });
      setLedgerSignupStatus(signupId, "provisioned");
      const bootstrap = runWithTenantId(signup.tenant_id, () =>
        mintPasskeyBootstrapToken({ operatorId: "OP-CEO", ttl: "72h" }),
      );
      const publicBase =
        process.env.ORGOS_PUBLIC_BASE_URL?.trim() ||
        process.env.STEWARD_CHAT_PUBLIC_URL?.trim() ||
        "http://127.0.0.1:8787";
      const setupUrl = `${publicBase.replace(/\/$/, "")}/?onboarding=1&bootstrap=${encodeURIComponent(bootstrap.token)}`;
      void sendLedgerMail({
        kind: "provision_complete",
        to: signup.admin_email,
        tenantId: signup.tenant_id,
        companyName: signup.company_name,
        setupUrl,
      });
      return { handled: true, tenant_id: signup.tenant_id, action: "provisioned" };
    }
    return { handled: true, tenant_id: signup.tenant_id, action: "paid" };
  }

  if (event.type === "customer.subscription.updated") {
    const customerId = object.customer as string | undefined;
    const tenantId = customerId ? findTenantIdByStripeCustomer(customerId) : null;
    if (!tenantId) return { handled: false };
    const status = mapStripeSubscriptionStatus(object.status as string | undefined);
    runWithTenantId(tenantId, () => {
      const existing = loadLedgerSubscription();
      if (!existing) return;
      upsertLedgerSubscription({
        plan: existing.plan as LedgerPlanId,
        status,
        stripeCustomerId: customerId,
        stripeSubscriptionId: object.id as string | undefined,
        currentPeriodEnd:
          typeof object.current_period_end === "number"
            ? new Date(object.current_period_end * 1000).toISOString()
            : undefined,
      });
    });
    return { handled: true, tenant_id: tenantId, action: `subscription_${status}` };
  }

  if (event.type === "customer.subscription.deleted") {
    const customerId = object.customer as string | undefined;
    const tenantId = customerId ? findTenantIdByStripeCustomer(customerId) : null;
    if (!tenantId) return { handled: false };
    applySubscriptionStatusForTenant(tenantId, "cancelled");
    return { handled: true, tenant_id: tenantId, action: "subscription_cancelled" };
  }

  if (event.type === "invoice.payment_failed") {
    const customerId = object.customer as string | undefined;
    const tenantId = customerId ? findTenantIdByStripeCustomer(customerId) : null;
    if (!tenantId) return { handled: false };
    applySubscriptionStatusForTenant(tenantId, "past_due");
    const sub = runWithTenantId(tenantId, () => loadLedgerSubscription());
    if (sub?.admin_email) {
      void sendLedgerMail({
        kind: "payment_failed",
        to: sub.admin_email,
        tenantId,
        companyName: sub.company_name ?? tenantId,
      });
    }
    return { handled: true, tenant_id: tenantId, action: "past_due" };
  }

  if (event.type === "invoice.paid") {
    const customerId = object.customer as string | undefined;
    const tenantId = customerId ? findTenantIdByStripeCustomer(customerId) : null;
    if (!tenantId) return { handled: false };
    applySubscriptionStatusForTenant(tenantId, "active");
    return { handled: true, tenant_id: tenantId, action: "active" };
  }

  return { handled: false };
}
