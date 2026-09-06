import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const writers = vi.hoisted(() => ({
  writeTaxDigest: vi.fn(() => ({ path: "tax", period: "weekly" })),
  writeContractsDigest: vi.fn(() => ({ path: "contracts", period: "weekly" })),
  writeSalesDigest: vi.fn(() => ({ path: "sales", period: "weekly" })),
  writeLedgerDigest: vi.fn(() => ({ path: "ledger", period: "weekly" })),
  writeBudgetDigest: vi.fn(() => ({ path: "budget", period: "weekly" })),
  writeOrgDigest: vi.fn(() => ({ path: "org", period: "weekly" })),
}));

vi.mock("../src/lib/tax/tax-digest.js", () => ({
  writeTaxDigest: writers.writeTaxDigest,
}));
vi.mock("../src/lib/contracts/contracts-digest.js", () => ({
  writeContractsDigest: writers.writeContractsDigest,
}));
vi.mock("../src/lib/sales/sales-digest.js", () => ({
  writeSalesDigest: writers.writeSalesDigest,
}));
vi.mock("../src/lib/ledger/ledger-digest.js", () => ({
  writeLedgerDigest: writers.writeLedgerDigest,
}));
vi.mock("../src/lib/budget/budget-digest.js", () => ({
  writeBudgetDigest: writers.writeBudgetDigest,
}));
vi.mock("../src/lib/org/org-digest.js", () => ({
  writeOrgDigest: writers.writeOrgDigest,
}));

import { runScopeAStaticDigests } from "../src/lib/pipeline-static-digests.js";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT_DIR } from "../src/lib/tenant.js";

describe("pipeline Scope A static digests", () => {
  beforeEach(() => {
    for (const fn of Object.values(writers)) {
      fn.mockClear();
      fn.mockImplementation(() => ({ path: "ok", period: "weekly" }));
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("runs all six writers for weekly", () => {
    const result = runScopeAStaticDigests("weekly");
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
    expect(writers.writeTaxDigest).toHaveBeenCalledWith({ period: "weekly" });
    expect(writers.writeContractsDigest).toHaveBeenCalledWith({ period: "weekly" });
    expect(writers.writeSalesDigest).toHaveBeenCalledWith({ period: "weekly" });
    expect(writers.writeLedgerDigest).toHaveBeenCalledWith({ period: "weekly" });
    expect(writers.writeBudgetDigest).toHaveBeenCalledWith({ period: "weekly" });
    expect(writers.writeOrgDigest).toHaveBeenCalledWith({ period: "weekly" });
  });

  it("runs all six writers for monthly", () => {
    const result = runScopeAStaticDigests("monthly");
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
    for (const fn of Object.values(writers)) {
      expect(fn).toHaveBeenCalledWith({ period: "monthly" });
    }
  });

  it("collects per-surface errors without skipping others", () => {
    writers.writeTaxDigest.mockImplementation(() => {
      throw new Error("tax boom");
    });
    writers.writeSalesDigest.mockImplementation(() => {
      throw new Error("sales boom");
    });
    const result = runScopeAStaticDigests("weekly");
    expect(result.ok).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining(["tax: tax boom", "sales: sales boom"]),
    );
    expect(result.errors).toHaveLength(2);
    expect(writers.writeContractsDigest).toHaveBeenCalled();
    expect(writers.writeLedgerDigest).toHaveBeenCalled();
    expect(writers.writeBudgetDigest).toHaveBeenCalled();
    expect(writers.writeOrgDigest).toHaveBeenCalled();
  });

  it("CLI registrar documents and wires monthly pipeline", () => {
    const src = readFileSync(
      join(ROOT_DIR, "src/cli/registrars/platform.ts"),
      "utf-8",
    );
    expect(src).toContain("runPipelineMonthly");
    expect(src).toContain("Run a pipeline (daily | weekly | monthly)");
    expect(src).toMatch(/name === ["']monthly["']/);
  });
});
