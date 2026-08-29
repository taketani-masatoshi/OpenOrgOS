/**
 * Deterministic lead classification — no LLM.
 */
import type { SalesDeal, SalesLeadClass, SalesIcp } from "../../schemas/sales.js";
import { defaultProbabilityForStage } from "./sales-stage.js";
import { loadSalesIcp } from "./data.js";

export interface ClassifyResult {
  deal_id: string;
  lead_class: SalesLeadClass;
  confidence_pct: number;
  suggested_probability_pct: number;
  reasons: string[];
}

function normalizeTag(tag: string): string {
  return tag.trim().toLowerCase();
}

export function classifyDeal(deal: SalesDeal, icp?: SalesIcp | null): ClassifyResult {
  const profile = icp ?? loadSalesIcp();
  const reasons: string[] = [];
  let score = 30;

  const tags = (deal.tags ?? []).map(normalizeTag);
  const preferredTags = (profile?.preferred_tags ?? []).map(normalizeTag);
  const tagHits = tags.filter((t) => preferredTags.includes(t));
  if (tagHits.length > 0) {
    score += 25;
    reasons.push(`icp_tag:${tagHits.join(",")}`);
  }

  if (deal.inquiry_id) {
    score += 15;
    reasons.push("inbound_inquiry");
  }

  if ((deal.contact_ids?.length ?? 0) > 0 || deal.party?.contact_name) {
    score += 10;
    reasons.push("has_contact");
  }

  if (deal.stage === "negotiation" || deal.stage === "proposal") {
    score += 10;
    reasons.push(`stage:${deal.stage}`);
  }

  if (deal.stage === "lost") {
    score = Math.min(score, 10);
    reasons.push("terminal_lost");
  }

  score = Math.max(0, Math.min(100, score));

  let lead_class: SalesLeadClass = "unknown";
  if (score >= 60 && tagHits.length > 0) {
    lead_class = "icp_fit";
  } else if (score >= 35) {
    lead_class = "nurture";
  } else if (deal.stage === "lost" || score < 20) {
    lead_class = score < 15 ? "disqualify" : "nurture";
  }

  const stageProb = defaultProbabilityForStage(deal.stage);
  const suggested_probability_pct = Math.round((stageProb * score) / 100);

  return {
    deal_id: deal.id,
    lead_class,
    confidence_pct: score,
    suggested_probability_pct,
    reasons,
  };
}

export function classifyAllDeals(deals: SalesDeal[]): ClassifyResult[] {
  const icp = loadSalesIcp();
  return deals.map((d) => classifyDeal(d, icp));
}
