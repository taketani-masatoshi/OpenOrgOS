/**
 * Org digest — L1 org-chart counts for Console static-top.
 */
import {
  formatReportingTree,
  loadOrgChart,
  reportingRoots,
} from "./org-chart.js";
import { listOrgChartChangeProposals } from "./org-chart-change.js";
import { currentDate, writeMarkdownReport } from "../utils.js";
import {
  loadOrgDigestSlot,
  loadOrgDigestSlots,
  type StaticReportSlot,
} from "../static-report-slot.js";
import {
  monthTokenFromAsOf,
  periodDigestFilename,
  type DigestPeriod,
} from "../period-digest-slot.js";

export function buildOrgDigestMarkdown(opts?: {
  asOf?: string;
  period?: DigestPeriod;
}): string {
  const as_of = opts?.asOf?.trim() || currentDate();
  const period = opts?.period ?? "weekly";
  const chart = loadOrgChart();
  const label = period === "weekly" ? "組織週次" : "組織月次";
  const proposals = listOrgChartChangeProposals();

  const lines = [
    `# ${label} — ${as_of}`,
    "",
    `**期間:** ${period}`,
    "",
    "**境界:** L1 ノード数・報告ツリー要約のみ。個人連絡先は含めない。",
    "",
  ];

  if (!chart) {
    lines.push("_組織図ファイルがありません。_", "");
    return lines.join("\n");
  }

  const roots = reportingRoots(chart);
  lines.push(
    "## 概要",
    "",
    `- ノード: ${chart.nodes.length}`,
    `- 報告ルート: ${roots.length}`,
    `- OCH 提案: ${proposals.length}`,
    "",
    "## 報告ツリー（抜粋）",
    "",
  );
  for (const row of formatReportingTree(chart).slice(0, 40)) {
    lines.push(row.startsWith("-") || row.startsWith(" ") ? row : `- ${row}`);
  }
  lines.push("");
  return lines.join("\n");
}

export function writeOrgDigest(opts?: {
  asOf?: string;
  period?: DigestPeriod;
}): {
  path: string;
  as_of: string;
  markdown: string;
  period: DigestPeriod;
} {
  const as_of = opts?.asOf?.trim() || currentDate();
  const period = opts?.period ?? "weekly";
  const markdown = buildOrgDigestMarkdown({ asOf: as_of, period });
  const token = period === "monthly" ? monthTokenFromAsOf(as_of) : as_of;
  const filename = periodDigestFilename(period, token);
  const path = writeMarkdownReport("org", filename, markdown);
  return { path, as_of: token, markdown, period };
}

export function getOrgStaticReportSlot(): StaticReportSlot {
  return loadOrgDigestSlot();
}

export function getOrgStaticReportSlots(): {
  weekly: StaticReportSlot;
  monthly: StaticReportSlot;
} {
  return loadOrgDigestSlots();
}
