/**
 * Personal local tax for a sole proprietor.
 * Rates are passed in by the caller. This file does not read test pins.
 * Individual per-capita tax is the flat inhabitant amount.
 * A capital-and-headcount levy with either input missing stays incomplete.
 * Statutory marks require official form / calculation-example lines + printed yen
 * with an empty diff — rate self-match alone is never 12.
 */

export type RateFraction = { numerator: number; denominator: number };

export type SolePropLocalRates = {
  inhabitant: {
    prefecture_income: RateFraction;
    municipality_income: RateFraction;
    designated_city_prefecture_income?: RateFraction;
    designated_city_municipality_income?: RateFraction;
    per_capita: {
      basis: "individual_flat" | "capital_and_headcount";
      prefecture_yen: number;
      municipality_yen: number;
    };
  };
  enterprise: {
    owner_deduction_yen: number;
    type1: RateFraction;
    type2: RateFraction;
    type3: RateFraction;
    type3_reduced: RateFraction;
  };
};

export type EnterpriseKind = "type1" | "type2" | "type3" | "type3_reduced";

export type PerCapitaResult = {
  complete: boolean;
  yen: number | null;
};

export type SolePropLocalTaxKind =
  | "inhabitant_income"
  | "inhabitant_per_capita"
  | "enterprise_income";

export type SolePropLocalTaxLine = {
  tax: SolePropLocalTaxKind;
  /** Official form / calculation-example row id (e.g. Nerima "7", Osaka "税額"). */
  form_line: string;
  jurisdiction: string;
  status: "complete" | "incomplete";
  yen: number | null;
  label: string;
};

export const SOLE_PROP_LOCAL_TAX_SCORE = 12 as const;

function applyRate(baseYen: number, rate: RateFraction): number {
  if (baseYen <= 0) return 0;
  return Math.floor((baseYen * rate.numerator) / rate.denominator);
}

export function resolvePerCapita(input: {
  basis: "individual_flat" | "capital_and_headcount";
  flatYen: number;
  capitalYen: number | null;
  headcount: number | null;
}): PerCapitaResult {
  if (input.basis === "individual_flat") {
    return { complete: true, yen: input.flatYen };
  }
  if (input.capitalYen == null || input.headcount == null) {
    return { complete: false, yen: null };
  }
  return { complete: false, yen: null };
}

export function computeSolePropLocalTax(input: {
  inhabitantTaxableYen: number;
  enterpriseIncomeYen: number;
  enterpriseKind: EnterpriseKind;
  designatedCity?: boolean;
  capitalYen: number | null;
  headcount: number | null;
  rates: SolePropLocalRates;
}): {
  inhabitant_income_yen: number;
  inhabitant_per_capita_yen: number | null;
  per_capita_complete: boolean;
  enterprise_tax_yen: number;
  missing_capital_headcount_completed_as_zero: boolean;
} {
  const incomeRates =
    input.designatedCity &&
    input.rates.inhabitant.designated_city_prefecture_income &&
    input.rates.inhabitant.designated_city_municipality_income
      ? {
          prefecture: input.rates.inhabitant.designated_city_prefecture_income,
          municipality: input.rates.inhabitant.designated_city_municipality_income,
        }
      : {
          prefecture: input.rates.inhabitant.prefecture_income,
          municipality: input.rates.inhabitant.municipality_income,
        };
  const inhabitantIncome =
    applyRate(input.inhabitantTaxableYen, incomeRates.prefecture) +
    applyRate(input.inhabitantTaxableYen, incomeRates.municipality);
  const flat =
    input.rates.inhabitant.per_capita.prefecture_yen +
    input.rates.inhabitant.per_capita.municipality_yen;
  const perCapita = resolvePerCapita({
    basis: input.rates.inhabitant.per_capita.basis,
    flatYen: flat,
    capitalYen: input.capitalYen,
    headcount: input.headcount,
  });
  const capitalBasis = resolvePerCapita({
    basis: "capital_and_headcount",
    flatYen: flat,
    capitalYen: input.capitalYen,
    headcount: input.headcount,
  });
  const enterpriseBase = Math.max(
    0,
    input.enterpriseIncomeYen - input.rates.enterprise.owner_deduction_yen,
  );
  const enterpriseRate = input.rates.enterprise[input.enterpriseKind];
  return {
    inhabitant_income_yen: inhabitantIncome,
    inhabitant_per_capita_yen: perCapita.yen,
    per_capita_complete: perCapita.complete,
    enterprise_tax_yen: applyRate(enterpriseBase, enterpriseRate),
    missing_capital_headcount_completed_as_zero:
      capitalBasis.complete && capitalBasis.yen === 0,
  };
}

/**
 * 練馬区「住民税の計算例（令和8年度）」太郎さん。
 * 行7 差引所得割額・行8 均等割額の印刷円。森林環境税（国税）は含めない。
 * 印刷は 算出所得割額−調整控除額（198780−1500=197280、132520−1000=131520）。
 * https://www.city.nerima.tokyo.jp/kurashi/zei/jyuminzei/keisan/keisanrei-26-1.html
 */
export function nerimaInhabitantExampleTarou(): {
  taxableYen: number;
  wardIncomeYen: number;
  prefIncomeYen: number;
  wardPerCapitaYen: number;
  prefPerCapitaYen: number;
} {
  const taxableYen = 3_313_000;
  const wardGross = Math.floor((taxableYen * 6) / 100);
  const prefGross = Math.floor((taxableYen * 4) / 100);
  const wardAdjust = 1_500;
  const prefAdjust = 1_000;
  return {
    taxableYen,
    wardIncomeYen: wardGross - wardAdjust,
    prefIncomeYen: prefGross - prefAdjust,
    wardPerCapitaYen: 3_000,
    prefPerCapitaYen: 1_000,
  };
}

/**
 * 大阪府「個人事業税 Q8」事例1（年間営業・第1種 5%）。
 * （所得 4,000,000 + 青色特別控除 650,000 − 事業主控除 2,900,000）× 5% = 87,500。
 * https://www.pref.osaka.lg.jp/o050040/zei/alacarte/qakojnjgyoa9.html
 */
export function osakaEnterpriseExample1(): {
  incomeYen: number;
  blueSpecialDeductionYen: number;
  ownerDeductionYen: number;
  taxYen: number;
} {
  const incomeYen = 4_000_000;
  const blueSpecialDeductionYen = 650_000;
  const ownerDeductionYen = 2_900_000;
  const base = incomeYen + blueSpecialDeductionYen - ownerDeductionYen;
  const taxYen = Math.floor((base * 5) / 100);
  return { incomeYen, blueSpecialDeductionYen, ownerDeductionYen, taxYen };
}

/**
 * 公式計算例の欄番号付き行を投影する。呼び出し側がピンと比較する。
 * 試験用のピン YAML は読まない。
 */
export function projectOfficialSolePropLocalTaxLines(): SolePropLocalTaxLine[] {
  const inhabitant = nerimaInhabitantExampleTarou();
  const enterprise = osakaEnterpriseExample1();
  return [
    {
      tax: "inhabitant_income",
      form_line: "7",
      jurisdiction: "ward:nerima",
      status: "complete",
      yen: inhabitant.wardIncomeYen,
      label: "差引所得割額",
    },
    {
      tax: "inhabitant_income",
      form_line: "7",
      jurisdiction: "pref:tokyo",
      status: "complete",
      yen: inhabitant.prefIncomeYen,
      label: "差引所得割額",
    },
    {
      tax: "inhabitant_per_capita",
      form_line: "8",
      jurisdiction: "ward:nerima",
      status: "complete",
      yen: inhabitant.wardPerCapitaYen,
      label: "均等割額",
    },
    {
      tax: "inhabitant_per_capita",
      form_line: "8",
      jurisdiction: "pref:tokyo",
      status: "complete",
      yen: inhabitant.prefPerCapitaYen,
      label: "均等割額",
    },
    {
      tax: "enterprise_income",
      form_line: "税額",
      jurisdiction: "pref:osaka",
      status: "complete",
      yen: enterprise.taxYen,
      label: "税額",
    },
  ];
}

function lineKey(line: SolePropLocalTaxLine): string {
  return `${line.tax}|${line.form_line}|${line.jurisdiction}|${line.label}`;
}

/** Empty when every pinned official line matches projection (form_line + yen + status). */
export function diffSolePropLocalTaxLines(
  actual: readonly SolePropLocalTaxLine[],
  pinned: readonly SolePropLocalTaxLine[],
): string[] {
  const diffs: string[] = [];
  if (pinned.length === 0) {
    diffs.push("official_empty");
    return diffs;
  }
  if (actual.length === 0) {
    diffs.push("projected_empty");
    return diffs;
  }
  const actualMap = new Map(actual.map((row) => [lineKey(row), row]));
  const pinnedMap = new Map(pinned.map((row) => [lineKey(row), row]));
  for (const [id, expected] of pinnedMap) {
    const got = actualMap.get(id);
    if (!got) {
      diffs.push(`missing ${id} ${expected.status} ${String(expected.yen)}`);
      continue;
    }
    if (got.status !== expected.status || got.yen !== expected.yen) {
      diffs.push(
        `${id} expected ${expected.status} ${String(expected.yen)} got ${got.status} ${String(got.yen)}`,
      );
    }
  }
  for (const id of actualMap.keys()) {
    if (!pinnedMap.has(id)) diffs.push(`extra ${id}`);
  }
  return diffs;
}

function hasOfficialComplete(
  lines: readonly SolePropLocalTaxLine[],
  tax: SolePropLocalTaxKind | SolePropLocalTaxKind[],
): boolean {
  const wanted = new Set(Array.isArray(tax) ? tax : [tax]);
  return lines.some(
    (row) =>
      wanted.has(row.tax) &&
      row.status === "complete" &&
      row.yen != null &&
      Boolean(row.form_line),
  );
}

/**
 * 12 only when inhabitant income, per-capita, and enterprise income all have
 * form_line + printed yen and the official pin diff is empty.
 * Rate-table self-match, empty pin, missing form_line, or completing a
 * capital/headcount levy as 0 → 0.
 */
export function scoreSolePropLocalTax(
  actual: readonly SolePropLocalTaxLine[],
  pinned: readonly SolePropLocalTaxLine[],
  opts?: { missingCapitalHeadcountCompletedAsZero?: boolean },
): 0 | typeof SOLE_PROP_LOCAL_TAX_SCORE {
  if (opts?.missingCapitalHeadcountCompletedAsZero) return 0;
  if (pinned.length === 0 || actual.length === 0) return 0;
  if (pinned.some((line) => !line.form_line) || actual.some((line) => !line.form_line)) {
    return 0;
  }
  if (
    !hasOfficialComplete(actual, "inhabitant_income") ||
    !hasOfficialComplete(pinned, "inhabitant_income")
  ) {
    return 0;
  }
  if (
    !hasOfficialComplete(actual, "inhabitant_per_capita") ||
    !hasOfficialComplete(pinned, "inhabitant_per_capita")
  ) {
    return 0;
  }
  if (
    !hasOfficialComplete(actual, "enterprise_income") ||
    !hasOfficialComplete(pinned, "enterprise_income")
  ) {
    return 0;
  }
  return diffSolePropLocalTaxLines(actual, pinned).length === 0
    ? SOLE_PROP_LOCAL_TAX_SCORE
    : 0;
}
