import type {
  Property,
  PropertyRevenuePlan,
  MonthlyFinance,
} from "../../cursor/schemas/index.js";
import { formatCurrency, formatPercent } from "./utils.js";

export interface PropertyAnalysis {
  propertyId: string;
  propertyName: string;
  type: string;
  planned: {
    monthlyRevenue: number;
    annualRevenue: number;
    noi?: number;
    revpar?: number;
  };
  actual: {
    totalRevenue: number;
    totalExpenses: number;
    netIncome: number;
    months: number;
  };
  variance: {
    revenueDiff: number;
    revenueDiffPercent: number;
  };
}

function filterByPropertyAndMonths(
  finances: MonthlyFinance[],
  propertyId: string,
  fromMonth?: string,
  toMonth?: string
): MonthlyFinance[] {
  return finances.filter((f) => {
    if (fromMonth && f.month < fromMonth) return false;
    if (toMonth && f.month > toMonth) return false;
    return true;
  });
}

export function analyzeProperty(
  property: Property,
  plan: PropertyRevenuePlan,
  finances: MonthlyFinance[],
  fromMonth?: string,
  toMonth?: string
): PropertyAnalysis {
  const filtered = filterByPropertyAndMonths(finances, property.id, fromMonth, toMonth);

  const rentalPlan = plan.rental.find((r) => r.property_id === property.id);
  const hotelPlan = plan.hotel.find((h) => h.property_id === property.id);

  let plannedMonthlyRevenue = 0;
  let plannedAnnualRevenue = 0;
  let noi: number | undefined;
  let revpar: number | undefined;

  if (rentalPlan) {
    plannedMonthlyRevenue = rentalPlan.monthly_rent * (1 - rentalPlan.vacancy_rate);
    plannedAnnualRevenue = plannedMonthlyRevenue * 12;
    noi = plannedAnnualRevenue - rentalPlan.management_fee * 12;
  }

  if (hotelPlan) {
    plannedMonthlyRevenue = hotelPlan.room_count * hotelPlan.occupancy_rate * hotelPlan.adr * 30;
    plannedAnnualRevenue = hotelPlan.room_count * hotelPlan.occupancy_rate * hotelPlan.adr * 365;
    revpar = hotelPlan.occupancy_rate * hotelPlan.adr;
  }

  let totalRevenue = 0;
  let totalExpenses = 0;

  for (const f of filtered) {
    totalRevenue += f.revenue
      .filter((r) => r.property_id === property.id)
      .reduce((s, r) => s + r.amount, 0);
    totalExpenses += f.expenses
      .filter((e) => e.property_id === property.id)
      .reduce((s, e) => s + e.amount, 0);
  }

  const months = filtered.length;
  const actualMonthlyRevenue = months > 0 ? totalRevenue / months : 0;
  const revenueDiff = actualMonthlyRevenue - plannedMonthlyRevenue;
  const revenueDiffPercent =
    plannedMonthlyRevenue > 0 ? revenueDiff / plannedMonthlyRevenue : 0;

  return {
    propertyId: property.id,
    propertyName: property.name,
    type: property.type,
    planned: {
      monthlyRevenue: plannedMonthlyRevenue,
      annualRevenue: plannedAnnualRevenue,
      noi,
      revpar,
    },
    actual: {
      totalRevenue,
      totalExpenses,
      netIncome: totalRevenue - totalExpenses,
      months,
    },
    variance: {
      revenueDiff,
      revenueDiffPercent,
    },
  };
}

export function analyzeAllProperties(
  properties: Property[],
  plan: PropertyRevenuePlan,
  finances: MonthlyFinance[],
  propertyId?: string,
  fromMonth?: string,
  toMonth?: string
): PropertyAnalysis[] {
  const targets = propertyId
    ? properties.filter((p) => p.id === propertyId)
    : properties;

  return targets.map((p) => analyzeProperty(p, plan, finances, fromMonth, toMonth));
}

export function formatPropertyAnalysisMarkdown(analyses: PropertyAnalysis[]): string {
  const lines = [
    "# 物件別収益分析",
    "",
  ];

  for (const a of analyses) {
    lines.push(`## ${a.propertyName} (${a.propertyId})`);
    lines.push("");
    lines.push(`- 種別: ${a.type}`);
    lines.push(`- 計画月次収益: ${formatCurrency(a.planned.monthlyRevenue)}`);
    lines.push(`- 計画年間収益: ${formatCurrency(a.planned.annualRevenue)}`);
    if (a.planned.noi !== undefined) {
      lines.push(`- 計画NOI: ${formatCurrency(a.planned.noi)}`);
    }
    if (a.planned.revpar !== undefined) {
      lines.push(`- 計画RevPAR: ${formatCurrency(a.planned.revpar)}`);
    }
    lines.push(`- 実績収益 (${a.actual.months}ヶ月): ${formatCurrency(a.actual.totalRevenue)}`);
    lines.push(`- 実績費用: ${formatCurrency(a.actual.totalExpenses)}`);
    lines.push(`- 実績純利益: ${formatCurrency(a.actual.netIncome)}`);
    lines.push(
      `- 計画差異: ${formatCurrency(a.variance.revenueDiff)}/月 (${formatPercent(a.variance.revenueDiffPercent)})`
    );
    lines.push("");
  }

  return lines.join("\n");
}

export function parsePeriod(period?: string): { from?: string; to?: string } {
  if (!period) return {};

  const quarterMatch = period.match(/^(\d{4})-Q([1-4])$/);
  if (quarterMatch) {
    const year = quarterMatch[1];
    const q = parseInt(quarterMatch[2], 10);
    const startMonth = String((q - 1) * 3 + 1).padStart(2, "0");
    const endMonth = String(q * 3).padStart(2, "0");
    return { from: `${year}-${startMonth}`, to: `${year}-${endMonth}` };
  }

  const yearMatch = period.match(/^(\d{4})$/);
  if (yearMatch) {
    return { from: `${yearMatch[1]}-01`, to: `${yearMatch[1]}-12` };
  }

  return {};
}
