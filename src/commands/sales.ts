import { loadSalesPipeline } from "../lib/data.js";
import {
  buildSalesForecastView,
  buildSalesPipelineView,
  formatSalesForecastMarkdown,
  formatSalesPipelineMarkdown,
} from "../lib/sales-pipeline-view.js";
import {
  buildCustomerSuccessView,
  formatCustomerSuccessMarkdown,
} from "../lib/customer-success-view.js";
import { buildSalesPipelineCanvasViewModel } from "../lib/canvas-views/builders/sales-pipeline.js";
import { buildCustomerSuccessCanvasViewModel } from "../lib/canvas-views/builders/customer-success.js";
import { buildSalesInboundCanvasViewModel } from "../lib/canvas-views/builders/sales-inbound.js";
import { buildSalesOutboundCanvasViewModel } from "../lib/canvas-views/builders/sales-outbound.js";
import {
  buildSalesInboundView,
  formatSalesInboundMarkdown,
} from "../lib/sales-inbound-view.js";
import {
  buildSalesOutboundView,
  formatSalesOutboundMarkdown,
} from "../lib/sales-outbound-view.js";
import { runSalesInboundIntake } from "../lib/sales-inbound-intake.js";
import type { SalesDealStage, SalesLostReason } from "../../schemas/index.js";
import { isOpenSalesDeal } from "../../schemas/sales.js";
import { createDeal, setDealStage, setDealNextAction, updateDeal } from "../lib/sales-deal-service.js";
import { migrateSalesAccounts } from "../lib/sales-migrate-accounts.js";
import { classifyAllDeals } from "../lib/sales-classify.js";
import { saveSalesPipeline } from "../lib/data.js";
import { promoteInquiryToDeal, handoffWonDeal } from "../lib/sales-handoff.js";
import { createQuote, setQuoteStatus } from "../lib/sales-quote-service.js";
import { runSalesMailLinkFromTriage, linkMailTriageEntry } from "../lib/sales-mail-link.js";
import { openSalesDemo } from "../lib/sales-demo.js";
import {
  createSalesInquiryResponseDraft,
  createSalesOutreachDraft,
} from "../lib/sales-correspondence.js";
import { buildSalesCrmDashboardView } from "../lib/sales-dashboard-view.js";
import { setInquiryStatus } from "../lib/sales-inquiry-stage.js";
import { followUpFromSent } from "../lib/sales-follow-up.js";
import { mergeCustomerAccounts } from "../lib/sales-account-merge.js";
import { loadMailTriageQueue } from "../lib/correspondence/mail-triage-queue.js";
import type { SalesInquiryStatus } from "../../schemas/sales.js";

export function runSalesList(options?: {
  stage?: string;
  openOnly?: boolean;
  includeDemo?: boolean;
}): void {
  const pipeline = loadSalesPipeline();
  if (!pipeline) {
    console.log("パイプラインが見つかりません（data/sales/pipeline.yaml）。");
    return;
  }
  let deals = pipeline.deals;
  if (!options?.includeDemo) {
    deals = deals.filter((d) => d.demo !== true);
  }
  if (options?.openOnly) {
    deals = deals.filter(isOpenSalesDeal);
  }
  if (options?.stage) {
    deals = deals.filter((d) => d.stage === options.stage);
  }

  if (deals.length === 0) {
    console.log("商談が見つかりません。");
    return;
  }

  console.log(
    "ID".padEnd(16) +
      "Stage".padEnd(12) +
      "Counterparty".padEnd(24) +
      "Amount".padEnd(10) +
      "Prob".padEnd(6) +
      "Next due",
  );
  console.log("-".repeat(90));
  for (const d of deals) {
    const cp = (d.counterparty ?? d.party?.company ?? "—").slice(0, 22);
    console.log(
      d.id.padEnd(16) +
        d.stage.padEnd(12) +
        cp.padEnd(24) +
        String(d.amount_man ?? "—").padEnd(10) +
        String(d.probability_pct ?? "—").padEnd(6) +
        (d.next_action_due ?? "—"),
    );
  }
}

export function runSalesShow(id: string): void {
  const pipeline = loadSalesPipeline();
  const deal = pipeline?.deals.find((d) => d.id === id);
  if (!deal) {
    console.error(`商談 ${id} が見つかりません。`);
    process.exit(1);
  }
  console.log(JSON.stringify(deal, null, 2));
}

export function runSalesSummary(options?: {
  days?: number;
  staleDays?: number;
  includeDemo?: boolean;
  json?: boolean;
}): void {
  const view = buildSalesPipelineView({
    actionHorizonDays: options?.days ?? 14,
    staleDays: options?.staleDays ?? 14,
    includeDemo: options?.includeDemo ?? false,
  });
  if (options?.json) {
    console.log(JSON.stringify(view, null, 2));
    return;
  }
  console.log(formatSalesPipelineMarkdown(view));
}

export function runSalesForecast(options?: {
  month?: string;
  includeDemo?: boolean;
  json?: boolean;
}): void {
  const forecast = buildSalesForecastView({
    month: options?.month,
    includeDemo: options?.includeDemo ?? false,
  });
  if (options?.json) {
    console.log(JSON.stringify(forecast, null, 2));
    return;
  }
  console.log(formatSalesForecastMarkdown(forecast));
}

export function runSalesCustomers(options?: {
  days?: number;
  includeDemo?: boolean;
  json?: boolean;
  scores?: boolean;
  driftOnly?: boolean;
}): void {
  const view = buildCustomerSuccessView({
    horizonDays: options?.days ?? 90,
    includeDemo: options?.includeDemo ?? false,
    driftOnly: options?.driftOnly ?? false,
  });
  if (options?.json) {
    console.log(JSON.stringify(view, null, 2));
    return;
  }
  console.log(
    formatCustomerSuccessMarkdown(view, {
      showScores: options?.scores ?? false,
    }),
  );
}

export function runSalesCustomersView(options?: {
  includeDemo?: boolean;
  json?: boolean;
  horizonDays?: number;
}): void {
  const vm = buildCustomerSuccessCanvasViewModel({
    includeDemo: options?.includeDemo ?? false,
    horizonDays: options?.horizonDays,
  });
  if (options?.json) {
    console.log(JSON.stringify(vm, null, 2));
    return;
  }
  console.log(`# ${vm.title}`);
  console.log(vm.summary ?? "");
}

export function runSalesPipelineView(options?: {
  includeDemo?: boolean;
  json?: boolean;
}): void {
  const vm = buildSalesPipelineCanvasViewModel({
    includeDemo: options?.includeDemo ?? false,
  });
  if (options?.json) {
    console.log(JSON.stringify(vm, null, 2));
    return;
  }
  console.log(`# ${vm.title}`);
  console.log(vm.summary ?? "");
}

export function runSalesInbound(options?: {
  days?: number;
  staleDays?: number;
  includeDemo?: boolean;
  json?: boolean;
}): void {
  const view = buildSalesInboundView({
    actionHorizonDays: options?.days ?? 7,
    staleDays: options?.staleDays ?? 3,
    includeDemo: options?.includeDemo ?? false,
  });
  if (options?.json) {
    console.log(JSON.stringify(view, null, 2));
    return;
  }
  console.log(formatSalesInboundMarkdown(view));
}

export function runSalesInboundView(options?: {
  includeDemo?: boolean;
  json?: boolean;
}): void {
  const vm = buildSalesInboundCanvasViewModel({
    includeDemo: options?.includeDemo ?? false,
  });
  if (options?.json) {
    console.log(JSON.stringify(vm, null, 2));
    return;
  }
  console.log(`# ${vm.title}`);
  console.log(vm.summary ?? "");
}

export function runSalesOutbound(options?: {
  days?: number;
  includeDemo?: boolean;
  json?: boolean;
}): void {
  const view = buildSalesOutboundView({
    actionHorizonDays: options?.days ?? 7,
    includeDemo: options?.includeDemo ?? false,
  });
  if (options?.json) {
    console.log(JSON.stringify(view, null, 2));
    return;
  }
  console.log(formatSalesOutboundMarkdown(view));
}

export function runSalesOutboundView(options?: {
  includeDemo?: boolean;
  json?: boolean;
}): void {
  const vm = buildSalesOutboundCanvasViewModel({
    includeDemo: options?.includeDemo ?? false,
  });
  if (options?.json) {
    console.log(JSON.stringify(vm, null, 2));
    return;
  }
  console.log(`# ${vm.title}`);
  console.log(vm.summary ?? "");
}

export { runSalesInboundIntake };

export function runSalesMigrateAccounts(opts?: { dryRun?: boolean; json?: boolean }): void {
  const result = migrateSalesAccounts({ dryRun: opts?.dryRun });
  if (opts?.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(
    `migrate-accounts: accounts=${result.accounts_created} contacts=${result.contacts_created} deals=${result.deals_updated}${result.dry_run ? " (dry-run)" : ""}`,
  );
}

export function runSalesDealSetStage(opts: {
  dealId: string;
  stage: SalesDealStage;
  lostReason?: SalesLostReason;
  lostNotes?: string;
  reopen?: boolean;
  actor?: string;
}): void {
  const deal = setDealStage({
    dealId: opts.dealId,
    toStage: opts.stage,
    lostReason: opts.lostReason,
    lostNotes: opts.lostNotes,
    reopen: opts.reopen,
    actor: { operator_id: opts.actor },
  });
  console.log(JSON.stringify(deal, null, 2));
}

export function runSalesDealSetNextAction(opts: {
  dealId: string;
  nextAction: string;
  due?: string;
  actor?: string;
}): void {
  const deal = setDealNextAction({
    dealId: opts.dealId,
    next_action: opts.nextAction,
    next_action_due: opts.due,
    actor: { operator_id: opts.actor },
  });
  console.log(JSON.stringify(deal, null, 2));
}

export function runSalesDealUpdate(opts: {
  dealId: string;
  title?: string;
  amount_man?: number;
  probability_pct?: number;
  accountId?: string;
  counterparty?: string;
  tags?: string[];
  actor?: string;
}): void {
  const deal = updateDeal({
    dealId: opts.dealId,
    patch: {
      title: opts.title,
      amount_man: opts.amount_man,
      probability_pct: opts.probability_pct,
      account_id: opts.accountId,
      counterparty: opts.counterparty,
      tags: opts.tags,
    },
    actor: { operator_id: opts.actor },
  });
  console.log(JSON.stringify(deal, null, 2));
}

export function runSalesInquirySetStatus(opts: {
  inquiryId: string;
  status: SalesInquiryStatus;
  actor?: string;
}): void {
  const inquiry = setInquiryStatus({
    inquiryId: opts.inquiryId,
    toStatus: opts.status,
    actor: opts.actor,
  });
  console.log(JSON.stringify(inquiry, null, 2));
}

export function runSalesFollowUpFromSent(opts: {
  dealId: string;
  confirm?: boolean;
  dryRun?: boolean;
  actor?: string;
  json?: boolean;
}): void {
  const result = followUpFromSent({
    dealId: opts.dealId,
    confirm: Boolean(opts.confirm),
    dryRun: opts.dryRun,
    actor: opts.actor,
  });
  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(
    `follow-up: ${result.deal_id} ← ${result.draft_id} · ${result.next_action} due ${result.next_action_due}`,
  );
}

export function runSalesAccountMerge(opts: {
  fromId: string;
  intoId: string;
  dryRun?: boolean;
  actor?: string;
  json?: boolean;
}): void {
  const result = mergeCustomerAccounts({
    fromId: opts.fromId,
    intoId: opts.intoId,
    dryRun: opts.dryRun,
    actor: opts.actor,
  });
  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(
    `merged ${result.from_id} → ${result.into_id} (contacts=${result.contacts_moved} deals=${result.deals_updated})${result.dry_run ? " (dry-run)" : ""}`,
  );
}

export function runSalesMailLinkResolve(opts: {
  triageId: string;
  dealId?: string;
  inquiryId?: string;
  actor?: string;
}): void {
  const entry = loadMailTriageQueue().entries.find((e) => e.id === opts.triageId);
  if (!entry) {
    console.error(`triage entry not found: ${opts.triageId}`);
    process.exit(1);
  }
  if (!opts.dealId && !opts.inquiryId) {
    console.error("require --deal or --inquiry");
    process.exit(1);
  }
  const r = linkMailTriageEntry(entry, {
    forceTarget: opts.dealId
      ? { kind: "deal", id: opts.dealId }
      : { kind: "inquiry", id: opts.inquiryId! },
    actor: opts.actor,
  });
  console.log(JSON.stringify({ linked: r.linked, target: r.target }, null, 2));
}

export function runSalesDealCreate(opts: {
  title: string;
  stage?: SalesDealStage;
  accountId?: string;
  counterparty?: string;
  owner?: string;
  owner_name?: string;
  amount_man?: number;
  actor?: string;
}): void {
  const deal = createDeal(
    {
      title: opts.title,
      stage: opts.stage ?? "lead",
      account_id: opts.accountId,
      counterparty: opts.counterparty,
      owner: opts.owner,
      owner_name: opts.owner_name,
      amount_man: opts.amount_man,
    },
    { operator_id: opts.actor },
  );
  console.log(JSON.stringify(deal, null, 2));
}

export function runSalesInquiryPromote(opts: {
  inquiryId: string;
  title?: string;
  actor?: string;
}): void {
  const result = promoteInquiryToDeal(opts);
  console.log(JSON.stringify(result, null, 2));
}

export function runSalesClassify(opts?: {
  apply?: boolean;
  applyProbability?: boolean;
  json?: boolean;
}): void {
  const pipeline = loadSalesPipeline();
  const deals = pipeline?.deals ?? [];
  const results = classifyAllDeals(deals);
  if (opts?.apply || opts?.applyProbability) {
    for (let i = 0; i < deals.length; i++) {
      const r = results[i]!;
      deals[i] = {
        ...deals[i]!,
        lead_class: r.lead_class,
        confidence_pct: r.confidence_pct,
        ...(opts.applyProbability
          ? { probability_pct: r.suggested_probability_pct }
          : {}),
      };
    }
    if (pipeline) saveSalesPipeline({ ...pipeline, deals });
  }
  if (opts?.json) {
    console.log(JSON.stringify(results, null, 2));
    return;
  }
  for (const r of results) {
    console.log(`${r.deal_id}\t${r.lead_class}\t${r.confidence_pct}%\t${r.reasons.join(";")}`);
  }
}

export function runSalesMailLink(opts?: { json?: boolean; actor?: string }): void {
  const result = runSalesMailLinkFromTriage({ actor: opts?.actor });
  if (opts?.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(`linked=${result.auto_linked.length} ambiguous=${result.ambiguous.length} skipped=${result.skipped.length}`);
}

export function runSalesHandoffWon(opts: {
  dealId: string;
  dryRun?: boolean;
  actor?: string;
  json?: boolean;
}): void {
  const result = handoffWonDeal(opts);
  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(result.work_order_hint);
}

export function runSalesQuoteCreate(opts: {
  dealId: string;
  accountId: string;
  amount_man?: number;
  doc_ref?: string;
  actor?: string;
}): void {
  const quote = createQuote(
    {
      deal_id: opts.dealId,
      account_id: opts.accountId,
      amount_man: opts.amount_man,
      doc_ref: opts.doc_ref,
    },
    opts.actor,
  );
  console.log(JSON.stringify(quote, null, 2));
}

export function runSalesQuoteSetStatus(opts: {
  quoteId: string;
  status: "draft" | "sent" | "accepted" | "rejected" | "withdrawn";
  actor?: string;
}): void {
  const quote = setQuoteStatus({
    quoteId: opts.quoteId,
    status: opts.status,
    actor: opts.actor,
  });
  console.log(JSON.stringify(quote, null, 2));
}

export function runSalesDemoOpen(opts: {
  dealId: string;
  name: string;
  email?: string;
  actor?: string;
}): void {
  const sch = openSalesDemo({
    dealId: opts.dealId,
    participantName: opts.name,
    participantEmail: opts.email,
    actor: opts.actor,
  });
  console.log(JSON.stringify({ scheduling_case_id: sch.id, deal_id: opts.dealId }, null, 2));
}

export function runSalesDraftOutreach(opts: {
  dealId: string;
  to: string;
  subject: string;
  body: string;
  actor: string;
}): void {
  const draft = createSalesOutreachDraft(opts);
  console.log(JSON.stringify({ draft_id: draft.draft_id }, null, 2));
}

export function runSalesDraftInquiryResponse(opts: {
  inquiryId: string;
  to: string;
  subject: string;
  body: string;
  actor: string;
}): void {
  const draft = createSalesInquiryResponseDraft(opts);
  console.log(JSON.stringify({ draft_id: draft.draft_id }, null, 2));
}

export function runSalesCrmDashboard(opts?: { json?: boolean }): void {
  const view = buildSalesCrmDashboardView();
  if (opts?.json) {
    console.log(JSON.stringify(view, null, 2));
    return;
  }
  console.log(`Open deals: ${view.open_deals} · Weighted: ${view.weighted_pipeline_man}万`);
  console.log(`By lead_class: ${JSON.stringify(view.by_lead_class)}`);
  console.log(`By lost_reason: ${JSON.stringify(view.by_lost_reason)}`);
  console.log(
    `Unlinked mail: ${view.unlinked_mail_count} · Ambiguous mail: ${view.ambiguous_mail_count} · Dedupe warnings: ${view.dedupe_warnings}`,
  );
}

export const SALES_DEAL_STAGES: SalesDealStage[] = [
  "lead",
  "qualify",
  "proposal",
  "negotiation",
  "won",
  "lost",
];
