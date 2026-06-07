import { describe, it, expect } from "vitest";
import {
  loadClassificationRegistry,
  checkAgentAccess,
  levelAtMost,
  validateBankAccountLinksSync,
} from "../src/lib/classification.js";

describe("classification", () => {
  it("loads classification-registry.yaml", () => {
    const reg = loadClassificationRegistry();
    expect(reg.version).toBe("1");
    expect(reg.resources.some((r) => r.id === "RES-BANK-ACCOUNTS")).toBe(true);
  });

  it("finance can read bank-accounts", () => {
    const reg = loadClassificationRegistry();
    const result = checkAgentAccess(
      reg,
      "finance",
      "data/finance/bank-accounts.yaml",
      "read"
    );
    expect(result.allowed).toBe(true);
  });

  it("executive_steward can read bank-accounts (L2 read)", () => {
    const reg = loadClassificationRegistry();
    const result = checkAgentAccess(
      reg,
      "executive_steward",
      "data/finance/bank-accounts.yaml",
      "read"
    );
    expect(result.allowed).toBe(true);
  });

  it("finance cannot export bank-accounts", () => {
    const reg = loadClassificationRegistry();
    const result = checkAgentAccess(
      reg,
      "finance",
      "data/finance/bank-accounts.yaml",
      "export"
    );
    expect(result.allowed).toBe(false);
  });

  it("level ordering", () => {
    expect(levelAtMost("L1", "L2")).toBe(true);
    expect(levelAtMost("L2", "L1")).toBe(false);
  });

  it("cash-balance links to existing bank accounts when file present", () => {
    const issues = validateBankAccountLinksSync();
    const missing = issues.filter((i) => i.message.includes("未定義"));
    expect(missing).toHaveLength(0);
  });
});
