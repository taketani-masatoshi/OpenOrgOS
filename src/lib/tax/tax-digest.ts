/**
 * Tax digest — L1 calendar + gaps + readiness markdown for Console static-first tab.
 */
import { buildTaxCalendarPortfolio, formatAmountEstimate } from "../finance/tax-calendar-portfolio.js";
import { computeTaxReadiness, formatTaxReadinessMarkdown } from "../finance/tax-readiness.js";
import {
  formatTaxFilingGapsBriefLines,
  tryLoadTaxFilingGaps,
} from "../finance/tax-filing-gaps.js";
import { currentDate, writeMarkdownReport } from "../utils.js";
import {
  loadTaxDigestSlot,
  loadTaxDigestSlots,
  type StaticReportSlot,
} from "../static-report-slot.js";
import {
  monthTokenFromAsOf,
  periodDigestFilename,
  type DigestPeriod,
} from "../period-digest-slot.js";

export function buildTaxDigestMarkdown(opts?: {
  today?: string;
  period?: DigestPeriod;
}): string {
  const today = opts?.today?.trim() || currentDate();
  const period = opts?.period ?? "weekly";
  const portfolio = buildTaxCalendarPortfolio({ today });
  const readiness = computeTaxReadiness();
  const gaps = tryLoadTaxFilingGaps();
  const label = period === "weekly" ? "税務週次" : "税務月次";

  const lines: string[] = [
    `# ${label} — ${today}`,
    "",
    `**期間:** ${period}`,
    "",
    "**境界:** L1 のみ · e-Tax / eLTAX 本番提出は行わない（ADR 0052）。",
    "",
    "## カレンダー概要",
    "",
    `- 先3ヶ月概算流出: ${formatAmountEstimate(portfolio.stats.outflow_3m_jpy)}`,
    `- open ${portfolio.stats.open} · 期限近 ${portfolio.stats.due_soon} · 超過 ${portfolio.stats.overdue}`,
    "",
    "| 期限 | 税目 | 概算 | 状態 |",
    "| --- | --- | --- | --- |",
  ];

  for (const row of portfolio.rows.filter((r) => r.deadline >= today).slice(0, 20)) {
    lines.push(
      `| ${row.deadline} | ${row.tax} | ${
        row.amount_estimate_jpy != null
          ? formatAmountEstimate(row.amount_estimate_jpy)
          : "—"
      } | ${row.status ?? "—"} |`,
    );
  }

  lines.push(
    "",
    "## 申告ギャップ",
    "",
  );
  for (const brief of formatTaxFilingGapsBriefLines(gaps, 15)) {
    lines.push(brief.startsWith("-") ? brief : `- ${brief}`);
  }

  lines.push("", formatTaxReadinessMarkdown(readiness), "");
  return lines.join("\n");
}

export function writeTaxDigest(opts?: {
  today?: string;
  period?: DigestPeriod;
}): {
  path: string;
  as_of: string;
  markdown: string;
  period: DigestPeriod;
} {
  const as_of = opts?.today?.trim() || currentDate();
  const period = opts?.period ?? "weekly";
  const markdown = buildTaxDigestMarkdown({ today: as_of, period });
  const token = period === "monthly" ? monthTokenFromAsOf(as_of) : as_of;
  const filename = periodDigestFilename(period, token);
  const path = writeMarkdownReport("tax", filename, markdown);
  return { path, as_of: token, markdown, period };
}

export function getTaxStaticReportSlot(): StaticReportSlot {
  return loadTaxDigestSlot();
}

export function getTaxStaticReportSlots(): {
  weekly: StaticReportSlot;
  monthly: StaticReportSlot;
} {
  return loadTaxDigestSlots();
}
