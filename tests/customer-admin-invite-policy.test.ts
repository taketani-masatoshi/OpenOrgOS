import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import YAML from "yaml";
import {
  buildCustomerAdminInvitePolicy,
  inviteLedgerOperator,
} from "../src/lib/product/ledger-customer-admin.js";
import { clearOperatorsRegistryCacheForTests } from "../src/lib/org/operators.js";
import { clearTenantLifecycleCacheForTests } from "../src/lib/org/tenant-lifecycle.js";
import { provisionLedgerTenant } from "../src/lib/product/ledger-provision.js";
import { refreshOrgOsPaths } from "../src/lib/orgos-paths.js";
import { setTenantId } from "../src/lib/tenant.js";

describe("customer admin invite policy", () => {
  let workspace: string;
  const env = { ...process.env };

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), "invite-policy-"));
    process.env.ORGOS_WORKSPACE = workspace;
    refreshOrgOsPaths();
    clearOperatorsRegistryCacheForTests();
    clearTenantLifecycleCacheForTests();

    provisionLedgerTenant({
      tenantId: "mal-invite-ui",
      companyName: "MAL Invite UI KK",
      adminEmail: "ceo@malkk.com",
      plan: "business",
    });
    setTenantId("mal-invite-ui");

    const operatorsPath = join(workspace, "tenants", "mal-invite-ui", "data", "org", "operators.yaml");
    writeFileSync(
      operatorsPath,
      YAML.stringify({
        version: "1",
        login_policy: {
          email_domains: ["malkk.com"],
          grandfather_emails: ["founder@gmail.com"],
          founder_migration: { status: "open", grace_until: "2099-12-31" },
        },
        operators: [
          {
            operator_id: "OP-001",
            display_name: "CEO",
            role: "ceo",
            status: "active",
            email: "founder@gmail.com",
          },
        ],
      }),
      "utf-8",
    );
    clearOperatorsRegistryCacheForTests();
  });

  afterEach(() => {
    if (workspace) rmSync(workspace, { recursive: true, force: true });
    process.env = { ...env };
    refreshOrgOsPaths();
    clearOperatorsRegistryCacheForTests();
    clearTenantLifecycleCacheForTests();
  });

  it("reports standing invite blocked while grandfather is active", () => {
    const policy = buildCustomerAdminInvitePolicy();
    expect(policy.email_domains).toEqual(["malkk.com"]);
    expect(policy.grandfather_active).toBe(true);
    expect(policy.standing_invite_blocked).toBe(true);
    expect(policy.standing_invite_block_reason).toContain("retired");
    expect(policy.tenant_lifecycle).toBe("active");
    expect(policy.guest_invite_allowed).toBe(true);
  });

  it("rejects standing invite when grandfather remains", () => {
    expect(() =>
      inviteLedgerOperator({
        displayName: "三塚",
        email: "mitsuka@malkk.com",
        role: "operator",
      }),
    ).toThrow(/retired/);
  });
});
