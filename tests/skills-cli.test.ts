import { describe, expect, it } from "vitest";
import { computeVarianceReport } from "../src/lib/variance.js";
import { runPermitExpiryCheck } from "../src/lib/permit-check.js";
import { checkOperationsRecords } from "../src/lib/records-check.js";

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
  it("counts kamezawa operation records", () => {
    const r = checkOperationsRecords();
    expect(r.totalRows).toBeGreaterThan(0);
    expect(r.files.some((f) => f.path.includes("宿泊者名簿"))).toBe(true);
  });
});
