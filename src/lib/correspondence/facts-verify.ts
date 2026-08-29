/**
 * Deterministic fact verification for correspondence compose / send gate.
 */
import type { MailTriageEntry } from "../../../schemas/correspondence/mail-triage.js";
import { findTriageEntry } from "./mail-triage-queue.js";
import { loadCorrespondenceCaseRef, type CorrespondenceCaseRef } from "./case-status.js";
import { resolveEmailFromContactRef, resolveSenderByEmail } from "../secretary/contact-registry.js";
import { loadSalesQuotes, loadSalesPipeline } from "../data.js";
import { searchCorrespondenceKnowledge, type KnowledgeHit } from "./knowledge-search.js";
import { handleContractStatusChatMessage } from "../steward-chat/contract-status-intent.js";
import { isModuleEnabled, loadModuleDataFile } from "../module-business-data.js";
import {
  DEFAULT_LOW_STOCK_THRESHOLD,
  retailSkusFileSchema,
  SKU_STATUS_ACTIVE,
} from "../../../steward/modules/retail_store/cli/schema.js";

export interface CorrespondenceClaim {
  id: string;
  kind: "amount" | "date" | "inventory" | "delivery" | "recipient" | "status" | "text";
  label: string;
  value: string;
  source: string;
  verified: boolean;
}

export interface FactsVerifyResult {
  mail_id?: string;
  case?: CorrespondenceCaseRef;
  claims: CorrespondenceClaim[];
  knowledge_hits: KnowledgeHit[];
  recipient_ok: boolean;
  recipient_email?: string;
  warnings: string[];
}

function extractEmail(from: string): string {
  const m = from.match(/<([^>]+)>/);
  return (m?.[1] ?? from).trim().toLowerCase();
}

function addQuoteClaims(caseRef: CorrespondenceCaseRef | undefined, claims: CorrespondenceClaim[]): void {
  if (!caseRef || caseRef.kind !== "deal") return;
  const quotes = loadSalesQuotes()?.quotes ?? [];
  for (const q of quotes) {
    if (q.deal_id !== caseRef.id) continue;
    if ((q.status === "accepted" || q.status === "sent") && q.amount_band) {
      claims.push({
        id: `quote:${q.id}:band`,
        kind: "amount",
        label: "見積帯",
        value: q.amount_band,
        source: `data/sales/quotes.yaml#${q.id}`,
        verified: q.status === "accepted",
      });
    }
    if ((q.status === "accepted" || q.status === "sent") && q.amount_man != null) {
      claims.push({
        id: `quote:${q.id}:man`,
        kind: "amount",
        label: "見積（百万円）",
        value: String(q.amount_man),
        source: `data/sales/quotes.yaml#${q.id}`,
        verified: q.status === "accepted",
      });
    }
  }
}

function addDealAmountClaims(caseRef: CorrespondenceCaseRef | undefined, claims: CorrespondenceClaim[]): void {
  if (!caseRef || caseRef.kind !== "deal") return;
  const deal = loadSalesPipeline()?.deals.find((d) => d.id === caseRef.id);
  if (!deal) return;
  if (deal.amount_band) {
    claims.push({
      id: `deal:${deal.id}:band`,
      kind: "amount",
      label: "商談金額帯",
      value: deal.amount_band,
      source: `data/sales/pipeline.yaml#${deal.id}`,
      verified: true,
    });
  }
  if (deal.amount_man != null) {
    claims.push({
      id: `deal:${deal.id}:man`,
      kind: "amount",
      label: "商談金額（百万円）",
      value: String(deal.amount_man),
      source: `data/sales/pipeline.yaml#${deal.id}`,
      verified: true,
    });
  }
}

function addContractStatusClaim(claims: CorrespondenceClaim[]): void {
  try {
    const result = handleContractStatusChatMessage("契約本数を教えて");
    if (result.handled && result.view) {
      claims.push({
        id: "contract:portfolio",
        kind: "status",
        label: "契約ポートフォリオ",
        value: `total=${result.view.total};executed=${result.view.by_status.executed}`,
        source: "data/contracts/",
        verified: true,
      });
    }
  } catch {
    /* contract SoT optional */
  }
}

const DELIVERY_ACTION_RE = /納期|出荷|delivery|リード\s*タイム|lead\s*time|着日/i;

function extractIsoDates(text: string): string[] {
  return [...text.matchAll(/\d{4}-\d{2}-\d{2}/g)].map((m) => m[0]!);
}

/**
 * Delivery / 納期 SoT:
 * 1) next_action が納期系 + next_action_due
 * 2) linked quote notes に 納期 + ISO 日付
 * Otherwise unverified (follow-up due alone is NOT delivery).
 */
export function addDeliveryClaims(
  caseRef: CorrespondenceCaseRef | undefined,
  claims: CorrespondenceClaim[],
  warnings: string[],
): void {
  if (caseRef?.next_action_due && caseRef.next_action && DELIVERY_ACTION_RE.test(caseRef.next_action)) {
    claims.push({
      id: "delivery:next_action_due",
      kind: "delivery",
      label: "納期（案件 next_action）",
      value: caseRef.next_action_due,
      source: caseRef.id,
      verified: true,
    });
    return;
  }

  if (caseRef?.kind === "deal") {
    const quotes = loadSalesQuotes()?.quotes ?? [];
    for (const q of quotes) {
      if (q.deal_id !== caseRef.id || !q.notes) continue;
      if (!DELIVERY_ACTION_RE.test(q.notes)) continue;
      const dates = extractIsoDates(q.notes);
      if (!dates.length) continue;
      claims.push({
        id: `delivery:quote:${q.id}`,
        kind: "delivery",
        label: "納期（見積メモ）",
        value: dates[0]!,
        source: `data/sales/quotes.yaml#${q.id}`,
        verified: q.status === "accepted" || q.status === "sent",
      });
      if (q.status === "accepted" || q.status === "sent") return;
    }
  }

  claims.push({
    id: "delivery:status",
    kind: "delivery",
    label: "納期",
    value: "未確認",
    source: caseRef?.id ?? "none",
    verified: false,
  });
  warnings.push("納期 SoT なし — 納期は本文に書けません");
}

/** retail_store module → inventory claims; optional query prefers matching SKUs. */
export function addInventoryClaims(
  claims: CorrespondenceClaim[],
  warnings: string[],
  query?: string,
): void {
  if (!isModuleEnabled("retail_store")) {
    claims.push({
      id: "inventory:status",
      kind: "inventory",
      label: "在庫",
      value: "未確認",
      source: "retail_store module (disabled)",
      verified: false,
    });
    warnings.push("retail_store 未導入 — 在庫は本文に書けません");
    return;
  }

  try {
    const skusFile = loadModuleDataFile("retail_store", "skus.yaml", retailSkusFileSchema);
    const active =
      skusFile?.data.skus.filter((s) => s.status === SKU_STATUS_ACTIVE && s.stock_qty !== undefined) ??
      [];
    if (!active.length) {
      claims.push({
        id: "inventory:status",
        kind: "inventory",
        label: "在庫",
        value: "未確認",
        source: "retail_store/skus.yaml",
        verified: false,
      });
      warnings.push("retail_store SKU 在庫なし — 在庫は本文に書けません");
      return;
    }

    const q = (query ?? "").toLowerCase();
    const matched = q
      ? active.filter(
          (s) =>
            s.id.toLowerCase().includes(q) ||
            s.name.toLowerCase().includes(q) ||
            q.split(/\s+/).some((t) => t.length >= 2 && (s.name.toLowerCase().includes(t) || s.id.toLowerCase().includes(t))),
        )
      : [];
    const focus = matched.length ? matched : active;

    const low = focus.filter((s) => (s.stock_qty ?? 0) <= DEFAULT_LOW_STOCK_THRESHOLD);
    const inStock = focus.filter((s) => (s.stock_qty ?? 0) > DEFAULT_LOW_STOCK_THRESHOLD);
    claims.push({
      id: "inventory:summary",
      kind: "inventory",
      label: matched.length ? "在庫（照会マッチ）" : "在庫サマリ",
      value: `active=${focus.length};in_stock=${inStock.length};low_stock=${low.length}`,
      source: "retail_store/skus.yaml",
      verified: true,
    });
    for (const sku of focus.slice(0, 12)) {
      claims.push({
        id: `inventory:sku:${sku.id}`,
        kind: "inventory",
        label: sku.name,
        value: String(sku.stock_qty),
        source: `retail_store/skus.yaml#${sku.id}`,
        verified: true,
      });
    }
  } catch (e) {
    claims.push({
      id: "inventory:status",
      kind: "inventory",
      label: "在庫",
      value: "未確認",
      source: "retail_store module",
      verified: false,
    });
    warnings.push(
      `retail_store 読取失敗 — 在庫は本文に書けません (${e instanceof Error ? e.message : "error"})`,
    );
  }
}

export function buildFactsVerify(opts: {
  mailId?: string;
  caseId?: string;
  query?: string;
}): FactsVerifyResult {
  const warnings: string[] = [];
  const claims: CorrespondenceClaim[] = [];
  let entry: MailTriageEntry | undefined;
  if (opts.mailId) {
    entry = findTriageEntry(opts.mailId);
    if (!entry) warnings.push(`mail ${opts.mailId} not in triage queue`);
  }

  let caseRef: CorrespondenceCaseRef | undefined;
  if (opts.caseId) {
    caseRef = loadCorrespondenceCaseRef(opts.caseId);
    if (!caseRef) warnings.push(`case ${opts.caseId} not found`);
  }

  if (caseRef?.next_action_due) {
    claims.push({
      id: "case:next_action_due",
      kind: "date",
      label: "次回期限",
      value: caseRef.next_action_due,
      source: caseRef.id,
      verified: true,
    });
  }

  if (caseRef?.status) {
    claims.push({
      id: "case:status",
      kind: "status",
      label: "案件ステータス",
      value: caseRef.status,
      source: caseRef.id,
      verified: true,
    });
  }

  const knowledgeQuery =
    opts.query ??
    [entry?.subject, caseRef?.company, caseRef?.subject].filter(Boolean).join(" ");

  addQuoteClaims(caseRef, claims);
  addDealAmountClaims(caseRef, claims);
  addContractStatusClaim(claims);
  addInventoryClaims(claims, warnings, knowledgeQuery);
  addDeliveryClaims(caseRef, claims, warnings);

  let recipientOk = false;
  let recipientEmail: string | undefined;
  if (entry) {
    const email = extractEmail(entry.from);
    const resolved = resolveSenderByEmail(email);
    if (resolved.known && resolved.match?.email) {
      recipientOk = true;
      recipientEmail = resolved.match.email;
      claims.push({
        id: "recipient:primary",
        kind: "recipient",
        label: "宛先",
        value: resolved.match.email,
        source: resolved.match.source,
        verified: true,
      });
    } else {
      warnings.push("宛先が external-contacts に未登録 — 推測送信不可");
      claims.push({
        id: "recipient:unknown",
        kind: "recipient",
        label: "宛先",
        value: email,
        source: "mail-triage",
        verified: false,
      });
    }
  }

  const knowledge_hits = knowledgeQuery
    ? searchCorrespondenceKnowledge(knowledgeQuery)
    : [];

  return {
    mail_id: opts.mailId,
    case: caseRef,
    claims,
    knowledge_hits,
    recipient_ok: recipientOk,
    recipient_email: recipientEmail,
    warnings,
  };
}

export function resolveRecipientForDraft(opts: {
  mailId?: string;
  contactRef?: string;
  to?: string;
}): { to?: string; contactRef?: string; warnings: string[] } {
  const warnings: string[] = [];
  if (opts.contactRef) {
    const email = resolveEmailFromContactRef(opts.contactRef);
    if (email) return { to: email, contactRef: opts.contactRef, warnings };
    warnings.push(`contact-ref ${opts.contactRef} に email がありません`);
  }
  if (opts.to) return { to: opts.to, contactRef: opts.contactRef, warnings };
  if (opts.mailId) {
    const facts = buildFactsVerify({ mailId: opts.mailId });
    if (facts.recipient_email) {
      return { to: facts.recipient_email, warnings: facts.warnings };
    }
    return { warnings: facts.warnings };
  }
  return { warnings: ["宛先未指定"] };
}
