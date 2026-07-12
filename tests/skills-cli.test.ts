import { beforeEach, describe, expect, it } from "vitest";
import { computeVarianceReport } from "../src/lib/variance.js";
import { runPermitExpiryCheck } from "../src/lib/permit-check.js";
import { checkOperationsRecords } from "../src/lib/records-check.js";
import { setTenantId } from "../src/lib/tenant.js";

beforeEach(() => {
  setTenantId("mal");
});

describe("variance", () => {
  it("computes FY2026 variance from yojitsu and monthly yaml", () => {
    const r = computeVarianceReport("FY2026");
    expect(r.months.length).toBe(12);
    expect(r.planTotal).toBeGreaterThan(0);
  });
});

describe("permit-check", () => {
  it("finds draft insurance CTRs", () => {
    const r = runPermitExpiryCheck();
    expect(r.draftInsurance).toContain("CTR-013");
    expect(r.draftInsurance).toContain("CTR-014");
  });
});

describe("records-check", () => {
  it("discovers committed kamezawa record templates without requiring runtime records", () => {
    const r = checkOperationsRecords(
      "properties/PROP-002-kamezawa/operations/templates"
    );
    expect(r.files.length).toBeGreaterThan(0);
    expect(r.files.some((f) => f.path.includes("宿泊者名簿"))).toBe(true);
    expect(r.totalRows).toBeGreaterThanOrEqual(0);
  });
});
