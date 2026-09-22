/**
 * Sole-proprietorship income worksheet. Starts from the blue-return income amount.
 * Read-only. Does not post journals.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import { z } from "zod";
import { getDataDir } from "../utils.js";
import { buildSolePropBlueReturn } from "./sole-prop-blue-return.js";

const lineSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["add", "subtract"]),
  amount_yen: z.number().int().nonnegative(),
  label: z.string().min(1),
});

const fileSchema = z.object({
  fiscal_year: z.string().regex(/^FY\d{4}$/),
  lines: z.array(lineSchema).default([]),
});

export type SolePropIncomeAdjustmentWorksheet = {
  fiscal_year: string;
  can_compute: boolean;
  starting_business_income_yen: number | null;
  adjusted_business_income_yen: number | null;
  errors: string[];
};

export function evaluateSolePropIncomeAdjustment(
  fiscalYear: string,
): SolePropIncomeAdjustmentWorksheet {
  const blue = buildSolePropBlueReturn(fiscalYear);
  if (blue.status !== "ready" || blue.income_yen == null) {
    return {
      fiscal_year: fiscalYear,
      can_compute: false,
      starting_business_income_yen: null,
      adjusted_business_income_yen: null,
      errors: blue.blockers.length > 0 ? blue.blockers : ["blue return is not ready"],
    };
  }

  const path = join(getDataDir(), "finance", "sole-prop-income-lines.yaml");
  let delta = 0;
  if (existsSync(path)) {
    const parsed = fileSchema.safeParse(YAML.parse(readFileSync(path, "utf-8")));
    if (!parsed.success) {
      return {
        fiscal_year: fiscalYear,
        can_compute: false,
        starting_business_income_yen: null,
        adjusted_business_income_yen: null,
        errors: ["income adjustments invalid"],
      };
    }
    if (parsed.data.fiscal_year !== fiscalYear) {
      return {
        fiscal_year: fiscalYear,
        can_compute: false,
        starting_business_income_yen: null,
        adjusted_business_income_yen: null,
        errors: ["income adjustments fiscal year mismatch"],
      };
    }
    for (const line of parsed.data.lines) {
      delta += line.kind === "add" ? line.amount_yen : -line.amount_yen;
    }
  }

  return {
    fiscal_year: fiscalYear,
    can_compute: true,
    starting_business_income_yen: blue.income_yen,
    adjusted_business_income_yen: blue.income_yen + delta,
    errors: [],
  };
}
