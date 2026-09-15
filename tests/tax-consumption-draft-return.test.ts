import { describe, expect, it } from "vitest";
import { buildConsumptionTaxDraftReturn } from "../src/lib/finance/consumption-tax.js";
import { setTenantId } from "../src/lib/tenant.js";

describe("consumption tax draft return", () => {
  it("marks KLab exempt profile as no return required", () => {
    setTenantId("klab");
    const draft = buildConsumptionTaxDraftReturn({ calendarYear: 2026 });
    expect(draft.exempt).toBe(true);
    expect(draft.markdown).toContain("申告・納付は不要");
    expect(draft.summary).toBeNull();
  });

  it("builds taxable draft amounts for fixture-books", () => {
    setTenantId("_fixture-books");
    const draft = buildConsumptionTaxDraftReturn({ calendarYear: 2026 });
    expect(draft.exempt).toBe(false);
    expect(draft.summary).not.toBeNull();
    expect(draft.markdown).toContain("課税標準");
  });
});
