/**
 * 地方法人税・法人住民税・法人事業税。
 * 税率は呼び出し側が渡す。このファイルは tests/fixtures を読まない。
 * 国税の課税所得と法人税額は evaluateTaxAdjustment の戻りだけを使う。
 */
import { evaluateTaxAdjustment } from "./tax-adjustment.js";

export type TaxLineStatus = "complete" | "incomplete" | "not_levied";

export type LocalTaxLine = {
  case_id: string;
  tax:
    | "local_corporate"
    | "inhabitant_corporate_levy"
    | "inhabitant_per_capita"
    | "enterprise_income"
    | "enterprise_per_capita";
  jurisdiction: string;
  status: TaxLineStatus;
  yen: number | null;
  form_line?: string;
};

export type RateFraction = {
  numerator: number;
  denominator: number;
};

export type PerCapitaBand = {
  capital_yen_max: number | null;
  prefecture_yen: number;
  municipality_over_50_yen: number;
  municipality_up_to_50_yen: number;
};

export type IncomeBracketRate = {
  up_to_annual_yen: number | null;
  numerator: number;
  denominator: number;
};

/** 確認済みの率だけを受け取る。欠ける項目は未完了にし、コード側の率で埋めない。 */
export type CorporateLocalTaxRates = {
  local_corporate: {
    numerator: number;
    denominator: number;
    truncate_unit_yen: number;
  };
  inhabitant: {
    prefecture: RateFraction;
    municipality: RateFraction;
    apportionment: "headcount";
    headcount_over: number;
    tax_base_truncate_unit_yen: number;
    determined_truncate_unit_yen: number;
    full_year_months: number;
    per_capita: PerCapitaBand[];
  };
  enterprise: {
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
};

export type LocalTaxOffice = {
  municipality_id: string;
  prefecture_id: string;
  headcount: number | null;
  /** 地方税法第72条の48第4項第2号。各月末の事業所数の合計。 */
  office_month_ends: number | null;
};

export type CorporateLocalTaxFacts = {
  caseId: string;
  corporateTaxYen: number | null;
  taxableIncomeYen: number | null;
  capitalYen: number | null;
  fiscalMonths: number | null;
  business: "manufacturing" | "other" | null;
  corporationKind: "ordinary" | "special" | null;
  offices: LocalTaxOffice[];
  rates: CorporateLocalTaxRates;
};

type Place = {
  id: string;
  headcount: number | null;
  officeMonthEnds: number | null;
};

function line(
  facts: CorporateLocalTaxFacts,
  tax: LocalTaxLine["tax"],
  jurisdiction: string,
  status: TaxLineStatus,
  yen: number | null
): LocalTaxLine {
  return { case_id: facts.caseId, tax, jurisdiction, status, yen };
}

function incomplete(facts: CorporateLocalTaxFacts, tax: LocalTaxLine["tax"]): LocalTaxLine {
  return line(facts, tax, "*", "incomplete", null);
}

function truncateYen(amount: number, unit: number): number | null {
  if (!Number.isInteger(amount) || amount < 0 || !Number.isInteger(unit) || unit <= 0) return null;
  return Math.floor(amount / unit) * unit;
}

function applyRate(base: number, rate: RateFraction): number | null {
  if (!Number.isInteger(base) || base < 0) return null;
  if (
    !Number.isInteger(rate.numerator) ||
    !Number.isInteger(rate.denominator) ||
    rate.denominator <= 0
  ) {
    return null;
  }
  return Math.floor((base * rate.numerator) / rate.denominator);
}

function exactShare(amount: number, part: number, whole: number): number | null {
  if (!Number.isInteger(amount) || amount < 0 || !Number.isInteger(part) || part < 0) return null;
  if (!Number.isInteger(whole) || whole <= 0) return null;
  if ((amount * part) % whole !== 0) return null;
  return (amount * part) / whole;
}

function takeFraction(amount: number, fraction: RateFraction): number | null {
  if (!Number.isInteger(fraction.numerator) || !Number.isInteger(fraction.denominator)) return null;
  if (fraction.denominator <= 0 || fraction.numerator < 0) return null;
  return exactShare(amount, fraction.numerator, fraction.denominator);
}

function groupPlaces(offices: LocalTaxOffice[], key: "municipality_id" | "prefecture_id"): Place[] {
  const grouped = new Map<string, Place>();
  for (const office of offices) {
    const id = office[key];
    const current = grouped.get(id) ?? { id, headcount: 0, officeMonthEnds: 0 };
    if (office.headcount == null || current.headcount == null) current.headcount = null;
    else current.headcount += office.headcount;
    if (office.office_month_ends == null || current.officeMonthEnds == null) {
      current.officeMonthEnds = null;
    } else current.officeMonthEnds += office.office_month_ends;
    grouped.set(id, current);
  }
  return [...grouped.values()].sort((a, b) => a.id.localeCompare(b.id));
}

function perCapitaBand(capitalYen: number, bands: PerCapitaBand[]): PerCapitaBand | null {
  if (!Number.isInteger(capitalYen) || capitalYen < 0) return null;
  for (const band of bands) {
    if (band.capital_yen_max == null || capitalYen <= band.capital_yen_max) return band;
  }
  return null;
}

function localCorporateLines(facts: CorporateLocalTaxFacts): LocalTaxLine[] {
  const rate = facts.rates.local_corporate;
  if (facts.corporateTaxYen == null) return [incomplete(facts, "local_corporate")];
  const raw = applyRate(facts.corporateTaxYen, rate);
  const yen = raw == null ? null : truncateYen(raw, rate.truncate_unit_yen);
  if (yen == null) return [incomplete(facts, "local_corporate")];
  return [line(facts, "local_corporate", "national", "complete", yen)];
}

function apportionByHeadcount(amount: number, places: Place[]): Map<string, number> | null {
  if (places.length === 0) return null;
  if (places.length === 1) return new Map([[places[0]!.id, amount]]);
  if (places.some((place) => place.headcount == null)) return null;
  const total = places.reduce((sum, place) => sum + (place.headcount ?? 0), 0);
  const shares = new Map<string, number>();
  for (const place of places) {
    const share = exactShare(amount, place.headcount ?? 0, total);
    if (share == null) return null;
    shares.set(place.id, share);
  }
  return shares;
}

function levyLines(facts: CorporateLocalTaxFacts): LocalTaxLine[] {
  const rates = facts.rates.inhabitant;
  if (rates.apportionment !== "headcount") return [incomplete(facts, "inhabitant_corporate_levy")];
  if (facts.corporateTaxYen == null || facts.offices.length === 0) {
    return [incomplete(facts, "inhabitant_corporate_levy")];
  }
  const municipalities = groupPlaces(facts.offices, "municipality_id");
  const prefectures = groupPlaces(facts.offices, "prefecture_id");
  const municipalBase = apportionByHeadcount(facts.corporateTaxYen, municipalities);
  const prefecturalBase = apportionByHeadcount(facts.corporateTaxYen, prefectures);
  if (!municipalBase || !prefecturalBase) return [incomplete(facts, "inhabitant_corporate_levy")];
  const lines: LocalTaxLine[] = [];
  for (const [id, base] of municipalBase) {
    const taxed = taxOnBase(
      base,
      rates.municipality,
      rates.tax_base_truncate_unit_yen,
      rates.determined_truncate_unit_yen
    );
    if (taxed == null) return [incomplete(facts, "inhabitant_corporate_levy")];
    lines.push(line(facts, "inhabitant_corporate_levy", `muni:${id}`, "complete", taxed));
  }
  for (const [id, base] of prefecturalBase) {
    const taxed = taxOnBase(
      base,
      rates.prefecture,
      rates.tax_base_truncate_unit_yen,
      rates.determined_truncate_unit_yen
    );
    if (taxed == null) return [incomplete(facts, "inhabitant_corporate_levy")];
    lines.push(line(facts, "inhabitant_corporate_levy", `pref:${id}`, "complete", taxed));
  }
  return lines;
}

function taxOnBase(
  base: number,
  rate: RateFraction,
  baseUnit: number,
  taxUnit: number
): number | null {
  const truncatedBase = truncateYen(base, baseUnit);
  if (truncatedBase == null) return null;
  const raw = applyRate(truncatedBase, rate);
  if (raw == null) return null;
  return truncateYen(raw, taxUnit);
}

function perCapitaLines(facts: CorporateLocalTaxFacts): LocalTaxLine[] {
  const rates = facts.rates.inhabitant;
  if (
    facts.capitalYen == null ||
    facts.fiscalMonths !== rates.full_year_months ||
    facts.offices.length === 0 ||
    facts.offices.some((office) => office.headcount == null)
  ) {
    return [incomplete(facts, "inhabitant_per_capita")];
  }
  const band = perCapitaBand(facts.capitalYen, rates.per_capita);
  if (!band) return [incomplete(facts, "inhabitant_per_capita")];
  const lines: LocalTaxLine[] = [];
  for (const municipality of groupPlaces(facts.offices, "municipality_id")) {
    if (municipality.headcount == null) return [incomplete(facts, "inhabitant_per_capita")];
    const yen =
      municipality.headcount > rates.headcount_over
        ? band.municipality_over_50_yen
        : band.municipality_up_to_50_yen;
    lines.push(line(facts, "inhabitant_per_capita", `muni:${municipality.id}`, "complete", yen));
  }
  for (const prefecture of groupPlaces(facts.offices, "prefecture_id")) {
    lines.push(
      line(facts, "inhabitant_per_capita", `pref:${prefecture.id}`, "complete", band.prefecture_yen)
    );
  }
  return lines;
}

function incomeBrackets(
  income: number,
  brackets: IncomeBracketRate[]
): { slice: number; rate: IncomeBracketRate }[] | null {
  const finite = brackets.filter((bracket) => bracket.up_to_annual_yen != null);
  const open = brackets.find((bracket) => bracket.up_to_annual_yen == null);
  if (!open || finite.length !== brackets.length - 1) return null;
  let previous = 0;
  let remaining = income;
  const slices: { slice: number; rate: IncomeBracketRate }[] = [];
  for (const bracket of finite) {
    const ceiling = bracket.up_to_annual_yen;
    if (ceiling == null || ceiling <= previous) return null;
    const slice = Math.min(remaining, ceiling - previous);
    slices.push({ slice, rate: bracket });
    remaining -= slice;
    previous = ceiling;
  }
  slices.push({ slice: remaining, rate: open });
  return slices;
}

function apportionSlice(
  slice: number,
  facts: CorporateLocalTaxFacts,
  prefectures: Place[]
): Map<string, number> | null {
  if (prefectures.length === 1) return new Map([[prefectures[0]!.id, slice]]);
  if (facts.business === "manufacturing") {
    return apportionByHeadcount(slice, prefectures);
  }
  if (facts.business !== "other") return null;
  const officeHalf = takeFraction(slice, facts.rates.enterprise.other_office_share);
  const headHalf = takeFraction(slice, facts.rates.enterprise.other_headcount_share);
  if (officeHalf == null || headHalf == null || officeHalf + headHalf !== slice) return null;
  if (prefectures.some((place) => place.headcount == null || place.officeMonthEnds == null)) {
    return null;
  }
  const officeTotal = prefectures.reduce((sum, place) => sum + (place.officeMonthEnds ?? 0), 0);
  const headTotal = prefectures.reduce((sum, place) => sum + (place.headcount ?? 0), 0);
  const shares = new Map<string, number>();
  for (const prefecture of prefectures) {
    const byOffice = exactShare(officeHalf, prefecture.officeMonthEnds ?? 0, officeTotal);
    const byHead = exactShare(headHalf, prefecture.headcount ?? 0, headTotal);
    if (byOffice == null || byHead == null) return null;
    shares.set(prefecture.id, byOffice + byHead);
  }
  return shares;
}

function enterpriseIncomeLines(facts: CorporateLocalTaxFacts): LocalTaxLine[] {
  const rates = facts.rates.enterprise;
  if (facts.taxableIncomeYen == null || facts.taxableIncomeYen < 0) {
    return [incomplete(facts, "enterprise_income")];
  }
  if (facts.fiscalMonths !== rates.full_year_months || facts.capitalYen == null) {
    return [incomplete(facts, "enterprise_income")];
  }
  if (facts.offices.length === 0) return [incomplete(facts, "enterprise_income")];
  const ordinary = facts.corporationKind === "ordinary";
  const special = facts.corporationKind === "special";
  if (!ordinary && !special) return [incomplete(facts, "enterprise_income")];
  if (facts.capitalYen > rates.ordinary_capital_max_inclusive_yen) {
    return [incomplete(facts, "enterprise_income")];
  }
  const income = truncateYen(facts.taxableIncomeYen, rates.tax_base_truncate_unit_yen);
  const brackets = incomeBrackets(
    income ?? -1,
    ordinary ? rates.ordinary_income : rates.special_income
  );
  if (income == null || !brackets) return [incomplete(facts, "enterprise_income")];
  const prefectures = groupPlaces(facts.offices, "prefecture_id");
  const taxByPrefecture = new Map<string, number>();
  for (const prefecture of prefectures) taxByPrefecture.set(prefecture.id, 0);
  for (const bracket of brackets) {
    const shares = apportionSlice(bracket.slice, facts, prefectures);
    if (!shares) return [incomplete(facts, "enterprise_income")];
    for (const [id, share] of shares) {
      const truncatedBase = truncateYen(share, rates.tax_base_truncate_unit_yen);
      const raw = truncatedBase == null ? null : applyRate(truncatedBase, bracket.rate);
      if (raw == null) return [incomplete(facts, "enterprise_income")];
      taxByPrefecture.set(id, (taxByPrefecture.get(id) ?? 0) + raw);
    }
  }
  const lines: LocalTaxLine[] = [];
  for (const [id, yen] of taxByPrefecture) {
    const truncated = truncateYen(yen, rates.determined_truncate_unit_yen);
    if (truncated == null) return [incomplete(facts, "enterprise_income")];
    lines.push(line(facts, "enterprise_income", `pref:${id}`, "complete", truncated));
  }
  return lines;
}

function enterprisePerCapitaLine(facts: CorporateLocalTaxFacts): LocalTaxLine {
  if (facts.rates.enterprise.per_capita !== "not_levied") {
    return incomplete(facts, "enterprise_per_capita");
  }
  return line(facts, "enterprise_per_capita", "*", "not_levied", null);
}

export function computeCorporateLocalTax(facts: CorporateLocalTaxFacts): LocalTaxLine[] {
  return [
    ...localCorporateLines(facts),
    ...levyLines(facts),
    ...perCapitaLines(facts),
    ...enterpriseIncomeLines(facts),
    enterprisePerCapitaLine(facts),
  ];
}

/** 課税所得と法人税額は税額調整の結果だけを使う。 */
export function computeCorporateLocalTaxFromAdjustment(
  fiscalYear: string,
  facts: Omit<CorporateLocalTaxFacts, "corporateTaxYen" | "taxableIncomeYen">
): LocalTaxLine[] {
  const sheet = evaluateTaxAdjustment(fiscalYear);
  return computeCorporateLocalTax({
    ...facts,
    corporateTaxYen: sheet.corporate_tax_yen,
    taxableIncomeYen: sheet.taxable_income_yen,
  });
}

export function diffCorporateLocalTaxLines(
  actual: LocalTaxLine[],
  pinned: LocalTaxLine[]
): string[] {
  const key = (row: LocalTaxLine) => `${row.case_id}|${row.tax}|${row.jurisdiction}`;
  const actualMap = new Map(actual.map((row) => [key(row), row]));
  const pinnedMap = new Map(pinned.map((row) => [key(row), row]));
  const diffs: string[] = [];
  for (const [id, expected] of pinnedMap) {
    const got = actualMap.get(id);
    if (!got) diffs.push(`missing ${id}`);
    else if (
      got.status !== expected.status ||
      got.yen !== expected.yen ||
      (got.form_line ?? "") !== (expected.form_line ?? "")
    ) {
      diffs.push(
        `${id} expected ${expected.status} ${String(expected.yen)} form=${expected.form_line ?? ""} got ${got.status} ${String(got.yen)} form=${got.form_line ?? ""}`
      );
    }
  }
  for (const id of actualMap.keys()) {
    if (!pinnedMap.has(id)) diffs.push(`extra ${id}`);
  }
  return diffs;
}

/**
 * 東京都主税局の均等割計算例。年額×月数÷12、100円未満切捨て。
 * 事業税の記載例は含まない。
 */
