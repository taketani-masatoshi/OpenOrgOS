/**
 * Extended sales CRM dashboard metrics (L1).
 */
import { loadSalesPipeline } from "./data.js";
import { loadSalesQuotes } from "./data.js";
import { loadMailTriageQueue } from "./correspondence/mail-triage-queue.js";
import { buildSalesPipelineView } from "./sales-pipeline-view.js";
import { collectSalesDedupeIssues } from "./sales-dedupe.js";
import { loadCustomerAccounts, loadCustomerContacts } from "./data.js";
import { countAmbiguousMailLinks } from "./sales-mail-link.js";
import type { SalesLeadClass, SalesLostReason } from "../../schemas/sales.js";
import { isOpenSalesDeal } from "../../schemas/sales.js";

export interface SalesCrmDashboardView {
  as_of: string;
  open_deals: number;
  weighted_pipeline_man: number;
  by_lead_class: Record<SalesLeadClass, number>;
  by_lost_reason: Record<SalesLostReason, number>;
  quote_by_status: Record<string, number>;
  unlinked_mail_count: number;
  ambiguous_mail_count: number;
  dedupe_warnings: number;
}

export function buildSalesCrmDashboardView(): SalesCrmDashboardView {
  const pipelineView = buildSalesPipelineView({ includeDemo: false });
  const pipeline = loadSalesPipeline()?.deals ?? [];
  const quotes = loadSalesQuotes()?.quotes ?? [];

  const by_lead_class: SalesCrmDashboardView["by_lead_class"] = {
    icp_fit: 0,
    nurture: 0,
    disqualify: 0,
    unknown: 0,
  };
  const by_lost_reason: SalesCrmDashboardView["by_lost_reason"] = {
    price: 0,
    competitor: 0,
    no_budget: 0,
    no_decision: 0,
    timing: 0,
    product_fit: 0,
    no_response: 0,
    other: 0,
  };

  for (const d of pipeline) {
    if (d.demo) continue;
    if (isOpenSalesDeal(d)) {
      const lc = d.lead_class ?? "unknown";
      by_lead_class[lc] += 1;
    }
    if (d.stage === "lost" && d.lost_reason) {
      by_lost_reason[d.lost_reason] += 1;
    }
  }

  const quote_by_status: Record<string, number> = {};
  for (const q of quotes) {
    if (q.demo) continue;
    quote_by_status[q.status] = (quote_by_status[q.status] ?? 0) + 1;
  }

  const queue = loadMailTriageQueue();
  const unlinked_mail_count = queue.entries.filter(
    (e) =>
      (e.routing === "sales_inbound" || e.routing === "secretary") &&
      e.handoff_status === "pending" &&
      (e.mail_thread_ids.length > 0 || e.gmail_thread_id),
  ).length;

  const dedupe = collectSalesDedupeIssues({
    accounts: loadCustomerAccounts()?.accounts ?? [],
    contacts: loadCustomerContacts()?.contacts ?? [],
    deals: pipeline,
  });

  return {
    as_of: pipelineView.as_of,
    open_deals: pipelineView.open_deals,
    weighted_pipeline_man: pipelineView.weighted_pipeline_man,
    by_lead_class,
    by_lost_reason,
    quote_by_status,
    unlinked_mail_count,
    ambiguous_mail_count: countAmbiguousMailLinks(),
    dedupe_warnings: dedupe.filter((d) => d.severity === "warning").length,
  };
}
