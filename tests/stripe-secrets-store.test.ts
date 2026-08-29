import { afterEach, describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { refreshOrgOsPaths } from "../src/lib/orgos-paths.js";
import {
  buildStripeSettingsSnapshot,
  hydrateStripeEnvFromStore,
  loadStripeSecretsFromFile,
  maskStripeSecret,
  resetStripeSecretsHydrationForTest,
  saveStripeSecrets,
  stripeSecretsFilePath,
} from "../src/lib/product/stripe-secrets-store.js";
import { isStripeBillingCommercialReady } from "../src/lib/product/stripe-ops.js";

describe("stripe secrets store", () => {
  const env = { ...process.env };
  let workspace = "";

  afterEach(() => {
    if (workspace) rmSync(workspace, { recursive: true, force: true });
    process.env = { ...env };
    resetStripeSecretsHydrationForTest();
    refreshOrgOsPaths();
  });

  it("masks secrets for display", () => {
    expect(maskStripeSecret("sk_live_abcdefghijklmnop")).toBe("sk_live_…mnop");
  });

  it("persists secrets to gitignored file and hydrates env", () => {
    workspace = mkdtempSync(join(tmpdir(), "stripe-secrets-"));
    process.env.ORGOS_WORKSPACE = workspace;
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_WEBHOOK_SECRET;
    refreshOrgOsPaths();

    saveStripeSecrets({
      STRIPE_SECRET_KEY: "sk_test_example_key",
      STRIPE_WEBHOOK_SECRET: "whsec_example_secret",
    });

    expect(existsSync(stripeSecretsFilePath())).toBe(true);
    const onDisk = readFileSync(stripeSecretsFilePath(), "utf-8");
    expect(onDisk).toContain("sk_test_example_key");
    expect(onDisk).toContain("whsec_example_secret");

    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_WEBHOOK_SECRET;
    resetStripeSecretsHydrationForTest();
    hydrateStripeEnvFromStore();

    expect(process.env.STRIPE_SECRET_KEY).toBe("sk_test_example_key");
    expect(process.env.STRIPE_WEBHOOK_SECRET).toBe("whsec_example_secret");
    expect(isStripeBillingCommercialReady()).toBe(true);

    const snapshot = buildStripeSettingsSnapshot();
    expect(snapshot.mode).toBe("test");
    expect(snapshot.secret_key_hint).toContain("sk_test_");
    expect(snapshot.secret_key_hint).not.toContain("example_key");
  });

  it("prefers deploy env over file when both exist", () => {
    workspace = mkdtempSync(join(tmpdir(), "stripe-secrets-env-"));
    process.env.ORGOS_WORKSPACE = workspace;
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_WEBHOOK_SECRET;
    refreshOrgOsPaths();

    saveStripeSecrets({
      STRIPE_SECRET_KEY: "sk_test_from_file",
      STRIPE_WEBHOOK_SECRET: "whsec_from_file",
    });

    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_WEBHOOK_SECRET;
    process.env.STRIPE_SECRET_KEY = "sk_live_from_env";
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_from_env";
    resetStripeSecretsHydrationForTest();
    hydrateStripeEnvFromStore();
    expect(process.env.STRIPE_SECRET_KEY).toBe("sk_live_from_env");
    expect(loadStripeSecretsFromFile().STRIPE_SECRET_KEY).toBe("sk_test_from_file");
  });
});
