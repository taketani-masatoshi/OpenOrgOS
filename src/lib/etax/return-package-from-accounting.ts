import type { TaxAdjustmentWorksheet } from "../finance/tax-adjustment.js";
import { evaluateTaxAdjustment } from "../finance/tax-adjustment.js";
import { sha256Digest } from "./hash.js";
import { createReturnPackage } from "./return-package.js";
import type { ReturnPackage } from "../../../schemas/etax/return-package.js";

export type AccountingBridgeTaxpayer = {
  taxpayerId: string;
  zeimushoCd: string;
  zeimushoNm: string;
  nozeishaId: string;
  nozeishaNm: string;
  nozeishaAdr: string;
};

/**
 * Deterministic RHO0010 payload from a tax-adjustment worksheet.
 * Does not invent taxpayer identity or tax amounts. Does not submit.
 */
export function returnPackageFromTaxAdjustment(input: {
  worksheet: Pick<TaxAdjustmentWorksheet, "fiscal_year" | "as_of" | "taxable_income_yen">;
  taxpayer: AccountingBridgeTaxpayer;
  draftPath: string;
  teishutsuDay: string;
  createdBy: string;
  now?: string;
  id?: string;
}): ReturnPackage {
  const draftHash = sha256Digest(
    JSON.stringify({
      fiscal_year: input.worksheet.fiscal_year,
      as_of: input.worksheet.as_of,
      taxable_income_yen: input.worksheet.taxable_income_yen,
    })
  );
  return createReturnPackage(
    {
      taxpayerId: input.taxpayer.taxpayerId,
      procedureCode: "RHO0010",
      taxYear: input.worksheet.fiscal_year,
      revision: 0,
      createdBy: input.createdBy,
      payload: {
        it: {
          zeimushoCd: input.taxpayer.zeimushoCd,
          zeimushoNm: input.taxpayer.zeimushoNm,
          nozeishaId: input.taxpayer.nozeishaId,
          nozeishaNm: input.taxpayer.nozeishaNm,
          nozeishaAdr: input.taxpayer.nozeishaAdr,
          procedureCd: "RHO0010",
          sakuseiDay: input.worksheet.as_of,
        },
        hoa110: { teishutsuDay: input.teishutsuDay },
        adjustment: { taxableIncomeYen: input.worksheet.taxable_income_yen },
      },
      sourceReferences: [
        {
          kind: "corporate_tax_xml_draft",
          path: input.draftPath,
          content_hash: draftHash,
        },
      ],
    },
    { now: input.now, id: input.id }
  );
}

/** Reads the worksheet from the ledger. Caller supplies taxpayer identity; this function does not invent it. */
export function buildReturnPackageFromAccounting(input: {
  fiscalYear: string;
  taxpayer: AccountingBridgeTaxpayer;
  createdBy: string;
  draftPath?: string;
  now?: string;
  id?: string;
}): ReturnPackage {
  const worksheet = evaluateTaxAdjustment(input.fiscalYear);
  return returnPackageFromTaxAdjustment({
    worksheet,
    taxpayer: input.taxpayer,
    draftPath: input.draftPath ?? `docs/company/tax/${input.fiscalYear}-corporate-tax-draft.xml`,
    teishutsuDay: worksheet.as_of,
    createdBy: input.createdBy,
    now: input.now,
    id: input.id,
  });
}
