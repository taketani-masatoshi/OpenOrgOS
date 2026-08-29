import { describe, expect, it, beforeEach } from "vitest";
import { setTenantId } from "../src/lib/tenant.js";
import {
  loadSalesPipeline,
  loadSalesInquiries,
  loadSalesOutboundCampaigns,
  loadCustomerAccounts,
  validateAll,
} from "../src/lib/data.js";

describe("sales validate (MAL)", () => {
  beforeEach(() => {
    setTenantId("mal");
  });

  it("loads sales pipeline schema", () => {
    const pipeline = loadSalesPipeline();
    expect(pipeline?.version).toBe(1);
    expect(pipeline?.deals.length).toBeGreaterThan(0);
  });

  it("loads inbound, outbound, and customer accounts", () => {
    expect(loadSalesInquiries()?.inquiries.length).toBeGreaterThan(0);
    expect(loadSalesOutboundCampaigns()?.campaigns.length).toBeGreaterThan(0);
    expect(loadCustomerAccounts()?.accounts.length).toBeGreaterThan(0);
  });

  it("open non-demo deals have account_id after migrate-accounts", () => {
    const pipeline = loadSalesPipeline();
    const open = (pipeline?.deals ?? []).filter(
      (d) => d.demo !== true && d.stage !== "won" && d.stage !== "lost",
    );
    expect(open.length).toBeGreaterThan(0);
    for (const d of open) {
      expect(d.account_id, `${d.id} missing account_id`).toMatch(/^CUST-/);
    }
  });
});
