import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { refreshOrgOsPaths } from "../src/lib/orgos-paths.js";
import {
  resetStripeSecretsHydrationForTest,
  saveStripeSecrets,
} from "../src/lib/product/stripe-secrets-store.js";
import { buildProductInitialSetupReport } from "../src/lib/product/ledger-product-initial-setup.js";

describe("product initial setup", () => {
  const env = { ...process.env };
  let workspace = "";

  afterEach(() => {
    if (workspace) rmSync(workspace, { recursive: true, force: true });
    process.env = { ...env };
    resetStripeSecretsHydrationForTest();
    refreshOrgOsPaths();
  });

  it("marks stripe pre-production step complete when test keys saved", () => {
    workspace = mkdtempSync(join(tmpdir(), "product-init-"));
    process.env.ORGOS_WORKSPACE = workspace;
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_WEBHOOK_SECRET;
    refreshOrgOsPaths();

    saveStripeSecrets({
      STRIPE_SECRET_KEY: "sk_test_initial",
      STRIPE_WEBHOOK_SECRET: "whsec_initial",
    });

    const report = buildProductInitialSetupReport();
    const stripe = report.steps.find((row) => row.id === "stripe-keys");
    expect(stripe?.complete).toBe(true);
    expect(report.stripe_mode).toBe("test");
    expect(report.stripe_configured).toBe(true);
  });
});
