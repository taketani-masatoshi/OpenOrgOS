import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setTenantId } from "../src/lib/tenant.js";
import { buildCustomerChurnView } from "../src/lib/customer-churn-view.js";
import { resolveCustomersNavGate } from "../src/lib/customers-nav-gate.js";

describe("customers nav gate", () => {
  beforeEach(() => {
    setTenantId("mal");
  });

  it("shows tab when customer_success module is enabled on mal", () => {
    const gate = resolveCustomersNavGate();
    expect(gate.customer_success_enabled).toBe(true);
    expect(gate.show_tab).toBe(true);
  });

  it("enables sales panels when sales module is on (id === agent)", () => {
    const gate = resolveCustomersNavGate();
    expect(gate.sales_module_installed).toBe(true);
    expect(gate.sales_enabled).toBe(true);
  });
});

describe("customer churn view", () => {
  beforeEach(() => {
    setTenantId("mal");
  });

  it("derives dormant from last_contact_on without new enums", () => {
    const view = buildCustomerChurnView({ includeDemo: false, dormantDays: 30 });
    expect(view.company_name).toBeTruthy();
    expect(Array.isArray(view.accounts)).toBe(true);
    expect(Array.isArray(view.recent_events)).toBe(true);
    expect(view.notes.some((n) => n.includes("休眠"))).toBe(true);
  });
});
