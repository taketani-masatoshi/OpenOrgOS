/**
 * Tokyo bunkatu / ward worked-example pins and empty-diff scoring for corporate local tax.
 * Does not read tests/fixtures.
 */
import {
  diffCorporateLocalTaxLines,
  type LocalTaxLine,
} from "./corporate-local-tax.js";

export function tokyoWardRelocationEqualTax(input: {
  annualYen: number;
  monthsBefore: number;
  monthsAfter: number;
}): { wardBeforeYen: number; wardAfterYen: number; totalYen: number } {
  const slice = (months: number) =>
    Math.floor(Math.floor((input.annualYen * months) / 12) / 100) * 100;
  const wardBeforeYen = slice(input.monthsBefore);
  const wardAfterYen = slice(input.monthsAfter);
  return { wardBeforeYen, wardAfterYen, totalYen: wardBeforeYen + wardAfterYen };
}

/**
 * 分割基準のガイドブックの端数: 1単位あたりは小数点以下を
 * （分割基準総数の桁数+1）位まで残して切り捨て、按分後は千円未満切捨て。
 */
function bunkatuUnitShare(totalYen: number, countTotal: number): number {
  const digits = String(Math.trunc(Math.abs(countTotal))).length;
  const keep = digits + 1;
  const scale = 10 ** keep;
  const raw = totalYen / countTotal;
  return Math.floor(raw * scale) / scale;
}

function bunkatuApportion(halfYen: number, countIn: number, countTotal: number): number {
  const unit = bunkatuUnitShare(halfYen, countTotal);
  return Math.floor((unit * countIn) / 1000) * 1000;
}

/**
 * 東京都主税局「分割基準のガイドブック」（令和7年8月）所得割の計算例。
 * 所得 36,173 千円・事業所 36/120・従業者 61/150 → 区分標準 1,412 / 1,412 / 9,953 千円。
 * 都の税率 3.75% / 5.665% / 7.48% → 税額 52,900 / 79,900 / 744,400 → 計 877,200。
 * https://www.tax.metro.tokyo.lg.jp/documents/d/tax/houjin_bunkatu
 */
export function tokyoBunkatuEnterpriseIncomeExample(): {
  basesYen: [number, number, number];
  taxesYen: [number, number, number];
  totalYen: number;
} {
  const incomeYen = 36_173_000;
  const lowCap = 4_000_000;
  const midCap = 8_000_000;
  const low = Math.min(incomeYen, lowCap);
  const mid = Math.min(Math.max(incomeYen - lowCap, 0), midCap - lowCap);
  const high = Math.max(incomeYen - midCap, 0);
  const half = (yen: number) => Math.floor(yen / 2 / 1000) * 1000;
  const lowHalf = half(low);
  const midHalf = half(mid);
  const highHalf = half(high);
  const officesIn = 36;
  const officesTotal = 120;
  const headsIn = 61;
  const headsTotal = 150;
  const basesYen: [number, number, number] = [
    bunkatuApportion(lowHalf, officesIn, officesTotal) +
      bunkatuApportion(lowHalf, headsIn, headsTotal),
    bunkatuApportion(midHalf, officesIn, officesTotal) +
      bunkatuApportion(midHalf, headsIn, headsTotal),
    bunkatuApportion(highHalf, officesIn, officesTotal) +
      bunkatuApportion(highHalf, headsIn, headsTotal),
  ];
  const rates: Array<{ numerator: number; denominator: number }> = [
    { numerator: 375, denominator: 10_000 },
    { numerator: 5_665, denominator: 100_000 },
    { numerator: 748, denominator: 10_000 },
  ];
  const taxesYen = basesYen.map((base, index) => {
    const rate = rates[index]!;
    const raw = Math.floor((base * rate.numerator) / rate.denominator);
    return Math.floor(raw / 100) * 100;
  }) as [number, number, number];
  return {
    basesYen,
    taxesYen,
    totalYen: taxesYen[0] + taxesYen[1] + taxesYen[2],
  };
}

/**
 * 同ガイドの法人税割計算例。
 * 課税標準総額 15,000,000・従業者 65/1,750 → 分割標準 557,000 × 10.4% → 57,900。
 */
export function tokyoBunkatuInhabitantLevyExample(): {
  splitBaseYen: number;
  taxYen: number;
} {
  const corporateTaxYen = 15_000_000;
  const headsIn = 65;
  const headsTotal = 1_750;
  const unit = bunkatuUnitShare(corporateTaxYen, headsTotal);
  const splitBaseYen = Math.floor((unit * headsIn) / 1000) * 1000;
  const raw = Math.floor((splitBaseYen * 104) / 1000);
  const taxYen = Math.floor(raw / 100) * 100;
  return { splitBaseYen, taxYen };
}

/**
 * 公式欄番号付きの都の計算例を投影する。
 * 法人税割: 第6号様式「差引法人税割額⑬」。
 * 所得割合計: 第6号様式「計㉜」の税額（区分㉙〜㉛の税額合計）。
 * 呼び出し側がピンと比較する。tests/fixtures は読まない。
 */
export function projectTokyoBunkatuOfficialLocalTaxLines(
  caseId = "tokyo-bunkatu-r7"
): LocalTaxLine[] {
  const enterprise = tokyoBunkatuEnterpriseIncomeExample();
  const levy = tokyoBunkatuInhabitantLevyExample();
  return [
    {
      case_id: caseId,
      tax: "inhabitant_corporate_levy",
      jurisdiction: "tokyo-23",
      status: "complete",
      yen: levy.taxYen,
      form_line: "⑬",
    },
    {
      case_id: caseId,
      tax: "enterprise_income",
      jurisdiction: "pref:tokyo",
      status: "complete",
      yen: enterprise.totalYen,
      form_line: "㉜",
    },
  ];
}

function hasOfficialComplete(
  lines: LocalTaxLine[],
  tax: LocalTaxLine["tax"] | LocalTaxLine["tax"][]
): boolean {
  const wanted = new Set(Array.isArray(tax) ? tax : [tax]);
  return lines.some(
    (row) =>
      wanted.has(row.tax) &&
      row.status === "complete" &&
      row.yen != null &&
      Boolean(row.form_line)
  );
}

/**
 * 住民税（法人税割または均等割）と事業税所得割の両方で、
 * 実計算と公式ピンの全行に form_line があり空差分のときだけ 6。
 * 税率表一致・均等割だけの例・未完了の事業税行・自己ピンは 0。
 */
export function scoreCorporateLocalTax(actual: LocalTaxLine[], pinned: LocalTaxLine[]): 0 | 6 {
  if (pinned.length === 0 || actual.length === 0) return 0;
  if (pinned.some((line) => !line.form_line) || actual.some((line) => !line.form_line)) return 0;
  const inhabitant: LocalTaxLine["tax"][] = [
    "inhabitant_corporate_levy",
    "inhabitant_per_capita",
  ];
  if (!hasOfficialComplete(actual, inhabitant) || !hasOfficialComplete(pinned, inhabitant)) {
    return 0;
  }
  if (!hasOfficialComplete(actual, "enterprise_income") || !hasOfficialComplete(pinned, "enterprise_income")) {
    return 0;
  }
  return diffCorporateLocalTaxLines(actual, pinned).length === 0 ? 6 : 0;
}
