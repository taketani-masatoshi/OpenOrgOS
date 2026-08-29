import { describe, expect, it, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { refreshOrgOsPaths } from "../src/lib/orgos-paths.js";
import {
  attestStripeBilling,
  buildStripeBillingStatus,
  isStripeBillingOpsPathReady,
  isStripeWebhookStubAllowed,
  stripeNextStepsDetail,
} from "../src/lib/product/stripe-ops.js";

describe("stripe ops", () => {
  const env = { ...process.env };
  let workspace = "";

  afterEach(() => {
    if (workspace) rmSync(workspace, { recursive: true, force: true });
    process.env = { ...env };
    refreshOrgOsPaths();
  });

  it("reports ops path ready without secrets", () => {
    workspace = mkdtempSync(join(tmpdir(), "stripe-ops-empty-"));
    process.env.ORGOS_WORKSPACE = workspace;
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_WEBHOOK_SECRET;
    refreshOrgOsPaths();
    expect(isStripeBillingOpsPathReady()).toBe(true);
    const status = buildStripeBillingStatus();
    expect(status.ops_path_ready).toBe(true);
    expect(status.mode).toBe("stub");
    expect(status.live_ready).toBe(false);
    expect(status.next_steps.length).toBeGreaterThan(0);
    expect(status.next_steps[0]).toContain("STRIPE_SECRET_KEY");
    expect(status.next_steps.join(" · ")).toBe(stripeNextStepsDetail());
  });

  it("disallows webhook stub mode in production even without secret", () => {
    process.env.ORGOS_ENV = "production";
    delete process.env.STRIPE_WEBHOOK_SECRET;
    expect(isStripeWebhookStubAllowed()).toBe(false);
  });

  it("attests when env keys are present without writing secrets", () => {
    workspace = mkdtempSync(join(tmpdir(), "stripe-ops-"));
    process.env.ORGOS_WORKSPACE = workspace;
    process.env.STRIPE_SECRET_KEY = "sk_test_example";
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_example";
    refreshOrgOsPaths();
    const record = attestStripeBilling({ note: "test" });
    expect(record.status).toBe("configured");
    expect(record.mode).toBe("test");
    const status = buildStripeBillingStatus();
    expect(status.live_ready).toBe(true);
    expect(JSON.stringify(status)).not.toContain("sk_test_example");
    expect(JSON.stringify(status)).not.toContain("whsec_example");
  });
});
