import type { z } from "zod";
import {
  fixedAssetsSchema,
  fixedAssetSchema,
  type CashBalance,
} from "./balance-assets.js";
import { chartOfAccountsSchema, journalSourceAccountsSchema } from "./chart-of-accounts.js";
import {
  monthlyFinanceSchema,
  fixedCostsSchema,
  loansSchema,
  businessPlanSchema,
  propertyRevenuePlanSchema,
  loanSchema,
} from "./monthly-loans.js";
import {
  taxProfileSchema,
  taxProfileUsSchema,
  taxProfileCorporateSchema,
  obligationRhythmSchema,
} from "./tax-profiles.js";
import {
  yojitsuLineKind,
  yojitsuLineSchema,
  yojitsuMonthSideSchema,
  yojitsuPlanSchema,
  yojitsuMonthSchema,
} from "./yojitsu.js";

export type { CashBalance };
export type FixedAssets = z.output<typeof fixedAssetsSchema>;
export type FixedAsset = z.output<typeof fixedAssetSchema>;
export type TaxProfile = z.output<typeof taxProfileSchema>;
export type TaxProfileUs = z.output<typeof taxProfileUsSchema>;
export type TaxProfileCorporate = z.output<typeof taxProfileCorporateSchema>;
export type ObligationRhythm = z.output<typeof obligationRhythmSchema>;
export type ChartOfAccounts = z.output<typeof chartOfAccountsSchema>;
export type JournalSourceAccounts = z.output<typeof journalSourceAccountsSchema>;

export type YojitsuLineKind = z.output<typeof yojitsuLineKind>;
export type YojitsuLine = z.output<typeof yojitsuLineSchema>;
export type YojitsuMonthSide = z.output<typeof yojitsuMonthSideSchema>;
export type YojitsuPlanRaw = z.output<typeof yojitsuPlanSchema>;
export type YojitsuMonthRaw = z.output<typeof yojitsuMonthSchema>;

/** 正規化後（months[].plan/actual は常に lines[]） */
export interface YojitsuMonth {
  month: string;
  plan: YojitsuMonthSide;
  actual?: YojitsuMonthSide;
  notes?: string;
}

export type YojitsuPlan = Omit<YojitsuPlanRaw, "months"> & {
  months: YojitsuMonth[];
};

export type MonthlyFinance = z.output<typeof monthlyFinanceSchema>;
export type FixedCosts = z.output<typeof fixedCostsSchema>;
export type Loans = z.output<typeof loansSchema>;
export type BusinessPlan = z.output<typeof businessPlanSchema>;
export type PropertyRevenuePlan = z.output<typeof propertyRevenuePlanSchema>;
export type Loan = z.output<typeof loanSchema>;
