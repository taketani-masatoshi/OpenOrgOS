/**
 * Build OfficialAnnexLine rows for tax-adjustment worksheets.
 */
import {
  BETSU1_LOCAL_BASE_LABEL,
  BETSU1_LOCAL_TAX_LABEL,
  FORM_BETSU_1,
  FORM_BETSU_1_LEAF,
  FORM_BETSU_5_1,
  LEAF_LOCAL_BASE_LABEL,
  LEAF_LOCAL_TAX_LABEL,
  LEAF_REDUCED_BASE_LABEL,
  LEAF_REDUCED_TAX_LABEL,
  LEAF_RESIDUAL_BASE_LABEL,
  LEAF_RESIDUAL_TAX_LABEL,
  ROW_CARRYOVER_EARNINGS,
  ROW_CORPORATE_TAX,
  ROW_CURRENT_PROFIT,
  ROW_DEPRECIATION_EXCESS,
  ROW_ENTERTAINMENT_EXCESS,
  ROW_LEAF_LOCAL_BASE,
  ROW_LEAF_LOCAL_TAX,
  ROW_LOCAL_CORPORATE_TAX,
  ROW_LOCAL_TAX_BASE,
  ROW_REDUCED_BASE,
  ROW_REDUCED_TAX,
  ROW_RESIDUAL_BASE,
  ROW_RESIDUAL_TAX,
  ROW_RETAINED_TOTAL,
  ROW_RETURN_INCOME,
  ROW_TAXABLE_INCOME,
  SCHEDULE_4_LINES,
  type OfficialAnnexColumn,
  type OfficialAnnexLine,
  type TaxAdjustmentWorksheetLine,
} from "./corporate-tax-annex.js";
import { betsu4, schedule4Amount } from "./schedule4-pin.js";
import {
  localCorporateTaxAmountYen,
  localCorporateTaxBaseYen,
} from "./schedule1-pin.js";
import type { NationalCorporateTax } from "./tax-adjustment-national.js";

export type RetainedRollforward = {
  opening_yen: number;
  net_income_yen: number;
  dividend_yen: number;
  capital_yen: number;
  closing_yen: number;
};

export function betsu5(
  row: string,
  col: OfficialAnnexColumn,
  label: string,
  amountYen: number,
): OfficialAnnexLine {
  return { form: FORM_BETSU_5_1, row, col, label, amount_yen: amountYen };
}

export function officialAnnexLines(input: {
  starting: number;
  depreciationExcess: number;
  entertainmentExcess: number;
  mappedExplicit: TaxAdjustmentWorksheetLine[];
  totalsReady: boolean;
  schedule4: Map<string, number> | null;
  retained: RetainedRollforward;
  tax: NationalCorporateTax;
}): OfficialAnnexLine[] {
  const rows: OfficialAnnexLine[] = [];
  if (input.schedule4) {
    for (const line of SCHEDULE_4_LINES) {
      rows.push(
        betsu4(line.row, line.label, schedule4Amount(input.schedule4, line.row)),
      );
    }
  } else {
    rows.push(
      betsu4(ROW_CURRENT_PROFIT, "当期利益又は当期欠損の額", input.starting),
    );
    if (input.depreciationExcess > 0) {
      rows.push(
        betsu4(
          ROW_DEPRECIATION_EXCESS,
          "減価償却の償却超過額",
          input.depreciationExcess,
        ),
      );
    }
    if (input.entertainmentExcess > 0) {
      rows.push(
        betsu4(
          ROW_ENTERTAINMENT_EXCESS,
          "交際費等の損金不算入額",
          input.entertainmentExcess,
        ),
      );
    }
    for (const line of input.mappedExplicit) {
      if (!line.row) continue;
      rows.push(betsu4(line.row, line.label, line.amount_yen));
    }
  }
  if (input.retained.capital_yen === 0) {
    const opening = input.retained.opening_yen;
    const decrease = input.retained.dividend_yen;
    const increase = input.retained.net_income_yen;
    const closing = opening - decrease + increase;
    rows.push(
      betsu5(ROW_CARRYOVER_EARNINGS, "1", "繰越損益金・期首現在利益積立金額", opening),
      betsu5(ROW_CARRYOVER_EARNINGS, "2", "繰越損益金・当期の減", decrease),
      betsu5(ROW_CARRYOVER_EARNINGS, "3", "繰越損益金・当期の増", increase),
      betsu5(
        ROW_CARRYOVER_EARNINGS,
        "4",
        "繰越損益金・差引翌期首現在利益積立金額",
        closing,
      ),
      betsu5(ROW_RETAINED_TOTAL, "1", "差引合計額・期首現在利益積立金額", opening),
      betsu5(ROW_RETAINED_TOTAL, "2", "差引合計額・当期の減", decrease),
      betsu5(ROW_RETAINED_TOTAL, "3", "差引合計額・当期の増", increase),
      betsu5(
        ROW_RETAINED_TOTAL,
        "4",
        "差引合計額・差引翌期首現在利益積立金額",
        closing,
      ),
    );
  }
  if (
    !input.totalsReady ||
    input.tax.corporate_tax_yen == null ||
    input.schedule4 == null
  )
    return rows;
  const income = schedule4Amount(input.schedule4, ROW_TAXABLE_INCOME);
  rows.push({
    form: FORM_BETSU_1,
    row: ROW_RETURN_INCOME,
    label: "所得金額又は欠損金額",
    amount_yen: income,
  });
  rows.push({
    form: FORM_BETSU_1,
    row: ROW_CORPORATE_TAX,
    label: "所得の金額に対する法人税額",
    amount_yen: input.tax.corporate_tax_yen,
  });
  rows.push({
    form: FORM_BETSU_1,
    row: ROW_LOCAL_TAX_BASE,
    label: BETSU1_LOCAL_BASE_LABEL,
    amount_yen: input.tax.corporate_tax_yen,
  });
  const localAmount = localCorporateTaxAmountYen(input.tax.corporate_tax_yen);
  rows.push({
    form: FORM_BETSU_1,
    row: ROW_LOCAL_CORPORATE_TAX,
    label: BETSU1_LOCAL_TAX_LABEL,
    amount_yen: localAmount,
  });
  if (
    input.tax.reduced_rate === true &&
    input.tax.reduced_base_yen != null &&
    input.tax.reduced_base_yen > 0 &&
    input.tax.reduced_tax_yen != null &&
    input.tax.residual_base_yen != null &&
    input.tax.residual_tax_yen != null
  ) {
    rows.push(
      {
        form: FORM_BETSU_1_LEAF,
        row: ROW_REDUCED_BASE,
        label: LEAF_REDUCED_BASE_LABEL,
        amount_yen: input.tax.reduced_base_yen,
      },
      {
        form: FORM_BETSU_1_LEAF,
        row: ROW_REDUCED_TAX,
        label: LEAF_REDUCED_TAX_LABEL,
        amount_yen: input.tax.reduced_tax_yen,
      },
      {
        form: FORM_BETSU_1_LEAF,
        row: ROW_RESIDUAL_BASE,
        label: LEAF_RESIDUAL_BASE_LABEL,
        amount_yen: input.tax.residual_base_yen,
      },
      {
        form: FORM_BETSU_1_LEAF,
        row: ROW_RESIDUAL_TAX,
        label: LEAF_RESIDUAL_TAX_LABEL,
        amount_yen: input.tax.residual_tax_yen,
      },
    );
  }
  rows.push(
    {
      form: FORM_BETSU_1_LEAF,
      row: ROW_LEAF_LOCAL_BASE,
      label: LEAF_LOCAL_BASE_LABEL,
      amount_yen: localCorporateTaxBaseYen(input.tax.corporate_tax_yen),
    },
    {
      form: FORM_BETSU_1_LEAF,
      row: ROW_LEAF_LOCAL_TAX,
      label: LEAF_LOCAL_TAX_LABEL,
      amount_yen: localAmount,
    },
  );
  return rows;
}
