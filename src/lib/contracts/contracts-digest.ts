/**
 * Contracts digest — L1 portfolio markdown for Console static-first tab.
 */
import {
  buildContractStatusView,
  formatContractStatusMarkdown,
} from "../contract-status-view.js";
import { currentDate, writeMarkdownReport } from "../utils.js";
import { loadContractsDigestSlot, type StaticReportSlot } from "../static-report-slot.js";

export function buildContractsDigestMarkdown(opts?: { days?: number }): string {
  const view = buildContractStatusView({
    horizonDays: opts?.days ?? 90,
  });
  return formatContractStatusMarkdown(view);
}

export function writeContractsDigest(opts?: { days?: number; asOf?: string }): {
  path: string;
  as_of: string;
  markdown: string;
} {
  const as_of = opts?.asOf?.trim() || currentDate();
  const markdown = buildContractsDigestMarkdown({ days: opts?.days });
  const path = writeMarkdownReport("contracts", `status-${as_of}.md`, markdown);
  return { path, as_of, markdown };
}

export function getContractsStaticReportSlot(): StaticReportSlot {
  return loadContractsDigestSlot();
}
