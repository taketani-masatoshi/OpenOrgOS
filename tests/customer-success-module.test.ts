// @catalog-ids: customer_success
import { beforeEach, describe, expect, it, vi } from "vitest";
import { setTenantId } from "../src/lib/tenant.js";
import { collectCustomerSuccessIntegrityIssues } from "../src/lib/customer-success/integrity.js";
import {
  runCustomerSuccessShow,
  runCustomerSuccessValidate,
} from "../steward/modules/customer_success/cli/commands.js";
import { validateCustomerSuccessModuleData } from "../steward/modules/customer_success/cli/lib.js";
import { buildCustomerSuccessView } from "../src/lib/customer-success-view.js";

function captureJson(run: () => void): Record<string, unknown> {
  const lines: string[] = [];
  const spy = vi.spyOn(console, "log").mockImplementation((msg?: unknown) => {
    lines.push(String(msg));
  });
  run();
  spy.mockRestore();
  return JSON.parse(lines.join("\n"));
}

describe("customer success module (MAL)", () => {
  beforeEach(() => {
    setTenantId("mal");
  });

  it("validate passes for mal tenant data", () => {
    const issues = validateCustomerSuccessModuleData();
    expect(issues).toEqual([]);
  });

  it("show returns json summary with demo accounts excluded", () => {
    const payload = captureJson(() =>
      runCustomerSuccessShow({ json: true }),
    );
    expect(payload.total_accounts).toBe(1);
  });

  it("show json with includeDemo via view builder", () => {
    const payloadAll = captureJson(() => {
      console.log(JSON.stringify(buildCustomerSuccessView({ includeDemo: true })));
    });
    expect(payloadAll.total_accounts).toBeGreaterThan(0);
  });

  it("collectCustomerSuccessIntegrityIssues has no errors", () => {
    const errors = collectCustomerSuccessIntegrityIssues().filter(
      (i) => i.level === "error",
    );
    expect(errors).toEqual([]);
  });

  it("runCustomerSuccessValidate exits cleanly", () => {
    expect(() => runCustomerSuccessValidate()).not.toThrow();
  });
});
