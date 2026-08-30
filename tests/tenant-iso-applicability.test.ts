import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { tenantStandardsFileSchema } from "../schemas/tenant-standards.js";
import {
  loadApplicableIsoIds,
  loadEnabledIsoIds,
  loadIsoApplicability,
} from "../src/lib/tenant-standards.js";
import { getTenantsDir, setTenantId } from "../src/lib/tenant.js";

const TENANT = `iso-appl-${process.pid}`;
const tenantDir = join(getTenantsDir(), TENANT);

beforeAll(() => {
  mkdirSync(tenantDir, { recursive: true });
  writeFileSync(
    join(tenantDir, "tenant.yaml"),
    `id: ${TENANT}\nname: applicability fixture\nlifecycle: test\noperation_mode: development\njurisdiction: JP\n`,
    "utf-8",
  );
  writeFileSync(
    join(tenantDir, "standards.yaml"),
    `iso:\n  - id: ISO-21401\n    enabled: true\n  - id: ISO-22000\n    enabled: true\n    applicability: excluded\n    exclusion_reason: 食品製造を行わない\n`,
    "utf-8",
  );
  setTenantId(TENANT);
});

afterAll(() => {
  rmSync(tenantDir, { recursive: true, force: true });
});

describe("ISO applicability", () => {
  it("refuses excluded without a reason", () => {
    expect(() =>
      tenantStandardsFileSchema.parse({
        iso: [{ id: "ISO-22000", enabled: true, applicability: "excluded" }],
      }),
    ).toThrow(/exclusion_reason/);
  });

  it("keeps excluded standards enabled but out of the conformity set", () => {
    setTenantId(TENANT);
    expect(loadEnabledIsoIds()).toEqual(expect.arrayContaining(["ISO-21401", "ISO-22000"]));
    expect(loadApplicableIsoIds()).toContain("ISO-21401");
    expect(loadApplicableIsoIds()).not.toContain("ISO-22000");
    expect(loadIsoApplicability("ISO-22000")).toMatchObject({
      enabled: true,
      applicability: "excluded",
      exclusion_reason: "食品製造を行わない",
    });
  });
});

describe("mal tenant", () => {
  it("enables all 12 available ISOs and excludes 22000 with a reason", () => {
    setTenantId("mal");
    expect(loadEnabledIsoIds()).toHaveLength(12);
    expect(loadApplicableIsoIds()).not.toContain("ISO-22000");
    expect(loadApplicableIsoIds()).toHaveLength(11);
    expect(loadIsoApplicability("ISO-22000").applicability).toBe("excluded");
    expect(loadIsoApplicability("ISO-22000").exclusion_reason?.length).toBeGreaterThan(0);
  });
});
