import {
  computeDashboard,
  selectBasisMonthlyFinance,
  type CashFlowMetrics,
} from "../dashboard.js";
import { loadAllData, loadCompany, loadMonthlyFinance } from "../data.js";
import {
  buildFinanceBriefing,
  formatFinanceBriefingMarkdown,
} from "../finance-briefing.js";
import { currentMonth, formatCurrency } from "../utils.js";

export interface FinanceMetricsChatResult {
  handled: boolean;
  ok?: boolean;
  reply?: string;
  metrics?: Pick<
    CashFlowMetrics,
    | "burnRate"
    | "runwayMonths"
    | "cashFlowMode"
    | "monthlyNetBurn"
    | "monthlyCashSurplus"
    | "monthlyRevenue"
    | "monthlyExpenses"
    | "monthlyLoanPayments"
    | "cashBalance"
    | "basisMonth"
    | "source"
    | "notes"
  > & { company_name: string; requested_month?: string };
}

/**
 * KPI questions answered by computeDashboard / monthly YAML.
 * Excludes JP「資金繰り表」generation (horizon / 表 / 生成 / save).
 */
const FINANCE_METRICS_INTENT =
  /バーン\s*レート|burn[\s_-]*rate|ネット\s*バーン|net[\s_-]*burn|ランウェイ|runway|キャッシュ\s*フロー|cash[\s_-]*flow|\bCF\b|月次(?:キャッシュ|CF)|キャッシュ(?:消耗|燃焼|増)|資金(?:見通し|状況|繰り)|財務指標|現預金(?:\s*残高)?|売上|売り上げ|売上高|revenue|sales|費用|経費|支出|expenses?|ブリーフィング|経営サマリー|経営指標|財務サマリー|finance\s*briefing|納税|税額|年度末|経営ダッシュボード/iu;

/** JP bank cashflow *schedule* generation — must not steal KPI questions. */
const CASHFLOW_SCHEDULE_GENERATION =
  /資金\s*繰り\s*表|キャッシュ\s*フロー\s*表|(?:日次|週次|月次)\s*\d|\d+\s*(?:日|週|か月|ヶ月|ケ月|カ月|weeks?|months?|days?)\b|(?:weekly|monthly|daily)\b|\b\d+\s*[dwm]\b|(?:生成|保存|書き込|出して|preview|\bwrite\b|\bsave\b|\bpersist\b)/iu;

/** Broader net for post-LLM refusal replacement. */
const FINANCE_KPI_TOPIC =
  /バーン|burn[\s_-]*rate|ランウェイ|runway|キャッシュ\s*フロー|cash[\s_-]*flow|\bCF\b|資金繰り|財務指標|現預金|ネット\s*バーン|売上|売り上げ|売上高|revenue|sales|費用|経費|納税|税額|経営指標|ブリーフィング|年度末/iu;

/** LLM essays that refuse YAML access / invent CLI instead of answering KPIs. */
const FINANCE_POLICY_REFUSAL =
  /直接データにアクセスすることはできません|data\/\*\*\/\*\.yaml|@finance_agent|Finance Agent|orgos\s+--\s+forecast|公式な経路を経由|経営統括エージェントとして|売上データは含まれていません|参照可能な最新の財務情報は/iu;

const REVENUE_FOCUS = /売上|売り上げ|売上高|revenue|sales/iu;
const FULL_METRICS_FOCUS =
  /バーン|burn|ランウェイ|runway|キャッシュ\s*フロー|cash[\s_-]*flow|\bCF\b|財務指標|資金繰り|現預金/iu;
const BRIEFING_FOCUS =
  /ブリーフィング|経営サマリー|経営指標|財務サマリー|finance\s*briefing|納税|税額見込|税額|年度末|経営ダッシュボード|資金見通し/iu;


export function isCashflowScheduleGenerationIntent(message: string): boolean {
  const n = message.normalize("NFKC").trim();
  if (!/(?:資金|キャッシュ|cash[\s_-]*flow|cashflow)/iu.test(n)) return false;
  return CASHFLOW_SCHEDULE_GENERATION.test(n);
}

export function isFinanceMetricsChatIntent(message: string): boolean {
  const n = message.normalize("NFKC").trim();
  if (isCashflowScheduleGenerationIntent(n)) return false;
  return FINANCE_METRICS_INTENT.test(n);
}

export function isFinanceKpiTopic(message: string): boolean {
  return FINANCE_KPI_TOPIC.test(message.normalize("NFKC").trim());
}

export function looksLikeFinancePolicyRefusal(reply: string): boolean {
  return FINANCE_POLICY_REFUSAL.test(reply.normalize("NFKC"));
}

/** Parse `2026-05` / `2026年5月` / `2026/5` from the user message. */
export function parseRequestedFinanceMonth(message: string): string | undefined {
  const n = message.normalize("NFKC");
  const iso = n.match(/(20\d{2})[-/](\d{1,2})/);
  if (iso) {
    const y = iso[1]!;
    const m = Number(iso[2]);
    if (m >= 1 && m <= 12) return `${y}-${String(m).padStart(2, "0")}`;
  }
  const jp = n.match(/(20\d{2})\s*年\s*(\d{1,2})\s*月/);
  if (jp) {
    const y = jp[1]!;
    const m = Number(jp[2]);
    if (m >= 1 && m <= 12) return `${y}-${String(m).padStart(2, "0")}`;
  }
  return undefined;
}

export function isRevenueFocusedFinanceQuestion(message: string): boolean {
  const n = message.normalize("NFKC");
  return REVENUE_FOCUS.test(n) && !FULL_METRICS_FOCUS.test(n) && !BRIEFING_FOCUS.test(n);
}

export function isFinanceBriefingIntent(message: string): boolean {
  return BRIEFING_FOCUS.test(message.normalize("NFKC"));
}

function formatModeJa(mode: CashFlowMetrics["cashFlowMode"]): string {
  if (mode === "surplus") return "黒字（キャッシュ増）";
  if (mode === "deficit") return "赤字（ネットバーン）";
  return "収支均衡";
}

function formatRunwayLine(cf: CashFlowMetrics): string {
  if (cf.cashFlowMode === "surplus") {
    return "ランウェイ: 該当なし（黒字）";
  }
  if (cf.cashFlowMode === "break_even") {
    return "ランウェイ: 収支均衡";
  }
  if (cf.cashBalance == null) {
    return "ランウェイ: 未確定（cash-balance 要確認）";
  }
  if (cf.runwayMonths == null) {
    return "ランウェイ: 未確定";
  }
  return `ランウェイ: ${cf.runwayMonths.toFixed(1)} ヶ月`;
}

function formatRevenueFocusedReply(
  _companyName: string,
  cf: CashFlowMetrics,
  _requested: string | undefined,
  _asOfMonth: string
): string {
  const monthLabel = cf.basisMonth.replace(
    /^(20\d{2})-(\d{2})$/,
    (_, y, m) => `${y}年${Number(m)}月`
  );
  return `${monthLabel}の売上 **${formatCurrency(cf.monthlyRevenue)}**。`;
}

/**
 * Deterministic finance KPI reply from tenant YAML via computeDashboard.
 * Never invents numbers. Supports optional target month in the user message.
 */
export function handleFinanceMetricsChatMessage(message: string): FinanceMetricsChatResult {
  if (!isFinanceMetricsChatIntent(message)) return { handled: false };

  const company = loadCompany();
  const companyName = company.name;
  const requested = parseRequestedFinanceMonth(message);
  const asOfMonth = requested ?? currentMonth();

  if (isFinanceBriefingIntent(message)) {
    const brief = buildFinanceBriefing({ asOfMonth });
    return {
      handled: true,
      ok: true,
      reply: formatFinanceBriefingMarkdown(brief),
      metrics: {
        company_name: brief.company_name,
        requested_month: requested,
        burnRate: brief.cashFlow.burnRate,
        runwayMonths: brief.cashFlow.runwayMonths,
        cashFlowMode: brief.cashFlow.cashFlowMode,
        monthlyNetBurn: brief.cashFlow.monthlyNetBurn,
        monthlyCashSurplus: brief.cashFlow.monthlyCashSurplus,
        monthlyRevenue: brief.cashFlow.monthlyRevenue,
        monthlyExpenses: brief.cashFlow.monthlyExpenses,
        monthlyLoanPayments: brief.cashFlow.monthlyLoanPayments,
        cashBalance: brief.cashFlow.cashBalance,
        basisMonth: brief.cashFlow.basisMonth,
        source: brief.cashFlow.source,
        notes: brief.notes,
      },
    };
  }

  if (requested) {
    const file = loadMonthlyFinance(requested);
    if (!file) {
      return {
        handled: true,
        ok: false,
        reply: `未確認: ${requested} の月次ファイルがありません。数値は出しません。`,
        metrics: undefined,
      };
    }
  }

  const data = loadAllData();
  const basis = selectBasisMonthlyFinance(data.monthlyFinances, asOfMonth);
  const report = computeDashboard(data, { asOfMonth });
  const cf = report.cashFlow;

  if (!basis && cf.source === "planned" && cf.monthlyRevenue === 0 && cf.monthlyExpenses === 0) {
    return {
      handled: true,
      ok: false,
      reply: "未確認: 利用可能な月次実績がありません。",
    };
  }

  // Self-check: formula must hold
  const expectedBurn = cf.monthlyExpenses + cf.monthlyLoanPayments - cf.monthlyRevenue;
  if (Math.abs(expectedBurn - cf.burnRate) > 0.01) {
    return {
      handled: true,
      ok: false,
      reply: `内部整合エラー: burnRate が内訳と一致しません（計算 ${expectedBurn} / 指標 ${cf.burnRate}）。`,
    };
  }

  const metrics = {
    company_name: companyName,
    requested_month: requested,
    burnRate: cf.burnRate,
    runwayMonths: cf.runwayMonths,
    cashFlowMode: cf.cashFlowMode,
    monthlyNetBurn: cf.monthlyNetBurn,
    monthlyCashSurplus: cf.monthlyCashSurplus,
    monthlyRevenue: cf.monthlyRevenue,
    monthlyExpenses: cf.monthlyExpenses,
    monthlyLoanPayments: cf.monthlyLoanPayments,
    cashBalance: cf.cashBalance,
    basisMonth: cf.basisMonth,
    source: cf.source,
    notes: cf.notes,
  };

  if (isRevenueFocusedFinanceQuestion(message)) {
    return {
      handled: true,
      ok: true,
      reply: formatRevenueFocusedReply(companyName, cf, requested, asOfMonth),
      metrics,
    };
  }

  const cash =
    cf.cashBalance == null ? "現預金未設定" : `現預金 ${formatCurrency(cf.cashBalance)}`;
  const burnOrSurplus =
    cf.cashFlowMode === "surplus"
      ? `月次キャッシュ増 ${formatCurrency(cf.monthlyCashSurplus)}`
      : `ネットバーン ${formatCurrency(cf.monthlyNetBurn)}`;
  const reply = [
    `${cash} · ${formatModeJa(cf.cashFlowMode)}（${cf.basisMonth}）。`,
    `売上 ${formatCurrency(cf.monthlyRevenue)} · 費用 ${formatCurrency(cf.monthlyExpenses)} · ${burnOrSurplus}。`,
    formatRunwayLine(cf),
  ].join("\n");

  return {
    handled: true,
    ok: true,
    reply,
    metrics,
  };
}

