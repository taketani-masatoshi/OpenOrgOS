/**
 * 別表四相当の税務調整。渡された行だけを当期純利益に載せる。
 * テナント文書は読まない。税理士判断は行として渡される。
 */
import {
  corporateTaxAdjustmentLinesSchema,
  type CorporateTaxAdjustmentLine,
} from "../../../schemas/finance/tax-adjustments.js";

export type CorporateTaxAdjustments = {
  net_income_yen: number;
  add_backs_yen: number;
  subtractions_yen: number;
  taxable_income_yen: number;
  advisor_pending: string[];
  adjustments_absent: boolean;
};

export function buildCorporateTaxAdjustments(input: {
  netIncomeYen: number;
  lines: CorporateTaxAdjustmentLine[];
}): CorporateTaxAdjustments {
  if (!Number.isInteger(input.netIncomeYen)) {
    throw new Error("netIncomeYen must be an integer yen amount");
  }
  const lines = corporateTaxAdjustmentLinesSchema.parse(input.lines);
  let addBacks = 0;
  let subtractions = 0;
  const advisorPending: string[] = [];
  for (const line of lines) {
    if (line.status === "pending") {
      advisorPending.push(line.code);
      continue;
    }
    if (line.direction === "add") addBacks += line.amount_yen;
    else subtractions += line.amount_yen;
  }
  return {
    net_income_yen: input.netIncomeYen,
    add_backs_yen: addBacks,
    subtractions_yen: subtractions,
    taxable_income_yen: input.netIncomeYen + addBacks - subtractions,
    advisor_pending: advisorPending,
    adjustments_absent: lines.length === 0,
  };
}
