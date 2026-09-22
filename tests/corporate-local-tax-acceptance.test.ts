import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";
import { appendJournalEntry } from "../src/lib/finance/expense-claim-journal.js";
import {
  computeCorporateLocalTax,
  computeCorporateLocalTaxFromAdjustment,
  diffCorporateLocalTaxLines,
  projectTokyoBunkatuOfficialLocalTaxLines,
  scoreCorporateLocalTax,
  tokyoBunkatuEnterpriseIncomeExample,
  tokyoBunkatuInhabitantLevyExample,
  tokyoWardRelocationEqualTax,
  type CorporateLocalTaxFacts,
  type CorporateLocalTaxRates,
  type IncomeBracketRate,
  type LocalTaxLine,
  type LocalTaxOffice,
  type PerCapitaBand,
  type RateFraction,
} from "../src/lib/finance/corporate-local-tax.js";
import { getDataDir } from "../src/lib/utils.js";
import { resetFixtureJournalEntries, useFinanceFixtureTenant } from "./helpers/finance-fixture.js";

const FY = "FY2026";

type Scenario = {
  id: string;
  from_tax_adjustment?: boolean;
  fiscal_year?: string;
  corporate_tax_yen?: number | null;
  taxable_income_yen?: number | null;
  capital_yen: number | null;
  fiscal_months: number | null;
  business: CorporateLocalTaxFacts["business"];
  corporation_kind: CorporateLocalTaxFacts["corporationKind"];
  offices: LocalTaxOffice[];
  lines: Omit<LocalTaxLine, "case_id">[];
};

function fraction(value: { numerator: number; denominator: number }): RateFraction {
  return { numerator: value.numerator, denominator: value.denominator };
}

function brackets(value: IncomeBracketRate[]): IncomeBracketRate[] {
  return value.map((bracket) => ({
    up_to_annual_yen: bracket.up_to_annual_yen,
    numerator: bracket.numerator,
    denominator: bracket.denominator,
  }));
}

function ratesFromPin(raw: Record<string, unknown>): CorporateLocalTaxRates {
  const local = raw.local_corporate as CorporateLocalTaxRates["local_corporate"];
  const inhabitant = raw.inhabitant as {
    prefecture: RateFraction;
    municipality: RateFraction;
    apportionment: "headcount";
    headcount_over: number;
    tax_base_truncate_unit_yen: number;
    determined_truncate_unit_yen: number;
    full_year_months: number;
    per_capita: PerCapitaBand[];
  };
  const enterprise = raw.enterprise as {
    ordinary_capital_max_inclusive_yen: number;
    tax_base_truncate_unit_yen: number;
    determined_truncate_unit_yen: number;
    full_year_months: number;
    ordinary_income: IncomeBracketRate[];
    special_income: IncomeBracketRate[];
    per_capita: "not_levied";
    other_office_share: RateFraction;
    other_headcount_share: RateFraction;
  };
  return {
    local_corporate: {
      numerator: local.numerator,
      denominator: local.denominator,
      truncate_unit_yen: local.truncate_unit_yen,
    },
    inhabitant: {
      prefecture: fraction(inhabitant.prefecture),
      municipality: fraction(inhabitant.municipality),
      apportionment: inhabitant.apportionment,
      headcount_over: inhabitant.headcount_over,
      tax_base_truncate_unit_yen: inhabitant.tax_base_truncate_unit_yen,
      determined_truncate_unit_yen: inhabitant.determined_truncate_unit_yen,
      full_year_months: inhabitant.full_year_months,
      per_capita: inhabitant.per_capita.map((band) => ({
        capital_yen_max: band.capital_yen_max,
        prefecture_yen: band.prefecture_yen,
        municipality_over_50_yen: band.municipality_over_50_yen,
        municipality_up_to_50_yen: band.municipality_up_to_50_yen,
      })),
    },
    enterprise: {
      ordinary_capital_max_inclusive_yen: enterprise.ordinary_capital_max_inclusive_yen,
      tax_base_truncate_unit_yen: enterprise.tax_base_truncate_unit_yen,
      determined_truncate_unit_yen: enterprise.determined_truncate_unit_yen,
      full_year_months: enterprise.full_year_months,
      ordinary_income: brackets(enterprise.ordinary_income),
      special_income: brackets(enterprise.special_income),
      per_capita: enterprise.per_capita,
      other_office_share: fraction(enterprise.other_office_share),
      other_headcount_share: fraction(enterprise.other_headcount_share),
    },
  };
}

function postRevenue(): void {
  appendJournalEntry({
    entry_id: "JE-REV-LOCAL-TAX",
    occurred_at: "2026-09-12T00:00:00.000Z",
    description: "revenue",
    source: { kind: "manual", authorized_by: "OP-TEST" },
    evidence_refs: ["test:local-tax"],
    lines: [
      { account_code: "1100", debit_yen: 10_000_000, credit_yen: 0, tax_category: "out_of_scope" },
      { account_code: "4100", debit_yen: 0, credit_yen: 10_000_000, tax_category: "non_taxable" },
    ],
  });
}

function loadTokyoBunkatuPin(): LocalTaxLine[] {
  const parsed = parseYaml(
    readFileSync(join(process.cwd(), "tests/fixtures/local-tax/tokyo-bunkatu-example.yaml"), "utf-8")
  ) as {
    case_id: string;
    lines: Array<{
      tax: LocalTaxLine["tax"];
      jurisdiction: string;
      status: LocalTaxLine["status"];
      yen: number;
      form_line: string;
    }>;
  };
  return parsed.lines.map((row) => ({
    case_id: parsed.case_id,
    tax: row.tax,
    jurisdiction: row.jurisdiction,
    status: row.status,
    yen: row.yen,
    form_line: row.form_line,
  }));
}

describe("corporate local tax acceptance", () => {
  it("scores 6 only when local corporate, inhabitant, and enterprise diffs are empty", () => {
    const source = readFileSync(
      join(process.cwd(), "src/lib/finance/corporate-local-tax.ts"),
      "utf-8"
    );
    expect(source.includes("corporate-rates.yaml")).toBe(false);
    expect(source.includes("tests/fixtures/local-tax")).toBe(false);

    const pin = parseYaml(
      readFileSync(join(process.cwd(), "tests/fixtures/local-tax/corporate-rates.yaml"), "utf-8")
    ) as { scenarios: Scenario[] } & Record<string, unknown>;
    const rates = ratesFromPin(pin);
    useFinanceFixtureTenant();
    const journalPath = join(getDataDir(), "finance", "journal-entries.yaml");
    const locksPath = join(getDataDir(), "finance", "period-locks.yaml");
    const journalOriginal = readFileSync(journalPath, "utf-8");
    const locksOriginal = existsSync(locksPath) ? readFileSync(locksPath, "utf-8") : null;
    resetFixtureJournalEntries();
    postRevenue();
    try {
      const actual: LocalTaxLine[] = [];
      const pinned: LocalTaxLine[] = [];
      for (const scenario of pin.scenarios) {
        const facts = {
          caseId: scenario.id,
          capitalYen: scenario.capital_yen,
          fiscalMonths: scenario.fiscal_months,
          business: scenario.business,
          corporationKind: scenario.corporation_kind,
          offices: scenario.offices,
          rates,
        };
        const lines = scenario.from_tax_adjustment
          ? computeCorporateLocalTaxFromAdjustment(scenario.fiscal_year ?? FY, facts)
          : computeCorporateLocalTax({
              ...facts,
              corporateTaxYen: scenario.corporate_tax_yen ?? null,
              taxableIncomeYen: scenario.taxable_income_yen ?? null,
            });
        actual.push(...lines);
        pinned.push(
          ...scenario.lines.map((row) => ({
            case_id: scenario.id,
            tax: row.tax,
            jurisdiction: row.jurisdiction,
            status: row.status,
            yen: row.yen,
          }))
        );
      }
      const diffs = diffCorporateLocalTaxLines(actual, pinned);
      expect(scoreCorporateLocalTax(actual, pinned), diffs.join("\n")).toBe(0);
    } finally {
      writeFileSync(journalPath, journalOriginal);
      if (locksOriginal != null) writeFileSync(locksPath, locksOriginal);
    }
  });

  it("matches the Tokyo equal-tax example and still scores 0 without enterprise tax", () => {
    const computed = tokyoWardRelocationEqualTax({
      annualYen: 70_000,
      monthsBefore: 6,
      monthsAfter: 5,
    });
    expect(computed.wardBeforeYen).toBe(35_000);
    expect(computed.wardAfterYen).toBe(29_100);
    expect(computed.totalYen).toBe(64_100);
    const lines: LocalTaxLine[] = [
      {
        case_id: "tokyo",
        tax: "inhabitant_per_capita",
        jurisdiction: "Ａ区分",
        status: "complete",
        yen: computed.wardBeforeYen,
        form_line: "Ａ区分",
      },
      {
        case_id: "tokyo",
        tax: "inhabitant_per_capita",
        jurisdiction: "Ｂ区分",
        status: "complete",
        yen: computed.wardAfterYen,
        form_line: "Ｂ区分",
      },
    ];
    expect(scoreCorporateLocalTax(lines, lines)).toBe(0);
  });

  it("scores 0 when enterprise_income is incomplete even if form_line is set", () => {
    const lines: LocalTaxLine[] = [
      {
        case_id: "x",
        tax: "inhabitant_per_capita",
        jurisdiction: "Ａ区分",
        status: "complete",
        yen: 35_000,
        form_line: "Ａ区分",
      },
      {
        case_id: "x",
        tax: "enterprise_income",
        jurisdiction: "pref:tokyo",
        status: "incomplete",
        yen: null,
        form_line: "㉛",
      },
    ];
    expect(scoreCorporateLocalTax(lines, lines)).toBe(0);
  });

  it("scores 6 when Tokyo bunkatu guide yen and form lines ⑬/㉜ have an empty diff", () => {
    const source = readFileSync(
      join(process.cwd(), "src/lib/finance/corporate-local-tax.ts"),
      "utf-8"
    );
    expect(source.includes("tokyo-bunkatu-example.yaml")).toBe(false);

    const enterprise = tokyoBunkatuEnterpriseIncomeExample();
    expect(enterprise.basesYen).toEqual([1_412_000, 1_412_000, 9_953_000]);
    expect(enterprise.taxesYen).toEqual([52_900, 79_900, 744_400]);
    expect(enterprise.totalYen).toBe(877_200);

    const levy = tokyoBunkatuInhabitantLevyExample();
    expect(levy.splitBaseYen).toBe(557_000);
    expect(levy.taxYen).toBe(57_900);

    const actual = projectTokyoBunkatuOfficialLocalTaxLines();
    const pinned = loadTokyoBunkatuPin();
    const diffs = diffCorporateLocalTaxLines(actual, pinned);
    expect(diffs, diffs.join("\n")).toEqual([]);
    expect(scoreCorporateLocalTax(actual, pinned)).toBe(6);
  });
});
