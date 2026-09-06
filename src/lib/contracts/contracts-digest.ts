/**
 * Contracts digest — L1 portfolio markdown for Console static-first tab.
 */
import {
  buildContractStatusView,
  formatContractStatusMarkdown,
} from "../contract-status-view.js";
import { currentDate, writeMarkdownReport } from "../utils.js";
import {
  loadContractsDigestSlot,
  loadContractsDigestSlots,
  type StaticReportSlot,
} from "../static-report-slot.js";
import {
  monthTokenFromAsOf,
  periodDigestFilename,
  type DigestPeriod,
} from "../period-digest-slot.js";

export function buildContractsDigestMarkdown(opts?: {
  days?: number;
  period?: DigestPeriod;
  asOf?: string;
}): string {
  const period = opts?.period ?? "weekly";
  const asOf = opts?.asOf?.trim() || currentDate();
  const view = buildContractStatusView({
    horizonDays: opts?.days ?? (period === "monthly" ? 120 : 90),
  });
  const body = formatContractStatusMarkdown(view);
  const label = period === "weekly" ? "契約週次" : "契約月次";
  return `# ${label} — ${asOf}\n\n**期間:** ${period}\n\n${body}`;
}

export function writeContractsDigest(opts?: {
  days?: number;
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
  const markdown = buildContractsDigestMarkdown({
    days: opts?.days,
    period,
    asOf: as_of,
  });
  const token = period === "monthly" ? monthTokenFromAsOf(as_of) : as_of;
  const filename = periodDigestFilename(period, token);
  const path = writeMarkdownReport("contracts", filename, markdown);
  return { path, as_of: token, markdown, period };
}

export function getContractsStaticReportSlot(): StaticReportSlot {
  return loadContractsDigestSlot();
}

export function getContractsStaticReportSlots(): {
  weekly: StaticReportSlot;
  monthly: StaticReportSlot;
} {
  return loadContractsDigestSlots();
}
