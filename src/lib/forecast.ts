import type {
  MonthlyFinance,
  FixedCosts,
  Loans,
  PropertyRevenuePlan,
  Property,
} from "../../cursor/schemas/index.js";
import {
  addMonths,
  currentMonth,
  formatCurrency,
} from "./utils.js";

export interface ForecastMonth {
  month: string;
  revenue: number;
  expenses: number;
  loanPayments: number;
  netCashFlow: number;
  cumulativeCashFlow: number;
  source: "actual" | "planned";
}

export interface ForecastOptions {
  months: number;
  startMonth?: string;
}

export interface ScenarioOverrides {
  vacancyRate?: number;
  occupancyRate?: number;
  adrChange?: number;
  rentChange?: number;
  interestRateChange?: number;
}

function sumRevenue(finance: MonthlyFinance): number {
  return finance.revenue.reduce((s, r) => s + r.amount, 0);
}

function sumExpenses(finance: MonthlyFinance): number {
  return finance.expenses.reduce((s, e) => s + e.amount, 0);
}

function sumLoanPayments(finance: MonthlyFinance): number {
  return finance.expenses
    .filter((e) => e.category === "loan_payment")
    .reduce((s, e) => s + e.amount, 0);
}

function monthlyFixedCosts(fixedCosts: FixedCosts): number {
  return fixedCosts.items.reduce((s, i) => s + i.monthly_amount, 0);
}

function monthlyLoanPayments(loans: Loans, interestRateChange = 0): number {
  return loans.loans.reduce((s, l) => {
    if (interestRateChange !== 0) {
      const adjustedRate = l.interest_rate + interestRateChange;
      const monthlyInterest = (l.balance * adjustedRate) / 12;
      const principal = Math.max(0, l.monthly_payment - monthlyInterest);
      return s + principal + monthlyInterest;
    }
    return s + l.monthly_payment;
  }, 0);
}

export function plannedMonthlyRevenue(
  plan: PropertyRevenuePlan,
  properties: Property[],
  overrides: ScenarioOverrides = {}
): number {
  let total = 0;

  for (const r of plan.rental) {
    const vacancy = overrides.vacancyRate ?? r.vacancy_rate;
    const rentChange = overrides.rentChange ?? 0;
    const monthlyRent = r.monthly_rent * (1 + rentChange);
    total += monthlyRent * (1 - vacancy);
  }

  for (const h of plan.hotel) {
    const occupancy = overrides.occupancyRate ?? h.occupancy_rate;
    const adrChange = overrides.adrChange ?? 0;
    const adr = h.adr * (1 + adrChange);
    total += h.room_count * occupancy * adr * 30;
  }

  // Include property-level management fees as expense reduction handled separately
  void properties;
  return total;
}

export function plannedMonthlyExpenses(
  plan: PropertyRevenuePlan,
  fixedCosts: FixedCosts
): number {
  const managementFees = plan.rental.reduce((s, r) => s + r.management_fee, 0);
  const propertyOpsEstimate = plan.rental.length * 50000 + plan.hotel.length * 400000;
  return monthlyFixedCosts(fixedCosts) + managementFees + propertyOpsEstimate;
}

export function generateForecast(
  monthlyFinances: MonthlyFinance[],
  fixedCosts: FixedCosts,
  loans: Loans,
  propertyRevenuePlan: PropertyRevenuePlan,
  properties: Property[],
  options: ForecastOptions,
  overrides: ScenarioOverrides = {}
): ForecastMonth[] {
  const startMonth = options.startMonth ?? currentMonth();
  const actualsMap = new Map(monthlyFinances.map((f) => [f.month, f]));
  const plannedRevenue = plannedMonthlyRevenue(propertyRevenuePlan, properties, overrides);
  const plannedExpenses = plannedMonthlyExpenses(propertyRevenuePlan, fixedCosts);
  const plannedLoanPayments = monthlyLoanPayments(loans, overrides.interestRateChange ?? 0);

  const results: ForecastMonth[] = [];
  let cumulative = 0;

  for (let i = 0; i < options.months; i++) {
    const month = addMonths(startMonth, i);
    const actual = actualsMap.get(month);

    let revenue: number;
    let expenses: number;
    let loanPayments: number;
    let source: "actual" | "planned";

    if (actual) {
      revenue = sumRevenue(actual);
      expenses = sumExpenses(actual) - sumLoanPayments(actual);
      loanPayments = sumLoanPayments(actual);
      source = "actual";
    } else {
      revenue = plannedRevenue;
      expenses = plannedExpenses;
      loanPayments = plannedLoanPayments;
      source = "planned";
    }

    const netCashFlow = revenue - expenses - loanPayments;
    cumulative += netCashFlow;

    results.push({
      month,
      revenue,
      expenses,
      loanPayments,
      netCashFlow,
      cumulativeCashFlow: cumulative,
      source,
    });
  }

  return results;
}

export function formatForecastMarkdown(
  forecast: ForecastMonth[],
  title = "キャッシュフロー予測"
): string {
  const lines = [
    `# ${title}`,
    "",
    "| 月 | 収入 | 支出 | 返済 | 純CF | 累計CF | ソース |",
    "|---|---:|---:|---:|---:|---:|---|",
  ];

  for (const f of forecast) {
    lines.push(
      `| ${f.month} | ${formatCurrency(f.revenue)} | ${formatCurrency(f.expenses)} | ${formatCurrency(f.loanPayments)} | ${formatCurrency(f.netCashFlow)} | ${formatCurrency(f.cumulativeCashFlow)} | ${f.source === "actual" ? "実績" : "計画"} |`
    );
  }

  return lines.join("\n");
}

export function formatForecastJson(forecast: ForecastMonth[]): string {
  return JSON.stringify(forecast, null, 2);
}
