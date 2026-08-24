/**
 * Deterministic executive / finance briefing for Steward Chat + CLI.
 * Composes existing computeDashboard / yojitsu / tax-profile / finances summary —
 * does not invent numbers.
 */
import {
  buildLiquidityOutlook,
  computeDashboard,
  resolveFiscalYear,
  type CashFlowMetrics,
  type DashboardReport,
} from "./dashboard.js";
import {
  loadCashBalance,
  loadCompany,
  loadMonthlyFinances,
  loadTaxProfile,
  loadYojitsuFyPlan,
  resolveCashBalanceTotal,
} from "./data.js";
import { financesSummary } from "./report.js";
import { currentMonth, formatCurrency } from "./utils.js";
import { getCashflowTodaySummary } from "../../steward/jurisdiction-packs/JP/modules/jp_bank_corporate/cli/lib.js";

export interface TaxEstimateView {
  amount: number | null;
  status: string;
  source: string;
  notes: string[];
}

export interface FinanceBriefing {
  company_name: string;
  fiscal_year: string;
  as_of_month: string;
  report_date: string;
  cashFlow: CashFlowMetrics;
  liquidity: ReturnType<typeof buildLiquidityOutlook>;
  ytd: {
    from: string;
    to: string;
    months: number;
    totalRevenue: number;
    totalExpenses: number;
    netIncome: number;
  } | null;
  tax: TaxEstimateView;
  cashflow_schedule: {
    path?: string;
    shortfall_date: string | null;
    runway_days: number | null;
    required_funding_amount: number | null;
    required_funding_by_date: string | null;
    stale?: boolean;
  } | null;
  kpis: Array<{ label: string; value: string; explanation: string }>;
  notes: string[];
}

function fiscalYearStartMonth(fyId: string, fiscalYearEndMonth: number): string {
  const year = Number(fyId.replace(/^FY/i, ""));
  if (!Number.isFinite(year)) return `${currentMonth().slice(0, 4)}-01`;
  // MAL-style: FY ends in January → fiscal year starts February of same label year
  if (fiscalYearEndMonth === 1) return `${year}-02`;
  if (fiscalYearEndMonth === 12) return `${year}-01`;
  const startMonth = fiscalYearEndMonth + 1;
  return `${year}-${String(startMonth).padStart(2, "0")}`;
}

export function resolveTaxEstimate(fiscalYear: string): TaxEstimateView {
  const notes: string[] = [];
  try {
    const yojitsu = loadYojitsuFyPlan(fiscalYear);
    const fromYojitsu = yojitsu?.summary?.tax_estimate;
    if (typeof fromYojitsu === "number") {
      return {
        amount: fromYojitsu,
        status: "yojitsu.summary.tax_estimate",
        source: `data/plans/yojitsu-${fiscalYear.toLowerCase()}.yaml`,
        notes: [
          "予実サマリーの税額見込（税理士確定申告額ではない）",
          ...(yojitsu?.summary ? [] : []),
        ],
      };
    }
  } catch {
    notes.push("予実プランを読めませんでした");
  }

  try {
    const profile = loadTaxProfile() as {
      corporate_tax?: {
        estimated_tax_fy2026?: number;
        estimated_tax_status?: string;
        notes?: string;
      };
      consumption_tax?: { status?: string; notes?: string };
    };
    const corp = profile.corporate_tax;
    const amount = corp?.estimated_tax_fy2026;
    if (typeof amount === "number") {
      if (corp?.notes) notes.push(corp.notes.split("\n")[0]!.trim());
      if (profile.consumption_tax?.status) {
        notes.push(`消費税区分: ${profile.consumption_tax.status}`);
      }
      return {
        amount,
        status: corp?.estimated_tax_status ?? "tax-profile",
        source: "data/finance/tax-profile.yaml",
        notes: notes.length
          ? notes
          : ["tax-profile の静的見積（再計算エンジンではない）"],
      };
    }
    if (profile.consumption_tax?.status) {
      notes.push(`消費税区分: ${profile.consumption_tax.status}`);
    }
  } catch {
    notes.push("tax-profile.yaml を読めませんでした");
  }

  return {
    amount: null,
    status: "未確認",
    source: "—",
    notes: notes.length ? notes : ["納税見込の正本がありません"],
  };
}

function loadCashflowScheduleSummary(): FinanceBriefing["cashflow_schedule"] {
  try {
    const s = getCashflowTodaySummary();
    if (!s.schedule_path && s.shortfall_date == null && s.runway_days == null) {
      return null;
    }
    return {
      path: s.schedule_path,
      shortfall_date: s.shortfall_date ?? null,
      runway_days: s.runway_days ?? null,
      required_funding_amount: s.required_funding_amount ?? null,
      required_funding_by_date: s.required_funding_by_date ?? null,
      stale: s.stale,
    };
  } catch {
    return null;
  }
}

export function buildFinanceBriefing(opts?: {
  asOfMonth?: string;
  data?: Parameters<typeof computeDashboard>[0];
}): FinanceBriefing {
  const asOfMonth = opts?.asOfMonth ?? currentMonth();
  const report: DashboardReport = computeDashboard(opts?.data, { asOfMonth });
  const company = loadCompany();
  const fyEnd = company.fiscal_year_end_month ?? 12;
  const fiscalYear = report.fiscalYear || resolveFiscalYear(fyEnd, asOfMonth);
  const liquidity = buildLiquidityOutlook(report.cashFlow);

  const ytdFrom = fiscalYearStartMonth(fiscalYear, fyEnd);
  const ytdTo = asOfMonth < ytdFrom ? ytdFrom : asOfMonth;
  let ytd: FinanceBriefing["ytd"] = null;
  try {
    const summary = financesSummary(loadMonthlyFinances(), ytdFrom, ytdTo);
    if (summary.months > 0) {
      ytd = {
        from: ytdFrom,
        to: ytdTo,
        months: summary.months,
        totalRevenue: summary.totalRevenue,
        totalExpenses: summary.totalExpenses,
        netIncome: summary.netIncome,
      };
    }
  } catch {
    // ignore
  }

  const tax = resolveTaxEstimate(fiscalYear);
  const cashflow_schedule = loadCashflowScheduleSummary();

  const notes = [...report.cashFlow.notes, ...report.tbdItems.slice(0, 5)];
  try {
    const bal = loadCashBalance();
    if (!bal) {
      notes.push("現預金（cash-balance.yaml）がありません");
    } else {
      const total = resolveCashBalanceTotal(bal);
      if (total == null) notes.push("現預金合計が未確定です");
    }
  } catch {
    /* optional */
  }

  return {
    company_name: report.companyName,
    fiscal_year: fiscalYear,
    as_of_month: asOfMonth,
    report_date: report.reportDate,
    cashFlow: report.cashFlow,
    liquidity,
    ytd,
    tax,
    cashflow_schedule,
    kpis: report.kpis.slice(0, 8).map((k) => ({
      label: k.label,
      value: k.value,
      explanation: k.explanation,
    })),
    notes,
  };
}

export function formatFinanceBriefingMarkdown(brief: FinanceBriefing): string {
  const cf = brief.cashFlow;
  const sourcePath =
    cf.source === "actual" || cf.source === "yojitsu"
      ? `data/finance/monthly/${cf.basisMonth}.yaml`
      : "計画ベース（月次 YAML なし）";

  const lines = [
    `# 経営・財務ブリーフィング — ${brief.company_name}`,
    "",
    `**会計年度:** ${brief.fiscal_year} · **as_of:** ${brief.as_of_month} · **基準日:** ${brief.report_date}`,
    "",
    "## 資金・運転",
    `- 現預金: ${cf.cashBalance == null ? "未設定" : formatCurrency(cf.cashBalance)}`,
    `- ${brief.liquidity.primaryLabel}: ${brief.liquidity.primaryValue}（${brief.liquidity.primaryNote}）`,
    `- ${brief.liquidity.netCashFlowLabel}: ${brief.liquidity.netCashFlowValue}`,
    `- 符号付きバーン（正=消耗 · 負=黒字）: ${formatCurrency(cf.burnRate)} · 基準月 ${cf.basisMonth}（${cf.source} · \`${sourcePath}\`）`,
    cf.cashFlowMode === "surplus"
      ? `- 月次キャッシュ増: ${formatCurrency(cf.monthlyCashSurplus)}`
      : cf.cashFlowMode === "deficit"
        ? `- 月次ネットバーン: ${formatCurrency(cf.monthlyNetBurn)}`
        : `- 月次ネット: ${formatCurrency(0)}`,
    "",
    "## 月次損益スナップショット",
    `- 売上: ${formatCurrency(cf.monthlyRevenue)}`,
    `- 費用（借入返済以外）: ${formatCurrency(cf.monthlyExpenses)}`,
    `- 借入返済: ${formatCurrency(cf.monthlyLoanPayments)}`,
    `- 月次利益（営業近似）: ${formatCurrency(cf.monthlyProfit)}`,
    `- 損益分岐売上: ${cf.breakEvenRevenue == null ? "—" : formatCurrency(cf.breakEvenRevenue)}`,
  ];

  if (brief.ytd) {
    lines.push(
      "",
      `## 年度累計（${brief.ytd.from}〜${brief.ytd.to} · ${brief.ytd.months}ヶ月）`,
      `- 売上累計: ${formatCurrency(brief.ytd.totalRevenue)}`,
      `- 費用累計: ${formatCurrency(brief.ytd.totalExpenses)}`,
      `- 純増減: ${formatCurrency(brief.ytd.netIncome)}`
    );
  }

  lines.push("", "## 年度末・納税見込");
  if (brief.tax.amount == null) {
    lines.push(`- 納税見込: **未確認**（${brief.tax.status}）`);
  } else {
    lines.push(
      `- 納税見込: **${formatCurrency(brief.tax.amount)}**`,
      `- ステータス: ${brief.tax.status}`,
      `- ソース: \`${brief.tax.source}\``
    );
  }
  for (const n of brief.tax.notes.slice(0, 3)) {
    lines.push(`- 注記: ${n}`);
  }

  lines.push("", "## 資金繰り表（生成済みがあれば）");
  if (!brief.cashflow_schedule) {
    lines.push(
      "- 生成済みの資金繰り表サマリーはありません。",
      "- 表の生成: チャットで「13週資金繰りを生成」または `orgos` JP bank cashflow パイプライン。"
    );
  } else {
    const s = brief.cashflow_schedule;
    if (s.path) lines.push(`- Path: \`${s.path}\`${s.stale ? "（古い可能性）" : ""}`);
    lines.push(`- 資金ショート日: ${s.shortfall_date ?? "なし"}`);
    lines.push(`- Runway（日）: ${s.runway_days ?? "なし"}`);
    lines.push(
      `- 必要調達額: ${
        s.required_funding_amount == null
          ? "なし"
          : formatCurrency(s.required_funding_amount)
      }${s.required_funding_by_date ? `（期限 ${s.required_funding_by_date}）` : ""}`
    );
  }

  if (brief.kpis.length > 0) {
    lines.push("", "## 経営 KPI（抜粋）");
    for (const k of brief.kpis) {
      lines.push(`- **${k.label}:** ${k.value} — ${k.explanation}`);
    }
  }

  if (brief.notes.length > 0) {
    lines.push("", "## 注記 / ギャップ");
    for (const n of brief.notes.slice(0, 8)) {
      lines.push(`- ${n}`);
    }
  }

  lines.push(
    "",
    "このブリーフィングは `computeDashboard()` / 予実 / tax-profile / 月次 YAML の決定論結果です。LLM の推計ではありません。",
    "",
    "## 関連 CLI",
    "```bash",
    "npm run orgos -- finances briefing",
    "npm run orgos -- dashboard",
    "npm run orgos -- forecast",
    "npm run orgos -- finances summary --from YYYY-MM --to YYYY-MM",
    "```"
  );

  return lines.join("\n");
}
