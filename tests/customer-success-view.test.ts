// @catalog-ids: customer_success
import { describe, expect, it, beforeEach } from "vitest";
import { setTenantId } from "../src/lib/tenant.js";
import {
  buildCustomerSuccessView,
  formatCustomerSuccessTodayLines,
} from "../src/lib/customer-success-view.js";
import { buildCustomerSuccessCanvasViewModel } from "../src/lib/canvas-views/builders/customer-success.js";
import { canvasViewModelSchema } from "../schemas/canvas-view.js";
import {
  loadCustomerAccounts,
  loadCustomerHealthSignals,
  validateAll,
} from "../src/lib/data.js";

describe("customer success view (MAL)", () => {
  beforeEach(() => {
    setTenantId("mal");
  });

  it("loads extended customer yaml files", () => {
    expect(loadCustomerAccounts()?.accounts.length).toBeGreaterThanOrEqual(3);
    expect(loadCustomerHealthSignals()?.signals.length).toBeGreaterThan(0);
  });

  it("excludes demo accounts by default", () => {
    const view = buildCustomerSuccessView({ includeDemo: false });
    expect(view.total_accounts).toBe(1);
    expect(view.notes.some((n) => n.includes("demo"))).toBe(true);
  });

  it("includes demo accounts when requested", () => {
    const view = buildCustomerSuccessView({ includeDemo: true });
    expect(view.total_accounts).toBeGreaterThanOrEqual(3);
    expect(view.scored.length).toBe(view.total_accounts);
  });

  it("computes NPS summary", () => {
    const view = buildCustomerSuccessView({ includeDemo: true });
    expect(view.nps.responses).toBeGreaterThan(0);
    expect(view.nps.nps).not.toBeNull();
  });

  it("formats Today lines without PII", () => {
    const view = buildCustomerSuccessView({ includeDemo: true });
    const lines = formatCustomerSuccessTodayLines(view);
    expect(lines.length).toBe(2);
    expect(lines.join("\n")).not.toMatch(/03-/);
  });

  it("builds valid canvas view model", () => {
    const vm = buildCustomerSuccessCanvasViewModel({ includeDemo: true });
    expect(canvasViewModelSchema.safeParse(vm).success).toBe(true);
    expect(vm.view_id).toBe("customers");
    expect(vm.suite).toBe("sales");
  });

  it("passes validateAll for customer yaml", () => {
    const result = validateAll();
    const customerErrors = result.errors.filter((e) =>
      e.file.includes("data/customers/"),
    );
    expect(customerErrors).toEqual([]);
  });
});
