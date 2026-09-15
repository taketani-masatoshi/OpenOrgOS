import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getTenantDir, setTenantId } from "../src/lib/tenant.js";
import { runValidateReport } from "../src/commands/validate.js";
import { validateAll } from "../src/lib/data.js";

describe("sole-prop validate year-end warnings", () => {
  const setupRel = "data/finance/blue-return-setup.yaml";
  let setupBackup: string;

  beforeEach(() => {
    setTenantId("_fixture-sole-prop");
    setupBackup = readFileSync(join(getTenantDir(), setupRel), "utf-8");
  });

  afterEach(() => {
    writeFileSync(join(getTenantDir(), setupRel), setupBackup, "utf-8");
  });

  it("schema-validates without corp-only required YAML", () => {
    const schema = validateAll();
    const corpMissing = schema.errors.filter((e) =>
      /fixed-costs|payroll|loans|business-plan|employees|classification-registry|document-io/.test(
        e.file,
      ),
    );
    expect(corpMissing).toEqual([]);
  });

  it("with demo coverage acks, validate is quiet except accounting/year-end map noise", () => {
    const report = runValidateReport();
    expect(report.ok).toBe(true);
    expect(report.error_count).toBe(0);
    expect(
      report.issues.some(
        (i) => i.source === "integrity" && /仕訳が無い月|未 lock/.test(i.message),
      ),
    ).toBe(false);
    expect(
      report.issues.some(
        (i) =>
          i.source === "integrity" &&
          i.severity === "warning" &&
          /雑費へ集約|経費科目/.test(i.message),
      ),
    ).toBe(true);
  });

  it("surfaces empty-month and unlock warnings when coverage acks are cleared", () => {
    writeFileSync(
      join(getTenantDir(), setupRel),
      setupBackup.replace(/\njournal_coverage:[\s\S]*$/m, "").trimEnd() + "\n",
      "utf-8",
    );
    const report = runValidateReport();
    expect(
      report.issues.some(
        (i) =>
          i.source === "integrity" &&
          i.severity === "warning" &&
          /仕訳が無い月/.test(i.message),
      ),
    ).toBe(true);
    expect(
      report.issues.some(
        (i) =>
          i.source === "integrity" &&
          i.severity === "warning" &&
          /未 lock/.test(i.message),
      ),
    ).toBe(true);
  });
});
