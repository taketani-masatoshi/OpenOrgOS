import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { refreshOrgOsPaths } from "../src/lib/orgos-paths.js";
import { createLedgerSignup, listLedgerSignups } from "../src/lib/product/ledger-fleet.js";
import { listLedgerPlans, resolveLedgerPlan } from "../src/lib/product/ledger-plans.js";
import { provisionLedgerTenant } from "../src/lib/product/ledger-provision.js";
import { loadLedgerSubscription } from "../src/lib/product/ledger-subscription.js";
import { setTenantId } from "../src/lib/tenant.js";
import { createLedgerCheckoutSession, createBillingPortalSession } from "../src/lib/product/stripe-checkout.js";
import { buildLedgerUsageSnapshot, assertLedgerJournalPostAllowed } from "../src/lib/product/ledger-usage.js";
import { buildProductReadinessReport } from "../src/lib/product/ledger-product-readiness.js";
import { exportLedgerTenantArchive } from "../src/lib/product/ledger-tenant-export.js";
import { isLedgerProductTenant } from "../src/lib/product/ledger-product-tenant.js";
import {
  linkAccountantClient,
  resolveTenantFromHost,
  upsertControlPlaneTenant,
} from "../src/lib/product/ledger-control-plane.js";
import { inviteLedgerOperator } from "../src/lib/product/ledger-customer-admin.js";
import { existsSync } from "node:fs";

describe("ledger product plans", () => {
  it("lists three JP corporate plans", () => {
    const plans = listLedgerPlans();
    expect(plans.map((row) => row.id)).toEqual(["starter", "business", "accountant"]);
    expect(resolveLedgerPlan("starter").trial_days).toBe(14);
  });
});

describe("ledger signup and provision", () => {
  const env = { ...process.env };
  let workspace = "";

  afterEach(() => {
    if (workspace) rmSync(workspace, { recursive: true, force: true });
    process.env = { ...env };
    refreshOrgOsPaths();
  });

  it("creates signup queue entries in product-fleet", () => {
    workspace = mkdtempSync(join(tmpdir(), "ledger-product-"));
    process.env.ORGOS_WORKSPACE = workspace;
    refreshOrgOsPaths();
    const signup = createLedgerSignup({
      tenantId: "acme-demo",
      companyName: "株式会社アクメ",
      adminEmail: "ceo@acme.example",
      plan: "starter",
    });
    expect(signup.status).toBe("pending");
    expect(listLedgerSignups()).toHaveLength(1);
  });

  it("provisions tenant with subscription and finance seeds", () => {
    workspace = mkdtempSync(join(tmpdir(), "ledger-product-"));
    process.env.ORGOS_WORKSPACE = workspace;
    refreshOrgOsPaths();
    const result = provisionLedgerTenant({
      tenantId: "ledger-pilot-001",
      companyName: "Pilot KK",
      adminEmail: "ceo@pilot.example",
      plan: "business",
    });
    expect(result.tenant_id).toBe("ledger-pilot-001");
    setTenantId("ledger-pilot-001");
    const sub = loadLedgerSubscription();
    expect(sub?.plan).toBe("business");
    expect(sub?.status).toBe("trialing");
  });

  it("returns stub checkout without STRIPE_SECRET_KEY", async () => {
    delete process.env.STRIPE_SECRET_KEY;
    const checkout = await createLedgerCheckoutSession({
      signupId: "SIGNUP-test",
      email: "ceo@example.com",
      plan: resolveLedgerPlan("starter"),
      successUrl: "http://localhost/signup?success=1",
      cancelUrl: "http://localhost/signup?cancelled=1",
    });
    expect(checkout.mode).toBe("stub");
    expect(checkout.url).toContain("success=1");
  });

  it("returns stub billing portal without STRIPE_SECRET_KEY", async () => {
    delete process.env.STRIPE_SECRET_KEY;
    const portal = await createBillingPortalSession({
      customerId: "cus_test",
      returnUrl: "http://localhost/?account=1",
    });
    expect(portal.mode).toBe("stub");
    expect(portal.url).toContain("billing=stub");
  });

  it("marks provisioned tenant as ledger product", () => {
    workspace = mkdtempSync(join(tmpdir(), "ledger-product-"));
    process.env.ORGOS_WORKSPACE = workspace;
    refreshOrgOsPaths();
    provisionLedgerTenant({
      tenantId: "ledger-mark-001",
      companyName: "Mark KK",
      adminEmail: "ceo@mark.example",
      plan: "starter",
    });
    expect(isLedgerProductTenant("ledger-mark-001")).toBe(true);
  });

  it("exports tenant archive tarball", () => {
    workspace = mkdtempSync(join(tmpdir(), "ledger-product-"));
    process.env.ORGOS_WORKSPACE = workspace;
    refreshOrgOsPaths();
    provisionLedgerTenant({
      tenantId: "ledger-export-001",
      companyName: "Export KK",
      adminEmail: "ceo@export.example",
      plan: "business",
    });
    const out = join(workspace, "export.tar.gz");
    const result = exportLedgerTenantArchive({
      tenantId: "ledger-export-001",
      outputPath: out,
    });
    expect(existsSync(result.path)).toBe(true);
    expect(result.manifest.tenant_id).toBe("ledger-export-001");
  });

  it("invites guest readonly with expiry", () => {
    workspace = mkdtempSync(join(tmpdir(), "ledger-product-"));
    process.env.ORGOS_WORKSPACE = workspace;
    process.env.ORGOS_TENANT = "ledger-guest-001";
    refreshOrgOsPaths();
    provisionLedgerTenant({
      tenantId: "ledger-guest-001",
      companyName: "Guest KK",
      adminEmail: "ceo@guest.example",
      plan: "accountant",
    });
    setTenantId("ledger-guest-001");
    const invited = inviteLedgerOperator({
      displayName: "税理士太郎",
      email: "tax@advisor.example",
      role: "readonly",
      guestExpiresAt: "2099-12-31",
    });
    expect(invited.operator_id).toMatch(/^OP-/);
  });

  it("tracks starter journal usage", () => {
    workspace = mkdtempSync(join(tmpdir(), "ledger-product-"));
    process.env.ORGOS_WORKSPACE = workspace;
    refreshOrgOsPaths();
    provisionLedgerTenant({
      tenantId: "ledger-usage-001",
      companyName: "Usage KK",
      adminEmail: "ceo@usage.example",
      plan: "starter",
    });
    setTenantId("ledger-usage-001");
    const usage = buildLedgerUsageSnapshot();
    expect(usage.journal_limit_per_month).toBe(500);
    expect(() => assertLedgerJournalPostAllowed()).not.toThrow();
  });

  it("resolves tenant from control plane host", () => {
    workspace = mkdtempSync(join(tmpdir(), "ledger-product-"));
    process.env.ORGOS_WORKSPACE = workspace;
    process.env.ORGOS_LEDGER_HOST_SUFFIX = ".ledger.localhost";
    refreshOrgOsPaths();
    upsertControlPlaneTenant({
      tenantId: "host-demo",
      companyName: "Host Demo",
      plan: "starter",
    });
    expect(resolveTenantFromHost("host-demo.ledger.localhost")).toBe("host-demo");
  });

  it("links accountant client tenants", () => {
    workspace = mkdtempSync(join(tmpdir(), "ledger-product-"));
    process.env.ORGOS_WORKSPACE = workspace;
    refreshOrgOsPaths();
    upsertControlPlaneTenant({
      tenantId: "client-a",
      companyName: "Client A",
      plan: "starter",
    });
    upsertControlPlaneTenant({
      tenantId: "tax-hub",
      companyName: "Tax Hub",
      plan: "accountant",
    });
    linkAccountantClient({
      clientTenantId: "client-a",
      accountantTenantId: "tax-hub",
    });
    const linked = linkAccountantClient({
      clientTenantId: "client-a",
      accountantTenantId: "tax-hub",
    });
    expect(linked.accountant_parent_id).toBe("tax-hub");
  });
});
