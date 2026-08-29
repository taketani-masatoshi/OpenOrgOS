/**
 * Sales deal mutations — shared by CLI and Console.
 */
import type { SalesDeal, SalesDealStage, SalesLostReason } from "../../schemas/sales.js";
import { salesPipelineFileSchema } from "../../schemas/sales.js";
import {
  loadSalesPipeline,
  saveSalesPipeline,
  loadCustomerAccounts,
  loadCustomerContacts,
} from "./data.js";
import { applyStageTransition, SalesStageError } from "./sales-stage.js";
import { appendAuditEvent } from "./audit-log.js";
import { currentDate } from "./utils.js";
import { normalizeCompanyName } from "./sales-dedupe.js";

export interface DealMutationActor {
  operator_id?: string;
}

export function nextDealId(year = currentDate().slice(0, 4)): string {
  const pipeline = loadSalesPipeline();
  const deals = pipeline?.deals ?? [];
  let max = 0;
  const prefix = `DEAL-${year}-`;
  for (const d of deals) {
    if (!d.id.startsWith(prefix)) continue;
    const seq = Number.parseInt(d.id.slice(prefix.length), 10);
    if (Number.isFinite(seq) && seq > max) max = seq;
  }
  return `${prefix}${String(max + 1).padStart(3, "0")}`;
}

export function findDeal(dealId: string): SalesDeal | undefined {
  return loadSalesPipeline()?.deals.find((d) => d.id === dealId);
}

export function resolveDealCounterparty(deal: SalesDeal): string {
  if (deal.account_id) {
    const account = loadCustomerAccounts()?.accounts.find((a) => a.id === deal.account_id);
    if (account) return account.company;
  }
  return deal.counterparty ?? deal.party?.company ?? "—";
}

export function upsertDeal(deal: SalesDeal, actor?: DealMutationActor): SalesDeal {
  const file =
    loadSalesPipeline() ?? salesPipelineFileSchema.parse({ version: 1, deals: [] });
  const idx = file.deals.findIndex((d) => d.id === deal.id);
  const parsed = salesPipelineFileSchema.shape.deals.element.parse(deal);
  if (idx >= 0) {
    file.deals[idx] = parsed;
  } else {
    file.deals.push(parsed);
  }
  saveSalesPipeline(file);
  appendAuditEvent({
    event: idx >= 0 ? "sales_stage_change" : "sales_stage_change",
    ref: deal.id,
    actor: actor?.operator_id,
    detail: idx >= 0 ? "deal_updated" : "deal_created",
  });
  return parsed;
}

export function createDeal(input: Omit<SalesDeal, "id"> & { id?: string }, actor?: DealMutationActor): SalesDeal {
  const id = input.id ?? nextDealId();
  const deal: SalesDeal = {
    ...input,
    id,
    stage_entered_on: input.stage_entered_on ?? currentDate(),
  };
  return upsertDeal(deal, actor);
}

export function setDealStage(opts: {
  dealId: string;
  toStage: SalesDealStage;
  lostReason?: SalesLostReason;
  lostNotes?: string;
  reopen?: boolean;
  actor?: DealMutationActor;
}): SalesDeal {
  const file = loadSalesPipeline();
  const deal = file?.deals.find((d) => d.id === opts.dealId);
  if (!deal) {
    throw new SalesStageError(`deal not found: ${opts.dealId}`);
  }
  const { deal: next } = applyStageTransition({
    deal,
    toStage: opts.toStage,
    lostReason: opts.lostReason,
    lostNotes: opts.lostNotes,
    reopen: opts.reopen,
    asOf: currentDate(),
  });
  const idx = file!.deals.findIndex((d) => d.id === opts.dealId);
  file!.deals[idx] = next;
  saveSalesPipeline(file!);
  appendAuditEvent({
    event: "sales_stage_change",
    ref: opts.dealId,
    actor: opts.actor?.operator_id,
    detail: `${deal.stage}→${opts.toStage}`,
  });
  return next;
}

export function setDealNextAction(opts: {
  dealId: string;
  next_action: string;
  next_action_due?: string;
  actor?: DealMutationActor;
}): SalesDeal {
  const file = loadSalesPipeline();
  const deal = file?.deals.find((d) => d.id === opts.dealId);
  if (!deal || !file) {
    throw new Error(`deal not found: ${opts.dealId}`);
  }
  const next: SalesDeal = {
    ...deal,
    next_action: opts.next_action,
    next_action_due: opts.next_action_due ?? deal.next_action_due,
  };
  const idx = file.deals.findIndex((d) => d.id === opts.dealId);
  file.deals[idx] = next;
  saveSalesPipeline(file);
  appendAuditEvent({
    event: "sales_stage_change",
    ref: opts.dealId,
    actor: opts.actor?.operator_id,
    detail: "next_action_updated",
  });
  return next;
}

export function updateDeal(
  opts: {
    dealId: string;
    patch: Partial<
      Pick<
        SalesDeal,
        | "title"
        | "amount_man"
        | "amount_band"
        | "probability_pct"
        | "tags"
        | "account_id"
        | "contact_ids"
        | "counterparty"
        | "owner"
        | "owner_name"
        | "priority"
        | "close_date_target"
      >
    >;
    actor?: DealMutationActor;
  },
): SalesDeal {
  const file = loadSalesPipeline();
  const deal = file?.deals.find((d) => d.id === opts.dealId);
  if (!deal || !file) {
    throw new Error(`deal not found: ${opts.dealId}`);
  }
  const next = salesPipelineFileSchema.shape.deals.element.parse({
    ...deal,
    ...opts.patch,
  });
  const idx = file.deals.findIndex((d) => d.id === opts.dealId);
  file.deals[idx] = next;
  saveSalesPipeline(file);
  appendAuditEvent({
    event: "sales_stage_change",
    ref: opts.dealId,
    actor: opts.actor?.operator_id,
    detail: "deal_updated",
  });
  return next;
}

export function findAccountByCompany(company: string): string | undefined {
  const accounts = loadCustomerAccounts()?.accounts ?? [];
  const norm = normalizeCompanyName(company);
  const hit = accounts.find((a) => normalizeCompanyName(a.company) === norm);
  return hit?.id;
}

export function linkThreadsToDeal(opts: {
  dealId: string;
  mail_thread_ids?: string[];
  gmail_thread_ids?: string[];
  actor?: DealMutationActor;
}): SalesDeal {
  const file = loadSalesPipeline();
  const deal = file?.deals.find((d) => d.id === opts.dealId);
  if (!deal || !file) throw new Error(`deal not found: ${opts.dealId}`);

  const mail = new Set(deal.mail_thread_ids ?? []);
  for (const id of opts.mail_thread_ids ?? []) mail.add(id);
  const gmail = new Set(deal.gmail_thread_ids ?? []);
  for (const id of opts.gmail_thread_ids ?? []) gmail.add(id);

  const next: SalesDeal = {
    ...deal,
    mail_thread_ids: mail.size ? [...mail] : undefined,
    gmail_thread_ids: gmail.size ? [...gmail] : undefined,
  };
  const idx = file.deals.findIndex((d) => d.id === opts.dealId);
  file.deals[idx] = next;
  saveSalesPipeline(file);
  appendAuditEvent({
    event: "sales_mail_link",
    ref: opts.dealId,
    actor: opts.actor?.operator_id,
    detail: "threads_linked",
  });
  return next;
}

export function listDealContacts(deal: SalesDeal) {
  const contacts = loadCustomerContacts()?.contacts ?? [];
  const ids = new Set(deal.contact_ids ?? []);
  return contacts.filter((c) => ids.has(c.id));
}
