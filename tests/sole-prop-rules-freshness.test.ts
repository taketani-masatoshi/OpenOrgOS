import { describe, expect, it, beforeEach } from "vitest";
import { setTenantId } from "../src/lib/tenant.js";
import { assessRulesFreshness } from "../src/lib/finance/sole-prop-rules-freshness.js";

describe("assessRulesFreshness", () => {
  beforeEach(() => {
    setTenantId("_fixture-sole-prop");
  });

  it("is ok when asOf is within review interval of reviewed_on", () => {
    const issues = assessRulesFreshness(new Date("2026-06-01T00:00:00Z"));
    expect(issues.filter((i) => i.message.includes("期限超過"))).toHaveLength(0);
  });

  it("warns when asOf is past review interval", () => {
    const issues = assessRulesFreshness(new Date("2028-01-01T00:00:00Z"));
    expect(issues.some((i) => i.message.includes("期限超過"))).toBe(true);
  });
});
