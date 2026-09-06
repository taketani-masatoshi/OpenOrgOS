/**
 * Sales CRM digest — L1 pipeline / inbound / CRM summary for Console static-first tab.
 */
import { formatCustomerSuccessMarkdown, buildCustomerSuccessView } from "../customer-success-view.js";
import { buildSalesCrmDashboardView } from "../sales-dashboard-view.js";
import {
  buildSalesInboundView,
  formatSalesInboundMarkdown,
} from "../sales-inbound-view.js";
import {
  buildSalesPipelineView,
  formatSalesPipelineMarkdown,
} from "../sales-pipeline-view.js";
import { currentDate, writeMarkdownReport } from "../utils.js";
import {
  loadSalesDigestSlot,
  loadSalesDigestSlots,
  type StaticReportSlot,
} from "../static-report-slot.js";
import {
  monthTokenFromAsOf,
  periodDigestFilename,
  type DigestPeriod,
} from "../period-digest-slot.js";

export function buildSalesDigestMarkdown(opts?: {
  asOf?: string;
  period?: DigestPeriod;
}): string {
  const as_of = opts?.asOf?.trim() || currentDate();
  const period = opts?.period ?? "weekly";
  const pipeline = buildSalesPipelineView({ includeDemo: false });
  const inbound = buildSalesInboundView({ includeDemo: false });
  const crm = buildSalesCrmDashboardView();
  let csBlock = "";
  try {
    csBlock = formatCustomerSuccessMarkdown(buildCustomerSuccessView());
  } catch {
    csBlock = "_顧客成功ビューは未利用またはモジュール未導入。_";
  }
  const label = period === "weekly" ? "営業週次" : "営業月次";

  const lines = [
    `# ${label} — ${as_of}`,
    "",
    `**期間:** ${period}`,
    "",
    "**境界:** L1 件数・段階・期限のみ。本文・個人連絡先は含めない。",
    "",
    "## CRM 概要",
    "",
    `- オープン案件: **${crm.open_deals}**`,
    `- 加重パイプライン: **${crm.weighted_pipeline_man}** 万円`,
    `- 未リンクメール: ${crm.unlinked_mail_count} · 曖昧リンク: ${crm.ambiguous_mail_count}`,
    `- 重複警告: ${crm.dedupe_warnings}`,
    "",
    formatSalesPipelineMarkdown(pipeline),
    "",
    formatSalesInboundMarkdown(inbound),
    "",
    "## 顧客成功（要約）",
    "",
    csBlock,
    "",
  ];
  return lines.join("\n");
}

export function writeSalesDigest(opts?: {
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
  const markdown = buildSalesDigestMarkdown({ asOf: as_of, period });
  const token = period === "monthly" ? monthTokenFromAsOf(as_of) : as_of;
  const filename = periodDigestFilename(period, token);
  const path = writeMarkdownReport("sales", filename, markdown);
  return { path, as_of: token, markdown, period };
}

export function getSalesStaticReportSlot(): StaticReportSlot {
  return loadSalesDigestSlot();
}

export function getSalesStaticReportSlots(): {
  weekly: StaticReportSlot;
  monthly: StaticReportSlot;
} {
  return loadSalesDigestSlots();
}
