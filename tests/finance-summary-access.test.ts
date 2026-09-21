import { describe, expect, it } from "vitest";
import {
  operatorMayViewFinanceSummary,
  redactFinanceSummaryFields,
} from "../src/lib/console-auth/finance-summary-access.js";
import { setTenantId } from "../src/lib/tenant.js";

describe("finance summary access", () => {
  it("allows ceo and denies readonly on fixture registry", () => {
    setTenantId("_fixture-books");
    expect(
      operatorMayViewFinanceSummary({
        operator_id: "OP-001",
        approver_id: "OP-001",
        mode: "prod",
      })
    ).toBe(true);
    expect(
      operatorMayViewFinanceSummary({
        operator_id: "OP-READONLY",
        approver_id: "OP-READONLY",
        mode: "prod",
      })
    ).toBe(false);
  });

  it("redacts cash and runway when not allowed", () => {
    const redacted = redactFinanceSummaryFields(
      {
        finance_cash_balance: 12_345_678,
        finance_runway_months: 4.5,
        finance_burn_rate: 1000,
        finance_basis_month: "2026-08",
        finance_cash_flow_mode: "deficit" as const,
        finance_metrics_source: "synthetic",
      },
      false
    );
    expect(redacted.finance_cash_balance).toBeNull();
    expect(redacted.finance_runway_months).toBeNull();
    expect(redacted.finance_burn_rate).toBeUndefined();
    expect(redacted.finance_basis_month).toBeUndefined();
    expect(redacted.finance_cash_flow_mode).toBeUndefined();
    expect(redacted.finance_metrics_source).toBeUndefined();
  });

  it("preserves values when allowed", () => {
    const kept = redactFinanceSummaryFields(
      {
        finance_cash_balance: 99,
        finance_runway_months: 1.25,
      },
      true
    );
    expect(kept.finance_cash_balance).toBe(99);
    expect(kept.finance_runway_months).toBe(1.25);
  });
});
