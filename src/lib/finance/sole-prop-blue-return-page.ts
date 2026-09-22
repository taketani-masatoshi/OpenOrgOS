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
