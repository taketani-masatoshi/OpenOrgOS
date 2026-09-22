import { describe, expect, it } from "vitest";
import { assessBlueReturnDeduction, deriveSolePropBooksFlags } from "../src/lib/finance/sole-prop-blue-return.js";
import { runIsolatedSolePropLaneFAcceptance } from "../src/lib/product/ledger-sole-prop-lane-f-acceptance.js";

describe("sole prop lane F acceptance", () => {
  it("does not treat missing or one-sided books as ready for the 550,000 deduction", () => {
    const empty = deriveSolePropBooksFlags({
      entries: [],
      ownerCapitalCode: "3010",
      formHasProfitAndLoss: true,
      formHasBalanceSheet: true,
    });
    expect(empty).toEqual({
      doubleEntry: false,
      hasBalanceSheet: false,
      hasProfitAndLoss: false,
    });
    expect(
      assessBlueReturnDeduction({ businessIncomeYen: 5_000_500, ...empty }).applied_yen,
    ).toBe(0);

    const oneSided = deriveSolePropBooksFlags({
      entries: [{ lines: [{ debit_yen: 10, credit_yen: 0 }] }],
      ownerCapitalCode: "3010",
      formHasProfitAndLoss: true,
      formHasBalanceSheet: true,
    });
    expect(oneSided.doubleEntry).toBe(false);
    expect(
      assessBlueReturnDeduction({ businessIncomeYen: 5_000_500, ...oneSided }).applied_yen,
    ).toBe(0);

    const noCapital = deriveSolePropBooksFlags({
      entries: [
        {
          lines: [
            { debit_yen: 10, credit_yen: 0 },
            { debit_yen: 0, credit_yen: 10 },
          ],
        },
      ],
      ownerCapitalCode: undefined,
      formHasProfitAndLoss: true,
      formHasBalanceSheet: true,
    });
    expect(noCapital.doubleEntry).toBe(true);
    expect(noCapital.hasBalanceSheet).toBe(false);
    expect(
      assessBlueReturnDeduction({ businessIncomeYen: 5_000_500, ...noCapital }).applied_yen,
    ).toBe(0);
  });
  it(
    "scores 100 when owner capital, blue-return lines, and income tax all pass",
    () => {
      const result = runIsolatedSolePropLaneFAcceptance();
      expect(result.isolated).toBe(true);
      expect(result.max_score).toBe(100);
      const failed = result.checks.filter((row) => !row.pass);
      expect(failed, JSON.stringify(failed, null, 2)).toEqual([]);
      expect(result.score).toBe(100);
    },
    180_000,
  );
});
