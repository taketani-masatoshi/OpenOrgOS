/**
 * Build live form pin collations for Steward Chat without reading tests/fixtures.
 * Companies Act stays unmet (no official printed yen pin).
 * Schedule 4 compares worksheet projection to the product-shipped NTA worked example.
 */
import { resolveDefaultFiscalYear } from "../finance/fiscal-year.js";
import {
  diffSchedule4OfficialExample,
  evaluateTaxAdjustment,
} from "../finance/tax-adjustment.js";
import {
  defaultFormPinCollations,
  type FormPinCollation,
} from "./tax-lines-read-model.js";

export function buildLiveFormPinCollations(): FormPinCollation[] {
  const base = defaultFormPinCollations();
  return base.map((row) => {
    if (row.id === "companies-act-yen") {
      return {
        ...row,
        pinPresent: false,
        projectedReady: false,
        diffCount: 0,
      };
    }
    if (row.id === "schedule4-yen") {
      try {
        const fy = resolveDefaultFiscalYear();
        const worksheet = evaluateTaxAdjustment(fy);
        const diff = diffSchedule4OfficialExample(worksheet.official_lines);
        return {
          ...row,
          pinPresent: true,
          projectedReady: true,
          diffCount: diff.length,
        };
      } catch {
        return {
          ...row,
          pinPresent: true,
          projectedReady: false,
          diffCount: 0,
        };
      }
    }
    return row;
  });
}
