/**
 * Budget digest — L1 envelope / variance summary for Console static-top (wallet / admin).
 */
import {
  budgetDelegationSummary,
  loadBudgetDelegation,
  normalizeBudgetFiscalYear,
  resolveActiveBudgetFiscalYear,
} from "../org/budget-delegation.js";
import { currentDate, writeMarkdownReport } from "../utils.js";
import {
  loadBudgetDigestSlot,
  loadBudgetDigestSlots,
  type StaticReportSlot,
} from "../static-report-slot.js";
import {
  monthTokenFromAsOf,
  periodDigestFilename,
  type DigestPeriod,
} from "../period-digest-slot.js";

function yen(n: number): string {
  return `${Math.round(n).toLocaleString("ja-JP")} 円`;
}

export function buildBudgetDigestMarkdown(opts?: {
  asOf?: string;
  period?: DigestPeriod;
  fiscalYear?: string;
}): string {
  const as_of = opts?.asOf?.trim() || currentDate();
  const period = opts?.period ?? "weekly";
  const fy = normalizeBudgetFiscalYear(
    opts?.fiscalYear ?? resolveActiveBudgetFiscalYear(),
  );
  const file = loadBudgetDelegation({ fiscalYear: fy });
  const label = period === "weekly" ? "予算週次" : "予算月次";

  const lines = [
    `# ${label} — ${as_of}`,
    "",
    `**期間:** ${period}`,
    `**会計年度:** ${fy}`,
    "",
    "**境界:** L1 エンベロープ件数・合計のみ。個人明細は含めない。",
    "",
  ];

  if (!file) {
    lines.push("_予算委譲ファイルがありません。_", "");
    return lines.join("\n");
  }

  const summary = budgetDelegationSummary(file);
  const memberAllocated = summary.departments.reduce(
    (sum, d) => sum + d.member_allocated_yen,
    0,
  );
  lines.push(
    "## サマリー",
    "",
    `- 会社枠: ${yen(summary.company_budget_yen)}`,
    `- 部門割当合計: ${yen(summary.department_allocated_yen)}`,
    `- 個人割当合計: ${yen(memberAllocated)}`,
    `- 未割当（会社）: ${yen(summary.company_unallocated_yen)}`,
    `- 部門数: ${summary.departments.length}`,
    "",
  );
  return lines.join("\n");
}

export function writeBudgetDigest(opts?: {
  asOf?: string;
  period?: DigestPeriod;
  fiscalYear?: string;
}): {
  path: string;
  as_of: string;
  markdown: string;
  period: DigestPeriod;
} {
  const as_of = opts?.asOf?.trim() || currentDate();
  const period = opts?.period ?? "weekly";
  const markdown = buildBudgetDigestMarkdown({
    asOf: as_of,
    period,
    fiscalYear: opts?.fiscalYear,
  });
  const token = period === "monthly" ? monthTokenFromAsOf(as_of) : as_of;
  const filename = periodDigestFilename(period, token);
  const path = writeMarkdownReport("budget", filename, markdown);
  return { path, as_of: token, markdown, period };
}

export function getBudgetStaticReportSlot(): StaticReportSlot {
  return loadBudgetDigestSlot();
}

export function getBudgetStaticReportSlots(): {
  weekly: StaticReportSlot;
  monthly: StaticReportSlot;
} {
  return loadBudgetDigestSlots();
}
