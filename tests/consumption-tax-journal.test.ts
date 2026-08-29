import { describe, expect, it, beforeEach } from "vitest";
import { appendJournalEntry } from "../src/lib/finance/expense-claim-journal.js";
import { postMonthlyPlJournalEntries } from "../src/lib/finance/journal-sources.js";
import {
  buildConsumptionTaxSummary,
  splitInclusiveConsumptionTax,
} from "../src/lib/finance/consumption-tax.js";
import {
  resetFixtureJournalEntries,
  useFinanceFixtureTenant,
} from "./helpers/finance-fixture.js";

describe("consumption tax from GL", () => {
  beforeEach(() => resetFixtureJournalEntries());

  it("splits inclusive 10% with floor", () => {
    expect(splitInclusiveConsumptionTax(1_050_000, 10)).toEqual({
      net_yen: 954_546,
      tax_yen: 95_454,
    });
  });

  it("does not treat AR debit as a purchase", () => {
    useFinanceFixtureTenant();
    appendJournalEntry({
      entry_id: "JE-TAX-AR-001",
      occurred_at: "2026-09-12T00:00:00.000Z",
      description: "invoice AR",
      source: { kind: "manual", authorized_by: "test" },
      evidence_refs: ["test:tax-ar"],
      lines: [
        {
          account_code: "1150",
          debit_yen: 11000,
          credit_yen: 0,
          counterparty_id: "CUST-A",
          tax_category: "out_of_scope",
        },
        {
          account_code: "4100",
          debit_yen: 0,
          credit_yen: 10000,
          tax_category: "taxable_10",
        },
        {
          account_code: "2160",
          debit_yen: 0,
          credit_yen: 1000,
          tax_category: "out_of_scope",
        },
      ],
    });
    const summary = buildConsumptionTaxSummary({ period: "2026-09" });
    expect(summary.lines.find((l) => l.direction === "sales" && l.tax_category === "taxable_10")?.base_yen).toBe(
      10000,
    );
    expect(
      summary.lines.find((l) => l.direction === "purchase" && l.tax_category === "taxable_10")
        ?.base_yen,
    ).toBe(0);
  });

  it("posts monthly hotel revenue as taxable net plus 仮受消費税", () => {
    useFinanceFixtureTenant();
    postMonthlyPlJournalEntries({ period: "2026-09", authorizedBy: "OP-TEST" });
    const summary = buildConsumptionTaxSummary({ period: "2026-09" });
    const sales10 = summary.lines.find(
      (l) => l.direction === "sales" && l.tax_category === "taxable_10",
    );
    expect(sales10?.base_yen).toBe(954_546);
    const purchases10 = summary.lines.find(
      (l) => l.direction === "purchase" && l.tax_category === "taxable_10",
    );
    expect(purchases10?.base_yen).toBeGreaterThan(0);
  });
});
