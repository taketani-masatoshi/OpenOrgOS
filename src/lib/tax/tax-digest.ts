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
import { loadTaxDigestSlot, type StaticReportSlot } from "../static-report-slot.js";

export function buildTaxDigestMarkdown(opts?: { today?: string }): string {
  const today = opts?.today?.trim() || currentDate();
  const portfolio = buildTaxCalendarPortfolio({ today });
  const readiness = computeTaxReadiness();
  const gaps = tryLoadTaxFilingGaps();

  const lines: string[] = [
    `# 税務ダイジェスト — ${today}`,
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

export function writeTaxDigest(opts?: { today?: string }): {
  path: string;
  as_of: string;
  markdown: string;
} {
  const as_of = opts?.today?.trim() || currentDate();
  const markdown = buildTaxDigestMarkdown({ today: as_of });
  const path = writeMarkdownReport("tax", `tax-digest-${as_of}.md`, markdown);
  return { path, as_of, markdown };
}

export function getTaxStaticReportSlot(): StaticReportSlot {
  return loadTaxDigestSlot();
}
