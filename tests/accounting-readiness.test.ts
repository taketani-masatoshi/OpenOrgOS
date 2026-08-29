import { describe, expect, it, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { refreshOrgOsPaths } from "../src/lib/orgos-paths.js";
import { buildAccountingReadinessReport } from "../src/lib/product/ledger-accounting-readiness.js";

describe("accounting readiness", () => {
  const env = { ...process.env };
  let workspace = "";

  afterEach(() => {
    if (workspace) rmSync(workspace, { recursive: true, force: true });
    process.env = { ...env };
    refreshOrgOsPaths();
  });

  it("exposes accounting mode with weighted checks totaling 100", () => {
    workspace = mkdtempSync(join(tmpdir(), "acct-ready-"));
    process.env.ORGOS_WORKSPACE = workspace;
    refreshOrgOsPaths();
    const report = buildAccountingReadinessReport();
    expect(report.mode).toBe("accounting");
    expect(report.max_score).toBe(100);
    const total = report.checks
      .filter((row) => row.weight > 0)
      .reduce((sum, row) => sum + row.weight, 0);
    expect(total).toBe(100);
    expect(report.checks.find((row) => row.id === "accounting-module")?.pass).toBe(
      true,
    );
    // Without pilots in empty workspace, runtime health checks fail → non-100
    expect(report.score).toBeLessThan(100);
  });
});
