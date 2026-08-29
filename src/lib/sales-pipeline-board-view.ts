/**
 * L1 pipeline board for Console (no L2 contact fields).
 */
import { loadSalesPipeline } from "./data.js";
import { resolveDealCounterparty } from "./sales-deal-service.js";
import type { SalesDealStage } from "../../schemas/sales.js";

export interface PipelineDealL1 {
  id: string;
  title: string;
  stage: SalesDealStage;
  counterparty: string;
  account_id?: string;
  amount_man?: number;
  probability_pct?: number;
  next_action?: string;
  next_action_due?: string;
  lost_reason?: string;
  lead_class?: string;
  scheduling_case_id?: string;
  quote_count: number;
}

export interface CustomersPipelineView {
  deals: PipelineDealL1[];
}

export function buildCustomersPipelineView(): CustomersPipelineView {
  const pipeline = loadSalesPipeline()?.deals ?? [];
  return {
    deals: pipeline
      .filter((d) => d.demo !== true)
      .map((d) => ({
        id: d.id,
        title: d.title,
        stage: d.stage,
        counterparty: resolveDealCounterparty(d),
        account_id: d.account_id,
        amount_man: d.amount_man,
        probability_pct: d.probability_pct,
        next_action: d.next_action,
        next_action_due: d.next_action_due,
        lost_reason: d.lost_reason,
        lead_class: d.lead_class,
        scheduling_case_id: d.scheduling_case_id,
        quote_count: d.quote_ids?.length ?? 0,
      })),
  };
}
