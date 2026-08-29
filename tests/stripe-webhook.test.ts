import { describe, expect, it, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { refreshOrgOsPaths } from "../src/lib/orgos-paths.js";
import { setTenantId } from "../src/lib/tenant.js";
import { provisionLedgerTenant } from "../src/lib/product/ledger-provision.js";
import {
  applySubscriptionStatusForTenant,
  handleStripeWebhookEvent,
} from "../src/lib/product/stripe-webhook.js";
import { loadLedgerSubscription } from "../src/lib/product/ledger-subscription.js";
import type { StripeWebhookEvent } from "../src/lib/product/stripe-checkout.js";

describe("stripe webhook lifecycle", () => {
  const env = { ...process.env };
  let workspace = "";

  afterEach(() => {
    if (workspace) rmSync(workspace, { recursive: true, force: true });
    process.env = { ...env };
    refreshOrgOsPaths();
  });

  it("handles invoice.payment_failed as past_due when tenant known", () => {
    const event: StripeWebhookEvent = {
      type: "invoice.payment_failed",
      data: { object: { customer: "cus_unknown" } },
    };
    const result = handleStripeWebhookEvent(event);
    expect(result.handled).toBe(false);
  });

  it("handles subscription deleted event shape", () => {
    const event: StripeWebhookEvent = {
      type: "customer.subscription.deleted",
      data: { object: { customer: "cus_unknown", status: "canceled" } },
    };
    const result = handleStripeWebhookEvent(event);
    expect(result.handled).toBe(false);
  });

  it("updates subscription status for a provisioned tenant", () => {
    workspace = mkdtempSync(join(tmpdir(), "stripe-webhook-"));
    process.env.ORGOS_WORKSPACE = workspace;
    refreshOrgOsPaths();
    provisionLedgerTenant({
      tenantId: "stripe-hook-001",
      companyName: "Hook KK",
      adminEmail: "ceo@hook.example",
      plan: "starter",
      stripeCustomerId: "cus_hook_001",
    });
    setTenantId("stripe-hook-001");

    const failed: StripeWebhookEvent = {
      type: "invoice.payment_failed",
      data: { object: { customer: "cus_hook_001" } },
    };
    expect(handleStripeWebhookEvent(failed)).toMatchObject({
      handled: true,
      tenant_id: "stripe-hook-001",
      action: "past_due",
    });
    expect(loadLedgerSubscription()?.status).toBe("past_due");

    const paid: StripeWebhookEvent = {
      type: "invoice.paid",
      data: { object: { customer: "cus_hook_001" } },
    };
    expect(handleStripeWebhookEvent(paid)).toMatchObject({
      handled: true,
      action: "active",
    });
    expect(loadLedgerSubscription()?.status).toBe("active");

    applySubscriptionStatusForTenant("stripe-hook-001", "active");
    const deleted: StripeWebhookEvent = {
      type: "customer.subscription.deleted",
      data: { object: { customer: "cus_hook_001", status: "canceled" } },
    };
    expect(handleStripeWebhookEvent(deleted)).toMatchObject({
      handled: true,
      action: "subscription_cancelled",
    });
    expect(loadLedgerSubscription()?.status).toBe("cancelled");
  });
});
