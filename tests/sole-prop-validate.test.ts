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

  it("surfaces empty-month warnings even when schema is incomplete historically", () => {
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

  it("suppresses empty-month warning when acknowledged", () => {
    writeFileSync(
      join(getTenantDir(), setupRel),
      `${setupBackup.trimEnd()}\njournal_coverage:\n  acknowledge_empty_months: true\n`,
      "utf-8",
    );
    const report = runValidateReport();
    expect(
      report.issues.some(
        (i) => i.source === "integrity" && /仕訳が無い月/.test(i.message),
      ),
    ).toBe(false);
  });
});
