import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import YAML from "yaml";
import { assessBlueReturnDeduction, deriveSolePropBooksFlags } from "../src/lib/finance/sole-prop-blue-return.js";
import {
  blueReturnFromAccounts,
  incomeTaxReturnYenDiff,
  nextOpeningCapitalYen,
  scoreBlueReturnExample,
  scoreBlueReturnLines,
  scoreIncomeTaxReturn,
  scoreLocalTax,
  scoreOwnerCapital,
  type BlueReturnLinePin,
  type BasicDeductionBand,
  type IncomeTaxYenPin,
} from "../src/lib/finance/sole-prop-core-score.js";
import {
  blueReturnPageStatutoryMet,
  diffBlueReturnOfficialPage,
  projectBlueReturnPageFromBooks,
  scoreBlueReturnOfficialPage,
} from "../src/lib/finance/sole-prop-blue-return-page.js";
import {
  diffSolePropLocalTaxLines,
  nerimaInhabitantExampleTarou,
  osakaEnterpriseExample1,
  projectOfficialSolePropLocalTaxLines,
  resolvePerCapita,
  scoreSolePropLocalTax,
  type SolePropLocalRates,
  type SolePropLocalTaxLine,
} from "../src/lib/finance/sole-prop-local-tax.js";
import {
  runIsolatedSolePropLaneFAcceptance,
  type SolePropAcceptancePins,
} from "../src/lib/finance/acceptance/sole-prop-lane-f-acceptance.js";

function loadPins(): SolePropAcceptancePins {
  const blue = YAML.parse(
    readFileSync("tests/fixtures/sole-prop/blue-return-lines.yaml", "utf-8"),
  ) as BlueReturnLinePin;
  const income = YAML.parse(
    readFileSync("tests/fixtures/sole-prop/income-tax-lines.yaml", "utf-8"),
  ) as { lines: Array<{ id: string }>; bands: BasicDeductionBand[] };
  const officialYen = YAML.parse(
    readFileSync("tests/fixtures/sole-prop/no-1199-yen.yaml", "utf-8"),
  ) as {
    source: { label: string; url: string };
    era: string;
    rows: Array<IncomeTaxYenPin & { label?: string }>;
  };
  const localRates = YAML.parse(
    readFileSync("tests/fixtures/sole-prop/local-rates.yaml", "utf-8"),
  ) as SolePropLocalRates;
  const localOfficial = YAML.parse(
    readFileSync("tests/fixtures/sole-prop/local-tax-official-example.yaml", "utf-8"),
  ) as {
    source: {
      inhabitant: { label: string; url: string };
      enterprise: { label: string; url: string };
    };
    lines: SolePropLocalTaxLine[];
  };
  if (!officialYen.source.url.includes("1199.htm")) {
    throw new Error("official yen pin must cite No.1199");
  }
  if (officialYen.era !== "令和7年分") {
    throw new Error("official yen pin must be Reiwa 7 column");
  }
  if (officialYen.rows.some((row) => row.amount_yen === 1_040_000)) {
    throw new Error("Reiwa 8 basic deduction 1040000 must not be used");
  }
  if (!localOfficial.source.inhabitant.url.includes("nerima.tokyo.jp")) {
    throw new Error("inhabitant pin must cite Nerima calculation example");
  }
  if (!localOfficial.source.enterprise.url.includes("pref.osaka.lg.jp")) {
    throw new Error("enterprise pin must cite Osaka Q8");
  }
  if (localOfficial.lines.some((row) => !row.form_line)) {
    throw new Error("local tax pin rows must have form_line");
  }
  return {
    blue,
    incomeLineIds: income.lines.map((row) => row.id),
    basicDeductionBands: income.bands,
    incomeTaxOfficialYen: officialYen.rows.map((row) => ({
      id: row.id,
      amount_yen: row.amount_yen,
    })),
    localRates,
    localOfficialLines: localOfficial.lines,
  };
}

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
  it("scores 0 when capital, lines, or the return omit the published roles", () => {
    expect(
      scoreOwnerCapital({
        openingYen: 0,
        closingYen: 6_000,
        incomeYen: 6_000,
        capitalTransferYen: 6_000,
        incomeIsSeparateLine: false,
      }),
    ).toBe(0);
    const pins = loadPins();
    expect(
      scoreBlueReturnLines(
        [{ print: "②", role: "cogs" }],
        pins.blue,
      ),
    ).toBe(0);
    expect(
      scoreBlueReturnLines(
        [
          { print: "②", role: "opening_inventory" },
          { print: "⑦", role: "taxes_and_dues" },
        ],
        pins.blue,
      ),
    ).toBe(0);
    expect(
      scoreIncomeTaxReturn({
        lines: [],
        requiredLineIds: pins.incomeLineIds,
        pinnedYen: pins.incomeTaxOfficialYen,
      }),
    ).toBe(0);
    // Band / line self-match without an official yen pin is not statutory marks.
    expect(
      scoreIncomeTaxReturn({
        lines: [
          { id: "income", amount_yen: 4_450_500 },
          { id: "basic_deduction", amount_yen: 680_000 },
          { id: "deduction", amount_yen: 680_000 },
          { id: "taxable_income", amount_yen: 3_770_000 },
          { id: "tax", amount_yen: 326_500 },
        ],
        requiredLineIds: pins.incomeLineIds,
        pinnedYen: [],
      }),
    ).toBe(0);
    expect(pins.incomeTaxOfficialYen).toEqual([{ id: "basic_deduction", amount_yen: 680_000 }]);
    expect(
      incomeTaxReturnYenDiff(
        [{ id: "basic_deduction", amount_yen: 680_000 }],
        pins.incomeTaxOfficialYen,
      ),
    ).toEqual([]);
    expect(
      incomeTaxReturnYenDiff(
        [{ id: "basic_deduction", amount_yen: 1_040_000 }],
        pins.incomeTaxOfficialYen,
      ),
    ).not.toEqual([]);
    const missing = resolvePerCapita({
      basis: "capital_and_headcount",
      flatYen: 4_000,
      capitalYen: null,
      headcount: null,
    });
    expect(missing.complete && missing.yen === 0).toBe(false);
    expect(missing.yen).toBeNull();
    // Rate / expected-yen self-match is never the statutory 12.
    expect(
      scoreLocalTax({
        inhabitantIncomeYen: 100_000,
        enterpriseTaxYen: 55_000,
        perCapitaYen: 4_000,
        expectedInhabitantIncomeYen: 100_000,
        expectedEnterpriseTaxYen: 55_000,
        expectedPerCapitaYen: 4_000,
        missingCapitalHeadcountCompletedAsZero: false,
      }),
    ).toBe(0);
    expect(scoreSolePropLocalTax([], [])).toBe(0);
    expect(scoreSolePropLocalTax(projectOfficialSolePropLocalTaxLines(), [])).toBe(0);
  });
  it("scores local tax 12 only on official form-line + printed yen empty diff", () => {
    const source = readFileSync("src/lib/finance/sole-prop-local-tax.ts", "utf-8");
    expect(source.includes("local-tax-official-example")).toBe(false);
    expect(source.includes("tests/fixtures/sole-prop")).toBe(false);

    const pins = loadPins();
    const projected = projectOfficialSolePropLocalTaxLines();
    const diffs = diffSolePropLocalTaxLines(projected, pins.localOfficialLines);
    expect(diffs, diffs.join("\n")).toEqual([]);
    expect(scoreSolePropLocalTax(projected, pins.localOfficialLines)).toBe(12);

    const nerima = nerimaInhabitantExampleTarou();
    expect(nerima.wardIncomeYen).toBe(197_280);
    expect(nerima.prefIncomeYen).toBe(131_520);
    expect(nerima.wardPerCapitaYen).toBe(3_000);
    expect(nerima.prefPerCapitaYen).toBe(1_000);
    const osaka = osakaEnterpriseExample1();
    expect(osaka.taxYen).toBe(87_500);

    const withoutEnterprise = projected.filter((row) => row.tax !== "enterprise_income");
    expect(scoreSolePropLocalTax(withoutEnterprise, withoutEnterprise)).toBe(0);
    expect(
      scoreSolePropLocalTax(projected, pins.localOfficialLines, {
        missingCapitalHeadcountCompletedAsZero: true,
      }),
    ).toBe(0);
  });
  it(
    "scores the sole-prop core when capital, lines, monthly close, and income tax pass",
    () => {
      const result = runIsolatedSolePropLaneFAcceptance(loadPins());
      expect(result.isolated).toBe(true);
      const failed = result.checks.filter((row) => !row.pass);
      expect(failed, JSON.stringify(failed, null, 2)).toEqual([]);
      expect(result.score).toBe(result.max_score);
      const weight = (id: string) => result.checks.find((row) => row.id === id);
      expect(weight("owner-capital-equal")).toMatchObject({ weight: 18, pass: true });
      expect(weight("monthly-close")).toMatchObject({ weight: 12, pass: true });
      expect(weight("blue-return-lines")).toMatchObject({ weight: 22, pass: true });
      expect(weight("income-tax-return")).toMatchObject({ weight: 20, pass: true });
      expect(weight("local-tax")).toMatchObject({ weight: 12, pass: true });
    },
    180_000,
  );
  it("matches the handguide capital rollforward and profit-and-loss yen", () => {
    // scoreOwnerCapital with hand-fed yen is mechanism only — statutory 記帳 is
    // books → projectOwnerCapitalFromBooks → empty diff (owner-capital-display.test.ts).
    expect(
      scoreOwnerCapital({
        openingYen: 8_762_460,
        closingYen: 8_762_460,
        incomeYen: 3_983_920,
        capitalTransferYen: 0,
        incomeIsSeparateLine: true,
      }),
    ).toBe(18);
    expect(
      scoreOwnerCapital({
        openingYen: 8_762_460,
        closingYen: 8_762_460 + 3_983_920,
        incomeYen: 3_983_920,
        capitalTransferYen: 3_983_920,
        incomeIsSeparateLine: false,
      }),
    ).toBe(0);
    expect(
      nextOpeningCapitalYen({
        closingCapitalYen: 8_762_460,
        incomeBeforeBlueYen: 3_983_920,
        ownerAdvancesYen: 281_450,
        ownerDrawingsYen: 2_936_000,
      }),
    ).toBe(10_091_830);
    const accounts = {
      売上: 39_280_000,
      仕入: 27_487_000,
      租税公課: 385_000,
      水道光熱費: 224_000,
      旅費交通費: 148_000,
      通信費: 167_000,
      広告宣伝費: 105_000,
      接待交際費: 163_000,
      損害保険料: 105_000,
      修繕費: 259_000,
      消耗品費: 378_000,
      減価償却費: 1_571_400,
      福利厚生費: 173_000,
      給料賃金: 2_625_000,
      利子割引料: 128_000,
      地代家賃: 120_000,
      雑費: 48_000,
      貸倒引当金繰戻額: 64_460,
      貸倒引当金繰入額: 74_140,
      専従者給与: 1_200_000,
    };
    const lines = blueReturnFromAccounts(accounts);
    const income = lines.find((line) => line.label === "青色申告特別控除前の所得金額");
    const total = lines.find((line) => line.print === "㉛");
    expect(total?.amount_yen).toBe(6_599_400);
    expect(income?.amount_yen).toBe(3_983_920);
    const shifted = lines.map((line) =>
      line.print === "㉛" ? { ...line, amount_yen: line.amount_yen + 1 } : line,
    );
    expect(scoreBlueReturnExample(shifted, lines)).toBe(0);
  });
  it("statutory blue-return page is empty official handguide yen diff from books", () => {
    const pin = YAML.parse(
      readFileSync("tests/fixtures/sole-prop/blue-return-handguide-yen.yaml", "utf-8"),
    ) as {
      books_totals: Record<string, number>;
      lines: Array<{ print: string; label: string; amount_yen: number }>;
    };
    const projected = projectBlueReturnPageFromBooks(pin.books_totals);
    expect(diffBlueReturnOfficialPage(projected, pin.lines)).toEqual([]);
    expect(blueReturnPageStatutoryMet(projected, pin.lines)).toBe(true);
    expect(projected.find((line) => line.print === "②")?.label).toBe("期首商品棚卸高");
    expect(projected.find((line) => line.print === "㉛")?.amount_yen).toBe(6_599_400);
    const offByOne = projected.map((line) =>
      line.print === "㉛" ? { ...line, amount_yen: line.amount_yen + 1 } : line,
    );
    expect(diffBlueReturnOfficialPage(offByOne, pin.lines).length).toBeGreaterThan(0);
    expect(scoreBlueReturnOfficialPage(offByOne, pin.lines)).toBe(0);
    expect(blueReturnPageStatutoryMet(offByOne, pin.lines)).toBe(false);
    // Role-pin match alone is not statutory sufficiency.
    expect(blueReturnPageStatutoryMet(projected, [])).toBe(false);
    expect(scoreBlueReturnOfficialPage(projected, [])).toBe(0);
    expect(JSON.stringify(projected)).not.toMatch(/別表四|betsu-4|evaluateTaxAdjustment/);
  });
});
