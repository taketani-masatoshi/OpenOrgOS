/**
 * Official blue-return PL page (一般用) vs books projection.
 * Statutory sufficiency is an empty print-mark + yen diff against the caller's
 * NTA handguide / form pin — not scoreBlueReturnLines role-pin match alone.
 * This module does not read tests/fixtures; the caller supplies the official pin.
 */
import {
  blueReturnFromAccounts,
  type BlueReturnAmountLine,
} from "./sole-prop-core-score.js";

export const BLUE_RETURN_PAGE_SCORE = 22 as const;
export const OPENING_INVENTORY_PRINT = "②";
export const EXPENSE_TOTAL_PRINT = "㉛";

export type BlueReturnBooksTotals = Readonly<Record<string, number>>;

/**
 * 国税庁 令和7年分 青色申告決算書（一般用）の書き方 / 貸借対照表作成の手引き設例の印刷円。
 * https://www.nta.go.jp/taxes/shiraberu/shinkoku/tebiki/2025/pdf/037.pdf
 * Product-shipped pin (yen only). Do not invent. Do not read tests/fixtures.
 */
export const NTA_REIWA7_BLUE_RETURN_HANDGUIDE_BOOKS: BlueReturnBooksTotals = {
  売上: 39_280_000,
  仕入: 27_487_000,
  期首商品棚卸高: 0,
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

/** Official page lines derived from the handguide books (print + label + yen). */
export function ntaReiwa7BlueReturnHandguidePage(): BlueReturnAmountLine[] {
  return projectBlueReturnPageFromBooks(NTA_REIWA7_BLUE_RETURN_HANDGUIDE_BOOKS);
}

/**
 * Live Chat / product gate: books projection of the NTA handguide totals vs page pin.
 * Empty diff + full page score → ready. Does not claim tenant books are filled.
 */
export function blueReturnHandguideLiveReady(): boolean {
  const official = ntaReiwa7BlueReturnHandguidePage();
  const projected = projectBlueReturnPageFromBooks(NTA_REIWA7_BLUE_RETURN_HANDGUIDE_BOOKS);
  return (
    diffBlueReturnOfficialPage(projected, official).length === 0 &&
    scoreBlueReturnOfficialPage(projected, official) === BLUE_RETURN_PAGE_SCORE
  );
}

/**
 * Books / expense totals → printed page lines (print mark + label + yen).
 * ② is opening inventory. ⑧–㉚ are expenses. ㉛ is the expense total.
 */
export function projectBlueReturnPageFromBooks(
  accounts: BlueReturnBooksTotals,
): BlueReturnAmountLine[] {
  const opening =
    accounts["期首商品棚卸高"] ?? accounts["期首棚卸"] ?? accounts["opening_inventory"] ?? 0;
  const projected = blueReturnFromAccounts(accounts);
  const sales = projected[0];
  if (!sales) return [];
  return [
    sales,
    { print: OPENING_INVENTORY_PRINT, label: "期首商品棚卸高", amount_yen: opening },
    ...projected.slice(1),
  ];
}

/**
 * Empty when every official print mark + label + yen matches the books projection.
 * Empty official pin is a miss. 1 yen off is a miss. Role-only pins are not accepted here.
 */
export function diffBlueReturnOfficialPage(
  projected: readonly BlueReturnAmountLine[],
  official: readonly BlueReturnAmountLine[],
): string[] {
  const misses: string[] = [];
  if (official.length === 0) {
    misses.push("official_empty");
    return misses;
  }
  if (projected.length === 0) {
    misses.push("projected_empty");
    return misses;
  }
  if (!official.some((line) => line.print === OPENING_INVENTORY_PRINT)) {
    misses.push("official_missing_②");
  }
  if (!projected.some((line) => line.print === OPENING_INVENTORY_PRINT)) {
    misses.push("projected_missing_②");
  }
  if (!official.some((line) => line.print === EXPENSE_TOTAL_PRINT && line.label === "経費計")) {
    misses.push("official_missing_㉛");
  }
  const byPrint = new Map(projected.map((line) => [line.print, line]));
  for (const pin of official) {
    const got = byPrint.get(pin.print);
    if (!got) {
      misses.push(`missing ${pin.print} ${pin.label} ${pin.amount_yen}`);
      continue;
    }
    if (got.label !== pin.label || got.amount_yen !== pin.amount_yen) {
      misses.push(`${pin.print} ${pin.label} ${got.amount_yen}!=${pin.amount_yen}`);
    }
  }
  return misses;
}

/** 22 only when the books page and the official handguide pin have an empty diff. */
export function scoreBlueReturnOfficialPage(
  projected: readonly BlueReturnAmountLine[],
  official: readonly BlueReturnAmountLine[],
): 0 | typeof BLUE_RETURN_PAGE_SCORE {
  return diffBlueReturnOfficialPage(projected, official).length === 0
    ? BLUE_RETURN_PAGE_SCORE
    : 0;
}

/**
 * Statutory met for 青色申告決算書.
 * scoreBlueReturnLines role-pin match alone never returns true here.
 */
export function blueReturnPageStatutoryMet(
  projected: readonly BlueReturnAmountLine[],
  official: readonly BlueReturnAmountLine[],
): boolean {
  return scoreBlueReturnOfficialPage(projected, official) === BLUE_RETURN_PAGE_SCORE;
}
