import {
  computeDashboard,
  selectBasisMonthlyFinance,
  type CashFlowMetrics,
} from "../dashboard.js";
import { loadAllData, loadCompany, loadMonthlyFinance } from "../data.js";
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

const FINANCE_METRICS_INTENT =
  /バーン\s*レート|burn[\s_-]*rate|ネット\s*バーン|net[\s_-]*burn|ランウェイ|runway|月次(?:キャッシュ|CF)|キャッシュ(?:消耗|燃焼|増)|資金(?:見通し|状況)|現預金\s*残高/iu;

export function isFinanceMetricsChatIntent(message: string): boolean {
  return FINANCE_METRICS_INTENT.test(message.normalize("NFKC").trim());
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

function formatModeJa(mode: CashFlowMetrics["cashFlowMode"]): string {
  if (mode === "surplus") return "黒字（キャッシュ増）";
  if (mode === "deficit") return "赤字（ネットバーン）";
  return "収支均衡";
}

function formatRunwayLine(cf: CashFlowMetrics): string {
  if (cf.cashFlowMode === "surplus") {
    return "ランウェイ: 該当なし（黒字のため資金枯渇までの月数は算出しない）";
  }
  if (cf.cashFlowMode === "break_even") {
    return "ランウェイ: 収支均衡（ネットバーン ≈ 0）";
  }
  if (cf.cashBalance == null) {
    return "ランウェイ: 未確定（cash-balance.yaml を confirmed にしてください）";
  }
  if (cf.runwayMonths == null) {
    return "ランウェイ: 未確定";
  }
  return `ランウェイ: ${cf.runwayMonths.toFixed(1)} ヶ月（現預金 ÷ ネットバーン）`;
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

  if (requested) {
    const file = loadMonthlyFinance(requested);
    if (!file) {
      return {
        handled: true,
        ok: false,
        reply: [
          `# 財務指標 — ${companyName}`,
          "",
          `**未確認:** 月次ファイル \`data/finance/monthly/${requested}.yaml\` がありません。`,
          "数値は捏造しません。月次 YAML を追加するか、Finance へ Work Order で確認してください。",
          "",
          "Steward に「Finance に確認して」と依頼すると、実在の IMP を自動起票します。",
        ].join("\n"),
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
      reply: [
        `# 財務指標 — ${companyName}`,
        "",
        "**未確認:** 利用可能な月次実績がありません。",
        "`data/finance/monthly/` を確認してください。",
      ].join("\n"),
    };
  }

  // Self-check: formula must hold
  const expectedBurn = cf.monthlyExpenses + cf.monthlyLoanPayments - cf.monthlyRevenue;
  if (Math.abs(expectedBurn - cf.burnRate) > 0.01) {
    return {
      handled: true,
      ok: false,
      reply: `内部整合エラー: burnRate が内訳と一致しません（計算 ${expectedBurn} / 指標 ${cf.burnRate}）。dashboard を修正してください。`,
    };
  }

  const sourcePath =
    cf.source === "actual" || cf.source === "yojitsu"
      ? `data/finance/monthly/${cf.basisMonth}.yaml`
      : "計画ベース（月次 YAML なし）";

  const lines = [
    `# 財務指標 — ${companyName}`,
    "",
    `**会社:** ${companyName}`,
    `**基準月:** ${cf.basisMonth}${requested ? `（指定 ${requested}）` : `（as_of ${asOfMonth}）`}`,
    `**ソース:** ${cf.source} · Path: \`${sourcePath}\``,
    `**現預金:** ${cf.cashBalance == null ? "未設定" : formatCurrency(cf.cashBalance)}`,
    `**運転モード:** ${formatModeJa(cf.cashFlowMode)}`,
    "",
    "## 内訳（テナント YAML）",
    `- 月次売上: ${formatCurrency(cf.monthlyRevenue)}`,
    `- 月次費用（借入返済以外）: ${formatCurrency(cf.monthlyExpenses)}`,
    `- 月次借入返済: ${formatCurrency(cf.monthlyLoanPayments)}`,
    `- バーンレート = 費用 + 返済 − 売上: **${formatCurrency(cf.burnRate)}**`,
    `- 月次ネットバーン: ${formatCurrency(cf.monthlyNetBurn)}`,
    `- 月次キャッシュ増: ${formatCurrency(cf.monthlyCashSurplus)}`,
    `- ${formatRunwayLine(cf)}`,
    "",
    "この数値はテナント月次 YAML と `computeDashboard()` の決定論結果です。LLM の推計ではありません。",
  ];

  if (cf.notes.length > 0) {
    lines.push("", "## 注記", ...cf.notes.map((n) => `- ${n}`));
  }

  return {
    handled: true,
    ok: true,
    reply: lines.join("\n"),
    metrics: {
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
    },
  };
}
