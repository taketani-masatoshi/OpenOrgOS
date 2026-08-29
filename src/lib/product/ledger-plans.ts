import type { LedgerPlanId } from "../../../schemas/product/ledger-product.js";

export type LedgerPlan = {
  id: LedgerPlanId;
  name: string;
  monthly_jpy: number;
  journal_limit_per_month: number | null;
  includes_bank: boolean;
  trial_days: number;
  stripe_price_env: string;
};

export const LEDGER_PLANS: Record<LedgerPlanId, LedgerPlan> = {
  starter: {
    id: "starter",
    name: "Starter",
    monthly_jpy: 29800,
    journal_limit_per_month: 500,
    includes_bank: false,
    trial_days: 14,
    stripe_price_env: "STRIPE_PRICE_STARTER",
  },
  business: {
    id: "business",
    name: "Business",
    monthly_jpy: 59800,
    journal_limit_per_month: null,
    includes_bank: true,
    trial_days: 14,
    stripe_price_env: "STRIPE_PRICE_BUSINESS",
  },
  accountant: {
    id: "accountant",
    name: "Accountant",
    monthly_jpy: 99800,
    journal_limit_per_month: null,
    includes_bank: true,
    trial_days: 14,
    stripe_price_env: "STRIPE_PRICE_ACCOUNTANT",
  },
};

export function listLedgerPlans(): LedgerPlan[] {
  return Object.values(LEDGER_PLANS);
}

export function resolveLedgerPlan(planId: string): LedgerPlan {
  const plan = LEDGER_PLANS[planId as LedgerPlanId];
  if (!plan) {
    throw new Error(`Unknown plan "${planId}" — use starter | business | accountant`);
  }
  return plan;
}
