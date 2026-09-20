import { describe, expect, it } from "vitest";
import { findTenantTipViolations } from "../src/lib/git-policy/tenant-tip-paths.js";

describe("findTenantTipViolations (synthetic paths)", () => {
  it("allows template, fixture, and documented demo tenants", () => {
    const hits = findTenantTipViolations([
      "tenants/_template/data/finance/payroll.yaml",
      "tenants/_fixture-books/data/finance/bank-accounts.yaml",
      "tenants/mal/data/finance/payroll.yaml",
      "tenants/demo/data/finance/bank-statements.yaml",
      "tenants/acme/data/org/company.yaml",
      "tenants/southwood/data/finance/payroll.yaml",
    ]);
    expect(hits).toEqual([]);
  });

  it("rejects key material, chat runtime, and non-demo finance ledgers", () => {
    const hits = findTenantTipViolations([
      "tenants/acme-prod-copy/data/org-signing/private.pem",
      "tenants/acme-prod-copy/data/chat/threads/t1.json",
      "tenants/acme-prod-copy/data/finance/payroll.yaml",
      "tenants/acme-prod-copy/data/finance/bank-accounts.yaml",
      "secrets/local.key",
    ]);
    expect(hits.map((h) => h.kind).sort()).toEqual([
      "chat_runtime",
      "finance_ledger",
      "finance_ledger",
      "key_material",
      "key_material",
    ]);
  });

  it("does not treat signing-key-meta as key material", () => {
    const hits = findTenantTipViolations(["tenants/demo/data/org-signing/signing-key-meta.yaml"]);
    expect(hits).toEqual([]);
  });
});
