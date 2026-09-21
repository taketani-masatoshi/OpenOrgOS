import { afterEach, describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import YAML from "yaml";
import { refreshOrgOsPaths } from "../src/lib/orgos-paths.js";
import { runTenantInit } from "../src/lib/tenant-init.js";
import { provisionLedgerTenant } from "../src/lib/product/ledger-provision.js";
import { createLedgerSignup, listLedgerSignups } from "../src/lib/product/ledger-fleet.js";
import { startLedgerSignupCheckout } from "../src/lib/product/ledger-signup-checkout.js";
import { getTenantId, setTenantId } from "../src/lib/tenant.js";
import { isCompanySetupComplete } from "../src/lib/product/ledger-onboarding.js";
import { buildProvisionSetupUrl } from "../src/lib/product/ledger-public-url.js";
import { upsertControlPlaneTenant } from "../src/lib/product/ledger-control-plane.js";

describe("ledger tenant guards", () => {
  const env = { ...process.env };
  let workspace = "";

  afterEach(() => {
    if (workspace) rmSync(workspace, { recursive: true, force: true });
    workspace = "";
    process.env = { ...env };
    refreshOrgOsPaths();
  });

  function freshWorkspace(): void {
    workspace = mkdtempSync(join(tmpdir(), "ledger-tenant-guards-"));
    process.env.ORGOS_WORKSPACE = workspace;
    delete process.env.ORGOS_TENANT;
    refreshOrgOsPaths();
  }

  it("YAML-escapes company names with quotes and colons", () => {
    freshWorkspace();
    const name = 'Acme: "Best" Corp\nLtd';
    runTenantInit({ id: "yaml-escape-001", name, fromModules: [], productSkeleton: true });
    const tenant = YAML.parse(
      readFileSync(join(workspace, "tenants/yaml-escape-001/tenant.yaml"), "utf-8"),
    ) as { name: string };
    expect(tenant.name).toBe(name);
    const company = YAML.parse(
      readFileSync(join(workspace, "tenants/yaml-escape-001/data/company.yaml"), "utf-8"),
    ) as { name: string; fiscal_year_end_month?: number };
    expect(company.name).toBe(name);
    expect(company.fiscal_year_end_month).toBeUndefined();
  });

  it("does not stick process tenant after init when ORGOS_TENANT was unset", () => {
    freshWorkspace();
    runTenantInit({ id: "als-clean-001", name: "ALS Clean" });
    expect(process.env.ORGOS_TENANT).toBeUndefined();
    expect(() => getTenantId()).toThrow(/No tenant configured|Unknown tenant/);
  });

  it("resumes incomplete provision for the same signup", () => {
    freshWorkspace();
    const signup = createLedgerSignup({
      tenantId: "resume-001",
      companyName: "Resume KK",
      adminEmail: "ceo@resume.example",
      plan: "starter",
    });
    // Simulate crash after mkdir only
    mkdirSync(join(workspace, "tenants/resume-001"), { recursive: true });
    const first = provisionLedgerTenant({
      tenantId: "resume-001",
      companyName: "Resume KK",
      adminEmail: "ceo@resume.example",
      plan: "starter",
      signupId: signup.signup_id,
    });
    expect(first.ceo_operator_id).toMatch(/^OP-/);
    expect(existsSync(join(workspace, "tenants/resume-001/tenant.yaml"))).toBe(true);
    expect(listLedgerSignups().find((s) => s.signup_id === signup.signup_id)?.status).toBe(
      "provisioned",
    );

    const second = provisionLedgerTenant({
      tenantId: "resume-001",
      companyName: "Resume KK",
      adminEmail: "ceo@resume.example",
      plan: "starter",
      signupId: signup.signup_id,
    });
    expect(second.ceo_operator_id).toBe(first.ceo_operator_id);
  });

  it("rejects resume for a different signup on incomplete tenant", () => {
    freshWorkspace();
    createLedgerSignup({
      tenantId: "resume-002",
      companyName: "A",
      adminEmail: "a@example.com",
      plan: "starter",
    });
    mkdirSync(join(workspace, "tenants/resume-002"), { recursive: true });
    expect(() =>
      provisionLedgerTenant({
        tenantId: "resume-002",
        companyName: "B",
        adminEmail: "b@example.com",
        plan: "starter",
        signupId: "SIGNUP-other",
      }),
    ).toThrow(/reserved|Incomplete|Signup/);
  });

  it("CLI/Web shared checkout resumes pending signup after Stripe failure", async () => {
    freshWorkspace();
    process.env.ORGOS_ENV = "development";
    delete process.env.STRIPE_SECRET_KEY;
    const first = await startLedgerSignupCheckout({
      companyName: "Retry Co",
      adminEmail: "ceo@retry.example",
      plan: "starter",
      tenantId: "retry-co",
      successUrl: "http://localhost/ok",
      cancelUrl: "http://localhost/cancel",
      sendSignupMail: false,
    });
    expect(first.signup.status).toBe("checkout");
    expect(first.signup.stripe_checkout_session_id).toBeTruthy();

    // Force pending (as after API failure path)
    const { updateLedgerSignup } = await import("../src/lib/product/ledger-fleet.js");
    updateLedgerSignup(first.signup.signup_id, { status: "pending" });

    const second = await startLedgerSignupCheckout({
      companyName: "Retry Co",
      adminEmail: "ceo@retry.example",
      plan: "starter",
      tenantId: "retry-co",
      successUrl: "http://localhost/ok",
      cancelUrl: "http://localhost/cancel",
      sendSignupMail: false,
    });
    expect(second.resumed).toBe(true);
    expect(second.signup.signup_id).toBe(first.signup.signup_id);
    expect(second.signup.status).toBe("checkout");
  });

  it("company setup is incomplete until representative and FY month are set", () => {
    freshWorkspace();
    provisionLedgerTenant({
      tenantId: "onboard-001",
      companyName: "Onboard KK",
      adminEmail: "ceo@onboard.example",
      plan: "starter",
    });
    setTenantId("onboard-001");
    expect(isCompanySetupComplete()).toBe(false);
    expect(existsSync(join(workspace, "tenants/onboard-001/data/properties"))).toBe(false);
  });

  it("production setup URL refuses localhost fallback", () => {
    freshWorkspace();
    process.env.ORGOS_ENV = "production";
    delete process.env.ORGOS_PUBLIC_BASE_URL;
    delete process.env.STEWARD_CHAT_PUBLIC_URL;
    expect(() =>
      buildProvisionSetupUrl({ tenantId: "x", bootstrapToken: "pkb_test" }),
    ).toThrow(/ORGOS_PUBLIC_BASE_URL/);
  });

  it("setup URL uses https public base and tenant host", () => {
    freshWorkspace();
    process.env.ORGOS_ENV = "production";
    process.env.ORGOS_PUBLIC_BASE_URL = "https://ledger.example.com";
    process.env.ORGOS_LEDGER_HOST_SUFFIX = ".ledger.example.com";
    mkdirSync(join(workspace, "tenants/acme"), { recursive: true });
    writeFileSync(join(workspace, "tenants/acme/tenant.yaml"), "id: acme\nname: Acme\n", "utf-8");
    upsertControlPlaneTenant({ tenantId: "acme", companyName: "Acme" });
    const url = buildProvisionSetupUrl({ tenantId: "acme", bootstrapToken: "pkb_x" });
    expect(url.startsWith("https://")).toBe(true);
    expect(url).toContain("acme.ledger.example.com");
    expect(url).toContain("bootstrap=pkb_x");
  });
});
