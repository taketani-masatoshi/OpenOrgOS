import type { MonthlyFinance } from "../../schemas/index.js";
import type { Property } from "../../schemas/index.js";
import type { PropertyRevenuePlan } from "../../schemas/index.js";
import { formatCurrency, formatPercent, currentDate } from "./utils.js";
import { analyzeAllProperties } from "./analyze.js";
import { generateForecast, formatForecastMarkdown } from "./forecast.js";
import { scanContractAlerts, formatAlertsMarkdown } from "./alerts.js";
import type { StewardData } from "./data.js";

function sumRevenue(f: MonthlyFinance): number {
  return f.revenue.reduce((s, r) => s + r.amount, 0);
}

function sumExpenses(f: MonthlyFinance): number {
  return f.expenses.reduce((s, e) => s + e.amount, 0);
}

function computeOccupancyRate(
  finances: MonthlyFinance[],
  properties: Property[],
  plan: PropertyRevenuePlan,
  month: string
): number | null {
  const hotelProps = properties.filter((p) => p.type === "hotel" || p.type === "mixed");
  if (hotelProps.length === 0) return null;

  const finance = finances.find((f) => f.month === month);
  if (!finance) return null;

  let totalActual = 0;
  let totalPlanned = 0;

  for (const p of hotelProps) {
    const hotelPlan = plan.hotel.find((h) => h.property_id === p.id);
    if (!hotelPlan) continue;

    const actual = finance.revenue
      .filter((r) => r.property_id === p.id && r.category === "hotel_revenue")
      .reduce((s, r) => s + r.amount, 0);

    const planned = hotelPlan.room_count * hotelPlan.occupancy_rate * hotelPlan.adr * 30;
    totalActual += actual;
    totalPlanned += planned;
  }

  return totalPlanned > 0 ? totalActual / totalPlanned : null;
}

function computeVacancyRate(
  finances: MonthlyFinance[],
  properties: Property[],
  plan: PropertyRevenuePlan,
  month: string
): number | null {
  const rentalProps = properties.filter((p) => p.type === "rental" || p.type === "mixed");
  if (rentalProps.length === 0) return null;

  const finance = finances.find((f) => f.month === month);
  if (!finance) return null;

  let totalActual = 0;
  let totalPlanned = 0;

  for (const p of rentalProps) {
    const rentalPlan = plan.rental.find((r) => r.property_id === p.id);
    if (!rentalPlan) continue;

    const actual = finance.revenue
      .filter((r) => r.property_id === p.id && r.category === "rent")
      .reduce((s, r) => s + r.amount, 0);

    const planned = rentalPlan.monthly_rent * (1 - rentalPlan.vacancy_rate);
    totalActual += actual;
    totalPlanned += planned;
  }

  if (totalPlanned === 0) return null;
  return 1 - totalActual / (totalPlanned / (1 - 0.05));
}

function repairSummary(finance: MonthlyFinance): string {
  const repairs = finance.expenses.filter((e) => e.category === "repair");
  if (repairs.length === 0) return "修繕なし";
  const total = repairs.reduce((s, e) => s + e.amount, 0);
  const details = repairs
    .map((r) => `${r.property_id ?? "共通"}: ${formatCurrency(r.amount)}`)
    .join(", ");
  return `${formatCurrency(total)} (${details})`;
}

export function generateMonthlyReport(data: StewardData, month: string): string {
  const finance = data.monthlyFinances.find((f) => f.month === month);
  const analyses = analyzeAllProperties(
    data.properties,
    data.propertyRevenuePlan,
    data.monthlyFinances,
    undefined,
    month,
    month
  );

  const forecast = generateForecast(
    data.monthlyFinances,
    data.fixedCosts,
    data.loans,
    data.propertyRevenuePlan,
    data.properties,
    { months: 6, startMonth: month }
  );

  const alerts = scanContractAlerts(data.contracts, 90);
  const occupancy = computeOccupancyRate(
    data.monthlyFinances,
    data.properties,
    data.propertyRevenuePlan,
    month
  );
  const vacancy = computeVacancyRate(
    data.monthlyFinances,
    data.properties,
    data.propertyRevenuePlan,
    month
  );

  const lines = [
    `# 月次レポート: ${month}`,
    "",
    `生成日: ${currentDate()}`,
    `会社: ${data.company.name}`,
    "",
    "## サマリー",
    "",
  ];

  if (finance) {
    const revenue = sumRevenue(finance);
    const expenses = sumExpenses(finance);
    const profit = revenue - expenses;
    lines.push(`- 売上: ${formatCurrency(revenue)}`);
    lines.push(`- 費用: ${formatCurrency(expenses)}`);
    lines.push(`- 利益: ${formatCurrency(profit)}`);
    lines.push(`- 修繕状況: ${repairSummary(finance)}`);
  } else {
    lines.push("- 該当月の実績データがありません");
  }

  if (occupancy !== null) {
    lines.push(`- 稼働率 (旅館): ${formatPercent(occupancy)}`);
  }
  if (vacancy !== null) {
    lines.push(`- 空室率 (賃貸): ${formatPercent(vacancy)}`);
  }

  lines.push("");
  lines.push("## 物件別収益");
  lines.push("");
  for (const a of analyses) {
    lines.push(
      `- **${a.propertyName}**: 収益 ${formatCurrency(a.actual.totalRevenue)}, 費用 ${formatCurrency(a.actual.totalExpenses)}, 純利益 ${formatCurrency(a.actual.netIncome)}`
    );
  }

  lines.push("");
  lines.push("## キャッシュフロー予測 (6ヶ月)");
  lines.push("");
  lines.push(formatForecastMarkdown(forecast));

  lines.push("");
  lines.push("## 契約アラート (90日以内)");
  lines.push("");
  lines.push(formatAlertsMarkdown(alerts, 90));

  return lines.join("\n");
}

export function financesSummary(finances: MonthlyFinance[], from: string, to: string) {
  const filtered = finances.filter((f) => f.month >= from && f.month <= to);

  let totalRevenue = 0;
  let totalExpenses = 0;

  for (const f of filtered) {
    totalRevenue += sumRevenue(f);
    totalExpenses += sumExpenses(f);
  }

  return {
    months: filtered.length,
    totalRevenue,
    totalExpenses,
    netIncome: totalRevenue - totalExpenses,
    byMonth: filtered.map((f) => ({
      month: f.month,
      revenue: sumRevenue(f),
      expenses: sumExpenses(f),
      net: sumRevenue(f) - sumExpenses(f),
    })),
  };
}

export function formatFinancesSummaryMarkdown(
  summary: ReturnType<typeof financesSummary>,
  from: string,
  to: string
): string {
  const lines = [
    `# 月次収支サマリー (${from} 〜 ${to})`,
    "",
    `- 対象月数: ${summary.months}`,
    `- 合計売上: ${formatCurrency(summary.totalRevenue)}`,
    `- 合計費用: ${formatCurrency(summary.totalExpenses)}`,
    `- 純利益: ${formatCurrency(summary.netIncome)}`,
    "",
    "| 月 | 売上 | 費用 | 純利益 |",
    "|---|---:|---:|---:|",
  ];

  for (const m of summary.byMonth) {
    lines.push(
      `| ${m.month} | ${formatCurrency(m.revenue)} | ${formatCurrency(m.expenses)} | ${formatCurrency(m.net)} |`
    );
  }

  return lines.join("\n");
}
