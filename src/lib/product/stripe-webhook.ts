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
import { findLedgerSignup, setLedgerSignupStatus, updateLedgerSignup } from "./ledger-fleet.js";
import { provisionLedgerTenant } from "./ledger-provision.js";
import { listLedgerMailOutbox, sendLedgerMail } from "./ledger-mail.js";
import { mintPasskeyBootstrapToken } from "../wire-console/auth/passkey-bootstrap.js";
import { findControlPlaneTenant } from "./ledger-control-plane.js";
import { isLedgerProductTenant } from "./ledger-product-tenant.js";
import { loadOperatorRegistry } from "../org/operators.js";
import { getClock } from "../runtime-context.js";
import { isProductionEnv } from "./stripe-ops.js";
import type { LedgerSignup } from "../../../schemas/product/ledger-product.js";
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

function existingProvisionedCeo(signup: LedgerSignup): string | null {
  if (!isLedgerProductTenant(signup.tenant_id)) return null;
  const control = findControlPlaneTenant(signup.tenant_id);
  if (!control || control.status !== "active" ||
      control.company_name !== signup.company_name || control.plan !== signup.plan) return null;
  return runWithTenantId(signup.tenant_id, () => {
    const subscription = loadLedgerSubscription();
    if (subscription?.admin_email?.toLowerCase() !== signup.admin_email ||
        subscription.company_name !== signup.company_name || subscription.plan !== signup.plan) return null;
    return loadOperatorRegistry()?.operators.find((operator) =>
      operator.role === "ceo" && operator.status === "active" &&
      operator.email?.toLowerCase() === signup.admin_email,
    )?.operator_id ?? null;
  });
}

function successfulProvisionMailExists(signup: LedgerSignup): boolean {
  return listLedgerMailOutbox().some((mail) =>
    mail.kind === "provision_complete" && mail.tenant_id === signup.tenant_id &&
    mail.to.toLowerCase() === signup.admin_email && mail.status === "sent" &&
    (!isProductionEnv() || mail.transport === "smtp"),
  );
}

export async function handleStripeWebhookEvent(
  event: StripeWebhookEvent,
  mailSender: typeof sendLedgerMail = sendLedgerMail,
): Promise<{
  handled: boolean;
  tenant_id?: string;
  action?: string;
}> {
  const object = event.data.object as Record<string, unknown>;

  if (event.type === "checkout.session.completed") {
    const signupId = object.client_reference_id as string | undefined;
    if (!signupId) return { handled: false };
    const signup = findLedgerSignup(signupId);
    if (!signup) {
      return { handled: true, action: "signup_already_provisioned" };
    }
    if (signup.stripe_checkout_session_id && typeof object.id === "string" &&
        object.id !== signup.stripe_checkout_session_id) {
      throw new Error(`Checkout session does not match signup ${signupId}`);
    }
    if (signup.status === "provisioned" && signup.welcome_sent_at) {
      return { handled: true, tenant_id: signup.tenant_id, action: "signup_already_provisioned" };
    }
    if (signup.status === "cancelled") throw new Error("Cancelled signup cannot be provisioned");
    if (signup.status === "pending" || signup.status === "checkout") {
      setLedgerSignupStatus(signupId, "paid");
    }
    if (process.env.ORGOS_LEDGER_AUTO_PROVISION === "1") {
      let ceoOperatorId = existingProvisionedCeo(signup);
      if (!ceoOperatorId && isLedgerProductTenant(signup.tenant_id)) {
        throw new Error(`Tenant "${signup.tenant_id}" exists but does not match its paid signup`);
      }
      if (!ceoOperatorId) {
        const provisioned = provisionLedgerTenant({
        tenantId: signup.tenant_id,
        companyName: signup.company_name,
        adminEmail: signup.admin_email,
        plan: signup.plan,
        signupId: signup.signup_id,
        stripeCustomerId: object.customer as string | undefined,
        stripeSubscriptionId: object.subscription as string | undefined,
        });
        ceoOperatorId = provisioned.ceo_operator_id;
      }
      if (successfulProvisionMailExists(signup)) {
        updateLedgerSignup(signupId, { status: "provisioned", welcome_sent_at: getClock().nowIso() });
        return { handled: true, tenant_id: signup.tenant_id, action: "provisioned" };
      }
      const bootstrap = runWithTenantId(signup.tenant_id, () =>
        mintPasskeyBootstrapToken({ operatorId: ceoOperatorId, ttl: "72h" }),
      );
      const publicBase =
        process.env.ORGOS_PUBLIC_BASE_URL?.trim() ||
        process.env.STEWARD_CHAT_PUBLIC_URL?.trim() ||
        "http://127.0.0.1:8787";
      const setupUrl = new URL(publicBase);
      const tenantHost = findControlPlaneTenant(signup.tenant_id)?.host;
      if (tenantHost) setupUrl.hostname = tenantHost;
      setupUrl.pathname = "/founder-setup/";
      setupUrl.search = "";
      setupUrl.hash = `bootstrap=${encodeURIComponent(bootstrap.token)}`;
      const delivery = await mailSender({
        kind: "provision_complete",
        to: signup.admin_email,
        tenantId: signup.tenant_id,
        companyName: signup.company_name,
        setupUrl: setupUrl.toString(),
      });
      if (isProductionEnv() && delivery.transport !== "smtp") {
        throw new Error("SMTP delivery is required before marking welcome mail sent in production");
      }
      updateLedgerSignup(signupId, { status: "provisioned", welcome_sent_at: getClock().nowIso() });
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
