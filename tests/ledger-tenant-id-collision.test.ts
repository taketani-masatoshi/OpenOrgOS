import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import type { IncomingMessage, ServerResponse } from "node:http";
import { join } from "node:path";
import { Readable } from "node:stream";
import { afterEach, describe, expect, it } from "vitest";
import { refreshOrgOsPaths } from "../src/lib/orgos-paths.js";
import {
  createLedgerSignup,
  listLedgerSignups,
  setLedgerSignupStatus,
} from "../src/lib/product/ledger-fleet.js";
import {
  findControlPlaneTenant,
  upsertControlPlaneTenant,
} from "../src/lib/product/ledger-control-plane.js";
import { provisionLedgerTenant } from "../src/lib/product/ledger-provision.js";
import { handleProductApi } from "../src/lib/steward-chat/routes/product-api.js";

describe("ledger tenant ID collisions", () => {
  const env = { ...process.env };
  let workspace = "";

  function useWorkspace(): string {
    workspace = mkdtempSync(join(tmpdir(), "ledger-id-collision-"));
    process.env.ORGOS_WORKSPACE = workspace;
    refreshOrgOsPaths();
    return workspace;
  }

  afterEach(() => {
    process.env = { ...env };
    refreshOrgOsPaths();
    if (workspace) rmSync(workspace, { recursive: true, force: true });
    workspace = "";
  });

  const applicant = {
    tenantId: "customer-one",
    companyName: "Customer One",
    adminEmail: "ceo@customer.example",
    plan: "starter" as const,
  };

  it("rejects a public signup for an existing tenant directory", () => {
    const root = useWorkspace();
    const tenantDir = join(root, "tenants", applicant.tenantId);
    mkdirSync(tenantDir, { recursive: true });
    const marker = join(tenantDir, "keep.txt");
    writeFileSync(marker, "existing tenant", "utf-8");

    expect(() => createLedgerSignup(applicant)).toThrow(/already exists/);
    expect(listLedgerSignups()).toEqual([]);
    expect(readFileSync(marker, "utf-8")).toBe("existing tenant");
  });

  it("rejects an existing tenant ID through the public signup route", async () => {
    const root = useWorkspace();
    mkdirSync(join(root, "tenants", applicant.tenantId), { recursive: true });
    const req = Readable.from([
      JSON.stringify({
        tenant_id: applicant.tenantId,
        company_name: applicant.companyName,
        admin_email: applicant.adminEmail,
        plan: applicant.plan,
      }),
    ]) as IncomingMessage;
    req.headers = {};
    let status = 0;
    const res = {
      writeHead(code: number) {
        status = code;
      },
      end() {
        /* response body is not needed for this assertion */
      },
    } as unknown as ServerResponse;

    const handled = await handleProductApi(req, res, "/chat/v1/product/signup", "POST");
    expect(handled).toBe(true);
    expect(status).toBe(422);
    expect(listLedgerSignups()).toEqual([]);
  });

  it("rejects a public signup for a control-plane reservation", () => {
    useWorkspace();
    upsertControlPlaneTenant({
      tenantId: applicant.tenantId,
      companyName: "Reserved Company",
      plan: "starter",
    });

    expect(() => createLedgerSignup(applicant)).toThrow(/reserved in the control plane/);
    expect(listLedgerSignups()).toEqual([]);
  });

  it("stops provisioning before changing an existing tenant", () => {
    const root = useWorkspace();
    const financeDir = join(root, "tenants", applicant.tenantId, "data", "finance");
    mkdirSync(financeDir, { recursive: true });
    const opening = join(financeDir, "opening-balances.yaml");
    writeFileSync(opening, "real opening balance", "utf-8");

    expect(() => provisionLedgerTenant(applicant)).toThrow(/already exists/);
    expect(readFileSync(opening, "utf-8")).toBe("real opening balance");
    expect(
      existsSync(join(root, "tenants", applicant.tenantId, "data", "product", "subscription.yaml"))
    ).toBe(false);
  });

  it("stops provisioning when the ID is reserved in the control plane", () => {
    const root = useWorkspace();
    upsertControlPlaneTenant({
      tenantId: applicant.tenantId,
      companyName: "Reserved Company",
      plan: "starter",
    });

    expect(() => provisionLedgerTenant(applicant)).toThrow(/reserved in the control plane/);
    expect(existsSync(join(root, "tenants", applicant.tenantId))).toBe(false);
    expect(findControlPlaneTenant(applicant.tenantId)?.company_name).toBe("Reserved Company");
  });

  it("fails closed while another allocation holds the lock", () => {
    const root = useWorkspace();
    const lockPath = join(root, "product-fleet", ".tenant-id-allocation.lock");
    mkdirSync(lockPath, { recursive: true });

    expect(() => createLedgerSignup(applicant)).toThrow(/allocation is already in progress/);
    expect(listLedgerSignups()).toEqual([]);
    rmSync(lockPath, { recursive: true });
    expect(createLedgerSignup(applicant).tenant_id).toBe(applicant.tenantId);
  });

  it("allows only the matching paid signup to use its reservation", () => {
    const root = useWorkspace();
    const signup = createLedgerSignup(applicant);
    expect(() => provisionLedgerTenant({ ...applicant, signupId: signup.signup_id })).toThrow(
      /reserved for another signup/
    );
    setLedgerSignupStatus(signup.signup_id, "paid");

    expect(() => provisionLedgerTenant(applicant)).toThrow(/reserved for another signup/);
    expect(() =>
      provisionLedgerTenant({
        ...applicant,
        signupId: signup.signup_id,
        adminEmail: "other@example.com",
      })
    ).toThrow(/reserved for another signup/);
    expect(existsSync(join(root, "tenants", applicant.tenantId))).toBe(false);

    const result = provisionLedgerTenant({ ...applicant, signupId: signup.signup_id });
    expect(result.tenant_id).toBe(applicant.tenantId);
    expect(provisionLedgerTenant({ ...applicant, signupId: signup.signup_id }).tenant_id).toBe(applicant.tenantId);
  });
});
