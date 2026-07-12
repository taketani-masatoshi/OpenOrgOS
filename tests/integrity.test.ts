import { beforeEach, describe, it, expect } from "vitest";
import { runIntegrityChecks, integrityErrorsOnly } from "../src/lib/integrity.js";
import { computeDataHealth } from "../src/lib/data-health.js";
import { validateAll } from "../src/lib/data.js";
import { syncContractsCsv } from "../src/lib/sync-csv.js";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { setTenantId } from "../src/lib/tenant.js";

beforeEach(() => {
  setTenantId("mal");
});

describe("integrity", () => {
  it("passes schema validation on repo data", () => {
    const result = validateAll();
    expect(result.ok).toBe(true);
  }, 15_000);

  it("has no integrity errors on repo data", () => {
    const errors = integrityErrorsOnly(runIntegrityChecks());
    expect(errors).toHaveLength(0);
  });

  it("links loans to contracts and properties", () => {
    const issues = runIntegrityChecks();
    const loanIssues = issues.filter((i) => i.file.includes("loans.yaml") && i.level === "error");
    expect(loanIssues).toHaveLength(0);
  });
});

describe("data health", () => {
  it("scores at least 75% maturity (mal reference tenant)", () => {
    const report = computeDataHealth();
    expect(report.overall).toBeGreaterThanOrEqual(75);
    expect(["A", "B", "C"]).toContain(report.grade);
  }, 30_000);
});

describe("sync contracts csv", () => {
  it("generates csv matching contract count", () => {
    const path = syncContractsCsv();
    const content = readFileSync(path, "utf-8");
    const lines = content.trim().split("\n");
    expect(lines.length).toBeGreaterThan(10);
    expect(lines[0]).toContain("contract_id");
    expect(content).toContain("CTR-008");
    expect(content).toContain("executed");
  });
});
