import { describe, expect, it, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { refreshOrgOsPaths } from "../src/lib/orgos-paths.js";
import {
  isStripeWebhookEventProcessed,
  markStripeWebhookEventProcessed,
  resetStripeWebhookIdempotencyForTests,
} from "../src/lib/product/ledger-stripe-webhook-idempotency.js";
import { createLedgerCheckoutSession } from "../src/lib/product/stripe-checkout.js";

describe("stripe commercial guards", () => {
  const env = { ...process.env };
  let workspace = "";

  afterEach(() => {
    if (workspace) rmSync(workspace, { recursive: true, force: true });
    process.env = { ...env };
    refreshOrgOsPaths();
    resetStripeWebhookIdempotencyForTests();
  });

  it("rejects checkout stub in production without secret", async () => {
    process.env.ORGOS_ENV = "production";
    delete process.env.STRIPE_SECRET_KEY;
    await expect(
      createLedgerCheckoutSession({
        signupId: "SIGNUP-1",
        email: "ceo@example.com",
        plan: {
          id: "starter",
          name: "Starter",
          monthly_jpy: 9800,
          trial_days: 14,
          stripe_price_env: "STRIPE_PRICE_STARTER",
          journal_limit_per_month: 500,
        },
        successUrl: "https://example.com/success",
        cancelUrl: "https://example.com/cancel",
      }),
    ).rejects.toThrow(/STRIPE_SECRET_KEY required in production/);
  });

  it("deduplicates stripe webhook event ids", () => {
    workspace = mkdtempSync(join(tmpdir(), "stripe-idem-"));
    process.env.ORGOS_WORKSPACE = workspace;
    refreshOrgOsPaths();
    expect(isStripeWebhookEventProcessed("evt_123")).toBe(false);
    markStripeWebhookEventProcessed("evt_123");
    expect(isStripeWebhookEventProcessed("evt_123")).toBe(true);
  });
});
