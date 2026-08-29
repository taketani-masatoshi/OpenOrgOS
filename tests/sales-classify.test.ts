import { describe, expect, it, beforeEach } from "vitest";
import { setTenantId } from "../src/lib/tenant.js";
import { classifyDeal } from "../src/lib/sales-classify.js";
import type { SalesDeal } from "../schemas/sales.js";

describe("sales-classify", () => {
  beforeEach(() => {
    setTenantId("mal");
  });

  it("classifies tagged deal as icp_fit when ICP matches", () => {
    const deal: SalesDeal = {
      id: "DEAL-2026-099",
      title: "Tagged",
      stage: "proposal",
      owner_name: "Tester",
      counterparty: "X",
      tags: ["corporate"],
      inquiry_id: "INQ-2026-001",
    };
    const result = classifyDeal(deal, {
      version: 1,
      preferred_tags: ["corporate"],
      preferred_domains: [],
      capital_bands: [],
      min_probability_pct: 20,
    });
    expect(result.lead_class).toBe("icp_fit");
    expect(result.confidence_pct).toBeGreaterThan(50);
  });
});
