import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildCorporateTaxAdjustments } from "../src/lib/finance/corporate-tax-adjustments.js";
import { buildCorporateTaxXmlDraft } from "../src/lib/finance/jp-corporate-tax-xml.js";
import { useFinanceFixtureTenant } from "./helpers/finance-fixture.js";

const confirmed = [
  {
    code: "entertainment_excess",
    direction: "add" as const,
    amount_yen: 100_000,
    status: "confirmed" as const,
    label: "交際費等超過",
  },
  {
    code: "dividend_received",
    direction: "subtract" as const,
    amount_yen: 40_000,
    status: "confirmed" as const,
    label: "受取配当等",
  },
];

describe("corporate tax adjustments", () => {
  it("adds confirmed lines to net income and subtracts the rest", () => {
    const result = buildCorporateTaxAdjustments({
      netIncomeYen: 1_000_000,
      lines: confirmed,
    });
    expect(result.net_income_yen).toBe(1_000_000);
    expect(result.add_backs_yen).toBe(100_000);
    expect(result.subtractions_yen).toBe(40_000);
    expect(result.taxable_income_yen).toBe(1_060_000);
    expect(result.advisor_pending).toEqual([]);
    expect(result.adjustments_absent).toBe(false);
  });

  it("keeps pending lines out of taxable income", () => {
    const result = buildCorporateTaxAdjustments({
      netIncomeYen: 1_000_000,
      lines: [
        ...confirmed,
        {
          code: "deemed_interest",
          direction: "add",
          amount_yen: 50_000,
          status: "pending",
          label: "みなし利息",
        },
      ],
    });
    expect(result.taxable_income_yen).toBe(1_060_000);
    expect(result.add_backs_yen).toBe(100_000);
    expect(result.advisor_pending).toEqual(["deemed_interest"]);
  });

  it("treats an empty list as no adjustments, not a silent zero", () => {
    const result = buildCorporateTaxAdjustments({
      netIncomeYen: 800_000,
      lines: [],
    });
    expect(result.taxable_income_yen).toBe(800_000);
    expect(result.advisor_pending).toEqual([]);
    expect(result.adjustments_absent).toBe(true);
  });

  it("returns the same schedule for the same input", () => {
    const input = { netIncomeYen: 1_000_000, lines: confirmed };
    expect(buildCorporateTaxAdjustments(input)).toEqual(
      buildCorporateTaxAdjustments(input),
    );
  });

  it("rejects a negative amount and an unknown status", () => {
    expect(() =>
      buildCorporateTaxAdjustments({
        netIncomeYen: 1,
        lines: [
          {
            code: "bad",
            direction: "add",
            amount_yen: -1,
            status: "confirmed",
            label: "負",
          },
        ],
      }),
    ).toThrow();
    expect(() =>
      buildCorporateTaxAdjustments({
        netIncomeYen: 1,
        lines: [
          {
            code: "bad",
            direction: "add",
            amount_yen: 1,
            status: "guessed" as "confirmed",
            label: "不明",
          },
        ],
      }),
    ).toThrow();
  });

  it("does not read tenant tax memos", () => {
    const source = readFileSync(
      new URL("../src/lib/finance/corporate-tax-adjustments.ts", import.meta.url),
      "utf-8",
    );
    expect(source).not.toContain("docs/company/tax");
    expect(source).not.toContain("tenants/mal");
  });

  it("writes the schedule into the return draft instead of a fixed zero", () => {
    useFinanceFixtureTenant();
    const lines = [
      ...confirmed,
      {
        code: "deemed_interest",
        direction: "add" as const,
        amount_yen: 50_000,
        status: "pending" as const,
        label: "みなし利息",
      },
    ];
    const draft = buildCorporateTaxXmlDraft({
      fiscalYear: "FY2026",
      asOf: "2026-08-31",
      lines,
    });
    const net = Number(
      draft.xml.match(/code="current_net_income"[^>]*>(-?\d+)/)?.[1],
    );
    const schedule = buildCorporateTaxAdjustments({
      netIncomeYen: net,
      lines,
    });
    expect(draft.xml).toMatch(
      new RegExp(`code="add_backs"[^>]*>${schedule.add_backs_yen}</Line>`),
    );
    expect(draft.xml).toMatch(
      new RegExp(`code="subtractions"[^>]*>${schedule.subtractions_yen}</Line>`),
    );
    expect(draft.xml).toMatch(
      new RegExp(
        `code="taxable_income_estimate"[^>]*>${schedule.taxable_income_yen}</Line>`,
      ),
    );
    expect(draft.xml).toContain("deemed_interest");
    expect(draft.xml).toContain("<AdjustmentsAbsent>false</AdjustmentsAbsent>");
    expect(draft.xml).not.toContain('label="加算（税理士確定）">0');
  });
});
