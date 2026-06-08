import type { Contract, MonthlyFinance } from "../../schemas/index.js";
import type { StewardData } from "./data.js";
import {
  loadAllData,
  loadYojitsuFyPlan,
  loadExpensePlan,
  loadCashBalance,
  loadDebtPlan,
  loadPayroll,
  resolveCashBalanceTotal,
} from "./data.js";
import {
  resolveYojitsuMonthSide,
  sumAllOutflows,
  sumOperatingExpenses,
  sumRevenue as sumYojitsuRevenue,
} from "./yojitsu-normalize.js";
import { scanContractAlerts, type ContractAlert } from "./alerts.js";
import {
  plannedMonthlyRevenue,
  plannedMonthlyExpenses,
  generateForecast,
  monthlyLoanPayments,
} from "./forecast.js";
import { listPendingInbox } from "./document-io.js";
import {
  currentDate,
  currentMonth,
  daysBetween,
  formatCurrency,
  formatPercent,
  monthRange,
  parseMonth,
} from "./utils.js";

export type TaskUrgency = "high" | "medium";
export type TaskImportance = "high" | "medium";

export interface DashboardTask {
  id: string;
  title: string;
  category: string;
  urgency: TaskUrgency;
  importance: TaskImportance;
  dueDate?: string;
  daysRemaining?: number;
  link?: string;
  notes?: string;
}

export interface CashFlowMetrics {
  cashBalance: number | null;
  runwayMonths: number | null;
  /** 支出+返済−収入。正=キャッシュ消耗、負=キャッシュ増 */
  burnRate: number;
  cashFlowMode: "surplus" | "deficit" | "break_even";
  /** 黒字時の月次キャッシュ増（burnRate<0 の絶対値） */
  monthlyCashSurplus: number;
  /** 赤字時の月次ネットバーン（burnRate>0） */
  monthlyNetBurn: number;
  /** 内部目標現預金（既定 1,000万円）到達までの月数。黒字・残高確定時のみ */
  monthsToCashTarget: number | null;
  /** 直近 N ヶ月のキャッシュ増減見込み */
  projectedCashChange: number;
  /** 現預金 + projectedCashChange。残高確定時のみ */
  projectedCashBalance: number | null;
  cashTargetAmount: number;
  liquidityProjectionMonths: number;
  monthlyRevenue: number;
  monthlyExpenses: number;
  monthlyLoanPayments: number;
  monthlyProfit: number;
  fixedCosts: number;
  variableCosts: number;
  breakEvenRevenue: number | null;
  contributionMargin: number | null;
  source: "actual" | "planned" | "yojitsu";
  basisMonth: string;
  notes: string[];
}

export interface KpiItem {
  id: string;
  label: string;
  value: string;
  explanation: string;
  trend?: string;
}

export interface MonthlyTrendPoint {
  month: string;
  revenue: number;
  expenses: number;
  net: number;
  notes?: string;
}

export type PaymentCategory = "固定費" | "給与" | "借入返済" | "契約";
export type PaymentRecurrence = "monthly" | "annual" | "once";

export interface UpcomingPayment {
  id: string;
  title: string;
  category: PaymentCategory;
  amount: number | null;
  dueDate: string;
  daysRemaining: number;
  recurrence: PaymentRecurrence;
  source: string;
  notes?: string;
  relatedTaskId?: string;
}

export interface DashboardReport {
  generatedAt: string;
  reportDate: string;
  fiscalYear: string;
  companyName: string;
  cashFlow: CashFlowMetrics;
  upcomingPayments: UpcomingPayment[];
  highImportanceTasks: DashboardTask[];
  highUrgencyTasks: DashboardTask[];
  kpis: KpiItem[];
  monthlyTrend: MonthlyTrendPoint[];
  monthlyTrendNarrative: string[];
  tbdItems: string[];
}

export const DEFAULT_CASH_TARGET = 10_000_000;
export const LIQUIDITY_PROJECTION_MONTHS = 3;

export interface LiquidityOutlook {
  mode: CashFlowMetrics["cashFlowMode"];
  primaryLabel: string;
  primaryValue: string;
  primaryNote: string;
  netCashFlowLabel: string;
  netCashFlowValue: string;
  netCashFlowNote: string;
}

export function monthlyCashSurplus(burnRate: number): number {
  return burnRate < 0 ? -burnRate : 0;
}

export function monthlyNetBurn(burnRate: number): number {
  return burnRate > 0 ? burnRate : 0;
}

export function resolveCashFlowMode(burnRate: number): CashFlowMetrics["cashFlowMode"] {
  if (burnRate < 0) return "surplus";
  if (burnRate > 0) return "deficit";
  return "break_even";
}

export function buildLiquidityOutlook(cf: CashFlowMetrics): LiquidityOutlook {
  const { cashTargetAmount, liquidityProjectionMonths: months } = cf;

  if (cf.cashFlowMode === "surplus") {
    let primaryValue: string;
    let primaryNote: string;

    if (cf.cashBalance !== null && cf.cashBalance >= cashTargetAmount) {
      primaryValue = `目標達成（${formatCurrency(cf.cashBalance)}）`;
      primaryNote = `内部目標 ${formatCurrency(cashTargetAmount)} 以上`;
    } else if (cf.monthsToCashTarget !== null) {
      primaryValue = `${formatCurrency(cf.projectedCashChange)}（${months}ヶ月）`;
      primaryNote = `目標 ${formatCurrency(cashTargetAmount)} まで ${cf.monthsToCashTarget.toFixed(1)} ヶ月`;
      if (cf.projectedCashBalance !== null) {
        primaryNote += ` · ${months}ヶ月後見込 ${formatCurrency(cf.projectedCashBalance)}`;
      }
    } else {
      primaryValue = `${formatCurrency(cf.projectedCashChange)}（${months}ヶ月）`;
      primaryNote = "現預金未確定 — 月次キャッシュ増の累積見込み";
    }

    return {
      mode: "surplus",
      primaryLabel: "資金見通し",
      primaryValue,
      primaryNote,
      netCashFlowLabel: "月次キャッシュ増",
      netCashFlowValue: formatCurrency(cf.monthlyCashSurplus),
      netCashFlowNote: "収入 − 支出 − 返済（黒字運転）",
    };
  }

  if (cf.cashFlowMode === "deficit") {
    return {
      mode: "deficit",
      primaryLabel: "ランウェイ",
      primaryValue: cf.runwayMonths !== null ? `${cf.runwayMonths.toFixed(1)} ヶ月` : "TBD",
      primaryNote:
        cf.runwayMonths !== null
          ? "現預金 ÷ ネットバーン"
          : "cash-balance.yaml 確定後",
      netCashFlowLabel: "ネットバーン",
      netCashFlowValue: formatCurrency(cf.monthlyNetBurn),
      netCashFlowNote: "月次のキャッシュ流出",
    };
  }

  return {
    mode: "break_even",
    primaryLabel: "ランウェイ",
    primaryValue: cf.cashBalance !== null ? "収支均衡" : "TBD",
    primaryNote: "収支トントン — 現預金残高の維持が焦点",
    netCashFlowLabel: "月次ネットCF",
    netCashFlowValue: formatCurrency(0),
    netCashFlowNote: "収入 ≒ 支出",
  };
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

export function resolveFiscalYear(fiscalYearEndMonth: number, refMonth = currentMonth()): string {
  const { year, month } = parseMonthParts(refMonth);
  const fyStartMonth = fiscalYearEndMonth === 12 ? 1 : fiscalYearEndMonth + 1;
  const fyYear = month >= fyStartMonth ? year : year - 1;
  return `FY${fyYear}`;
}

function parseMonthParts(month: string): { year: number; month: number } {
  const [y, m] = month.split("-").map(Number);
  return { year: y, month: m };
}

function monthlyFixedFromYaml(data: StewardData): number {
  const fromItems = data.fixedCosts.items.reduce((s, i) => s + i.monthly_amount, 0);
  const annualAmortized = data.fixedCosts.items.reduce(
    (s, i) => s + (i.annual_amount ? i.annual_amount / 12 : 0),
    0
  );
  return fromItems + annualAmortized;
}

function monthlyDepreciation(data: StewardData, fiscalYear: string): number {
  const plan = loadExpensePlan();
  const fy = plan.years.find((y) => y.fiscal_year === fiscalYear);
  const dep = fy?.lines.find((l) => l.id === "depreciation");
  return dep ? dep.amount / 12 : 0;
}

function computeCashFlowMetrics(data: StewardData, fiscalYear: string): CashFlowMetrics {
  const notes: string[] = [];
  const loanPayments = monthlyLoanPayments(data.loans);
  const fixedBase = monthlyFixedFromYaml(data);
  const depreciation = monthlyDepreciation(data, fiscalYear);
  const fixedCosts = fixedBase + loanPayments + depreciation;

  const latestActual = data.monthlyFinances.at(-1);
  const plannedRevenue = plannedMonthlyRevenue(data.propertyRevenuePlan, data.properties);
  const plannedExpenses = plannedMonthlyExpenses(data.propertyRevenuePlan, data.fixedCosts);
  const variableFromPlan = Math.max(0, plannedExpenses - fixedBase);

  let monthlyRevenue: number;
  let monthlyExpenses: number;
  let monthlyLoan: number;
  let source: CashFlowMetrics["source"];
  let basisMonth: string;

  if (latestActual) {
    monthlyRevenue = sumRevenue(latestActual);
    monthlyExpenses = sumExpenses(latestActual) - sumLoanPayments(latestActual);
    monthlyLoan = sumLoanPayments(latestActual);
    source = "actual";
    basisMonth = latestActual.month;
    if (monthlyRevenue === 0 && monthlyExpenses <= depreciation) {
      notes.push(`実績 ${basisMonth} は片寄りデータのため、計画値も併記推奨`);
    }
  } else {
    monthlyRevenue = plannedRevenue;
    monthlyExpenses = plannedExpenses;
    monthlyLoan = loanPayments;
    source = "planned";
    basisMonth = currentMonth();
    notes.push("月次実績なし — 計画ベースで算出");
  }

  const yojitsu = loadYojitsuFyPlan(fiscalYear);
  if (yojitsu?.months.length) {
    const operatingMonths = yojitsu.months.filter((m) => {
      const rev = sumYojitsuRevenue(resolveYojitsuMonthSide(m));
      return rev > 0;
    });
    if (operatingMonths.length && source === "actual" && monthlyRevenue < plannedRevenue * 0.5) {
      const last = operatingMonths[operatingMonths.length - 1];
      const side = resolveYojitsuMonthSide(last);
      monthlyRevenue = sumYojitsuRevenue(side);
      monthlyExpenses = sumOperatingExpenses(side);
      monthlyLoan = loanPayments;
      source = "yojitsu";
      basisMonth = last.month;
      notes.push(`予実計画 ${basisMonth} をベースに補正`);
    }
  }

  const variableCosts =
    source === "yojitsu"
      ? Math.max(0, monthlyExpenses - fixedBase - depreciation)
      : variableFromPlan;

  const monthlyProfit = monthlyRevenue - monthlyExpenses - monthlyLoan;
  const burnRate = monthlyExpenses + monthlyLoan - monthlyRevenue;
  const cashFlowMode = resolveCashFlowMode(burnRate);
  const surplus = monthlyCashSurplus(burnRate);
  const netBurn = monthlyNetBurn(burnRate);
  const projectedCashChange =
    cashFlowMode === "surplus"
      ? surplus * LIQUIDITY_PROJECTION_MONTHS
      : cashFlowMode === "deficit"
        ? -netBurn * LIQUIDITY_PROJECTION_MONTHS
        : 0;

  const contributionMargin =
    monthlyRevenue > 0 ? (monthlyRevenue - variableCosts) / monthlyRevenue : null;
  const breakEvenRevenue =
    contributionMargin && contributionMargin > 0
      ? fixedCosts / contributionMargin
      : null;

  let cashBalance: number | null = null;
  const cashData = loadCashBalance();
  if (cashData) {
    const total = resolveCashBalanceTotal(cashData);
    if (total != null && cashData.status === "confirmed") {
      cashBalance = total;
      notes.push(`現預金残高: ${cashData.as_of} 時点 ${total.toLocaleString("ja-JP")}円`);
    } else if (total != null) {
      notes.push("現預金: 金額入力済み — status を confirmed にするとランウェイ算出");
    } else {
      notes.push("現預金: cash-balance.yaml テンプレート — 金額入力待ち");
    }
  } else {
    notes.push("現預金残高: cash-balance.yaml 未作成 — runway 算出不可");
  }

  let runwayMonths: number | null = null;
  let monthsToCashTarget: number | null = null;
  let projectedCashBalance: number | null = null;

  if (cashBalance !== null && burnRate > 0) {
    runwayMonths = cashBalance / burnRate;
  }

  if (cashBalance !== null) {
    projectedCashBalance = cashBalance + projectedCashChange;
    if (surplus > 0 && cashBalance < DEFAULT_CASH_TARGET) {
      monthsToCashTarget = (DEFAULT_CASH_TARGET - cashBalance) / surplus;
    }
  }

  if (cashFlowMode === "surplus") {
    notes.push(
      `黒字運転 — ${LIQUIDITY_PROJECTION_MONTHS}ヶ月キャッシュ増見込 ${formatCurrency(projectedCashChange)}`
    );
    if (monthsToCashTarget !== null) {
      notes.push(
        `内部目標 ${formatCurrency(DEFAULT_CASH_TARGET)} まで ${monthsToCashTarget.toFixed(1)} ヶ月`
      );
    }
  }

  return {
    cashBalance,
    runwayMonths,
    burnRate,
    cashFlowMode,
    monthlyCashSurplus: surplus,
    monthlyNetBurn: netBurn,
    monthsToCashTarget,
    projectedCashChange,
    projectedCashBalance,
    cashTargetAmount: DEFAULT_CASH_TARGET,
    liquidityProjectionMonths: LIQUIDITY_PROJECTION_MONTHS,
    monthlyRevenue,
    monthlyExpenses,
    monthlyLoanPayments: monthlyLoan,
    monthlyProfit,
    fixedCosts,
    variableCosts,
    breakEvenRevenue,
    contributionMargin,
    source,
    basisMonth,
    notes,
  };
}

function draftInsuranceTasks(contracts: Contract[]): DashboardTask[] {
  return contracts
    .filter((c) => c.status === "draft" && c.type === "insurance")
    .map((c) => ({
      id: c.id,
      title: `${c.name} — 加入手続`,
      category: "保険",
      urgency: "high" as const,
      importance: "high" as const,
      dueDate: c.start_date,
      link: c.documents?.enrollment ?? c.documents?.draft,
      notes: c.risk?.notes ?? c.notes,
    }));
}

function alertToTask(alert: ContractAlert): DashboardTask {
  const urgency: TaskUrgency =
    alert.riskLevel === "high" || alert.daysRemaining <= 30 ? "high" : "medium";
  const importance: TaskImportance = alert.riskLevel === "high" ? "high" : "medium";
  return {
    id: alert.contractId,
    title: `${alert.contractName}（${alertTypeLabel(alert.alertType)}）`,
    category: "契約期限",
    urgency,
    importance,
    dueDate: alert.deadline,
    daysRemaining: alert.daysRemaining,
    link: `data/contracts/${alert.contractId}.yaml`,
    notes: alert.notes,
  };
}

function alertTypeLabel(type: ContractAlert["alertType"]): string {
  switch (type) {
    case "end_date":
      return "契約終了";
    case "renewal_deadline":
      return "更新期限";
    case "termination_deadline":
      return "解約期限";
  }
}

function inboxTasks(): DashboardTask[] {
  return listPendingInbox().map((item) => ({
    id: item.id,
    title: item.title,
    category: `Inbox/${item.category}`,
    urgency: "high" as const,
    importance: "medium" as const,
    dueDate: item.received_at,
    link: item.path,
    notes: item.notes,
  }));
}

function roadmapTbdTasks(): DashboardTask[] {
  const items: DashboardTask[] = [
    {
      id: "TBD-FUNDING",
      title: "役員貸付返済スケジュール・利息条件の整理",
      category: "資金計画",
      urgency: "medium",
      importance: "high",
      link: "data/plans/business-plan.yaml",
      notes: "business-plan funding_plan に TBD 記載",
    },
    {
      id: "TBD-CASH",
      title: "cash-balance.yaml に現預金残高を入力",
      category: "財務データ",
      urgency: "medium",
      importance: "high",
      link: "data/finance/cash-balance.yaml",
      notes: "テンプレート作成済み — 金額入力後 status: confirmed",
    },
  ];
  return items;
}

export function collectTasks(data: StewardData, alertDays = 90): DashboardTask[] {
  const alerts = scanContractAlerts(data.contracts, alertDays);
  const tasks: DashboardTask[] = [
    ...draftInsuranceTasks(data.contracts),
    ...alerts.map(alertToTask),
    ...inboxTasks(),
    ...roadmapTbdTasks(),
  ];

  const seen = new Set<string>();
  return tasks.filter((t) => {
    const key = `${t.id}:${t.title}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildMonthlyTrend(fiscalYear: string): MonthlyTrendPoint[] {
  const yojitsu = loadYojitsuFyPlan(fiscalYear);
  if (!yojitsu) return [];

  return yojitsu.months.map((m) => {
    const side = resolveYojitsuMonthSide(m);
    const revenue = sumYojitsuRevenue(side);
    const expenses = sumAllOutflows(side);
    return {
      month: m.month,
      revenue,
      expenses,
      net: revenue - expenses,
      notes: m.notes,
    };
  });
}

function buildTrendNarrative(trend: MonthlyTrendPoint[]): string[] {
  if (trend.length === 0) {
    return ["予実データなし — `data/plans/yojitsu-*.yaml` を整備してください。"];
  }

  const lines: string[] = [];
  const firstHotel = trend.find((t) => t.revenue > 100000);
  const hotelMonth = trend.find((t) => t.notes?.includes("開業"));
  if (hotelMonth) {
    lines.push(
      `${hotelMonth.month} より亀沢旅館開業。月次売上 ${formatCurrency(hotelMonth.revenue)} 水準へ。`
    );
  } else if (firstHotel) {
    lines.push(`稼働月は ${firstHotel.month} から。`);
  }

  const capexMonths = trend.filter((t) => t.expenses > t.revenue * 5);
  if (capexMonths.length) {
    lines.push(
      `${capexMonths.map((t) => t.month).join("・")} は設備投資（capex）集中 — 単月赤字は計画内。`
    );
  }

  const operating = trend.filter((t) => t.revenue > 0 && t.expenses < t.revenue * 3);
  if (operating.length >= 2) {
    const last = operating[operating.length - 1];
    const prev = operating[operating.length - 2];
    const revDelta = last.revenue - prev.revenue;
    if (revDelta !== 0) {
      lines.push(
        `直近稼働月 ${last.month}: 売上 ${formatCurrency(last.revenue)}（前月比 ${revDelta >= 0 ? "+" : ""}${formatCurrency(revDelta)}）。`
      );
    } else {
      lines.push(`直近稼働月 ${last.month}: 売上 ${formatCurrency(last.revenue)}・純増減 ${formatCurrency(last.net)}。`);
    }
  }

  const totalRev = trend.reduce((s, t) => s + t.revenue, 0);
  const totalNet = trend.reduce((s, t) => s + t.net, 0);
  lines.push(
    `期間合計: 売上 ${formatCurrency(totalRev)} / 純増減 ${formatCurrency(totalNet)}（設備投資含む）。`
  );

  return lines;
}

function buildKpis(
  data: StewardData,
  cashFlow: CashFlowMetrics,
  fiscalYear: string
): KpiItem[] {
  const yojitsu = loadYojitsuFyPlan(fiscalYear);
  const forecast = generateForecast(
    data.monthlyFinances,
    data.fixedCosts,
    data.loans,
    data.propertyRevenuePlan,
    data.properties,
    { months: 6 }
  );
  const avgNet =
    forecast.reduce((s, f) => s + f.netCashFlow, 0) / Math.max(forecast.length, 1);

  const hotelPlan = data.propertyRevenuePlan.hotel[0];
  const rentalPlan = data.propertyRevenuePlan.rental[0];
  const liquidity = buildLiquidityOutlook(cashFlow);

  const kpis: KpiItem[] = [
    {
      id: "liquidity",
      label: liquidity.primaryLabel,
      value: liquidity.primaryValue,
      explanation: liquidity.primaryNote,
      trend:
        cashFlow.cashFlowMode === "surplus" && cashFlow.projectedCashBalance !== null
          ? `${cashFlow.liquidityProjectionMonths}ヶ月後 ${formatCurrency(cashFlow.projectedCashBalance)}`
          : cashFlow.cashFlowMode === "deficit" && cashFlow.burnRate > 0
            ? "要監視"
            : undefined,
    },
    {
      id: "net_cash_flow",
      label: liquidity.netCashFlowLabel,
      value: liquidity.netCashFlowValue,
      explanation: liquidity.netCashFlowNote,
      trend: cashFlow.cashFlowMode === "surplus" ? "黒字運転" : undefined,
    },
    {
      id: "revenue",
      label: "月次売上",
      value: formatCurrency(cashFlow.monthlyRevenue),
      explanation: `ベース月 ${cashFlow.basisMonth}（${sourceLabel(cashFlow.source)}）`,
    },
    {
      id: "profit",
      label: "月次利益（営業近似）",
      value: formatCurrency(cashFlow.monthlyProfit),
      explanation: "売上 − 経費 − 借入返済。減価償却・capex は経費に含む。",
    },
    {
      id: "fixed_costs",
      label: "月次固定費",
      value: formatCurrency(cashFlow.fixedCosts),
      explanation: "本社固定費 + 減価償却 + 借入返済（固定化分）。",
    },
    {
      id: "variable_costs",
      label: "月次変動費",
      value: formatCurrency(cashFlow.variableCosts),
      explanation: "物件運営費・管理手数料など売上連動部分の見込み。",
    },
    {
      id: "break_even",
      label: "損益分岐売上",
      value: cashFlow.breakEvenRevenue
        ? formatCurrency(cashFlow.breakEvenRevenue)
        : "算出不可",
      explanation: cashFlow.contributionMargin
        ? `固定費 ÷ 限界利益率（${formatPercent(cashFlow.contributionMargin)}）`
        : "売上ゼロのため限界利益率未定",
    },
    {
      id: "occupancy",
      label: "亀沢 稼働率（計画）",
      value: hotelPlan ? formatPercent(hotelPlan.occupancy_rate) : "—",
      explanation: "property-revenue.yaml の目標稼働率。",
      trend: `ADR ${hotelPlan ? formatCurrency(hotelPlan.adr) : "—"}`,
    },
    {
      id: "vacancy",
      label: "番町 空室率（計画）",
      value: rentalPlan ? formatPercent(rentalPlan.vacancy_rate) : "—",
      explanation: "賃貸プランの想定空室率。",
      trend: rentalPlan ? `月額 ${formatCurrency(rentalPlan.monthly_rent)}` : undefined,
    },
    {
      id: "fy_net_profit",
      label: `${fiscalYear} 当期純利益（予実）`,
      value: yojitsu?.summary?.net_profit
        ? formatCurrency(yojitsu.summary.net_profit)
        : "—",
      explanation: "yojitsu サマリー。確定ベースは forecast / 月次実績で補完。",
    },
    {
      id: "avg_cf",
      label: "6ヶ月平均 純CF",
      value: formatCurrency(avgNet),
      explanation: "forecast モジュールによる直近6ヶ月の平均月次純キャッシュフロー。",
    },
  ];

  return kpis;
}

function sourceLabel(source: CashFlowMetrics["source"]): string {
  switch (source) {
    case "actual":
      return "実績";
    case "planned":
      return "計画";
    case "yojitsu":
      return "予実";
  }
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function lastDayOfMonth(month: string): string {
  const { year, month: m } = parseMonth(month);
  const d = new Date(year, m, 0);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function fiscalYearEndDate(fiscalYear: string, fiscalYearEndMonth: number): string {
  const startYear = parseInt(fiscalYear.replace("FY", ""), 10);
  const endYear = fiscalYearEndMonth === 12 ? startYear : startYear + 1;
  return lastDayOfMonth(`${endYear}-${String(fiscalYearEndMonth).padStart(2, "0")}`);
}

function nextFiscalYear(fiscalYear: string): string {
  const year = parseInt(fiscalYear.replace("FY", ""), 10);
  return `FY${year + 1}`;
}

function paymentDaysRemaining(reportDate: string, dueDate: string): number {
  return daysBetween(reportDate, dueDate);
}

function slugId(text: string): string {
  return text.replace(/\s+/g, "-").slice(0, 40);
}

export function collectUpcomingPayments(
  data: StewardData,
  fiscalYear: string,
  reportDate: string,
  tasks: DashboardTask[],
  horizonDays = 90
): UpcomingPayment[] {
  const windowEnd = addDays(reportDate, horizonDays);
  const payments: UpcomingPayment[] = [];
  const fiscalEndMonth = data.company.fiscal_year_end_month;

  const months = monthRange(reportDate.slice(0, 7), windowEnd.slice(0, 7));
  for (const month of months) {
    const dueDate = lastDayOfMonth(month);
    if (dueDate < reportDate || dueDate > windowEnd) continue;

    for (const item of data.fixedCosts.items) {
      if (item.monthly_amount <= 0) continue;
      payments.push({
        id: `FIXED-M-${slugId(item.name)}-${month}`,
        title: item.name,
        category: "固定費",
        amount: item.monthly_amount,
        dueDate,
        daysRemaining: paymentDaysRemaining(reportDate, dueDate),
        recurrence: "monthly",
        source: "data/finance/fixed-costs.yaml",
      });
    }
  }

  const payroll = loadPayroll();
  const monthlyPayroll = Math.round(payroll.officer_compensation_annual / 12);
  if (monthlyPayroll > 0) {
    for (const month of months) {
      const dueDate = lastDayOfMonth(month);
      if (dueDate < reportDate || dueDate > windowEnd) continue;
      payments.push({
        id: `PAYROLL-${month}`,
        title: "役員報酬",
        category: "給与",
        amount: monthlyPayroll,
        dueDate,
        daysRemaining: paymentDaysRemaining(reportDate, dueDate),
        recurrence: "monthly",
        source: "data/finance/payroll.yaml",
        notes: payroll.notes?.trim(),
      });
    }
  }

  for (const item of data.fixedCosts.items) {
    if (!item.annual_amount || item.monthly_amount > 0) continue;
    const dueDate = fiscalYearEndDate(fiscalYear, fiscalEndMonth);
    if (dueDate < reportDate || dueDate > windowEnd) continue;
    payments.push({
      id: `FIXED-A-${slugId(item.name)}-${fiscalYear}`,
      title: item.name,
      category: "固定費",
      amount: item.annual_amount,
      dueDate,
      daysRemaining: paymentDaysRemaining(reportDate, dueDate),
      recurrence: "annual",
      source: "data/finance/fixed-costs.yaml",
      notes: "年次支払 — 支払日は会計処理に合わせ要確認",
    });
  }

  try {
    const debtPlan = loadDebtPlan();
    const baseScenario =
      debtPlan.scenarios.find((s) => s.id === "base") ?? debtPlan.scenarios[0];
    const fyEnd = fiscalYearEndDate(fiscalYear, fiscalEndMonth);

    for (const entry of baseScenario.repayments) {
      if (entry.principal <= 0) continue;
      const dueDate = fiscalYearEndDate(entry.fiscal_year, fiscalEndMonth);
      const inCurrentFy = entry.fiscal_year === fiscalYear;
      const inWindow = dueDate >= reportDate && dueDate <= windowEnd;
      if (!inCurrentFy && !inWindow) continue;
      if (dueDate < reportDate && !inCurrentFy) continue;

      const loan = debtPlan.loans.find((l) => l.loan_id === entry.loan_id);
      payments.push({
        id: `LOAN-${entry.loan_id}-${entry.fiscal_year}`,
        title: `${loan?.property_name ?? entry.loan_id} 元本返済（${entry.fiscal_year}）`,
        category: "借入返済",
        amount: entry.principal,
        dueDate,
        daysRemaining: paymentDaysRemaining(reportDate, dueDate),
        recurrence: "annual",
        source: "data/plans/debt-plan.yaml",
        notes: `${baseScenario.name} · status: ${entry.status}${entry.notes ? ` · ${entry.notes}` : ""}`,
      });
    }

    const currentFyRepayments = baseScenario.repayments.filter(
      (e) => e.fiscal_year === fiscalYear
    );
    const hasCurrentFyPayment = currentFyRepayments.some((e) => e.principal > 0);
    if (!payments.some((p) => p.category === "借入返済") && !hasCurrentFyPayment && fyEnd >= reportDate) {
      payments.push({
        id: `LOAN-NONE-${fiscalYear}`,
        title: `${fiscalYear} 借入返済（base シナリオ）`,
        category: "借入返済",
        amount: 0,
        dueDate: fyEnd,
        daysRemaining: paymentDaysRemaining(reportDate, fyEnd),
        recurrence: "once",
        source: "data/plans/debt-plan.yaml",
        notes: "当年度の計画返済なし — 返済開始は debt-plan を参照",
      });
    }
  } catch {
    payments.push({
      id: "LOAN-TBD",
      title: "借入返済スケジュール",
      category: "借入返済",
      amount: null,
      dueDate: windowEnd,
      daysRemaining: horizonDays,
      recurrence: "once",
      source: "data/plans/debt-plan.yaml",
      notes: "debt-plan.yaml 未整備または読取不可",
    });
  }

  for (const task of tasks) {
    if (!task.dueDate || (task.category !== "契約期限" && task.category !== "保険")) continue;
    if (task.dueDate < reportDate || task.dueDate > windowEnd) continue;
    payments.push({
      id: `CTR-${task.id}`,
      title: task.title,
      category: "契約",
      amount: null,
      dueDate: task.dueDate,
      daysRemaining: task.daysRemaining ?? paymentDaysRemaining(reportDate, task.dueDate),
      recurrence: "once",
      source: task.link ?? "data/contracts/",
      notes: "契約更新・加入 — 支払額は契約条項を参照（tasks と連動）",
      relatedTaskId: task.id,
    });
  }

  payments.sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.title.localeCompare(b.title));

  const seen = new Set<string>();
  return payments.filter((p) => {
    const key = `${p.id}:${p.dueDate}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function computeDashboard(data?: StewardData): DashboardReport {
  const d = data ?? loadAllData();
  const fiscalYear = resolveFiscalYear(d.company.fiscal_year_end_month);
  const cashFlow = computeCashFlowMetrics(d, fiscalYear);
  const allTasks = collectTasks(d);
  const highImportanceTasks = allTasks.filter((t) => t.importance === "high");
  const highUrgencyTasks = allTasks.filter((t) => t.urgency === "high");
  const monthlyTrend = buildMonthlyTrend(fiscalYear);
  const reportDate = currentDate();
  const upcomingPayments = collectUpcomingPayments(d, fiscalYear, reportDate, allTasks);

  const tbdItems = [
    "現預金残高（cash-balance.yaml — 金額入力待ち）",
    "役員貸付返済スケジュール詳細（business-plan TBD）",
    "翻訳・サービス事業の月次収支（計画未含）",
    "保険証券 CTR-013 / CTR-014（draft）",
  ];

  return {
    generatedAt: new Date().toISOString(),
    reportDate,
    fiscalYear,
    companyName: d.company.name,
    cashFlow,
    upcomingPayments,
    highImportanceTasks,
    highUrgencyTasks,
    kpis: buildKpis(d, cashFlow, fiscalYear),
    monthlyTrend,
    monthlyTrendNarrative: buildTrendNarrative(monthlyTrend),
    tbdItems,
  };
}

function formatTaskTable(tasks: DashboardTask[]): string {
  if (tasks.length === 0) return "該当なし。\n";
  const lines = [
    "| ID | タスク | カテゴリ | 期限 | 残日 | 重要 | 緊急 |",
    "|---|---|---|---|---:|---|---|",
  ];
  for (const t of tasks) {
    lines.push(
      `| ${t.id} | ${t.title} | ${t.category} | ${t.dueDate ?? "—"} | ${t.daysRemaining ?? "—"} | ${t.importance} | ${t.urgency} |`
    );
  }
  const withNotes = tasks.filter((t) => t.notes);
  if (withNotes.length) {
    lines.push("");
    for (const t of withNotes) {
      lines.push(`- **${t.id}**: ${t.notes}`);
    }
  }
  return lines.join("\n") + "\n";
}

function formatUpcomingPaymentsTable(payments: UpcomingPayment[]): string {
  if (payments.length === 0) return "該当なし。\n";
  const lines = [
    "| 期限 | カテゴリ | 内容 | 金額 | 残日 | 頻度 | ソース |",
    "|---|---|---|---:|---:|---|---|",
  ];
  for (const p of payments) {
    const amount = p.amount === null ? "—" : formatCurrency(p.amount);
    lines.push(
      `| ${p.dueDate} | ${p.category} | ${p.title} | ${amount} | ${p.daysRemaining} | ${p.recurrence} | ${p.source} |`
    );
  }
  const withNotes = payments.filter((p) => p.notes);
  if (withNotes.length) {
    lines.push("");
    for (const p of withNotes) {
      lines.push(`- **${p.id}**: ${p.notes}`);
    }
  }
  return lines.join("\n") + "\n";
}

export function formatDashboardMarkdown(
  report: DashboardReport,
  agentSummariesSection?: string
): string {
  const cf = report.cashFlow;
  const liquidity = buildLiquidityOutlook(cf);
  const lines = [
    `# 経営ダッシュボード — ${report.companyName}`,
    "",
    `**基準日:** ${report.reportDate} · **会計年度:** ${report.fiscalYear}`,
    "",
    "> 1日1回更新。詳細 KPI 定義は [executive-dashboard-guide.md](../plans/executive-dashboard-guide.md)、キャッシュフロー表は [cashflow-detail.md](../plans/cashflow-detail.md) を参照。",
    "",
    agentSummariesSection ?? "",
    "## サマリー",
    "",
    "| 指標 | 値 | 備考 |",
    "|------|---:|------|",
    `| ${liquidity.primaryLabel} | ${liquidity.primaryValue.includes("TBD") ? "**TBD**" : liquidity.primaryValue} | ${liquidity.primaryNote} |`,
    `| ${liquidity.netCashFlowLabel} | ${liquidity.netCashFlowValue} | ${liquidity.netCashFlowNote} |`,
    `| 月次売上 | ${formatCurrency(cf.monthlyRevenue)} | ${cf.basisMonth} (${sourceLabel(cf.source)}) |`,
    `| 月次利益 | ${formatCurrency(cf.monthlyProfit)} | 営業近似 |`,
    `| 固定費/月 | ${formatCurrency(cf.fixedCosts)} | |`,
    `| 変動費/月 | ${formatCurrency(cf.variableCosts)} | |`,
    `| 損益分岐売上 | ${cf.breakEvenRevenue ? formatCurrency(cf.breakEvenRevenue) : "—"} | 限界利益率 ${cf.contributionMargin ? formatPercent(cf.contributionMargin) : "—"} |`,
    "",
    "## 次の支払い",
    "",
    "90 日以内の定期支払・当年度借入返済（base シナリオ）・契約期限（tasks 連動）。",
    "",
    formatUpcomingPaymentsTable(report.upcomingPayments),
    "## 重要タスク（高重要度）",
    "",
    formatTaskTable(report.highImportanceTasks),
    "## 緊急タスク（高緊急度）",
    "",
    formatTaskTable(report.highUrgencyTasks),
    "",
    "## 財務 KPI 一覧",
    "",
    "| KPI | 値 | 説明 |",
    "|-----|---:|------|",
    ...report.kpis.map(
      (k) => `| ${k.label} | ${k.value} | ${k.explanation}${k.trend ? ` (${k.trend})` : ""} |`
    ),
    "",
    "## 月次トレンド（予実）",
    "",
    ...report.monthlyTrendNarrative.map((n) => `- ${n}`),
    "",
    "| 月 | 売上 | 支出 | 純増減 | メモ |",
    "|---|---:|---:|---:|---|",
    ...report.monthlyTrend.map(
      (t) =>
        `| ${t.month} | ${formatCurrency(t.revenue)} | ${formatCurrency(t.expenses)} | ${formatCurrency(t.net)} | ${t.notes ?? ""} |`
    ),
    "",
    "## TBD / データギャップ",
    "",
    ...report.tbdItems.map((t) => `- ${t}`),
    ...(cf.notes.length ? ["", ...cf.notes.map((n) => `- ${n}`)] : []),
    "",
    "## 関連コマンド",
    "",
    "```bash",
    "npm run steward -- dashboard",
    "npm run steward -- forecast",
    "npm run steward -- alerts",
    "npm run steward -- status",
    "```",
    "",
    `*生成: \`steward dashboard\` · ${report.generatedAt}*`,
  ];

  return lines.join("\n");
}
