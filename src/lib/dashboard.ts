import type { Contract, MonthlyFinance } from "../../schemas/index.js";
import type { StewardData } from "./data.js";
import {
  loadAllData,
  loadYojitsuFyPlan,
  loadExpensePlan,
} from "./data.js";
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
  formatCurrency,
  formatPercent,
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
  burnRate: number;
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

export interface DashboardReport {
  generatedAt: string;
  reportDate: string;
  fiscalYear: string;
  companyName: string;
  cashFlow: CashFlowMetrics;
  highImportanceTasks: DashboardTask[];
  highUrgencyTasks: DashboardTask[];
  kpis: KpiItem[];
  monthlyTrend: MonthlyTrendPoint[];
  monthlyTrendNarrative: string[];
  tbdItems: string[];
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
      const rev = sumYojitsuRevenue(m.actual ?? m.plan);
      return rev > 0;
    });
    if (operatingMonths.length && source === "actual" && monthlyRevenue < plannedRevenue * 0.5) {
      const last = operatingMonths[operatingMonths.length - 1];
      const row = last.actual ?? last.plan;
      monthlyRevenue = sumYojitsuRevenue(row);
      monthlyExpenses =
        (row.expense_bancho ?? 0) +
        (row.expense_kamezawa ?? 0) +
        (row.expense_officer ?? 0) +
        (row.expense_company ?? 0) +
        (row.depreciation ?? 0);
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

  const contributionMargin =
    monthlyRevenue > 0 ? (monthlyRevenue - variableCosts) / monthlyRevenue : null;
  const breakEvenRevenue =
    contributionMargin && contributionMargin > 0
      ? fixedCosts / contributionMargin
      : null;

  const cashBalance: number | null = null;
  notes.push("現預金残高: データ未登録（TBD）— runway 算出不可");

  let runwayMonths: number | null = null;
  if (cashBalance !== null && burnRate > 0) {
    runwayMonths = cashBalance / burnRate;
  }

  return {
    cashBalance,
    runwayMonths,
    burnRate,
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

function sumYojitsuRevenue(row: {
  revenue_bancho?: number;
  revenue_kamezawa?: number;
  revenue_translation?: number;
  revenue_services?: number;
}): number {
  return (
    (row.revenue_bancho ?? 0) +
    (row.revenue_kamezawa ?? 0) +
    (row.revenue_translation ?? 0) +
    (row.revenue_services ?? 0)
  );
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
    link: `cursor/data/contracts/${alert.contractId}.yaml`,
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
      link: "cursor/data/plans/business-plan.yaml",
      notes: "business-plan funding_plan に TBD 記載",
    },
    {
      id: "TBD-CASH",
      title: "現預金残高を cursor/data に登録",
      category: "財務データ",
      urgency: "medium",
      importance: "high",
      link: "docs/plans/cashflow-detail.md",
      notes: "runway 算出に必要",
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
    const row = m.actual ?? m.plan;
    const revenue = sumYojitsuRevenue(row);
    const expenses =
      (row.expense_bancho ?? 0) +
      (row.expense_kamezawa ?? 0) +
      (row.expense_officer ?? 0) +
      (row.expense_company ?? 0) +
      (row.depreciation ?? 0) +
      (row.capex ?? 0);
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
    return ["予実データなし — `cursor/data/plans/yojitsu-*.yaml` を整備してください。"];
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

  const kpis: KpiItem[] = [
    {
      id: "runway",
      label: "ランウェイ",
      value: cashFlow.runwayMonths !== null ? `${cashFlow.runwayMonths.toFixed(1)} ヶ月` : "TBD",
      explanation:
        "現預金残高 ÷ 月次ネットバーン。残高未登録のため算出保留。",
    },
    {
      id: "burn_rate",
      label: "バーンレート",
      value: formatCurrency(cashFlow.burnRate),
      explanation:
        "月次支出（返済含む）− 月次収入。正の値はキャッシュ流出、負の値は黒字運転。",
      trend: cashFlow.burnRate <= 0 ? "黒字運転" : "要監視",
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

export function computeDashboard(data?: StewardData): DashboardReport {
  const d = data ?? loadAllData();
  const fiscalYear = resolveFiscalYear(d.company.fiscal_year_end_month);
  const cashFlow = computeCashFlowMetrics(d, fiscalYear);
  const allTasks = collectTasks(d);
  const highImportanceTasks = allTasks.filter((t) => t.importance === "high");
  const highUrgencyTasks = allTasks.filter((t) => t.urgency === "high");
  const monthlyTrend = buildMonthlyTrend(fiscalYear);

  const tbdItems = [
    "現預金残高（cursor/data 未登録）",
    "役員貸付返済スケジュール詳細（business-plan TBD）",
    "翻訳・サービス事業の月次収支（計画未含）",
    "保険証券 CTR-013 / CTR-014（draft）",
  ];

  return {
    generatedAt: new Date().toISOString(),
    reportDate: currentDate(),
    fiscalYear,
    companyName: d.company.name,
    cashFlow,
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

export function formatDashboardMarkdown(report: DashboardReport): string {
  const cf = report.cashFlow;
  const lines = [
    `# 経営ダッシュボード — ${report.companyName}`,
    "",
    `**基準日:** ${report.reportDate} · **会計年度:** ${report.fiscalYear}`,
    "",
    "> 1日1回更新。詳細 KPI 定義は [executive-dashboard-guide.md](../plans/executive-dashboard-guide.md)、キャッシュフロー表は [cashflow-detail.md](../plans/cashflow-detail.md) を参照。",
    "",
    "## サマリー",
    "",
    "| 指標 | 値 | 備考 |",
    "|------|---:|------|",
    `| ランウェイ | ${cf.runwayMonths !== null ? `${cf.runwayMonths.toFixed(1)} ヶ月` : "**TBD**"} | 現預金未登録 |`,
    `| バーンレート | ${formatCurrency(cf.burnRate)} | 正=流出 |`,
    `| 月次売上 | ${formatCurrency(cf.monthlyRevenue)} | ${cf.basisMonth} (${sourceLabel(cf.source)}) |`,
    `| 月次利益 | ${formatCurrency(cf.monthlyProfit)} | 営業近似 |`,
    `| 固定費/月 | ${formatCurrency(cf.fixedCosts)} | |`,
    `| 変動費/月 | ${formatCurrency(cf.variableCosts)} | |`,
    `| 損益分岐売上 | ${cf.breakEvenRevenue ? formatCurrency(cf.breakEvenRevenue) : "—"} | 限界利益率 ${cf.contributionMargin ? formatPercent(cf.contributionMargin) : "—"} |`,
    "",
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
