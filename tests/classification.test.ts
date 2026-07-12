import { beforeEach, describe, it, expect } from "vitest";
import {
  loadClassificationRegistry,
  checkAgentAccess,
  levelAtMost,
  validateBankAccountLinksSync,
  aiBoundaryPatterns,
  boundaryNeedle,
  findResourceByPath,
  unsafeTrackedResource,
  assertSafeTrackedPath,
  validateCursorindexingignoreCoverage,
} from "../src/lib/classification.js";
import { setTenantId } from "../src/lib/tenant.js";

describe("classification", () => {
  beforeEach(() => {
    setTenantId("mal");
  });

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

  it("treats directory resources as boundaries for descendants", () => {
    const reg = loadClassificationRegistry();
    expect(findResourceByPath(reg, "steward/platform/protocol/registry.yaml")?.id).toBe(
      "RES-PLATFORM-STEWARD"
    );
  });

  it("cash-balance links to existing bank accounts when file present", () => {
    const issues = validateBankAccountLinksSync();
    const missing = issues.filter((i) => i.message.includes("未定義"));
    expect(missing).toHaveLength(0);
  });

  it("derives boundary needle from glob patterns", () => {
    expect(boundaryNeedle("**/records/**")).toBe("records");
    expect(boundaryNeedle("data/operations/kamezawa-secrets.yaml")).toBe(
      "data/operations/kamezawa-secrets.yaml"
    );
  });

  it("ai boundary patterns include the records PII vault", () => {
    const patterns = aiBoundaryPatterns(loadClassificationRegistry());
    expect(patterns.some((p) => p.path.includes("records"))).toBe(true);
  });

  it("cursorindexingignore covers the records vault (no warnings)", () => {
    const issues = validateCursorindexingignoreCoverage();
    expect(issues.filter((i) => i.message.includes("records"))).toHaveLength(0);
  });

  it("executive_steward cannot read stakeholders yaml (Secretary SoT)", () => {
    const reg = loadClassificationRegistry();
    const resource = reg.resources.find((r) => r.id === "RES-STAKEHOLDERS")!;
    expect(resource.read_agents).not.toContain("executive_steward");
    const result = checkAgentAccess(
      reg,
      "executive_steward",
      "data/executive/stakeholders.yaml",
      "read"
    );
    expect(result.allowed).toBe(false);
  });

  it("write-time gate flags git:ignore (L2) resource paths", () => {
    const reg = loadClassificationRegistry();
    expect(unsafeTrackedResource(reg, "data/operations/kamezawa-secrets.yaml")).toBeTruthy();
    expect(unsafeTrackedResource(reg, "data/company.yaml")).toBeUndefined();
    expect(() => assertSafeTrackedPath("data/operations/kamezawa-secrets.yaml")).toThrow();
  });
});
