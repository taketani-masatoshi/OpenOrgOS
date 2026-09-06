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
import { loadSalesDigestSlot, type StaticReportSlot } from "../static-report-slot.js";

export function buildSalesDigestMarkdown(opts?: { asOf?: string }): string {
  const as_of = opts?.asOf?.trim() || currentDate();
  const pipeline = buildSalesPipelineView({ includeDemo: false });
  const inbound = buildSalesInboundView({ includeDemo: false });
  const crm = buildSalesCrmDashboardView();
  let csBlock = "";
  try {
    csBlock = formatCustomerSuccessMarkdown(buildCustomerSuccessView());
  } catch {
    csBlock = "_顧客成功ビューは未利用またはモジュール未導入。_";
  }

  const lines = [
    `# 営業ダイジェスト — ${as_of}`,
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

export function writeSalesDigest(opts?: { asOf?: string }): {
  path: string;
  as_of: string;
  markdown: string;
} {
  const as_of = opts?.asOf?.trim() || currentDate();
  const markdown = buildSalesDigestMarkdown({ asOf: as_of });
  const path = writeMarkdownReport("sales", `digest-${as_of}.md`, markdown);
  return { path, as_of, markdown };
}

export function getSalesStaticReportSlot(): StaticReportSlot {
  return loadSalesDigestSlot();
}
